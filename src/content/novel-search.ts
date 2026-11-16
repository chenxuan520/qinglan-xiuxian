import type { Novel, NovelChapter } from './novel-content.ts';

export interface NovelSearchHit {
  chapterIndex: number;
  /** 段落下标；命中标题时为 -1。 */
  paragraphIndex: number;
  chapterNumber: number;
  chapterTitle: string;
  before: string;
  match: string;
  after: string;
}

const CONTEXT = 24;
function context(text: string, index: number, length: number) {
  const start = Math.max(0, index - CONTEXT);
  const end = Math.min(text.length, index + length + CONTEXT);
  return {
    before: `${start > 0 ? '…' : ''}${text.slice(start, index).replace(/\s+/g, ' ')}`,
    match: text.slice(index, index + length),
    after: `${text.slice(index + length, end).replace(/\s+/g, ' ')}${end < text.length ? '…' : ''}`,
  };
}

function hit(
  chapterIndex: number,
  chapter: NovelChapter,
  paragraphIndex: number,
  text: string,
  index: number,
  length: number,
): NovelSearchHit {
  return {
    chapterIndex,
    paragraphIndex,
    chapterNumber: chapter.number,
    chapterTitle: chapter.title,
    ...context(text, index, length),
  };
}

/** 在当前书内按原文子串搜索；标题与正文都算，返回章节顺序的结果。 */
export function searchNovel(
  novel: Novel,
  rawQuery: string,
  limit = Number.POSITIVE_INFINITY,
): NovelSearchHit[] {
  const query = rawQuery.trim();
  if (!query) return [];
  const needle = query.toLocaleLowerCase();
  const find = (text: string) => {
    const folded = text.toLocaleLowerCase();
    // 小写化改变长度时回退到原字面匹配，避免片段和命中原文字错位。
    return folded.length === text.length ? folded.indexOf(needle) : text.indexOf(query);
  };
  const hits: NovelSearchHit[] = [];
  for (const [chapterIndex, chapter] of novel.chapters.entries()) {
    const titleIndex = find(chapter.title);
    if (titleIndex >= 0) {
      hits.push(hit(chapterIndex, chapter, -1, chapter.title, titleIndex, query.length));
      if (hits.length >= limit) return hits;
    }
    for (const [paragraphIndex, text] of chapter.paragraphs.entries()) {
      if (text === '---') continue;
      const index = find(text);
      if (index < 0) continue;
      hits.push(hit(chapterIndex, chapter, paragraphIndex, text, index, query.length));
      if (hits.length >= limit) return hits;
    }
  }
  return hits;
}
