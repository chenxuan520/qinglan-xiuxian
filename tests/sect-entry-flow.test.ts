import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, Script } from 'node:vm';
import { freshSave, realmCost, SAVE_KEY, tribulationDue } from '../src/progress.ts';
import { Game } from '../src/game.ts';
import { TREASURES } from '../src/data.ts';
import { MEDICINES } from '../src/medicine-data.ts';
import { entryCost, resolveActivity, leaveSect } from '../src/mortal.ts';
import { executeMortalAction } from '../src/town-host.ts';
import { dispatchAction } from '../src/action-controller.ts';

// 执行实际动作路由和写档边界，浏览器存储失败不能留下半次入宗。
const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const flow = new Script(
  stripTypeScriptTypes(
    ['shellBindings', 'handleAction', 'writeSave', 'lockStaleSave']
      .map((name) => {
        const fn = source.match(new RegExp(`^function ${name}\\([^]*?^\\}`, 'm'));
        assert.ok(fn, name);
        return fn[0];
      })
      .join('\n'),
  ),
);

function harness(pending = false) {
  const save = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  save.cultivation = 1;
  save.stones = 1000;
  save.prologueSeen = save.hometownSeen = true;
  save.mortal.hometown!.stage = 'departed';
  const run = pending ? new Game(save, 0, 0, () => 0.5) : null;
  run?.pause();
  let stored = JSON.stringify({ ...save, activeRun: run?.snapshot() ?? null });
  let blocked = false,
    writes = 0,
    renders = 0;
  const messages: string[] = [];
  const context = createContext({
    // 成就队列另有真实回归，此处隔离界面通知，不跳过实际存档写入。
    chronicleSource: { observe() {} },
    hideAchievementNotice() {},
    save,
    SAVE_KEY,
    Game,
    structuredClone,
    tribulationDue,
    dispatchAction,
    executeMortalAction,
    resolveActivity,
    catalogTreasures: TREASURES,
    game: null,
    pendingRun: run,
    saveLock: null,
    lastSaveText: stored,
    inMortalWorld: true,
    inTown: false,
    inMarket: false,
    mortalTab: 'sects',
    medicinePanel: { handle: () => false },
    panel: '',
    selectedTreasure: save.starter,
    treasurePage: 0,
    clearInput() {},
    renderSaveLock() {},
    renderMortal() {
      renders++;
    },
    toast(message: string) {
      messages.push(message);
    },
    localStorage: {
      getItem: () => stored,
      setItem(_key: string, value: string) {
        if (blocked) throw Error('storage unavailable');
        writes++;
        stored = value;
      },
    },
  });
  flow.runInContext(context);
  return {
    save,
    context,
    messages,
    get stored() {
      return stored;
    },
    get writes() {
      return writes;
    },
    get renders() {
      return renders;
    },
    block(value = true) {
      blocked = value;
    },
    external() {
      stored = JSON.stringify({ ...save, stones: 99 });
    },
  };
}

test('入宗经主路由一次保存身份、入门费与凡品赠药，保留未完成历练', () => {
  for (const pending of [false, true]) {
    const h = harness(pending),
      before = JSON.parse(h.stored);
    h.context.handleAction('mortal-join', 'power');
    assert.equal(h.writes, 1);
    assert.equal(h.renders, 1);
    const after = JSON.parse(h.stored);
    assert.equal(after.stones, before.stones - entryCost(h.save));
    assert.equal(after.mortal.member.id, 'power');
    const gifts = Object.entries(h.save.medicine.bag);
    assert.equal(gifts.length, 1);
    const [id, count] = gifts[0];
    const medicine = MEDICINES.find((m) => m.id === id)!;
    assert.equal(medicine.tier, '凡品');
    assert.equal(count, 1);
    assert.deepEqual(after.medicine.bag, h.save.medicine.bag);
    assert.deepEqual(after.activeRun, before.activeRun);
    assert.deepEqual(h.save.medicine.active, {});
    assert.ok(h.messages.at(-1)!.includes(medicine.name));
    if (pending) {
      assert.ok(h.context.pendingRun);
      assert.deepEqual(h.context.pendingRun.passives, {}, '不向旧局补送本门功法');
    }
    const joined = structuredClone(h.save);
    h.context.handleAction('mortal-join', 'power');
    assert.equal(h.writes, 1);
    assert.deepEqual(h.save, joined);
    assert.equal(leaveSect(h.save), true);
    h.context.handleAction('mortal-join', 'power');
    assert.equal(h.writes, 2);
    assert.equal(h.save.stones, before.stones - entryCost(h.save) * 2);
    assert.equal(
      Object.values(h.save.medicine.bag).reduce((a, b) => a + b, 0),
      2,
    );
  }
});

