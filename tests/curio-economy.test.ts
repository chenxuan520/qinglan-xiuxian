import { enterNextMarketBatch } from './market-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { CURIO_IDS, curioValue, grantCurio, ownsCurio, curioCycle } from '../src/curio-data.ts';
import { freshSave, forgeCost, IMMORTAL_CULTIVATION } from '../src/progress.ts';
import { joinSect } from '../src/mortal.ts';
import { prepareAuction, auctionValue, auctionSaleRates, auctionFee } from '../src/auction.ts';
import { auctionLots, buyAuction, sellAuction } from '../src/auction-trade.ts';
import { auctionContent } from '../src/auction-ui.ts';
import { curioSeekingQuote, seekCurio } from '../src/curio-market.ts';
import { curioSeekingContent } from '../src/curio-ui.ts';
import { venueStamp } from '../src/market-venues.ts';
import { MEDICINES, medicineMarketValue } from '../src/medicine-data.ts';
import type { AuctionItem } from '../src/auction-data.ts';

function fixture(seed = 0) {
  const s = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  s.cultivation = IMMORTAL_CULTIVATION;
  s.completed = [0, 1, 2, 3, 4, 5, 6];
  s.prologueSeen = s.hometownSeen = true;
  s.mortal.hometown.stage = 'departed';
  s.mortal.population = { seed: 12345, since: 15 };
  s.age = 30;
  s.stones = 1000000;
  s.curios.seed = seed;
  enterNextMarketBatch(s);
  prepareAuction(s);
  return s;
}
const item = (id: string): AuctionItem => ({ kind: 'curio', id, quantity: 1, forgeLevel: 0 });
const net = (gross: number) => gross - auctionFee(gross, true);

// 对所有奇物和多个十年行情走真实成交，不只验证静态百分比。
test('奇物估值体现整世收益，普通奇物回款不能一次覆盖完整十阶炼器灵石', () => {
  const strongestTimedMedicine = Math.max(
    ...MEDICINES.filter((m) => m.years > 0).map((m) => medicineMarketValue(m.id)),
  );
  const discounted = fixture();
  grantCurio(discounted, 'jade-book');
  const fullForge = Array.from({ length: 10 }, (_, i) => forgeCost(i, discounted).stones).reduce(
    (a, b) => a + b,
    0,
  );
  for (const id of CURIO_IDS) {
    const value = auctionValue(item(id));
    assert.ok(value >= strongestTimedMedicine * 4, id);
    let lowest = Infinity;
    let highest = 0;
    for (let seed = 0; seed < 96; seed++) {
      const s = fixture(seed);
      s.age += (seed % 3) * 10;
      grantCurio(s, id);
      const balance = s.stones;
      const age = s.age;
      const r = sellAuction(s, item(id), 1, s.mortal.sectMarket!.visit)!;
      assert.equal(r.outcome, 'sold');
      assert.equal(s.stones - balance, r.price - r.fee);
      assert.equal(s.age - age, 0.5);
      assert.equal(ownsCurio(s, id), false);
      assert.ok(r.price >= value * 0.1 && r.price <= value * 0.15);
      assert.ok(r.fee === Math.ceil(r.price * 0.1));
      lowest = Math.min(lowest, r.price);
      highest = Math.max(highest, r.price);
      if (id !== 'heaven-bottle') assert.ok(r.price - r.fee < fullForge, id);
    }
    assert.equal(lowest, value * 0.1, `${id} 覆盖最低行情`);
    assert.equal(highest, value * 0.15, `${id} 覆盖最高行情`);
  }
});

test('奇物竞得再出售始终亏损，跨十年行情也不能低买高卖套利', () => {
  for (const id of CURIO_IDS.slice(1)) {
    for (let seed = 0; seed < 24; seed++) {
      const s = fixture(seed);
      s.curios.consignment = { cycle: curioCycle(s.age), id, closed: false };
      delete s.mortal.auction!.curioSlot;
      prepareAuction(s);
      const lot = auctionLots(s).find((l) => l.kind === 'curio')!;
      const balance = s.stones;
      const r = buyAuction(
        s,
        lot.index,
        s.stones,
        s.mortal.sectMarket!.visit,
        false,
        curioCycle(s.age),
      )!;
      assert.equal(r.outcome, 'won');
      assert.ok(balance - s.stones >= curioValue(id) * 1.05);
      s.age += seed % 2 ? 10 : 0;
      const sold = sellAuction(s, item(id), 1, s.mortal.sectMarket!.visit)!;
      assert.equal(sold.outcome, 'sold');
      assert.ok(s.stones < balance - curioValue(id) * 0.9);
      assert.equal(ownsCurio(s, id), false);
    }
  }
});

