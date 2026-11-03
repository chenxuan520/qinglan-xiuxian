import test from 'node:test';
import assert from 'node:assert/strict';
import { viewScale } from '../src/view-scale.ts';

test('手机按短边放宽视野，平板与电脑缩放不变', () => {
  // 竖屏手机：短边 390 → 约 0.63，左右可见约 310 世界像素
  assert.ok(Math.abs(viewScale(390, 844) - 390 / 620) < 1e-9);
  assert.ok(390 / viewScale(390, 844) / 2 > 300);
  // 小屏不低于 0.6，大屏手机不高于旧值 0.76
  assert.equal(viewScale(320, 568), 0.6);
  assert.equal(viewScale(480, 900), 0.76);
  // 横屏手机同样按短边
  assert.ok(Math.abs(viewScale(844, 390) - 390 / 620) < 1e-9);
  // 平板、电脑沿用原规则
  assert.equal(viewScale(1440, 900), Math.min(1.1, Math.max(0.8, 900 / 860)));
  assert.equal(viewScale(768, 1024), 1.1);
  assert.equal(viewScale(1280, 720), Math.min(1.1, Math.max(0.8, 720 / 860)));
  // 矮的电脑窗口不受影响
  assert.equal(viewScale(1280, 650), 0.8);
  assert.equal(viewScale(1440, 600), 0.8);
});
