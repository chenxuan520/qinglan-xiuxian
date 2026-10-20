import { enterNextMarketBatch } from './market-fixture.ts';
import { AUCTION_CURIO_LOT } from '../src/auction-data.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CURIO_IDS,
  ownsCurio,
  bossCurio,
  grantCurio,
  validCurios,
  prepareCurioConsignment,
  curioCycle,
  curioRoll,
  acquiredCurio,
} from '../src/curio-data.ts';
import { Game } from '../src/game.ts';
import {
  freshSave,
  readSave,
  SAVE_SCHEMA,
  realmCost,
  trainingYears,
  trainingCost,
  train,
  retreatPlan,
  forgeCost,
  forge,
  settleRun,
  IMMORTAL_CULTIVATION,
  inheritanceChoices,
  resolveInheritance,
  applyBirthInheritance,
} from '../src/progress.ts';
import { importSave, exportSave } from '../src/save-transfer.ts';
import { studyPlan, joinSect, leaveSect, startActivity } from '../src/mortal.ts';
import { SECTS } from '../src/mortal-data.ts';
import { medicineFormula, MEDICINES } from '../src/medicine-data.ts';
import { craftMedicine, medicineCraftReason } from '../src/medicine.ts';
import { prepareAuction } from '../src/auction.ts';
import { auctionLots, buyAuction, sellAuction, auctionBuyReason } from '../src/auction-trade.ts';
import { curioSeekingQuote, seekCurio } from '../src/curio-market.ts';
import { venueStamp } from '../src/market-venues.ts';
import { sectServiceQuote, executeSectService, sectServiceStamp } from '../src/sect-services.ts';
import { marketInvitationReward } from '../src/market-opportunities.ts';
import {
  marketOpportunity,
  prepareMarketSocial,
  chooseMarketOpportunity,
} from '../src/market-social.ts';
import { powerBreakdown } from '../src/power-breakdown.ts';
import { inheritanceContent } from '../src/inheritance-ui.ts';
import { SPIRIT_ROOTS } from '../src/data.ts';

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
function ready() {
  const s = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  s.cultivation = Array.from({ length: 18 }, (_, n) => realmCost(n)).reduce((a, b) => a + b, 0);
  s.age = 30;
  s.unlocked = 6;
  s.stones = 100000;
  s.iron = 100000;
  s.prologueSeen = s.hometownSeen = true;
  s.mortal.hometown!.stage = 'departed';
  s.mortal.population = { seed: 12345, since: 15 };
  return s;
}
test('九件奇物按持有生效，重复获取被拒绝；移走恢复真实战斗属性', () => {
  const s = ready();
  // 用初期整数基础气血检查叠乘，避免先反除已四舍五入的后期气血。
  s.cultivation = 1;
  s.training = { power: 10, vitality: 10, speed: 10 };
  const baseline = new Game(structuredClone(s), 0, 0, () => 0.5);
  for (const id of CURIO_IDS) assert.equal(grantCurio(s, id), true);
  const g = new Game(s, 0, 0, () => 0.5);
  near(g.stats.damage / baseline.stats.damage, 1.26 / 1.2);
  assert.equal(g.player.maxHp, Math.round((baseline.player.maxHp / 1.5) * 1.65 * 1.2));
  near(g.stats.speed / baseline.stats.speed, 1.15);
  near(g.stats.xp / baseline.stats.xp, 1.15);
  near(g.stats.magnet / baseline.stats.magnet, 1.25);
  near(g.stats.armor / baseline.stats.armor, 0.9);
  near(g.stats.regen / baseline.stats.regen, 1.3);
  near(g.stats.eliteDamage, 1.15);
  const stats = { ...g.stats };
  for (const id of CURIO_IDS) assert.equal(grantCurio(s, id), false);
  assert.deepEqual(g.stats, stats);
  for (const id of CURIO_IDS) s.curios.bag[id] = 1;
  assert.deepEqual(g.stats, stats);
  s.curios.bag = {};
  assert.deepEqual(g.stats, baseline.stats);
  const hp = new Game(s, 0, 0, () => 0.5);
  assert.equal(hp.player.maxHp, baseline.player.maxHp);
});
test('金雷竹只增强精英妖王，玉如意减免实际承伤，灵泉不直接提高斩妖修为', () => {
  for (const elite of [false, true]) {
    const s = ready();
    grantCurio(s, 'thunder-bamboo');
    grantCurio(s, 'jade-ruyi');
    const g = new Game(s, 0, 0, () => 0.5),
      e = g.spawnEnemy(0, elite, false, { x: 500, y: 0 });
    e.hp = e.maxHp = 10000;
    g.hitEnemy(e, 100);
    near(e.hp, 10000 - (elite ? 115 : 100));
    const before = g.player.hp;
    g.hurtPlayer(20);
    near(before - g.player.hp, 20 * g.stats.armor);
  }
  const s = ready(),
    p = structuredClone(s);
  grantCurio(p, 'spirit-spring');
  const a = new Game(s, 0, 0, () => 0.5),
    b = new Game(p, 0, 0, () => 0.5);
  for (const g of [a, b]) {
    const e = g.spawnEnemy(0, false, false, { x: 100, y: 0 });
    g.hitEnemy(e, 1e6);
  }
  assert.equal(s.cultivation, p.cultivation);
});
test('掌天瓶两种丹炉均一份原料三枚成丹，十年变一年、百年变十年，溢出不扣费', () => {
  for (const m of MEDICINES.filter((m) => m.craftYears > 0)) {
    const s = ready();
    grantCurio(s, 'heaven-bottle');
    s.medicine.recipes.push(m.id);
    for (const f of medicineFormula(s.medicine, m.id)) s.medicine.bag[f.id] = f.count + 5;
    const before = structuredClone(s);
    assert.equal(medicineCraftReason(s, m.id), '');
    assert.equal(craftMedicine(s, m.id).ok, true);
    assert.equal(s.medicine.bag[m.id], 3);
    near(s.age - before.age, m.craftYears / 10);
    assert.equal(before.stones - s.stones, m.tier === '灵品' ? 40 : 100);
    for (const f of medicineFormula(s.medicine, m.id))
      assert.equal(before.medicine.bag[f.id] - s.medicine.bag[f.id], f.count);
    s.medicine.bag[m.id] = Number.MAX_SAFE_INTEGER - 1;
    const bad = JSON.stringify(s);
    assert.equal(craftMedicine(s, m.id).ok, false);
    assert.equal(JSON.stringify(s), bad);
  }
  const s = ready();
  assert.ok(joinSect(s, 'duration'));
  grantCurio(s, 'heaven-bottle');
  const m = MEDICINES.find((m) => m.craftYears === 10)!;
  s.medicine.recipes = [m.id];
  for (const f of medicineFormula(s.medicine, m.id)) s.medicine.bag[f.id] = 20;
  const q = sectServiceQuote(s, m.id);
  assert.equal(q.receiveCount, 3);
  assert.equal(q.years, 0.4);
  const age = s.age;
  assert.ok(executeSectService(s, m.id, sectServiceStamp(s)));
  near(s.age - age, 0.4);
  assert.equal(s.medicine.bag[m.id], 3);
});
test('天机屋三项根基对全部灵根零年岁、逐阶灵石减半；出售即恢复原费用与年岁', () => {
  for (const root of SPIRIT_ROOTS) {
    const s = ready();
    s.spiritRoot = root.id;
    grantCurio(s, 'heaven-house');
    for (const kind of ['vitality', 'power', 'speed'] as const) {
      for (let level = 0; level < 20; level++) {
        const age = s.age,
          stones = s.stones;
        assert.equal(trainingYears(s), 0);
        assert.equal(trainingCost(level, s), Math.ceil(trainingCost(level) / 2));
        assert.ok(train(s, kind));
        assert.equal(s.training[kind], level + 1);
        assert.equal(s.age, age);
        assert.equal(stones - s.stones, Math.ceil(trainingCost(level) / 2));
      }
      const full = structuredClone(s);
      assert.equal(train(s, kind), false);
      assert.deepEqual(s, full);
    }
    s.curios.bag['heaven-house'] = 0;
    assert.ok(trainingYears(s) > 0);
    assert.equal(trainingCost(0, s), trainingCost(0));
  }
});
test('天机屋直接精研零年岁、灵石减半，五阶十阶赐丹各一次且不残留活动', () => {
  const s = ready();
  s.cultivation = IMMORTAL_CULTIVATION;
  s.completed = [6];
  grantCurio(s, 'heaven-house');
  assert.ok(joinSect(s, 'haste'));
  const initialMedicines = Object.values(s.medicine.bag).reduce((a, b) => a + b, 0);
  for (let level = 0; level < 10; level++) {
    const age = s.age,
      years = s.mortal.years,
      stones = s.stones;
    const q = studyPlan(s);
    assert.equal(q.years, 0);
    assert.equal(q.stones, Math.ceil(studyPlan(s, false).stones / 2));
    assert.ok(startActivity(s, 'study', () => 0));
    assert.equal(s.age, age);
    assert.equal(s.mortal.years, years);
    assert.equal(stones - s.stones, q.stones);
    assert.equal(s.mortal.mastery.haste, level + 1);
    assert.equal(s.mortal.activity, null);
    assert.deepEqual(importSave(exportSave(s)).save.mortal, s.mortal);
  }
  assert.equal(Object.values(s.medicine.bag).reduce((a, b) => a + b, 0) - initialMedicines, 2);
  const full = structuredClone(s);
  assert.equal(startActivity(s, 'study'), false);
  assert.deepEqual(s, full);
});
test('天机屋宗门精研与根基专长零年岁、只折一次灵石，献物按折后逐阶费用抵价', () => {
  for (const sect of [
    'haste',
    'spirit',
    'bone',
    'guard',
    'blood',
    'forbidden',
    'magnet',
    'soul',
    'devour',
  ]) {
    const s = ready();
    s.cultivation = IMMORTAL_CULTIVATION;
    s.completed = [6];
    s.artifacts.push('dragon');
    s.medicine.bag.huanglong = 20;
    assert.ok(joinSect(s, sect));
    const choice =
      sect === 'bone'
        ? 'dragon'
        : sect === 'devour'
          ? 'huanglong'
          : ['haste', 'spirit'].includes(sect)
            ? 'study'
            : ['magnet', 'forbidden'].includes(sect)
              ? 'power'
              : sect === 'soul'
                ? 'speed'
                : 'vitality';
    const plain = sectServiceQuote(s, choice);
    grantCurio(s, 'heaven-house');
    const q = sectServiceQuote(s, choice);
    assert.equal(q.reason, '', sect);
    assert.equal(q.years, 0, sect);
    assert.equal(q.iron, plain.iron, sect);
    if (!['bone', 'devour'].includes(sect))
      assert.equal(q.stones, Math.ceil(plain.stones / 2), sect);
    else assert.ok((q.levels ?? 1) >= (plain.levels ?? 1), '折后抵价应足额容纳物品价值');
    const age = s.age,
      years = s.mortal.years,
      stones = s.stones;
    assert.ok(executeSectService(s, choice, sectServiceStamp(s)), sect);
    assert.equal(s.age, age);
    assert.equal(s.mortal.years, years);
    assert.equal(stones - s.stones, q.stones);
    assert.equal(s.mortal.activity, null);
    if (q.study) assert.equal(s.mortal.mastery[sect], q.levels ?? 1);
    if (q.train) assert.equal(s.training[q.train], q.levels ?? 1);
    assert.match(
      sectServiceQuote(s, choice).reason,
      /十年|暂无/,
      '零年岁不能跳过专长冷却或找回已献物',
    );
    assert.equal(readSave(JSON.stringify(s)).status, 'ok');
  }
});
test('天机屋不允许退宗重领奖励或借零年岁刷新交易；付费入宗赠丹再售不能循环获利', () => {
  for (const sect of SECTS) {
    const s = ready();
    s.cultivation = IMMORTAL_CULTIVATION;
    s.completed = [6];
    grantCurio(s, 'heaven-house');
    enterNextMarketBatch(s);
    prepareAuction(s);
    assert.ok(joinSect(s, sect.id, undefined, () => 0));
    const batch = s.mortal.sectMarket!.visit;
    const age = s.age;
    for (let level = 0; level < 10; level++) assert.ok(startActivity(s, 'study', () => 0));
    assert.equal(s.age, age);
    assert.equal(s.mortal.sectMarket!.visit, batch);
    const afterMastery = Object.values(s.medicine.bag).reduce((a, b) => a + b, 0);
    for (let cycle = 0; cycle < 3; cycle++) {
      assert.ok(leaveSect(s));
      const balance = s.stones;
      assert.ok(joinSect(s, sect.id, undefined, () => 0));
      const settled = structuredClone(s);
      assert.equal(
        startActivity(s, 'study', () => 0),
        false,
      );
      assert.deepEqual(s, settled, '满阶重入不能再扣精研费或再赐五/十阶丹');
      assert.equal(
        Object.values(s.medicine.bag).reduce((a, b) => a + b, 0),
        afterMastery + 1,
      );
      const sold = sellAuction(
        s,
        {
          kind: 'medicine',
          id: MEDICINES.find((m) => m.tier === '凡品')!.id,
          quantity: 1,
          forgeLevel: 0,
        },
        1,
        s.mortal.sectMarket!.visit,
      )!;
      assert.equal(sold.outcome, 'sold');
      assert.ok(s.stones < balance, '付入门礼再售赠丹应净亏损');
    }
  }
});
test('养魂木闭关修为增三成，金阙玉书只降炼器灵石；灵威列出奇物的实际贡献', () => {
  const s = ready();
  s.cultivation = 1;
  const a = retreatPlan(s, 10)!;
  grantCurio(s, 'soul-wood');
  const b = retreatPlan(s, 10)!;
  near(b.cultivation.minPercent / a.cultivation.minPercent, 1.3);
  grantCurio(s, 'jade-book');
  for (let level = 0; level < 10; level++) {
    const base = forgeCost(level),
      q = forgeCost(level, s);
    assert.equal(q.iron, base.iron);
    assert.equal(q.stones, Math.ceil(base.stones * 0.7));
  }
  const q = forgeCost(0, s),
    old = s.stones;
  assert.ok(forge(s, s.starter));
  assert.equal(old - s.stones, q.stones);
  s.training.power = 10;
  grantCurio(s, 'thunder-bamboo');
  const rows = powerBreakdown(s).rows;
  assert.ok(
    rows.some((r) => r.id === 'curio:soul-wood' && r.changes.some((c) => c.key === 'weaponDamage')),
  );
  assert.ok(
    rows.some(
      (r) => r.id === 'curio:thunder-bamboo' && r.changes.some((c) => c.key === 'eliteDamage'),
    ),
  );
});
test('奇物寄拍不随进出换货或重开结拍，旧周期报价不能购买；出售最后一件失效', () => {
  const s = ready();
  for (let seed = 0; ; seed++) {
    s.curios.seed = seed;
    s.curios.consignment = null;
    prepareCurioConsignment(s);
    if (s.curios.consignment?.id) break;
  }
  enterNextMarketBatch(s);
  prepareAuction(s);
  const lot = auctionLots(s).find((l) => l.kind === 'curio')!;
  assert.ok(lot);
  assert.equal(auctionLots(s).filter((l) => l.kind !== 'curio').length, 7);
  const initial = structuredClone(s),
    cycle = s.curios.consignment!.cycle;
  enterNextMarketBatch(s);
  prepareAuction(s);
  assert.equal(auctionLots(s).find((l) => l.kind === 'curio')!.id, lot.id);
  const r = buyAuction(s, AUCTION_CURIO_LOT, 50000, 2, false, cycle)!;
  assert.equal(r.outcome, 'won');
  assert.ok(ownsCurio(s, lot.id as (typeof CURIO_IDS)[number]));
  enterNextMarketBatch(s);
  prepareAuction(s);
  assert.equal(
    auctionLots(s).some((l) => l.kind === 'curio'),
    false,
  );
  assert.match(auctionBuyReason(s, AUCTION_CURIO_LOT, 3), /不存在/);
  const item = { kind: 'curio' as const, id: lot.id, quantity: 1, forgeLevel: 0 };
  assert.equal(sellAuction(s, item, 1, 3, true), undefined);
  assert.equal(sellAuction(s, item, 1, 3)!.outcome, 'sold');
  assert.equal(ownsCurio(s, lot.id as (typeof CURIO_IDS)[number]), false);
  initial.age += 10;
  enterNextMarketBatch(initial);
  prepareAuction(initial);
  const unchanged = JSON.stringify(initial);
  assert.equal(buyAuction(initial, AUCTION_CURIO_LOT, 50000, 2, false, cycle), undefined);
  assert.equal(JSON.stringify(initial), unchanged);
});
test('寻访可连续落空三次，十年逐次付费并积累机会；共享额度与本世唯一性保留', () => {
  const s = ready();
  s.curios.seed = 0;
  enterNextMarketBatch(s);
  const id = 'soul-wood';
  let total = 0;
  for (let i = 0; i < 4; i++) {
    const q = curioSeekingQuote(s, id);
    assert.equal(q.reason, '');
    assert.equal(q.years, 10);
    assert.equal(q.chance, 20 + 10 * i);
    const age = s.age;
    const stones = s.stones;
    total += q.price;
    assert.ok(seekCurio(s, id, venueStamp(s)));
    near(s.age - age, 10);
    assert.equal(stones - s.stones, q.price);
    assert.equal(s.curios.seeking[id], i + 1);
    assert.equal(s.curios.bag[id] ?? 0, i === 3 ? 1 : 0);
    assert.deepEqual(importSave(exportSave(s)).save.curios, s.curios);
    assert.ok(curioSeekingQuote(s, 'wind-wings').reason);
    s.age += 10;
  }
  assert.equal(100000 - s.stones, total);
  delete s.curios.bag[id];
  assert.match(curioSeekingQuote(s, id).reason, /已寻得/);
  const before = JSON.stringify(s);
  assert.equal(seekCurio(s, 'heaven-bottle', venueStamp(s)), undefined);
  assert.equal(seekCurio(s, 'wind-wings', 'stale'), undefined);
  assert.equal(seekCurio(s, 'wind-wings', venueStamp(s), false, true), undefined);
  assert.equal(JSON.stringify(s), before);
});
test('七次未获后仍无保底，机会封顶70%；三次失败和多次失败均可保存且不冒充已获得', () => {
  let s = ready();
  s.curios.seed = 166;
  enterNextMarketBatch(s);
  for (let n = 0; n < 8; n++) {
    const q = curioSeekingQuote(s, 'soul-wood');
    assert.equal(q.reason, '');
    assert.equal(q.chance, Math.min(70, 20 + 10 * n));
    const text = seekCurio(s, 'soul-wood', venueStamp(s))!;
    assert.match(text, n < 7 ? /此行未能寻得/ : /已收入行囊/);
    assert.equal(acquiredCurio(s, 'soul-wood'), n === 7);
    s = importSave(exportSave(s)).save;
    assert.equal(s.curios.seeking['soul-wood'], n + 1);
    assert.equal(acquiredCurio(s, 'soul-wood'), n === 7);
    s.age += 10;
  }
  assert.equal(s.curios.bag['soul-wood'], 1);
});
test('读档和更换宗门寻访入口不重抽该次机缘；首访可得，各奇物独立积累次数', () => {
  const s = ready();
  s.curios.seed = 5;
  enterNextMarketBatch(s);
  assert.ok(joinSect(s, 'power'));
  const market = structuredClone(s);
  const sect = importSave(exportSave(s)).save;
  assert.match(seekCurio(market, 'soul-wood', venueStamp(market))!, /已收入行囊/);
  assert.match(seekCurio(sect, 'soul-wood', venueStamp(sect), true)!, /已收入行囊/);
  assert.equal(market.curios.bag['soul-wood'], 1);
  assert.equal(sect.curios.bag['soul-wood'], 1);
  assert.equal(curioSeekingQuote(market, 'wind-wings').progress, 0);
  assert.equal(curioSeekingQuote(market, 'wind-wings').chance, 20);
  assert.equal(s.curios.seeking['soul-wood'], undefined);
});
test('八种可寻奇物的多种子实际授予覆盖首访至封顶，成功比例随失败次数提高', () => {
  const rates: number[] = [];
  for (const attempts of [0, 1, 2, 3, 4, 5, 20]) {
    let won = 0;
    let total = 0;
    for (const id of CURIO_IDS.slice(1)) {
      for (let seed = 0; seed < 256; seed++) {
        const s = ready();
        s.curios.seed = seed;
        s.curios.seeking[id] = attempts;
        enterNextMarketBatch(s);
        assert.ok(seekCurio(s, id, venueStamp(s)));
        total++;
        if (ownsCurio(s, id)) won++;
      }
    }
    const rate = won / total;
    assert.ok(Math.abs(rate - Math.min(0.7, 0.2 + attempts * 0.1)) < 0.04);
    rates.push(rate);
  }
  for (let i = 1; i < 6; i++) assert.ok(rates[i] > rates[i - 1]);
  assert.ok(rates[6] < 1, '大量失败后仍可落空');
});
test('奇物十年寻访预留全程供奉，寿元和天劫不足十年时不花钱不积累次数', () => {
  for (const boundary of ['lifespan', 'tribulation'] as const) {
    const s = ready();
    enterNextMarketBatch(s);
    if (boundary === 'lifespan') {
      s.cultivation = 352;
      s.age = 240;
    } else {
      s.cultivation = IMMORTAL_CULTIVATION;
      s.nextTribulationAge = s.age + 10;
    }
    const before = structuredClone(s);
    assert.match(curioSeekingQuote(s, 'soul-wood').reason, /寿元不足|天劫将至/);
    assert.equal(seekCurio(s, 'soul-wood', venueStamp(s)), undefined);
    assert.deepEqual(s, before);
  }
  const s = ready();
  s.cultivation = 352;
  enterNextMarketBatch(s);
  assert.ok(joinSect(s, 'power'));
  s.mortal.member!.dueAt = s.mortal.years + 1;
  const q = curioSeekingQuote(s, 'soul-wood', true);
  assert.ok(q.reserve > 0);
  s.stones = q.price + q.reserve - 1;
  const before = structuredClone(s);
  assert.equal(seekCurio(s, 'soul-wood', venueStamp(s), true), undefined);
  assert.deepEqual(s, before);
});
test('当前档完整往返、浮点十年边界、旧档迁移和坏奇物状态拒绝', () => {
  const s = ready();
  grantCurio(s, 'soul-wood');
  grantCurio(s, 'soul-wood');
  s.curios.seeking['wind-wings'] = 2;
  s.curios.soughtAt = 30;
  enterNextMarketBatch(s);
  prepareAuction(s);
  const g = new Game(s, 0, 0, () => 0.5);
  g.player.hp -= 11;
  g.pause();
  const imported = importSave(exportSave(s, g));
  assert.deepEqual(imported.save.curios, s.curios);
  assert.ok(imported.run);
  near(imported.run!.player.hp, g.player.hp);
  for (const age of [24.999999999999996, 25, 34.99999999999999, 35]) {
    const a = ready();
    a.age = age;
    prepareCurioConsignment(a);
    assert.ok(validCurios(a.curios, age));
    assert.equal(readSave(JSON.stringify(a)).status, 'ok');
  }
  const old = { ...s, schema: SAVE_SCHEMA - 1, curios: undefined, activeRun: g.snapshot() };
  const loaded = importSave(JSON.stringify(old));
  assert.deepEqual(loaded.save.curios.bag, {});
  assert.equal(loaded.run, null);
  for (const bad of [
    { ...s.curios, bag: { 'soul-wood': -1 } },
    { ...s.curios, bag: { unknown: 1 } },
    { ...s.curios, seeking: { 'wind-wings': -1 } },
    { ...s.curios, seeking: { 'wind-wings': 1.5 } },
    { ...s.curios, seeking: { 'wind-wings': Number.MAX_SAFE_INTEGER + 1 } },
  ]) {
    const data = { ...s, curios: bad };
    assert.equal(readSave(JSON.stringify(data)).status, 'unreadable');
    assert.throws(() => importSave(JSON.stringify(data)));
  }
  assert.equal(readSave(JSON.stringify({ ...s, schema: SAVE_SCHEMA + 1 })).status, 'newer');
});
test('九件奇物可逐一传承，只赠一样；命盘重抽与接受命盘后持有，普通轮回清空', () => {
  const old = ready();
  old.cultivation = IMMORTAL_CULTIVATION;
  old.completed = [6];
  for (const id of CURIO_IDS) grantCurio(old, id);
  assert.equal(inheritanceChoices(old).filter((g) => g.kind === 'curio').length, 9);
  assert.match(inheritanceContent(old), /奇物 · 仅传一件/);
  for (const id of CURIO_IDS) {
    const next = freshSave('dual', ['metal', 'wood'], 'orthodox', () => 0.5);
    const gift = resolveInheritance(old, `curio:${id}`)!;
    assert.ok(applyBirthInheritance(next, gift));
    assert.ok(applyBirthInheritance(next, gift));
    assert.equal(next.curios.bag[id], 1);
    const restored = importSave(exportSave(next));
    assert.equal(restored.save.curios.bag[id], 1);
    assert.deepEqual(restored.save.birthInheritance, gift);
    const reroll = freshSave('none', [], 'orthodox', () => 0.5);
    assert.ok(applyBirthInheritance(reroll, restored.save.birthInheritance));
    assert.equal(reroll.curios.bag[id], 1);
  }
  assert.deepEqual(freshSave().curios.bag, {});
});
test('妖王奇物使用独立稳定随机流，恢复不重复抽取；收获只在结算授予', () => {
  const s = ready();
  let seed = 0;
  while (!bossCurio({ ...s, curios: { ...s.curios, seed } }, 0, 0, true)) seed++;
  s.curios.seed = seed;
  const g = new Game(s, 0, 0, () => 0.5);
  g.time = 180;
  g.update(0.01);
  g.hitEnemy(g.boss!, 1e12);
  assert.equal(g.state, 'won');
  assert.equal(Object.keys(g.loot.curios).length, 1);
  assert.deepEqual(s.curios.bag, {});
  settleRun(s, { ...g.snapshot(), victory: true });
  assert.deepEqual(s.curios.bag, g.loot.curios);
  const baseline = ready();
  assert.equal(curioRoll(1, 'sample'), curioRoll(1, 'sample'));
  for (const root of ['heaven', 'none'] as const) {
    baseline.spiritRoot = root;
    assert.equal(
      bossCurio(baseline, 0, 0, true),
      bossCurio({ ...baseline, spiritRoot: 'heaven' } as typeof baseline, 0, 0, true),
    );
  }
  const p = ready(),
    run = new Game(p, 6, 0, () => 0.5);
  run.time = 60;
  run.update(0.01);
  run.hitEnemy(run.boss!, 1e12);
  run.pause();
  const restored = Game.restore(p, JSON.parse(JSON.stringify(run.snapshot())))!;
  assert.ok(restored);
  assert.deepEqual(restored.loot.curios, run.loot.curios);
  assert.deepEqual(p.curios.bag, {});
});
test('修士私邀少量赠奇物且承诺与交割相符，执事堂公开寻物仍不出奇物', () => {
  let checked = 0;
  for (let seed = 1; seed < 5000; seed++) {
    const s = ready();
    s.mortal.population!.seed = seed;
    enterNextMarketBatch(s);
    prepareMarketSocial(s);
    for (const id of ['market-alchemist', 'market-disciple', 'market-wanderer'] as const) {
      assert.notEqual(
        marketInvitationReward(s.mortal.population!, s.mortal.sectMarket!, id)!.item.kind,
        'curio',
      );
      const o = marketOpportunity(s, id);
      if (!o || o.kind !== 'invitation' || !o.honest || o.item.kind !== 'curio') continue;
      const before = JSON.stringify(o.item);
      assert.ok(chooseMarketOpportunity(s, id, 1, 'accept'));
      assert.equal(s.curios.bag[o.item.id as (typeof CURIO_IDS)[number]], 1);
      assert.equal(JSON.stringify(o.item), before);
      assert.equal(chooseMarketOpportunity(s, id, 1, 'accept'), undefined);
      checked++;
      break;
    }
    if (checked >= 3) break;
  }
  assert.equal(checked, 3);
});