test('寻访每次按原单次估值收费，未获也扣费；宗门与坊市都不能转售套利', () => {
  for (const id of CURIO_IDS.slice(1)) {
    for (const sect of [false, true]) {
      const s = fixture();
      if (sect) assert.ok(joinSect(s, 'power'));
      let spent = 0;
      const price = Math.ceil((curioValue(id) * (sect ? 108 : 120)) / 300);
      for (let step = 0; step < 20 && !ownsCurio(s, id); step++) {
        const q = curioSeekingQuote(s, id, sect);
        assert.equal(q.reason, '');
        assert.equal(q.price, price);
        assert.equal(q.years, 10);
        const insufficient = structuredClone(s);
        insufficient.stones = q.price - 1;
        const before = JSON.stringify(insufficient);
        assert.equal(seekCurio(insufficient, id, venueStamp(insufficient), sect), undefined);
        assert.equal(JSON.stringify(insufficient), before);
        assert.ok(seekCurio(s, id, venueStamp(s), sect));
        spent += q.price;
        s.age += 10;
      }
      assert.ok(ownsCurio(s, id), id);
      assert.equal(spent, price * s.curios.seeking[id]!);
      const receipt = sellAuction(s, item(id), 1, s.mortal.sectMarket!.visit)!;
      assert.equal(receipt.outcome, 'sold');
      // 即使首访即得，最高净回款13.5%也低于最低单次寻访费36%。
      assert.ok(receipt.price - receipt.fee < spent);
      assert.match(curioSeekingQuote(s, id, sect).reason, /本世已寻得/);
    }
  }
  assert.match(curioSeekingQuote(fixture(), 'heaven-bottle').reason, /不可指名/);
});

test('出售页预告奇物收购与到手范围，默认保留价可成交，高保留价流拍零物资损失', () => {
  for (const id of CURIO_IDS) {
    const s = fixture();
    grantCurio(s, id);
    grantCurio(s, id);
    const value = curioValue(id);
    const low = value * 0.1;
    const high = value * 0.15;
    const html = auctionContent(s, 'sell', false, 'curio', id);
    for (const amount of [value, low, high, net(low), net(high)])
      assert.ok(html.includes(amount.toLocaleString('zh-CN', { useGrouping: false })));
    assert.match(html, new RegExp(`id="auction-reserve"[^>]+value="${low}"`));
    const balance = s.stones;
    const unsold = sellAuction(s, item(id), high + 1, s.mortal.sectMarket!.visit)!;
    assert.equal(unsold.outcome, 'unsold');
    assert.equal(s.stones, balance);
    assert.equal(s.curios.bag[id], 1);
    const sold = sellAuction(s, item(id), low, s.mortal.sectMarket!.visit)!;
    assert.equal(sold.outcome, 'sold');
    assert.equal(s.curios.bag[id], 0);
    assert.equal(ownsCurio(s, id), false);
  }
  const s = fixture();
  s.curios.seeking['soul-wood'] = 2;
  const q = curioSeekingQuote(s, 'soul-wood');
  assert.ok(
    curioSeekingContent(s).includes(
      `本次${q.price.toLocaleString('zh-CN', { useGrouping: false })}灵石`,
    ),
  );
  assert.match(curioSeekingContent(s), /本次机会 40%/);
  assert.doesNotMatch(curioSeekingContent(s), /剩余|\/3|三次托付/);
  assert.deepEqual(auctionSaleRates(item('soul-wood')), [10, 15]);
  assert.deepEqual(
    auctionSaleRates({ kind: 'medicine', id: 'lingru', quantity: 1, forgeLevel: 0 }),
    [80, 100],
  );
  assert.deepEqual(
    auctionSaleRates({ kind: 'artifact', id: 'fire', quantity: 1, forgeLevel: 0 }),
    [80, 100],
  );
});
