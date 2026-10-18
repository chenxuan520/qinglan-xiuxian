import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSave, parseSave, readSave, SAVE_SCHEMA } from '../src/progress.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';
import { tradeIron } from '../src/mortal.ts';
import { ironMarket, ironTradeQuote } from '../src/iron-market.ts';
import { ironMarketContent } from '../src/iron-market-ui.ts';
import { validIronMarket } from '../src/iron-market-data.ts';
import {
  beginSectMarketVisit,
  sectMarketDeals,
  sectMarketExchangeReason,
  exchangeSectMedicine,
} from '../src/sect-market.ts';
import { marketCultivators } from '../src/sect-market-data.ts';
import { auctionValue } from '../src/auction-items.ts';
import { freeStarter } from '../src/auction-data.ts';
import { MEDICINES } from '../src/medicine-data.ts';
import { useMedicine } from '../src/medicine.ts';
import { Game } from '../src/game.ts';
import { autoplayChoice } from '../src/autoplay.ts';
import {
  TREASURES,
  ELEMENTS,
  MAX_FORGE_LEVEL,
  SPIRIT_ROOTS,
  rootElementsFor,
} from '../src/data.ts';
import { catalogPanel } from '../src/catalog-ui.ts';
const wealthy = () => {
  const s = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  s.cultivation = 1;
  s.medicine.recipeSeed = 12345;
  s.stones = 100000;
  s.iron = 500;
  s.mortal.population = { seed: 12345, since: 15 };
  return s;
};

