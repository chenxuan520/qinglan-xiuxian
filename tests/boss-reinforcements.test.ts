import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { freshSave } from '../src/progress.ts';
import { ENEMIES } from '../src/data.ts';
import { enemyCombatStats } from '../src/enemy-stats.ts';
import {
  BOSS_MECHANICS as R,
  bossReturnOut,
  bossShotPose,
  validBossMotion,
} from '../src/boss-mechanics.ts';

function encounter(origin: number, phase: number, arena = origin) {
  const save = freshSave('heaven', ['metal'], 'dual', () => 0.5);
  save.unlocked = 6;
  save.completed = [0, 1, 2, 3, 4, 5];
  save.cultivation = 119940;
  const g = new Game(save, arena, 0, () => 0);
  g.spawnBudget = -10000;
  g.nextElite = g.nextTrialBossAt = 99999;
  g.bossSpawned = true;
  const boss = g.spawnEnemy(10, false, true, { x: -180, y: 0 }, origin);
  boss.skillStep = phase;
  g.castBossSkill(boss, 1, 0);
  return { g, boss };
}

for (const [origin, phase, count] of [
  [0, 2, 3],
  [3, 2, 4],
  [4, 0, 4],
  [6, 4, 6],
])
  for (const arena of origin === 6 ? [6] : [origin, 6])
    test(`第${arena + 1}境妖王${origin}召唤${count}只精英，击杀给正常灵气且不掉宝匣`, () => {
      const { g, boss } = encounter(origin, phase, arena);
      const children = g.enemies.filter((e) => !e.boss);
      assert.equal(children.length, count);
      for (const child of children) {
        assert.equal(child.summonedBy, boss.id);
        assert.equal(child.elite, true);
        const standard = enemyCombatStats(arena, 0, g.time, child.type, true, false);
        assert.equal(child.maxHp, standard.hp);
        assert.equal(child.damage, standard.damage);
      }
      const restored = Game.restore(g.save, g.snapshot());
      assert.ok(restored);
      assert.ok(
        restored.enemies.filter((e) => !e.boss).every((e) => e.elite && e.summonedBy === boss.id),
      );
      const child = children[0];
      g.hitEnemy(child, child.maxHp * 100, false, 'sword');
      assert.equal(g.kills, 1);
      assert.deepEqual(
        g.pickups.filter((p) => p.kind === 'xp').map(({ kind, value }) => ({ kind, value })),
        [{ kind: 'xp', value: Math.round(ENEMIES[child.type].xp * (1 + arena * 0.16) * 8) }],
      );
      assert.equal(
        g.pickups.some((p) => p.kind === 'chest'),
        false,
      );
      assert.deepEqual(g.loot.artifacts, []);
    });

for (const arena of [2, 6])
  test(`第${arena + 1}境召唤双狼至少标准精英强度，击杀给灵气而非宝匣`, () => {
    const { g } = encounter(2, 3, arena);
    const wolves = g.enemies.filter((e) => e.bossSummon?.kind === 'wolf');
    assert.equal(wolves.length, 2);
    for (const wolf of wolves) {
      const standard = enemyCombatStats(arena, 0, g.time, wolf.type, true, false);
      assert.equal(wolf.elite, true);
      assert.ok(wolf.maxHp >= standard.hp);
      assert.ok(wolf.damage >= standard.damage);
      g.hitEnemy(wolf, wolf.maxHp * 100, false, 'sword');
    }
    assert.equal(g.kills, 2);
    assert.equal(g.pickups.filter((p) => p.kind === 'xp').length, 2);
    assert.equal(
      g.pickups.some((p) => p.kind === 'chest'),
      false,
    );
  });

