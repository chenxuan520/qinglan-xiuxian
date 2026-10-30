import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, Script } from 'node:vm';
import { dispatchAction, type ActionShell } from '../src/action-controller.ts';
import { recordChronicle } from '../src/chronicle.ts';
import { rootElementsFor } from '../src/data.ts';
import { nightBoatPanel } from '../src/dock-ui.ts';
import { Game } from '../src/game.ts';
import { departHometown } from '../src/hometown.ts';
import { syncHumanStories } from '../src/human-stories.ts';
import { projectLeaderboardFactsV2 } from '../src/leaderboard-facts-v2.ts';
import {
  FACTS_VERSION,
  inspectSaveIntegrity,
  sealSaveSnapshot,
} from '../src/leaderboard-integrity.ts';
import { medicineInfo } from '../src/medicine-data.ts';
import { resolveActivity, startActivity } from '../src/mortal.ts';
import { TOWN_JOBS } from '../src/mortal-data.ts';
import { townEventContent } from '../src/mortal-ui.ts';
import { claimNightBoat, visitNightBoat } from '../src/night-boat.ts';
import {
  applyBirthInheritance,
  freshSave,
  lifespanInfo,
  readSave,
  realmCost,
  SAVE_SCHEMA,
  tribulationDue,
  type BirthInheritance,
  type SaveData,
} from '../src/progress.ts';
import { exportSave, importSave, readSealedSave } from '../src/save-transfer.ts';
import { executeMortalAction } from '../src/town-host.ts';
import { freshTownPopulation, townResidents } from '../src/town-population.ts';

const bottleLine = '钓线一沉，捞上来一只封好的旧药瓶。';
const normalSave = () => {
  const save = readSave(JSON.stringify(freshSave('heaven', ['metal'], 'orthodox', () => 0.5))).save;
  save.prologueSeen = save.hometownSeen = true;
  save.mortal.hometown!.stage = 'departed';
  save.mortal.population = freshTownPopulation(save.age, () => 0.5);
  Object.assign(save, sealSaveSnapshot(save));
  return save;
};
function traveller() {
  const save = normalSave();
  save.age = 2015;
  save.cultivation = Array.from({ length: 15 }, (_, step) => realmCost(step)).reduce(
    (a, b) => a + b,
    0,
  );
  return save;
}
function offer(save: SaveData, roll: number) {
  const draws = [0, roll, 0];
  visitNightBoat(save, 15, () => draws.shift()!);
  assert.ok(save.mortal.nightBoat);
  return structuredClone(save.mortal.nightBoat);
}

// 只替换DOM和存储故障；真实分发器、事务、活动结算、夜船规则与面板保持原调用。
function harness(save = normalSave(), panel = 'town-event') {
  const effects: string[] = [];
  const messages: string[] = [];
  const candidates: SaveData[] = [];
  let fail = false;
  let stored = JSON.stringify(sealSaveSnapshot(save));
  const fisher = townResidents(save.mortal.population!, save.age).find(
    (npc) => npc.id === 'fisher',
  )!;
  const shell = {
    save,
    game: null,
    settled: false,
    pendingRun: null,
    inMortalWorld: true,
    inTown: true,
    panel,
    saveLock: null,
    structuredClone,
    Game,
    executeMortalAction,
    resolveActivity,
    syncHumanStories,
    tribulationDue,
    lifespanInfo,
    medicinePanel: { handle: () => false },
    townNpc: fisher,
    townScene: { nearbyNpc: fisher },
    townSource: { current: { claimNightBoat, nightBoatPanel } },
    modal: {
      innerHTML: panel === 'night-boat' ? nightBoatPanel(save)[2] : townEventContent(save, fisher),
    },
    closeNpcChat() {
      effects.push('close-chat');
    },
    renderMortal() {
      effects.push('render');
    },
    toast(message: string) {
      messages.push(message);
    },
    panelFrame(_title: string, _subtitle: string, body: string) {
      effects.push('panel');
      shell.modal.innerHTML = body;
    },
    writeSave(next: SaveData) {
      candidates.push(structuredClone(next));
      if (fail) throw new DOMException('quota fixture', 'QuotaExceededError');
      Object.assign(next, sealSaveSnapshot(next));
      stored = JSON.stringify(next);
      effects.push('write');
    },
  } as unknown as ActionShell;
  return {
    shell,
    effects,
    messages,
    candidates,
    stored: () => stored,
    reject: () => {
      fail = true;
    },
    allow: () => {
      fail = false;
    },
    openFishing() {
      shell.panel = 'town-event';
      shell.modal.innerHTML = townEventContent(save, fisher);
    },
  };
}

