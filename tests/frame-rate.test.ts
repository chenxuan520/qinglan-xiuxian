import test from 'node:test';
import assert from 'node:assert/strict';
import { FrameRate } from '../src/frame-rate.ts';

test('帧率按真实帧间隔采样，不假设屏幕为 60 Hz', () => {
  for (const fps of [20, 30, 60, 120]) {
    const meter = new FrameRate();
    for (let i = 0; i <= fps + 1; i++) meter.sample((i * 1000) / fps, true);
    assert.equal(meter.value, fps);
  }
});

test('暂停和后台保留上次读数，恢复后不把停留时间算进帧率', () => {
  const meter = new FrameRate();
  for (let i = 0; i <= 60; i++) meter.sample((i * 1000) / 60, true);
  meter.sample(1100, false);
  meter.sample(300_000, false);
  assert.equal(meter.value, 60);
  for (let i = 0; i <= 30; i++) meter.sample(300_000 + (i * 1000) / 30, true);
  assert.equal(meter.value, 30);
  meter.reset();
  assert.equal(meter.value, undefined);
});

test('前台卡顿计入帧率；不足一秒或无效时间不伪造读数', () => {
  const meter = new FrameRate();
  meter.sample(0, true);
  meter.sample(Number.NaN, true);
  meter.sample(500, true);
  assert.equal(meter.value, undefined);
  meter.sample(1000, true);
  assert.equal(meter.value, 2);
});
