import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseNovel } from '../src/novel-content.ts';

const manuscript = readFileSync(new URL('../docs/novel.md', import.meta.url), 'utf8');
const opening = '# 测试书名\n\n## 第一卷 起程\n\n### 第1章 渡口\n\n';

test('已审小说六卷四十二章完整进入阅读数据，正文无改写、遗漏或重复', () => {
  const novel = parseNovel(manuscript);
  assert.equal(novel.title, '青岚纪 · 不系舟');
  assert.deepEqual(
    novel.volumes.map((volume) => volume.title),
    ['借一段路', '炉灰与归人', '霜下春泥', '弃货之日', '天上有路', '不系舟'],
  );
  assert.deepEqual(
    novel.chapters.map((chapter) => chapter.id),
    Array.from({ length: 42 }, (_, index) => `chapter-${index + 1}`),
  );
  for (const [index, volume] of novel.volumes.entries()) {
    assert.equal(volume.number, index + 1);
    assert.equal(volume.chapters.length, 7);
    for (const chapter of volume.chapters) {
      assert.equal(chapter.volumeNumber, volume.number);
      assert.equal(chapter.volumeTitle, volume.title);
      assert.equal(chapter, novel.chapters[chapter.number - 1]);
    }
  }
  const paragraphs = novel.chapters.flatMap((chapter) => chapter.paragraphs);
  assert.equal(paragraphs.length, 2849);
  assert.equal(paragraphs[0], '陆迟十五岁那年，青岚的春水涨得很早。');
  assert.equal(
    paragraphs.at(-1),
    '街口有炉子刚揭开盖，热气呼地升起来。他从中穿过去，身影一时看不清了。',
  );
  // 绑定用户已认可的终稿正文（不含目录、卷章标题和作者说明），防止接入时静默漏段。
  assert.equal(
    createHash('sha256').update(paragraphs.join('\n\n')).digest('hex'),
    '69566e314d7bafdc1c68734dab3c1c52e07ce6f098ee71fcb16042192cdd7f74',
  );
});

test('换行格式与末尾有无空行不改变正文，跨行段落不被拆断', () => {
  const source = opening + '第一行\n第二行\n\n最后一段';
  const expected = ['第一行\n第二行', '最后一段'];
  assert.deepEqual(parseNovel(source).chapters[0].paragraphs, expected);
  assert.deepEqual(
    parseNovel('\uFEFF' + source.replaceAll('\n', '\r\n') + '\r\n').chapters[0].paragraphs,
    expected,
  );
});

test('正文中的标签与Markdown符号保持纯文本，内部横线不截断后文', () => {
  const dangerous = '<img src=x onerror="alert(1)">';
  const source = opening + dangerous + '\n\n---\n\n[正文中的链接](https://example.com)';
  assert.deepEqual(parseNovel(source).chapters[0].paragraphs, [
    dangerous,
    '---',
    '[正文中的链接](https://example.com)',
  ]);
});

test('只跳过卷前目录、对应锚点和明确的末尾出处，最后一章仍完整保留', () => {
  const source =
    '# 测试书名\n\n作者说明\n\n- [第一卷 起程](#volume-1)\n\n<a id="volume-1"></a>\n\n' +
    '## 第一卷 起程\n\n### 第1章 渡口\n\n正文\n\n尾段\n\n---\n\n' +
    '[创作说明与设定索引](novel-notes.md) · [世界观设定稿](worldbuilding.md)\n';
  assert.deepEqual(parseNovel(source).chapters[0].paragraphs, ['正文', '尾段']);
});

test('缺卷、重复或跳过章号明确拒绝，不悄悄覆盖既有章节', () => {
  assert.throws(() => parseNovel('# 测试\n\n### 第1章 无卷\n\n正文'), /缺少卷标题/);
  assert.throws(() => parseNovel(opening + '正文\n\n### 第1章 重复\n\n其他'), /章号重复/);
  assert.throws(() => parseNovel(opening + '正文\n\n### 第3章 跳章\n\n其他'), /章号重复/);
  assert.throws(
    () => parseNovel(opening + '正文\n\n## 第三卷 跳卷\n\n### 第2章 次章\n\n其他'),
    /卷号重复/,
  );
});

test('空章、空卷、缺书名与未知标题不会生成貌似完整的阅读数据', () => {
  assert.throws(() => parseNovel(opening), /没有正文/);
  assert.throws(() => parseNovel(opening + '正文\n\n## 第二卷 空卷'), /没有章节/);
  assert.throws(() => parseNovel('## 第一卷 起程\n\n### 第1章 渡口\n\n正文'), /缺少书名/);
  assert.throws(() => parseNovel('# 只有书名'), /缺少卷章正文/);
  assert.throws(() => parseNovel(opening + '正文\n\n### 漏掉章号'), /不支持的标题/);
});
