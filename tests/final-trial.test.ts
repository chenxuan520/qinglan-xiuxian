import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { STAGES, ENEMIES, TRIAL_BOSS_STAGES, TRIAL_BOSS_TIMES } from '../src/data.ts';
import { freshSave, parseSave, realmInfo, realmCost, settleRun } from '../src/progress.ts';

function trial() {
  const save = freshSave();
  save.unlocked = 6;
  save.completed = [0, 1, 2, 3, 4, 5];
  save.cultivation = 1e6;
  return new Game(save, 6, 0, () => 0.5);
}

test('越到高境界永久修为成长越慢，已有境界不回退，灵气收益不受影响', () => {
  const gains = [15, 18, 21].map((step) => {
    const save = freshSave();
    save.cultivation = Array.from({ length: step }, (_, i) => realmCost(i)).reduce(
      (a, b) => a + b,
      0,
    );
    const before = save.cultivation;
    const g = new Game(save, 6, 0, () => 0.5);
    for (let i = 0; i < 100; i++) g.hitEnemy(g.spawnEnemy(65), 1e9);
    assert.equal(realmInfo(save.cultivation).step, step);
    return {
      cultivation: save.cultivation - before,
      xp: g.pickups.filter((p) => p.kind === 'xp').reduce((n, p) => n + p.value, 0),
    };
  });
  assert.ok(gains[0].cultivation > gains[1].cultivation * 2);
  assert.ok(gains[1].cultivation > gains[2].cultivation * 2);
  assert.equal(gains[0].xp, gains[2].xp);
});

test('终关追击精英有冲刺；前六位首领三招，仙尊六招按顺序释放', () => {
  const g = trial();
  g.weapons = [];
  g.time = 60;
  const chase = g.spawnEnemy(65, false, false, { x: 300, y: 0 });
  // 中段精英独立加强，终关开场仍保留原有构筑空间与渐进速度。
  const expectedSpeed = Math.max(98.5, ENEMIES[65].speed * 1.08) * 1.03 * 1.1;
  assert.ok(Math.abs(chase.speed - expectedSpeed) < 1e-8);
  chase.cooldown = 0;
  g.update(0.01);
  assert.ok(chase.charge > 0);
  for (const stage of TRIAL_BOSS_STAGES) {
    const h = new Game(freshSave(), stage, 0, () => 0.5);
    h.weapons = [];
    const boss = h.spawnEnemy(10, false, true, { x: 300, y: 0 }, stage);
    assert.equal(STAGES[stage].skills.length, stage === 6 ? 6 : 3);
    for (let phase = 0; phase < STAGES[stage].skills.length; phase++) {
      boss.charge = 0;
      boss.cooldown = 0;
      h.update(0.01);
      assert.match(h.notice, new RegExp(STAGES[stage].skills[phase]));
      assert.equal(boss.skillStep, (phase + 1) % STAGES[stage].skills.length);
    }
  }
});

test('仙尊新增横扫、精英天兵与预警突进，伤害随终关强度提高', () => {
  const g = trial();
  g.weapons = [];
  const boss = g.spawnEnemy(10, false, true, { x: 300, y: 0 }, 6);
  assert.ok(Math.abs(boss.damage - 297 * 0.72) < 1e-8);
  boss.skillStep = 3;
  boss.cooldown = 0;
  g.update(0.01);
  assert.equal(g.shots.filter((s) => s.kind === 'hostile').length, 11);
  boss.cooldown = 0;
  g.update(0.01);
  const guards = g.enemies.filter((e) => !e.boss);
  assert.equal(guards.length, 6);
  assert.ok(guards.every((e) => e.elite && [24, 25].includes(e.type)));
  boss.cooldown = 0;
  g.update(0.01);
  assert.ok(boss.charge >= 1.5);
  assert.ok(g.effects.some((e) => e.kind === 'line' && e.life > 0.9));
  assert.equal(boss.skillStep, 0);
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
  assert.equal(g.player.maxHp, 693);
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
  assert.equal(new Game(g.save, 6, 0).player.maxHp, 893);
});

