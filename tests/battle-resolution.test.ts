import test from 'node:test';
import assert from 'node:assert/strict';
import { BattleResolution } from '../src/battle-resolution.ts';

function clock() {
  const policy = new BattleResolution();
  let now = 0;
  let ratio = policy.sample(now, true, true, 2);
  return {
    get ratio() {
      return ratio;
    },
    tick(gap: number, count: number, playing = true, mobile = true, dpr = 2) {
      for (let i = 0; i < count; i++) ratio = policy.sample((now += gap), playing, mobile, dpr);
      return ratio;
    },
  };
}

test('持续低帧率逐档降低手机画布像素密度，最低一倍且不超过设备精度', () => {
  const c = clock();
  assert.equal(c.ratio, 2);
  assert.equal(c.tick(100, 15), 2, '短时间慢帧不立即调画面');
  assert.equal(c.tick(100, 1), 1.75);
  assert.equal(c.tick(100, 48), 1);
  assert.equal(c.tick(100, 160), 1);
  assert.equal(c.tick(100, 32, true, true, 0.8), 0.8);
});

test('桌面、首页与流畅手机保留原最高精度，偶发慢帧不会降档', () => {
  const c = clock();
  assert.equal(c.tick(100, 100, true, false), 2);
  assert.equal(c.tick(16, 1000), 2);
  c.tick(300, 1);
  c.tick(16, 100);
  assert.equal(c.ratio, 2);
  assert.equal(c.tick(16, 100, true, true, 3), 2);
});

test('恢复稳定高帧率后慢慢提升，普通帧率保持档位以免来回震荡', () => {
  const c = clock();
  c.tick(100, 64);
  assert.equal(c.ratio, 1);
  assert.equal(c.tick(16, 100), 1);
  assert.equal(c.tick(16, 300), 1.25);
  assert.equal(c.tick(25, 300), 1.25);
  assert.equal(c.tick(16, 1700), 2);
});

test('暂停、后台长间隔与时钟跳变不当作卡顿；返回首页恢复清晰度', () => {
  const c = clock();
  c.tick(100, 15);
  c.tick(5000, 1, false);
  c.tick(100, 2);
  assert.equal(c.ratio, 2);
  c.tick(5000, 1);
  c.tick(100, 2);
  assert.equal(c.ratio, 2);
  c.tick(-10, 1);
  c.tick(100, 2);
  assert.equal(c.ratio, 2);
  c.tick(100, 100);
  assert.equal(c.ratio, 1);
  assert.equal(c.tick(16, 1, false, true), 1, '暂停保留战斗精度');
  assert.equal(c.tick(16, 1, false, false), 2, '首页恢复设备精度');
});