test('劫修固定战况按持有奇物计算气血与承伤，刷新沿用该场数值', () => {
  let checked = false;
  for (let seed = 1; seed < 2000 && !checked; seed++) {
    const base = ready();
    base.mortal.population!.seed = seed;
    enterNextMarketBatch(base);
    prepareMarketSocial(base);
    base.training.vitality = 10;
    for (const id of ['market-alchemist', 'market-disciple', 'market-wanderer'] as const) {
      const o = marketOpportunity(base, id);
      if (!o || o.kind !== 'invitation' || o.honest) continue;
      const s = structuredClone(base);
      for (const curio of ['soul-wood', 'sacred-fragment', 'jade-ruyi'] as const)
        grantCurio(s, curio);
      chooseMarketOpportunity(base, id, 1, 'accept');
      chooseMarketOpportunity(s, id, 1, 'accept');
      const plain = base.mortal.marketSocial!.ambush!,
        enhanced = s.mortal.marketSocial!.ambush!;
      assert.equal(enhanced.stats.hp, Math.round((100 + 50 * 1.3) * 1.2));
      near(enhanced.stats.enemyDamage, plain.stats.enemyDamage * 0.9);
      const restored = importSave(exportSave(s));
      assert.deepEqual(restored.save.mortal.marketSocial!.ambush!.stats, enhanced.stats);
      checked = true;
      break;
    }
  }
  assert.ok(checked);
});

