import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { freshSave } from '../src/progress.ts';
import { grantCurio } from '../src/curio-data.ts';

test('属性求值不跨调用缓存，半血临界点与减速结束即时生效', () => {
  const game = new Game(freshSave(), 0, 0, () => 0.5);
  game.passives.frenzy = 3;
  const full = game.stats;
  game.player.hp = game.player.maxHp / 2;
  assert.equal(game.stats.speed, full.speed);
  assert.equal(game.stats.cooldown, full.cooldown);
  game.player.hp -= 1e-8;
  assert.equal(game.stats.speed, full.speed * (1 + 3 * 0.04));
  assert.equal(game.stats.cooldown, 1 - 3 * 0.1);
  const fast = game.stats.speed;
  game.slowed = 2;
  assert.equal(game.stats.speed, fast * 0.75);
  game.slowed = 0;
  assert.equal(game.stats.speed, fast);
  game.player.hp = game.player.maxHp;
  assert.deepEqual(game.stats, full);
});

test('功法、训练与奇物持有变化在下一次属性读取生效，售出恢复原值', () => {
  const game = new Game(freshSave(), 0, 0, () => 0.5);
  game.save.training = { power: 10, vitality: 0, speed: 10 };
  const base = game.stats;
  game.passives = { spirit: 3, magnet: 2, duration: 4, devour: 2, crit: 1 };
  const passive = game.stats;
  for (const key of [
    'damage',
    'magnet',
    'regen',
    'duration',
    'crit',
    'speed',
    'xp',
    'killHeal',
  ] as const)
    assert.ok(passive[key] > base[key], key);
  grantCurio(game.save, 'soul-wood');
  assert.ok(game.stats.damage > passive.damage);
  assert.ok(game.stats.speed > passive.speed);
  delete game.save.curios.bag['soul-wood'];
  assert.deepEqual(game.stats, passive);
  game.passives = {};
  assert.deepEqual(game.stats, base);
  game.save.training.power++;
  assert.ok(game.stats.damage > base.damage);
});

test('每次属性结果独立，外部修改返回对象不会污染后续战斗属性', () => {
  const game = new Game(freshSave(), 0, 0, () => 0.5);
  const before = game.stats;
  const modified = game.stats;
  modified.damage = 999;
  modified.speed = 1;
  assert.deepEqual(game.stats, before);
  assert.notEqual(game.stats, before);
});
