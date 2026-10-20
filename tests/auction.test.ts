import { enterNextMarketBatch } from './market-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  freshSave,
  IMMORTAL_CULTIVATION,
  forge,
  forgeCost,
  readSave,
  SAVE_SCHEMA,
  alignStarterWithPath,
  attuneSpiritRoot,
  claimArtifacts,
} from '../src/progress.ts';
import { prepareAuction, auctionValue, auctionFee, auctionSellReason } from '../src/auction.ts';
import { ironMarket, ironTradeQuote } from '../src/iron-market.ts';
import {
  auctionLots,
  buyAuction,
  sellAuction,
  auctionBuyReason,
  auctionNextBid,
} from '../src/auction-trade.ts';
import {
  AUCTION_LOTS,
  AUCTION_CURIO_LOT,
  validAuction,
  type AuctionItem,
} from '../src/auction-data.ts';
import { ROOT_STARTERS, TREASURES, MAX_FORGE_LEVEL } from '../src/data.ts';
import { MEDICINES, medicineMarketValue } from '../src/medicine-data.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';
import { Game } from '../src/game.ts';
import { auctionContent, auctionResult } from '../src/auction-ui.ts';
import { rememberMarketTrade } from '../src/market-relations.ts';
import { marketCultivators } from '../src/sect-market-data.ts';
import {
  marketOpportunity,
  chooseMarketOpportunity,
  settleMarketAmbush,
} from '../src/market-social.ts';
import { MarketAmbushDuel } from '../src/market-ambush.ts';

function fixture(seed = 12345) {
  const save = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  save.runs = 1;
  save.cultivation = 1;
  save.age = 30;
  save.stones = 100000;
  save.mortal.population = { seed, since: 15 };
  enterNextMarketBatch(save);
  prepareAuction(save);
  return save;
}
test('含费预算高于对手成交价仍可能不足下一档，保留原结果并完整解释金额', () => {
  const save = fixture(1);
  const lot = auctionLots(save).find((lot) => lot.id === 'yingxiang')!;
  assert.equal(lot.start, 45);
  const before = structuredClone(save);
  const result = buyAuction(save, lot.index, 50, save.mortal.sectMarket!.visit)!;
  assert.equal(result.outcome, 'lost');
  assert.equal(result.price, 46);
  assert.equal(save.stones, before.stones);
  assert.deepEqual(save.medicine.bag, before.medicine.bag);
  assert.equal(save.age, before.age + 0.5);
  assert.deepEqual(auctionNextBid(lot.start, result.price), {
    step: 3,
    price: 49,
    fee: 3,
    total: 52,
  });
  const note = auctionResult(save, result, { budget: 50, start: lot.start });
  assert.match(note, /含费预算 50/);
  assert.match(note, /出价 49 ＋手续费 3 ＝ 52/);
  assert.match(note, /超出预算.*未扣款/);
  assert.match(auctionResult(save, result), /下一档出价与手续费超出你的预算/);
  const enough = structuredClone(before);
  const won = buyAuction(enough, lot.index, 52, enough.mortal.sectMarket!.visit)!;
  assert.equal(won.outcome, 'won');
  assert.equal(won.price + won.fee, 52);
  assert.equal(enough.stones, before.stones - 52);
});
test('坊市药价按品级及价值分档，药铺凡品价格不变', () => {
  for (const m of MEDICINES) {
    const value = medicineMarketValue(m.id);
    assert.ok(value > 0, `${m.name} 必须有估值`);
    assert.equal(
      auctionValue({ kind: 'medicine', id: m.id, quantity: 3, forgeLevel: 0 }),
      value * 3,
    );
    if (m.tier === '凡品') assert.equal(value, m.price);
    else if (m.tier === '灵品') assert.ok(value >= 240 && value <= 360);
    else if (m.id === 'lingru') assert.equal(value, 3000);
    else if (m.years) assert.ok(value >= 1200 && value <= 2000);
    else assert.ok(value >= 4000);
  }
  assert.ok(medicineMarketValue('butian') > medicineMarketValue('jiuqu'));
  assert.equal(medicineMarketValue('unknown'), 0);
});

