// 渲染实测的汇总逻辑与高压存档夹具测试；真实浏览器采样由每日 CI 的 perf:render 执行。
import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeRender, perfSaveFixture } from '../scripts/perf-render.ts';
import { Game } from '../src/game.ts';
import { parseSave } from '../src/progress.ts';

test('summarizeRender 汇总帧率、最差间隔与长任务并容忍空输入', () => {
  const summary = summarizeRender([16.7, 16.6, 33.4, 200], [80, 120]);
  assert.equal(summary.samples, 4);
  assert.ok(Math.abs(summary.meanFps - 45) < 10);
  assert.ok(summary.p5Fps < summary.meanFps);
  assert.equal(summary.maxGapMs, 200);
  assert.equal(summary.longTasks, 2);
  assert.equal(summary.longestTaskMs, 120);
  const empty = summarizeRender([], []);
  assert.equal(empty.samples, 0);
  assert.ok(Number.isNaN(empty.meanFps));
  assert.ok(Number.isNaN(empty.longestTaskMs));
});

test('高压存档夹具可被游戏自己的读档与恢复流程接受', () => {
  const fixture = perfSaveFixture();
  const stored = JSON.parse(fixture);
  const save = parseSave(fixture);
  assert.equal(save.prologueSeen, true);
  assert.equal(save.autoplay, true);
  assert.equal(save.unlocked, 5);
  assert.equal(stored.activeRun.state, 'paused');
  assert.ok(stored.activeRun.enemies.length > 0);
  const restored = Game.restore(save, stored.activeRun);
  assert.equal(restored.state, 'paused');
  restored.resume();
  restored.update(1 / 30);
  assert.equal(restored.state, 'playing');
  assert.ok(restored.enemies.length > 0);
});
