import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../src/battle/game.ts';
import { freshSave } from '../../src/core/progress.ts';
import {
  BOSS_COMBAT,
  DIFFICULTIES,
  STAGES,
  STAGE_COMBAT_SCALING,
  STAGE_REALM_STEPS,
} from '../../src/core/data.ts';
import { realmDamageMultiplier } from '../../src/core/progress.ts';
import { drawEnemyWarnings } from '../../src/battle/render-warnings.ts';

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
function encounter(origin: number, arena = origin, phase = 0) {
  const save = freshSave('heaven', ['metal'], 'dual', () => 0.5);
  save.unlocked = 6;
  save.completed = [0, 1, 2, 3, 4, 5];
  save.cultivation = 119940;
  const g = new Game(save, arena, 0, () => 0.5);
  g.bossSpawned = true;
  g.nextElite = g.nextTrialBossAt = 99999;
  g.spawnBudget = -10000;
  g.weapons[0].timer = 99999;
  const boss = g.spawnEnemy(10, false, true, { x: -180, y: 0 }, origin);
  Object.assign(boss, { skillStep: phase, cooldown: 99999, pursuitCooldown: 99999, speed: 0 });
  return { g, boss };
}
function cast(origin: number, arena: number, phase: number) {
  const c = encounter(origin, arena, phase);
  c.g.castBossSkill(c.boss, 1, 0);
  c.boss.cooldown = c.boss.pursuitCooldown = 99999;
  return c;
}

test('狐王原生与终关炎扇9+8发、轮舞20+20发，速度与半间隔交错正确', () => {
  for (const arena of [1, 6]) {
    const speedFactor = arena === 6 ? 1 : DIFFICULTIES[0].bossShotSpeed[1];
    const { g, boss } = cast(1, arena, 0);
    assert.equal(g.shots.length, 17);
    g.shots.forEach((shot, i) => {
      near(Math.hypot(shot.vx, shot.vy), (i < 9 ? 200 : 145) * speedFactor);
      near(
        Math.atan2(shot.vy, shot.vx),
        i < 9 ? (i / 8 - 0.5) * 1.5 : ((i - 9) / 7 - 0.5) * 1.5 * (7 / 8),
      );
      assert.equal(shot.damage, boss.damage * 0.75);
    });
    const ring = cast(1, arena, 2);
    assert.equal(ring.g.shots.length, 40);
    ring.g.shots.forEach((shot, i) =>
      near(Math.hypot(shot.vx, shot.vy), (i < 20 ? 180 : 130) * speedFactor),
    );
    // 慢环整体错开半格：每发都落在快环两发之间。
    const angle = (shot: { vx: number; vy: number }) => Math.atan2(shot.vy, shot.vx);
    const spacing = (Math.PI * 2) / 20;
    const gap = (a: number, b: number) => {
      const diff = Math.abs(a - b) % (Math.PI * 2);
      return Math.min(diff, Math.PI * 2 - diff);
    };
    ring.g.shots.slice(20).forEach((slow) => {
      const nearestFast = ring.g.shots
        .slice(0, 20)
        .map((fast) => gap(angle(slow), angle(fast)))
        .reduce((a, b) => Math.min(a, b));
      near(nearestFast, spacing / 2);
    });
    const fire = cast(1, arena, 1);
    assert.equal(fire.g.zones.length, 5);
    assert.ok(fire.g.zones.every((zone) => zone.radius === 50 && zone.life === 3));
  }
});

