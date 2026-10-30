import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSave, realmCost } from '../src/progress.ts';
import {
  CURIO_IDS,
  acquiredCurio,
  curioCycle,
  forecastCurioConsignment,
  grantCurio,
  prepareCurioConsignment,
} from '../src/curio-data.ts';
import { beginSectMarketVisit } from '../src/sect-market.ts';
import { prepareAuction, selectAuctionHall } from '../src/auction.ts';
import { auctionLots, forecastPermanentMedicine } from '../src/auction-trade.ts';
import { medicineInfo } from '../src/medicine-data.ts';
import { enterNextMarketBatch } from './market-fixture.ts';

function fixture(seed = 17) {
  const save = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  save.age = 30;
  save.stones = 1000000;
  save.cultivation = Array.from({ length: 18 }, (_, i) => realmCost(i)).reduce((a, b) => a + b, 0);
  save.mortal.population = { seed, since: 15 };
  assert.equal(beginSectMarketVisit(save), true);
  prepareAuction(save);
  return save;
}

test('奇物预告不修改存档，逐周期推进到首次预告时真实寄拍同一件', () => {
  const seen = new Set<string>();
  for (let seed = 0; seed < 64; seed++) {
    const save = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
    save.age = 30.25 + (seed % 3) * 10;
    save.curios.seed = seed;
    if (seed % 2) grantCurio(save, CURIO_IDS[1 + (seed % 8)]);
    const before = structuredClone(save);
    const forecast = forecastCurioConsignment(save);
    assert.deepEqual(save, before);
    assert.ok(forecast);
    assert.ok(forecast.years > 0 && forecast.years <= 300);
    assert.notEqual(forecast.id, 'heaven-bottle');
    assert.equal(acquiredCurio(save, forecast.id), false);
    const future = structuredClone(save);
    const until = curioCycle(save.age + forecast.years);
    for (let cycle = curioCycle(save.age) + 1; cycle <= until; cycle++) {
      future.age = 15 + cycle * 10;
      prepareCurioConsignment(future);
      assert.equal(future.curios.consignment!.id, cycle === until ? forecast.id : null);
    }
    seen.add(forecast.id);
  }
  assert.deepEqual([...seen].sort(), [...CURIO_IDS.slice(1)].sort());
});

test('奇物预告排除本世已得或已售，不预告当前周期，三十周期内无候选则为空', () => {
  const save = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  save.curios.seed = 0;
  const first = forecastCurioConsignment(save)!;
  assert.ok(first);
  grantCurio(save, first.id);
  delete save.curios.bag[first.id];
  assert.notEqual(forecastCurioConsignment(save)?.id, first.id);
  const hiddenByZero = forecastCurioConsignment(save)!;
  assert.ok(hiddenByZero);
  save.curios.bag[hiddenByZero.id] = 0;
  assert.notEqual(forecastCurioConsignment(save)?.id, hiddenByZero.id);
  save.curios.acquired = [...CURIO_IDS];
  const before = structuredClone(save);
  assert.equal(forecastCurioConsignment(save), null);
  assert.deepEqual(save, before);
  const onlyWood = freshSave();
  onlyWood.curios.seed = 0;
  onlyWood.curios.acquired = [...CURIO_IDS.slice(2)];
  assert.deepEqual(forecastCurioConsignment(onlyWood), { id: 'soul-wood', years: 280 });
  onlyWood.age = 295;
  prepareCurioConsignment(onlyWood);
  assert.equal(onlyWood.curios.consignment!.id, 'soul-wood');
  const next = forecastCurioConsignment(onlyWood);
  assert.ok(!next || next.years >= 10, '当前已摆出的寄拍不再次预告');
});

