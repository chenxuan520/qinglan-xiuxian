import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../src/battle/game.ts';
import { freshSave } from '../../src/core/progress.ts';
import { bossSkills } from '../../src/battle/boss-skills.ts';
import { BOSS_SKILL_TEXT } from '../../src/battle/boss-skill-text.ts';
import {
  BOSS_MECHANICS as R,
  SOVEREIGN_GOLD,
  bossShotPose,
  validBossMotion,
  type BossMotion,
} from '../../src/battle/boss-mechanics.ts';
import { grantCurio } from '../../src/items/curio-data.ts';

const near = (actual: number, expected: number, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

function encounter() {
  const save = freshSave('heaven', ['metal'], 'dual', () => 0.5);
  Object.assign(save, { unlocked: 6, completed: [0, 1, 2, 3, 4, 5], cultivation: 119940 });
  const g = new Game(save, 6, 0, () => 0.5);
  g.time = 400;
  g.trialBossesSpawned = 7;
  g.trialBossesDefeated = 6;
  g.nextTrialBossAt = g.nextElite = 99999;
  g.bossSpawned = true;
  g.spawnBudget = -10000;
  g.weapons[0].timer = 99999;
  const e = g.spawnEnemy(10, false, true, { x: -300, y: 0 }, 6);
  e.speed = 0;
  e.cooldown = e.pursuitCooldown = 99999;
  return { g, e };
}
function cast(c: ReturnType<typeof encounter>, phase = 9) {
  const { g, e } = c;
  e.skillStep = phase;
  e.bossSkillQueue = bossSkills(e.bossStage!, g.isFinalTrial)
    .map((_, i) => i)
    .filter((i) => i !== phase);
  g.castBossSkill(e, 1, 0);
  e.cooldown = e.pursuitCooldown = 99999;
  return g.shots.at(-1)!;
}
function advance(g: Game, seconds: number, step = 0.01) {
  for (let t = 0; t < seconds - 1e-9; t += step) g.update(Math.min(step, seconds - t));
}

test('仙尊招式表扩到十招，诛仙一剑在索引 9 且有说明', () => {
  assert.equal(bossSkills(6, true).length, 10);
  assert.equal(bossSkills(6, true)[9], '诛仙一剑');
  assert.match(BOSS_SKILL_TEXT['诛仙一剑'], /金线锁定修士方向，片刻后一剑疾飞，伤害极高/);
  for (const stage of [0, 1, 2, 3, 4, 5]) assert.ok(!bossSkills(stage, true).includes('诛仙一剑'));
});

test('仙尊半血以上预警 0.5 秒、半血后 0.3 秒，飞行 1200 像素每秒并按时消失', () => {
  const full = encounter();
  const shot = cast(full);
  assert.equal(shot.color, SOVEREIGN_GOLD);
  assert.equal(shot.bossMotion?.kind, 'sword');
  if (shot.bossMotion?.kind !== 'sword') return;
  near(shot.bossMotion.launchAt, R.swordWarmup);
  near(Math.hypot(shot.bossMotion.direction.x, shot.bossMotion.direction.y), 1);
  near(shot.life, R.swordWarmup + R.swordFlight);
  const waiting = bossShotPose(shot, 0.4);
  assert.equal(waiting.active, false);
  near(waiting.x, -300);
  near(waiting.y, 0);
  const flying = bossShotPose(shot, R.swordWarmup + 0.5);
  assert.equal(flying.active, true);
  near(flying.x, -300 + R.swordSpeed * 0.5);
  near(flying.vx, R.swordSpeed);
  const last = bossShotPose(shot, R.swordWarmup + R.swordFlight);
  near(last.x, -300 + R.swordSpeed * R.swordFlight);

  const enraged = encounter();
  enraged.e.hp = enraged.e.maxHp * 0.499;
  const fast = cast(enraged);
  if (fast.bossMotion?.kind !== 'sword') return assert.fail('缺少剑招运动');
  near(fast.bossMotion.launchAt, R.swordWarmupEnraged);
  near(fast.life, R.swordWarmupEnraged + R.swordFlight);
});

test('剑路命中一次并造成仙尊伤害 2.5 倍；偏出 25 像素不中', () => {
  const hit = encounter();
  hit.e.damage = 1000;
  hit.g.player.hp = hit.g.player.maxHp = 1e9;
  hit.g.player.invincible = 0;
  cast(hit);
  advance(hit.g, R.swordWarmup - 0.01);
  assert.equal(hit.g.player.hp, 1e9, '预警期间站在线上不掉血');
  advance(hit.g, 2);
  near(hit.g.player.hp, 1e9 - 1000 * R.swordDamage * hit.g.stats.armor);
  assert.equal(
    hit.g.shots.some((b) => b.bossMotion?.kind === 'sword'),
    false,
  );

  const miss = encounter();
  miss.e.damage = 1000;
  miss.g.player.hp = miss.g.player.maxHp = 1e9;
  miss.g.player.invincible = 0;
  cast(miss);
  miss.g.player.y = 25;
  advance(miss.g, 2);
  assert.equal(miss.g.player.hp, 1e9);
});

test('20 帧步长下用线段判定命中，不因逐帧跳跃穿过修士', () => {
  const c = encounter();
  c.g.player.hp = c.g.player.maxHp = 1e9;
  c.g.player.invincible = 0;
  cast(c);
  advance(c.g, R.swordWarmup);
  c.g.player.x = -300 + 30;
  c.g.player.y = 10;
  c.g.update(0.05);
  assert.ok(c.g.player.hp < 1e9, '线段经过修士时应命中');
});

test('命中后沿用仙尊弹幕的六种随机效果', () => {
  const c = encounter();
  c.g.player.hp = c.g.player.maxHp = 1e9;
  c.g.player.invincible = 0;
  c.g.random = () => 0.99;
  cast(c);
  advance(c.g, 0.9);
  assert.ok(c.g.immobilized > 0, '第六种效果应定身');
});

test('玄天伞不清除诛仙一剑，佛光仍可完全挡下', () => {
  const umbrella = encounter();
  umbrella.g.weapons = [{ id: 'umbrella', level: 1, evolved: false, timer: 99999 }];
  const blade = cast(umbrella);
  umbrella.g.cast(umbrella.g.weapons[0]);
  assert.ok(blade.life > 0);

  const shield = encounter();
  shield.g.player.hp = shield.g.player.maxHp = 1e9;
  shield.g.player.invincible = 0;
  shield.g.weapons = [{ id: 'beads', level: 1, evolved: false, timer: 99999 }];
  grantCurio(shield.g.save, 'sacred-fragment');
  assert.equal(shield.g.buddhaShieldReady, true);
  cast(shield);
  advance(shield.g, 2);
  assert.equal(shield.g.player.hp, 1e9);
  assert.equal(shield.g.buddhaShieldReady, false);
});

test('预警中与飞行中的剑可续局，非法剑招运动被拒绝', () => {
  for (const age of [0.2, 0.8]) {
    const c = encounter();
    cast(c);
    c.g.player.y = 1000;
    advance(c.g, age);
    const raw = JSON.parse(JSON.stringify(c.g.snapshot()));
    const restored = Game.restore(c.g.save, raw)!;
    assert.ok(restored);
    const shot = restored.shots.find((b) => b.bossMotion?.kind === 'sword')!;
    assert.ok(shot);
    assert.deepEqual(shot.bossMotion, c.g.shots.find((b) => b.bossMotion)!.bossMotion);
    near(shot.age, age, 1e-8);
    near(shot.life, R.swordWarmup + R.swordFlight - age, 1e-8);
  }
  const c = encounter();
  cast(c);
  const raw = JSON.parse(JSON.stringify(c.g.snapshot()));
  const shot = raw.shots.find((b: { bossMotion?: BossMotion }) => b.bossMotion)!;
  const motion = shot.bossMotion as Extract<BossMotion, { kind: 'sword' }>;
  assert.equal(validBossMotion(motion, 5), false);
  assert.equal(validBossMotion({ ...motion, direction: { x: 2, y: 0 } }, 6), false);
  assert.equal(validBossMotion({ ...motion, launchAt: 0.4 }, 6), false);
  shot.bossMotion.direction = { x: 2, y: 0 };
  assert.equal(Game.restore(c.g.save, raw), null);
});

test('旧存档九招队列仍可恢复并继续轮转', () => {
  const c = encounter();
  cast(c);
  const raw = JSON.parse(JSON.stringify(c.g.snapshot()));
  const boss = raw.enemies.find((e: { boss?: boolean }) => e.boss);
  boss.skillStep = 0;
  boss.bossSkillQueue = [1, 2, 3, 4, 5, 6, 7, 8];
  const restored = Game.restore(c.g.save, raw);
  assert.ok(restored);
  assert.deepEqual(
    [restored.boss!.skillStep, ...restored.boss!.bossSkillQueue!],
    [0, 1, 2, 3, 4, 5, 6, 7, 8],
  );
});
