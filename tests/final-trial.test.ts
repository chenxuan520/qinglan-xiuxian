import { bossSkillCooldown } from '../src/boss-skills.ts';
import { bossSkills } from '../src/boss-skills.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import {
  STAGES,
  ENEMIES,
  TRIAL_BOSS_STAGES,
  TRIAL_BOSS_TIMES,
  STAGE_REALM_STEPS,
  TRIAL_PRESSURE_SECONDS,
} from '../src/data.ts';
import {
  freshSave,
  parseSave,
  realmInfo,
  realmCost,
  settleRun,
  realmHealthMultiplier,
} from '../src/progress.ts';

function trial() {
  const save = freshSave();
  save.unlocked = 6;
  save.completed = [0, 1, 2, 3, 4, 5];
  save.cultivation = 1e6;
  return new Game(save, 6, 0, () => 0.5);
}

test('终关追击精英有冲刺；原生六境首领三招，仙尊六招每轮各释放一次', () => {
  const g = trial();
  g.weapons = [];
  g.time = 60;
  const chase = g.spawnEnemy(65, false, false, { x: 300, y: 0 });
  // 中段精英独立加强，终关开场仍保留原有构筑空间与渐进速度。
  const progress = 60 / TRIAL_PRESSURE_SECONDS;
  const expectedSpeed =
    Math.max(95 + 35 * progress, ENEMIES[65].speed * (1.05 + 0.3 * progress)) *
    (1 + 0.3 * progress) *
    1.21;
  assert.ok(Math.abs(chase.speed - expectedSpeed) < 1e-8);
  chase.cooldown = 0;
  g.update(0.01);
  assert.ok(chase.charge > 0);
  for (const stage of TRIAL_BOSS_STAGES) {
    const h = new Game(freshSave(), stage, 0, () => 0.5);
    h.weapons = [];
    const boss = h.spawnEnemy(10, false, true, { x: 300, y: 0 }, stage);
    assert.equal(STAGES[stage].skills.length, stage === 6 ? 6 : 3);
    const phases: number[] = [];
    for (let i = 0; i < STAGES[stage].skills.length; i++) {
      const phase = boss.skillStep!;
      phases.push(phase);
      boss.charge = 0;
      boss.cooldown = 0;
      h.update(0.01);
      assert.ok(h.notice.includes(bossSkills(stage, h.isFinalTrial)[phase]));
      assert.notEqual(boss.skillStep, phase);
    }
    assert.equal(new Set(phases).size, STAGES[stage].skills.length);
  }
});

test('仙尊新增横扫、精英天兵与预警突进，伤害随终关强度提高', () => {
  const g = trial();
  g.weapons = [];
  const boss = g.spawnEnemy(10, false, true, { x: 300, y: 0 }, 6);
  assert.ok(
    Math.abs(boss.damage - 440 * 0.72 * 1.02 * realmHealthMultiplier(STAGE_REALM_STEPS[6]) * 1.08) <
      1e-8,
  );
  boss.skillStep = 3;
  boss.cooldown = 0;
  g.update(0.01);
  assert.equal(g.shots.filter((s) => s.kind === 'hostile').length, 11);
  boss.skillStep = 4;
  boss.cooldown = 0;
  g.update(0.01);
  const guards = g.enemies.filter((e) => !e.boss);
  assert.equal(guards.length, 6);
  assert.ok(guards.every((e) => e.elite && [24, 25].includes(e.type)));
  boss.skillStep = 5;
  boss.cooldown = 0;
  g.update(0.01);
  assert.ok(boss.charge >= 1.5);
  assert.ok(g.effects.some((e) => e.kind === 'line' && e.life > 0.9));
  const x = boss.x;
  g.update(0.05);
  assert.equal(boss.x, x, '突进预警期间保持原地');
});

