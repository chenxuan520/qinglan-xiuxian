import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { freshSave } from '../src/progress.ts';
import {
  ENEMIES,
  ENEMY_TACTICS,
  STAGE_ENEMIES,
  LEGACY_TRIAL_ENEMIES,
  STAGES,
  enemyRoster,
  evolutionPassives,
  treasure,
} from '../src/data.ts';

function fixture(stage = 0, root = 'heaven') {
  const save = freshSave(root);
  save.unlocked = 6;
  save.cultivation = 1e6;
  const g = new Game(save, stage, 0, () => 0.99);
  g.weapons[0].timer = 9999;
  g.spawnBudget = -10000;
  g.nextElite = 9999;
  return g;
}
function cast(type: number, elite = false, range = 150) {
  const stage = STAGE_ENEMIES.findIndex((pool) => pool.includes(type));
  const g = fixture(stage);
  const e = g.spawnEnemy(type, elite, false, { x: 400, y: -300 });
  g.player.x = e.x + range;
  g.player.y = e.y;
  e.cooldown = 0;
  g.castEnemySkill(e, range, 1, 0);
  return { g, e };
}
function advance(g: Game, seconds: number) {
  for (let i = 0; i < Math.ceil(seconds / 0.01); i++) g.update(0.01);
}

test('所有地域地面技能从施法者附近生成，整个区域不越过200像素，远处不施法', () => {
  let samples = 0;
  for (const type of [10, 31, 14, 53, 69, 4])
    for (const elite of [false, true]) {
      const { g, e } = cast(type, elite);
      assert.ok(g.zones.length, `${type}/${elite}`);
      const zones = structuredClone(g.zones);
      for (const z of zones) {
        assert.ok(Math.hypot(z.x - e.x, z.y - e.y) + z.radius <= 200.00001);
        assert.ok(z.delay >= 0.85);
      }
      g.player.x += 900;
      assert.deepEqual(g.zones, zones);
      const far = cast(type, elite, 1500);
      assert.equal(far.g.zones.length, 0);
      assert.equal(far.e.pendingSkill, undefined);
      assert.equal(far.e.charge, 0);
      samples++;
    }
  assert.equal(samples, 12);
});

test('普通与精英火弹霜弹可见飞行、锁定方向且有射程，星环保留连续缺口', () => {
  for (const [type, skill, counts] of [
    [33, 'firebolt', [1, 2]],
    [45, 'frostbolt', [1, 3]],
    [26, 'gapring', [8, 10]],
  ]) {
    for (const elite of [false, true]) {
      const { g, e } = cast(type, elite, 250);
      assert.equal(e.pendingSkill, skill);
      assert.equal(e.windup, 0.65);
      assert.equal(g.shots.length, 0);
      g.player.y += 50;
      g.fireEnemyVolley(e, skill);
      assert.equal(g.shots.length, counts[Number(elite)]);
      assert.equal(g.zones.length, 0);
      for (const b of g.shots) {
        assert.ok(b.life * Math.hypot(b.vx, b.vy) <= 400.00001);
        assert.equal(b.origin.x, e.x);
        if (skill !== 'gapring') assert.equal(b.enemySkill, skill);
      }
      if (skill === 'gapring') {
        const angles = g.shots
          .map((b) => (Math.atan2(b.vy, b.vx) + Math.PI * 2) % (Math.PI * 2))
          .sort((a, b) => a - b);
        const gaps = angles.map(
          (a, i) => (angles[(i + 1) % angles.length] - a + Math.PI * 2) % (Math.PI * 2),
        );
        assert.ok(Math.max(...gaps) > 1.4);
      }
      g.shots = [];
      g.player.x = e.x + 800;
      g.fireEnemyVolley(e, skill);
      assert.equal(g.shots.length, 0);
    }
  }
});

test('霜弹命中减速0.55秒，2.5秒内不连控，无敌及暂停期间不被追加减速', () => {
  const { g, e } = cast(45);
  g.fireEnemyVolley(e, 'frostbolt');
  const b = g.shots[0];
  b.x = g.player.x;
  b.y = g.player.y;
  g.updateShots(0);
  assert.equal(g.slowed, 0.55);
  assert.equal(g.nextEnemySlowAt, 2.5);
  g.player.invincible = 0;
  g.slowed = 0;
  g.time = 1;
  g.enemySlow();
  assert.equal(g.slowed, 0);
  g.time = 2.6;
  g.player.invincible = 1;
  g.enemySlow();
  assert.equal(g.slowed, 0);
  g.player.invincible = 0;
  g.enemySlow();
  assert.equal(g.slowed, 0.55);
  const snapshot = g.snapshot();
  const restored = Game.restore(g.save, snapshot)!;
  assert.ok(restored);
  restored.update(0.05);
  assert.equal(restored.slowed, 0.55);
  assert.equal(restored.nextEnemySlowAt, 5.1);
});

