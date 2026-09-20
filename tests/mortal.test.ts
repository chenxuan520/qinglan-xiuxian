import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSave, parseSave, realmCost, realmBonuses } from '../src/progress.ts';
import { SECTS, SECT_DUES, MAX_MASTERY } from '../src/mortal-data.ts';
import {
  advanceMortal,
  entryCost,
  joinSect,
  leaveSect,
  masteryBonus,
  sectDues,
  sectRole,
  startActivity,
  studyPlan,
  tradeIron,
  sectDuesPending,
  settleSectDues,
} from '../src/mortal.ts';
import { PASSIVES, SPIRIT_ROOTS, treasure, evolutionPassives } from '../src/data.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';
import { Game } from '../src/game.ts';

function wealthy(step = 0) {
  const s = freshSave();
  s.stones = 20000;
  s.cultivation = Array.from({ length: step }, (_, i) => realmCost(i)).reduce((a, b) => a + b, 0);
  if (step === 24) s.completed = [6];
  return s;
}
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);

test('正魔各八宗，与十六功法一一对应', () => {
  assert.deepEqual(
    SECTS.map((s) => s.id),
    PASSIVES.map((p) => p.id),
  );
  assert.equal(SECTS.filter((s) => s.school === 'orthodox').length, 8);
  assert.equal(SECTS.filter((s) => s.school === 'demonic').length, 8);
  assert.equal(new Set(SECTS.map((s) => s.name)).size, 16);
});
test('城镇前台一分钟一年，同时扣寿元；无时间输入不补算', () => {
  const s = freshSave();
  advanceMortal(s, 60);
  near(s.age, 16);
  near(s.mortal.years, 1);
  advanceMortal(s, 0);
  advanceMortal(s, NaN);
  near(s.age, 16);
});
test('旧档补空人间数据，导出导入保留身份、账期、研习与精研', () => {
  const s = wealthy(6);
  joinSect(s, 'power');
  s.mortal.mastery.power = 2;
  startActivity(s, 'study');
  advanceMortal(s, 12);
  assert.deepEqual(importSave(exportSave(s, null)).save.mortal, s.mortal);
  const old = { ...s, mortal: undefined };
  assert.deepEqual(parseSave(JSON.stringify(old)).mortal, freshSave().mortal);
  assert.throws(() => importSave(JSON.stringify({ ...s, mortal: { ...s.mortal, years: -1 } })));
});
test('入门费随资质变化，天灵根最低；只能加入一个宗门', () => {
  const costs = SPIRIT_ROOTS.map((r) => entryCost(freshSave(r.id)));
  for (let i = 1; i < costs.length; i++) assert.ok(costs[i] > costs[i - 1]);
  const s = freshSave();
  assert.equal(joinSect(s, 'power'), false);
  s.stones = entryCost(s);
  assert.equal(joinSect(s, 'power'), true);
  assert.equal(s.stones, 0);
  assert.equal(joinSect(s, 'blood'), false);
});
test('供奉在边界准时扣除；不足暂停待补缴，放弃才清退', () => {
  const s = wealthy();
  joinSect(s, 'power');
  s.stones = 80;
  advanceMortal(s, 1199);
  assert.equal(s.stones, 80);
  advanceMortal(s, 1);
  assert.equal(s.stones, 0);
  assert.equal(s.mortal.member?.dueAt, 40);
  advanceMortal(s, 1200);
  assert.equal(sectDuesPending(s), true);
  assert.equal(settleSectDues(s, true), true);
  assert.equal(s.mortal.member, null);
  assert.equal(s.stones, 0);
});
test('境界越高供奉间隔越长，金额递增至上限；突破不修改已承诺账单', () => {
  const s = wealthy();
  joinSect(s, 'power');
  s.cultivation = Array.from({ length: 6 }, (_, i) => realmCost(i)).reduce((a, b) => a + b, 0);
  assert.deepEqual(sectDues(s), SECT_DUES[2]);
  assert.equal(s.mortal.member?.dues, 80);
  const before = s.stones;
  advanceMortal(s, 1200);
  assert.equal(s.stones, before - 80);
  assert.equal(s.mortal.member?.dues, 450);
  assert.equal(s.mortal.member?.dueAt, 120);
  for (let i = 1; i < SECT_DUES.length - 1; i++) {
    assert.ok(SECT_DUES[i].years >= SECT_DUES[i - 1].years);
    assert.ok(SECT_DUES[i].stones >= SECT_DUES[i - 1].stones);
  }
});
test('供奉单次最多一千，低境界原价、缴费间隔及真仙免供奉保留', () => {
  const amounts = [80, 200, 450, 1000, 1000, 1000, 1000, 1000, 0];
  const years = [20, 50, 100, 200, 400, 1000, 2000, 5000, 0];
  for (let realm = 0; realm < amounts.length; realm++) {
    const s = wealthy();
    s.cultivation = Array.from({ length: realm * 3 }, (_, i) => realmCost(i)).reduce(
      (sum, cost) => sum + cost,
      0,
    );
    if (realm === 8) s.completed = [6];
    assert.deepEqual(sectDues(s), { stones: amounts[realm], years: years[realm] });
    joinSect(s, 'power');
    assert.equal(s.mortal.member?.dues, amounts[realm]);
  }
});
test('旧档和导入的未缴高额供奉立即封顶，不改变到期日或其他进度', () => {
  for (const dues of [80, 200, 450, 1000, 2200, 6000, 14000, 30000]) {
    const s = wealthy();
    s.cultivation = 1e9;
    joinSect(s, 'power');
    s.mortal.member!.dues = dues;
    s.mortal.mastery.power = 4;
    startActivity(s, 'study');
    s.mortal.years = 4999;
    const expected = structuredClone(s.mortal);
    expected.member!.dues = Math.min(dues, 1000);
    for (const restored of [parseSave(JSON.stringify(s)), importSave(exportSave(s, null)).save]) {
      assert.deepEqual(restored.mortal, expected);
      assert.equal(restored.stones, s.stones);
      assert.equal(restored.age, s.age);
      assert.equal(restored.cultivation, s.cultivation);
    }
  }
});
test('旧高额账单结算最多扣一千，按封顶后的金额判断余额不足', () => {
  for (const stones of [999, 1000, 1200]) {
    const s = wealthy();
    s.cultivation = 1e9;
    joinSect(s, 'power');
    s.mortal.member!.dues = 30000;
    s.mortal.years = 4999;
    s.stones = stones;
    advanceMortal(s, 60);
    if (stones < 1000) {
      assert.equal(sectDuesPending(s), true);
      settleSectDues(s, true);
      assert.equal(s.mortal.member, null);
      assert.equal(s.stones, stones);
    } else {
      assert.equal(s.stones, stones - 1000);
      assert.equal(s.mortal.member?.id, 'power');
      assert.equal(s.mortal.member?.dueAt, 10000);
      assert.equal(s.mortal.member?.dues, 1000);
    }
  }
});
test('研习需成员身份，耗时完成才升级；新局自动获得本门一重功法', () => {
  const s = wealthy(2);
  assert.equal(startActivity(s, 'study'), false);
  joinSect(s, 'power');
  startActivity(s, 'study');
  advanceMortal(s, 59);
  assert.equal(s.mortal.mastery.power, undefined);
  advanceMortal(s, 1);
  assert.equal(s.mortal.mastery.power, 1);
  assert.equal(s.mortal.activity, null);
  assert.deepEqual(new Game(s, 0, 0).passives, { power: 1 });
  s.mortal.mastery.power = MAX_MASTERY;
  assert.equal(startActivity(s, 'study'), false);
});
test('低资质精研更慢；离开与读档不丢失进行中的研习', () => {
  const s = wealthy(2);
  joinSect(s, 'power');
  const fast = studyPlan(s).years;
  s.spiritRoot = 'none';
  assert.ok(studyPlan(s).years > fast);
  startActivity(s, 'study');
  advanceMortal(s, 30);
  assert.deepEqual(parseSave(JSON.stringify(s)).mortal, s.mortal);
});
test('退宗保留精研，只有当前宗门加成；重新入宗恢复', () => {
  const s = wealthy(24);
  joinSect(s, 'power');
  s.mortal.mastery = { power: 10, blood: 10 };
  near(masteryBonus(s, 'power'), 0.3);
  assert.equal(masteryBonus(s, 'blood'), 0);
  leaveSect(s);
  assert.equal(s.mortal.mastery.power, 10);
  assert.equal(masteryBonus(s, 'power'), 0);
  joinSect(s, 'power');
  near(masteryBonus(s, 'power'), 0.3);
});
test('同刻欠费先暂停精研结算，放弃补缴不发放成果', () => {
  const s = wealthy(2);
  joinSect(s, 'power');
  advanceMortal(s, 1140);
  startActivity(s, 'study');
  s.stones = 0;
  advanceMortal(s, 60);
  assert.equal(sectDuesPending(s), true);
  assert.equal(s.mortal.mastery.power, undefined);
  settleSectDues(s, true);
  assert.equal(s.mortal.member, null);
  assert.equal(s.mortal.activity, null);
  assert.equal(s.mortal.mastery.power, undefined);
});
test('欠费状态可读档，广告物资不足时可分次补足，补缴只扣一次并完成同刻精研', () => {
  const s = wealthy(2);
  joinSect(s, 'power');
  advanceMortal(s, 1140);
  startActivity(s, 'study');
  s.stones = 0;
  s.mortal.member!.dues = 1000;
  advanceMortal(s, 600);
  assert.equal(sectDuesPending(s), true);
  assert.equal(s.mortal.years, 20);
  const restored = importSave(exportSave(s, null)).save;
  const age = restored.age;
  advanceMortal(restored, 600);
  assert.equal(restored.age, age);
  for (let i = 0; i < 3; i++) {
    restored.stones += 300;
    assert.equal(settleSectDues(restored), false);
  }
  restored.stones += 300;
  assert.equal(settleSectDues(restored), true);
  assert.equal(restored.stones, 200);
  assert.equal(restored.mortal.member!.id, 'power');
  assert.equal(restored.mortal.member!.dueAt, 40);
  assert.equal(restored.mortal.mastery.power, 1);
  assert.equal(restored.mortal.activity, null);
  assert.equal(settleSectDues(restored), false);
  assert.deepEqual(importSave(exportSave(restored, null)).save.mortal, restored.mortal);
});
test('寿尽和天劫准确截停人间时间，不能继续工作', () => {
  const s = freshSave();
  s.age = 99.5;
  startActivity(s, 'herbs');
  advanceMortal(s, 60);
  near(s.age, 100);
  near(s.mortal.years, 0.5);
  assert.equal(s.stones, 0);
  advanceMortal(s, 60);
  near(s.age, 100);
  const immortal = wealthy();
  immortal.cultivation = 1e9;
  immortal.nextTribulationAge = 20000;
  immortal.age = 19999.5;
  advanceMortal(immortal, 60);
  near(immortal.age, 20000);
  assert.equal(startActivity(immortal, 'tea'), false);
});
test('委托收入只领取一次，坊市不能无成本套利，茶馆不是高效资源来源', () => {
  const s = freshSave();
  startActivity(s, 'escort');
  advanceMortal(s, 120);
  assert.equal(s.stones, 40);
  assert.equal(s.iron, 1);
  advanceMortal(s, 60);
  assert.equal(s.stones, 40);
  tradeIron(s, true);
  tradeIron(s, false);
  assert.equal(s.stones, 22);
  startActivity(s, 'tea');
  advanceMortal(s, 30, () => 0.9);
  assert.equal(s.stones, 22);
});
test('听书原有机缘在半载委托完成时判定，30% 边界与一次结算保留', () => {
  for (const roll of [0, 0.299999, 0.3, 0.9]) {
    const s = freshSave();
    assert.equal(startActivity(s, 'tea'), true);
    assert.equal(startActivity(s, 'tea'), false);
    advanceMortal(s, 29, () => roll);
    assert.equal(s.stones, 0);
    assert.equal(s.mortal.activity?.kind, 'tea');
    advanceMortal(s, 1, () => roll);
    assert.equal(s.stones, roll < 0.3 ? 8 : 0);
    assert.equal(s.mortal.activity, null);
    near(s.age, 15.5);
    advanceMortal(s, 60, () => 0);
    assert.equal(s.stones, roll < 0.3 ? 8 : 0);
    assert.equal(s.iron, 0);
    assert.equal(s.cultivation, 0);
  }
});
test('精研增强正向功法效果，保留原魔道代价与局内等级', () => {
  const s = wealthy(24);
  joinSect(s, 'power');
  s.mortal.mastery.power = 10;
  const g = new Game(s, 0, 0);
  g.passives.power = 2;
  near(g.stats.damage, (1 + realmBonuses(24).damage + 0.24 * 1.3) * 2);
  assert.equal(g.passives.power, 2);
  leaveSect(s);
  near(g.stats.damage, (1.24 + realmBonuses(24).damage) * 2);
  joinSect(s, 'blood');
  s.mortal.mastery.blood = 10;
  g.passives = { blood: 1 };
  near(g.stats.damage, (1 + realmBonuses(24).damage + 0.18 * 1.3) * 2);
  near(g.stats.armor, 1.03);
});
test('所有宗门均增强对应功法，气血变化可安全恢复续局', () => {
  for (const sect of SECTS) {
    const s = wealthy(24);
    const g = new Game(s, 0, 0);
    g.passives[sect.id] = 1;
    g.player.hp = g.player.maxHp / 4;
    const before = g.stats;
    joinSect(s, sect.id);
    s.mortal.mastery[sect.id] = 10;
    const after = g.stats;
    if (sect.id === 'bone') {
      const restored = Game.restore(s, g.snapshot())!;
      assert.ok(restored.player.maxHp > g.player.maxHp);
    } else assert.notDeepEqual(after, before, sect.name);
    assert.equal(g.passives[sect.id], 1);
  }
});

