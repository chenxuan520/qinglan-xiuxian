import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, Script } from 'node:vm';

const source = readFileSync(new URL('../../src/main.ts', import.meta.url), 'utf8');

function extract(pattern: RegExp, name: string) {
  const match = source.match(pattern);
  assert.ok(match, `实际主入口必须提供 ${name}`);
  return match[0];
}

function harness() {
  const events: Record<string, unknown>[] = [];
  const saves: number[] = [];
  const flushes: number[] = [];
  const context = createContext({
    game: {
      state: 'playing',
      stage: 2,
      difficulty: 1,
      tribulation: 0,
      time: 183.6,
      level: 27,
      kills: 512,
    },
    settled: false,
    quitTracked: false,
    inMortalWorld: false,
    lifeStats: () => ({ realm: 3, stage: 9, runs: 0, age: 24, root: 'heaven', path: 'orthodox' }),
    telemetry: {
      track: (event: Record<string, unknown>) => events.push(event),
      flush: () => flushes.push(1),
    },
    persist: () => saves.push(1),
  });
  new Script(
    stripTypeScriptTypes(extract(/^function trackRunEnd\([^]*?^\}/m, 'trackRunEnd')),
  ).runInContext(context);
  const handler = source.match(/window\.addEventListener\('pagehide', \(\) => \{\n([^]*?)\n\}\);/);
  assert.ok(handler, '实际主入口必须提供 pagehide');
  new Script(`function pagehide() {${handler![1]}\n}`).runInContext(context);
  return {
    context,
    events,
    saves,
    flushes,
    pagehide: () => new Script('pagehide()').runInContext(context),
  };
}

test('进行中的历练离开页面时只发一条 quit，字段完整且同页不重复', () => {
  const { context, events, saves, flushes, pagehide } = harness();
  pagehide();
  assert.equal(events.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(events[0])), {
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
  assert.equal(saves.length, 1, '先补发 quit 再持久化续局');
  assert.equal(flushes.length, 1, '发出 quit 后立即 flush');
  assert.equal(context.quitTracked, true);
  pagehide();
  assert.equal(events.length, 1);
});

test('暂停视为进行中并可带天劫轮次；其他状态与已结算不发', () => {
  const paused = harness();
  Object.assign(paused.context.game, { state: 'paused', tribulation: 3 });
  paused.pagehide();
  assert.equal(paused.events.length, 1);
  assert.equal(paused.events[0].tribulation, 3);

  for (const state of ['upgrade', 'won', 'lost']) {
    const run = harness();
    run.context.game.state = state;
    run.pagehide();
    assert.equal(run.events.length, 0, state);
  }

  const settled = harness();
  settled.context.settled = true;
  settled.pagehide();
  assert.equal(settled.events.length, 0);

  const idle = harness();
  idle.context.game = null;
  idle.pagehide();
  assert.equal(idle.events.length, 0);
});

test('新局或读档续局重置后可以再记一次 quit', () => {
  const { context, events, pagehide } = harness();
  pagehide();
  pagehide();
  assert.equal(events.length, 1);
  context.quitTracked = false;
  context.game = { ...context.game, stage: 4 };
  pagehide();
  assert.equal(events.length, 2);
  assert.equal(events[1].stage, 4);
});

test('game 赋值入口重置 quit 状态', () => {
  assert.match(
    source,
    /set game\(next\) \{\n\s+game = next;\n\s+quitTracked = false;\n/,
    'scene-flow 与读档续局都经此 setter，必须重置',
  );
});