test('成交录只接纳真实竞价摊主，访客买家不能绕过校验使历史展示崩溃', () => {
  const save = fixture();
  const lot = auctionLots(save)[0];
  buyAuction(save, 0, lot.start + auctionFee(lot.start), 1);
  const receipt = save.mortal.auction!.history[0];
  receipt.outcome = 'lost';
  receipt.price = lot.start;
  receipt.bidder = 'market-visitor-0';
  assert.equal(validAuction(save.mortal.auction, save.age, save.mortal.sectMarket), false);
  assert.throws(() => importSave(JSON.stringify(save)));
});
test('拍品本批稳定，不随收藏、预算、卖物、关闭或读档重抽；真正重入换批', () => {
  const save = fixture();
  const expected = auctionLots(save);
  save.artifacts = TREASURES.map((t) => t.id);
  save.stones = 999;
  assert.deepEqual(auctionLots(save), expected);
  assert.deepEqual(auctionLots(readSave(JSON.stringify(save)).save), expected);
  save.mortal.auction!.closed = [0];
  enterNextMarketBatch(save);
  assert.deepEqual(save.mortal.auction!.closed, []);
  assert.notDeepEqual(auctionLots(save), expected);
});
test('每批各四件丹药和法宝，低场玄铁占物品位且结拍索引保持，新增拍品可完整结算和读档', () => {
  const save = fixture();
  const lots = auctionLots(save);
  assert.equal(lots.length, 8);
  assert.equal(lots.filter((lot) => lot.kind === 'medicine').length, 4);
  assert.equal(lots.filter((lot) => lot.kind !== 'medicine').length, 4);
  save.mortal.auction!.closed = [0, 2];
  const loaded = importSave(exportSave(save, null)).save;
  assert.deepEqual(auctionLots(loaded), lots);
  assert.match(auctionBuyReason(loaded, 2, 1), /已结拍/);
  for (const lot of lots.filter((lot) => lot.index >= 4)) {
    const before = loaded.age;
    assert.ok(buyAuction(loaded, lot.index, loaded.stones, 1));
    assert.equal(loaded.age, before + 0.5);
    assert.match(auctionBuyReason(loaded, lot.index, 1), /已结拍/);
    assert.equal(buyAuction(loaded, lot.index, loaded.stones, 1), undefined);
    assert.ok(validAuction(loaded.mortal.auction, loaded.age, loaded.mortal.sectMarket));
  }
  const restored = importSave(exportSave(loaded, null)).save;
  assert.deepEqual(restored.mortal.auction, loaded.mortal.auction);
  assert.deepEqual(auctionLots(restored), lots);
  restored.mortal.auction!.closed = lots.map((lot) => lot.index);
  assert.deepEqual(
    importSave(exportSave(restored, null)).save.mortal.auction!.closed,
    restored.mortal.auction!.closed,
  );
  assert.equal(
    validAuction(
      { ...restored.mortal.auction!, closed: [AUCTION_CURIO_LOT] },
      restored.age,
      restored.mortal.sectMarket,
    ),
    false,
  );
  enterNextMarketBatch(restored);
  assert.deepEqual(restored.mortal.auction!.closed, []);
  assert.equal(auctionLots(restored).length, 8);
  assert.notDeepEqual(auctionLots(restored), lots);
});
test('初级场四份丹药排除珍品，物品含批量玄铁且免费赠品不零价拍卖', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const save = fixture(seed);
    for (const lot of auctionLots(save)) {
      assert.ok(lot.start > 0);
      assert.ok(lot.forgeLevel < MAX_FORGE_LEVEL);
      if (lot.kind === 'medicine')
        assert.notEqual(MEDICINES.find((m) => m.id === lot.id)!.tier, '珍品');
    }
  }
});
test('竞拍只扣成交总额、不扣全预算，闭拍不可重复，落拍不扣款不赠物', () => {
  let lost = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const save = fixture(seed);
    const lot = auctionLots(save)[0];
    const before = save.stones;
    const result = buyAuction(save, 0, 10000, 1)!;
    assert.equal(result.outcome, 'won');
    assert.equal(save.stones, before - result.price - result.fee);
    assert.equal(result.fee, auctionFee(result.price));
    assert.equal(save.medicine.bag[lot.id], 1);
    assert.equal(buyAuction(save, 0, 10000, 1), undefined);
    assert.ok(validAuction(save.mortal.auction, save.age, save.mortal.sectMarket));
    const low = fixture(seed);
    const old = JSON.stringify(low.medicine);
    const minimum = lot.start + auctionFee(lot.start);
    const r = buyAuction(low, 0, minimum, 1)!;
    if (r.outcome === 'lost') {
      lost++;
      assert.equal(low.stones, before);
      assert.equal(JSON.stringify(low.medicine), old);
      assert.ok(low.mortal.auction!.closed.includes(0));
    }
  }
  assert.ok(lost > 0, '实际有 NPC 与玩家竞争');
});
test('非法预算、超额数量、过期访次、寿尽和续局交易不修改存档', () => {
  const save = fixture();
  for (const budget of [-1, 0, NaN, Infinity, 100000.1, 100001, Number.MAX_SAFE_INTEGER]) {
    const old = JSON.stringify(save);
    assert.equal(buyAuction(save, 0, budget, 1), undefined);
    assert.equal(JSON.stringify(save), old);
  }
  assert.equal(buyAuction(save, 0, 10000, 2), undefined);
  assert.equal(buyAuction(save, 2, 10000, 1, true), undefined);
  save.tribulationReturn = {};
  assert.match(auctionBuyReason(save, 2, 1), /历练/);
  save.tribulationReturn = null;
  save.age = 100;
  assert.equal(buyAuction(save, 0, 10000, 1), undefined);
});
test('买卖丹药只动库存和灵石，不动药方、已服药效、永久次数，成功和流拍均消耗半年；流拍零损失', () => {
  const save = fixture();
  const lot = auctionLots(save)[0];
  save.medicine.bag[lot.id] = 5;
  save.medicine.active.huanglong = 80;
  save.medicine.used.peiying = 2;
  const snapshot = structuredClone(save.medicine);
  const item: AuctionItem = { kind: 'medicine', id: lot.id, quantity: 5, forgeLevel: 0 };
  const oldStones = save.stones;
  const unsold = sellAuction(save, item, 99999, 1)!;
  assert.equal(unsold.outcome, 'unsold');
  assert.deepEqual(save.medicine, snapshot);
  assert.equal(save.stones, oldStones);
  const sold = sellAuction(save, item, 1, 1)!;
  assert.equal(sold.outcome, 'sold');
  assert.equal(save.medicine.bag[lot.id], 0);
  assert.ok(Object.hasOwn(save.medicine.bag, lot.id));
  assert.equal(save.stones, oldStones + sold.price - sold.fee);
  assert.deepEqual(save.medicine.active, snapshot.active);
  assert.deepEqual(save.medicine.used, snapshot.used);
  assert.deepEqual(save.medicine.recipes, snapshot.recipes);
  assert.equal(save.age, 31);
  assert.equal(sellAuction(save, item, 1, 1), undefined);
});
test('当前本命拒售；其他法宝保留炼器购买，出售移出收藏并清空炼器和掉落', () => {
  const save = fixture();
  assert.match(
    auctionSellReason(save, { kind: 'artifact', id: save.starter, quantity: 1, forgeLevel: 0 }, 1),
    /本命/,
  );
  const lot = auctionLots(save).find((l) => l.kind === 'artifact')!;
  const beforeStarter = save.starter;
  const bought = buyAuction(save, lot.index, 90000, 1)!;
  assert.equal(bought.outcome, 'won');
  assert.ok(save.artifacts.includes(lot.id));
  assert.equal(save.forge[lot.id], lot.forgeLevel);
  assert.equal(save.starter, beforeStarter);
  if (lot.id === save.starter) save.starter = save.artifacts.find((id) => id !== lot.id)!;
  save.artifactDrops = [lot.id];
  const sold = sellAuction(save, lot, 1, 1)!;
  assert.equal(sold.outcome, 'sold');
  assert.ok(!save.artifacts.includes(lot.id));
  assert.ok(!save.artifactDrops.includes(lot.id));
  assert.equal(save.forge[lot.id], 0);
});
test('免费赠品出售后读档、改道、换根均不补副本；必要本命及合法掉落可重新获得', () => {
  const save = fixture();
  save.forge.nail = 1;
  assert.equal(
    sellAuction(save, { kind: 'artifact', id: 'nail', quantity: 1, forgeLevel: 1 }, 1, 1)!.outcome,
    'sold',
  );
  const restored = readSave(JSON.stringify(save)).save;
  assert.ok(!restored.artifacts.includes('nail'));
  assert.equal(restored.forge.nail, 0);
  assert.equal(restored.schema, SAVE_SCHEMA);
  attuneSpiritRoot(restored, 'heaven', ['metal']);
  assert.ok(!restored.artifacts.includes('nail'));
  restored.path = 'demonic';
  alignStarterWithPath(restored);
  assert.equal(restored.starter, 'nail');
  assert.ok(restored.artifacts.includes('nail'));
  assert.ok(!restored.mortal.auction!.releasedArtifacts.includes('nail'));
  const second = fixture();
  second.forge.nail = 1;
  sellAuction(second, { kind: 'artifact', id: 'nail', quantity: 1, forgeLevel: 1 }, 1, 1);
  second.artifactDrops = ['nail'];
  claimArtifacts(second);
  assert.ok(second.artifacts.includes('nail'));
  assert.ok(!second.mortal.auction!.releasedArtifacts.includes('nail'));
  for (const id of Object.values(ROOT_STARTERS).flat())
    assert.equal(auctionValue({ kind: 'artifact', id, quantity: 1, forgeLevel: 0 }), 0);
});
test('拍卖购买后立即转卖不会获利', () => {
  for (let seed = 1; seed <= 100; seed++) {
    for (let index = 0; index < AUCTION_LOTS; index++) {
      const save = fixture(seed);
      const lot = auctionLots(save)[index];
      if (auctionBuyReason(save, index, 1)) continue;
      const bought = buyAuction(save, index, 90000, 1)!;
      if (!bought || bought.outcome !== 'won' || lot.id === save.starter) continue;
      const sold = sellAuction(save, lot, 1, 1)!;
      if (sold?.outcome === 'sold') assert.ok(sold.price - sold.fee < bought.price + bought.fee);
    }
  }
});