test('修为达标但第七关未通关显示渡劫，通关后成为真仙并获得突破加成', () => {
  assert.equal(realmInfo(1e9, false).name, '渡劫');
  assert.equal(realmInfo(1e9, false).ascending, true);
  assert.equal(realmInfo(1e9, false).locked, true);
  assert.equal(realmInfo(1e9, true).name, '真仙');
  const g = trial();
  const before = g.save.cultivation;
  assert.equal(g.player.maxHp, Math.round(693 * realmHealthMultiplier(23)));
  settleRun(g.save, {
    stage: 6,
    difficulty: 0,
    kills: 0,
    level: 1,
    time: 720,
    iron: 0,
    victory: false,
  });
  assert.equal(realmInfo(g.save.cultivation, g.save.completed.includes(6)).name, '渡劫');
  assert.ok(g.save.cultivation > before);
  const waiting = new Game(g.save, 6, 0);
  assert.equal(waiting.stats.damage, g.stats.damage);
  assert.equal(waiting.player.maxHp, g.player.maxHp);
  settleRun(g.save, {
    stage: 6,
    difficulty: 0,
    kills: 0,
    level: 1,
    time: 720,
    iron: 0,
    victory: true,
  });
  assert.equal(realmInfo(g.save.cultivation, g.save.completed.includes(6)).name, '真仙');
  assert.equal(realmInfo(g.save.cultivation, true).ascending, false);
  const immortal = new Game(g.save, 6, 0);
  assert.equal(immortal.player.maxHp, Math.round(693 * realmHealthMultiplier(24)));
  assert.ok(Math.abs(immortal.player.maxHp - waiting.player.maxHp * 3) <= 1);
  assert.ok(Math.abs(immortal.stats.damage / waiting.stats.damage - 5) < 1e-12);
  assert.equal(Object.hasOwn(g.save.chronicle.milestones, 'hard-immortal'), false);

  const rootless = freshSave('none', [], 'dual', () => 0);
  rootless.unlocked = 6;
  rootless.completed = [0, 1, 2, 3, 4, 5];
  rootless.cultivation = 1e9;
  rootless.spiritRoot = 'heaven';
  settleRun(rootless, {
    stage: 6,
    difficulty: 0,
    kills: 0,
    level: 1,
    time: 420,
    iron: 0,
    victory: true,
    spiritRoot: 'none',
  });
  assert.equal(rootless.chronicle.milestones['rootless-immortal'], rootless.age);

  const washedToNone = freshSave('none', [], 'dual', () => 0);
  washedToNone.unlocked = 6;
  washedToNone.completed = [0, 1, 2, 3, 4, 5];
  washedToNone.cultivation = 1e9;
  settleRun(washedToNone, {
    stage: 6,
    difficulty: 0,
    kills: 0,
    level: 1,
    time: 420,
    iron: 0,
    victory: true,
    spiritRoot: 'heaven',
  });
  assert.equal(Object.hasOwn(washedToNone.chronicle.milestones, 'rootless-immortal'), false);

  const hard = freshSave();
  hard.unlocked = 6;
  hard.completed = [0, 1, 2, 3, 4, 5];
  hard.cultivation = 1e9;
  settleRun(hard, {
    stage: 6,
    difficulty: 2,
    kills: 0,
    level: 1,
    time: 420,
    iron: 0,
    victory: true,
  });
  assert.equal(hard.chronicle.milestones['hard-immortal'], hard.age);
  settleRun(hard, {
    stage: 6,
    difficulty: 2,
    kills: 0,
    level: 1,
    time: 420,
    iron: 0,
    victory: true,
  });
  assert.equal(hard.chronicle.entries.filter((entry) => entry.title === '逆天改命').length, 1);

  const total = Array.from({ length: 24 }, (_, index) => realmCost(index)).reduce(
    (sum, cost) => sum + cost,
    0,
  );
  const late = freshSave();
  late.unlocked = 6;
  late.completed = [0, 1, 2, 3, 4, 5, 6];
  late.cultivation = total - 1;
  settleRun(late, {
    stage: 6,
    difficulty: 2,
    kills: 0,
    level: 1,
    time: 420,
    iron: 0,
    victory: true,
    startedImmortal: false,
  });
  assert.equal(late.chronicle.milestones['hard-immortal'], late.age);

  const already = freshSave();
  already.unlocked = 6;
  already.completed = [0, 1, 2, 3, 4, 5, 6];
  already.cultivation = total;
  settleRun(already, {
    stage: 6,
    difficulty: 2,
    kills: 0,
    level: 1,
    time: 420,
    iron: 0,
    victory: true,
    startedImmortal: true,
  });
  assert.equal(Object.hasOwn(already.chronicle.milestones, 'hard-immortal'), false);

  const immortalRun = new Game(already, 6, 2);
  already.cultivation = total + 1;
  immortalRun.creditedCultivation = 1;
  assert.equal(immortalRun.startedImmortal, true);
  assert.equal(Game.restore(already, immortalRun.snapshot())!.startedImmortal, true);
});

test('旧版已过第六关的存档自动解锁终关，已有修为不丢失', () => {
  assert.equal(STAGES.length, 7);
  assert.equal(STAGES[6].minutes, 5.5);
  assert.equal(TRIAL_BOSS_STAGES.length, 7);
  assert.equal(TRIAL_BOSS_STAGES.at(-1), 6);
  const legacy = { ...freshSave(), unlocked: 5, completed: [0, 1, 2, 3, 4, 5], cultivation: 1e6 };
  const save = parseSave(JSON.stringify(legacy));
  assert.equal(save.unlocked, 6);
  assert.equal(save.cultivation, 1e6);
  assert.equal(save.completed.includes(6), false);
  assert.equal(parseSave(JSON.stringify({ ...legacy, completed: [0, 1, 2, 3, 4] })).unlocked, 5);
});