test('玄铁按十游戏年补货并保存额度，跨期行情稳定，批量折扣与读档结算一致', () => {
  const s = wealthy(),
    q = ironTradeQuote(s, true, 50);
  assert.equal(q.discount, 10);
  assert.equal(q.total, 1350);
  const before = s.stones;
  assert.equal(tradeIron(s, true, 50, q.period), true);
  assert.equal(s.stones, before - q.total);
  assert.equal(s.iron, 550);
  assert.equal(ironMarket(s).remaining, 50);
  const loaded = importSave(exportSave(s)).save;
  assert.deepEqual(ironMarket(loaded), ironMarket(s));
  assert.deepEqual(parseSave(JSON.stringify(s)).mortal.ironMarket, s.mortal.ironMarket);
  const raw = JSON.stringify(s);
  assert.equal(tradeIron(s, true, 51, q.period), false);
  assert.equal(JSON.stringify(s), raw);
  assert.equal(tradeIron(s, true, 50, q.period), true);
  assert.equal(ironMarket(s).remaining, 0);
  s.age = 24.999;
  assert.equal(ironMarket(s).remaining, 0);
  s.age = 25;
  assert.equal(ironMarket(s).remaining, 100);
  const next = JSON.stringify(s);
  assert.equal(tradeIron(s, true, 1, q.period), false);
  assert.equal(JSON.stringify(s), next);
  assert.equal(tradeIron(s, true, 1, ironMarket(s).period), true);
  assert.equal(ironMarket(s).remaining, 99);
  assert.match(ironMarketContent(s), /35 岁补货并调整行情/);
});
test('玄铁全行情均不能买入后倒卖套利，拒绝非法数量、溢出和不足，不部分扣账', () => {
  const points = [];
  for (let period = 0; period < 30; period++) {
    const s = wealthy();
    s.age = 15 + period * 10;
    points.push(ironMarket(s).buy);
    for (const n of [1, 10, 49, 50, 100])
      assert.ok(ironTradeQuote(s, true, n).total > ironTradeQuote(s, false, n).total);
    for (const n of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
      const text = JSON.stringify(s);
      assert.equal(tradeIron(s, true, n), false);
      assert.equal(JSON.stringify(s), text);
    }
  }
  assert.ok(new Set(points).size > 1);
  assert.ok(Math.min(...points) * 0.9 > 14);
  const s = wealthy();
  s.stones = 0;
  const text = JSON.stringify(s);
  assert.equal(tradeIron(s, true, 10), false);
  assert.equal(JSON.stringify(s), text);
  s.iron = 0;
  assert.equal(tradeIron(s, false, 1), false);
  assert.equal(validIronMarket({ period: 0, bought: 101 }, 15), false);
  assert.equal(validIronMarket({ period: 2, bought: 1 }, 15), false);
  const old = wealthy();
  old.schema = SAVE_SCHEMA - 1;
  const loaded = readSave(JSON.stringify(old));
  assert.equal(loaded.status, 'ok');
  assert.equal(loaded.save.stones, old.stones);
  assert.equal(ironMarket(loaded.save).remaining, 100);
});
test('互换提供跨品级余丹、丹药组合和法宝组合，全部估值相差不超过15%且不向玩家低价送货', () => {
  const categories = new Set<string>();
  let cross = false;
  for (let visit = 0; visit < 25; visit++) {
    const s = wealthy();
    s.artifacts = TREASURES.map((t) => t.id);
    for (const t of TREASURES) s.forge[t.id] = visit % 4;
    for (const m of MEDICINES) s.medicine.bag[m.id] = 100;
    beginSectMarketVisit(s);
    s.mortal.sectMarket!.visit = visit + 1;
    for (const npc of marketCultivators(s.mortal.population!, s.mortal.sectMarket!)) {
      const deals = sectMarketDeals(s, npc.id);
      assert.ok(deals.length > 0 && deals.length <= 9);
      assert.equal(new Set(deals.map((d) => d.id)).size, deals.length);
      for (const d of deals) {
        categories.add(d.category);
        assert.equal(
          d.giveValue,
          d.give.reduce((n, i) => n + auctionValue(i), 0),
        );
        assert.ok(d.giveValue >= d.receiveValue && d.giveValue * 100 <= d.receiveValue * 115);
        assert.ok(!d.give.some((i) => i.kind === 'artifact' && i.id === s.starter));
        const received = MEDICINES.find((m) => m.id === d.receive.id)!;
        if (
          d.give.some(
            (i) =>
              i.kind === 'medicine' && MEDICINES.find((m) => m.id === i.id)!.tier !== received.tier,
          )
        )
          cross = true;
      }
      assert.deepEqual(sectMarketDeals(s, npc.id), deals);
    }
  }
  assert.deepEqual([...categories].sort(), ['artifact', 'medicine', 'medicines', 'mixed']);
  assert.equal(cross, true);
});
test('法宝加余丹交易全量扣账并清炼器，失败/过期/续局不部分扣；入门赠品不靠读档补回', () => {
  const s = wealthy();
  s.artifacts = TREASURES.map((t) => t.id);
  for (const t of TREASURES) s.forge[t.id] = 1;
  for (const m of MEDICINES) s.medicine.bag[m.id] = 100;
  beginSectMarketVisit(s);
  const npc = marketCultivators(s.mortal.population!, s.mortal.sectMarket!)[0],
    deal = sectMarketDeals(s, npc.id).find((d) => d.category === 'mixed')!;
  assert.ok(deal);
  const before = JSON.stringify(s);
  assert.match(
    sectMarketExchangeReason(s, npc.id, deal.id, s.mortal.sectMarket!.visit, true),
    /未完成/,
  );
  assert.equal(exchangeSectMedicine(s, npc.id, deal.id, s.mortal.sectMarket!.visit, true), false);
  assert.equal(JSON.stringify(s), before);
  const receivedBefore = s.medicine.bag[deal.receive.id],
    old = structuredClone(s);
  assert.equal(exchangeSectMedicine(s, npc.id, deal.id, s.mortal.sectMarket!.visit), true);
  for (const i of deal.give)
    if (i.kind === 'artifact') {
      assert.ok(!s.artifacts.includes(i.id));
      assert.equal(s.forge[i.id], 0);
      assert.ok(!parseSave(JSON.stringify(s)).artifacts.includes(i.id));
    } else assert.equal(s.medicine.bag[i.id], old.medicine.bag[i.id] - i.quantity);
  assert.equal(s.medicine.bag[deal.receive.id], receivedBefore + deal.receive.quantity);
  assert.equal(s.age, old.age);
  assert.equal(s.stones, old.stones);
  assert.deepEqual(importSave(exportSave(s)).save.medicine, s.medicine);
});
test('补天丹保留任意本命法宝、炼器和五行，收束为天灵根后实际开局仍使用原法宝', () => {
  for (const element of ELEMENTS)
    for (const path of ['orthodox', 'demonic', 'dual'] as const) {
      const s = freshSave('variant', [element.id], path, () => 0.5);
      s.medicine.bag.butian = 1;
      const t = TREASURES.find(
        (t) => t.element === element.id && (path === 'dual' || t.school === path),
      )!;
      s.starter = t.id;
      s.artifacts.push(t.id);
      s.forge[t.id] = MAX_FORGE_LEVEL;
      assert.equal(useMedicine(s, 'butian', false, 1, () => 0.999).ok, true);
      assert.equal(s.spiritRoot, 'heaven');
      assert.deepEqual(s.rootElements, [element.id]);
      assert.equal(s.starter, t.id);
      assert.equal(s.forge[t.id], MAX_FORGE_LEVEL);
      assert.equal(new Game(parseSave(JSON.stringify(s)), 0, 0).weapons[0].id, t.id);
    }
  for (const root of SPIRIT_ROOTS.filter((r) => r.id !== 'heaven')) {
    const s = freshSave(root.id, rootElementsFor(root.id), 'dual', () => 0.5);
    s.starter = 'qin';
    s.artifacts.push('qin');
    s.medicine.bag.butian = 1;
    assert.equal(useMedicine(s, 'butian').ok, true);
    assert.equal(s.rootElements[0], 'water');
    assert.equal(s.starter, 'qin');
  }
});
test('青莲灯只稍后于优选法宝，仍胜普通候选，不触发额外重抽；本命与觉醒维持优先', () => {
  const s = wealthy(),
    g = new Game(s, 0, 0);
  g.player.hp = g.player.maxHp;
  g.choices = [
    { type: 'weapon', id: 'orbit', level: 1 },
    { type: 'weapon', id: 'sword', level: 1 },
  ];
  assert.deepEqual(autoplayChoice(g), { index: 1, reroll: false });
  g.choices = [
    { type: 'weapon', id: 'orbit', level: 1 },
    { type: 'weapon', id: 'whip', level: 1 },
  ];
  assert.deepEqual(autoplayChoice(g), { index: 0, reroll: false });
  g.choices = [
    { type: 'weapon', id: 'orbit', level: 1 },
    { type: 'heal', id: 'heal', level: 1 },
  ];
  assert.deepEqual(autoplayChoice(g), { index: 0, reroll: false });
  g.choices = [
    { type: 'weapon', id: 'orbit', level: 2 },
    { type: 'weapon', id: 'sword', level: 2 },
  ];
  assert.equal(autoplayChoice(g)!.index, 0, '非本命已有青莲灯升级保持原优先级');
  g.choices.reverse();
  assert.equal(autoplayChoice(g)!.index, 0, '已有同级优选法宝保持原同分顺序');
  s.starter = 'orbit';
  g.choices = [
    { type: 'weapon', id: 'orbit', level: 2 },
    { type: 'weapon', id: 'sword', level: 2 },
  ];
  assert.equal(autoplayChoice(g)!.index, 0);
  g.choices.push({ type: 'evolve', id: 'orbit', level: 7 });
  assert.equal(autoplayChoice(g)!.index, 2);
});
test('藏器阁只有已收藏十阶法宝带金框，九阶、未收藏与功法保持各自样式', () => {
  const s = wealthy();
  s.artifacts = ['sword', 'orbit'];
  s.forge = { sword: 10, orbit: 9, fire: 10 };
  const view = {
    panel: 'arsenal' as const,
    catalogTreasures: TREASURES,
    schoolFilter: 'all',
    treasurePage: 0,
    selectedTreasure: 'sword',
    bookTab: 'treasures',
  };
  const html = catalogPanel(s, view).body;
  for (const id of ['sword', 'orbit', 'fire']) {
    const tag = html.match(
      new RegExp(`<button class="[^"]*" data-action="treasure" data-id="${id}"`),
    )?.[0];
    assert.ok(tag);
    assert.equal(tag.includes('is-forged-max'), id === 'sword');
  }
  const detail = catalogPanel(s, { ...view, panel: 'treasure-detail' }).body;
  assert.match(detail, /treasure-detail is-forged-max/);
  assert.match(detail, /炼器圆满/);
});

