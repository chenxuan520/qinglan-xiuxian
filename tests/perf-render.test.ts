// 渲染实测的汇总逻辑与高压存档夹具测试；真实浏览器采样由每日 CI 的 perf:render 执行。
import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeRender, perfSaveFixture, stopRenderProcess } from '../scripts/perf-render.ts';
import { Game } from '../src/game.ts';
import { parseSave } from '../src/progress.ts';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
