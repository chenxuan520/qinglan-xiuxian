import { notificationLeaves } from './helpers/notification-leaves.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, Script } from 'node:vm';
import { dispatchAction } from '../src/action-controller.ts';
import {
  freshSave,
  SAVE_KEY,
  lifespanInfo,
  tribulationDue,
  train,
  retreat,
} from '../src/progress.ts';
import { Game } from '../src/game.ts';
import { allowsSchool, treasure } from '../src/data.ts';
import { retreatResultPanel } from '../src/lobby-ui.ts';
import { syncHumanStories } from '../src/human-stories.ts';

const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const flow = new Script(
  stripTypeScriptTypes(
    ['writeSave', 'persist', 'lockStaleSave', 'shellBindings', 'handleAction']
      .map((name) => {
        const match = source.match(new RegExp(`^function ${name}\\([^]*?^\\}`, 'm'));
        assert.ok(match);
        return match[0];
      })
      .join('\n'),
  ),
);

function harness(pending: boolean) {
  const save = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  save.prologueSeen = save.hometownSeen = true;
  save.mortal.hometown!.stage = 'departed';
  save.age = 30;
  save.stones = 10000;
  save.artifacts.push('pagoda');
  const run = pending ? new Game(save, 0, 0, () => 0.5) : null;
  if (run) {
    run.time = 45;
    run.player.hp -= 10;
    run.pause();
  }
  let stored = JSON.stringify({ ...save, activeRun: run?.snapshot() ?? null });
  let fail = false,
    stale = false,
    renders = 0,
    upgrades = 0,
    years = '10';
  let warning = true;
  const note = {
    textContent: '本机存档不可用 · 关于《叩仙门》',
    classList: {
      remove(name: string) {
        if (name === 'storage-warning') warning = false;
      },
    },
  };
  const toasts: string[] = [],
    panels: string[] = [];
  const context = createContext({
    ...notificationLeaves(),
    save,
    SAVE_KEY,
    Game,
    train,
    retreat,
    allowsSchool,
    treasure,
    lifespanInfo,
    tribulationDue,
    retreatResultPanel,
    syncHumanStories,
    dispatchAction,
    structuredClone,
    performance,
    chronicleSource: { observe() {} },
    hideAchievementNotice() {},
    saveLock: null,
    lastSaveText: stored,
    pendingRun: run,
    game: null,
    settled: false,
    settlementRetryAt: 0,
    storageAvailable: true,
    panel: 'cultivation',
    inMortalWorld: false,
    inMarket: false,
    inTown: false,
    selectedTreasure: 'pagoda',
    medicinePanel: { handle: () => false },
    clearInput() {},
    renderSaveLock() {},
    renderLobby() {
      renders++;
    },
    renderPanel() {
      renders++;
    },
    renderTribulationPending() {
      panels.push('tribulation');
    },
    gameAudio: {
      play() {
        upgrades++;
      },
    },
    panelFrame(...parts: string[]) {
      panels.push(parts.join(''));
    },
    toast(text: string) {
      toasts.push(text);
    },
    modal: {
      querySelector() {
        return null;
      },
    },
    document: {
      querySelector(selector: string) {
        if (selector === '#retreat-years') return { value: years, reportValidity: () => true };
        if (selector === '.lobby-save-status.storage-warning') return warning ? note : null;
        return null;
      },
    },
    localStorage: {
      getItem() {
        return stale ? JSON.stringify({ ...save, stones: 777 }) : stored;
      },
      setItem(_key: string, value: string) {
        if (fail) throw Error('QuotaExceededError');
        stored = value;
      },
    },
  });
  flow.runInContext(context);
  return {
    context,
    save,
    run,
    panels,
    toasts,
    note,
    stored: () => JSON.parse(stored),
    renders: () => renders,
    upgrades: () => upgrades,
    warning: () => warning,
    fail: (value: boolean) => {
      fail = value;
    },
    stale: () => {
      stale = true;
    },
    years: (value: string) => {
      years = value;
    },
    action(action: string, id?: string) {
      context.handleAction(action, id);
    },
  };
}

for (const action of ['train', 'retreat', 'equip']) {
  test(`${action} 写入失败或跨窗口冲突不应用，成功重试一次且续局仍绑定实时存档`, () => {
    for (const pending of [false, true])
      for (const mode of ['quota', 'stale']) {
        const h = harness(pending);
        if (action === 'equip') h.context.panel = 'treasure-detail';
        const before = structuredClone(h.save),
          stored = h.stored(),
          snapshot = h.run?.snapshot();
        if (mode === 'quota') h.fail(true);
        else h.stale();
        h.action(action, action === 'train' ? 'vitality' : undefined);
        assert.deepEqual(h.save, before);
        assert.deepEqual(h.stored(), stored);
        assert.equal(h.context.pendingRun, h.run);
        assert.deepEqual(h.run?.snapshot(), snapshot);
        assert.equal(h.renders(), 0);
        assert.equal(h.upgrades(), 0);
        assert.deepEqual(h.panels, []);
        assert.ok(!h.toasts.some((text) => /收获已保存|已将/.test(text)));
        if (mode === 'stale') {
          assert.equal(h.context.saveLock, 'stale');
          continue;
        }
        assert.equal(h.context.storageAvailable, false);
        h.fail(false);
        h.action(action, action === 'train' ? 'vitality' : undefined);
        assert.equal(h.context.storageAvailable, true);
        assert.equal(h.warning(), false);
        assert.equal(h.note.textContent, '关于《叩仙门》 · GitHub');
        assert.deepEqual(h.stored().training, h.save.training);
        assert.equal(h.stored().starter, h.save.starter);
        assert.equal(h.stored().age, h.save.age);
        if (action === 'train') {
          assert.equal(h.save.training.vitality, 1);
          assert.equal(h.upgrades(), 1);
        }
        if (action === 'retreat') {
          assert.equal(h.save.age, before.age + 10);
          assert.match(h.panels[0], /收获已保存/);
        }
        if (action === 'equip') assert.equal(h.save.starter, 'pagoda');
        if (pending) {
          assert.equal(h.context.pendingRun.save, h.save);
          assert.equal(h.context.pendingRun.time, 45);
          assert.deepEqual(
            h.stored().activeRun,
            JSON.parse(JSON.stringify(h.context.pendingRun.snapshot())),
          );
          h.save.stones += 1;
          assert.equal(h.context.pendingRun.save.stones, h.save.stones);
        } else assert.equal(h.stored().activeRun, null);
      }
  });
}

test('存储恢复后普通persist也清除已有首页警告，不必再次导入存档', () => {
  const h = harness(false);
  h.fail(true);
  assert.equal(h.context.persist(), false);
  assert.equal(h.context.storageAvailable, false);
  h.fail(false);
  assert.equal(h.context.persist(), true);
  assert.equal(h.context.storageAvailable, true);
  assert.equal(h.warning(), false);
});

test('修习满阶、灵石不足与无效闭关年数不写入或展示成功', () => {
  for (const type of ['max', 'stones', 'years']) {
    const h = harness(true);
    if (type === 'max') h.save.training.vitality = 20;
    if (type === 'stones') h.save.stones = 0;
    if (type === 'years') h.years('-1');
    const before = structuredClone(h.save),
      stored = h.stored();
    h.action(type === 'years' ? 'retreat' : 'train', 'vitality');
    assert.deepEqual(h.save, before);
    assert.deepEqual(h.stored(), stored);
    assert.equal(h.context.pendingRun, h.run);
    assert.equal(h.renders(), 0);
    assert.deepEqual(h.panels, []);
  }
});