test('渔夫真实面板按钮映射fishing，打工参数是一年、12灵石、不赠玄铁', () => {
  const { shell } = harness();
  assert.match(shell.modal.innerHTML, /data-action="mortal-activity" data-id="fishing"/);
  assert.doesNotMatch(shell.modal.innerHTML, /data-id="fisher"/);
  assert.equal(TOWN_JOBS.fishing.name, '码头垂钓');
  assert.equal(TOWN_JOBS.fishing.years, 1);
  assert.equal(TOWN_JOBS.fishing.stones, 12);
  assert.equal(TOWN_JOBS.fishing.iron, 0);
  const save = normalSave();
  assert.equal(
    startActivity(save, 'fisher', () => assert.fail('错误job不应抽奖')),
    false,
  );
  assert.equal(resolveActivity(save), false);
});

test('实际垂钓控制器结算一年和12灵石，5%灵品及额外0.5%限时珍品分别入囊', (t) => {
  for (const [roll, tier] of [
    [0.004999, '珍品'],
    [0.005, '灵品'],
    [0.054999, '灵品'],
    [0.055, null],
  ] as const) {
    const h = harness();
    const oldAge = h.shell.save.age;
    const random = t.mock.method(Math, 'random', () => roll);
    dispatchAction(h.shell, 'mortal-activity', 'fishing');
    random.mock.restore();
    assert.equal(h.shell.save.age, oldAge + 1);
    assert.equal(h.shell.save.stones, 12);
    assert.equal(h.shell.save.iron, 0);
    assert.equal(h.shell.save.mortal.activity, null);
    assert.equal(h.shell.panel, '');
    assert.equal(h.effects[0], 'write', '存档成功后才关闭和重绘');
    const ids = Object.keys(h.shell.save.medicine.bag);
    assert.equal(ids.length, tier ? 1 : 0);
    for (const id of ids) {
      assert.equal(medicineInfo(id)!.tier, tier);
      assert.ok(medicineInfo(id)!.years > 0);
      assert.equal(h.shell.save.medicine.bag[id], 1);
    }
    assert.equal(h.messages.filter((message) => message.includes(bottleLine)).length, tier ? 1 : 0);
    assert.deepEqual(readSealedSave(h.stored()).save, h.shell.save);
  }
});

test('首次钓药的结果句只在首次出现，保存读回后再次钓到也不重播', (t) => {
  const h = harness();
  const random = t.mock.method(Math, 'random', () => 0.01);
  dispatchAction(h.shell, 'mortal-activity', 'fishing');
  assert.equal(h.shell.save.chronicle.milestones['fishing-medicine'], 16);
  assert.equal(h.messages.filter((message) => message.includes(bottleLine)).length, 1);
  h.openFishing();
  dispatchAction(h.shell, 'mortal-activity', 'fishing');
  random.mock.restore();
  assert.equal(h.shell.save.age, 17);
  assert.equal(h.shell.save.stones, 24);
  assert.equal(h.messages.filter((message) => message.includes(bottleLine)).length, 1);
  assert.equal(h.shell.save.chronicle.entries.filter((e) => e.title === '码头垂钓').length, 1);
  const again = harness(readSealedSave(h.stored()).save);
  const nextRandom = t.mock.method(Math, 'random', () => 0.01);
  dispatchAction(again.shell, 'mortal-activity', 'fishing');
  nextRandom.mock.restore();
  assert.equal(
    again.messages.some((message) => message.includes(bottleLine)),
    false,
  );
  assert.equal(again.shell.save.age, 18);
  assert.equal(again.shell.save.stones, 36);
});

