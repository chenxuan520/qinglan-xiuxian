export interface NovelChapter {
  id: `chapter-${number}`;
  number: number;
  title: string;
  label: string;
  volumeNumber: number;
  volumeTitle: string;
  paragraphs: string[];
}

export interface NovelVolume {
  id: `volume-${number}`;
  number: number;
  title: string;
  label: string;
  chapters: NovelChapter[];
}

export interface Novel {
  title: string;
  volumes: NovelVolume[];
  chapters: NovelChapter[];
}

function volumeHeading(line: string) {
  const match = /^## (第([一二三四五六七八九十]|[1-9]\d*)卷 (.+))$/.exec(line);
  if (!match) return null;
  const number = /^[1-9]\d*$/.test(match[2])
    ? Number(match[2])
    : '一二三四五六七八九十'.indexOf(match[2]) + 1;
  return { number, title: match[3], label: match[1] };
}

function invalid(message: string): never {
  throw new Error(`小说格式错误：${message}`);
}

// 只识别本书的书名、卷章、目录和末尾出处；正文保持纯文本，由阅读器用 textContent 呈现。
export function parseNovel(markdown: string): Novel {
  const lines = markdown
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trimEnd()
    .split('\n');
  if (
    lines.at(-1)?.trim() ===
    '[创作说明与设定索引](novel-notes.md) · [世界观设定稿](worldbuilding.md)'
  ) {
    lines.pop();
    while (lines.at(-1)?.trim() === '') lines.pop();
    if (lines.at(-1)?.trim() === '---') lines.pop();
  }

  const novel: Novel = { title: '', volumes: [], chapters: [] };
  let volume: NovelVolume | undefined;
  let chapter: NovelChapter | undefined;
  let paragraph: string[] = [];
  const flushParagraph = () => {
    if (paragraph.length && chapter) chapter.paragraphs.push(paragraph.join('\n'));
    paragraph = [];
  };
  const finishChapter = () => {
    flushParagraph();
    if (chapter && !chapter.paragraphs.length) invalid(`${chapter.label}没有正文`);
  };

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    if (!line) {
      flushParagraph();
      continue;
    }
    const title = /^# (.+)$/.exec(line);
    if (title) {
      if (novel.title || volume) invalid('书名重复或位置不正确');
      novel.title = title[1];
      continue;
    }
    const anchor = /^<a id="volume-([1-9]\d*)"><\/a>$/.exec(line);
    if (anchor) {
      const next = lines.slice(index + 1).find((candidate) => candidate.trim());
      if (next && volumeHeading(next.trim())?.number === Number(anchor[1])) continue;
    }
    const heading = volumeHeading(line);
    if (heading) {
      if (!novel.title) invalid('卷标题前缺少书名');
      finishChapter();
      if (volume && !volume.chapters.length) invalid(`${volume.label}没有章节`);
      if (heading.number !== novel.volumes.length + 1) invalid('卷号重复、缺失或顺序不连续');
      volume = { ...heading, id: `volume-${heading.number}`, chapters: [] };
      novel.volumes.push(volume);
      chapter = undefined;
      continue;
    }
    const section = /^### (第([1-9]\d*)章 (.+))$/.exec(line);
    if (section) {
      if (!volume) invalid('章节前缺少卷标题');
      finishChapter();
      const number = Number(section[2]);
      if (number !== novel.chapters.length + 1) invalid('章号重复、缺失或顺序不连续');
      chapter = {
        id: `chapter-${number}`,
        number,
        title: section[3],
        label: section[1],
        volumeNumber: volume.number,
        volumeTitle: volume.title,
        paragraphs: [],
      };
      volume.chapters.push(chapter);
      novel.chapters.push(chapter);
      continue;
    }
    if (/^#{1,6}(?:\s|$)/.test(line)) invalid(`不支持的标题：${line}`);
    if (chapter) paragraph.push(line);
    else if (volume) invalid(`${volume.label}的正文前缺少章标题`);
    // 第一卷之前的目录与作者说明不属于小说正文。
  }
  finishChapter();
  if (!novel.title) invalid('缺少书名');
  if (!volume || !novel.chapters.length) invalid('缺少卷章正文');
  if (!volume.chapters.length) invalid(`${volume.label}没有章节`);
  return novel;
}