test('精研不能代替功法三重，也不会绕过历练路线', () => {
  const s = wealthy(24);
  const manual = evolutionPassives(treasure('sword'), 'orthodox')[0];
  joinSect(s, manual);
  s.mortal.mastery[manual] = 10;
  s.path = 'orthodox';
  const g = new Game(s, 0, 0);
  g.weapons[0].level = 6;
  g.passives[manual] = 2;
  assert.ok(!g.makeChoices().some((c) => c.type === 'evolve'));
  g.passives[manual] = 3;
  assert.ok(g.makeChoices().some((c) => c.type === 'evolve' && c.id === 'sword'));
  leaveSect(s);
  joinSect(s, 'blood');
  s.mortal.mastery.blood = 10;
  for (let i = 0; i < 20; i++)
    assert.ok(!g.makeChoices().some((c) => c.type === 'passive' && c.id === 'blood'));
});

test('九幽减速、拘魂吸取和白骨反击的实际技能获得精研增益', () => {
  for (const id of ['abyss', 'soul', 'bone']) {
    const s = wealthy(24);
    joinSect(s, id);
    s.mortal.mastery[id] = 10;
    const g = new Game(s, 0, 0, () => 0.9);
    g.passives[id] = 1;
    const e = g.spawnEnemy(1, false, false, { x: id === 'soul' ? 140 : 80, y: 0 });
    e.hp = e.maxHp = 10000;
    if (id === 'abyss') {
      g.hitEnemy(e, 1);
      near(e.slow, 0.195);
    } else if (id === 'soul') {
      g.hitEnemy(e, 20000);
      assert.equal(g.pickups.find((p) => p.kind === 'xp')?.pull, true);
    } else {
      g.hurtPlayer(1);
      near(e.maxHp - e.hp, g.player.maxHp * 0.156 * g.stats.damage);
    }
  }
});