test('普通寄售实际出价提高到八折至原估值，净回款与保存一致，小额取整不虚报', () => {
  let overOldMaximum = 0;
  for (let seed = 1; seed <= 64; seed++) {
    for (const item of [
      ...MEDICINES.map(
        (m): AuctionItem => ({ kind: 'medicine', id: m.id, quantity: 1, forgeLevel: 0 }),
      ),
      ...TREASURES.filter((t) => t.id !== 'sword').map(
        (t): AuctionItem => ({ kind: 'artifact', id: t.id, quantity: 1, forgeLevel: 2 }),
      ),
    ]) {
      const save = fixture(seed);
      save.cultivation = IMMORTAL_CULTIVATION;
      save.completed = [0, 1, 2, 3, 4, 5, 6];
      enterNextMarketBatch(save);
      prepareAuction(save);
      save.mortal.auction!.hall = 2;
      if (item.kind === 'medicine') save.medicine.bag[item.id] = 1;
      else {
        if (!save.artifacts.includes(item.id)) save.artifacts.push(item.id);
        save.forge[item.id] = 2;
      }
      const value = auctionValue(item);
      const before = save.stones;
      const r = sellAuction(save, item, 1, save.mortal.sectMarket!.visit)!;
      assert.equal(r.outcome, 'sold', item.id);
      assert.ok(r.price >= Math.floor(value * 0.8) && r.price <= value, item.id);
      assert.equal(r.fee, Math.ceil(r.price * 0.1));
      assert.equal(save.stones - before, r.price - r.fee);
      assert.ok(r.price - r.fee <= Math.floor(value * 0.9));
      if (r.price > value * 0.8) overOldMaximum++;
      const restored = importSave(exportSave(save, null)).save;
      assert.equal(restored.stones, save.stones);
      assert.deepEqual(restored.mortal.auction!.history[0], r);
    }
  }
  assert.ok(overOldMaximum > 100, '必须通过真实报价超过旧八折上限，不能只改估价文案');
});

