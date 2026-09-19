import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import {
  TREASURES,
  STAGE_ENEMIES,
  ENEMIES,
  FINAL_TRIAL_STAGE,
  DIFFICULTIES,
  xpNeeded,
} from '../src/data.ts';
import {
  freshSave,
  bossCultivationReward,
  cultivationReward,
  settleRun,
  realmCost,
  realmBonuses,
  realmInfo,
} from '../src/progress.ts';

const create = () => new Game(freshSave(), 0, 0, () => 0.5);

test('36 件法宝的直接、弹射、爆炸和持续伤害均归属自身，觉醒与续局延续累计', () => {
  for (const t of TREASURES) {
    const g = new Game(
      { ...freshSave(), artifacts: ['sword', 'nail', t.id], starter: t.id },
      0,
      0,
      () => 0.5,
    );
    g.player.invincible = 999;
    g.weapons[0].level = 6;
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2;
      const e = g.spawnEnemy(0, false, false, {
        x: Math.cos(angle) * 115,
        y: Math.sin(angle) * 115,
      });
      e.hp = e.maxHp = 1e8;
      e.speed = 0;
    }
    for (let i = 0; i < 160; i++) g.update(0.05);
    const before = g.damageDealt;
    assert.ok(before > 0, t.id);
    g.weapons[0].evolved = true;
    for (let i = 0; i < 160; i++) g.update(0.05);
    assert.ok(g.damageDealt > before, t.id);
    assert.deepEqual(Object.keys(g.damageBySource), [t.id], t.id);
    assert.equal(g.damageBySource[t.id], g.damageDealt, t.id);
    const resumed = Game.restore(g.save, JSON.parse(JSON.stringify(g.snapshot())))!;
    assert.ok(resumed, t.id);
    assert.deepEqual(resumed.damageBySource, g.damageBySource, t.id);
  }
});

test('伤害占比使用减伤后的实际扣血，过量击杀不计入，骨甲反伤单列', () => {
  const g = create();
  const e = g.spawnEnemy(0, false, false, { x: 100, y: 0 });
  e.hp = e.maxHp = 100;
  g.hitEnemy(e, 30, false, 'sword');
  g.hitEnemy(e, 1000, true, 'fire');
  g.hitEnemy(e, 1000, true, 'fire');
  assert.deepEqual(g.damageBySource, { sword: 30, fire: 70 });
  assert.equal(g.damageDealt, 100);
  const target = g.spawnEnemy(0, false, false, { x: 50, y: 0 });
  target.hp = 1000;
  g.passives.bone = 3;
  g.hurtPlayer(1);
  assert.ok(g.damageBySource.bone > 0);
  assert.equal(g.damageBySource.sword, 30);
  const shield = g.spawnEnemy(
    ENEMIES.findIndex((e) => e.behavior === 'shield'),
    false,
    false,
    { x: 500, y: 500 },
  );
  shield.hp = 1000;
  shield.cooldown = 5;
  g.hitEnemy(shield, 100, false, 'sword');
  assert.equal(g.damageBySource.sword, 75);
});

test('旧快照保留总伤害，新统计从续局后累计；拒绝不合法统计', () => {
  const g = create();
  g.damageDealt = 80;
  const old = JSON.parse(JSON.stringify(g.snapshot()));
  delete old.damageBySource;
  delete old.revivesUsed;
  delete old.bossCultivation;
  const restored = Game.restore(g.save, old)!;
  assert.equal(restored.damageDealt, 80);
  assert.deepEqual(restored.damageBySource, {});
  assert.equal(restored.revivesUsed, 0);
  assert.equal(Game.restore(g.save, { ...old, damageBySource: { sword: -1 } }), null);
  assert.equal(Game.restore(g.save, { ...old, damageBySource: { sword: 81 } }), null);
});

test('每局最多复活十次，满血三秒无敌，保留敌人、法宝与时间，刷新不重置次数', () => {
  const g = create();
  assert.equal(g.revive(), false);
  g.weapons[0].timer = 999;
  g.spawnEnemy(0, false, false, { x: 500, y: 500 });
  g.hurtPlayer(1e6);
  g.update(0.01);
  assert.equal(g.state, 'lost');
  const before = g.snapshot();
  const death = Game.restore(g.save, JSON.parse(JSON.stringify(before)))!;
  assert.equal(death.state, 'lost');
  assert.equal(death.player.hp, 0);
  assert.equal(death.revive(), true);
  assert.equal(death.player.hp, death.player.maxHp);
  assert.equal(death.player.invincible, 3);
  assert.equal(death.time, before.time);
  assert.deepEqual(death.enemies, JSON.parse(JSON.stringify(before.enemies)));
  assert.deepEqual(death.weapons, before.weapons);
  death.hurtPlayer(1e6);
  assert.equal(death.player.hp, death.player.maxHp);
  let again = Game.restore(death.save, death.snapshot())!;
  again.resume();
  again.player.invincible = 0;
  again.hurtPlayer(1e6);
  again.update(0.01);
  assert.equal(again.state, 'lost');
  for (let used = 1; used < 10; used++) {
    assert.equal(again.revivesUsed, used);
    assert.equal(again.revive(), true);
    assert.equal(again.revive(), false, '同一次死亡不能重复复活');
    again = Game.restore(again.save, JSON.parse(JSON.stringify(again.snapshot())))!;
    assert.equal(again.revivesUsed, used + 1);
    again.resume();
    again.player.invincible = 0;
    again.hurtPlayer(1e6);
    again.update(0.01);
  }
  assert.equal(again.revivesUsed, 10);
  assert.equal(again.revive(), false);
  for (const invalid of [-1, 0.5, 11, Infinity, '1'])
    assert.equal(Game.restore(g.save, { ...before, revivesUsed: invalid }), null);
});

