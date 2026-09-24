import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { SPIRIT_ROOTS, tribulationRules } from '../src/data.ts';
import {
  freshSave,
  parseSave,
  trainingYears,
  trainingCost,
  train,
  syncTribulationClock,
  tribulationDue,
  completeTribulation,
  settleRun,
  realmDamageMultiplier,
} from '../src/progress.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';

function immortal(round = 1) {
  const save = freshSave();
  save.cultivation = 1e9;
  save.unlocked = 6;
  save.age = 1234;
  save.tribulations = round - 1;
  syncTribulationClock(save);
  save.age = save.nextTribulationAge;
  return save;
}

test('天劫地面预警结束后同帧落雷与扣血，暂停、续局和消散不重复触发', () => {
  const save = immortal();
  const original = Game.createTribulation(save, null);
  original.weapons[0].timer = 9999;
  original.tribulationNextAt = 9999;
  original.zone(0, 240, 30, 0.5, original.boss!.damage, '#d2b5ff', 'blast', 0.03, true);
  for (const game of [original, Game.restore(save, original.snapshot())!]) {
    game.resume();
    const hp = game.player.hp;
    const bossHp = game.boss!.hp;
    const hits: number[] = [];
    game.onEvent = (event) => {
      if (event === 'hurt') {
        assert.equal(game.effects.filter((effect) => effect.kind === 'lightning').length, 1);
        hits.push(game.time);
      }
    };
    for (let i = 0; i < 3; i++) game.update(0.01);
    assert.equal(game.player.hp, hp);
    assert.ok(!game.effects.some((effect) => effect.kind === 'lightning'));
    game.update(0.01);
    assert.deepEqual(hits, [game.time]);
    assert.equal(game.player.hp, hp - game.boss!.damage * game.stats.armor);
    const bolt = game.effects.find((effect) => effect.kind === 'lightning')!;
    assert.deepEqual(
      [bolt.x, bolt.y, bolt.radius, bolt.color, bolt.maxLife],
      [0, 240, 30, '#d2b5ff', 0.45],
    );
    const remaining = bolt.life;
    game.pause();
    game.update(0.05);
    assert.equal(bolt.life, remaining);
    game.resume();
    for (let i = 0; i < 11; i++) game.update(0.05);
    assert.equal(hits.length, 1);
    assert.equal(game.zones.length, 0);
    assert.ok(!game.effects.some((effect) => effect.kind === 'lightning'));
    assert.equal(game.boss!.hp, bossHp);
    assert.equal(game.damageDealt, 0);
  }
});

test('天劫落雷覆盖未命中和无敌落点，每次伤害节拍触发且不波及普通爆炸与己方领域', () => {
  for (const [tribulation, hostile, kind, outside, invincible, expected] of [
    [true, true, 'blast', true, 0, 1],
    [true, true, 'blast', false, 2, 1],
    [false, true, 'blast', false, 2, 0],
    [true, false, 'blast', false, 0, 0],
    [true, true, 'poison', false, 2, 0],
  ] as const) {
    const game = tribulation
      ? Game.createTribulation(immortal(), null)
      : new Game(freshSave(), 0, 0);
    game.weapons[0].timer = 9999;
    game.tribulationNextAt = 9999;
    game.player.invincible = invincible;
    const hp = game.player.hp;
    const x = game.player.x + (outside ? 39 : 0);
    game.zone(x, game.player.y, 30, 1.1, 10, '#d2b5ff', kind, 0, hostile);
    game.update(0.01);
    const first = game.effects.filter((effect) => effect.kind === 'lightning');
    assert.equal(first.length, expected);
    assert.equal(game.player.hp, hp);
    for (let i = 0; i < 49; i++) game.update(0.01);
    assert.ok(!game.effects.some((effect) => effect.kind === 'lightning'));
    game.update(0.01);
    const second = game.effects.filter((effect) => effect.kind === 'lightning');
    assert.equal(second.length, expected);
    if (expected) {
      assert.equal(second[0].x, x);
      assert.equal(second[0].y, game.player.y);
      assert.notEqual(second[0], first[0]);
    }
    assert.equal(game.player.hp, hp);
  }
});