test('三会场跨年换批买入再卖仍亏损，包含丹药、炼器法宝及玄铁', () => {
  const counts = { medicine: 0, artifact: 0, iron: 0 };
  for (const hall of [0, 1, 2] as const) {
    for (let seed = 1; seed <= 32; seed++) {
      const base = fixture(seed);
      base.cultivation = IMMORTAL_CULTIVATION;
      base.completed = [0, 1, 2, 3, 4, 5, 6];
      base.stones = 1000000;
      enterNextMarketBatch(base);
      prepareAuction(base);
      base.mortal.auction!.hall = hall;
      for (const lot of auctionLots(base)) {
        if (
          lot.kind === 'curio' ||
          lot.id === base.starter ||
          auctionBuyReason(base, lot.index, base.mortal.sectMarket!.visit)
        )
          continue;
        const boughtSave = structuredClone(base);
        const b = buyAuction(
          boughtSave,
          lot.index,
          boughtSave.stones,
          boughtSave.mortal.sectMarket!.visit,
        )!;
        assert.equal(b.outcome, 'won');
        for (const years of [0, 1, 10, 20]) {
          const s = structuredClone(boughtSave);
          s.age += years;
          if (years) {
            enterNextMarketBatch(s);
            prepareAuction(s);
            s.mortal.auction!.hall = hall;
          }
          const r = sellAuction(s, lot, 1, s.mortal.sectMarket!.visit)!;
          assert.equal(r.outcome, 'sold');
          assert.ok(r.price - r.fee < b.price + b.fee, `${hall}/${lot.kind}/${lot.id}/${years}`);
          assert.ok(s.stones < base.stones);
          counts[lot.kind]++;
        }
      }
    }
  }
  for (const count of Object.values(counts)) assert.ok(count > 100, '各类别必须真正成交');
});