test('毒孢只在死亡位置出现一次，召唤者死亡令护卫散去且不额外结算收益', () => {
  for (const selfDestruct of [false, true]) {
    const g = fixture(3);
    const e = g.spawnEnemy(54, false, false, { x: 200, y: 300 });
    if (selfDestruct) {
      g.player.x = 200;
      g.player.y = 300;
      g.updateEnemies(0);
    } else g.hitEnemy(e, e.hp * 2);
    const z = g.zones.filter((z) => z.kind === 'enemy-miasma');
    assert.equal(z.length, 1);
    assert.equal(z[0].x, 200);
    assert.equal(z[0].y, 300);
    assert.ok(z[0].delay >= 0.85);
    g.hitEnemy(e, 999);
    assert.equal(g.zones.filter((z) => z.kind === 'enemy-miasma').length, 1);
  }
  const { g, e } = cast(63, true);
  const children = g.enemies.filter((c) => c.summonedBy === e.id);
  assert.equal(children.length, 3);
  g.hitEnemy(e, e.hp * 2);
  assert.ok(children.every((c) => c.dead));
  assert.equal(g.kills, 1);
  assert.equal(g.pickups.filter((p) => p.kind === 'xp').length, 1);
});

test('终关分批复用地域机制，旧续局兵种与原技能不被替换', () => {
  assert.deepEqual(enemyRoster(6, 0), [65, 33, 59]);
  assert.ok(enemyRoster(6, 45).includes(45));
  assert.ok(enemyRoster(6, 45).includes(54));
  assert.ok(enemyRoster(6, 90).includes(69));
  assert.ok(enemyRoster(6, 90).includes(26));
  assert.ok(enemyRoster(6, 150).includes(63));
  const g = fixture(6);
  const e = g.spawnEnemy(33, true, false, { x: 200, y: 0 });
  e.cooldown = 0;
  g.update(0.01);
  assert.equal(e.pendingSkill, 'firebolt');
  const old = g.snapshot();
  delete old.encounterVersion;
  delete old.cacheChallenge;
  delete old.nextEnemySlowAt;
  const restored = Game.restore(g.save, old)!;
  assert.ok(restored);
  assert.equal(restored.encounterVersion, 0);
  assert.deepEqual(enemyRoster(6, 420, true), LEGACY_TRIAL_ENEMIES);
});

function offered(stage = 0) {
  const g = fixture(stage);
  g.time = STAGES[stage].minutes * 60 * 0.45;
  g.updateCacheChallenge();
  assert.equal(g.cacheChallenge?.phase, 'offered');
  return g;
}
function started(stage = 0) {
  const g = offered(stage);
  Object.assign(g.player, { x: g.cacheChallenge!.x, y: g.cacheChallenge!.y });
  assert.equal(g.beginCacheChallenge(), true);
  return g;
}

test('前六境中段各提供一次自选守匣，必须靠近并点击，不挤破精英上限', () => {
  for (let stage = 0; stage < 6; stage++) {
    const g = offered(stage);
    assert.equal(g.state, 'playing');
    assert.equal(g.cacheNearby, false);
    assert.equal(g.beginCacheChallenge(), false);
    assert.equal(g.enemies.length, 0);
    Object.assign(g.player, { x: g.cacheChallenge!.x, y: g.cacheChallenge!.y });
    for (let i = 0; i < 3; i++) g.spawnEnemy(0, true);
    assert.equal(g.beginCacheChallenge(), false);
    g.enemies.pop();
    g.state = 'paused';
    assert.equal(g.beginCacheChallenge(), false);
    g.state = 'playing';
    assert.equal(g.beginCacheChallenge(), true);
    assert.equal(g.beginCacheChallenge(), false);
    const guards = g.enemies.filter((e) => e.cacheGuardian);
    assert.equal(guards.length, 2);
    assert.ok(guards.every((e) => Math.hypot(e.x - g.player.x, e.y - g.player.y) >= 100));
    assert.equal(g.enemies.filter((e) => e.elite).length, 4);
    g.nextElite = g.time;
    g.updateEliteWave();
    assert.equal(g.enemies.filter((e) => e.elite).length, 4);
  }
  for (const disabled of ['old', 'trial', 'tribulation']) {
    const g = fixture(disabled === 'trial' ? 6 : 0);
    g.time = 120;
    if (disabled === 'old') g.encounterVersion = 0;
    if (disabled === 'tribulation') g.tribulation = 1;
    g.updateCacheChallenge();
    assert.equal(g.cacheChallenge, null);
  }
});

