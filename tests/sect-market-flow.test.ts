import { beginSectMarketVisit } from '../src/sect-market.ts';
import { enterNextMarketBatch } from './market-fixture.ts';
import * as marketEventUi from '../src/market-event-ui.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, Script } from 'node:vm';
import { freshSave, SAVE_KEY, lifespanInfo, tribulationDue } from '../src/progress.ts';
import { Game } from '../src/game.ts';
import { freshTownPopulation } from '../src/town-population.ts';
import { marketCultivators, isMarketCultivatorId } from '../src/sect-market-data.ts';
import {
  sectMarketOpen,
  sectMarketOffer,
  sectMarketDeals,
  sectMarketExchangeReason,
  exchangeSectMedicine,
} from '../src/sect-market.ts';
import { sectMarketTradeContent } from '../src/sect-market-ui.ts';
import { townStatus } from '../src/mortal-ui.ts';
import { medicineInfo } from '../src/medicine-data.ts';
import { FINAL_TRIAL_STAGE } from '../src/data.ts';
import { dispatchAction } from '../src/action-controller.ts';

// 使用真实按钮模板、主路由与写档防护，仅替换 DOM 叶节点和浏览器存储。
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const flow = new Script(
  stripTypeScriptTypes(
    [
      'shellBindings',
      'handleAction',
      'writeSave',
      'lockStaleSave',
      'refreshMarketTrade',
      'refreshMarketActivities',
    ]
      .map((name) => {
        const match = main.match(new RegExp(`^function ${name}\\([^]*?^\\}`, 'm'));
        assert.ok(match, `missing actual ${name}`);
        return match[0];
      })
      .join('\n'),
  ),
);
function harness(pending = false) {
  const save = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  save.runs = 1;
  save.cultivation = 1;
  save.prologueSeen = save.hometownSeen = true;
  save.mortal.hometown!.stage = 'departed';
  save.medicine.recipeSeed = 12345;
  save.mortal.population = { seed: 12345, since: 15 };
  enterNextMarketBatch(save);
  const npc = marketCultivators(save.mortal.population, save.mortal.sectMarket!)[1];
  const offer = sectMarketOffer(save, npc.id)!;
  const deal = sectMarketDeals(save, npc.id).find((d) => d.category === 'medicine')!;
  const give = medicineInfo(deal.give[0].id)!;
  save.medicine.bag[give.id] = deal.give[0].quantity * 2;
  const game = pending ? new Game(save, 0, 0, () => 0.5) : null;
  game?.pause();
  let stored = JSON.stringify({ ...save, activeRun: game?.snapshot() ?? null });
  let html = sectMarketTradeContent(save, npc, deal.id);
  let blocked = false;
  const messages: string[] = [];
  const tradeHost = {
    get innerHTML() {
      return html;
    },
    set innerHTML(value: string) {
      html = value;
    },
  };
  const modal = {
    innerHTML: '',
    querySelector(selector: string) {
      if (selector === '#sect-market-trade') return tradeHost;
      if (selector === '#sect-market-give')
        return html.includes('id="sect-market-give"') ? { value: deal.id } : null;
      if (selector === '[data-action="sect-market-exchange"]') {
        const attrs = html.match(/<button[^>]*data-action="sect-market-exchange"[^>]*>/)?.[0];
        return attrs
          ? {
              dataset: Object.fromEntries(
                [...attrs.matchAll(/data-(\w+)="([^"]*)"/g)].map((m) => [m[1], m[2]]),
              ),
            }
          : null;
      }
      return null;
    },
  };
  const context = createContext({
    marketEventSource: { current: marketEventUi },
    dispatchAction,
    save,
    SAVE_KEY,
    modal,
    FINAL_TRIAL_STAGE,
    structuredClone,
    performance,
    inMarket: true,
    inTown: false,
    inMortalWorld: true,
    mortalTab: 'sects',
    game: null,
    pendingRun: game,
    panel: 'sect-market-event',
    saveLock: null,
    lastSaveText: stored,
    marketNpc: npc,
    marketScene: { nearbyNpc: npc },
    sectMarketOpen,
    beginSectMarketVisit,
    exchangeSectMedicine,
    sectMarketExchangeReason,
    sectMarketOffer,
    sectMarketDeals,
    isMarketCultivatorId,
    sectMarketTradeContent,
    townStatus,
    freshTownPopulation,
    lifespanInfo,
    tribulationDue,
    clearInput: () => {},
    renderSaveLock: () => {},
    renderMortal: () => {},
    mobileDisplay: { enter: () => {}, leave: () => {} },
    toast: (text: string) => messages.push(text),
    document: { getElementById: () => ({ innerHTML: '', focus: () => {} }) },
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
    context,
    save,
    npc,
    offer,
    give,
    deal,
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
test('实际按钮 visit 属性经真实路由完成组合互换，额度/物资一次保存且保留原续局', () => {
  for (const pending of [false, true]) {
    const h = harness(pending);
    const before = JSON.parse(h.stored);
    h.context.handleAction('sect-market-exchange', h.npc.id);
    const after = JSON.parse(h.stored);
    assert.equal(after.medicine.bag[h.give.id], h.deal.give[0].quantity);
    assert.equal(after.medicine.bag[h.offer.id], h.deal.receive.quantity);
    assert.deepEqual(after.activeRun, before.activeRun);
    if (pending) {
      const restored = Game.restore(h.save, after.activeRun);
      assert.ok(restored, '保留的对局必须能实际恢复');
      assert.equal(restored.state, 'paused');
    }
    assert.equal(after.age, before.age);
    assert.equal(after.cultivation, before.cultivation);
    assert.deepEqual(after.mortal.sectMarket.exchanged, [h.npc.id]);
    assert.match(h.html, /本批已互换/);
    assert.ok(h.messages.some((t) => t.includes(h.offer.name)));
    const settled = h.stored;
    h.context.handleAction('sect-market-exchange', h.npc.id);
    assert.equal(h.stored, settled);
  }
});
test('写入失败不扣药、不改额度；恢复后原按钮正常重试', () => {
  const h = harness();
  const before = structuredClone(h.save),
    text = h.stored;
  h.block();
  h.context.handleAction('sect-market-exchange', h.npc.id);
  assert.deepEqual(h.save, before);
  assert.equal(h.stored, text);
  assert.match(h.messages.at(-1)!, /互换未完成/);
  h.block(false);
  h.context.handleAction('sect-market-exchange', h.npc.id);
  assert.equal(h.save.medicine.bag[h.give.id], h.deal.give[0].quantity);
  assert.equal(h.save.medicine.bag[h.offer.id], h.deal.receive.quantity);
});
test('多窗口写档后锁住旧页，保留新存档，旧页不扣药', () => {
  const h = harness();
  const before = structuredClone(h.save);
  h.external();
  const external = h.stored;
  h.context.handleAction('sect-market-exchange', h.npc.id);
  assert.equal(h.context.saveLock, 'stale');
  assert.deepEqual(h.save, before);
  assert.equal(h.stored, external);
});
test('旧按钮不能作用于新来访者；远处修士不能通过路由互换', () => {
  const h = harness();
  enterNextMarketBatch(h.save);
  const before = structuredClone(h.save),
    text = h.stored;
  h.context.handleAction('sect-market-exchange', h.npc.id);
  assert.deepEqual(h.save, before);
  assert.equal(h.stored, text);
  assert.match(h.messages.at(-1)!, /已更换/);
  h.context.marketScene.nearbyNpc = null;
  h.context.handleAction('sect-market-exchange', h.npc.id);
  assert.deepEqual(h.save, before);
  assert.equal(h.stored, text);
});
test('实际重新入场才换人，保存失败和已在场的重复入口不消耗来访批次', () => {
  const h = harness();
  h.context.panel = '';
  h.context.inMarket = false;
  h.save.age += 1;
  const before = structuredClone(h.save);
  h.block();
  h.context.handleAction('sect-market-enter');
  assert.deepEqual(h.save, before);
  assert.equal(h.context.inMarket, false);
  h.block(false);
  h.context.handleAction('sect-market-enter');
  assert.equal(h.save.mortal.sectMarket!.visit, 2);
  assert.equal(h.context.inMarket, true);
  h.context.handleAction('sect-market-enter');
  assert.equal(h.save.mortal.sectMarket!.visit, 2);
});