test('Boss 经验至少三十只本关最强精英，永久突破奖励高于小怪且只入账一次', () => {
  for (let stage = 0; stage <= FINAL_TRIAL_STAGE; stage++) {
    const save = freshSave();
    save.unlocked = 6;
    save.cultivation = Array.from({ length: 23 }, (_, i) => realmCost(i)).reduce(
      (a, b) => a + b,
      0,
    );
    const g = new Game(save, stage, 0, () => 0.5);
    const boss = g.spawnEnemy(10, false, true, { x: 100, y: 0 }, stage);
    if (stage === FINAL_TRIAL_STAGE) g.trialBossesDefeated = 6;
    const before = save.cultivation;
    g.hitEnemy(boss, 1e9, false, 'sword');
    const reward = bossCultivationReward(stage) * DIFFICULTIES[0].reward;
    assert.equal(g.bossCultivation, reward);
    assert.ok(save.cultivation - before >= reward);
    let earnedXp = g.xp;
    for (let level = 1; level < g.level; level++) earnedXp += xpNeeded(level);
    const strongest = Math.max(
      ...STAGE_ENEMIES[stage].map((type) => Math.round(ENEMIES[type].xp * (1 + stage * 0.16) * 8)),
    );
    assert.ok(earnedXp >= strongest * 30, `stage ${stage}`);
    const credited = save.cultivation;
    g.hitEnemy(boss, 1e9);
    assert.equal(save.cultivation, credited);
    const settled = settleRun(save, { ...g.snapshot(), victory: true });
    assert.equal(
      settled.cultivationRemaining,
      cultivationReward(g, 100 + stage * 50) - g.creditedCultivation,
    );
    assert.equal(save.cultivation, credited + settled.cultivationRemaining);
  }
});

test('与最后妖王同时倒下，复活后可正常通关，不丢失已击败进度', () => {
  for (const stage of [0, 6]) {
    const save = freshSave();
    save.unlocked = 6;
    const g = new Game(save, stage, 0, () => 0.5);
    g.time = 600;
    if (stage === 6) {
      g.trialBossesSpawned = 7;
      g.trialBossesDefeated = 6;
    }
    g.bossSpawned = true;
    const boss = g.spawnEnemy(10, false, true, { x: 100, y: 0 }, stage);
    g.hurtPlayer(1e6);
    g.hitEnemy(boss, 1e9, false, 'sword');
    g.update(0.01);
    assert.equal(g.state, 'lost');
    const resumed = Game.restore(save, g.snapshot())!;
    assert.ok(resumed);
    assert.equal(resumed.revive(), true);
    assert.equal(resumed.state, 'won');
  }
});

test('正道最大气血按总值增加百分之十二，根基、境界与功法同样放大', () => {
  const save = freshSave();
  save.path = 'orthodox';
  save.training.vitality = 10;
  save.cultivation = Array.from({ length: 23 }, (_, i) => realmCost(i)).reduce((a, b) => a + b, 0);
  const g = new Game(save, 0, 0);
  const base = 100 + 100 + realmBonuses(23).hp;
  assert.equal(g.player.maxHp, Math.round(base * 1.12));
  g.player.hp -= 37;
  g.state = 'upgrade';
  g.choices = [{ type: 'passive', id: 'guard', level: 1 }];
  assert.equal(g.choose(0), true);
  assert.equal(g.player.maxHp, Math.round((base + 20) * 1.12));
  assert.equal(g.player.hp, g.player.maxHp - 37);
  const dual = new Game({ ...save, path: 'dual' }, 0, 0);
  assert.equal(dual.player.maxHp, base);
});

test('正道突破即时按百分比扩充气血，旧固定加成续局迁移不重复补血', () => {
  const save = freshSave();
  save.path = 'orthodox';
  save.cultivation = realmCost(0) + realmCost(1) + realmCost(2) - 1;
  const g = new Game(save, 0, 0, () => 0.5);
  g.player.hp -= 17;
  const e = g.spawnEnemy(0, false, false, { x: 100, y: 0 });
  g.hitEnemy(e, e.hp);
  const realm = realmInfo(save.cultivation).step;
  assert.ok(realm >= 3);
  assert.equal(g.player.maxHp, Math.round((100 + realmBonuses(realm).hp) * 1.12));
  assert.equal(g.player.hp, g.player.maxHp - 17);
  const old = g.snapshot();
  old.player.maxHp = 100 + realmBonuses(realm).hp + 12;
  old.player.hp = old.player.maxHp - 33;
  const resumed = Game.restore(save, old)!;
  assert.equal(resumed.player.maxHp, g.player.maxHp);
  assert.equal(resumed.player.hp, resumed.player.maxHp - 33);
  const twice = Game.restore(save, resumed.snapshot())!;
  assert.equal(twice.player.hp, resumed.player.hp);
  assert.equal(twice.player.maxHp, resumed.player.maxHp);
});

test('正道持续回血比相同基础快百分之二十，功法回复也乘倍率且魔道不变', () => {
  const orthodox = new Game({ ...freshSave(), path: 'orthodox' }, 0, 0);
  const demonic = new Game({ ...freshSave(), path: 'demonic' }, 0, 0);
  const dual = create();
  for (const level of [0, 3, 5]) {
    orthodox.passives.duration = demonic.passives.duration = dual.passives.duration = level;
    const base = 0.18 + level * 0.2;
    assert.equal(orthodox.stats.regen, base * 1.2);
    assert.equal(demonic.stats.regen, base);
    assert.equal(dual.stats.regen, base);
    orthodox.player.hp = 50;
    orthodox.update(0.05);
    assert.ok(Math.abs(orthodox.player.hp - 50 - base * 1.2 * 0.05) < 1e-10);
  }
});