test('守匣守卫及其召唤物不给击杀修为与额外掉落，完成后只奖励一匣', () => {
  const g = started(4);
  const c = g.cacheChallenge!;
  const summoner = g.enemies.find((e) => e.type === 63)!;
  g.castEnemySkill(summoner, 120, 1, 0);
  const children = g.enemies.filter((e) => e.summonedBy === summoner.id);
  assert.ok(children.length);
  assert.ok(children.every((e) => e.cacheGuardian));
  const before = {
    cult: g.save.cultivation,
    credited: g.creditedCultivation,
    combat: g.combatCultivation,
    xp: g.xp,
    kills: g.kills,
  };
  g.hitEnemy(children[0], children[0].hp * 10);
  for (const id of c.guardians) {
    const e = g.enemies.find((e) => e.id === id)!;
    g.hitEnemy(e, e.hp * 10);
  }
  assert.deepEqual(
    {
      cult: g.save.cultivation,
      credited: g.creditedCultivation,
      combat: g.combatCultivation,
      xp: g.xp,
      kills: g.kills,
    },
    before,
  );
  assert.equal(g.pickups.length, 0);
  g.updateCacheChallenge();
  g.updateCacheChallenge();
  assert.equal(c.phase, 'cleared');
  assert.equal(g.pickups.length, 1);
  assert.equal(g.pickups[0].kind, 'chest');
  g.player.hp = g.player.maxHp * 0.5;
  g.updatePickups(0);
  assert.equal(g.pickups.length, 0);
  assert.equal(g.iron, 2);
  assert.equal(g.weapons[0].level, 2);
  g.updateCacheChallenge();
  assert.equal(g.pickups.length, 0);
});

test('守匣超时与跳过不强迫战斗、清理守卫不掉落；暂停与选技不消耗挑战时间', () => {
  for (const active of [false, true]) {
    const g = active ? started() : offered();
    const c = g.cacheChallenge!;
    for (const state of ['paused', 'upgrade']) {
      g.state = state;
      const t = g.time;
      advance(g, 1);
      assert.equal(g.time, t);
    }
    g.state = 'playing';
    g.time = c.deadline;
    g.updateCacheChallenge();
    assert.equal(c.phase, 'expired');
    assert.ok(g.enemies.every((e) => !e.cacheGuardian || e.dead));
    assert.equal(g.pickups.length, 0);
    g.time += 30;
    g.updateCacheChallenge();
    assert.equal(c.phase, 'expired');
  }
  const late = fixture();
  late.time = STAGES[0].minutes * 60;
  late.bossSpawned = true;
  late.updateCacheChallenge();
  assert.equal(late.cacheChallenge, null);
});

test('挑战进行、已清场与已拾取续局均不重复出怪或奖励，快照对象互不污染', () => {
  const g = started();
  const first = g.enemies[0];
  g.hitEnemy(first, first.hp * 10);
  g.enemies = g.enemies.filter((e) => !e.dead);
  const snap = g.snapshot();
  let restored = Game.restore(g.save, snap)!;
  assert.ok(restored);
  restored.cacheChallenge!.guardians.push(999);
  assert.equal(snap.cacheChallenge!.guardians.length, 2);
  restored = Game.restore(g.save, snap)!;
  restored.resume();
  restored.updateCacheChallenge();
  assert.equal(restored.cacheChallenge!.phase, 'active');
  assert.equal(restored.enemies.length, 1);
  restored.hitEnemy(restored.enemies[0], restored.enemies[0].hp * 10);
  restored.updateCacheChallenge();
  restored = Game.restore(restored.save, restored.snapshot())!;
  assert.ok(restored);
  restored.resume();
  restored.updateCacheChallenge();
  assert.equal(restored.pickups.length, 1);
  restored.updatePickups(0);
  restored = Game.restore(restored.save, restored.snapshot())!;
  assert.ok(restored);
  restored.resume();
  restored.updateCacheChallenge();
  assert.equal(restored.pickups.length, 0);
  assert.equal(restored.iron, 2);
});

test('新遭遇快照拒绝损坏时间、阶段、守卫清单、技能和不适用场景', () => {
  const g = started();
  for (const change of [
    (s) => (s.encounterVersion = 2),
    (s) => (s.nextEnemySlowAt = NaN),
    (s) => (s.cacheChallenge.deadline = -1),
    (s) => (s.cacheChallenge.x = Infinity),
    (s) => (s.cacheChallenge.phase = 'won'),
    (s) => (s.cacheChallenge.guardians = [1, 1]),
    (s) => (s.cacheChallenge.guardians = []),
    (s) => (s.stage = 6),
    (s) => (s.enemies[0].cacheGuardian = 1),
  ]) {
    const s = g.snapshot();
    change(s);
    assert.equal(Game.restore(g.save, s), null);
  }
});