test('入宗写入失败保留原状态并可重试，多窗口冲突不覆盖新存档', () => {
  const h = harness(true),
    before = structuredClone(h.save),
    stored = h.stored;
  const pending = h.context.pendingRun;
  h.block();
  h.context.handleAction('mortal-join', 'power');
  assert.deepEqual(h.save, before);
  assert.equal(h.stored, stored);
  assert.equal(h.context.pendingRun, pending);
  assert.equal(h.renders, 0);
  assert.match(h.messages.at(-1)!, /尚未保存.*赠药均未结算/);
  h.block(false);
  h.context.handleAction('mortal-join', 'power');
  assert.equal(h.writes, 1);
  assert.equal(
    Object.values(h.save.medicine.bag).reduce((a, b) => a + b, 0),
    1,
  );
  const other = harness(true),
    old = structuredClone(other.save);
  other.external();
  const external = other.stored;
  other.context.handleAction('mortal-join', 'power');
  assert.equal(other.context.saveLock, 'stale');
  assert.deepEqual(other.save, old);
  assert.equal(other.stored, external);
  assert.equal(other.renders, 0);
});

test('丹囊容量满明确提示且不扣费；缺钱、路线冲突及非人间入口不赠药', () => {
  for (const reason of ['full', 'stones', 'path', 'location'] as const) {
    const h = harness(reason === 'path');
    if (reason === 'full')
      for (const medicine of MEDICINES.filter((m) => m.tier === '凡品'))
        h.save.medicine.bag[medicine.id] = Number.MAX_SAFE_INTEGER;
    if (reason === 'stones') h.save.stones = entryCost(h.save) - 1;
    if (reason === 'location') h.context.inMortalWorld = false;
    const before = structuredClone(h.save);
    h.context.handleAction('mortal-join', reason === 'path' ? 'blood' : 'power');
    assert.deepEqual(h.save, before);
    assert.equal(h.writes, 0);
    assert.equal(h.renders, 0);
    if (reason === 'full') assert.match(h.messages.at(-1)!, /凡品数量已达上限/);
  }
});

test('入宗消息按实际精研区分首次入门与有加成的重返，不改变费用和赠药', () => {
  for (const [level, step, effective] of [
    [0, 9, false],
    [3, 9, true],
    [3, 0, false],
  ] as const) {
    const h = harness();
    h.save.mortal.mastery.power = level;
    h.save.cultivation = Array.from({ length: step }, (_, i) => realmCost(i)).reduce(
      (a, b) => a + b,
      0,
    );
    h.context.handleAction('mortal-join', 'power');
    assert.equal(h.writes, 1);
    assert.equal(h.save.stones, 1000 - entryCost(h.save));
    assert.equal(
      Object.values(h.save.medicine.bag).reduce((sum, count) => sum + count, 0),
      1,
    );
    assert.equal(JSON.parse(h.stored).mortal.events[0].includes('本门精研加成已生效'), effective);
    assert.equal(JSON.parse(h.stored).mortal.mastery.power, level);
  }
});
