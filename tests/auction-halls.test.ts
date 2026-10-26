import { enterNextMarketBatch } from './market-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSave, realmCost, realmInfo, readSave, SAVE_SCHEMA } from '../src/progress.ts';
import { beginSectMarketVisit } from '../src/sect-market.ts';
import {
  auctionHallLimit,
  selectAuctionHall,
  auctionSellReason,
  prepareAuction,
} from '../src/auction.ts';
import { auctionLots, auctionBuyReason, buyAuction, sellAuction } from '../src/auction-trade.ts';
import {
  AUCTION_HALLS,
  AUCTION_CURIO_LOT,
  AUCTION_IRON_LOT,
  AUCTION_PREMIUM_MIN_VALUE,
  validAuction,
  type AuctionItem,
} from '../src/auction-data.ts';
import { MEDICINES, medicineInfo, medicineMarketValue } from '../src/medicine-data.ts';
import { ironMarket } from '../src/iron-market.ts';
import { IRON_MARKET_LIMIT } from '../src/iron-market-data.ts';
import { curioCycle, grantCurio, prepareCurioConsignment } from '../src/curio-data.ts';
import { importSave, exportSave } from '../src/save-transfer.ts';
import { auctionContent } from '../src/auction-ui.ts';
import { auctionValue } from '../src/auction-items.ts';
import { TREASURES, evolutionPassives, passive, pathInfo } from '../src/data.ts';

function fixture(realm = 0, seed = 12345) {
  const s = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  s.cultivation = realm
    ? Array.from({ length: realm * 3 }, (_, n) => realmCost(n)).reduce((a, b) => a + b, 0)
    : 1;
  if (realm === 8) s.completed = [0, 1, 2, 3, 4, 5, 6];
  assert.equal(realmInfo(s.cultivation, realm === 8).index, realm);
  s.age = 30;
  s.stones = 1000000;
  s.mortal.population = { seed, since: 15 };
  beginSectMarketVisit(s);
  prepareAuction(s);
  return s;
}
const iron = (quantity: number): AuctionItem => ({
  kind: 'iron',
  id: 'iron',
  quantity,
  forgeLevel: 0,
});
const curio: AuctionItem = { kind: 'curio', id: 'soul-wood', quantity: 1, forgeLevel: 0 };

test('四类委托库存耗尽仍停留所选物品，禁用出售并保留其他手动选项', () => {
  for (const kind of ['medicine', 'artifact', 'curio', 'iron'] as const) {
    const s = fixture(kind === 'curio' ? 3 : 0);
    s.medicine.bag = { huanglong: 0, jinsui: 1 };
    s.artifacts = ['sword'];
    s.curios.bag = { 'jade-book': 1 };
    s.iron = 0;
    const id = { medicine: 'huanglong', artifact: 'pagoda', curio: 'soul-wood', iron: 'iron' }[
      kind
    ];
    const before = JSON.stringify(s);
    const html = auctionContent(s, 'sell', false, kind, id);
    const choices = html.match(/<select id="auction-item"[^>]*>([^]*?)<\/select>/)![1];
    assert.equal(choices.match(/<option value="([^"]+)" selected/)?.[1], id);
    assert.match(html.match(/<button[^>]*data-action="auction-sell"[^>]*>/)![0], /disabled/);
    if (kind !== 'iron') assert.ok((choices.match(/<option /g)?.length ?? 0) >= 2);
    assert.equal(
      sellAuction(
        s,
        { kind, id, quantity: kind === 'iron' ? 150 : 1, forgeLevel: 0 },
        1,
        s.mortal.sectMarket!.visit,
      ),
      undefined,
    );
    assert.equal(JSON.stringify(s), before);
  }
});

