import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { ENEMIES, ENEMY_TACTICS, STAGE_ENEMIES } from '../src/data.ts';
import { autoplayInput } from '../src/autoplay.ts';
import { freshSave } from '../src/progress.ts';

function encounter(stage: number, type: number, elite = false, distance = 200) {
  const save = freshSave();
  save.unlocked = 6;
  save.cultivation = 1e9;
  const g = new Game(save, stage, 0, () => 0.5);
  g.weapons[0].timer = 9999;
  g.spawnBudget = -10000;
  g.nextElite = 9999;
  g.bossSpawned = true;
  const e = g.spawnEnemy(type, elite, false, { x: -distance, y: 0 });
  e.cooldown = 0;
  return { g, e };
}
function advance(g: Game, seconds: number) {
  for (let i = 0; i < Math.round(seconds * 100); i++) g.update(0.01);
}

test('前六境72种精英均有实际主动技能，原地追击的杂兵也能蓄力扑杀', () => {
  let count = 0;
  for (let stage = 0; stage < 6; stage++)
    for (const type of STAGE_ENEMIES[stage]) {
      const { g, e } = encounter(stage, type, true, 140);
      const skill = ENEMY_TACTICS[type].eliteSkill;
      g.update(0.01);
      assert.ok(e.charge > 0 || e.windup! > 0, `${stage}: ${ENEMIES[type].name} / ${skill}`);
      if (skill === 'dash') assert.ok(e.charge > 0.55);
      else if (['ranged', 'volley', 'nova', 'soul'].includes(skill)) {
        assert.equal(g.shots.length, 0);
        advance(g, 0.7);
        assert.ok(g.shots.length > 0);
      } else if (skill === 'summon') {
        assert.equal(g.enemies.filter((v) => v.summonedBy === e.id).length, 3);
      } else assert.ok(g.zones.some((z) => z.kind === `enemy-${skill}` && z.delay > 0));
      count++;
    }
  assert.equal(count, 72);
});

test('六境法师分别缠足、火径、寒阵、毒池、交射与落雷，普通怪和精英均有地域差异', () => {
  for (const [stage, type] of [5, 33, 45, 53, 61, 69].entries()) {
    for (const elite of [false, true]) {
      const { g, e } = encounter(stage, type, elite);
      const hp = g.player.hp;
      g.update(0.01);
      if (stage === 4) {
        assert.equal(e.pendingSkill, 'soul');
        advance(g, 0.7);
        assert.equal(g.shots.length, elite ? 4 : 2);
      } else {
        const kind = ['roots', 'firepath', 'frost', 'miasma', '', 'storm'][stage];
        assert.ok(g.zones.every((z) => z.kind === `enemy-${kind}` && z.delay > 0));
        advance(g, 0.4);
        assert.equal(g.player.hp, hp, '预警期不伤害玩家');
      }
    }
  }
});

test('狼群分别包抄两翼，保持原速度；首境菇妖仍直接追击', () => {
  const { g, e } = encounter(0, 1);
  const other = g.spawnEnemy(1, false, false, { x: e.x, y: e.y });
  const mushroom = g.spawnEnemy(0, false, false, { x: e.x, y: e.y });
  g.update(0.05);
  assert.ok(e.y * other.y < 0);
  assert.ok(Math.abs(Math.hypot(e.x + 200, e.y) - e.speed * 0.05) < 1e-8);
  assert.equal(mushroom.y, 0);
  assert.equal(mushroom.charge, 0);
});

test('灵弹蓄势后才发射，方向提前锁定，击杀施法者可以打断', () => {
  const { g, e } = encounter(0, 2);
  g.update(0.01);
  assert.equal(g.shots.length, 0);
  g.player.y = 180;
  advance(g, 0.5);
  assert.equal(g.shots.length, 0);
  advance(g, 0.2);
  assert.ok(g.shots.length > 0);
  assert.equal(g.shots[0].vy, 0);
  e.cooldown = 0;
  g.shots = [];
  g.update(0.01);
  assert.ok(e.pendingSkill);
  e.dead = true;
  advance(g, 0.7);
  assert.equal(g.shots.length, 0);
});

