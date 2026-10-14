import test from 'node:test';
import assert from 'node:assert/strict';
import {
  freshSave,
  readSave,
  SAVE_SCHEMA,
  alignStarterWithPath,
  attuneSpiritRoot,
  claimArtifacts,
} from '../src/progress.ts';
import { beginSectMarketVisit } from '../src/sect-market.ts';
import {
  prepareAuction,
  auctionLots,
  auctionValue,
  auctionFee,
  buyAuction,
  sellAuction,
  auctionBuyReason,
  auctionSellReason,
} from '../src/auction.ts';
import { validAuction, type AuctionItem } from '../src/auction-data.ts';
import { marketMedicinePool, MARKET_CULTIVATORS } from '../src/sect-market-data.ts';
import { ROOT_STARTERS, TREASURES, MAX_FORGE_LEVEL } from '../src/data.ts';
import { MEDICINES, medicineMarketValue } from '../src/medicine-data.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';
import { Game } from '../src/game.ts';
import { auctionContent } from '../src/auction-ui.ts';

function fixture(seed = 12345) {
  const save = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  save.runs = 1;
  save.cultivation = 1;
  save.age = 30;
  save.stones = 100000;
  save.mortal.population = { seed, since: 15 };
  beginSectMarketVisit(save);
  prepareAuction(save);
  return save;
}
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
  beginSectMarketVisit(save);
  assert.deepEqual(save.mortal.auction!.closed, []);
  assert.notDeepEqual(auctionLots(save), expected);
});
test('拍品丹药随出售修士境界配置，法宝阶数有上限，免费赠品不零价拍卖', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const save = fixture(seed);
    for (const lot of auctionLots(save)) {
      assert.ok(lot.start > 0);
      assert.ok(lot.forgeLevel < MAX_FORGE_LEVEL);
      if (lot.kind === 'medicine')
        assert.ok(
          MARKET_CULTIVATORS.some((npc) =>
            marketMedicinePool(save.mortal.population!, save.mortal.sectMarket!, npc.id).some(
              (m) => m.id === lot.id,
            ),
          ),
        );
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
    for (let index = 0; index < 4; index++) {
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
  beginSectMarketVisit(save);
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
  assert.equal(permanent.outcome, 'unsold');
  assert.equal(low.medicine.bag.peiying, 1);
  assert.equal(low.age, 30.5);
});