test('九境门槛读取实时境界，低不能越级、高可回低，付费资格另行保存', () => {
  for (let realm = 0; realm <= 8; realm++) {
    const s = fixture(realm);
    assert.equal(auctionHallLimit(s), Math.min(2, Math.floor(realm / 3)));
    for (let hall = 0; hall < 3; hall++) {
      const before = structuredClone(s);
      const reason = selectAuctionHall(s, hall, 1);
      if (hall > Math.floor(realm / 3)) {
        assert.ok(reason);
        assert.deepEqual(s, before);
      } else {
        assert.equal(reason, '');
        assert.equal(s.stones, before.stones);
        assert.equal(s.age, before.age);
      }
    }
  }
  const s = fixture();
  s.mortal.sectMarket!.realmIndex = 7;
  assert.ok(selectAuctionHall(s, 2, 1));
  s.cultivation = fixture(3).cultivation;
  assert.equal(selectAuctionHall(s, 1, 1), '');
  s.cultivation = 1;
  const before = structuredClone(s);
  assert.match(auctionBuyReason(s, 8, 1), /资格/);
  assert.equal(buyAuction(s, 8, s.stones, 1), undefined);
  assert.equal(sellAuction(s, curio, 1, 1), undefined);
  assert.deepEqual(s, before);
});

test('一次缴费中级3000、高级10000，高级含中级，重复点击与跨批不再扣费', () => {
  const s = fixture();
  const age = s.age;
  const initial = s.stones;
  assert.equal(selectAuctionHall(s, 1, 1, true), '');
  assert.equal(s.stones, initial - 3000);
  assert.equal(s.mortal.auction!.paidHall, 1);
  assert.equal(selectAuctionHall(s, 1, 1, true), '');
  assert.equal(s.stones, initial - 3000);
  assert.equal(selectAuctionHall(s, 2, 1, true), '');
  assert.equal(s.stones, initial - 13000);
  assert.equal(s.mortal.auction!.paidHall, 2);
  assert.equal(selectAuctionHall(s, 1, 1), '');
  assert.equal(s.age, age);
  const restored = importSave(exportSave(s, null)).save;
  assert.equal(restored.mortal.auction!.paidHall, 2);
  enterNextMarketBatch(restored);
  assert.equal(restored.mortal.auction!.hall, 2);
  assert.equal(selectAuctionHall(restored, 1, 2, true), '');
  assert.equal(restored.stones, s.stones);
  assert.equal(freshSave().mortal.auction?.paidHall, undefined);
  for (const hall of [-1, 0.5, 3, NaN, Infinity]) {
    const before = structuredClone(s);
    assert.ok(selectAuctionHall(s, hall, 1, true));
    assert.deepEqual(s, before);
  }
  s.stones = 2999;
  delete s.mortal.auction!.paidHall;
  const before = structuredClone(s);
  assert.ok(selectAuctionHall(s, 1, 1, true));
  assert.deepEqual(s, before);
  assert.ok(selectAuctionHall(s, 2, 999, true));
  assert.deepEqual(s, before);
});

test('每场严格四丹四物，百种种子验证品级、法宝阶数、低场玄铁与中高奇物', () => {
  let permanent = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const s = fixture(6, seed);
    s.curios.consignment = { cycle: curioCycle(s.age), id: 'soul-wood', closed: false };
    delete s.mortal.auction!.curioSlot;
    prepareAuction(s);
    for (let hall = 0; hall < 3; hall++) {
      assert.equal(selectAuctionHall(s, hall, 1), '');
      const lots = auctionLots(s);
      assert.equal(lots.length, 8);
      assert.equal(lots.filter((l) => l.kind === 'medicine').length, 4);
      assert.equal(lots.filter((l) => l.kind !== 'medicine').length, 4);
      assert.equal(new Set(lots.map((l) => l.index)).size, 8);
      for (const lot of lots) {
        if (lot.kind === 'medicine') {
          const m = medicineInfo(lot.id)!;
          if (!hall) assert.notEqual(m.tier, '珍品');
          if (hall === 1) assert.ok(m.years > 0 && m.tier !== '凡品');
          if (hall === 2) {
            assert.equal(m.tier, '珍品');
            permanent += Number(m.years === 0);
          }
        } else if (lot.kind === 'artifact') {
          assert.ok(lot.forgeLevel >= [0, 3, 6][hall] && lot.forgeLevel <= [2, 6, 10][hall]);
        }
      }
      assert.equal(
        lots.some((l) => l.kind === 'curio'),
        hall > 0,
      );
      const ore = lots.find((l) => l.kind === 'iron');
      assert.equal(!!ore, hall === 0);
      if (ore)
        assert.ok(ore.quantity > IRON_MARKET_LIMIT && ore.quantity >= 150 && ore.quantity <= 250);
      assert.deepEqual(auctionLots(s), lots);
      assert.deepEqual(auctionLots(importSave(exportSave(s, null)).save), lots);
    }
  }
  assert.ok(permanent > 0 && permanent < 100);
});