test('摄魂镰可暴击，同次横扫共用判定，处决倍率和厄运咒增益均真实生效', () => {
  function damage(critical: boolean, curse = 0, low = false) {
    const g = fixture();
    g.weapons = [{ id: 'scythe', level: 4, evolved: false, timer: 0 }];
    g.passives = { curse };
    const enemies = [-10, 10].map((y) => g.spawnEnemy(0, false, false, { x: 50, y }));
    for (const e of enemies) {
      e.maxHp = 1e9;
      e.hp = low ? 2e8 : 1e9;
    }
    g.random = () => (critical ? 0 : 0.999);
    g.cast(g.weapons[0]);
    assert.equal(enemies[0].hp, enemies[1].hp);
    return g.damageDealt;
  }
  const normal = damage(false);
  assert.ok(Math.abs(damage(true) / normal - 1.8) < 1e-6);
  assert.ok(Math.abs(damage(true, 5) / normal - 2.4) < 1e-6);
  assert.ok(Math.abs(damage(true, 5, true) / normal - 4.8) < 1e-6);
});

test('开天斧由防御功法觉醒，旧续局保留原配方和已待选觉醒', () => {
  assert.deepEqual(evolutionPassives(treasure('axe'), 'demonic'), ['bone']);
  assert.deepEqual(evolutionPassives(treasure('axe'), 'dual'), ['guard', 'bone']);
  for (const path of ['orthodox', 'demonic', 'dual']) {
    const g = fixture();
    g.path = path;
    g.weapons = [{ id: 'axe', level: 6, evolved: false, timer: 0 }];
    const id = path === 'orthodox' ? 'guard' : 'bone';
    g.passives = { [id]: 5 };
    assert.equal(g.canEvolve('axe'), true);
  }
  const g = fixture();
  g.path = 'demonic';
  g.encounterVersion = 0;
  g.weapons = [{ id: 'axe', level: 6, evolved: false, timer: 0 }];
  g.passives = { blood: 5 };
  assert.equal(g.canEvolve('axe'), true);
  g.state = 'upgrade';
  g.choices = [{ type: 'evolve', id: 'axe', level: 7 }];
  const s = g.snapshot();
  delete s.encounterVersion;
  const restored = Game.restore(g.save, s)!;
  assert.ok(restored);
  assert.equal(restored.state, 'paused');
  assert.equal(restored.weapons[0].evolved, true);
});

test('地域技能在大量混合精英场景下遵守弹丸、法阵与召唤预算', () => {
  const g = fixture(5);
  g.player.invincible = 999;
  for (let i = 0; i < 80; i++) {
    const angle = (i / 80) * Math.PI * 2;
    const e = g.spawnEnemy([69, 26, 33, 45, 53, 63][i % 6], true, false, {
      x: Math.cos(angle) * 160,
      y: Math.sin(angle) * 160,
    });
    e.cooldown = 0;
  }
  let shots = 0,
    zones = 0,
    summons = 0;
  for (let i = 0; i < 1000; i++) {
    g.update(0.01);
    const currentShots = g.shots.filter((b) => b.kind === 'hostile').length;
    const currentZones = g.zones.filter((z) => z.hostile).length;
    const currentSummons = g.enemies.filter((e) => e.summonedBy !== undefined).length;
    assert.ok(currentShots <= 64);
    assert.ok(currentZones <= 10);
    assert.ok(currentSummons <= 12);
    shots = Math.max(shots, currentShots);
    zones = Math.max(zones, currentZones);
    summons = Math.max(summons, currentSummons);
  }
  assert.ok(shots > 0 && zones > 0 && summons > 0);
});

test('旧开天斧待选界面与自动选技都沿用该局的功法配方', async () => {
  const { choiceCard } = await import('../src/common-ui.ts');
  const { autoplayChoice } = await import('../src/autoplay.ts');
  const g = fixture();
  g.path = 'demonic';
  g.encounterVersion = 0;
  g.state = 'upgrade';
  g.weapons = [{ id: 'axe', level: 6, evolved: false, timer: 0 }];
  g.passives = { blood: 4 };
  g.choices = [
    { type: 'passive', id: 'blood', level: 5 },
    { type: 'passive', id: 'bone', level: 1 },
  ];
  assert.equal(autoplayChoice(g)!.index, 0);
  const html = choiceCard(g, g.save, { type: 'weapon', id: 'axe', level: 6 }, 0);
  assert.ok(html.includes('血煞真经五重'));
  assert.ok(!html.includes('白骨魔功五重'));
});
