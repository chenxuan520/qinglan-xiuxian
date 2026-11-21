import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../src/battle/game.ts';
import { freshSave } from '../../src/core/progress.ts';
import { bossSkills } from '../../src/battle/boss-skills.ts';
import { BOSS_MECHANICS as R } from '../../src/battle/boss-mechanics.ts';

const near = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);

function trial(arena = 6) {
  const save = freshSave('heaven', ['metal'], 'dual', () => 0.5);
  Object.assign(save, { unlocked: 6, completed: [0, 1, 2, 3, 4, 5], cultivation: 119940 });
  const g = new Game(save, arena, 0, () => 0.5);
  g.time = 400;
  g.trialBossesSpawned = 7;
  g.trialBossesDefeated = 6;
  g.nextTrialBossAt = g.nextElite = 99999;
  g.bossSpawned = true;
  g.spawnBudget = -10000;
  g.weapons[0].timer = 99999;
  g.player.invincible = 99999;
  const e = g.spawnEnemy(10, false, true, { x: -300, y: 0 }, arena === 6 ? 6 : 0);
  e.speed = 0;
  e.cooldown = e.pursuitCooldown = 99999;
  return { g, e };
}
function cast(c: ReturnType<typeof trial>, phase: number, borrowed = 0) {
  const { g, e } = c;
  e.skillStep = phase;
  e.bossSkillQueue = bossSkills(e.bossStage!, g.isFinalTrial)
    .map((_, i) => i)
    .filter((i) => i !== phase);
  g.random = () => (borrowed + 0.5) / 6;
  g.castBossSkill(e, 1, 0);
  e.cooldown = e.pursuitCooldown = 99999;
}
const speeds = (g: Game) => g.shots.map((b) => Math.hypot(b.vx, b.vy));

test('终关仙尊 fan 与 ring 弹速为原值 1.2 倍', () => {
  assert.equal(R.sovereignShotSpeed, 1.2);
  const ring = trial();
  cast(ring, 0);
  assert.equal(ring.g.shots.length, 24);
  for (const speed of speeds(ring.g)) near(speed, 185 * R.sovereignShotSpeed);

  const fan = trial();
  cast(fan, 3);
  assert.equal(fan.g.shots.length, 11);
  for (const speed of speeds(fan.g)) near(speed, 230 * R.sovereignShotSpeed);

  const half = trial();
  half.e.hp = half.e.maxHp * 0.499;
  cast(half, 0);
  assert.equal(half.g.shots.length, 32);
  for (const speed of speeds(half.g)) near(speed, 185 * R.sovereignShotSpeed);
});

test('特殊轨迹招式不乘弹速倍率：借来的九尾回焰保持原速', () => {
  const c = trial();
  cast(c, 6, 1);
  assert.equal(c.g.shots.length, 9);
  for (const speed of speeds(c.g)) near(speed, R.nativeReturnSpeed);
});

test('终关其他旧王与独立天劫的同招弹速不变', () => {
  const old = trial(6);
  old.e.bossStage = 0;
  cast(old, 1);
  for (const speed of speeds(old.g)) near(speed, 170);

  const save = freshSave('heaven', ['metal'], 'dual', () => 0.5);
  Object.assign(save, { unlocked: 6, completed: [0, 1, 2, 3, 4, 5], cultivation: 119940 });
  save.age = save.nextTribulationAge = 20000;
  const tribulation = Game.createTribulation(save, null)!;
  tribulation.weapons[0].timer = 99999;
  tribulation.player.invincible = 99999;
  const boss = tribulation.spawnEnemy(10, false, true, { x: -300, y: 0 }, 6);
  boss.speed = 0;
  boss.cooldown = boss.pursuitCooldown = 99999;
  boss.skillStep = 0;
  boss.bossSkillQueue = bossSkills(6, false)
    .map((_, i) => i)
    .filter((i) => i !== 0);
  tribulation.castBossSkill(boss, 1, 0);
  assert.equal(tribulation.shots.length, 24);
  for (const speed of speeds(tribulation)) near(speed, 185);
});