test('切场保留各场结拍，重进才换常规拍品，奇物共享十年结拍且旧场按钮无效', () => {
  let s = fixture(6);
  s.curios.consignment = { cycle: curioCycle(s.age), id: 'soul-wood', closed: false };
  delete s.mortal.auction!.curioSlot;
  prepareAuction(s);
  selectAuctionHall(s, 0, 1);
  const low = auctionLots(s);
  buyAuction(s, 0, s.stones, 1);
  selectAuctionHall(s, 1, 1);
  const middle = auctionLots(s);
  assert.equal(buyAuction(s, 0, s.stones, 1), undefined);
  buyAuction(s, 8, s.stones, 1);
  const lost = buyAuction(
    s,
    AUCTION_CURIO_LOT,
    1.05 * middle.find((l) => l.kind === 'curio')!.start,
    1,
    false,
    curioCycle(s.age),
  )!;
  assert.ok(lost);
  assert.equal(s.curios.consignment!.closed, true);
  selectAuctionHall(s, 2, 1);
  assert.match(auctionBuyReason(s, AUCTION_CURIO_LOT, 1), /已结拍|不存在/);
  assert.equal(buyAuction(s, AUCTION_CURIO_LOT, s.stones, 1, false, curioCycle(s.age)), undefined);
  selectAuctionHall(s, 0, 1);
  assert.deepEqual(auctionLots(s), low);
  assert.match(auctionBuyReason(s, 0, 1), /已结拍/);
  s = importSave(exportSave(s, null)).save;
  selectAuctionHall(s, 1, 1);
  assert.match(auctionBuyReason(s, 8, 1), /已结拍/);
  assert.deepEqual(
    auctionLots(s).filter((l) => l.kind !== 'curio'),
    middle.filter((l) => l.kind !== 'curio'),
  );
  enterNextMarketBatch(s);
  assert.deepEqual(s.mortal.auction!.closed, []);
  assert.equal(s.curios.consignment!.closed, true);
});

test('低场拒收所有珍品和奇物，中高拒收玄铁，越权交易零修改', () => {
  const s = fixture();
  s.curios.bag['soul-wood'] = 1;
  s.curios.acquired = ['soul-wood'];
  for (const m of MEDICINES.filter((m) => m.tier === '珍品')) {
    s.medicine.bag[m.id] = 5;
    const item: AuctionItem = { kind: 'medicine', id: m.id, quantity: 1, forgeLevel: 0 };
    const before = structuredClone(s);
    assert.match(auctionSellReason(s, item, 1), /人字场/);
    assert.equal(sellAuction(s, item, 1, 1), undefined);
    assert.deepEqual(s, before);
  }
  assert.match(auctionSellReason(s, curio, 1), /人字场/);
  s.iron = 500;
  selectAuctionHall(s, 2, 1, true);
  const before = structuredClone(s);
  assert.equal(buyAuction(s, AUCTION_IRON_LOT, s.stones, 1), undefined);
  assert.match(auctionSellReason(s, iron(150), 1), /人字场/);
  assert.equal(sellAuction(s, iron(150), 1, 1), undefined);
  assert.deepEqual(s, before);
  assert.doesNotMatch(auctionContent(s, 'sell', false, 'iron'), /value="iron"/);
});

