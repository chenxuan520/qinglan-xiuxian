import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, type Shot } from '../../src/battle/game.ts';
import { DIFFICULTIES, FINAL_TRIAL_STAGE } from '../../src/core/data.ts';
import { freshSave } from '../../src/core/progress.ts';
import { bossSkills } from '../../src/battle/boss-skills.ts';
import { ENEMY_CONTROL } from '../../src/battle/regional-hazards.ts';
import { grantCurio } from '../../src/items/curio-data.ts';
import { exportSave, importSave } from '../../src/core/save-transfer.ts';
import { validateRunSnapshot } from '../../src/battle/game-validation.ts';

const near = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

function encounter(stage: number, arena = stage, difficulty = 0) {
  const save = freshSave('heaven', ['metal'], 'dual', () => 0.5);
  Object.assign(save, { unlocked: 6, completed: [0, 1, 2, 3, 4, 5], cultivation: 119940 });
  const g = new Game(save, arena, difficulty, () => 0.5);
  g.spawnBudget = -10000;
  g.nextElite = g.nextTrialBossAt = 99999;
  g.bossSpawned = true;
  g.weapons[0].timer = 99999;
  const boss = g.spawnEnemy(10, false, true, { x: -400, y: 0 }, stage);
  Object.assign(boss, { speed: 0, cooldown: 99999, pursuitCooldown: 99999 });
  return { g, boss };
}
function cast(c: ReturnType<typeof encounter>, phase: number) {
  c.boss.skillStep = phase;
  c.boss.bossSkillQueue = bossSkills(c.boss.bossStage!, c.g.isFinalTrial)
    .map((_, index) => index)
    .filter((index) => index !== phase);
  c.g.castBossSkill(c.boss, 1, 0);
}
function collide(c: ReturnType<typeof encounter>, damage = 10) {
  const shot = c.g.hostileShot(c.boss, 1, 0, 0, damage);
  Object.assign(shot, { x: c.g.player.x, y: c.g.player.y });
  c.g.updateShots(0);
  return shot;
}
function ailments(g: Game) {
  return [g.entangled, g.burning.life, g.slowed, g.corroded, g.sealed, g.immobilized];
}

for (const [origin, arena, label] of [
  [1, 1, '原生狐王'],
  [1, FINAL_TRIAL_STAGE, '终关旧狐'],
  [FINAL_TRIAL_STAGE, FINAL_TRIAL_STAGE, '仙尊火效'],
] as const) {
  test(`${label}灼烧命中后暂停、JSON续局与文件导入在普通和极限均保留战况`, () => {
    for (const lifeMode of ['normal', 'extreme'] as const) {
      const c = encounter(origin, arena, lifeMode === 'extreme' ? 1 : 0);
      c.g.save.lifeMode = lifeMode;
      if (origin === FINAL_TRIAL_STAGE) c.g.random = () => 1.5 / 6;
      collide(c);
      assert.equal(c.g.burning.life, ENEMY_CONTROL.burn);
      assert.ok(c.g.burning.damage > 0);
      c.g.pause();
      const raw = JSON.parse(JSON.stringify(c.g.snapshot()));
      assert.ok(validateRunSnapshot(c.g.save, raw), `${label}/${lifeMode}真实灼烧快照有效`);
      const restored = Game.restore(c.g.save, raw);
      const exported = exportSave(c.g.save, c.g);
      assert.deepEqual(JSON.parse(exported).save.activeRun.burning, raw.burning);
      const imported = importSave(exported);
      assert.equal(imported.save.lifeMode, lifeMode);
      assert.equal(imported.save.journeyEnded, false);
      assert.equal(imported.save.pendingReincarnation, null);
      for (const run of [restored, imported.run]) {
        assert.ok(run, `${label}/${lifeMode}不能丢弃进行中的战斗`);
        assert.equal(run.state, 'paused');
        assert.equal(run.player.hp, raw.player.hp);
        assert.deepEqual(run.burning, raw.burning);
        run.update(1);
        assert.deepEqual(run.burning, raw.burning, '暂停冻结剩余灼烧');
        run.resume();
        run.update(0.05);
        near(run.burning.life, raw.burning.life - 0.05);
        near(run.burning.damage, raw.burning.damage * (1 - 0.05 / raw.burning.life));
      }
    }
  });
}