test('药铺及九折私下买物不能转售获利，现购玄铁炼器也不能借提高回收价刷钱', () => {
  for (const m of MEDICINES) {
    const value = medicineMarketValue(m.id);
    const maxNet = value - auctionFee(value, true);
    if (m.tier === '凡品') assert.ok(maxNet < m.price);
    assert.ok(maxNet <= Math.max(15, Math.floor(value * 0.9)), `${m.id}私下转药价`);
  }
  for (let level = 0; level < MAX_FORGE_LEVEL; level++) {
    for (const jade of [false, true]) {
      const s = fixture();
      if (jade) {
        s.curios.bag['jade-book'] = 1;
        s.curios.acquired.push('jade-book');
      }
      s.artifacts.push('fire');
      s.forge.fire = level;
      const beforeValue = auctionValue({
        kind: 'artifact',
        id: 'fire',
        quantity: 1,
        forgeLevel: level,
      });
      const cost = forgeCost(level, s);
      // 最低玄铁买价25、50枚起九折，按可用最低单价核算，不拿免费掉落当买入成本。
      s.iron = cost.iron;
      const balance = s.stones;
      assert.ok(forge(s, 'fire'));
      const value = auctionValue({
        kind: 'artifact',
        id: 'fire',
        quantity: 1,
        forgeLevel: level + 1,
      });
      assert.ok(
        value - beforeValue < balance - s.stones + cost.iron * 22.5,
        `炼器${level + 1}/${jade}`,
      );
      assert.ok(value - auctionFee(value, true) <= Math.floor(value * 0.9));
    }
  }
  for (let seed = 1; seed <= 32; seed++) {
    const s = fixture(seed);
    s.medicine.recipeSeed = seed;
    for (const age of [15, 25, 35, 45, 55, 65]) {
      s.age = age;
      const buy = ironTradeQuote(s, true, 50).total / 50;
      assert.ok(buy >= 22.5);
      assert.ok(ironMarket(s).sell * 0.9 < 22.5, '任何周期拍卖净回款都低于最低批买价');
    }
  }
});
test('历史有界，导出导入保留交易与可续局快照；损坏拍卖仅正常读档丢弃字段、导入拒绝', () => {
  const save = fixture();
  const lot = auctionLots(save)[0];
  save.medicine.bag[lot.id] = 20;
  for (let i = 0; i < 16; i++)
    sellAuction(save, { kind: 'medicine', id: lot.id, quantity: 1, forgeLevel: 0 }, 99999, 1);
  assert.equal(save.mortal.auction!.history.length, 12);
  const game = new Game(save, 0, 0, () => 0.5);
  game.pause();
  const imported = importSave(exportSave(save, game));
  assert.deepEqual(imported.save.mortal.auction, save.mortal.auction);
  assert.ok(imported.run);
  const bad = structuredClone(save);
  bad.mortal.auction!.closed = [0, 0];
  assert.ok(!validAuction(bad.mortal.auction, bad.age, bad.mortal.sectMarket));
  const recovered = readSave(JSON.stringify(bad)).save;
  assert.equal(recovered.mortal.auction, undefined);
  assert.equal(recovered.stones, save.stones);
  assert.ok(recovered.mortal.sectMarket);
  assert.throws(() => importSave(JSON.stringify({ ...bad, activeRun: null })), /损坏/);
});
test('视图预算、手续费、当前本命和续局保护可见，无固定标签栏', () => {
  const save = fixture();
  assert.match(auctionContent(save, 'buy', false), /最高预算（含手续费）/);
  assert.match(auctionContent(save, 'sell', false, 'artifact', 'sword'), /当前本命不可出售/);
  assert.match(auctionContent(save, 'buy', true), /请先结束未完成的历练/);
  const free = auctionContent(save, 'sell', false, 'artifact', 'nail');
  assert.match(free, /入门赠品未炼器，无人出价/);
  assert.doesNotMatch(free, /单件收购报价/);
});