test('玄铁批量竞买、委托、流拍、存取与防溢出；任何十年行情买入再卖均亏损', () => {
  for (let seed = 1; seed <= 32; seed++) {
    const s = fixture(0, seed);
    const lot = auctionLots(s).find((l) => l.kind === 'iron')!;
    const bought = buyAuction(s, lot.index, s.stones, 1, true)!;
    assert.equal(bought.outcome, 'won');
    assert.equal(s.iron, lot.quantity);
    assert.match(auctionBuyReason(s, lot.index, 1), /已结拍/);
    const restored = importSave(exportSave(s, null)).save;
    assert.deepEqual(restored.mortal.auction!.history[0], bought);
    for (let period = 0; period < 6; period++) {
      const next = structuredClone(s);
      next.age = 30 + period * 10;
      next.nextTribulationAge = 0;
      const sold = sellAuction(next, iron(lot.quantity), 1, 1, true)!;
      assert.equal(sold.outcome, 'sold');
      assert.equal(next.iron, 0);
      assert.ok(sold.price <= ironMarket(next).sell * lot.quantity);
      assert.ok(sold.price - sold.fee < bought.price + bought.fee);
      assert.ok(validAuction(next.mortal.auction, next.age, next.mortal.sectMarket));
    }
    const before = structuredClone(s);
    assert.equal(sellAuction(s, iron(149), 1, 1), undefined);
    assert.equal(sellAuction(s, iron(9999), 1, 1), undefined);
    assert.deepEqual(s, before);
    const unsold = sellAuction(s, iron(lot.quantity), 999999, 1)!;
    assert.equal(unsold.outcome, 'unsold');
    assert.equal(s.iron, before.iron);
    assert.equal(s.stones, before.stones);
    assert.equal(s.age, before.age + 0.5);
    enterNextMarketBatch(s);
    s.iron = Number.MAX_SAFE_INTEGER;
    const frozen = structuredClone(s);
    assert.equal(buyAuction(s, AUCTION_IRON_LOT, s.stones, 2), undefined);
    assert.deepEqual(s, frozen);
  }
});

test('旧档保留已结拍、成交姓名和已售赠品，迁移与导入共用', () => {
  const s = fixture();
  buyAuction(s, 0, s.stones, 1);
  s.mortal.auction!.releasedArtifacts = ['fire'];
  const old = JSON.parse(JSON.stringify(s));
  old.schema = 25;
  delete old.mortal.auction.hall;
  for (const receipt of old.mortal.auction.history) delete receipt.hall;
  for (const restored of [
    readSave(JSON.stringify(old)).save,
    importSave(JSON.stringify(old)).save,
  ]) {
    assert.equal(restored.schema, SAVE_SCHEMA);
    assert.deepEqual(restored.mortal.auction!.closed, [0, 8, 16]);
    assert.deepEqual(restored.mortal.auction!.releasedArtifacts, ['fire']);
    assert.equal(restored.mortal.auction!.history.length, 1);
    assert.equal(restored.mortal.auction!.history[0].hall, 0);
    assert.match(auctionBuyReason(restored, 0, 1), /已结拍/);
  }
  for (const bad of [3, -1, 0.5, '2']) {
    const copy = structuredClone(s);
    copy.mortal.auction!.paidHall = bad as 2;
    assert.equal(validAuction(copy.mortal.auction, copy.age, copy.mortal.sectMarket), false);
    assert.throws(() => importSave(JSON.stringify(copy)));
  }
});