test('独立天劫与其他关卡仍拒绝伪造的活动灼烧，非灼烧快照正常有效', () => {
  for (const stage of [0, 2, 3, 4, 5]) {
    const c = encounter(stage);
    c.g.pause();
    const raw = JSON.parse(JSON.stringify(c.g.snapshot()));
    assert.ok(validateRunSnapshot(c.g.save, raw));
    assert.ok(Game.restore(c.g.save, raw));
    raw.burning = { life: 3, damage: 2 };
    assert.equal(validateRunSnapshot(c.g.save, raw), null, `关卡${stage}不能伪造灼烧`);
    assert.equal(Game.restore(c.g.save, raw), null);
  }
  for (const stage of [1, FINAL_TRIAL_STAGE]) {
    const c = encounter(stage);
    c.g.save.age = c.g.save.nextTribulationAge = 20000;
    const trial = Game.createTribulation(c.g.save, c.g);
    trial.pause();
    const raw = JSON.parse(JSON.stringify(trial.snapshot()));
    assert.ok(raw.tribulation);
    assert.ok(validateRunSnapshot(trial.save, raw), '先确认反例之外的天劫快照合法');
    assert.ok(Game.restore(trial.save, raw));
    raw.burning = { life: 3, damage: 2 };
    assert.equal(validateRunSnapshot(trial.save, raw), null, `关卡${stage}的独立天劫不允许灼烧`);
    assert.equal(Game.restore(trial.save, raw), null);
  }
});

test('新增许可的终关灼烧仍严格校验持续时间、剩余伤害和结构', () => {
  const c = encounter(1, FINAL_TRIAL_STAGE);
  collide(c);
  c.g.pause();
  const raw = JSON.parse(JSON.stringify(c.g.snapshot()));
  for (const burning of [
    null,
    {},
    { life: 3 },
    { damage: 2 },
    { life: -1, damage: 2 },
    { life: ENEMY_CONTROL.burn + 0.01, damage: 2 },
    { life: 0, damage: 2 },
    { life: 3, damage: -1 },
    { life: NaN, damage: 2 },
    { life: Infinity, damage: 2 },
    { life: 3, damage: NaN },
    { life: 3, damage: Infinity },
  ]) {
    const bad = { ...raw, burning };
    assert.equal(validateRunSnapshot(c.g.save, bad), null);
    assert.equal(Game.restore(c.g.save, bad), null);
  }
});

test('苍木弹原生与终关旧王命中藤缠，狐王两种弹幕命中完整直击并灼烧', () => {
  for (const stage of [0, 1])
    for (const arena of [stage, 6]) {
      const c = encounter(stage, arena);
      cast(c, stage === 0 ? 1 : 0);
      const shot = c.g.shots[0];
      c.g.shots = [shot];
      Object.assign(shot, { x: c.g.player.x, y: c.g.player.y, vx: 0, vy: 0 });
      const hp = c.g.player.hp;
      c.g.updateShots(0);
      near(hp - c.g.player.hp, shot.damage * c.g.stats.armor);
      assert.equal(c.g.entangled, stage === 0 ? ENEMY_CONTROL.entangle : 0);
      assert.equal(c.g.slowed, 0);
      assert.equal(c.g.burning.life, stage === 1 ? ENEMY_CONTROL.burn : 0);
      if (stage === 1) near(c.g.burning.damage, shot.damage * c.g.stats.armor * 0.2);
      assert.equal(c.g.shots.length, 0);
    }
});

test('狐王回焰同样灼烧，已有灼烧与藤缠不叠加或刷新', () => {
  const fox = encounter(1, 6);
  cast(fox, 3);
  const shot = fox.g.shots[0];
  assert.equal(shot.bossMotion!.kind, 'return');
  fox.g.shots = [shot];
  shot.age = 0.9;
  // 沿正式 bossMotion 轨迹取当前弹丸落点，实际命中逻辑仍由 updateShots 执行。
  fox.g.updateShots(0);
  Object.assign(fox.g.player, { x: shot.x, y: shot.y });
  fox.g.updateShots(0);
  assert.equal(fox.g.burning.life, 3);
  const burning = { life: 1.5, damage: 2 };
  fox.g.burning = { ...burning };
  fox.g.player.invincible = 0;
  collide(fox);
  assert.deepEqual(fox.g.burning, burning);
  const wood = encounter(0);
  collide(wood);
  wood.g.entangled = 1;
  wood.g.player.invincible = 0;
  const protection = wood.g.nextEnemyEntangleAt;
  collide(wood);
  assert.equal(wood.g.entangled, 1);
  assert.equal(wood.g.nextEnemyEntangleAt, protection);
});