test('变步长跨过地面雷区寿命时不补发落雷，核心开放后无过期雷光', () => {
  const game = Game.createTribulation(immortal(25), null);
  game.weapons[0].timer = 9999;
  game.tribulationNextAt = 9999;
  game.zone(200, 240, 30, 0.5, 10, '#d2b5ff', 'blast', 0, true);
  game.update(0.01);
  assert.equal(game.effects.filter((effect) => effect.kind === 'lightning').length, 1);
  game.update(0.02);
  for (let i = 0; i < 10; i++) game.update(0.05);
  assert.equal(game.zones.length, 0);
  assert.ok(!game.effects.some((effect) => effect.kind === 'lightning'));
  game.tribulationStep = 4;
  game.tribulationNextAt = game.time;
  game.update(0.01);
  assert.equal(game.tribulationStep, 0);
  assert.ok(!game.effects.some((effect) => effect.kind === 'lightning'));
});

test('每次天劫最多广告复活一次，续局不会重置机会', () => {
  const save = immortal();
  const g = Game.createTribulation(save);
  g.player.invincible = 0;
  g.hurtPlayer(1e9);
  g.update(0.01);
  assert.equal(g.state, 'lost');
  assert.equal(g.revive(), true);
  const restored = Game.restore(save, JSON.parse(JSON.stringify(g.snapshot())))!;
  assert.equal(restored.revivesUsed, 1);
  restored.resume();
  restored.player.invincible = 0;
  restored.hurtPlayer(1e9);
  restored.update(0.01);
  assert.equal(restored.state, 'lost');
  assert.equal(restored.revive(), false);
});

test('根基每阶同时扣灵石与年岁，七档灵根耗时不同，资源不足或寿元不足不扣除', () => {
  const years = [1, 1.2, 1.4, 1.8, 2.5, 3.3, 5];
  for (const [i, root] of SPIRIT_ROOTS.entries()) {
    const save = freshSave(root.id);
    save.stones = 10000;
    assert.equal(trainingYears(save), years[i]);
    for (const kind of ['vitality', 'power', 'speed'] as const) {
      const before = save.stones;
      const age = save.age;
      assert.equal(train(save, kind), true);
      assert.equal(save.training[kind], 1);
      assert.equal(save.stones, before - trainingCost(0));
      assert.ok(Math.abs(save.age - age - years[i]) < 1e-9);
    }
    save.age = 100 - years[i];
    const before = JSON.stringify(save);
    assert.equal(train(save, 'power'), false);
    assert.equal(JSON.stringify(save), before);
    save.age = 0;
    save.stones = 0;
    assert.equal(train(save, 'power'), false);
    assert.equal(save.age, 0);
  }
});

test('大乘开始两万年计时，旧档不追罚；闭关与战斗均可触发，暂停不计龄', () => {
  const save = freshSave();
  syncTribulationClock(save);
  assert.equal(save.nextTribulationAge, 0);
  save.cultivation = 1e9;
  save.age = 1234;
  const migrated = parseSave(JSON.stringify(save));
  assert.equal(migrated.nextTribulationAge, 21234);
  assert.equal(parseSave(JSON.stringify(migrated)).nextTribulationAge, 21234);
  migrated.age = 21233;
  migrated.stones = 10000;
  assert.equal(train(migrated, 'power'), true);
  assert.ok(tribulationDue(migrated));
  assert.equal(train(migrated, 'power'), false);
  const g = new Game(migrated, 0, 0);
  g.update(0.05);
  assert.equal(g.state, 'paused');
  const age = migrated.age;
  g.update(0.05);
  assert.equal(migrated.age, age);
  const other = immortal();
  other.age -= 0.001;
  const h = new Game(other, 6, 0);
  h.update(0.05);
  assert.equal(h.state, 'paused');
  assert.equal(other.age, other.nextTribulationAge);
});