test('一年内反复进入、读档保留修士/额度/结拍；满一年才换，切场不推进换批', () => {
  let s = fixture(6);
  s.mortal.sectMarket!.exchanged.push('market-disciple');
  s.mortal.marketSocial!.fulfilled.push('market-alchemist');
  s.mortal.auction!.closed.push(16);
  const initial = structuredClone(s);
  for (let i = 0; i < 5; i++) {
    assert.ok(beginSectMarketVisit(s));
    assert.deepEqual(s, initial);
  }
  s.age += 0.999;
  const before = structuredClone(s);
  assert.ok(beginSectMarketVisit(s));
  assert.equal(s.mortal.sectMarket!.lastVisitAge, s.age);
  before.mortal.sectMarket!.lastVisitAge = s.age;
  assert.deepEqual(s, before);
  s = importSave(exportSave(s, null)).save;
  assert.equal(beginSectMarketVisit(s), true);
  assert.deepEqual(s.mortal.sectMarket, before.mortal.sectMarket);
  assert.deepEqual(s.mortal.auction, before.mortal.auction);
  s.age = initial.age + 1;
  assert.equal(beginSectMarketVisit(s), true);
  assert.equal(s.mortal.sectMarket!.visit, 2);
  assert.equal(s.mortal.sectMarket!.openedAt, s.age);
  assert.deepEqual(s.mortal.sectMarket!.exchanged, []);
  assert.deepEqual(s.mortal.marketSocial!.fulfilled, []);
  assert.deepEqual(s.mortal.auction!.closed, []);
});
test('奇物占位跨十年固定，其他来源获得及售出后不补法宝，本批无奇物也不临时加拍', () => {
  for (const source of ['buy', 'grant']) {
    const s = fixture(6);
    s.curios.consignment = { cycle: curioCycle(s.age), id: 'soul-wood', closed: false };
    delete s.mortal.auction!.curioSlot;
    prepareAuction(s);
    selectAuctionHall(s, 1, 1);
    if (source === 'buy')
      assert.equal(
        buyAuction(s, AUCTION_CURIO_LOT, s.stones, 1, false, curioCycle(s.age))!.outcome,
        'won',
      );
    else assert.equal(grantCurio(s, 'soul-wood'), true);
    for (const hall of [1, 2]) {
      selectAuctionHall(s, hall, 1);
      assert.equal(auctionLots(s).length, 7);
      assert.equal(buyAuction(s, hall * 8 + 7, s.stones, 1), undefined);
      assert.match(auctionContent(s, 'buy', false), /本席寄拍已结束/);
    }
    s.age += 10;
    prepareCurioConsignment(s);
    prepareAuction(s);
    assert.equal(auctionLots(s).length, 7);
    assert.equal(s.mortal.auction!.curioSlot!.id, 'soul-wood');
    assert.deepEqual(importSave(exportSave(s, null)).save.mortal.auction, s.mortal.auction);
  }
  const s = fixture(6);
  s.mortal.auction!.curioSlot = null;
  const original = auctionLots(s);
  s.age += 10;
  s.curios.consignment = { cycle: curioCycle(s.age), id: 'soul-wood', closed: false };
  prepareAuction(s);
  assert.deepEqual(auctionLots(s), original);
});

test('会场新名称贯穿门槛、拒绝原因与历史，编号和入场费用不变', () => {
  assert.deepEqual(
    AUCTION_HALLS.map((h) => h.name),
    ['人字场', '地字场', '天字场'],
  );
  assert.deepEqual(
    AUCTION_HALLS.map((h) => h.admission),
    [0, 3000, 10000],
  );
  const s = fixture();
  assert.match(selectAuctionHall(s, 1, 1), /地字场/);
  assert.match(selectAuctionHall(s, 2, 1), /天字场/);
  const r = buyAuction(s, 0, s.stones, 1)!;
  const html = auctionContent(s, 'history', false);
  assert.equal(r.hall, 0);
  assert.match(html, /人字场/);
  assert.doesNotMatch(html, /初级会场|中级会场|高级会场/);
});

test('同批四丹去重，保持各槽品级、本世珍品触发、估值与交易后的稳定性', () => {
  let permanent = 0;
  for (let seed = 0; seed < 200; seed++) {
    const s = fixture(6, seed);
    for (let hall = 0; hall < 3; hall++) {
      selectAuctionHall(s, hall, 1);
      const lots = auctionLots(s);
      const meds = lots.filter((l) => l.kind === 'medicine');
      assert.equal(meds.length, 4);
      assert.equal(new Set(meds.map((m) => m.id)).size, 4);
      for (const lot of meds) {
        const slot = lot.index % 8;
        const m = medicineInfo(lot.id)!;
        assert.equal(
          m.tier,
          hall === 0
            ? slot % 4 === 0
              ? '凡品'
              : '灵品'
            : hall === 1 && slot !== 5
              ? '灵品'
              : '珍品',
        );
        assert.equal(lot.quantity, 1);
        assert.equal(lot.start, medicineMarketValue(lot.id));
        if (m.years === 0) {
          assert.equal(hall, 2);
          assert.equal(slot, 5);
          permanent++;
        }
      }
      const before = structuredClone(s);
      const bought = buyAuction(s, meds[1].index, s.stones, 1)!;
      assert.equal(bought.outcome, 'won');
      assert.deepEqual(auctionLots(s), lots, '购买不重排其余拍品');
      assert.deepEqual(auctionLots(importSave(exportSave(s, null)).save), lots);
      Object.assign(s, before);
    }
  }
  assert.equal(permanent, 55, '200个固定种子的既有本世珍品触发数量不变');
});