test('九道回焰和五道魂影伤害0.6倍，重复施法及部分命中后严格遵守18/10上限', () => {
  for (const [origin, batch, limit, kind] of [
    [1, 9, 18, 'return'],
    [4, 5, 10, 'memory'],
  ] as const) {
    for (const arena of [origin, 6]) {
      const { g, boss } = cast(origin, arena, 3);
      assert.equal(g.shots.length, batch);
      g.shots.forEach((shot, i) => {
        assert.equal(shot.damage, boss.damage * 0.6);
        assert.equal(shot.bossMotion!.kind, kind);
        if (shot.bossMotion!.kind === 'memory')
          assert.ok(Math.abs(shot.bossMotion!.warmup - (0.8 + i * 0.2)) < 1e-9);
      });
      for (let i = 0; i < 3; i++) g.castBossMechanic(boss, 1, 0);
      assert.equal(g.shots.length, limit);
      g.shots.splice(1, 1);
      g.castBossMechanic(boss, 1, 0);
      assert.equal(g.shots.length, limit, '不因剩余弹数不是整批而越过上限');
    }
  }
});

test('冥主摄魂灵轮20发速度200，百鬼召六只精英，毒君仍召四只', () => {
  for (const arena of [4, 6]) {
    const { g, boss } = cast(4, arena, 1);
    assert.equal(g.shots.length, 20);
    const speedFactor = arena === 6 ? 1 : DIFFICULTIES[0].bossShotSpeed[4];
    for (const shot of g.shots) {
      near(Math.hypot(shot.vx, shot.vy), 200 * speedFactor);
      assert.equal(shot.damage, boss.damage * 0.75);
      assert.equal(shot.bossMotion, undefined, '环弹不新增回程');
    }
    const summoned = cast(4, arena, 0);
    assert.equal(summoned.g.enemies.filter((e) => !e.boss).length, 6);
    assert.ok(
      summoned.g.enemies
        .filter((e) => !e.boss)
        .every((e) => e.elite && e.summonedBy === summoned.boss.id),
    );
    const poison = cast(3, arena === 6 ? 6 : 3, 2);
    assert.equal(poison.g.enemies.filter((e) => !e.boss).length, 4);
  }
});

test('三具幻影0.8秒前预警，满时各放八发魂弹后消失，不能重复开火', () => {
  for (const arena of [4, 6]) {
    const { g, boss } = cast(4, arena, 4);
    const shadows = g.enemies.filter((e) => e.illusionOf === boss.id);
    assert.equal(shadows.length, 3);
    g.updateEnemies(0.79);
    assert.equal(g.shots.length, 0);
    assert.ok(shadows.every((e) => e.windup! > 0 && e.pendingSkill === 'soul' && !e.dead));
    const arcs: unknown[] = [];
    const ctx = new Proxy(
      {},
      {
        get:
          (_, key) =>
          (...args: unknown[]) => {
            if (key === 'arc') arcs.push(args);
          },
        set: () => true,
      },
    ) as CanvasRenderingContext2D;
    drawEnemyWarnings(ctx, g, () => true);
    assert.equal(arcs.length, 3, '原生和终关都显示现有圆形蓄力提示');
    g.updateEnemies(0.010001);
    assert.equal(g.shots.length, 24);
    assert.ok(shadows.every((e) => e.dead));
    for (const shot of g.shots) {
      near(Math.hypot(shot.vx, shot.vy), 155);
      assert.equal(shot.damage, boss.damage * 0.35);
      assert.equal(shot.color, '#baa2d0');
      assert.equal(shot.enemySkill, 'soul');
    }
    g.updateEnemies(1);
    assert.equal(g.shots.length, 24);
  }
});

test('提前击破的幻影不射击且没有收获，本体倒下取消剩余幻影', () => {
  for (const arena of [4, 6]) {
    const { g, boss } = cast(4, arena, 4);
    const shadow = g.enemies.find((e) => e.illusionOf === boss.id)!;
    const totals = [g.kills, g.xp, g.combatCultivation, g.iron, g.pickups.length];
    g.hitEnemy(shadow, shadow.hp);
    assert.deepEqual([g.kills, g.xp, g.combatCultivation, g.iron, g.pickups.length], totals);
    g.updateEnemies(0.81);
    assert.equal(g.shots.length, 16);
    const second = cast(4, arena, 4);
    second.boss.dead = true;
    second.g.updateEnemies(1);
    assert.equal(second.g.shots.length, 0);
    assert.ok(second.g.enemies.filter((e) => e.illusionOf !== undefined).every((e) => e.dead));
  }
});

