import test from 'node:test';
import assert from 'node:assert/strict';
import type { ActionShell } from '../src/action-controller.ts';
import { freshSave, lifespanInfo, readSave, tribulationDue } from '../src/progress.ts';
import { beginSectMarketVisit, sectMarketOpen } from '../src/sect-market.ts';
import { validSectMarket } from '../src/sect-market-data.ts';
import { enterTownVisit } from '../src/town-host.ts';
import { freshTownPopulation } from '../src/town-population.ts';
import { releaseTownScene } from '../src/scene-flow.ts';
import { travelSettlement } from '../src/settlement-travel.ts';
import { SETTLEMENT_PATHS } from '../src/settlement-passage.ts';
import { lastVisitText } from '../src/home-town.ts';

function harness(source: 'town' | 'market') {
  const save = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  save.prologueSeen = save.hometownSeen = true;
  save.mortal.hometown!.stage = 'departed';
  save.cultivation = 1;
  save.age = 30;
  save.stones = 500;
  save.iron = 70;
  save.mortal.population = freshTownPopulation(save.age, () => 0.5);
  if (source === 'market') beginSectMarketVisit(save);
  let blocked = false,
    writes = 0,
    renders = 0,
    destroyed = 0;
  let stored = JSON.stringify(save);
  const logs: unknown[] = [];
  const host = { dataset: {} as Record<string, string>, focus() {} };
  const scene = {
    ready: true,
    position: { ...SETTLEMENT_PATHS[source].gate },
    destroy() {
      destroyed++;
    },
  };
  const pending = { preserved: true };
  const shell = {
    save,
    inMortalWorld: true,
    inTown: source === 'town',
    inMarket: source === 'market',
    game: null,
    panel: '',
    saveLock: null,
    pendingRun: pending,
    mortalTab: source === 'town' ? 'town' : 'sects',
    townScene: source === 'town' ? scene : null,
    marketScene: source === 'market' ? scene : null,
    townPosition: { x: 600, y: 600 },
    marketPosition: { x: 1000, y: 790 },
    structuredClone,
    lifespanInfo,
    tribulationDue,
    sectMarketOpen,
    beginSectMarketVisit,
    enterTownVisit,
    freshTownPopulation,
    performance: { now: () => 1234 },
    lastMortalTick: 0,
    writeSave(next: typeof save, run: unknown) {
      if (blocked) throw Error('storage unavailable');
      assert.equal(run, pending);
      stored = JSON.stringify(next);
      writes++;
    },
    releaseTownScene() {
      releaseTownScene(shell as unknown as ActionShell);
    },
    renderMortal() {
      renders++;
    },
    telemetry: {
      track(event: unknown) {
        logs.push(event);
      },
    },
    lifeStats: () => ({}),
    toast(message: string) {
      logs.push(message);
    },
    document: {
      getElementById() {
        return host;
      },
    },
  } as unknown as ActionShell;
  return {
    shell,
    save,
    scene,
    logs,
    block() {
      blocked = true;
    },
    state: () => ({ writes, renders, destroyed, stored: JSON.parse(stored) }),
  };
}

test('双向步行转场先落盘，再切图；不收费不跳年，保留未完历练与安全落点', () => {
  for (const source of ['town', 'market'] as const) {
    const h = harness(source),
      target = source === 'town' ? 'market' : 'town';
    const pending = h.shell.pendingRun;
    assert.equal(travelSettlement(h.shell, target), true);
    assert.equal(h.state().writes, 1);
    assert.equal(h.state().renders, 1);
    assert.equal(h.state().destroyed, 1);
    assert.equal(h.save.age, 30);
    assert.equal(h.save.stones, 500);
    assert.equal(h.save.iron, 70);
    assert.equal(h.shell.pendingRun, pending);
    assert.equal(h.shell.lastMortalTick, 1234);
    assert.deepEqual(
      target === 'town' ? h.shell.townPosition : h.shell.marketPosition,
      SETTLEMENT_PATHS[target].arrival,
    );
    const gate = SETTLEMENT_PATHS[target].gate,
      arrival = SETTLEMENT_PATHS[target].arrival;
    assert.ok(
      Math.hypot(arrival.x - gate.x, arrival.y - gate.y) > 80,
      '落点离开触发及复位区，避免反复转场',
    );
    assert.equal(
      target === 'town'
        ? h.state().stored.mortal.scenery.lastVisitAge
        : h.state().stored.mortal.sectMarket.lastVisitAge,
      30,
    );
  }
});