test('各会场同批法宝品种不重复，炼器范围和估值准确，竞买读档不重排', () => {
  for (let seed = 0; seed < 200; seed++) {
    const s = fixture(6, seed);
    for (const hall of [0, 1, 2] as const) {
      selectAuctionHall(s, hall, 1);
      const lots = auctionLots(s);
      const artifacts = lots.filter((lot) => lot.kind === 'artifact');
      if (hall === 2)
        assert.ok(
          lots.every((lot) => lot.start >= AUCTION_PREMIUM_MIN_VALUE),
          '天字场起拍至少1000灵石',
        );
      assert.equal(
        new Set(artifacts.map((lot) => lot.id)).size,
        artifacts.length,
        `${seed}/${hall}`,
      );
      for (const lot of artifacts) {
        assert.ok(lot.forgeLevel >= AUCTION_HALLS[hall].forgeMin);
        assert.ok(lot.forgeLevel <= AUCTION_HALLS[hall].forgeMax);
        assert.equal(lot.quantity, 1);
        assert.equal(lot.start, auctionValue(lot));
      }
      const original = structuredClone(s);
      const bought = buyAuction(s, artifacts[0].index, s.stones, 1)!;
      assert.equal(bought.outcome, 'won');
      assert.deepEqual(auctionLots(s), lots);
      assert.deepEqual(auctionLots(importSave(exportSave(s, null)).save), lots);
      Object.assign(s, original);
    }
  }
});

test('旧已结拍药槽保留原成交物品和结拍索引，不按新去重药品改写历史', () => {
  const s = fixture(6);
  selectAuctionHall(s, 0, 1);
  s.age = 30.5;
  s.medicine.bag.zengyuan = 1;
  s.mortal.auction!.closed = [5];
  s.mortal.auction!.history = [
    {
      kind: 'medicine',
      id: 'zengyuan',
      quantity: 1,
      forgeLevel: 0,
      hall: 0,
      visit: 1,
      realmIndex: 6,
      age: 30.5,
      outcome: 'won',
      price: 403,
      fee: 21,
      bidder: 'player',
    },
  ];
  const old = structuredClone(s);
  for (const restored of [readSave(JSON.stringify(s)).save, importSave(exportSave(s, null)).save]) {
    assert.deepEqual(restored.mortal.auction!.closed, [5]);
    assert.deepEqual(restored.mortal.auction!.history, old.mortal.auction!.history);
    assert.deepEqual(restored.medicine.bag, old.medicine.bag);
    assert.notEqual(auctionLots(restored).find((l) => l.index === 5)!.id, 'zengyuan');
    assert.match(auctionBuyReason(restored, 5, 1), /已结拍/);
    assert.equal(buyAuction(restored, 5, restored.stones, 1), undefined);
    assert.match(auctionContent(restored, 'history', false), /增元丹/);
    const card = auctionContent(restored, 'buy', false)
      .split('data-closed-index="5">')[1]
      .split('</article>')[0];
    assert.match(card, /增元丹 ×1/);
    assert.match(card, /竞得增元丹/);
    assert.ok(!card.includes('auction-budget-5'));
  }
});

test('去重后的药品仍按原估值竞买和回收，不可通过竞买再出售套利', () => {
  let checked = 0;
  for (let seed = 0; seed < 32; seed++) {
    const initial = fixture(6, seed);
    for (let hall = 0; hall < 3; hall++) {
      selectAuctionHall(initial, hall, 1);
      for (const lot of auctionLots(initial).filter((l) => l.kind === 'medicine')) {
        const s = structuredClone(initial);
        const bought = buyAuction(s, lot.index, s.stones, 1)!;
        assert.equal(bought.outcome, 'won');
        const sold = sellAuction(s, lot, 1, 1)!;
        assert.equal(sold.outcome, 'sold');
        assert.ok(sold.price - sold.fee < bought.price + bought.fee);
        assert.ok(s.stones < initial.stones);
        checked++;
      }
    }
  }
  assert.equal(checked, 384);
});