test('暂停冻结幻影蓄力，续局散去幻影、保留本体与已发魂弹', () => {
  const { g, boss } = cast(4, 6, 4);
  g.pause();
  g.update(5);
  assert.ok(g.enemies.filter((e) => e.illusionOf !== undefined).every((e) => e.cooldown === 0.8));
  const restored = Game.restore(g.save, g.snapshot())!;
  assert.ok(restored);
  assert.ok(restored.enemies.some((e) => e.id === boss.id));
  assert.ok(restored.enemies.every((e) => e.illusionOf === undefined));
  g.resume();
  g.updateEnemies(0.81);
  const afterFire = Game.restore(g.save, g.snapshot())!;
  assert.ok(afterFire);
  assert.equal(afterFire.shots.length, 24);
});

test('问道和天劫七境妖王血量表精确生效，首境不跳过，冥主倍率 2.69', () => {
  const expected = [
    [1, 1.2, 1.2, 1.2, 1.2, 1.2, 1],
    [1.9, 3.2, 3.9, 3.3, 3.5, 2.9, 1],
    [2.2, 8, 8.4, 11.5, 13, 3.4, 1],
  ];
  const ramps = [
    [1, 1.15, 1.2, 1.25, 1.2, 1.2, 1],
    [1, 1.15, 1.5, 1.7, 1.6, 1.6, 1],
    [1, 1.65, 2.2, 2.7, 3.1, 2.6, 1],
  ];
  assert.equal(BOSS_COMBAT.hp[4], 2.69);
  assert.equal(BOSS_COMBAT.hp[1], 1.65 * 1.3 * 1.2 * 1.2 * 1.2);
  for (const [difficulty, rule] of DIFFICULTIES.entries()) {
    assert.deepEqual(rule.bossHp, expected[difficulty]);
    assert.deepEqual(rule.stageRamp, ramps[difficulty]);
    assert.equal(rule.reward, [1, 1.5, 2.2][difficulty]);
    for (let stage = 0; stage < STAGES.length; stage++) {
      const g = new Game(freshSave(), stage, difficulty, () => 0.5);
      const boss = g.spawnEnemy(10, false, true, { x: 0, y: 0 }, stage);
      const base = stage === 6 ? 560000 : [16000, 27000, 38000, 49000, 78000, 106500][stage];
      const hp =
        base *
        rule.hp *
        (stage === 6
          ? BOSS_COMBAT.trialHp * BOSS_COMBAT.trialKingHp[stage]
          : BOSS_COMBAT.hp[stage] * expected[difficulty][stage]) *
        STAGE_COMBAT_SCALING[stage].hp *
        realmDamageMultiplier(STAGE_REALM_STEPS[stage]);
      assert.equal(boss.hp, hp);
    }
  }
});

test('问道与天劫只加难第二至第六境，首末关和初入仙途不变', () => {
  assert.deepEqual(DIFFICULTIES[0], {
    name: '初入仙途',
    label: '从容修行',
    bossHp: [1, 1.2, 1.2, 1.2, 1.2, 1.2, 1],
    bossCooldown: [1, 0.9, 0.9, 0.9, 0.9, 0.9, 1],
    bossShotSpeed: [1, 1.1, 1.1, 1.1, 1.1, 1.1, 1],
    stageRamp: [1, 1.15, 1.2, 1.25, 1.2, 1.2, 1],
    hp: 0.85 * 1.03,
    damage: 0.72 * 1.02,
    amount: 0.9,
    reward: 1,
  });
  for (const [index, rule] of DIFFICULTIES.slice(1).entries()) {
    assert.equal(rule.stageRamp[0], 1);
    assert.equal(rule.stageRamp[6], 1);
    assert.equal(rule.bossHp[0], [1.9, 2.2][index]);
    assert.equal(rule.bossHp[6], 1);
  }
});
