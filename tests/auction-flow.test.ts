import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, Script } from 'node:vm';
import { freshSave, SAVE_KEY, lifespanInfo, tribulationDue, realmCost } from '../src/progress.ts';
import { Game } from '../src/game.ts';
import { beginSectMarketVisit } from '../src/sect-market.ts';
import { prepareAuction, auctionSellReason } from '../src/auction.ts';
import { buyAuction, sellAuction, auctionBuyReason, auctionLots } from '../src/auction-trade.ts';
import { auctionContent, auctionResult, auctionHallAction } from '../src/auction-ui.ts';
import { townStatus } from '../src/mortal-ui.ts';
import { executeAuctionTrade } from '../src/auction-ui.ts';
import { dispatchAction } from '../src/action-controller.ts';
import { FINAL_TRIAL_STAGE } from '../src/data.ts';
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const flow = new Script(
  stripTypeScriptTypes(
    ['shellBindings', 'handleAction', 'writeSave', 'lockStaleSave', 'refreshAuction']
      .map((name) => {
        const match = main.match(new RegExp(`^function ${name}\\([^]*?^\\}`, 'm'));
        assert.ok(match);
        return match[0];
      })
      .join('\n'),
  ),
);
function harness(
  pending = false,
  options: {
    setup?: (save: ReturnType<typeof freshSave>) => void;
    selectLot?: (lot: ReturnType<typeof auctionLots>[number]) => boolean;
  } = {},
) {
  const save = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  save.runs = 1;
  save.cultivation = 1;
  save.prologueSeen = save.hometownSeen = true;
  save.mortal.hometown!.stage = 'departed';
  save.age = 30;
  save.stones = 10000;
  save.mortal.population = { seed: 12345, since: 15 };
  options.setup?.(save);
  beginSectMarketVisit(save);
  prepareAuction(save);
  const lot = auctionLots(save).find(options.selectLot ?? (() => true));
  assert.ok(lot, '测试会场必须实际生成所需拍品');
  if (lot.kind === 'medicine') save.medicine.bag[lot.id] = 6;
  save.forge.nail = 1;
  const run = pending ? new Game(save, 0, 0, () => 0.5) : null;
  run?.pause();
  let stored = JSON.stringify({ ...save, activeRun: run?.snapshot() ?? null });
  let fail = false;
  let html = auctionContent(save, 'buy', pending);
  let budget = '9000';
  let selected = lot.id;
  let reserve = '1';
  const note = { hidden: true, textContent: '' };
  const section = { scrollTop: 123 };
  const host = {
    get innerHTML() {
      return html;
    },
    set innerHTML(v: string) {
      html = v;
    },
  };
  const messages: string[] = [];
  const modal = {
    querySelector(selector: string) {
      if (selector === '#auction-content') return host;
      if (selector === '.panel') return section;
      if (selector === '#auction-result') return note;
      if (selector.startsWith('#auction-budget-')) return { value: budget };
      if (selector === '#auction-item') return { value: selected };
      if (selector === '#auction-reserve') return { value: reserve };
      if (selector === '#auction-quantity') return { value: '2' };
      if (selector.startsWith('[data-action="auction-')) {
        const action = selector.includes('auction-hall')
          ? 'auction-hall'
          : selector.includes('auction-buy')
            ? 'auction-buy'
            : 'auction-sell';
        const id = selector.match(/data-id="(\d+)"/)?.[1];
        const button = html.match(
          new RegExp(
            `<button[^>]*data-action="${action}"${id === undefined ? '' : `[^>]*data-id="${id}"`}[^>]*>`,
          ),
        )?.[0];
        return button
          ? {
              dataset: {
                visit: button.match(/data-visit="(\d+)"/)![1],
                hall: button.match(/data-hall="(\d+)"/)?.[1],
                pay: button.match(/data-pay="(\d+)"/)?.[1],
              },
              disabled: button.includes('disabled'),
            }
          : null;
      }
      return null;
    },
  };
  const context = createContext({
    dispatchAction,
    save,
    SAVE_KEY,
    lifespanInfo,
    tribulationDue,
    modal,
    FINAL_TRIAL_STAGE,
    structuredClone,
    performance,
    inMarket: true,
    inMortalWorld: true,
    inTown: false,
    game: null,
    pendingRun: run,
    panel: 'sect-auction',
    marketScene: { nearAuction: true },
    saveLock: null,
    lastSaveText: stored,
    auctionView: 'buy',
    auctionKind: 'medicine',
    prepareAuction,
    buyAuction,
    sellAuction,
    auctionBuyReason,
    auctionSellReason,
    auctionContent,
    auctionResult,
    marketEventSource: {
      current: { auctionContent, auctionResult, auctionHallAction, executeAuctionTrade },
    },
    townStatus,
    executeAuctionTrade,
    clearInput: () => {},
    renderSaveLock: () => {},
    toast: (s: string) => messages.push(s),
    document: { getElementById: () => ({ innerHTML: '' }) },
    localStorage: {
      getItem: () => stored,
      setItem(_k: string, v: string) {
        if (fail) throw Error('storage failed');
        stored = v;
      },
    },
  });
  flow.runInContext(context);
  return {
    context,
    save,
    run,
    lot,
    note,
    section,
    messages,
    action: (a: string, id?: string) => context.handleAction(a, id),
    stored: () => JSON.parse(stored),
    fail: (value = true) => {
      fail = value;
    },
    stale: () => {
      stored = JSON.stringify({ ...save, stones: 8000 });
    },
    inputs: (v: { budget?: string; selected?: string; reserve?: string }) => {
      budget = v.budget ?? budget;
      selected = v.selected ?? selected;
      reserve = v.reserve ?? reserve;
    },
  };
}
function treasureHarness() {
  const h = harness(false, {
    setup(save) {
      save.cultivation = Array.from({ length: 18 }, (_, i) => realmCost(i)).reduce(
        (sum, cost) => sum + cost,
        0,
      );
      save.stones = 1000000;
    },
    selectLot: (lot) => lot.kind === 'artifact' && lot.forgeLevel >= 5,
  });
  h.inputs({ budget: String(h.save.stones) });
  assert.equal(auctionBuyReason(h.save, h.lot.index, h.save.mortal.sectMarket!.visit), '');
  return h;
}
test('落拍路由保留临时金额说明，保存失败不展示成功结拍且不新增存档字段', () => {
  const h = harness(false, {
    setup: (save) => {
      save.mortal.population = { seed: 1, since: 15 };
    },
  });
  h.inputs({ budget: '50' });
  const before = h.stored();
  h.fail();
  h.action('auction-buy', '0');
  assert.deepEqual(h.stored(), before);
  assert.equal(h.note.hidden, true);
  h.fail(false);
  h.action('auction-buy', '0');
  assert.match(h.note.textContent, /含费预算 50.*出价 49 ＋手续费 3 ＝ 52.*超出预算/);
  assert.equal(h.save.stones, before.stones);
  assert.equal(h.save.age, before.age + 0.5);
  const receipt = h.stored().mortal.auction.history[0];
  assert.equal(receipt.outcome, 'lost');
  assert.ok(!('budget' in receipt) && !('message' in receipt));
});
test('真实竞拍路由原子写档、半岁一次、闭拍防重入、子区保留滚动位置', () => {
  const h = harness();
  const old = h.save.stones;
  h.action('auction-buy', '0');
  assert.match(h.note.textContent, /竞得/);
  assert.equal(h.note.hidden, false);
  assert.equal(h.section.scrollTop, 123);
  assert.equal(h.save.age, 30.5);
  assert.deepEqual(h.stored().medicine.bag, h.save.medicine.bag);
  assert.ok(h.save.stones < old);
  const current = JSON.stringify(h.save);
  h.action('auction-buy', '0');
  assert.equal(JSON.stringify(h.save), current);
});
test('真实竞拍保存失败及其他窗口写档不扣钱、扣龄或收入拍品', () => {
  for (const f of ['fail', 'stale'] as const) {
    const h = harness();
    const old = JSON.stringify(h.save);
    h[f]();
    h.action('auction-buy', '0');
    assert.equal(JSON.stringify(h.save), old);
    assert.ok(h.messages.length || h.context.saveLock);
    assert.equal(h.note.hidden, true);
  }
});
test('高阶法宝真实竞拍同时保存慧眼识珍，使用结拍年龄且重复点击不重复记年表', () => {
  const h = treasureHarness();
  const age = h.save.age;
  h.action('auction-buy', String(h.lot.index));
  assert.match(h.note.textContent, /竞得/);
  assert.equal(h.save.chronicle.milestones['auction-treasure'], age + 0.5);
  assert.equal(h.save.mortal.auction!.history[0].age, age + 0.5);
  assert.equal(h.save.forge[h.lot.id], h.lot.forgeLevel);
  assert.ok(h.save.artifacts.includes(h.lot.id));
  assert.deepEqual(h.stored().chronicle, h.save.chronicle);
  assert.deepEqual(h.stored().artifacts, h.save.artifacts);
  assert.deepEqual(h.stored().forge, h.save.forge);
  assert.equal(h.stored().stones, h.save.stones);
  assert.equal(h.save.chronicle.entries.filter((e) => e.title === '慧眼识珍').length, 1);
  const before = JSON.stringify(h.save),
    stored = h.stored();
  h.action('auction-buy', String(h.lot.index));
  assert.equal(JSON.stringify(h.save), before);
  assert.deepEqual(h.stored(), stored);
});
test('高阶竞拍保存失败连同成就回滚，恢复存储后原按钮可成功重试', () => {
  const h = treasureHarness();
  const before = structuredClone(h.save),
    stored = h.stored();
  h.fail();
  h.action('auction-buy', String(h.lot.index));
  assert.deepEqual(h.save, before);
  assert.deepEqual(h.stored(), stored);
  assert.equal(Object.hasOwn(h.save.chronicle.milestones, 'auction-treasure'), false);
  assert.match(h.messages.at(-1)!, /拍卖未完成/);
  h.fail(false);
  h.action('auction-buy', String(h.lot.index));
  assert.equal(h.save.chronicle.milestones['auction-treasure'], before.age + 0.5);
  assert.deepEqual(h.stored().chronicle, h.save.chronicle);
  assert.equal(h.save.chronicle.entries.filter((e) => e.title === '慧眼识珍').length, 1);
});
test('高阶竞拍跨窗口冲突不产生幽灵成就，也不覆盖另一窗口的存档', () => {
  const h = treasureHarness();
  const before = structuredClone(h.save);
  h.stale();
  const external = h.stored();
  h.action('auction-buy', String(h.lot.index));
  assert.equal(h.context.saveLock, 'stale');
  assert.deepEqual(h.save, before);
  assert.deepEqual(h.stored(), external);
  assert.equal(Object.hasOwn(h.save.chronicle.milestones, 'auction-treasure'), false);
  h.action('auction-buy', String(h.lot.index));
  assert.deepEqual(h.save, before);
  assert.deepEqual(h.stored(), external);
});
test('真实出售保存失败保留法宝，成功清炼器并保存标记及半岁', () => {
  for (const fail of [true, false]) {
    const h = harness();
    h.action('auction-view', 'sell');
    h.context.auctionKind = 'artifact';
    h.context.refreshAuction('nail');
    h.inputs({ selected: 'nail' });
    const old = JSON.stringify(h.save);
    if (fail) h.fail();
    h.action('auction-sell');
    if (fail) assert.equal(JSON.stringify(h.save), old);
    else {
      assert.equal(h.save.age, 30.5);
      assert.ok(!h.save.artifacts.includes('nail'));
      assert.equal(h.save.forge.nail, 0);
      assert.ok(h.stored().mortal.auction.releasedArtifacts.includes('nail'));
    }
  }
});
test('真实续局可买丹药并保留快照，禁止法宝交易', () => {
  const h = harness(true);
  const snapshot = h.run!.snapshot();
  h.action('auction-buy', '2');
  assert.deepEqual(h.run!.snapshot(), snapshot);
  assert.equal(h.save.age, 30);
  h.action('auction-buy', '0');
  assert.equal(h.save.age, 30.5);
  assert.deepEqual(h.stored().activeRun, JSON.parse(JSON.stringify(snapshot)));
  assert.ok(Game.restore(h.save, h.stored().activeRun));
});
test('流拍只扣半年，预算错误不扣半年', () => {
  const h = harness();
  h.inputs({ budget: '-1' });
  h.action('auction-buy', '0');
  assert.equal(h.save.age, 30);
  assert.match(h.messages[0], /预算/);
  h.action('auction-view', 'sell');
  h.inputs({ selected: h.lot.id, reserve: '99999' });
  const before = h.save.medicine.bag[h.lot.id];
  h.action('auction-sell');
  assert.equal(h.save.age, 30.5);
  assert.equal(h.save.medicine.bag[h.lot.id], before);
  assert.match(h.note.textContent, /未达到保留价/);
});