test('仙尊每次实际命中独立抽取六境效果，清灵散不改变其直击伤害', () => {
  for (let effect = 0; effect < 6; effect++) {
    const c = encounter(6);
    c.g.medicine.poison = 0.5;
    let randomCalls = 0;
    c.g.random = () => {
      randomCalls++;
      return (effect + 0.5) / 6;
    };
    const shot = c.g.hostileShot(c.boss, 1, 0, 0, 10);
    c.g.updateShots(0);
    assert.equal(randomCalls, 0, '未碰撞不抽控制效果');
    Object.assign(shot, { x: c.g.player.x, y: c.g.player.y });
    const hp = c.g.player.hp;
    c.g.updateShots(0);
    assert.equal(randomCalls, 1);
    near(hp - c.g.player.hp, 10 * c.g.stats.armor);
    const expected = [1.5, 3, 1, 1.5, 1, 0.5];
    ailments(c.g).forEach((duration, index) =>
      near(duration, index === effect ? expected[index] : 0),
    );
    if (effect === 1) near(c.g.burning.damage, 10 * c.g.stats.armor * 0.2);
    assert.equal(c.g.shots.length, 0);
  }
});

test('同一仙尊连续六发逐命中取随机值，发射时不预抽或整轮复用', () => {
  const c = encounter(6);
  let calls = 0;
  c.g.random = () => ((calls++ % 6) + 0.5) / 6;
  for (let i = 0; i < 6; i++) {
    c.g.player.invincible = 0;
    collide(c, 1);
  }
  assert.equal(calls, 6);
  assert.deepEqual(ailments(c.g), [3, 3, 2, 3, 2, 1]);
});

test('受击护体和佛光挡掉新增效果，仙尊仍按每次几何命中抽取一次效果', () => {
  for (const stage of [0, 1, 5, 6])
    for (const shield of [false, true]) {
      const c = encounter(stage, stage === 6 ? 6 : stage);
      if (shield) {
        c.g.weapons = [{ id: 'beads', level: 1, evolved: false, timer: 99999 }];
        grantCurio(c.g.save, 'sacred-fragment');
        assert.equal(c.g.buddhaShieldReady, true);
      } else c.g.player.invincible = 1;
      let randomCalls = 0;
      c.g.random = () => {
        randomCalls++;
        return 0;
      };
      const hp = c.g.player.hp;
      collide(c);
      assert.equal(c.g.player.hp, hp);
      assert.deepEqual(ailments(c.g), [0, 0, 0, 0, 0, 0]);
      assert.equal(randomCalls, stage === 6 ? 1 : 0);
      assert.equal(c.g.shots.length, 0);
      if (shield) assert.equal(c.g.buddhaShieldReady, false);
    }
});

test('狼王减速、毒君减毒伤蚀体、冥主封宝保持', () => {
  for (const stage of [2, 3, 4]) {
    const c = encounter(stage, 6);
    c.g.medicine.poison = 0.5;
    const hp = c.g.player.hp;
    collide(c);
    near(hp - c.g.player.hp, 10 * c.g.stats.armor * (stage === 3 ? 0.5 : 1));
    assert.equal(c.g.slowed, stage === 2 ? 1 : 0);
    assert.equal(c.g.corroded, stage === 3 ? 1.5 : 0);
    assert.equal(c.g.sealed, stage === 4 ? 1 : 0);
    assert.equal(c.g.immobilized, 0);
    assert.equal(c.g.entangled, 0);
    assert.equal(c.g.burning.life, 0);
  }
});

