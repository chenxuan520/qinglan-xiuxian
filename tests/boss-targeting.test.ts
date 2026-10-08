import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { STAGES, tribulationRules } from '../src/data.ts';
import { freshSave } from '../src/progress.ts';
import { autoplayInput } from '../src/autoplay.ts';

function fixture(stage = 0) {
  const save = freshSave('heaven');
  save.unlocked = 6;
  save.cultivation = 1e6;
  const g = new Game(save, stage, 0, () => 0.99);
  g.weapons[0].timer = 9999;
  g.spawnBudget = -10000;
  g.nextElite = 9999;
  g.bossSpawned = true;
  g.player.invincible = 0;
  return g;
}

test('七位妖王恢复原地面目标，远距离也能锁定主角，落点不追踪后续移动', () => {
  const counts = {
    '0/0': 6,
    '1/1': 5,
    '2/2': 8,
    '3/0': 5,
    '4/2': 7,
    '5/0': 9,
    '5/2': 5,
    '6/1': 5,
    '6/2': 9,
    '6/5': 1,
  };
  for (const version of [0, 1])
    for (const range of [180, 1000])
      for (let stage = 0; stage < 7; stage++)
        for (let phase = 0; phase < STAGES[stage].skills.length; phase++) {
          const g = fixture(stage);
          g.encounterVersion = version;
          const e = g.spawnEnemy(10, false, true, { x: 510, y: -700 }, stage);
          const target = { x: e.x + range, y: e.y + 80 };
          Object.assign(g.player, target);
          e.skillStep = phase;
          const d = Math.hypot(range, 80);
          g.castBossSkill(e, range / d, 80 / d);
          assert.equal(e.skillStep, (phase + 1) % STAGES[stage].skills.length);
          assert.equal(g.zones.length, counts[`${stage}/${phase}`] ?? 0);
          if (g.zones.length) {
            const center = stage === 6 && phase === 5 ? e : target;
            for (const axis of ['x', 'y']) {
              const mean = g.zones.reduce((sum, z) => sum + z[axis], 0) / g.zones.length;
              assert.ok(
                Math.abs(mean - center[axis]) < 1e-8,
                `${version}/${range}/${stage}/${phase}/${axis}`,
              );
            }
            for (const zone of g.zones) {
              assert.ok(zone.delay >= 1.2 && zone.delay <= 2);
              assert.equal(zone.castDelay, zone.delay);
              assert.ok(zone.kind.startsWith('boss-'));
              assert.equal(zone.damage, e.damage);
            }
          }
          for (const shot of g.shots) assert.equal(shot.life, 6);
          const before = structuredClone(g.zones);
          g.player.x += 900;
          g.player.y -= 900;
          assert.deepEqual(g.zones, before);
        }
});

test('妖王脚下落阵先预警再伤害，暂停与续局不改落点，移动可避开', () => {
  for (const move of [false, true]) {
    const g = fixture(5);
    const e = g.spawnEnemy(10, false, true, { x: -1000, y: 0 }, 5);
    g.castBossSkill(e, 1, 0);
    g.state = 'paused';
    const restored = Game.restore(g.save, g.snapshot())!;
    assert.ok(restored);
    const zones = structuredClone(restored.zones);
    restored.update(0.5);
    assert.deepEqual(restored.zones, zones);
    restored.resume();
    if (move) Object.assign(restored.player, { x: 900, y: 900 });
    const hp = restored.player.hp;
    for (let i = 0; i < 120; i++) restored.updateZones(0.01);
    assert.equal(restored.player.hp, hp);
    restored.updateZones(0.01);
    assert.equal(restored.player.hp < hp, !move);
    assert.deepEqual(
      restored.zones.map((z) => [z.x, z.y]),
      zones.map((z) => [z.x, z.y]),
    );
  }
});

test('独立天劫恢复追身三雷和高阶脚下雷，保留警示时间及原雷弹存续', () => {
  for (const round of [1, 3, 5])
    for (const phase of [0, 1, 2, 3]) {
      const save = freshSave('heaven');
      save.cultivation = 1e6;
      save.tribulations = round - 1;
      const g = Game.createTribulation(save, null);
      g.tribulationStep = phase;
      g.tribulationNextAt = 0;
      Object.assign(g.player, { x: 1500, y: -900 });
      g.input = { x: 0.6, y: 0.8 };
      g.updateTribulation();
      const warning = tribulationRules(round).warning;
      if (phase === 0) {
        assert.equal(g.zones.length, 3);
        g.zones.forEach((zone, i) => {
          assert.equal(zone.x, 1500 + 0.6 * 65 * i);
          assert.equal(zone.y, -900 + 0.8 * 65 * i);
          assert.equal(zone.delay, warning + i * 0.4);
        });
      } else {
        const targeted = g.zones.filter((z) => z.x === 1500 && z.y === -900);
        assert.equal(
          targeted.length,
          (phase === 1 && round >= 3) || (phase === 3 && round >= 4) ? 1 : 0,
        );
        for (const zone of g.zones) assert.ok(zone.delay >= warning);
      }
      assert.ok(g.shots.length);
      for (const shot of g.shots) assert.equal(shot.life, 3.8);
      const zones = structuredClone(g.zones);
      g.player.x -= 500;
      assert.deepEqual(g.zones, zones);
    }
});

test('自动走位能离开妖王锁定主角的十字雷阵，原地停留会受伤', () => {
  for (const moving of [false, true]) {
    const g = fixture(5);
    const e = g.spawnEnemy(10, false, true, { x: -1000, y: 0 }, 5);
    g.castBossSkill(e, 1, 0);
    e.speed = 0;
    e.cooldown = e.pursuitCooldown = 9999;
    const hp = g.player.hp;
    for (let frame = 0; frame < 100; frame++) {
      if (moving && frame % 6 === 0) g.input = autoplayInput(g);
      g.update(0.02);
    }
    assert.equal(g.state, 'playing');
    assert.equal(g.player.hp < hp, !moving);
  }
});