test('垂钓拒写不推进、不发奖励或首次标记，重试沿用既有重抽语义且仅成功候选入账', (t) => {
  const h = harness();
  h.reject();
  const before = structuredClone(h.shell.save);
  const stored = h.stored();
  const dialog = h.shell.modal.innerHTML;
  const values = [0.001, 0, 0.03, 0.999999];
  const random = t.mock.method(Math, 'random', () => values.shift() ?? 0.999999);
  dispatchAction(h.shell, 'mortal-activity', 'fishing');
  assert.deepEqual(h.shell.save, before);
  assert.equal(h.stored(), stored);
  assert.equal(h.shell.modal.innerHTML, dialog);
  assert.equal(h.shell.panel, 'town-event');
  assert.deepEqual(h.effects, []);
  assert.equal(
    h.messages.some((message) => message.includes(bottleLine)),
    false,
  );
  assert.match(h.messages.at(-1)!, /尚未保存/);
  const firstBag = structuredClone(h.candidates[0].medicine.bag);
  assert.deepEqual(firstBag, { mingqing: 1 }, '拒写候选使用第一组受控概率和选药值');
  h.allow();
  dispatchAction(h.shell, 'mortal-activity', 'fishing');
  random.mock.restore();
  assert.equal(h.shell.save.age, before.age + 1);
  assert.equal(h.shell.save.stones, before.stones + 12);
  assert.deepEqual(
    h.shell.save.medicine.bag,
    { zhiyuan: 1 },
    '重试按第二组受控概率和选药值重抽，只有这一次成功候选入账',
  );
  assert.equal(h.shell.save.medicine.bag.mingqing, undefined, '失败候选没有在重试时重复发放');
  assert.equal(h.candidates.length, 2);
  assert.equal(h.effects.filter((effect) => effect === 'write').length, 1);
  assert.equal(h.messages.filter((message) => message.includes(bottleLine)).length, 1);
});

test('夜船真实控制器拒写不扣寿、不发物、不标claimed；恢复后重试且双击仅一次入账', () => {
  for (const roll of [0.1, 0.5, 0.9]) {
    const save = traveller();
    const boat = offer(save, roll);
    const h = harness(save, 'night-boat');
    h.reject();
    const before = structuredClone(save);
    const stored = h.stored();
    const body = h.shell.modal.innerHTML;
    dispatchAction(h.shell, 'night-boat-buy');
    assert.deepEqual(save, before);
    assert.equal(h.stored(), stored);
    assert.equal(h.shell.modal.innerHTML, body);
    assert.deepEqual(h.effects, []);
    assert.match(h.messages.at(-1)!, /无法保存/);
    h.allow();
    dispatchAction(h.shell, 'night-boat-buy');
    assert.equal(save.lifespanSpent, boat.cost);
    assert.equal(save.mortal.nightBoat!.claimed, true);
    if (boat.kind === 'curio')
      assert.equal(save.curios.acquired.filter((id) => id === boat.id).length, 1);
    else assert.equal(save.medicine.bag[boat.id], 1);
    assert.deepEqual(h.effects, ['write', 'panel']);
    assert.match(h.shell.modal.innerHTML, /那人点了点头，一句话也没多说。等你回头，船已经离岸了。/);
    assert.doesNotMatch(h.shell.modal.innerHTML, /data-action="night-boat-buy"/);
    assert.deepEqual(readSealedSave(h.stored()).save, save);
    const claimed = structuredClone(save);
    dispatchAction(h.shell, 'night-boat-buy');
    assert.deepEqual(save, claimed);
    assert.deepEqual(h.effects, ['write', 'panel']);
  }
});

test('夜船错误面板、锁档、战斗中、未结奇物重复及不足寿元均拒绝且不写存档', () => {
  for (const condition of ['panel', 'locked', 'battle', 'pending-curio', 'lifespan']) {
    const save = traveller();
    const boat = offer(save, condition === 'pending-curio' ? 0.1 : 0.5);
    const h = harness(save, 'night-boat');
    if (condition === 'panel') h.shell.panel = 'settings';
    if (condition === 'locked') h.shell.saveLock = 'stale' as ActionShell['saveLock'];
    if (condition === 'battle') h.shell.game = new Game(save, 0, 0, () => 0.9);
    if (condition === 'pending-curio')
      h.shell.pendingRun = { loot: { curios: { [boat.id]: 1 } } } as Game;
    if (condition === 'lifespan')
      save.age = lifespanInfo(save).limit - boat.cost - lifespanInfo(save).base * 0.1 + 0.01;
    const before = structuredClone(save);
    dispatchAction(h.shell, 'night-boat-buy');
    assert.deepEqual(save, before, condition);
    assert.equal(h.effects.includes('write'), false, condition);
  }
});

test('夜船与lifespanSpent在本机读档、导出导入和未完历练续局中完整保留', () => {
  for (const claimed of [false, true]) {
    const save = traveller();
    offer(save, 0.5);
    if (claimed) assert.equal(claimNightBoat(save), true);
    const run = new Game(save, 0, 0, () => 0.9);
    run.pause();
    const local = readSealedSave(JSON.stringify(sealSaveSnapshot(save)));
    assert.equal(local.status, 'ok');
    const file = importSave(exportSave(save, run));
    assert.ok(file.run);
    for (const restored of [local.save, file.save]) {
      assert.equal(restored.schema, SAVE_SCHEMA);
      assert.equal(restored.lifespanSpent, claimed ? 400 : 0);
      assert.deepEqual(restored.mortal.nightBoat, save.mortal.nightBoat);
      assert.deepEqual(lifespanInfo(restored), lifespanInfo(save));
      assert.equal(restored.factsTampered, false);
    }
    assert.deepEqual(file.run.snapshot(), run.snapshot());
  }
});

