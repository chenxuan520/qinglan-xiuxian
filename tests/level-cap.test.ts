import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { xpNeeded } from '../src/data.ts';
import { freshSave } from '../src/progress.ts';

test('前六十级保持原经验曲线，后期所需经验持续加速增长', () => {
  const original = (level: number) => Math.round(12 + level * 6 + level ** 1.45 * 2);
  for (const level of [1, 30, 60]) assert.equal(xpNeeded(level), original(level));
  assert.ok(xpNeeded(80) > original(80) * 3);
  assert.ok(xpNeeded(99) > original(99) * 9);
  assert.ok(xpNeeded(99) - xpNeeded(89) > xpNeeded(80) - xpNeeded(70));
});

test('第一百级只领取最后一次机缘，溢出经验与拾取不再反复回血', () => {
  const g = new Game(freshSave(), 6, 0, () => 0.5);
  g.weapons = [];
  g.level = 99;
  g.xp = 1e9;
  g.player.hp = 10;
  g.makeChoices = () => [{ type: 'heal', id: 'heal', level: 1 }];
  g.update(0.01);
  assert.equal(g.level, 100);
  const hp = g.player.hp;
  assert.ok(hp > 10);
  for (let i = 0; i < 100; i++) {
    g.pickups.push({ x: g.player.x, y: g.player.y, kind: 'xp', value: 1e6, pull: true });
    g.update(0.01);
  }
  assert.equal(g.level, 100);
  assert.ok(Math.abs(g.player.hp - hp - g.stats.regen) < 1e-6);
  assert.equal(g.xp, 0);
  assert.equal(g.iron, 1);
  assert.equal(g.state, 'playing');
  assert.ok(Object.hasOwn(g.save.chronicle.milestones, 'level-100'));
});

test('最终首领直接结算经验也不能超过一百级，满级仍获永久击杀修为', () => {
  const save = freshSave();
  const g = new Game(save, 6, 0, () => 0.5);
  g.level = 99;
  g.xp = 1e9;
  g.trialBossesDefeated = 6;
  const boss = g.spawnEnemy(10, false, true, undefined, 6);
  g.hitEnemy(boss, boss.maxHp);
  assert.equal(g.state, 'won');
  assert.equal(g.level, 100);
  assert.equal(g.xp, 0);
  assert.ok(save.cultivation > 0);
});

test('超过上限的旧续局收敛到一百级，取消旧回血选项但保留存档收益', () => {
  const save = freshSave();
  save.unlocked = 6;
  const g = new Game(save, 6, 0);
  const snapshot = g.snapshot();
  snapshot.level = 200;
  snapshot.xp = 1e6;
  snapshot.state = 'upgrade';
  snapshot.choices = [{ type: 'heal', id: 'heal', level: 1 }];
  save.cultivation = 50000;
  const restored = Game.restore(save, snapshot)!;
  assert.ok(restored);
  assert.equal(restored.level, 100);
  assert.equal(restored.xp, 0);
  assert.equal(restored.state, 'paused');
  assert.deepEqual(restored.choices, []);
  assert.equal(restored.iron, snapshot.iron);
  assert.ok(save.cultivation >= 50000);
  assert.ok(Object.hasOwn(save.chronicle.milestones, 'level-100'));
});
