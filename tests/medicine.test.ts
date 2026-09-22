import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MEDICINES,
  freshMedicine,
  medicineEffects,
  medicineFormula,
  medicineLoot,
  refreshMedicineShop,
  validMedicine,
} from '../src/medicine-data.ts';
import { buyMedicine, buyMedicineRecipe, craftMedicine, useMedicine } from '../src/medicine.ts';
import { freshSave, parseSave, realmCost, retreat, settleRun } from '../src/progress.ts';
import { Game } from '../src/game.ts';
import { importSave, exportSave } from '../src/save-transfer.ts';
import { advanceMortal, joinSect } from '../src/mortal.ts';
import { SPIRIT_ROOTS, STAGE_ENEMIES, DIFFICULTIES } from '../src/data.ts';
import { medicineContent, medicineTime } from '../src/medicine-ui.ts';
import { guideContent } from '../src/guide.ts';

test('丹药时长明确为按秘境流速折算的药效时间，不是关卡倒计时', () => {
  assert.equal(medicineTime(100, 0), '100 年 · 按所选秘境流速，药效约可持续 10分00秒');
  assert.equal(medicineTime(100, 1), '100 年 · 按所选秘境流速，药效约可持续 04分00秒');
  assert.equal(medicineTime(100, 6), '100 年 · 按所选秘境流速，药效约可持续 00分06秒');
});

const rich = () => {
  const s = freshSave();
  s.stones = 10000;
  s.cultivation = 20000;
  s.unlocked = 6;
  for (const m of MEDICINES) s.medicine.bag[m.id] = 20;
  return s;
};
const quiet = (s = rich(), stage = 0) => {
  const g = new Game(s, stage, 0, () => 0.8);
  g.weapons[0].timer = 9999;
  g.nextElite = 9999;
  g.spawnBudget = -10000;
  return g;
};
const approx = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test('品级筛选不混入其他品级，未得永久丹药完全隐藏，吃完仍保留药谱', () => {
  const s = freshSave();
  const hidden = MEDICINES.filter((m) => !m.years);
  const html = medicineContent(s, 0, 'bag', false, false);
  assert.equal((html.match(/<article /g) || []).length, 24);
  for (const m of hidden) {
    assert.ok(!html.includes(m.name));
    assert.ok(!html.includes(m.desc));
    assert.ok(!guideContent('medicine').includes(m.name));
  }
  for (const tier of ['凡品', '灵品', '珍品'] as const) {
    const filtered = medicineContent(s, 0, 'bag', false, false, tier);
    const names = [...filtered.matchAll(/<h3>([^<]+)<\/h3>/g)].map((m) => m[1]);
    assert.deepEqual(
      names,
      MEDICINES.filter((m) => m.years && m.tier === tier).map((m) => m.name),
    );
  }
  s.medicine.bag.peiying = 1;
  assert.equal(useMedicine(s, 'peiying').ok, true);
  assert.equal(s.chronicle.milestones['permanent-medicine'], s.age);
  const restored = parseSave(JSON.stringify(s));
  const visible = medicineContent(restored, 0, 'bag', false, false, '珍品');
  assert.match(visible, /培婴丹/);
  assert.match(visible, /本世已用 1 \/ 3 次/);
  assert.equal((visible.match(/<article /g) || []).length, 9);
  for (const m of hidden.filter((m) => m.id !== 'peiying')) assert.ok(!visible.includes(m.name));
  const crafts = medicineContent(restored, 0, 'craft', false, false, '珍品');
  assert.ok(!crafts.includes('培婴丹'));
  assert.equal((crafts.match(/<article /g) || []).length, 8);
});