test('劫灵弹幕命中定身：原生第六境与终关旧王生效，保护期内不重复，独立天劫不变', () => {
  for (const [stage, arena] of [
    [5, 5],
    [5, FINAL_TRIAL_STAGE],
  ] as const) {
    const c = encounter(stage, arena);
    // 清灵散把定身压到 0.5 秒，保护期仍为 1 秒，才能区分「已定身」与「保护期」。
    c.g.medicine.poison = 0.5;
    collide(c);
    assert.equal(c.g.immobilized, ENEMY_CONTROL.bind / 2);
    const protection = c.g.nextEnemyBindAt;
    c.g.immobilized = 0;
    c.g.time = 0.6;
    c.g.player.invincible = 0;
    collide(c);
    assert.equal(c.g.immobilized, 0, '保护期内不重复定身');
    assert.equal(c.g.nextEnemyBindAt, protection);
    c.g.time = 1.1;
    c.g.player.invincible = 0;
    collide(c);
    assert.equal(c.g.immobilized, ENEMY_CONTROL.bind / 2, '保护期结束后可再次定身');
  }
  const base = encounter(5);
  base.g.save.age = base.g.save.nextTribulationAge = 20000;
  const trial = Game.createTribulation(base.g.save, base.g);
  const boss = trial.boss!;
  boss.bossStage = 5;
  trial.player.invincible = 0;
  const shot = trial.hostileShot(boss, 1, 0, 0, 10);
  Object.assign(shot, { x: trial.player.x, y: trial.player.y });
  assert.equal(shot.bossStage, undefined);
  trial.updateShots(0);
  assert.equal(trial.immobilized, 0);
});

test('小兵火球、冰弹、魂弹沿用原生地域控制，终关小兵火球不附加新灼烧', () => {
  for (const [skill, stage, burn, slow, seal] of [
    ['firebolt', 1, 3, 0, 0],
    ['firebolt', 6, 0, 0, 0],
    ['frostbolt', 2, 0, 2, 0],
    ['soul', 4, 0, 0, 2],
  ] as const) {
    const { g } = encounter(stage);
    const shot = g.hostileShot(g.player, 1, 0, 0, 1);
    shot.enemySkill = skill;
    g.updateShots(0);
    assert.deepEqual([g.burning.life, g.slowed, g.sealed], [burn, slow, seal]);
    assert.equal(g.entangled, 0);
    assert.equal(g.corroded, 0);
    assert.equal(g.immobilized, 0);
  }
});

test('毒矢仅phase1五发标记，原生与终关保留难度规则，其他妖王与天劫不标记', () => {
  for (const arena of [3, 6])
    for (const difficulty of [0, 1, 2]) {
      const c = encounter(3, arena, difficulty);
      cast(c, 1);
      assert.equal(c.g.shots.length, 5);
      for (const shot of c.g.shots) {
        near(
          Math.hypot(shot.vx, shot.vy),
          190 * (arena === 6 ? 1 : DIFFICULTIES[difficulty].bossShotSpeed[3]),
        );
        assert.equal(shot.miasmaArrow, true);
        assert.equal(shot.miasmaDamage, c.boss.damage);
        assert.equal(shot.damage, c.boss.damage * 0.75);
        assert.deepEqual(shot.origin, { x: c.boss.x, y: c.boss.y });
      }
    }
  for (const stage of [0, 1, 2, 4, 5, 6]) {
    const c = encounter(stage);
    cast(c, stage === 1 || stage === 6 ? 0 : 1);
    assert.ok(c.g.shots.length > 0);
    assert.ok(
      c.g.shots.every((shot) => shot.miasmaArrow === undefined && shot.miasmaDamage === undefined),
    );
  }
  const trial = encounter(3);
  trial.g.save.age = trial.g.save.nextTribulationAge = 20000;
  const g = Game.createTribulation(trial.g.save, trial.g);
  const boss = g.boss!;
  boss.bossStage = 3;
  cast({ g, boss }, 1);
  assert.ok(g.tribulation);
  assert.equal(g.shots.length, 5);
  for (const shot of g.shots) {
    near(Math.hypot(shot.vx, shot.vy), 160);
    assert.equal(shot.miasmaArrow, undefined);
    assert.equal(shot.miasmaDamage, undefined);
    assert.equal(shot.bossStage, undefined);
  }
});