// 读档会清理损坏的拍卖记录，但保留合法来访状态；互换不能假定记录一定存在。
test('合法坊市档缺少拍卖记录时仍可交换已炼器赠品，读取不补回赠品', () => {
  const s = wealthy();
  s.artifacts = TREASURES.map((t) => t.id);
  for (const t of TREASURES) s.forge[t.id] = 1;
  for (const m of MEDICINES) s.medicine.bag[m.id] = 100;
  let done = false;
  // 来访者按自身用途选货，不依赖第一批恰好收购某件入门赠品。
  for (let visit = 0; visit < 20 && !done; visit++) {
    beginSectMarketVisit(s);
    delete s.mortal.auction;
    const loaded = parseSave(JSON.stringify(s));
    for (const npc of marketCultivators(loaded.mortal.population!, loaded.mortal.sectMarket!)) {
      const deal = sectMarketDeals(loaded, npc.id).find((d) =>
        d.give.some((i) => i.kind === 'artifact' && freeStarter(i.id)),
      );
      if (!deal) continue;
      const item = deal.give.find((i) => i.kind === 'artifact')!;
      assert.equal(
        exchangeSectMedicine(loaded, npc.id, deal.id, loaded.mortal.sectMarket!.visit),
        true,
      );
      assert.ok(loaded.mortal.auction!.releasedArtifacts.includes(item.id));
      assert.ok(!parseSave(JSON.stringify(loaded)).artifacts.includes(item.id));
      done = true;
      break;
    }
  }
  assert.equal(done, true);
});