test('续局反复恢复不重复增加气血，退宗取消气血加成但不复活死者', () => {
  const s = wealthy(24);
  const g = new Game(s, 0, 0);
  g.passives.guard = 1;
  const base = Game.restore(s, g.snapshot())!;
  base.player.hp -= 30;
  joinSect(s, 'guard');
  s.mortal.mastery.guard = 10;
  const trained = Game.restore(s, base.snapshot())!;
  assert.equal(trained.player.maxHp - base.player.maxHp, 6);
  assert.equal(trained.player.maxHp - trained.player.hp, 30);
  const again = Game.restore(s, trained.snapshot())!;
  assert.equal(again.player.hp, trained.player.hp);
  leaveSect(s);
  const left = Game.restore(s, again.snapshot())!;
  assert.equal(left.player.hp, base.player.hp);
  left.state = 'lost';
  left.player.hp = 0;
  joinSect(s, 'guard');
  assert.equal(Game.restore(s, left.snapshot())!.player.hp, 0);
});

test('借寿计入下一账期，大乘五千年，真仙即时免供奉且保留身份', () => {
  const s = wealthy();
  s.lifespanBonus = 30;
  assert.equal(sectDues(s).years, 26);
  s.cultivation = 1e9;
  assert.equal(sectDues(s).years, 5000);
  joinSect(s, 'power');
  s.mortal.mastery.power = 10;
  s.completed.push(6);
  s.stones = 0;
  advanceMortal(s, 600000);
  assert.equal(sectDues(s).stones, 0);
  assert.equal(s.mortal.member?.dues, 0);
  assert.equal(s.mortal.member?.id, 'power');
  near(masteryBonus(s, 'power'), 0.3);
  assert.deepEqual(importSave(exportSave(s, null)).save.mortal, s.mortal);
});