test('本世珍品预告与真实推进来访后的天字场第五槽一致，返回最早十次内结果且不修改存档', () => {
  const found = new Set<string>();
  let noForecast = 0;
  for (const seed of [0, 3, 4, 6, 9, 12, 13, 17, 19, 33, 64, 88, 106]) {
    const save = fixture(seed);
    for (const targetVisit of [1, 3]) {
      while (save.mortal.sectMarket!.visit < targetVisit) enterNextMarketBatch(save);
      prepareAuction(save);
      assert.equal(selectAuctionHall(save, 0, save.mortal.sectMarket!.visit), '');
      const before = structuredClone(save);
      const forecast = forecastPermanentMedicine(save);
      assert.deepEqual(save, before);
      const future = structuredClone(save);
      let earliest: { id: string; visits: number } | null = null;
      for (let visits = 1; visits <= 10; visits++) {
        enterNextMarketBatch(future);
        prepareAuction(future);
        assert.equal(selectAuctionHall(future, 2, future.mortal.sectMarket!.visit), '');
        const lot = auctionLots(future).find((item) => item.index === 21)!;
        assert.equal(lot.kind, 'medicine');
        const medicine = medicineInfo(lot.id)!;
        assert.equal(medicine.tier, '珍品');
        if (!medicine.years && !earliest) earliest = { id: lot.id, visits };
      }
      assert.deepEqual(forecast, earliest, `${seed}/${targetVisit}`);
      if (forecast) found.add(forecast.id);
      else noForecast++;
    }
  }
  assert.ok(found.size >= 3);
  assert.ok(noForecast > 0);
  assert.equal(forecastPermanentMedicine(fixture(106))!.visits, 10, '第十次仍在预告窗口内');
  assert.equal(forecastPermanentMedicine(fixture(4)), null, '十次内均无限时为零的珍品则无预告');
});

test('本世珍品预告不要求已进拍卖席，缺人口或坊市来访记录时返回空', () => {
  const save = fixture(6);
  const expected = forecastPermanentMedicine(save);
  delete save.mortal.auction;
  assert.deepEqual(forecastPermanentMedicine(save), expected);
  assert.ok(expected);
  const withoutPopulation = structuredClone(save);
  delete withoutPopulation.mortal.population;
  assert.equal(forecastPermanentMedicine(withoutPopulation), null);
  delete save.mortal.sectMarket;
  assert.equal(forecastPermanentMedicine(save), null);
});

test('抽取共享函数前后的常规拍品、炼器阶数与visit和hall种子保持原值', () => {
  // 重构前以人口seed17实际记录的两批三场拍品，不用新预告函数生成期望值。
  const expected = [
    ['bigu:0', 'heqi:0', 'vortex:1', 'compass:1', 'jinsui:0', 'fenyuan:0', 'ice:2', 'iron:0'],
    [
      'juyuan:0',
      'zhenyuan:0',
      'dragon:6',
      'banner:5',
      'fenyuan:0',
      'xuling:0',
      'meteor:5',
      'shard:6',
    ],
    ['xuepo:0', 'lingru:0', 'orbit:10', 'whip:8', 'wuchang:0', 'huiyang:0', 'qin:10', 'meteor:9'],
    ['jinsui:0', 'jiangchen:0', 'sand:1', 'coffin:2', 'bigu:0', 'fenyuan:0', 'banner:1', 'iron:0'],
    ['lianqi:0', 'zhenyuan:0', 'pagoda:3', 'dragon:4', 'zhiyuan:0', 'xuepo:0', 'pulse:6', 'qin:3'],
    [
      'dulong:0',
      'mingqing:0',
      'scythe:10',
      'pagoda:7',
      'wuchang:0',
      'peiying:0',
      'cauldron:10',
      'dragon:10',
    ],
  ];
  const save = fixture();
  let index = 0;
  for (const visit of [1, 5]) {
    while (save.mortal.sectMarket!.visit < visit) enterNextMarketBatch(save);
    prepareAuction(save);
    for (const hall of [0, 1, 2]) {
      assert.equal(selectAuctionHall(save, hall, visit), '');
      assert.deepEqual(
        auctionLots(save).map((lot) => `${lot.id}:${lot.forgeLevel}`),
        expected[index++],
      );
    }
  }
});