test('法宝竞拍卡原地鉴宝列明攻击方式、两种配套及正确的纯修兼修觉醒限制', () => {
  const checked = new Set<string>();
  for (let seed = 0; seed < 200 && checked.size < TREASURES.length; seed++) {
    const s = fixture(6, seed);
    selectAuctionHall(s, 2, 1);
    const cards = auctionContent(s, 'buy', false).split('<article class="auction-card">').slice(1);
    for (const lot of auctionLots(s).filter((lot) => lot.kind === 'artifact')) {
      if (checked.has(lot.id)) continue;
      const t = TREASURES.find((t) => t.id === lot.id)!;
      const card = cards.find((card) => card.includes(`<h3>${t.name} ×1</h3>`))!;
      assert.match(card, /<details class="auction-inspection"><summary>鉴宝 · 攻击与配套/);
      assert.ok(card.includes(t.desc));
      assert.ok(card.includes(t.tag));
      assert.ok(card.includes(t.evolution));
      for (const id of evolutionPassives(t)) assert.ok(card.includes(passive(id).name));
      assert.ok(card.includes(`${pathInfo(t.school).name}或兼修路线可领悟此宝、设为本命`));
      assert.match(card, /法宝六重与任一配套功法五重/);
      assert.match(card, /纯修仅可用本流派功法，兼修可任选配套功法/);
      assert.match(card, /炼器阶数不代替局内重数/);
      checked.add(t.id);
    }
  }
  assert.equal(checked.size, TREASURES.length);
});

test('新去重药槽成交后保留真实药名，混合出售和跨场历史截断不串到其他槽位', () => {
  const s = fixture(6);
  selectAuctionHall(s, 0, 1);
  const lot = auctionLots(s).find((l) => l.index === 5)!;
  assert.notEqual(lot.id, 'zengyuan');
  const bought = buyAuction(s, 5, s.stones, 1)!;
  const card = auctionContent(s, 'buy', false)
    .split('data-closed-index="5">')[1]
    .split('</article>')[0];
  assert.ok(card.includes(`${medicineInfo(bought.id)!.name} ×1`));
  assert.doesNotMatch(card, /<h3>增元丹 ×1/);
  selectAuctionHall(s, 1, 1);
  buyAuction(s, 8, s.stones, 1);
  selectAuctionHall(s, 0, 1);
  s.medicine.bag.huanglong = 40;
  for (let i = 0; i < 12; i++)
    sellAuction(s, { kind: 'medicine', id: 'huanglong', quantity: 1, forgeLevel: 0 }, 1, 1);
  assert.equal(s.mortal.auction!.history.length, 12);
  const fallback = auctionContent(s, 'buy', false)
    .split('data-closed-index="5">')[1]
    .split('</article>')[0];
  assert.match(fallback, /本拍品已结拍/);
  assert.doesNotMatch(fallback, /黄龙丹|增元丹|auction-budget/);
  const next = auctionLots(s).find((l) => l.index === 4)!;
  const recent = buyAuction(s, next.index, s.stones, 1)!;
  const fresh = auctionContent(s, 'buy', false)
    .split('data-closed-index="4">')[1]
    .split('</article>')[0];
  assert.ok(fresh.includes(`${medicineInfo(recent.id)!.name} ×1`));
  const stillUnknown = auctionContent(s, 'buy', false)
    .split('data-closed-index="5">')[1]
    .split('</article>')[0];
  assert.match(stillUnknown, /本拍品已结拍/);
  assert.doesNotMatch(stillUnknown, new RegExp(`<h3>${medicineInfo(recent.id)!.name}`));
  assert.deepEqual(importSave(exportSave(s, null)).save.mortal.auction, s.mortal.auction);
});

test('人字场实际出现二阶，竞得更高阶同名法宝后覆盖并保存，保持本命与单件收藏', () => {
  let upgraded = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const s = fixture(0, seed);
    const lot = auctionLots(s).find((l) => l.kind === 'artifact' && l.forgeLevel === 2);
    if (!lot) continue;
    if (!s.artifacts.includes(lot.id)) s.artifacts.push(lot.id);
    s.forge[lot.id] = 1;
    const starter = s.starter;
    const result = buyAuction(s, lot.index, s.stones, 1)!;
    assert.equal(result.outcome, 'won');
    assert.equal(s.forge[lot.id], 2);
    assert.equal(s.artifacts.filter((id) => id === lot.id).length, 1);
    assert.equal(s.starter, starter);
    const restored = importSave(exportSave(s, null)).save;
    assert.equal(restored.forge[lot.id], 2);
    upgraded++;
  }
  assert.ok(upgraded > 15, '二阶须真实进入常规拍品池');
});
