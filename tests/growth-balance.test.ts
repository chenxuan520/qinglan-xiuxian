import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { freshSave, realmCost, parseSave } from '../src/progress.ts';
import { SPIRIT_ROOTS, STAGES, type CultivationPath } from '../src/data.ts';
import { spiritPower } from '../src/spirit-power.ts';

const cultivationAt = (step: number) =>
  Array.from({ length: step }, (_, i) => realmCost(i)).reduce((a, b) => a + b, 0);

function fixture(step: number, path: CultivationPath = 'dual') {
  const save = freshSave();
  save.path = path;
  save.cultivation = cultivationAt(step);
  if (step === 24) save.completed = [6];
  return save;
}

test('后期大境界在相同根基下仍有显著伤害与气血提升，小境界平稳增长', () => {
  for (const step of [12, 15, 18, 21]) {
    const before = new Game(fixture(step - 1), 0, 0);
    const after = new Game(fixture(step), 0, 0);
    assert.ok(after.stats.damage / before.stats.damage >= 1.2, `境界 ${step} 伤害`);
    assert.ok(after.player.maxHp / before.player.maxHp >= 1.2, `境界 ${step} 气血`);
    const minor = new Game(fixture(step + 1), 0, 0);
    assert.ok(minor.stats.damage > after.stats.damage);
    assert.ok(minor.stats.damage / after.stats.damage < 1.03);
  }
});

test('真仙在所有灵根、路线和功法根基下均独立翻倍，待渡劫不提前获得', () => {
  for (const root of SPIRIT_ROOTS)
    for (const path of ['orthodox', 'demonic', 'dual'] as const) {
      const save = fixture(24, path);
      save.spiritRoot = root.id;
      save.completed = [];
      save.training.power = 20;
      save.tribulations = 3;
      save.retreatBonus.power = 17;
      const before = new Game(save, 0, 0);
      before.passives = { power: 5, blood: 5, spirit: 4, forbidden: 3 };
      const after = new Game({ ...save, completed: [6] }, 0, 0);
      after.passives = { ...before.passives };
      assert.equal(before.realm, 23);
      assert.equal(after.stats.damage, before.stats.damage * 2);
      const late = new Game({ ...save, cultivation: cultivationAt(23) }, 0, 0);
      late.passives = { ...before.passives };
      assert.equal(before.stats.damage, late.stats.damage);
    }
});

function swordDamage(step: number, forge: number) {
  const save = fixture(step);
  save.forge.sword = forge;
  const g = new Game(save, 0, 0, () => 0.99);
  const enemy = g.spawnEnemy(0, false, false, { x: 100, y: 0 });
  enemy.hp = enemy.maxHp = 1e8;
  enemy.speed = enemy.damage = 0;
  for (let i = 0; i < 10; i++) g.update(0.05);
  assert.ok(g.damageDealt > 0);
  return g.damageDealt;
}

test('炼器前五阶保留，高阶实际命中收益递增，十阶为未炼器的2.5倍', () => {
  const base = swordDamage(0, 0);
  const expected = [1, 1.08, 1.16, 1.24, 1.32, 1.4, 1.52, 1.68, 1.88, 2.14, 2.5];
  for (let level = 0; level <= 10; level++)
    assert.ok(Math.abs(swordDamage(0, level) / base - expected[level]) < 1e-8);
  assert.ok(swordDamage(0, 10) / swordDamage(0, 9) > 1.16);
  assert.ok(Math.abs(swordDamage(24, 10) / swordDamage(23, 10) - 2) < 1e-8);
});

test('旧档炼器等级保留，灵威使用相同炼器收益且不修改存档', () => {
  const save = fixture(21);
  save.forge.sword = 10;
  const restored = parseSave(JSON.stringify(save));
  const snapshot = JSON.stringify(restored);
  const score = spiritPower(restored).score;
  const noForge = spiritPower({ ...restored, forge: {} }).score;
  assert.ok(Math.abs(score / noForge - Math.sqrt(2.5)) < 0.002);
  assert.equal(JSON.stringify(restored), snapshot);
  assert.equal(restored.forge.sword, 10);
});

test('秘境妖物强度只随关卡和时间变化，玩家提升不会触发动态追涨', () => {
  for (let stage = 0; stage < STAGES.length; stage++) {
    const early = new Game(fixture(0), stage, 0, () => 0.5);
    const immortal = new Game(fixture(24), stage, 0, () => 0.5);
    early.time = immortal.time = STAGES[stage].minutes * 60;
    for (const [elite, boss] of [
      [false, false],
      [true, false],
      [false, true],
    ]) {
      const a = early.spawnEnemy(0, elite, boss, { x: 100, y: 0 }, stage);
      const b = immortal.spawnEnemy(0, elite, boss, { x: 100, y: 0 }, stage);
      assert.deepEqual([a.hp, a.damage, a.speed], [b.hp, b.damage, b.speed]);
    }
  }
});