test('十六宗门开局各送对应一重，占原有功法槽，旧续局不补送', () => {
  for (const sect of SECTS) {
    const s = wealthy();
    joinSect(s, sect.id);
    const g = new Game(s, 0, 0);
    assert.deepEqual(g.passives, { [sect.id]: 1 });
    if (sect.id === 'guard') assert.equal(g.player.maxHp, 134);
    if (sect.id === 'bone') assert.equal(g.player.maxHp, 118);
    const restored = Game.restore(s, g.snapshot())!;
    assert.deepEqual(restored.passives, g.passives);
    const ids = PASSIVES.filter((p) => p.id !== sect.id)
      .slice(0, 3)
      .map((p) => p.id);
    for (const id of ids) g.passives[id] = 1;
    for (let i = 0; i < 10; i++)
      assert.ok(g.makeChoices().every((c) => c.type !== 'passive' || c.id in g.passives));
    leaveSect(s);
    assert.deepEqual(new Game(s, 0, 0).passives, {});
  }
  const s = wealthy();
  const old = new Game(s, 0, 0).snapshot();
  joinSect(s, 'power');
  assert.deepEqual(Game.restore(s, old)!.passives, {});
});

test('入宗锁定路线与本命，退宗后才可改投；不同路线的旧局不被覆盖', () => {
  const s = wealthy();
  s.path = 'orthodox';
  const old = new Game(s, 0, 0);
  const stones = s.stones;
  assert.equal(joinSect(s, 'blood', old.path), false);
  assert.equal(s.stones, stones);
  assert.equal(joinSect(s, 'power', old.path), true);
  assert.equal(s.path, 'orthodox');
  assert.deepEqual(Game.restore(s, old.snapshot())!.passives, {});
  assert.equal(joinSect(s, 'blood'), false);
  leaveSect(s);
  joinSect(s, 'blood');
  assert.equal(s.path, 'demonic');
  assert.equal(treasure(s.starter).school, 'demonic');
  const g = new Game(s, 0, 0);
  assert.equal(g.path, 'demonic');
  assert.deepEqual(g.passives, { blood: 1 });
  for (let i = 0; i < 40; i++)
    assert.ok(
      g
        .makeChoices()
        .every(
          (c) => c.type !== 'passive' || PASSIVES.find((p) => p.id === c.id)!.school === 'demonic',
        ),
    );
  assert.equal(parseSave(JSON.stringify({ ...s, path: 'dual' })).path, 'demonic');
  leaveSect(s);
  s.path = 'dual';
  assert.equal(new Game(s, 0, 0).path, 'dual');
});

test('九大境界对应宗门职务，真仙前不能成为开宗老祖，退宗显示散修', () => {
  const s = wealthy();
  assert.equal(sectRole(s), '散修');
  joinSect(s, 'power');
  const roles = [
    '外门杂役',
    '外门弟子',
    '内门弟子',
    '真传弟子',
    '宗门执事',
    '宗门长老',
    '掌门',
    '太上长老',
    '开宗老祖',
  ];
  for (let realm = 0; realm < roles.length; realm++) {
    s.cultivation = Array.from({ length: realm * 3 }, (_, i) => realmCost(i)).reduce(
      (a, b) => a + b,
      0,
    );
    if (realm === 8) {
      assert.equal(sectRole(s), '太上长老');
      s.completed.push(6);
    }
    assert.equal(sectRole(s), roles[realm]);
    assert.equal(sectRole(parseSave(JSON.stringify(s))), roles[realm]);
  }
  leaveSect(s);
  assert.equal(sectRole(s), '散修');
  joinSect(s, 'blood');
  assert.equal(sectRole(s), '开宗老祖');
});