test('金雷竹与明清灵水不突破妖王觉醒一击5%上限', () => {
  for (const bamboo of [false, true])
    for (const pill of [false, true]) {
      const s = ready();
      if (bamboo) grantCurio(s, 'thunder-bamboo');
      if (pill) s.medicine.active.mingqing = s.age + 100;
      const g = new Game(s, 0, 0, () => 0.5);
      g.weapons = [{ id: 'sword', level: 6, evolved: false, timer: 999 }];
      g.passives = { power: 5 };
      const boss = g.spawnEnemy(10, false, true, { x: 100, y: 0 });
      boss.hp = boss.maxHp = 100;
      g.state = 'upgrade';
      g.choices = [
        { type: 'evolve', id: 'sword', level: 7 },
        { type: 'heal', id: 'heal', level: 1 },
      ];
      assert.ok(g.choose(0));
      near(boss.hp, 95);
    }
});

test('同归于尽无首通额外奇缘，但各关基础机缘不变', () => {
  for (const stage of [0, 6]) {
    const s = ready();
    s.completed = [];
    let baseSeed = -1,
      bonusSeed = -1;
    for (let seed = 0; seed < 10000 && (baseSeed < 0 || bonusSeed < 0); seed++) {
      s.curios.seed = seed;
      const alive = bossCurio(s, stage, stage === 6 ? 6 : 0, true, true),
        dead = bossCurio(s, stage, stage === 6 ? 6 : 0, true, false);
      if (dead) baseSeed = seed;
      else if (alive) bonusSeed = seed;
    }
    assert.ok(baseSeed >= 0 && bonusSeed >= 0);
    s.curios.seed = baseSeed;
    assert.equal(
      bossCurio(s, stage, stage === 6 ? 6 : 0, true, false),
      bossCurio(s, stage, stage === 6 ? 6 : 0, true, true),
    );
    s.curios.seed = bonusSeed;
    assert.equal(bossCurio(s, stage, stage === 6 ? 6 : 0, true, false), null);
    assert.ok(bossCurio(s, stage, stage === 6 ? 6 : 0, true, true));
  }
});
