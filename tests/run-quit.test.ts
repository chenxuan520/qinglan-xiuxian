import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRunQuitState, trackRunQuitOnLeave, type QuitGame } from '../src/run-quit.ts';
import type { TelemetryEvent } from '../src/telemetry.ts';

function game(patch: Partial<QuitGame> = {}): QuitGame {
  return {
    state: 'playing',
    stage: 2,
    difficulty: 1,
    tribulation: 0,
    time: 183.6,
    level: 27,
    kills: 512,
    ...patch,
  };
}

function harness() {
  const state = createRunQuitState();
  const events: TelemetryEvent[] = [];
  let flushes = 0;
  return {
    state,
    events,
    flushes: () => flushes,
    run: (unit: QuitGame | null, settled = false) =>
      trackRunQuitOnLeave(
        state,
        unit,
        settled,
        () => ({ realm: 3, stage: 9, runs: 0, age: 24, root: 'heaven', path: 'orthodox' }),
        (event) => events.push(event),
        () => flushes++,
      ),
  };
}

test('进行中的历练离开页面时只发一条 quit，字段完整且同页不重复', () => {
  const { run, events, flushes } = harness();
  assert.equal(run(game()), true);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    type: 'run-end',
    realm: 3,
    stage: 2,
    runs: 0,
    age: 24,
    root: 'heaven',
    path: 'orthodox',
    difficulty: 1,
    result: 'quit',
    seconds: 184,
    level: 27,
    kills: 512,
  });
  assert.equal(flushes(), 1);
  assert.equal(run(game()), false);
  assert.equal(events.length, 1);
});

test('暂停视为进行中，可带天劫轮次；其他状态与已结算不发', () => {
  const paused = harness();
  assert.equal(paused.run(game({ state: 'paused', tribulation: 3 })), true);
  assert.equal(paused.events[0].tribulation, 3);

  for (const state of ['upgrade', 'won', 'lost']) {
    const run = harness();
    assert.equal(run.run(game({ state })), false);
    assert.equal(run.events.length, 0);
  }
  const settled = harness();
  assert.equal(settled.run(game(), true), false);

  const idle = harness();
  assert.equal(idle.run(null), false);
  assert.equal(idle.events.length, 0);
});

test('新局或读档续局重置后可以再记一次 quit', () => {
  const { state, run, events } = harness();
  assert.equal(run(game()), true);
  assert.equal(run(game()), false);
  state.tracked = false;
  assert.equal(run(game({ stage: 4 })), true);
  assert.equal(events.length, 2);
  assert.equal(events[1].stage, 4);
});

test('main.ts 在 game 赋值入口重置 quit 状态，并在 pagehide 中先记 quit 再保存', () => {
  const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(
    source,
    /set game\(next\) \{\n\s+game = next;\n\s+runQuit\.tracked = false;\n\s+\},/,
    'scene-flow 与读档续局都经此 setter，必须重置',
  );
  const pagehide = source.match(/window\.addEventListener\('pagehide', \(\) => \{\n([^]*?)\n\}\);/);
  assert.ok(pagehide, 'pagehide 处理器存在');
  assert.ok(
    pagehide![1].indexOf('trackRunQuitOnLeave(') < pagehide![1].indexOf('persist()'),
    '先补发 quit 再持久化续局',
  );
});