test('28种丹药为8凡8灵8限时珍品4永久珍品，药方只消耗低一档成丹', () => {
  assert.equal(new Set(MEDICINES.map((m) => m.id)).size, 28);
  assert.deepEqual(
    ['凡品', '灵品', '珍品'].map((tier) => MEDICINES.filter((m) => m.tier === tier).length),
    [8, 8, 12],
  );
  assert.equal(MEDICINES.filter((m) => !m.years).length, 4);
  for (const seed of [0, 1, 42, 12345678, 4294967295]) {
    const state = freshMedicine(() => 0);
    state.recipeSeed = seed;
    for (const m of MEDICINES) {
      const f = medicineFormula(state, m.id);
      if (!m.years || m.tier === '凡品') assert.equal(f.length, 0);
      else {
        assert.equal(f.length, 2);
        assert.notEqual(f[0].id, f[1].id);
        assert.equal(
          f.reduce((n, item) => n + item.count, 0),
          m.tier === '灵品' ? 3 : 4,
        );
        assert.ok(
          f.every(
            (item) =>
              MEDICINES.find((v) => v.id === item.id)!.tier ===
              (m.tier === '灵品' ? '凡品' : '灵品'),
          ),
        );
        assert.equal(m.craftYears, m.tier === '灵品' ? 50 : 500);
      }
    }
  }
});
test('本世配方固定，换关和导入不重抽；轮回种子改变配方且清空丹药', () => {
  const s = rich();
  const before = MEDICINES.map((m) => medicineFormula(s.medicine, m.id));
  assert.equal(buyMedicineRecipe(s, 'heqi'), true);
  const imported = importSave(exportSave(s, null)).save;
  new Game(imported, 4, 0);
  assert.deepEqual(
    MEDICINES.map((m) => medicineFormula(imported.medicine, m.id)),
    before,
  );
  assert.deepEqual(imported.medicine.recipes, ['heqi']);
  const next = freshMedicine(() => ((s.medicine.recipeSeed + 12345) >>> 0) / 4294967296);
  assert.notDeepEqual(
    MEDICINES.map((m) => medicineFormula(next, m.id)),
    before,
  );
  assert.deepEqual(next.bag, {});
  assert.deepEqual(next.recipes, []);
});
test('药铺每十年只轮售三种凡品，刷新不重抽，高阶成丹不能买', () => {
  const s = rich();
  refreshMedicineShop(s.medicine, 15, () => 0);
  const batch = structuredClone(s.medicine.shop);
  assert.equal(batch!.refreshAt, 25);
  assert.equal(new Set(batch!.ids).size, 3);
  assert.equal(
    refreshMedicineShop(s.medicine, 24.999, () => 0.99),
    false,
  );
  const restored = parseSave(JSON.stringify(s));
  assert.deepEqual(restored.medicine.shop, batch);
  assert.equal(buyMedicine(s, batch!.ids[0]), true);
  assert.equal(buyMedicine(s, 'mingqing'), false);
  assert.equal(buyMedicine(s, 'yingxiang'), false);
  s.age = 46;
  assert.equal(
    refreshMedicineShop(s.medicine, s.age, () => 0.99),
    true,
  );
  assert.equal(s.medicine.shop!.refreshAt, 55);
  assert.notDeepEqual(s.medicine.shop!.ids, batch!.ids);
  assert.ok(
    s.medicine.shop!.ids.every((id) => MEDICINES.find((m) => m.id === id)!.tier === '凡品'),
  );
});
test('药铺每批每种限购三份，读档不重置额度，十年换货后恢复', () => {
  const s = rich();
  refreshMedicineShop(s.medicine, s.age, () => 0);
  const id = s.medicine.shop!.ids[0];
  for (let i = 0; i < 3; i++) assert.equal(buyMedicine(s, id), true);
  const restored = importSave(exportSave(s, null)).save;
  const before = structuredClone(restored);
  assert.equal(buyMedicine(restored, id), false);
  assert.deepEqual(restored, before);
  assert.equal(restored.medicine.bag[id], 23);
  restored.age = restored.medicine.shop!.refreshAt;
  refreshMedicineShop(restored.medicine, restored.age, () => 0);
  assert.equal(buyMedicine(restored, id), true);
  assert.equal(restored.medicine.shop!.bought![id], 1);
  const legacy = structuredClone(s);
  delete legacy.medicine.shop!.bought;
  assert.ok(validMedicine(legacy.medicine));
  legacy.medicine.shop!.bought = { [id]: 4 };
  assert.throws(() => importSave(JSON.stringify(legacy)));
});
test('买药方后合成，真实扣除对应成丹、灵石及50/500年；凡品与永久珍品不能合成', () => {
  for (const id of ['heqi', 'mingqing']) {
    const s = rich();
    assert.equal(craftMedicine(s, id).ok, false);
    assert.equal(buyMedicineRecipe(s, id), true);
    const before = structuredClone(s);
    const result = craftMedicine(s, id);
    assert.equal(result.ok, true, result.message);
    const years = id === 'heqi' ? 50 : 500;
    assert.equal(s.age - before.age, years);
    assert.equal(s.mortal.years - before.mortal.years, years);
    assert.equal(before.stones - s.stones, id === 'heqi' ? 40 : 100);
    assert.equal(s.medicine.bag[id], before.medicine.bag[id] + 1);
    for (const item of medicineFormula(s.medicine, id))
      assert.equal(s.medicine.bag[item.id], before.medicine.bag[item.id] - item.count);
  }
  for (const id of ['huanglong', 'butian', 'huiyang', 'peiying', 'jiuqu']) {
    const s = rich(),
      before = structuredClone(s);
    assert.equal(buyMedicineRecipe(s, id), false);
    assert.equal(craftMedicine(s, id).ok, false);
    assert.deepEqual(s, before);
  }
});
test('材料、钱、寿元不足或有续局时合成原子失败；到期供奉一并结算', () => {
  for (const fail of ['life', 'stones', 'materials', 'pending', 'tribulation']) {
    const s = rich();
    buyMedicineRecipe(s, 'heqi');
    if (fail === 'life') {
      s.cultivation = 0;
      s.age = 51;
    }
    if (fail === 'stones') s.stones = 0;
    if (fail === 'materials') s.medicine.bag = {};
    if (fail === 'tribulation') s.nextTribulationAge = s.age + 20;
    const before = structuredClone(s);
    assert.equal(craftMedicine(s, 'heqi', fail === 'pending').ok, false);
    assert.deepEqual(s, before);
  }
  const s = rich();
  s.cultivation = 0;
  joinSect(s, 'power');
  buyMedicineRecipe(s, 'heqi');
  s.stones = 100;
  const before = structuredClone(s);
  assert.equal(craftMedicine(s, 'heqi').ok, false);
  assert.deepEqual(s, before);
  s.stones = 1000;
  assert.equal(craftMedicine(s, 'heqi').ok, true);
  assert.equal(s.stones, 860); // 两期供奉100 + 炼制40
  assert.equal(s.age, 65);
  assert.equal(s.mortal.member!.dueAt, 60);
});
test('补天丹严格提升一个品质档，随机新数量与五行，不降级、不提供选择', () => {
  const ranks = { none: 0, quad: 1, five: 1, dual: 2, triple: 2, variant: 3, heaven: 4 };
  for (const root of SPIRIT_ROOTS)
    for (const roll of [0, 0.99]) {
      const s = freshSave(root.id);
      s.medicine.bag.butian = 1;
      const before = structuredClone(s);
      const result = useMedicine(s, 'butian', false, 1, () => roll);
      if (root.id === 'heaven') {
        assert.equal(result.ok, false);
        assert.deepEqual(s, before);
      } else {
        assert.equal(result.ok, true);
        assert.equal(ranks[s.spiritRoot], ranks[root.id] + 1);
        assert.equal(s.medicine.bag.butian, 0);
        assert.equal(new Set(s.rootElements).size, s.rootElements.length);
      }
    }
});
test('永久丹药每世次数与境界门槛生效，培婴百分比作用于真实战斗属性', () => {
  const s = rich();
  s.cultivation = 0;
  for (let i = 0; i < 2; i++) assert.equal(useMedicine(s, 'huiyang').ok, true);
  assert.equal(s.lifespanBonus, 50);
  assert.equal(useMedicine(s, 'huiyang').ok, false);
  const base = new Game(s, 0, 0);
  for (let i = 0; i < 3; i++) assert.equal(useMedicine(s, 'peiying').ok, true);
  assert.equal(useMedicine(s, 'peiying').ok, false);
  const g = new Game(s, 0, 0);
  assert.equal(g.player.maxHp, Math.round(base.player.maxHp * 1.15));
  approx(g.stats.regen, base.stats.regen * 1.15);
  assert.equal(useMedicine(s, 'jiuqu').ok, true);
  assert.equal(useMedicine(s, 'jiuqu').ok, false);
  assert.equal(s.cultivation, Math.floor((realmCost(0) + realmCost(1) + realmCost(2)) * 0.08));
  assert.ok(Object.hasOwn(s.chronicle.milestones, 'permanent-medicine'));
  assert.equal(s.chronicle.entries.filter((entry) => entry.title === '丹药入体').length, 6);
  s.cultivation = 1e9;
  assert.equal(useMedicine(s, 'jiuqu').ok, false);
});
test('同药可批量服用，时长累加并保留余时，强度不叠加且存档保留', () => {
  const s = rich();
  const age = s.age;
  assert.equal(useMedicine(s, 'huanglong', false, 5).ok, true);
  assert.equal(s.medicine.bag.huanglong, 15);
  assert.equal(s.medicine.active.huanglong, age + 500);
  const damage = new Game(s, 0, 0).stats.damage;
  s.age += 20;
  assert.equal(useMedicine(s, 'huanglong', false, 3).ok, true);
  assert.equal(s.medicine.bag.huanglong, 12);
  assert.equal(s.medicine.active.huanglong, age + 800);
  assert.equal(new Game(s, 0, 0).stats.damage, damage);
  const restored = parseSave(JSON.stringify(s));
  assert.equal(restored.medicine.active.huanglong, age + 800);
  assert.equal(restored.medicine.bag.huanglong, 12);
  s.age = age + 900;
  assert.equal(useMedicine(s, 'huanglong', false, 2).ok, true);
  assert.equal(s.medicine.active.huanglong, s.age + 200);
});
test('批量服药数量非法、库存不足、续局或永久丹药批量均不扣药', () => {
  for (const count of [0, -1, 1.5, NaN, Infinity, 21]) {
    const s = rich();
    const before = structuredClone(s);
    assert.equal(useMedicine(s, 'huanglong', false, count).ok, false);
    assert.deepEqual(s, before);
  }
  for (const [id, unfinished] of [
    ['huanglong', true],
    ['peiying', false],
  ] as const) {
    const s = rich();
    const before = structuredClone(s);
    assert.equal(useMedicine(s, id, unfinished, 3).ok, false);
    assert.deepEqual(s, before);
  }
});
test('战前限三种药效，续局不能服药，同药延续时长，年龄决定过期', () => {
  const s = rich();
  for (const id of ['huanglong', 'jinsui', 'yingxiang']) assert.equal(useMedicine(s, id).ok, true);
  const before = structuredClone(s);
  assert.equal(useMedicine(s, 'heqi').ok, false);
  assert.deepEqual(s, before);
  s.age += 20;
  assert.equal(useMedicine(s, 'huanglong').ok, true);
  assert.equal(s.medicine.active.huanglong, before.age + 200);
  const g = quiet(s);
  g.pause();
  const age = s.age;
  g.update(0.05);
  assert.equal(s.age, age);
  assert.equal(useMedicine(s, 'butian', true).ok, false);
  s.age += 81;
  const restored = Game.restore(s, g.snapshot())!;
  assert.ok(restored);
  assert.equal(restored.player.maxHp, new Game(s, 0, 0).player.maxHp);
  approx(restored.stats.damage, new Game(s, 0, 0).stats.damage);
  assert.equal(useMedicine(s, 'heqi').ok, true);
  const future = s.medicine.active.heqi;
  advanceMortal(s, 60);
  assert.equal(s.medicine.active.heqi, future);
  retreat(s, 1, () => 1);
  assert.equal(s.medicine.active.heqi, future);
});
test('毒龙珠过期不会回血，刷新续局也不能靠气血上限恢复刷血', () => {
  const s = rich();
  useMedicine(s, 'dulong');
  const g = quiet(s);
  g.player.hp = 20;
  g.pause();
  const snapshot = g.snapshot();
  s.age = s.medicine.active.dulong;
  const restored = Game.restore(s, snapshot)!;
  approx(restored.player.hp, 20);
  const next = Game.restore(s, restored.snapshot())!;
  approx(next.player.hp, 20);
});
test('虚灵丹只增加击杀修为，过期与读档不回溯、不重复记账', () => {
  const kill = (pill: boolean, boss: boolean) => {
    const s = rich();
    if (pill) useMedicine(s, 'xuling');
    const g = quiet(s, 3);
    const e = g.spawnEnemy(STAGE_ENEMIES[3][0], false, boss, { x: 500, y: 0 });
    if (boss) g.bossSpawned = true;
    const before = s.cultivation;
    g.hitEnemy(e, 1e9);
    return { g, s, earned: s.cultivation - before };
  };
  const plain = kill(false, false),
    buff = kill(true, false);
  approx(buff.g.combatCultivation + 0.7, (plain.g.combatCultivation + 0.7) * 1.2);
  assert.equal(
    buff.g.pickups.find((p) => p.kind === 'xp')!.value,
    plain.g.pickups.find((p) => p.kind === 'xp')!.value,
  );
  const b = kill(false, true),
    p = kill(true, true);
  approx(p.g.bossCultivation, b.g.bossCultivation * 1.3);
  const earned = p.s.cultivation;
  p.s.age = p.s.medicine.active.xuling;
  buff.g.pause();
  const normalEarned = buff.s.cultivation;
  buff.s.age = buff.s.medicine.active.xuling;
  assert.ok(Game.restore(buff.s, buff.g.snapshot()));
  assert.equal(buff.s.cultivation, normalEarned);
  assert.equal(p.s.cultivation, earned);
  const result = settleRun(p.s, { ...p.g, victory: true });
  assert.equal(p.s.cultivation - earned, result.cultivationRemaining);
});
test('定灵丹降低迟滞和魔功负面属性，明清灵水只额外增伤精英与妖王', () => {
  const s = rich();
  useMedicine(s, 'dingling');
  const g = quiet(s);
  g.passives = {
    frenzy: 3,
    bone: 3,
    curse: 3,
    blood: 3,
    soul: 3,
    abyss: 3,
    devour: 3,
    forbidden: 3,
  };
  g.slowed = 0.65;
  const plain = quiet(rich());
  plain.passives = { ...g.passives };
  plain.slowed = 0.65;
  assert.ok(g.stats.damage > plain.stats.damage);
  assert.ok(g.stats.speed > plain.stats.speed);
  assert.ok(g.stats.regen > plain.stats.regen);
  assert.ok(g.stats.armor < plain.stats.armor);
  const h = rich();
  useMedicine(h, 'mingqing');
  const m = quiet(h);
  for (const elite of [false, true]) {
    const e = m.spawnEnemy(0, elite, false, { x: 500, y: 0 });
    e.hp = e.maxHp = 10000;
    m.hitEnemy(e, 100);
    approx(10000 - e.hp, elite ? 115 : 100);
  }
});
test('清灵与无常确实减免毒池，雪魄周期减速；暂停不推进药效', () => {
  for (const id of ['qingling', 'wuchang']) {
    const s = rich();
    useMedicine(s, id);
    const g = quiet(s);
    const hp = g.player.hp;
    g.zones.push({
      x: 0,
      y: 0,
      radius: 50,
      life: 2,
      maxLife: 2,
      damage: 10,
      color: '#fff',
      kind: 'enemy-miasma',
      tick: 0,
      delay: 0,
      hostile: true,
    });
    g.update(0.01);
    approx(hp - g.player.hp, 10 * (id === 'qingling' ? 0.8 : 0.6));
  }
  const s = rich();
  useMedicine(s, 'xuepo');
  const g = quiet(s);
  const e = g.spawnEnemy(0, false, false, { x: 100, y: 0 });
  g.update(0.01);
  assert.ok(e.slow > 1.9);
  const next = g.nextMedicinePulse;
  g.pause();
  g.update(0.05);
  assert.equal(g.nextMedicinePulse, next);
});
test('妖王灵品概率、限时首通保底与永久稀有池独立，终关前六王不出永久药', () => {
  for (let stage = 0; stage < 7; stage++) {
    const s = freshMedicine(() => 0);
    medicineLoot(s, stage, false, false, () => 0);
    const ids = Object.keys(s.bag);
    assert.equal(ids.length, 1);
    assert.equal(MEDICINES.find((m) => m.id === ids[0])!.years === 0, stage === 4 || stage === 5);
    const guaranteed = freshMedicine(() => 0);
    medicineLoot(guaranteed, stage, true, false, () => 0.9);
    if (stage >= 2) {
      assert.equal(Object.keys(guaranteed.bag).length, 1);
      assert.ok(MEDICINES.find((m) => m.id === Object.keys(guaranteed.bag)[0])!.years);
    }
    const before = structuredClone(guaranteed.bag);
    medicineLoot(guaranteed, stage, true, false, () => 0.9);
    assert.deepEqual(guaranteed.bag, before);
    assert.deepEqual(s.recipes, []);
  }
  const s = freshMedicine(() => 0);
  medicineLoot(s, 6, false, true, () => 0.02);
  assert.ok(!MEDICINES.find((m) => m.id === Object.keys(s.bag)[0])!.years);
  const none = freshMedicine(() => 0);
  medicineLoot(none, 4, false, false, () => 0.9);
  assert.deepEqual(none.bag, {});
});
test('旧档补默认丹囊，异常导入拒绝而不吞进度，库存与药效完整往返', () => {
  const old = rich();
  delete old.medicine;
  assert.ok(validMedicine(parseSave(JSON.stringify(old)).medicine));
  const s = rich();
  useMedicine(s, 'mingqing');
  refreshMedicineShop(s.medicine, s.age, () => 0.5);
  buyMedicineRecipe(s, 'heqi');
  const restored = importSave(exportSave(s, null)).save;
  assert.deepEqual(restored.medicine, s.medicine);
  for (const patch of [
    { bag: { fake: 1 } },
    { active: { huiyang: 20 } },
    { used: { peiying: 4 } },
    { recipeSeed: -1 },
    { recipes: ['butian'] },
    { shop: { ids: ['heqi', 'jinsui', 'yangjing'], refreshAt: 20 } },
  ]) {
    const invalid = structuredClone(s);
    Object.assign(invalid.medicine, patch);
    assert.throws(() => importSave(JSON.stringify(invalid)));
  }
});
test('七关仅小幅增加气血3%伤害2%，密度倍率与收益不变', () => {
  DIFFICULTIES.forEach((d, i) => {
    approx(d.hp, [0.85, 1.12, 1.9][i] * 1.03);
    approx(d.damage, [0.72, 1, 1.45][i] * 1.02);
    assert.equal(d.amount, [0.9, 1.13, 1.35][i]);
  });
});