test('独立天劫只有一个首领，原搭配保留，无额外小怪、计龄或经验，存档往返保持', () => {
  const save = immortal();
  const source = new Game(save, 3, 0);
  source.level = 70;
  source.weapons[0].level = 6;
  source.weapons[0].evolved = true;
  source.passives.guard = 4;
  source.pause();
  save.tribulationReturn = source.snapshot();
  const g = Game.createTribulation(save, source);
  const age = save.age;
  const cultivation = save.cultivation;
  g.player.invincible = 100;
  for (let i = 0; i < 1200; i++) g.update(0.05);
  assert.equal(g.enemies.length, 1);
  assert.equal(save.age, age);
  assert.equal(save.cultivation, cultivation);
  assert.equal(g.xp, 0);
  assert.equal(g.pickups.length, 0);
  assert.equal(g.level, 70);
  assert.equal(g.passives.guard, 4);
  const imported = importSave(exportSave(save, g));
  assert.equal(imported.run!.tribulation, 1);
  assert.equal(imported.run!.tribulationStep, g.tribulationStep);
  assert.equal(imported.run!.tribulationOpeningDamage, g.tribulationOpeningDamage);
  assert.deepEqual(imported.save.tribulationReturn, save.tribulationReturn);
  assert.equal(Game.restore(save, { ...g.snapshot(), tribulationStep: 7 }), null);
  assert.throws(() => importSave(exportSave({ ...save, tribulationReturn: { bad: true } }, g)));
});

test('天劫护盾期间不能跳过招式，每次核心暴露伤害封顶；劫印仅发一次，返回原局不重复结算', () => {
  const save = immortal();
  const source = new Game(save, 2, 0);
  source.player.hp -= 30;
  source.pause();
  const snapshot = source.snapshot();
  const damageBefore = source.stats.damage;
  const g = Game.createTribulation(save, source);
  const boss = g.boss!;
  g.hitEnemy(boss, 1e12);
  assert.equal(boss.hp, boss.maxHp);
  for (let i = 0; i < 4; i++) {
    g.time = 20 + i * 20;
    g.tribulationStep = 0;
    g.tribulationOpeningDamage = 0;
    g.hitEnemy(boss, 1e12);
    const hp = boss.hp;
    g.hitEnemy(boss, 1e12);
    assert.equal(boss.hp, hp);
  }
  assert.equal(g.state, 'won');
  assert.equal(g.pickups.length, 0);
  assert.equal(g.bossCultivation, 0);
  assert.ok(completeTribulation(save, 1));
  assert.equal(save.tribulations, 1);
  assert.equal(completeTribulation(save, 1), false);
  assert.equal(save.nextTribulationAge, 41234);
  const resumed = Game.restore(save, snapshot)!;
  assert.equal(resumed.player.maxHp, Math.round(source.player.maxHp * 1.03));
  assert.equal(resumed.player.maxHp - resumed.player.hp, 30);
  assert.equal(resumed.stats.damage, damageBefore * 1.02);
  assert.equal(freshSave().tribulations, 0);
});

test('第五次天劫记录五劫不灭成就', () => {
  const save = immortal(5);
  assert.equal(completeTribulation(save, 5), true);
  assert.equal(save.chronicle.milestones['five-tribulations'], save.age);
  assert.equal(save.chronicle.entries.filter((entry) => entry.title === '五劫不灭').length, 1);
});

test('第五劫强度跃升且第六劫继续增强，预警保底，输出窗口缩短，仍按实际胜负结算', () => {
  for (let round = 1; round <= 6; round++) {
    const rules = tribulationRules(round);
    const next = tribulationRules(round + 1);
    assert.ok(next.hp > rules.hp && next.damage > rules.damage);
    assert.ok(next.warning < rules.warning && next.opening < rules.opening);
    const save = immortal(round);
    const g = Game.createTribulation(save, null);
    assert.equal(g.boss!.maxHp, rules.hp * realmDamageMultiplier(23));
    assert.equal(g.boss!.damage, g.player.maxHp * rules.damage);
    g.weapons[0].timer = 999;
    g.update(0.05);
    g.time = 1.2;
    g.update(0.01);
    assert.equal(g.tribulationStep, 1);
    assert.ok(g.zones.every((z) => z.delay >= rules.warning - 0.011));
  }
  assert.equal(tribulationRules(5).hp, tribulationRules(4).hp * 2);
  assert.equal(tribulationRules(5).openingDamage, 0.03);
  assert.ok(tribulationRules(100).warning >= 0.55);
});