test('普通精英仍掉宝匣，召唤双狼自然到期或随主人消散不结算', () => {
  const { g, boss } = encounter(2, 3);
  const elite = g.spawnEnemy(41, true, false, { x: 300, y: 0 });
  g.hitEnemy(elite, elite.maxHp * 100, false, 'sword');
  assert.ok(g.pickups.some((p) => p.kind === 'chest'));
  const before = [g.kills, g.combatCultivation, g.pickups.length];
  for (const wolf of g.enemies.filter((e) => e.bossSummon?.kind === 'wolf'))
    g.updateBossSummon(wolf, 6.01);
  assert.deepEqual([g.kills, g.combatCultivation, g.pickups.length], before);
  const h = encounter(2, 3);
  h.g.hitEnemy(h.boss, h.boss.maxHp * 100, false, 'sword');
  assert.ok(h.g.enemies.filter((e) => e.bossSummon?.kind === 'wolf').every((e) => e.dead));
});

test('古墟回焰单程534.75、往返232.5，预热/停驻不变；终关仍用178.25与155', () => {
  for (const arena of [1, 6]) {
    const { g } = encounter(1, 3, arena);
    const b = g.shots[2],
      duration = arena === 1 ? 2.3 : 1.15,
      speed = arena === 1 ? 232.5 : 155;
    assert.equal(bossReturnOut(b), duration);
    assert.ok(validBossMotion(b.bossMotion!, 1));
    const edge = bossShotPose(b, R.returnWarmup + duration);
    assert.ok(
      Math.abs(
        Math.hypot(edge.x - b.origin.x, edge.y - b.origin.y) - (arena === 1 ? 534.75 : 178.25),
      ) < 1e-9,
    );
    for (const [age, direction] of [
      [R.returnWarmup + 0.5, 1],
      [R.returnWarmup + duration + R.returnRest + 0.5, -1],
    ]) {
      const pose = bossShotPose(b, age);
      assert.equal(pose.vx, speed * direction);
    }
    assert.equal(b.life, R.returnWarmup + duration * 2 + R.returnRest);
    assert.ok(Game.restore(g.save, g.snapshot()));
  }
});

test('新版本可恢复155旧回焰并保持原去返轨迹，232.5新回焰在转向后续局不瞬移', () => {
  for (const legacy of [false, true]) {
    const { g } = encounter(1, 3);
    const b = g.shots[2];
    g.shots = [b];
    Object.assign(g.player, { x: 2000, y: 2000 });
    if (legacy) {
      b.bossMotion = { kind: 'return', velocity: { x: 155, y: 0 } };
      b.vx = 155;
      b.vy = 0;
      b.life = R.returnWarmup + 2 * R.returnOut + R.returnRest;
    }
    g.updateShots(R.returnWarmup + bossReturnOut(b) + R.returnRest + 0.1);
    const h = Game.restore(g.save, g.snapshot());
    assert.ok(h);
    g.updateShots(0.2);
    h.updateShots(0.2);
    assert.deepEqual(h.shots, g.shots);
    assert.equal(Math.abs(g.shots[0].vx), legacy ? 155 : 232.5);
  }
});

test('普通小兵召唤的精英保留原宝匣规则，妖王已离场的精英召唤物仍不给宝匣', () => {
  const { g, boss } = encounter(4, 0, 6);
  const ordinary = g.spawnEnemy(63, false, false, { x: 300, y: 0 });
  const child = g.spawnEnemy(58, true, false, { x: 320, y: 0 });
  child.summonedBy = ordinary.id;
  g.hitEnemy(child, child.maxHp * 100, false, 'sword');
  assert.ok(g.pickups.some((p) => p.kind === 'chest'));
  const summoned = g.enemies.find((e) => e.summonedBy === boss.id)!;
  g.enemies = g.enemies.filter((e) => e.id !== boss.id);
  g.pickups = [];
  g.hitEnemy(summoned, summoned.maxHp * 100, false, 'sword');
  assert.equal(
    g.pickups.some((p) => p.kind === 'chest'),
    false,
  );
  assert.ok(g.pickups.some((p) => p.kind === 'xp'));
});