test('毒矢字段跟随快照、暂停和导入往返，旧无标记弹仍可恢复', () => {
  const c = encounter(3);
  cast(c, 1);
  c.g.pause();
  const raw = JSON.parse(JSON.stringify(c.g.snapshot()));
  for (const restored of [Game.restore(c.g.save, raw), importSave(exportSave(c.g.save, c.g)).run]) {
    assert.ok(restored);
    assert.deepEqual(restored.snapshot().shots, raw.shots);
    restored.update(0.5);
    assert.deepEqual(restored.snapshot().shots, raw.shots);
  }
  const legacy = structuredClone(raw);
  for (const shot of legacy.shots) {
    delete shot.miasmaArrow;
    delete shot.miasmaDamage;
  }
  assert.ok(Game.restore(c.g.save, legacy));
});

test('毒矢按发射origin满500化毒瘴，基伤不随施放者移动、改伤或死亡改变', () => {
  for (const arena of [3, 6]) {
    const c = encounter(3, arena);
    cast(c, 1);
    const shot = c.g.shots[2];
    c.g.shots = [shot];
    const baseDamage = c.boss.damage;
    Object.assign(c.g.player, { x: 10000, y: 10000 });
    Object.assign(shot, { x: shot.origin.x + 299.99, y: shot.origin.y + 400, vx: 0, vy: 0 });
    c.g.updateShots(0);
    assert.equal(c.g.shots.length, 1);
    assert.equal(c.g.zones.length, 0);
    c.boss.x = shot.x;
    c.boss.y = shot.y;
    c.boss.damage *= 10;
    c.g.hitEnemy(c.boss, c.boss.hp * 100);
    assert.equal(c.boss.dead, true);
    shot.x = shot.origin.x + 300;
    c.g.updateShots(0);
    assert.equal(c.g.shots.length, 0);
    assert.equal(c.g.zones.length, 1);
    const zone = c.g.zones[0];
    assert.deepEqual([zone.x, zone.y], [shot.origin.x + 300, shot.origin.y + 400]);
    assert.equal(zone.kind, 'boss-miasma');
    assert.equal(zone.radius, 47);
    assert.equal(zone.life, 5);
    assert.equal(zone.maxLife, 5);
    assert.equal(zone.delay, 0.3);
    assert.equal(zone.castDelay, 0.3);
    assert.equal(zone.damage, baseDamage);
    assert.equal(zone.hostile, true);
    assert.equal(zone.sourceId, undefined);
    assert.equal(zone.vx, undefined);
    assert.equal(zone.vy, undefined);
    c.g.updateShots(0);
    assert.equal(c.g.zones.length, 1, '同一箭仅化瘴一次');
    c.g.updateZones(0.1);
    assert.equal(c.g.zones.length, 1, '施放者死亡不散去已化毒瘴');
  }
});

test('毒矢距离边界先碰撞，命中或佛光消弹均不在脚下额外化瘴', () => {
  for (const shield of [false, true]) {
    const c = encounter(3);
    cast(c, 1);
    const shot = c.g.shots[2];
    c.g.shots = [shot];
    Object.assign(shot, { x: shot.origin.x + 510, y: shot.origin.y, vx: 0, vy: 0 });
    Object.assign(c.g.player, { x: shot.x, y: shot.y });
    if (shield) {
      c.g.weapons = [{ id: 'beads', level: 1, evolved: false, timer: 99999 }];
      grantCurio(c.g.save, 'sacred-fragment');
    }
    const hp = c.g.player.hp;
    c.g.updateShots(0);
    assert.equal(c.g.shots.length, 0);
    assert.equal(c.g.zones.length, 0);
    assert.equal(c.g.corroded, shield ? 0 : 3);
    near(hp - c.g.player.hp, shield ? 0 : shot.damage * c.g.stats.armor);
  }
});