test('非法累计折寿或夜船字段的文件导入拒绝，旧schema缺字段升级默认0/null', () => {
  const save = traveller();
  offer(save, 0.5);
  for (const value of [-1, 0.5, null, Infinity, Number.MAX_SAFE_INTEGER + 1, '400']) {
    const raw = structuredClone(save);
    Object.assign(raw, { lifespanSpent: value });
    assert.throws(() => importSave(JSON.stringify(raw)), /损坏/);
  }
  for (const patch of [
    { id: 'unknown' },
    { kind: 'permanent' },
    { cost: 0 },
    { cost: 1.5 },
    { claimed: 1 },
    { appearedAt: save.age + 1 },
  ]) {
    const raw = structuredClone(save);
    Object.assign(raw.mortal.nightBoat!, patch);
    assert.throws(() => importSave(JSON.stringify(raw)), /损坏/);
  }
  const old = structuredClone(save) as Partial<SaveData>;
  old.schema = 39;
  delete old.lifespanSpent;
  delete old.mortal!.nightBoat;
  const imported = importSave(JSON.stringify(sealSaveSnapshot(old as SaveData))).save;
  assert.equal(imported.schema, SAVE_SCHEMA);
  assert.equal(imported.lifespanSpent, 0);
  assert.equal(imported.mortal.nightBoat, null);
});

test('夜船与折寿不进入万魂幡事实，事实版本保持v2且新字段单独变化不影响原seal', () => {
  const save = traveller();
  Object.assign(save, sealSaveSnapshot(save));
  const facts = projectLeaderboardFactsV2(save);
  const seal = structuredClone(save.factsSeal);
  assert.equal(FACTS_VERSION, 2);
  assert.equal(Object.hasOwn(facts, 'lifespanSpent'), false);
  assert.equal(Object.hasOwn(facts, 'nightBoat'), false);
  offer(save, 0.5);
  save.lifespanSpent = 100;
  assert.deepEqual(projectLeaderboardFactsV2(save), facts);
  assert.deepEqual(sealSaveSnapshot(save).factsSeal, seal);
  assert.equal(inspectSaveIntegrity(save, 'local'), false);
  assert.equal(readSealedSave(JSON.stringify(save)).save.factsTampered, false);
  assert.equal(importSave(JSON.stringify(save)).save.factsTampered, false);
});

test('执行真实轮回/承缘开新世入口时累计折寿归零且旧夜船不带入', () => {
  const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  const match = source.match(/^function resetLifetime\([^]*?^\}/m);
  assert.ok(match);
  const reset = new Script(stripTypeScriptTypes(match[0]));
  for (const gift of [
    null,
    { kind: 'medicine', id: 'butian' },
    { kind: 'curio', id: 'soul-wood' },
  ] satisfies Array<BirthInheritance | null>) {
    const save = traveller();
    offer(save, 0.5);
    assert.equal(claimNightBoat(save), true);
    const writes: SaveData[] = [];
    const noop = () => {};
    const context = createContext({
      save,
      panel: 'settings',
      structuredClone,
      freshSave,
      rootElementsFor,
      applyBirthInheritance,
      departHometown,
      recordChronicle,
      rollSpiritRoot: () => 'heaven',
      writeSave(next: SaveData) {
        writes.push(sealSaveSnapshot(next));
      },
      shownHumanLetters: new Set(),
      clearInterval: noop,
      window: { clearTimeout: noop },
      clearInput: noop,
      ambushScene: null,
      gameAudio: { sync: noop },
      minimumDifficulty: () => 0,
      ui: { inert: true },
      modal: { innerHTML: '' },
      adTimer: undefined,
      victoryTimer: undefined,
      adWatchEpoch: 0,
      saveLock: null,
      renderLobby: noop,
    });
    reset.runInContext(context);
    assert.equal(context.resetLifetime(undefined, false, gift, !!gift), true);
    assert.equal(save.lifespanSpent, 0);
    assert.equal(save.mortal.nightBoat, null);
    assert.equal(writes.length, 1);
    assert.equal(readSealedSave(JSON.stringify(writes[0])).save.lifespanSpent, 0);
    if (gift) assert.deepEqual(save.birthInheritance, gift);
  }
});