test('旧版已过第六关的存档自动解锁终关，已有修为不丢失', () => {
  assert.equal(STAGES.length, 7);
  assert.equal(STAGES[6].minutes, 10);
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
  assert.equal(immortal.cooldown, 1.25);
  g.time = 8;
  immortal.skillStep = 1;
  immortal.cooldown = 0;
  g.update(0.01);
  assert.equal(g.zones.filter((z) => z.hostile).length, 5);
  assert.ok(g.zones.every((z) => z.delay > 1));
});

test('旧十二分钟终关的末王续局不能跳过新仙尊', () => {
  const g = trial();
  g.trialBossesDefeated = 5;
  g.nextTrialBossAt = 720;
  g.time = 730;
  g.spawnEnemy(10, false, true, { x: 250, y: 0 }, 5);
  const legacy = JSON.parse(JSON.stringify(g.snapshot()));
  delete legacy.trialBossesSpawned;
  legacy.trialBossSchedule = 2;
  const restored = Game.restore(g.save, legacy)!;
  assert.ok(restored);
  restored.resume();
  restored.hitEnemy(restored.boss!, 1e9);
  assert.notEqual(restored.state, 'won');
  assert.equal(restored.trialBossesDefeated, 6);
  restored.xp = 0;
  restored.time = restored.nextTrialBossAt;
  restored.update(0.01);
  assert.equal(restored.boss!.bossStage, 6);
  restored.hitEnemy(restored.boss!, 1e9);
  assert.equal(restored.state, 'won');
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
    g.hitEnemy(g.boss!, 1e9);
    assert.equal(g.trialBossesDefeated, wave + 1);
    assert.equal(g.state, wave === TRIAL_BOSS_STAGES.length - 1 ? 'won' : 'playing');
  }
});

test('终关到点继续出王，允许七王同时存在，乱序击杀全部七王才通关', () => {
  const g = trial();
  g.weapons[0].timer = 1e9;
  g.player.invincible = 999;
  g.time = 90;
  g.update(0.01);
  g.time = 180;
  g.update(0.01);
  assert.equal(g.enemies.filter((e) => e.boss && !e.dead).length, 2);
  g.time = 600;
  g.update(0.01);
  assert.equal(g.trialBossesSpawned, 7);
  assert.equal(g.trialBossesDefeated, 0);
  const resumed = Game.restore(g.save, JSON.parse(JSON.stringify(g.snapshot())))!;
  assert.ok(resumed);
  assert.equal(resumed.enemies.filter((e) => e.boss && !e.dead).length, 7);
  resumed.resume();
  const bosses = resumed.enemies.filter((e) => e.boss).reverse();
  for (let i = 0; i < bosses.length; i++) {
    resumed.hitEnemy(bosses[i], 1e9);
    assert.equal(resumed.trialBossesDefeated, i + 1);
    assert.equal(resumed.state, i === 6 ? 'won' : 'playing');
  }
});

test('旧串行 Boss 存档迁移后补齐到期妖王，不重复当前妖王', () => {
  const g = trial();
  g.time = 90;
  g.weapons[0].timer = 9999;
  g.update(0.01);
  const raw = JSON.parse(JSON.stringify(g.snapshot()));
  raw.time = 300;
  raw.trialBossSchedule = 2;
  delete raw.trialBossesSpawned;
  const resumed = Game.restore(g.save, raw)!;
  resumed.resume();
  resumed.update(0.01);
  assert.deepEqual(
    resumed.enemies.filter((e) => e.boss && !e.dead).map((e) => e.bossStage),
    [0, 1, 2],
  );
  const twice = Game.restore(resumed.save, resumed.snapshot())!;
  twice.resume();
  twice.update(0.01);
  assert.equal(twice.enemies.filter((e) => e.boss && !e.dead).length, 3);
});