test('半年寿元、天劫与未完成事项阻断；供奉先预留，不能靠出售报酬透支', () => {
  for (const kind of ['lifespan', 'tribulation', 'activity', 'dues'] as const) {
    const save = fixture();
    if (kind === 'lifespan') save.age = 99.6;
    if (kind === 'tribulation') save.nextTribulationAge = 30.4;
    if (kind === 'activity')
      save.mortal.activity = { kind: 'tea', remaining: 1, total: 1, sect: null };
    if (kind === 'dues') {
      save.mortal.member = { id: 'power', dues: 50, dueAt: 0.3 };
      save.stones = 49;
    }
    const old = JSON.stringify(save);
    assert.equal(buyAuction(save, 0, 40, 1), undefined);
    assert.equal(JSON.stringify(save), old);
  }
  const save = fixture();
  save.mortal.member = { id: 'power', dues: 50, dueAt: 0.3 };
  save.stones = 10000;
  const old = JSON.stringify(save);
  assert.equal(buyAuction(save, 0, 10000, 1), undefined);
  assert.equal(JSON.stringify(save), old);
  const result = buyAuction(save, 0, 9950, 1)!;
  assert.ok(result);
  assert.equal(save.age, 30.5);
  assert.equal(save.mortal.years, 0.5);
  assert.equal(
    save.stones,
    10000 - 50 - (result.outcome === 'won' ? result.price + result.fee : 0),
  );
  assert.ok(save.mortal.member!.dueAt > 0.5);
});

test('高阶修士可收低阶余丹，携药仍按境界，炼气修士不能接本世永久丹', () => {
  const save = fixture(5);
  save.cultivation = 1e9;
  save.completed = [6];
  enterNextMarketBatch(save);
  prepareAuction(save);
  save.medicine.bag.huanglong = 2;
  const r = sellAuction(
    save,
    { kind: 'medicine', id: 'huanglong', quantity: 1, forgeLevel: 0 },
    1,
    2,
  )!;
  assert.equal(r.outcome, 'sold');
  assert.equal(save.medicine.bag.huanglong, 1);
  const low = fixture(163);
  low.medicine.bag.peiying = 1;
  const permanent = sellAuction(
    low,
    { kind: 'medicine', id: 'peiying', quantity: 1, forgeLevel: 0 },
    1,
    1,
  )!;
  assert.equal(permanent, undefined);
  assert.match(
    auctionSellReason(low, { kind: 'medicine', id: 'peiying', quantity: 1, forgeLevel: 0 }, 1),
    /人字场/,
  );
  assert.equal(low.medicine.bag.peiying, 1);
  assert.equal(low.age, 30);
});

