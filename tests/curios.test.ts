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
} from '../src/curio-data.ts';
import { Game } from '../src/game.ts';
import {
  freshSave,
  readSave,
  SAVE_SCHEMA,
  realmCost,
  trainingYears,
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
import { studyPlan, joinSect } from '../src/mortal.ts';
import { medicineFormula, MEDICINES } from '../src/medicine-data.ts';
import { craftMedicine, medicineCraftReason } from '../src/medicine.ts';
import { beginSectMarketVisit } from '../src/sect-market.ts';
import {
  auctionLots,
  prepareAuction,
  buyAuction,
  sellAuction,
  auctionBuyReason,
} from '../src/auction.ts';
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
test('九件奇物按持有生效，重复不叠加；最后一件移走恢复真实战斗属性', () => {
  const s = ready();
  s.training = { power: 10, vitality: 10, speed: 10 };
  const baseline = new Game(structuredClone(s), 0, 0, () => 0.5);
  for (const id of CURIO_IDS) grantCurio(s, id);
  const g = new Game(s, 0, 0, () => 0.5);
  near(g.stats.damage / baseline.stats.damage, 1.23 / 1.2);
  assert.equal(g.player.maxHp, Math.round((baseline.player.maxHp / 1.5) * 1.575 * 1.2));
  near(g.stats.speed / baseline.stats.speed, 1.1);
  near(g.stats.xp / baseline.stats.xp, 1.15);
  near(g.stats.magnet / baseline.stats.magnet, 1.25);
  near(g.stats.armor / baseline.stats.armor, 0.9);
  near(g.stats.regen / baseline.stats.regen, 1.3);
  near(g.stats.eliteDamage, 1.1);
  const stats = { ...g.stats };
  for (const id of CURIO_IDS) grantCurio(s, id);
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
    near(e.hp, 10000 - (elite ? 110 : 100));
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
test('天机屋逐阶时间减半且至少一年；宗门加速和献物批量不绕过下限', () => {
  const s = ready();
  grantCurio(s, 'heaven-house');
  assert.equal(trainingYears(s), 1);
  s.spiritRoot = 'none';
  s.rootElements = [];
  assert.equal(trainingYears(s), 2.5);
  assert.ok(joinSect(s, 'haste'));
  const plain = structuredClone(s);
  plain.curios.bag = {};
  near(studyPlan(s).years, Math.max(1, Math.ceil(studyPlan(plain).years * 5 - 1e-9) / 10));
  s.spiritRoot = 'heaven';
  s.rootElements = ['metal'];
  assert.ok(sectServiceQuote(s, 'study').years >= 1);
  const t = ready();
  assert.ok(joinSect(t, 'devour'));
  grantCurio(t, 'heaven-house');
  t.medicine.bag.huanglong = 20;
  const q = sectServiceQuote(t, 'huanglong');
  if (!q.reason) {
    assert.ok(q.years >= (q.levels ?? 1));
    assert.ok(executeSectService(t, 'huanglong', sectServiceStamp(t)));
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
    assert.equal(q.stones, Math.ceil(base.stones * 0.85));
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
  beginSectMarketVisit(s);
  prepareAuction(s);
  const lot = auctionLots(s).find((l) => l.kind === 'curio')!;
  assert.ok(lot);
  assert.equal(auctionLots(s).filter((l) => l.kind !== 'curio').length, 8);
  const initial = structuredClone(s),
    cycle = s.curios.consignment!.cycle;
  beginSectMarketVisit(s);
  prepareAuction(s);
  assert.equal(auctionLots(s).find((l) => l.kind === 'curio')!.id, lot.id);
  const r = buyAuction(s, 8, 50000, 2, false, cycle)!;
  assert.equal(r.outcome, 'won');
  assert.ok(ownsCurio(s, lot.id as (typeof CURIO_IDS)[number]));
  beginSectMarketVisit(s);
  prepareAuction(s);
  assert.match(auctionBuyReason(s, 8, 3), /已结拍/);
  const item = { kind: 'curio' as const, id: lot.id, quantity: 1, forgeLevel: 0 };
  assert.equal(sellAuction(s, item, 1, 3, true), undefined);
  assert.equal(sellAuction(s, item, 1, 3)!.outcome, 'sold');
  assert.equal(ownsCurio(s, lot.id as (typeof CURIO_IDS)[number]), false);
  initial.age += 10;
  beginSectMarketVisit(initial);
  prepareAuction(initial);
  const unchanged = JSON.stringify(initial);
  assert.equal(buyAuction(initial, 8, 50000, 2, false, cycle), undefined);
  assert.equal(JSON.stringify(initial), unchanged);
});
test('寻访三次到账、十年额度共享；卖掉不重置已完成进度、掌天瓶不可定向', () => {
  const s = ready();
  beginSectMarketVisit(s);
  const id = 'soul-wood';
  let total = 0;
  for (let i = 0; i < 3; i++) {
    const q = curioSeekingQuote(s, id);
    assert.equal(q.reason, '');
    total += q.price;
    assert.ok(seekCurio(s, id, venueStamp(s)));
    assert.equal(s.curios.seeking[id], i + 1);
    assert.equal(s.curios.bag[id] ?? 0, i === 2 ? 1 : 0);
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
test('当前档完整往返、浮点十年边界、旧档迁移和坏奇物状态拒绝', () => {
  const s = ready();
  grantCurio(s, 'soul-wood');
  grantCurio(s, 'soul-wood');
  s.curios.seeking['wind-wings'] = 2;
  s.curios.soughtAt = 30;
  beginSectMarketVisit(s);
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
    { ...s.curios, seeking: { 'wind-wings': 4 } },
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
    beginSectMarketVisit(s);
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
    beginSectMarketVisit(base);
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
      assert.equal(enhanced.stats.hp, Math.round((100 + 50 * 1.15) * 1.2));
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
