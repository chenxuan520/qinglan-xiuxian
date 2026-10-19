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
  AUCTION_CURIO_LOT,
  AUCTION_IRON_LOT,
  validAuction,
  type AuctionItem,
} from '../src/auction-data.ts';
import { MEDICINES, medicineInfo } from '../src/medicine-data.ts';
import { ironMarket } from '../src/iron-market.ts';
import { IRON_MARKET_LIMIT } from '../src/iron-market-data.ts';
import { curioCycle, grantCurio, prepareCurioConsignment } from '../src/curio-data.ts';
import { importSave, exportSave } from '../src/save-transfer.ts';
import { auctionContent } from '../src/auction-ui.ts';

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
          assert.ok(lot.forgeLevel >= [0, 1, 3][hall] && lot.forgeLevel <= [1, 3, 6][hall]);
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
    assert.match(auctionSellReason(s, item, 1), /初级会场/);
    assert.equal(sellAuction(s, item, 1, 1), undefined);
    assert.deepEqual(s, before);
  }
  assert.match(auctionSellReason(s, curio, 1), /初级会场/);
  s.iron = 500;
  selectAuctionHall(s, 2, 1, true);
  const before = structuredClone(s);
  assert.equal(buyAuction(s, AUCTION_IRON_LOT, s.stones, 1), undefined);
  assert.match(auctionSellReason(s, iron(150), 1), /初级会场/);
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
