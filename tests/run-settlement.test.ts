import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, runInContext } from 'node:vm';
import { freshSave, settleRun, realmInfo, tribulationDue } from '../src/progress.ts';
import { Game } from '../src/game.ts';
import { STAGES, FINAL_TRIAL_STAGE } from '../src/data.ts';
import { dispatchAction } from '../src/action-controller.ts';
const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const code = stripTypeScriptTypes(
  ['finishRun', 'persist', 'simulate']
    .map((name) => {
      const match = source.match(new RegExp(`^function ${name}\\([^]*?^\\}`, 'm'));
      assert.ok(match);
      return match[0];
    })
    .join('\n'),
);

test('结算保存失败保留原奖励，禁止won坏快照与旁路交互；下一帧定时重试成功仅入账一次', () => {
  for (const outcome of ['won', 'lost'] as const) {
    const save = freshSave('heaven', ['metal'], 'orthodox', () => 0.5),
      game = new Game(save, 0, 0, () => 0.5);
    game.state = outcome;
    if (outcome === 'lost') game.player.hp = 0;
    game.loot.curios = { 'soul-wood': 1 };
    let failing = true,
      writes = 0;
    const frames: unknown[][] = [];
    const c: any = {
      game,
      save,
      settled: false,
      pendingRun: null,
      panel: 'pause',
      settlementRetryAt: 0,
      saveLock: null,
      previousState: outcome,
      adTimer: 0,
      adReadyAt: 0,
      adWatched: false,
      rewards: null,
      structuredClone,
      performance: { now: () => 1000 },
      clearInterval: () => {},
      settleRun,
      realmInfo,
      tribulationDue,
      STAGES,
      FINAL_TRIAL_STAGE,
      toast: () => {},
      modal: { querySelector: () => null },
      panelFrame: (...p: unknown[]) => frames.push(p),
      writeSave: (s: typeof save, r: unknown) => {
        writes++;
        if (failing) throw Error('quota');
        assert.equal(r, null);
        c.saved = structuredClone(s);
      },
      telemetry: { track: () => {}, flush: () => {} },
      lifeStats: () => ({}),
      abandonConfirm: false,
      selectedStage: 0,
      renderer: { prepareScene: () => Promise.resolve() },
      renderVictory: () => {},
      renderResult: () => {},
      syncHumanStories: () => {},
      storageAvailable: true,
      computeManualInput: () => ({ x: 0, y: 0 }),
      keys: new Set(),
      touchInput: { x: 0, y: 0 },
      clickDestination: null,
      nextAiMove: 0,
      aiChoiceTime: 0,
      lastHud: 100000,
      updateHud: () => {},
      clearInput: () => {},
    };
    createContext(c);
    runInContext(code, c);
    if (outcome === 'won') {
      runInContext('persist()', c);
      assert.equal(writes, 0);
    }
    runInContext('finishRun()', c);
    assert.equal(writes, 1);
    assert.equal(c.settled, false);
    assert.equal(save.runs, 0);
    assert.deepEqual(save.curios.bag, {});
    assert.equal(c.panel, 'settlement-retry');
    assert.equal(c.settlementRetryAt, 2500);
    assert.equal(frames.length, 1);
    const old = JSON.stringify(save);
    runInContext('persist()', c);
    assert.equal(writes, 1);
    for (const action of ['close', 'pause', 'abandon', 'home', 'start', 'confirm-reincarnate']) {
      dispatchAction(c, action);
      assert.equal(c.panel, 'settlement-retry');
      assert.equal(JSON.stringify(save), old);
      assert.equal(game.state, outcome);
    }
    runInContext('simulate(.01, 2400)', c);
    assert.equal(writes, 1);
    failing = false;
    runInContext('simulate(.01, 2600)', c);
    assert.equal(writes, 2);
    assert.ok(c.settled);
    assert.equal(c.settlementRetryAt, 0);
    assert.equal(c.panel, '');
    assert.equal(save.runs, 1);
    assert.equal(save.curios.bag['soul-wood'], 1);
    runInContext('finishRun()', c);
    assert.equal(writes, 2);
    assert.equal(save.curios.bag['soul-wood'], 1);
  }
});
