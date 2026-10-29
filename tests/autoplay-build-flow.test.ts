import { notificationLeaves } from './helpers/notification-leaves.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, Script } from 'node:vm';
import { freshSave, SAVE_KEY, lifespanInfo, tribulationDue } from '../src/progress.ts';
import { Game } from '../src/game.ts';
import { dispatchAction } from '../src/action-controller.ts';
import { settingsContent } from '../src/settings-ui.ts';

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const flow = new Script(
  stripTypeScriptTypes(
    ['shellBindings', 'handleAction', 'writeSave', 'lockStaleSave']
      .map((name) => {
        const match = main.match(new RegExp(`^function ${name}\\([^]*?^\\}`, 'm'));
        assert.ok(match, name);
        return match[0];
      })
      .join('\n'),
  ),
);
function harness(pending = false) {
  const save = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  save.prologueSeen = save.hometownSeen = true;
  save.mortal.hometown!.stage = 'departed';
  const run = pending ? new Game(save, 0, 0, () => 0.5) : null;
  run?.pause();
  let stored = JSON.stringify({ ...save, activeRun: run?.snapshot() ?? null }),
    blocked = false,
    refreshes = 0;
  const messages: string[] = [];
  const context = createContext({
    ...notificationLeaves(),
    // 成就队列另有真实回归，此处隔离界面通知，不跳过实际存档写入。
    chronicleSource: { observe() {} },
    hideAchievementNotice() {},
    save,
    SAVE_KEY,
    dispatchAction,
    structuredClone,
    lifespanInfo,
    tribulationDue,
    game: null,
    pendingRun: run,
    panel: 'settings',
    saveLock: null,
    lastSaveText: stored,
    refreshAutoplaySettings: () => {
      refreshes++;
    },
    clearInput: () => {},
    renderSaveLock: () => {},
    toast: (message: string) => messages.push(message),
    localStorage: {
      getItem: () => stored,
      setItem(_key: string, value: string) {
        if (blocked) throw Error('storage failed');
        stored = value;
      },
    },
  });
  flow.runInContext(context);
  return {
    save,
    context,
    run,
    messages,
    get stored() {
      return stored;
    },
    get refreshes() {
      return refreshes;
    },
    block() {
      blocked = true;
    },
    external() {
      stored = JSON.stringify({ ...save, stones: 777 });
    },
  };
}
test('设置真实路由先保存再应用，不开启自动、不修改属性或暂停的续局', () => {
  for (const pending of [false, true]) {
    const h = harness(pending),
      before = JSON.parse(h.stored);
    h.context.handleAction('autoplay-build', 'custom');
    h.context.handleAction('autoplay-target', '0:orbit');
    h.context.handleAction('autoplay-target', '1:skull');
    const after = JSON.parse(h.stored);
    assert.deepEqual(after.autoplayBuild, { mode: 'custom', targets: ['orbit', 'skull'] });
    assert.deepEqual(h.save.autoplayBuild, after.autoplayBuild);
    assert.equal(after.autoplay, false);
    assert.equal(after.cultivation, before.cultivation);
    assert.deepEqual(after.activeRun, before.activeRun);
    if (h.run) assert.equal(h.run.save.autoplayBuild, h.save.autoplayBuild);
    assert.equal(h.refreshes, 3);
  }
});
test('存储失败与其他窗口更新都不能部分应用培养设置', () => {
  for (const stale of [false, true]) {
    const h = harness(true),
      before = structuredClone(h.save.autoplayBuild);
    if (stale) h.external();
    else h.block();
    const stored = h.stored;
    h.context.handleAction('autoplay-build', 'native');
    assert.equal(h.stored, stored);
    assert.deepEqual(h.save.autoplayBuild, before);
    if (stale) assert.equal(h.context.saveLock, 'stale');
    else assert.match(h.messages[0], /尚未保存/);
  }
});
test('旧界面、战斗中与无效目标不能通过动作绕过设置入口', () => {
  for (const panel of ['', 'settings']) {
    const h = harness();
    h.context.panel = panel;
    if (panel === 'settings') h.context.game = new Game(h.save, 0, 0);
    const before = h.stored;
    h.context.handleAction('autoplay-build', 'native');
    assert.equal(h.stored, before);
  }
  const h = harness(),
    before = h.stored;
  for (const id of ['2:sword', '0:unknown', '0:', '']) {
    h.context.handleAction('autoplay-target', id);
    if (id === '0:') continue;
    assert.equal(h.stored, before);
  }
});
test('设置默认选中原路线，指定目标选项含正魔法宝，离线小节仍默认折叠', () => {
  const save = freshSave();
  let html = settingsContent(save);
  assert.match(html, /<option value="default" selected>默认路线<\/option>/);
  assert.doesNotMatch(html, /id="autoplay-build-target-/);
  assert.match(html, /<details class="disclosure settings-section" data-disclosure="offline">/);
  save.autoplayBuild = { mode: 'custom', targets: ['ice', 'skull'] };
  html = settingsContent(save);
  assert.match(html, /<option value="ice" selected>玄冰镜<\/option>/);
  assert.match(html, /<option value="skull" selected>白骨髅<\/option>/);
});
