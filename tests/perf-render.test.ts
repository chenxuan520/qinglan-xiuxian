// 渲染实测的汇总逻辑与高压存档夹具测试；真实浏览器采样由每日 CI 的 perf:render 执行。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  summarizeRender,
  perfSaveFixture,
  stopRenderProcess,
  recordRenderFrame,
  renderSamplingSource,
  renderCoverageMinimum,
  renderCoverageBreaches,
  type RenderFrames,
} from '../scripts/perf-render.ts';
import { Game } from '../src/game.ts';
import { parseSave } from '../src/progress.ts';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FINAL_TRIAL_STAGE, STAGES, TRIAL_BOSS_TIMES } from '../src/data.ts';

test('summarizeRender 汇总帧率、最差间隔与长任务并容忍空输入', () => {
  const summary = summarizeRender([16.7, 16.6, 33.4, 200], [80, 120]);
  assert.equal(summary.samples, 4);
  assert.ok(Math.abs(summary.meanFps - 4000 / (16.7 + 16.6 + 33.4 + 200)) < 1e-12);
  assert.equal(summary.meanFpsMethod, 'interval-count-over-total-ms');
  assert.equal(summary.p5Fps, 5);
  assert.ok(summary.p5Fps < summary.meanFps);
  assert.equal(summary.maxGapMs, 200);
  assert.equal(summary.longTasks, 2);
  assert.equal(summary.longestTaskMs, 120);
  const empty = summarizeRender([], []);
  assert.equal(empty.samples, 0);
  assert.ok(Number.isNaN(empty.meanFps));
  assert.ok(Number.isNaN(empty.longestTaskMs));
  assert.ok(Number.isNaN(empty.p5Fps));
  assert.ok(Number.isNaN(empty.maxGapMs));
  assert.equal(empty.invalidSamples, 0);
  assert.equal(empty.invalidTasks, 0);
  const uniform = summarizeRender([16, 16, 16], []);
  assert.equal(uniform.meanFps, 62.5);
  assert.equal(uniform.p5Fps, 62.5);
  const invalid = summarizeRender([0, -1, NaN, Infinity, 16, 32], [0, -1, NaN, Infinity, 50]);
  assert.equal(invalid.samples, 2);
  assert.equal(invalid.meanFps, 2000 / 48);
  assert.equal(invalid.p5Fps, 31.25);
  assert.equal(invalid.maxGapMs, 32);
  assert.equal(invalid.longTasks, 1);
  assert.equal(invalid.longestTaskMs, 50);
  assert.equal(invalid.invalidSamples, 4);
  assert.equal(invalid.invalidTasks, 4);
  const unusable = summarizeRender([0, -1, NaN, Infinity], [NaN]);
  assert.equal(unusable.samples, 0);
  assert.ok(Number.isNaN(unusable.meanFps));
  assert.equal(unusable.invalidSamples, 4);
});

test('高压存档夹具可被游戏自己的读档与恢复流程接受', () => {
  const fixture = perfSaveFixture();
  const stored = JSON.parse(fixture);
  const save = parseSave(fixture);
  assert.equal(save.prologueSeen, true);
  assert.equal(save.autoplay, true);
  assert.equal(save.unlocked, FINAL_TRIAL_STAGE);
  assert.equal(stored.activeRun.state, 'paused');
  assert.ok(stored.activeRun.enemies.length > 0);
  assert.equal(stored.activeRun.stage, FINAL_TRIAL_STAGE);
  assert.equal(stored.activeRun.trialBossesSpawned, TRIAL_BOSS_TIMES.length);
  assert.ok(stored.activeRun.time >= TRIAL_BOSS_TIMES.at(-1)!);
  assert.ok(
    stored.activeRun.enemies.some(
      (enemy) => enemy.boss && enemy.bossStage === FINAL_TRIAL_STAGE && !enemy.dead,
    ),
  );
  const restored = Game.restore(save, stored.activeRun);
  assert.equal(restored.state, 'paused');
  restored.resume();
  restored.update(1 / 30);
  assert.equal(restored.state, 'playing');
  assert.ok(restored.enemies.length > 0);
});

test('渲染采样排除暂停、升级和结算空闲帧，不把跨状态间隔计入战斗帧率', () => {
  const data: RenderFrames = {
    gaps: [],
    activeFrames: 0,
    skippedFrames: 0,
    activeMs: 0,
    lastAt: null,
    lastPlaying: false,
    firstGameTime: null,
    lastGameTime: null,
    windows: [],
  };
  recordRenderFrame(data, 0, true, 330);
  recordRenderFrame(data, 16, true, 330);
  recordRenderFrame(data, 32, false, 330);
  recordRenderFrame(data, 5000, false, 330);
  recordRenderFrame(data, 6000, true, 331);
  recordRenderFrame(data, 6033, true, 331);
  recordRenderFrame(data, 6049, false, null);
  assert.deepEqual(data.gaps, [16, 33]);
  assert.equal(data.activeMs, 49);
  assert.equal(data.activeFrames, 4);
  assert.equal(data.skippedFrames, 3);
  assert.equal(data.firstGameTime, 330);
  assert.equal(data.lastGameTime, 331);
  assert.deepEqual(data.windows, [
    { start: 0, end: 16 },
    { start: 6000, end: 6033 },
  ]);
  assert.equal(summarizeRender(data.gaps, []).samples, 2);
  // 真正传入页面的函数也必须是可执行的独立JS，不能泄漏TS类型或模块闭包。
  const pageRecord = new Function(`return (${recordRenderFrame.toString()})`)();
  pageRecord(data, 7000, true, 332);
  pageRecord(data, 7016, true, 332);
  assert.deepEqual(data.gaps, [16, 33, 16]);
  assert.doesNotThrow(() => new Function(renderSamplingSource()));
});