test('化瘴预警期间无伤，生效后按原毒伤倍率蚀体；暂停和续局保留毒瘴', () => {
  const c = encounter(3);
  cast(c, 1);
  const shot = c.g.shots[2];
  c.g.shots = [shot];
  Object.assign(c.g.player, { x: 10000, y: 10000 });
  Object.assign(shot, { x: shot.origin.x + 510, y: shot.origin.y, vx: 0, vy: 0 });
  c.g.updateShots(0);
  const zone = c.g.zones[0];
  c.g.pause();
  const raw = JSON.parse(JSON.stringify(c.g.snapshot()));
  const restored = Game.restore(c.g.save, raw);
  assert.ok(restored);
  restored.update(0.5);
  assert.deepEqual(restored.zones, raw.zones);
  restored.resume();
  Object.assign(restored.player, { x: zone.x, y: zone.y, invincible: 0 });
  restored.medicine.poison = 0.5;
  const hp = restored.player.hp;
  restored.updateZones(0.29);
  assert.equal(restored.player.hp, hp);
  assert.equal(restored.zones[0].life, 5);
  restored.updateZones(0.02);
  assert.equal(restored.player.hp, hp);
  restored.updateZones(0.01);
  near(hp - restored.player.hp, shot.miasmaDamage! * 0.5 * restored.stats.armor);
  assert.equal(restored.corroded, 1.5);
});

test('旧无标记毒弹与寿命结束毒矢不化瘴', () => {
  for (const expired of [false, true]) {
    const c = encounter(3);
    cast(c, 1);
    const shot = c.g.shots[2];
    c.g.shots = [shot];
    Object.assign(c.g.player, { x: 10000, y: 10000 });
    Object.assign(shot, { x: shot.origin.x + 300, y: shot.origin.y + 400, vx: 0, vy: 0 });
    if (expired) shot.life = 0;
    else {
      delete shot.miasmaArrow;
      delete shot.miasmaDamage;
    }
    c.g.updateShots(0);
    assert.equal(c.g.zones.length, 0);
    assert.equal(c.g.shots.length, expired ? 0 : 1);
  }
});

test('毒矢续局拒绝不合法标记、缺失或负/非有限基伤、错误归属及损坏origin', () => {
  const c = encounter(3);
  cast(c, 1);
  const base = c.g.snapshot();
  assert.ok(Game.restore(c.g.save, base));
  const invalid: Partial<Shot>[] = [
    { miasmaArrow: 'true' as unknown as boolean },
    { miasmaArrow: false },
    { miasmaDamage: undefined },
    { miasmaDamage: -1 },
    { miasmaDamage: NaN },
    { miasmaDamage: Infinity },
    { miasmaDamage: null as unknown as number },
    { bossStage: 6 },
    { kind: 'sword' },
    { enemySkill: 'firebolt' },
    { origin: { x: NaN, y: 0 } },
    { origin: undefined as unknown as Shot['origin'] },
  ];
  for (const change of invalid) {
    const raw = structuredClone(base);
    Object.assign(raw.shots[0], change);
    assert.equal(Game.restore(c.g.save, raw), null, String(Object.keys(change)));
  }
});

test('5支毒矢同时在500像素处化瘴，相邻毒池圆心距离与两池半径之和相差不超过1像素（贴边、不明显重叠）', () => {
  const c = encounter(3);
  cast(c, 1);
  assert.equal(c.g.shots.length, 5);
  for (const s of c.g.shots) {
    const angle = Math.atan2(s.vy, s.vx);
    s.x = s.origin.x + Math.cos(angle) * 500;
    s.y = s.origin.y + Math.sin(angle) * 500;
  }
  c.g.updateShots(0);
  assert.equal(c.g.zones.length, 5);
  for (const z of c.g.zones) {
    assert.equal(z.kind, 'boss-miasma');
    assert.equal(z.radius, 47);
  }
  const angles = c.g.zones
    .map((z) => Math.atan2(z.y - c.boss.y, z.x - c.boss.x))
    .sort((a, b) => a - b);
  for (let i = 0; i < angles.length - 1; i++) {
    const z1 = c.g.zones.find(
      (z) => Math.abs(Math.atan2(z.y - c.boss.y, z.x - c.boss.x) - angles[i]) < 1e-6,
    )!;
    const z2 = c.g.zones.find(
      (z) => Math.abs(Math.atan2(z.y - c.boss.y, z.x - c.boss.x) - angles[i + 1]) < 1e-6,
    )!;
    const dist = Math.hypot(z1.x - z2.x, z1.y - z2.y);
    const sumRadius = z1.radius + z2.radius;
    assert.ok(
      Math.abs(dist - sumRadius) <= 1,
      `相邻圆心距离 ${dist} 与半径和 ${sumRadius} 相差不超过1像素`,
    );
  }
});
