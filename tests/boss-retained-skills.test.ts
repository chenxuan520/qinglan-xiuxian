import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { freshSave } from '../src/progress.ts';
import { bossSkills, bossSkillCooldown, bossPursuitCooldown } from '../src/boss-skills.ts';
import { BOSS_COMBAT, STAGES } from '../src/data.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';

function encounter(origin: number, phase: number, arena = origin) {
  const save = freshSave('heaven', ['metal'], 'dual', () => 0.5);
  save.unlocked = 6;
  save.completed = [0, 1, 2, 3, 4, 5];
  save.cultivation = 119940;
  const g = new Game(save, arena, 0, () => 0.5);
  g.spawnBudget = -10000;
  g.nextElite = g.nextTrialBossAt = 99999;
  g.bossSpawned = true;
  g.weapons[0].timer = 99999;
  g.player.invincible = 99999;
  const e = g.spawnEnemy(10, false, true, { x: -180, y: 0 }, origin);
  Object.assign(e, {
    speed: 0,
    cooldown: 99999,
    pursuitCooldown: 99999,
    skillStep: phase,
    bossSkillQueue: bossSkills(origin, arena === 6)
      .map((_, i) => i)
      .filter((i) => i !== phase),
  });
  return { g, e };
}
function advance(g: Game, seconds: number) {
  for (let t = 0; t < seconds - 1e-9; t += 0.01) g.update(Math.min(0.01, seconds - t));
}
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} ≠ ${b}`);

for (const arena of [2, 6])
  test(`第${arena + 1}关狼王两段连扑各自蓄力减半，暂停续局不丢第二扑`, () => {
    const { g, e } = encounter(2, 4, arena);
    g.castBossSkill(e, 1, 0);
    assert.equal(e.chargeFollowup, true);
    near(e.charge, 1.125);
    advance(g, 0.4);
    near(e.x, -180);
    g.pause();
    const raw = JSON.parse(JSON.stringify(g.snapshot()));
    for (const h of [Game.restore(g.save, raw), importSave(exportSave(g.save, g)).run]) {
      assert.ok(h);
      assert.equal(h.boss!.chargeFollowup, true);
      near(h.boss!.charge, e.charge);
      h.update(0.5);
      near(h.boss!.charge, e.charge);
    }
    g.resume();
    g.player.y = 160;
    for (let i = 0; i < 120 && e.chargeFollowup; i++) g.update(0.01);
    assert.equal(e.chargeFollowup, false);
    assert.ok(e.charge > 0.7);
    const direction = { x: g.player.x - e.x, y: g.player.y - e.y };
    const d = Math.hypot(direction.x, direction.y);
    near(e.dx, direction.x / d);
    near(e.dy, direction.y / d);
    const x = e.x,
      y = e.y;
    advance(g, 0.4);
    near(e.x, x);
    near(e.y, y);
    e.cooldown = 99999;
    advance(g, 0.8);
    assert.equal(e.charge, 0);
    assert.equal(e.chargeFollowup, false);
    const end = { x: e.x, y: e.y };
    advance(g, 0.15);
    near(e.x, end.x);
    near(e.y, end.y);
    assert.ok(g.zones.every((z) => z.endX === undefined));
  });

for (const arena of [4, 6])
  test(`第${arena + 1}关冥主保留瞬移留三具假影，实际击碎无收获，主人倒下即散`, () => {
    const { g, e } = encounter(4, 4, arena);
    const before = { x: e.x, y: e.y };
    g.castBossSkill(e, 1, 0);
    near(e.x, before.x);
    near(e.y, before.y + 150);
    const shadows = g.enemies.filter((c) => c.illusionOf === e.id);
    assert.equal(shadows.length, 3);
    assert.ok(shadows.every((c) => c.radius === e.radius));
    assert.deepEqual(
      shadows.map((c) => [c.hp, c.damage, c.speed, c.cooldown]),
      Array(3).fill([1, 0, 0, 3]),
    );
    const totals = [g.kills, g.xp, g.combatCultivation, g.iron, g.pickups.length];
    g.hitEnemy(shadows[0], 1, false, 'sword');
    assert.equal(shadows[0].dead, true);
    assert.deepEqual([g.kills, g.xp, g.combatCultivation, g.iron, g.pickups.length], totals);
    g.pause();
    const h = importSave(exportSave(g.save, g)).run;
    assert.ok(h);
    assert.equal(h.enemies.filter((c) => c.illusionOf === e.id && !c.dead).length, 2);
    g.resume();
    g.hitEnemy(e, e.hp, false, 'sword');
    assert.ok(shadows.every((c) => c.dead));
    assert.ok(g.zones.every((z) => z.endX === undefined));
  });

test('原生远距十二秒追云与终关六秒追云保留独立参数，冥主瞬移不变，均无条带', () => {
  for (const origin of [3, 4])
    for (const arena of [origin, 6]) {
      const { g, e } = encounter(origin, arena === 6 ? (origin === 3 ? 4 : 5) : 0, arena);
      if (arena === 6) g.castBossSkill(e, 1, 0);
      else {
        e.x = -500;
        e.pursuitCooldown = 0;
        g.update(0.01);
      }
      assert.equal(e.charge, 0);
      if (origin === 3) {
        const z = g.zones[0];
        assert.ok(z);
        assert.equal(z.life, arena === 3 ? 12 : 6);
        assert.equal(z.radius, 58);
        assert.equal(z.vx, arena === 3 ? 96 : 32);
        assert.equal(z.vy, 0);
        assert.ok(z.delay >= 1.18);
        assert.equal(z.damage, e.damage * 0.8);
      } else {
        near(e.x, g.player.x - 260);
        near(e.y, g.player.y);
        assert.equal(g.enemies.length, 1);
      }
      assert.ok(g.zones.every((z) => z.endX === undefined));
      g.pause();
      assert.ok(Game.restore(g.save, g.snapshot()));
    }
});

test('七王旧圆阵与所有保留非条带技能均进入实际招式轮换，不把恢复名额给条带', () => {
  for (let origin = 0; origin < 7; origin++)
    for (const arena of new Set([origin, 6])) {
      const skills = bossSkills(origin, arena === 6);
      assert.deepEqual(skills.slice(0, STAGES[origin].skills.length), STAGES[origin].skills);
      for (let phase = 0; phase < skills.length; phase++) {
        const { g, e } = encounter(origin, phase, arena);
        g.castBossSkill(e, 1, 0);
        assert.ok(g.notice.includes(skills[phase]));
        assert.ok(g.zones.every((z) => z.endX === undefined && z.endY === undefined));
      }
    }
  assert.ok(bossSkills(2, true).includes('踏雪连袭'));
  assert.ok(bossSkills(4, true).includes('幽影换形'));
  assert.ok(bossSkills(3, true).includes('游瘴驱逐'));
  assert.ok(bossSkills(4, true).includes('幽影追踪'));
});

test('所有妖王现有冷却再缩短30%，保留半血加速与完整蓄势', () => {
  for (let origin = 0; origin < 7; origin++)
    for (const final of [false, true])
      for (const half of [false, true]) {
        if (origin === 6 && !final) continue;
        const old = final
          ? origin === 6
            ? half
              ? 1.1
              : 1.8
            : half
              ? 1.5
              : 2.2
          : half
            ? 1.85
            : 3;
        near(
          bossSkillCooldown(origin, final, half),
          Math.round(Math.round(old * 0.85 * (half ? 0.85 : 1) * 1000) * 0.7) / 1000,
        );
        const { g, e } = encounter(origin, 1, final ? 6 : origin);
        if (half) e.hp = e.maxHp * 0.4;
        g.castBossSkill(e, 1, 0);
        near(e.cooldown, bossSkillCooldown(origin, final, half));
      }
  near(bossPursuitCooldown(false), 5.355);
  near(bossPursuitCooldown(true), 3.287);
});

test('第二境妖王气血再加20%，第三至六境再加10%，首境终关与伤害保持', () => {
  const hp = [1.15, 2.145 * 1.2 * 1.2, 2.2 * 1.2 * 1.1, 2.4 * 1.2 * 1.1, 2.4 * 1.1, 2.4 * 1.1];
  BOSS_COMBAT.hp.forEach((n, i) => near(n, hp[i]));
  assert.equal(BOSS_COMBAT.trialHp, 1.1);
  assert.equal(BOSS_COMBAT.trialDamage, 1.08);
  assert.deepEqual(BOSS_COMBAT.damage, [1.1, 1.15, 1.15, 1.15, 1.18, 1.18]);
});