test('重逢买家成交录保存当时姓名，离场换批及读档后仍显示真实旧识而非新槽位修士', () => {
  const s = fixture(1);
  rememberMarketTrade(s, 'market-alchemist');
  enterNextMarketBatch(s);
  enterNextMarketBatch(s);
  const npc = marketCultivators(s.mortal.population!, s.mortal.sectMarket!).find(
    (n) => n.id === 'market-disciple',
  )!;
  assert.equal(npc.name, '谢知秋');
  s.medicine.bag.huxin = 3;
  const result = sellAuction(
    s,
    { kind: 'medicine', id: 'huxin', quantity: 1, forgeLevel: 0 },
    1,
    3,
  )!;
  assert.equal(result.bidder, 'market-disciple');
  assert.equal(result.bidderName, npc.name);
  assert.match(auctionResult(s, result), /谢知秋买下/);
  enterNextMarketBatch(s);
  const loaded = importSave(exportSave(s, null)).save;
  assert.match(auctionResult(loaded, loaded.mortal.auction!.history[0]), /谢知秋买下/);
  assert.ok(validAuction(loaded.mortal.auction, loaded.age, loaded.mortal.sectMarket));
  result.bidderName = '<img src=x onerror=1>';
  assert.equal(
    validAuction({ ...s.mortal.auction!, history: [result] }, s.age, s.mortal.sectMarket),
    false,
  );
  assert.doesNotMatch(auctionResult(s, result), /<img/);
});

test('本批劫修死亡不重排寄售拍品，结拍索引和读档保持，死者不再参与竞价', () => {
  const s = fixture(22),
    before = structuredClone(auctionLots(s));
  const bought = buyAuction(s, 0, s.stones, 1)!;
  assert.equal(bought.outcome, 'won');
  assert.ok(s.mortal.auction!.closed.includes(0));
  const id = 'market-wanderer',
    offer = marketOpportunity(s, id)!;
  assert.equal(offer.kind, 'invitation');
  assert.equal(offer.honest, false);
  assert.ok(chooseMarketOpportunity(s, id, 1, 'accept'));
  const encounter = s.mortal.marketSocial!.ambush!;
  const duel = new MarketAmbushDuel(encounter.stats, encounter.snapshot);
  for (let i = 0; i < 12000 && !duel.outcome; i++) duel.update(1 / 60, { x: 0, y: 0 });
  assert.equal(duel.outcome, 'defeat');
  assert.ok(duel.revive());
  encounter.revivesUsed++;
  for (let i = 0; i < 12000 && !duel.outcome; i++) duel.update(1 / 60, { x: 0, y: 0 });
  assert.equal(duel.outcome, 'victory');
  encounter.snapshot = duel.snapshot();
  assert.ok(settleMarketAmbush(s, 'victory'));
  assert.deepEqual(s.mortal.sectMarket!.absent, [id]);
  assert.deepEqual(auctionLots(s), before);
  const loaded = readSave(JSON.stringify(s)).save;
  assert.deepEqual(auctionLots(loaded), before);
  assert.ok(loaded.mortal.auction!.closed.includes(0));
  const stored = structuredClone(loaded);
  assert.match(auctionBuyReason(loaded, 0, 1), /已结拍/);
  assert.equal(buyAuction(loaded, 0, loaded.stones, 1), undefined);
  assert.deepEqual(loaded, stored);
  loaded.medicine.bag.huxin = 2;
  const sold = sellAuction(
    loaded,
    { kind: 'medicine', id: 'huxin', quantity: 1, forgeLevel: 0 },
    1,
    1,
  )!;
  assert.equal(sold.outcome, 'sold');
  assert.notEqual(sold.bidder, id);
});