test('藤阵寒阵可躲，迟滞最多25%，离阵后消退，暂停续局保留且复活清除', () => {
  for (const [stage, type] of [
    [0, 5],
    [2, 45],
  ]) {
    const { g } = encounter(stage, type);
    g.update(0.01);
    const base = g.stats.speed;
    advance(g, 1);
    assert.ok(g.player.hp < g.player.maxHp);
    assert.equal(g.stats.speed, base * 0.75);
    const snapshot = g.snapshot();
    const restored = Game.restore(g.save, snapshot)!;
    assert.ok(restored);
    const slowed = restored.slowed;
    advance(restored, 1);
    assert.equal(restored.slowed, slowed);
    restored.resume();
    restored.player.x = 600;
    advance(restored, 0.7);
    assert.equal(restored.slowed, 0);
    assert.equal(restored.stats.speed, base);
    g.state = 'lost';
    g.player.hp = 0;
    assert.ok(g.revive());
    assert.equal(g.slowed, 0);

    const safe = encounter(stage, type).g;
    safe.update(0.01);
    safe.player.x = 400;
    advance(safe, 1.7);
    assert.equal(safe.player.hp, safe.player.maxHp);
    assert.equal(safe.slowed, 0);
  }
});

test('精英冲刺AI侧移避开，续局后仍可辨认锁定路线', () => {
  for (const restored of [false, true]) {
    const { g: original } = encounter(0, 0, true, 180);
    original.update(0.01);
    const g = restored ? Game.restore(original.save, original.snapshot())! : original;
    assert.ok(g);
    g.resume();
    g.pickups.push({ x: -500, y: 0, kind: 'xp', value: 1, pull: false });
    let hits = 0;
    g.onEvent = (name) => {
      if (name === 'hurt') hits++;
    };
    for (let i = 0; i < 160; i++) {
      if (i % 12 === 0) g.input = autoplayInput(g);
      g.update(0.01);
    }
    assert.equal(hits, 0);
  }
});

test('前六境大量精英施法受限：弹幕64、地面技能12、召唤护卫12，不同步爆发', () => {
  const { g } = encounter(5, 69, true);
  g.enemies = [];
  g.player.invincible = 999;
  for (let i = 0; i < 160; i++) {
    const angle = (i / 160) * Math.PI * 2;
    const type = [69, 25, 26, 71][i % 4];
    const e = g.spawnEnemy(type, true, false, {
      x: Math.cos(angle) * 280,
      y: Math.sin(angle) * 280,
    });
    e.cooldown = 0;
  }
  let maxShots = 0,
    maxZones = 0,
    maxSummons = 0;
  for (let i = 0; i < 2000; i++) {
    g.update(0.01);
    maxShots = Math.max(maxShots, g.shots.length);
    maxZones = Math.max(maxZones, g.zones.length);
    maxSummons = Math.max(maxSummons, g.enemies.filter((e) => e.summonedBy !== undefined).length);
    assert.ok(g.shots.length <= 64);
    assert.ok(g.zones.length <= 12);
    assert.ok(g.enemies.filter((e) => e.summonedBy !== undefined).length <= 12);
  }
  assert.ok(maxShots > 0 && maxZones > 0 && maxSummons > 0);
});

test('旧档补默认迟滞字段，蓄势续局不丢技能，无效技能状态拒绝恢复', () => {
  const { g } = encounter(4, 61, true);
  g.update(0.01);
  const restored = Game.restore(g.save, g.snapshot())!;
  assert.ok(restored);
  restored.resume();
  advance(restored, 0.7);
  assert.ok(restored.shots.length > 0);
  const legacy = g.snapshot();
  delete legacy.slowed;
  delete legacy.nextEnemySkillAt;
  for (const e of legacy.enemies) {
    delete e.windup;
    delete e.pendingSkill;
  }
  assert.equal(Game.restore(g.save, legacy)!.slowed, 0);
  for (const value of [NaN, -1, Infinity, 2]) {
    const bad = g.snapshot();
    bad.slowed = value;
    assert.equal(Game.restore(g.save, bad), null);
  }
  const bad = g.snapshot();
  bad.enemies[0].pendingSkill = 'missing';
  assert.equal(Game.restore(g.save, bad), null);
});

test('终关继续使用原行为：法师立即发弹、追击精英第二批才冲刺，无新区域和减速', () => {
  const { g, e } = encounter(6, 61, true);
  g.update(0.01);
  assert.equal(g.shots.length, 1);
  assert.equal(e.windup, undefined);
  assert.equal(e.pendingSkill, undefined);
  assert.equal(g.slowed, 0);
  assert.equal(g.zones.length, 0);
  const chase = encounter(6, 65, true);
  chase.g.update(0.01);
  assert.equal(chase.e.charge, 0);
  chase.g.time = 46;
  chase.e.cooldown = 0;
  chase.g.update(0.01);
  assert.ok(chase.e.charge > 0);
});