test('转场保存失败保留原场景、状态和上次到访年岁，不能假进入', () => {
  for (const source of ['town', 'market'] as const) {
    const h = harness(source),
      before = structuredClone(h.save);
    h.block();
    assert.equal(travelSettlement(h.shell, source === 'town' ? 'market' : 'town'), false);
    assert.deepEqual(h.save, before);
    assert.equal(h.shell.inTown, source === 'town');
    assert.equal(h.state().destroyed, 0);
    assert.equal(h.state().renders, 0);
    assert.equal(h.logs.length, 1);
  }
});

test('路口不绕过凡人、离乡、寿尽、存档锁、面板、未载入及实际距离限制', () => {
  const variants: Array<(h: ReturnType<typeof harness>) => void> = [
    (h) => {
      h.save.cultivation = 0;
    },
    (h) => {
      h.save.mortal.hometown!.stage = 'walk';
    },
    (h) => {
      h.save.age = 10000;
    },
    (h) => {
      h.shell.saveLock = 'stale';
    },
    (h) => {
      h.shell.panel = 'town-event';
    },
    (h) => {
      h.scene.ready = false;
    },
    (h) => {
      h.scene.position.y += 100;
    },
    (h) => {
      h.save.pendingReincarnation = 'lifespan';
    },
  ];
  for (const change of variants) {
    const h = harness('town');
    change(h);
    const before = structuredClone(h.save);
    assert.equal(travelSettlement(h.shell, 'market'), false);
    assert.deepEqual(h.save, before);
    assert.equal(h.state().writes, 0);
    assert.equal(h.state().destroyed, 0);
  }
});

test('最近入坊独立于一年换批；重进、刷新读回与旧档缺省均保留正确含义', () => {
  const h = harness('market');
  h.save.mortal.auction!.closed = [0];
  h.save.age = 30.6;
  assert.equal(beginSectMarketVisit(h.save), true);
  assert.equal(h.save.mortal.sectMarket!.visit, 1);
  assert.equal(h.save.mortal.sectMarket!.openedAt, 30);
  assert.equal(h.save.mortal.sectMarket!.lastVisitAge, 30.6);
  assert.deepEqual(h.save.mortal.auction!.closed, [0]);
  const loaded = readSave(JSON.stringify(h.save));
  assert.equal(loaded.status, 'ok');
  assert.equal(loaded.save.mortal.sectMarket!.lastVisitAge, 30.6);
  h.save.age = 31;
  beginSectMarketVisit(h.save);
  assert.equal(h.save.mortal.sectMarket!.visit, 2);
  assert.equal(h.save.mortal.sectMarket!.lastVisitAge, 31);
  assert.deepEqual(h.save.mortal.auction!.closed, []);
  const legacy = structuredClone(h.save);
  delete legacy.mortal.sectMarket!.lastVisitAge;
  assert.equal(readSave(JSON.stringify(legacy)).status, 'ok');
  assert.equal(lastVisitText(40, undefined, true), '曾经到访');
  assert.equal(lastVisitText(40), '尚未到访');
  assert.equal(lastVisitText(40, 28.75), '距上次进入 11.2 年');
  assert.equal(lastVisitText(40, 39.04), '距上次进入 0.9 年');
  assert.equal(validSectMarket({ ...h.save.mortal.sectMarket, lastVisitAge: 32 }, 31), false);
});