test('真实会场缴费保存失败或跨窗口冲突零扣费，成功资格跨批保留且重复点不扣', () => {
  for (const failure of ['fail', 'stale', 'none'] as const) {
    const h = harness();
    const before = JSON.stringify(h.save);
    if (failure !== 'none') h[failure]();
    h.action('auction-hall', '1');
    if (failure !== 'none') {
      assert.equal(JSON.stringify(h.save), before);
      continue;
    }
    assert.equal(h.save.stones, 7000);
    assert.equal(h.save.age, 30);
    assert.equal(h.save.mortal.auction!.paidHall, 1);
    assert.equal(h.stored().mortal.auction.paidHall, 1);
    assert.equal(h.section.scrollTop, 123);
    h.action('auction-hall', '1');
    assert.equal(h.save.stones, 7000);
    h.action('auction-hall', '0');
    assert.equal(h.save.mortal.auction!.hall, 0);
  }
});
test('出售页跨会场重置非法种类，界面所见与真实提交一致', () => {
  const h = harness();
  h.action('auction-hall', '1');
  h.action('auction-view', 'sell');
  h.context.auctionKind = 'curio';
  h.context.refreshAuction();
  h.action('auction-hall', '0');
  assert.equal(h.context.auctionKind, 'medicine');
  h.inputs({ selected: h.lot.id, reserve: '1' });
  h.action('auction-sell');
  assert.equal(h.save.age, 30.5);
  h.context.auctionKind = 'iron';
  h.context.refreshAuction();
  h.action('auction-hall', '1');
  assert.equal(h.context.auctionKind, 'medicine');
});
