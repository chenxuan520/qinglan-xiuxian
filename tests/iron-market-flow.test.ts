import { notificationLeaves } from './helpers/notification-leaves.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, Script } from 'node:vm';
import { freshSave, SAVE_KEY, tribulationDue } from '../src/progress.ts';
import { Game } from '../src/game.ts';
import { dispatchAction } from '../src/action-controller.ts';
import { executeMortalAction } from '../src/town-host.ts';
import { ironMarketContent } from '../src/iron-market-ui.ts';
import { ironMarket } from '../src/iron-market.ts';
import { townStatus } from '../src/mortal-ui.ts';

// 执行正式路由、写档与商人模板，仅替换 DOM 叶节点及浏览器存储。
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const flow = new Script(
  stripTypeScriptTypes(
    ['shellBindings', 'handleAction', 'writeSave', 'lockStaleSave']
      .map((name) => {
        const fn = main.match(new RegExp(`^function ${name}\\([^]*?^\\}`, 'm'));
        assert.ok(fn, name);
        return fn[0];
      })
      .join('\n'),
  ),
);

function harness(pending = false) {
  const save = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  save.cultivation = 1;
  save.stones = 10000;
  save.iron = 5;
  save.prologueSeen = save.hometownSeen = true;
  save.mortal.hometown!.stage = 'departed';
  const run = pending ? new Game(save, 0, 0, () => 0.5) : null;
  run?.pause();
  let stored = JSON.stringify({ ...save, activeRun: run?.snapshot() ?? null });
  let html = ironMarketContent(save, 50),
    blocked = false;
  const messages: string[] = [];
  const tradeHost = {
    set outerHTML(next: string) {
      html = next;
    },
  };
  const context = createContext({
    ...notificationLeaves(),
    // 成就队列另有真实回归，此处隔离界面通知，不跳过实际存档写入。
    chronicleSource: { observe() {} },
    hideAchievementNotice() {},
    tribulationDue,
    dispatchAction,
    save,
    SAVE_KEY,
    structuredClone,
    executeMortalAction,
    ironMarketContent,
    townStatus,
    game: null,
    pendingRun: run,
    inTown: true,
    inMortalWorld: true,
    inMarket: false,
    panel: 'town-event',
    townNpc: { id: 'market' },
    townScene: { nearbyNpc: { id: 'market' } },
    saveLock: null,
    lastSaveText: stored,
    modal: {
      querySelector: (selector: string) =>
        selector === '#iron-market-trade' ? tradeHost : { textContent: '' },
    },
    document: { getElementById: () => ({ innerHTML: '' }) },
    clearInput: () => {},
    renderSaveLock: () => {},
    toast: (message: string) => messages.push(message),
    localStorage: {
      getItem: () => stored,
      setItem(_key: string, value: string) {
        if (blocked) throw Error('storage unavailable');
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
    get html() {
      return html;
    },
    block(value = true) {
      blocked = value;
    },
    external() {
      stored = JSON.stringify({ ...save, stones: 99 });
    },
  };
}

test('玄铁实际批量按钮经主路由一次保存余额与额度，保持交谈及未完成对局', () => {
  for (const pending of [false, true]) {
    const h = harness(pending),
      before = JSON.parse(h.stored);
    assert.match(h.html, /data-id="0:50" data-cost-stones="1350"/);
    h.context.handleAction('mortal-buy', '0:50');
    const after = JSON.parse(h.stored);
    assert.equal(after.stones, before.stones - 1350);
    assert.equal(after.iron, 55);
    assert.equal(after.mortal.ironMarket.bought, 50);
    assert.deepEqual(after.activeRun, before.activeRun);
    if (pending) assert.ok(Game.restore(h.save, after.activeRun));
    assert.equal(h.context.panel, 'town-event');
    assert.equal(h.context.townNpc.id, 'market');
    assert.match(h.html, /本期还可购 50 \/ 100/);
    h.context.handleAction('mortal-sell', '0:50');
    assert.equal(h.save.iron, 5);
    assert.equal(h.save.stones, before.stones - 1350 + 600);
    assert.equal(ironMarket(h.save).remaining, 50, '售出不补回额度');
    assert.equal(h.save.age, before.age);
  }
});

test('玄铁写入失败可重试，多窗口变更锁住旧页，物资及额度均不部分结算', () => {
  const h = harness(),
    before = structuredClone(h.save),
    stored = h.stored;
  h.block();
  h.context.handleAction('mortal-buy', '0:50');
  assert.deepEqual(h.save, before);
  assert.equal(h.stored, stored);
  assert.match(h.messages.at(-1)!, /无法保存/);
  h.block(false);
  h.context.handleAction('mortal-buy', '0:50');
  assert.equal(h.save.iron, 55);
  const settled = structuredClone(h.save);
  h.external();
  const external = h.stored;
  h.context.handleAction('mortal-sell', '0:50');
  assert.equal(h.context.saveLock, 'stale');
  assert.deepEqual(h.save, settled);
  assert.equal(h.stored, external);
});

test('玄铁交易拒绝跨期旧报价、非法数量及非现场入口，不绕过资源和额度校验', () => {
  const h = harness();
  for (const id of ['0:0', '0:-1', '0:1.5', '0:101', '1:50', '0:NaN', 'garbage']) {
    const before = structuredClone(h.save),
      stored = h.stored;
    h.context.handleAction('mortal-buy', id);
    assert.deepEqual(h.save, before);
    assert.equal(h.stored, stored);
  }
  for (const field of ['inTown', 'inMortalWorld', 'panel', 'townNpc', 'townScene'] as const) {
    const old = h.context[field];
    h.context[field] =
      field === 'panel'
        ? ''
        : field === 'townNpc'
          ? { id: 'herbalist' }
          : field === 'townScene'
            ? { nearbyNpc: null }
            : false;
    const before = structuredClone(h.save);
    h.context.handleAction('mortal-buy', '0:50');
    assert.deepEqual(h.save, before);
    h.context[field] = old;
  }
});

test('灵石不足的玄铁报价保留可点击广告补给入口，超额度不引导广告', () => {
  const h = harness();
  h.save.stones = 0;
  let html = ironMarketContent(h.save, 50);
  let button = html.match(/<button[^>]*data-action="mortal-buy"[^>]*>/)![0];
  assert.match(button, /data-cost-stones="1350"/);
  assert.doesNotMatch(button, /disabled/);
  h.save.mortal.ironMarket = { period: 0, bought: 100 };
  html = ironMarketContent(h.save, 50);
  button = html.match(/<button[^>]*data-action="mortal-buy"[^>]*>/)![0];
  assert.match(button, /disabled/);
});