test('正式渲染采样必须覆盖30秒有效推进与仙尊，短采样只容忍1秒量化', () => {
  const valid = {
    gaps: [16, 33, 50],
    activeMs: 30_000,
    firstGameTime: 338,
    lastGameTime: 368,
    finalBossNameSeen: true,
  };
  assert.equal(renderCoverageMinimum(60), 30);
  assert.deepEqual(renderCoverageBreaches(valid, 60), []);
  assert.ok(renderCoverageBreaches({ ...valid, activeMs: 29_999 }, 60).length);
  assert.ok(renderCoverageBreaches({ ...valid, lastGameTime: 339 }, 60).length);
  assert.ok(renderCoverageBreaches({ ...valid, finalBossNameSeen: false }, 60).length);
  assert.ok(renderCoverageBreaches({ ...valid, gaps: [0, NaN, Infinity] }, 60).length);
  assert.ok(renderCoverageBreaches({ ...valid, activeMs: NaN }, 60).length);
  for (const time of [null, NaN, Infinity, 337])
    assert.ok(renderCoverageBreaches({ ...valid, lastGameTime: time }, 60).length);
  const short = { ...valid, activeMs: 19_000, lastGameTime: 357 };
  assert.equal(renderCoverageMinimum(20), 19);
  assert.deepEqual(renderCoverageBreaches(short, 20), []);
  assert.ok(renderCoverageBreaches({ ...short, activeMs: 18_999 }, 20).length);
  assert.ok(renderCoverageBreaches({ ...short, lastGameTime: 356 }, 20).length);
  assert.deepEqual(renderCoverageBreaches({ ...valid, activeMs: 1000, lastGameTime: 339 }, 2), []);
  for (const seconds of [0, 1, -1, NaN, Infinity])
    assert.throws(() => renderCoverageMinimum(seconds), RangeError);
});

test('实际页面采样不能把隐藏的初始仙尊文字或非战斗页当作仙尊覆盖', () => {
  const observed = (hidden: boolean, bossName: string, playing = true) => {
    const callbacks: ((time: number) => void)[] = [];
    const target: { __perf?: { finalBossNameSeen: boolean } } = {};
    const nodes: Record<string, unknown> = {
      '.game-hud': {},
      '#modal-root': { childElementCount: 0 },
      '#time': { textContent: '05:40' },
      '#boss-bar': { hidden, textContent: bossName },
    };
    new Function(
      'document',
      'window',
      'PerformanceObserver',
      'requestAnimationFrame',
      renderSamplingSource(),
    )(
      {
        body: { classList: { contains: () => playing } },
        hidden: false,
        hasFocus: () => true,
        querySelector: (selector: string) => nodes[selector] ?? null,
      },
      target,
      class {
        observe() {}
      },
      (callback: (time: number) => void) => callbacks.push(callback),
    );
    callbacks[0](1000);
    return target.__perf?.finalBossNameSeen;
  };
  const boss = STAGES[FINAL_TRIAL_STAGE].boss;
  assert.equal(observed(true, boss), false);
  assert.equal(observed(false, boss), true);
  assert.equal(observed(false, STAGES[0].boss), false);
  assert.equal(observed(false, boss, false), false);
});

test('渲染进程退出期间写盘完成后，才清理临时目录', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'qinglan-render-exit-test-'));
  const file = join(directory, 'state');
  const child = spawn(
    process.execPath,
    [
      '-e',
      `
    const fs = require('node:fs');
    process.on('SIGTERM', () => setTimeout(() => {
      fs.writeFileSync(${JSON.stringify(file)}, 'closed');
      process.exit(0);
    }, 100));
    setInterval(() => {}, 1000);
    process.stdout.write('ready');
  `,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  try {
    await once(child.stdout!, 'data');
    await stopRenderProcess(child);
    assert.equal(child.exitCode, 0);
    assert.equal(readFileSync(file, 'utf8'), 'closed');
    rmSync(directory, { recursive: true });
    await stopRenderProcess(child);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    rmSync(directory, { recursive: true, force: true });
  }
});

test('父进程已退出但后代仍持有管道时，继续等关闭后才清理', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'qinglan-render-pipe-test-'));
  const file = join(directory, 'state');
  const delayed = `setTimeout(() => {
    require('node:fs').writeFileSync(${JSON.stringify(file)}, 'closed');
  }, 150);`;
  const child = spawn(
    process.execPath,
    [
      '-e',
      `
    require('node:child_process').spawn(process.execPath,
      ['-e', ${JSON.stringify(delayed)}], {stdio: ['ignore', 'ignore', 2]}).unref();
    process.exit(0);
  `,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  try {
    await once(child, 'exit');
    assert.equal(child.exitCode, 0);
    await stopRenderProcess(child);
    assert.equal(child.stderr!.closed, true);
    assert.equal(readFileSync(file, 'utf8'), 'closed');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