test('最终仙尊拥有独立立绘、更强属性与二阶段弹幕，落雷保留预警', () => {
  const g = trial();
  g.weapons = [];
  const king = g.spawnEnemy(10, false, true, { x: 350, y: 0 }, 4);
  const immortal = g.spawnEnemy(10, false, true, { x: 350, y: 0 }, 6);
  assert.ok(immortal.maxHp > king.maxHp * 2);
  assert.ok(immortal.damage > king.damage);
  assert.equal(STAGES[6].sprite, 80);
  g.enemies = [immortal];
  g.time = 7;
  immortal.cooldown = 0;
  g.update(0.01);
  assert.equal(g.shots.filter((s) => s.kind === 'hostile').length, 24);
  g.shots = [];
  immortal.skillStep = 0;
  immortal.hp = immortal.maxHp * 0.4;
  immortal.cooldown = 0;
  g.update(0.01);
  assert.equal(g.shots.length, 32);
  assert.equal(immortal.cooldown, bossSkillCooldown(6, true, true));
  g.time = 8;
  immortal.skillStep = 1;
  immortal.cooldown = 0;
  g.update(0.01);
  assert.equal(g.zones.filter((z) => z.hostile).length, 5);
  assert.ok(g.zones.every((z) => z.delay > 1));
});

test('终关所有刷怪及召唤物都是精英，常规六境保持原有等级', () => {
  const g = trial();
  g.weapons = [];
  for (let i = 0; i < 15; i++) assert.ok(g.spawnEnemy().elite);
  g.enemies = [];
  const summoner = g.spawnEnemy(71, false, false, { x: 250, y: 0 });
  summoner.cooldown = 0;
  g.update(0.05);
  assert.ok(g.enemies.length >= 3);
  assert.ok(g.enemies.every((e) => e.elite));
  const ordinary = new Game(freshSave(), 0, 0).spawnEnemy(0);
  assert.equal(ordinary.elite, false);
  assert.ok(g.enemies.every((e) => e.hp > ENEMIES[e.type].hp));
});

test('七位首领按顺序轮战，首王与倒计时结束均不会提前通关', () => {
  const g = trial();
  g.weapons = [];
  for (let wave = 0; wave < TRIAL_BOSS_STAGES.length; wave++) {
    g.time = TRIAL_BOSS_TIMES[wave];
    g.state = 'playing';
    g.xp = 0; // 本测试只验证妖王调度，灵气升级另有覆盖。
    g.update(0.01);
    assert.ok(g.boss);
    assert.equal(g.boss!.bossStage, TRIAL_BOSS_STAGES[wave]);
    assert.equal(g.enemies.filter((e) => e.boss && !e.dead).length, 1);
    g.hitEnemy(g.boss!, g.boss!.maxHp);
    assert.equal(g.trialBossesDefeated, wave + 1);
    assert.equal(g.state, wave === TRIAL_BOSS_STAGES.length - 1 ? 'won' : 'playing');
  }
});

test('逐王击杀通关，恢复后乱序击杀剩余妖王仍需全部倒下', () => {
  const g = trial();
  g.weapons[0].timer = 1e9;
  g.player.invincible = 999;
  for (let wave = 0; wave < 3; wave++) {
    g.time = TRIAL_BOSS_TIMES[wave] + wave * 5;
    g.update(0.01);
    assert.ok(g.boss);
    assert.equal(g.boss!.bossStage, wave);
    g.hitEnemy(g.boss!, g.boss!.maxHp);
    g.xp = 0;
  }
  const resumed = Game.restore(g.save, JSON.parse(JSON.stringify(g.snapshot())))!;
  assert.ok(resumed);
  resumed.resume();
  for (let wave = 3; wave < 7; wave++) {
    resumed.time = TRIAL_BOSS_TIMES[wave] + wave * 5;
    resumed.update(0.01);
    assert.ok(resumed.boss);
    assert.equal(resumed.boss!.bossStage, wave);
    resumed.hitEnemy(resumed.boss!, resumed.boss!.maxHp);
    resumed.xp = 0;
  }
  assert.equal(resumed.state, 'won');
});

test('独立天劫保留已保存招式与计时', () => {
  const s = freshSave();
  s.cultivation = 1e9;
  s.unlocked = 6;
  s.age = s.nextTribulationAge = 20000;
  const g = Game.createTribulation(s);
  g.time = 123;
  const restored = Game.restore(s, { ...g.snapshot(), stageDuration: 999 })!;
  assert.ok(restored);
  assert.equal(restored.time, 123);
  assert.equal(restored.tribulationNextAt, g.tribulationNextAt);
  assert.deepEqual(restored.enemies, g.enemies);
});
