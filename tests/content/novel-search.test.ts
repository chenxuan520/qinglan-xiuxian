import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseNovel, type Novel, type NovelChapter } from '../../src/content/novel-content.ts';
import { searchNovel } from '../../src/content/novel-search.ts';

function chapter(number: number, title: string, paragraphs: string[]): NovelChapter {
  return {
    id: `chapter-${number}`,
    number,
    title,
    label: `第${number}章 ${title}`,
    volumeNumber: 1,
    volumeTitle: '第一卷 起程',
    paragraphs,
  };
}
function fixture(): Novel {
  const chapters = [
    chapter(1, '渡口', ['青岚春水涨得早。', 'Lu Chi waits.', '---', '远处有钟声。']),
    chapter(2, '归舟', ['钟声落进水里。']),
  ];
  return {
    title: '测试书',
    volumes: [{ id: 'volume-1', number: 1, title: '起程', label: '第一卷 起程', chapters }],
    chapters,
  };
}

test('全文搜索覆盖标题与正文，跳过分隔线并按章节顺序返回', () => {
  const novel = fixture();
  assert.deepEqual(searchNovel(novel, ''), []);
  assert.deepEqual(searchNovel(novel, '   '), []);

  const title = searchNovel(novel, '归舟');
  assert.equal(title.length, 1);
  assert.deepEqual(
    [title[0].chapterIndex, title[0].paragraphIndex, title[0].match],
    [1, -1, '归舟'],
  );

  const hits = searchNovel(novel, '钟声');
  assert.deepEqual(
    hits.map((hit) => [hit.chapterIndex, hit.paragraphIndex, hit.match]),
    [
      [0, 3, '钟声'],
      [1, 0, '钟声'],
    ],
  );
  assert.deepEqual(searchNovel(novel, '---'), []);

  const latin = searchNovel(novel, 'lu chi');
  assert.equal(latin.length, 1);
  assert.equal(latin[0].match, 'Lu Chi');
});

test('命中片段保留上下文并标注省略，限制结果数量', () => {
  const long = `${'a'.repeat(40)}关键线索${'b'.repeat(40)}`;
  const novel: Novel = {
    title: '测试书',
    volumes: [],
    chapters: [
      {
        id: 'chapter-1',
        number: 1,
        title: '长段',
        label: '第1章 长段',
        volumeNumber: 1,
        volumeTitle: '第一卷',
        paragraphs: [long],
      },
    ],
  };
  const [hit] = searchNovel(novel, '关键线索');
  assert.equal(hit.match, '关键线索');
  assert.ok(hit.before.startsWith('…'));
  assert.ok(hit.after.endsWith('…'));
  assert.equal(searchNovel(novel, '关键线索', 1).length, 1);
  assert.equal(searchNovel(novel, 'a', 1).length, 1);
});

test('小写化改变长度时回退原字面匹配，片段不越界错位', () => {
  const novel: Novel = {
    title: '测试书',
    volumes: [],
    chapters: [
      {
        id: 'chapter-1',
        number: 1,
        title: 'İstanbul 渡口',
        label: '第1章 İstanbul 渡口',
        volumeNumber: 1,
        volumeTitle: '第一卷',
        paragraphs: ['İİİ 目标末尾'],
      },
    ],
  };
  const [hit] = searchNovel(novel, '目标');
  assert.equal(hit.match, '目标');
  assert.equal(hit.before, 'İİİ ');
  assert.equal(hit.after, '末尾');
  const [letter] = searchNovel(novel, 'İ');
  assert.equal(letter.match, 'İ');
  assert.equal(letter.before, '');
});

test('真实手稿可检索出正文命中，结果按章节顺序', () => {
  const novel = parseNovel(readFileSync(new URL('../../docs/novel.md', import.meta.url), 'utf8'));
  const hits = searchNovel(novel, '陆迟');
  assert.ok(hits.length > 50);
  assert.ok(hits.every((hit) => hit.match === '陆迟'));
  for (let i = 1; i < hits.length; i++) {
    assert.ok(
      hits[i].chapterIndex > hits[i - 1].chapterIndex ||
        (hits[i].chapterIndex === hits[i - 1].chapterIndex &&
          hits[i].paragraphIndex >= hits[i - 1].paragraphIndex),
    );
  }
  assert.deepEqual(searchNovel(novel, '这段文字一定不在书里'), []);
});
