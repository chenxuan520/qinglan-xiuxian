import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const dir = new URL('../docs/verification/', import.meta.url);
const index = readFileSync(new URL('../docs/verification.md', import.meta.url), 'utf8');
const files = readdirSync(dir)
  .filter((name) => /^\d{4}-\d{2}\.md$/.test(name))
  .sort();

test('月度验证文件标题格式、月份归属与正序', () => {
  assert.ok(files.length > 0);
  for (const name of files) {
    const month = name.slice(0, -3);
    const text = readFileSync(new URL(name, dir), 'utf8');
    const headings = text.split('\n').filter((line) => line.startsWith('## '));
    assert.ok(headings.length > 0, `${name} 没有记录`);
    let previous = '';
    for (const heading of headings) {
      const match = heading.match(/^## (\d{4}-\d{2}-\d{2}) · \S/);
      assert.ok(match, `${name} 标题格式不合约：${heading}`);
      assert.equal(match![1].slice(0, 7), month, `${name} 标题月份不符：${heading}`);
      assert.ok(match![1] >= previous, `${name} 日期倒退：${heading}`);
      previous = match![1];
    }
  }
});

test('索引只保留规则且月份与目录一一对应', () => {
  const recordHeadings = index.split('\n').filter((line) => /^## \d{4}-\d{2}-\d{2}/.test(line));
  assert.deepEqual(recordHeadings, []);
  const listed = [...index.matchAll(/\]\(verification\/(\d{4}-\d{2})\.md\)/g)].map((m) => m[1]);
  assert.deepEqual(
    [...listed].sort(),
    files.map((name) => name.slice(0, -3)),
  );
});
