import test from 'node:test';
import assert from 'node:assert/strict';
import { autoplayInput } from '../../src/battle/autoplay.ts';
import { BOSS_MECHANICS as R } from '../../src/battle/boss-mechanics.ts';
import { Game } from '../../src/battle/game.ts';
import { freshSave } from '../../src/core/progress.ts';
import { bossSkills } from '../../src/battle/boss-skills.ts';

function trial(enraged = false, distance = 700) {
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
  g.player.hp = g.player.maxHp = 1e9;
  g.player.invincible = 0;
  const e = g.spawnEnemy(10, false, true, { x: distance, y: 0 }, 6);
  e.speed = 0;
  e.cooldown = e.pursuitCooldown = 99999;
  if (enraged) e.hp = e.maxHp * 0.499;
  e.skillStep = 9;
  e.bossSkillQueue = bossSkills(6, true)
    .map((_, i) => i)
    .filter((i) => i !== 9);
  g.castBossSkill(e, 1, 0);
  e.cooldown = e.pursuitCooldown = 99999;
  return { g, e };
}
function advance(g: Game, frames: number) {
  let hits = 0;
  g.onEvent = (event) => {
    if (event === 'hurt') hits++;
  };
  for (let frame = 0; frame < frames; frame++) {
    assert.equal(g.state, 'playing');
    if (frame % 4 === 0) g.input = autoplayInput(g);
    g.update(1 / 30);
  }
  return hits;
}
const sideDistance = (g: Game) => {
  const shot = g.shots.find((b) => b.bossMotion?.kind === 'sword');
  if (!shot || shot.bossMotion?.kind !== 'sword') return Infinity;
  const motion = shot.bossMotion;
  const rx = g.player.x - shot.origin.x,
    ry = g.player.y - shot.origin.y;
  return Math.abs(rx * motion.direction.y - ry * motion.direction.x);
};

for (const enraged of [false, true])
  test(`AI 从预警起避开${enraged ? '半血后' : '常态'}诛仙一剑，真实推进不受伤`, () => {
    const { g } = trial(enraged, 700);
    const input = autoplayInput(g);
    assert.ok(Math.abs(input.y) > 0.2, '应沿垂直剑路方向离开');
    g.input = input;
    for (let frame = 0; frame < 20; frame++) g.update(1 / 30);
    const shot = g.shots.find((b) => b.bossMotion?.kind === 'sword')!;
    const reach = shot.radius + 12 + g.stats.speed * 0.12;
    assert.ok(sideDistance(g) >= reach, `距剑路 ${sideDistance(g)} < ${reach}`);
    assert.equal(advance(g, 90), 0);
  });

test('修士已在剑路侧向 60 像素外时，走位与没有诛仙一剑时逐字一致', () => {
  for (const age of [0, 1]) {
    const { g } = trial(false, 700);
    if (age > 0) g.shots[g.shots.length - 1].age = age;
    g.player.y = 60;
    const withSword = autoplayInput(g);
    g.shots = [];
    const without = autoplayInput(g);
    assert.deepEqual(withSword, without);
  }
});

test('剑尖已飞过修士投影点后不再影响走位', () => {
  const { g } = trial(false, 700);
  const shot = g.shots.find((b) => b.bossMotion?.kind === 'sword')!;
  const motion = shot.bossMotion;
  if (motion?.kind !== 'sword') return assert.fail('缺少剑招');
  shot.age = motion.launchAt + (700 + 60) / R.swordSpeed;
  assert.ok(shot.life > 0);
  const withSword = autoplayInput(g);
  g.shots = [];
  assert.deepEqual(withSword, autoplayInput(g));
});