test('天劫瞄准雷弹真实移动并造成伤害，续局保留弹幕；核心开放清除敌方攻击', () => {
  const save = immortal(5);
  const g = Game.createTribulation(save, null);
  g.weapons[0].timer = 999;
  g.time = 1.2;
  g.update(0.01);
  const shots = g.shots.filter((s) => s.kind === 'hostile');
  assert.equal(shots.length, 7);
  const resumed = Game.restore(save, g.snapshot())!;
  assert.equal(resumed.shots.length, shots.length);
  resumed.resume();
  const before = resumed.player.hp;
  for (let i = 0; i < 40; i++) {
    resumed.zones = [];
    resumed.update(0.025);
  }
  assert.ok(resumed.player.hp < before, '单独雷弹即可命中站桩玩家');
  assert.ok(resumed.shots.some((s) => Math.hypot(s.x, s.y) > 200));
  resumed.zones.push({
    x: 400,
    y: 400,
    radius: 20,
    life: 2,
    maxLife: 2,
    damage: 1,
    tick: 0,
    color: '#fff',
    kind: 'pagoda',
    delay: 0,
    hostile: false,
  });
  resumed.tribulationStep = 4;
  resumed.tribulationNextAt = resumed.time;
  resumed.update(0.01);
  assert.ok(resumed.tribulationVulnerable);
  assert.equal(resumed.shots.filter((s) => s.kind === 'hostile').length, 0);
  assert.equal(resumed.zones.filter((z) => z.hostile).length, 0);
  assert.equal(resumed.zones.filter((z) => !z.hostile).length, 1);
});

test('终关结算立即结束周期天劫，旧渡劫境存档清除倒计时且保留劫印', () => {
  const save = immortal(3);
  settleRun(save, {
    stage: 6,
    difficulty: 0,
    kills: 0,
    time: 600,
    victory: true,
    iron: 0,
    level: 1,
  });
  assert.ok(save.completed.includes(6));
  assert.equal(save.nextTribulationAge, 0);
  assert.equal(tribulationDue(save), false);
  assert.equal(save.tribulations, 2);
  save.nextTribulationAge = save.age - 1; // 旧版已到期的天劫。
  assert.equal(tribulationDue(save), false);
  const restored = parseSave(JSON.stringify(save));
  assert.equal(restored.nextTribulationAge, 0);
  assert.equal(restored.tribulations, 2);
  assert.equal(completeTribulation(restored, 3), false);
  restored.stones = 10000;
  assert.ok(train(restored, 'power'));
  const g = new Game(restored, 6, 0);
  g.update(0.05);
  assert.equal(g.state, 'playing');
});

test('终关尚未通关的大乘高修为仍需迎劫，提前通关但修为未达渡劫也不再受天劫打断', () => {
  const save = immortal();
  assert.ok(tribulationDue(save));
  save.completed = [6];
  save.cultivation = 80000;
  syncTribulationClock(save);
  assert.equal(tribulationDue(save), false);
  assert.equal(save.nextTribulationAge, 0);
});

test('旧通关档正在天劫中时，导入返回原历练且不重复结算，无原历练则返回首页', () => {
  for (const hasOriginal of [false, true]) {
    const save = immortal(3);
    const source = new Game(save, 2, 0);
    source.time = 83;
    source.player.hp -= 30;
    source.pause();
    save.tribulationReturn = hasOriginal ? source.snapshot() : null;
    const trial = Game.createTribulation(save, hasOriginal ? source : null);
    save.completed = [0, 1, 2, 3, 4, 5, 6]; // 模拟更新前通关后仍被迫迎劫的存档。
    const before = save.cultivation;
    const imported = importSave(exportSave(save, trial));
    assert.equal(imported.save.nextTribulationAge, 0);
    assert.equal(imported.save.tribulationReturn, null);
    assert.equal(imported.save.tribulations, 2);
    assert.equal(imported.save.cultivation, before);
    if (hasOriginal) {
      assert.equal(imported.run!.tribulation, 0);
      assert.equal(imported.run!.time, 83);
      assert.equal(imported.run!.state, 'paused');
      assert.equal(imported.run!.player.maxHp - imported.run!.player.hp, 30);
    } else assert.equal(imported.run, null);
    assert.equal(importSave(exportSave(imported.save, imported.run)).save.cultivation, before);
  }
});

test('通关存档迁移仍拒绝损坏的原历练，普通未完成历练正常恢复', () => {
  const save = immortal();
  const trial = Game.createTribulation(save, null);
  save.completed = [6];
  save.tribulationReturn = { bad: true };
  assert.throws(() => importSave(exportSave(save, trial)), /已损坏/);
  save.tribulationReturn = null;
  const regular = new Game(save, 0, 0);
  regular.time = 12;
  assert.equal(importSave(exportSave(save, regular)).run!.time, 12);
});
