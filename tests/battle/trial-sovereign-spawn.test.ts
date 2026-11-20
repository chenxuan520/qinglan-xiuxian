import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../src/battle/game.ts';
import { freshSave } from '../../src/core/progress.ts';
import {
  DIFFICULTIES,
  FINAL_TRIAL_STAGE,
  TRIAL_BOSS_STAGES,
  TRIAL_PRESSURE_SECONDS,
} from '../../src/core/data.ts';

function trial() {
  const save = freshSave();
  save.cultivation = 1e9;
  save.unlocked = FINAL_TRIAL_STAGE;
  save.lifespanBonus = 1e6;
  const g = new Game(save, FINAL_TRIAL_STAGE, 0, () => 0.5);
  g.weapons[0].timer = 1e9;
  g.player.invincible = 1e9;
  g.enemies = [];
  g.nextElite = 1e9;
  g.nextTrialBossAt = 1e9;
  return g;
}

test('仙尊未登场时终关自然刷怪预算与公式不变', () => {
  const g = trial();
  g.trialBossesSpawned = TRIAL_BOSS_STAGES.length - 1;
  g.time = 90;
  g.spawnBudget = 0;
  let expected = 0;
  for (let i = 0; i < 20; i++) {
    g.update(0.05);
    expected += 0.05 * (1 + 8 * (g.time / TRIAL_PRESSURE_SECONDS) ** 1.3) * DIFFICULTIES[0].amount;
  }
  assert.ok(g.enemies.length > 0);
  assert.ok(Math.abs(g.spawnBudget + g.enemies.length - expected) < 1e-6);
});

test('仙尊登场后终关不再自然刷新小怪，场上已有小怪保留', () => {
  const g = trial();
  g.trialBossesSpawned = TRIAL_BOSS_STAGES.length;
  g.trialBossesDefeated = TRIAL_BOSS_STAGES.length - 1;
  g.time = 330;
  g.spawnBudget = 0.7;
  g.spawnEnemy(65, false, false, { x: 100, y: 0 });
  const before = g.enemies.length;
  for (let i = 0; i < 1200; i++) g.update(0.05);
  assert.equal(g.spawnBudget, 0);
  assert.equal(g.enemies.length, before);
  assert.equal(g.enemies.filter((enemy) => !enemy.summonedBy).length, before);
});

test('仙尊登场后旧王、仙尊与招怪小兵的召唤仍照常生成敌人', () => {
  const g = trial();
  g.trialBossesSpawned = TRIAL_BOSS_STAGES.length;
  g.trialBossesDefeated = TRIAL_BOSS_STAGES.length - 1;
  g.time = 330;
  const oldKing = g.spawnEnemy(10, false, true, { x: -200, y: 0 }, 0);
  oldKing.skillStep = 2;
  oldKing.cooldown = 1e9;
  const beforeOld = g.enemies.length;
  g['castBossSkill'](oldKing, 1, 0);
  assert.equal(g.enemies.length, beforeOld + 3);
  const sovereign = g.spawnEnemy(10, false, true, { x: 200, y: 0 }, FINAL_TRIAL_STAGE);
  sovereign.skillStep = 4;
  sovereign.cooldown = 1e9;
  const beforeSovereign = g.enemies.length;
  g['castBossSkill'](sovereign, 1, 0);
  assert.equal(g.enemies.length, beforeSovereign + 6);
  const summoner = g.spawnEnemy(27, false, false, { x: 0, y: 200 });
  summoner.cooldown = 0;
  const beforeSummoner = g.enemies.length;
  g.update(0.05);
  assert.equal(g.enemies.length, beforeSummoner + 2);
});

test('仙尊已登场的续局恢复后仍不自然刷怪', () => {
  const g = trial();
  g.trialBossesSpawned = TRIAL_BOSS_STAGES.length;
  g.trialBossesDefeated = TRIAL_BOSS_STAGES.length - 1;
  g.time = 400;
  g.spawnBudget = 0.4;
  const raw = JSON.parse(JSON.stringify(g.snapshot()));
  const restored = Game.restore(g.save, raw)!;
  assert.ok(restored);
  restored.resume();
  restored.weapons[0].timer = 1e9;
  restored.player.invincible = 1e9;
  assert.equal(restored.state, 'playing');
  assert.equal(restored.sovereignArrived, true);
  for (let i = 0; i < 1200; i++) restored.update(0.05);
  assert.equal(restored.spawnBudget, 0);
  assert.equal(restored.enemies.length, 0);
});
