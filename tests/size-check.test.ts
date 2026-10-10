// 产物体积门禁的预算判定与入口解析测试；完整构建由 CI 的 size:check 执行。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  budgetBreaches,
  measureEntry,
  SIZE_BUDGET,
  type SizeMeasure,
} from '../scripts/size-check.ts';

test('体积超预算时逐项报告，未超则通过', () => {
  const within: SizeMeasure = {
    jsBytes: SIZE_BUDGET.jsBytes,
    jsGzip: SIZE_BUDGET.jsGzip,
    cssBytes: SIZE_BUDGET.cssBytes,
    cssGzip: SIZE_BUDGET.cssGzip,
  };
  assert.deepEqual(budgetBreaches(within), []);
  const over = { ...within, jsBytes: SIZE_BUDGET.jsBytes + 1, cssGzip: SIZE_BUDGET.cssGzip + 1 };
  const breaches = budgetBreaches(over);
  assert.equal(breaches.length, 2);
  assert.ok(breaches[0].startsWith('jsBytes') && breaches[1].startsWith('cssGzip'));
});

test('measureEntry 从 index.html 引用解析入口 JS/CSS 并给出 gzip 尺寸', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qinglan-size-'));
  mkdirSync(join(dir, 'assets'), { recursive: true });
  const js = `console.log('${'x'.repeat(200)}');`;
  const css = `.a{color:red}${' '.repeat(100)}`;
  writeFileSync(join(dir, 'assets', 'index-abc123.js'), js);
  writeFileSync(join(dir, 'assets', 'index-def456.css'), css);
  writeFileSync(
    join(dir, 'index.html'),
    '<html><head><link rel="stylesheet" href="/qinglan-xiuxian/assets/index-def456.css"></head><body><script type="module" src="/qinglan-xiuxian/assets/index-abc123.js"></script></body></html>',
  );
  const measure = measureEntry(dir);
  assert.equal(measure.jsBytes, Buffer.byteLength(js));
  assert.equal(measure.cssBytes, Buffer.byteLength(css));
  assert.ok(measure.jsGzip > 0 && measure.jsGzip < measure.jsBytes);
  assert.ok(measure.cssGzip > 0 && measure.cssGzip < measure.cssBytes);
});
