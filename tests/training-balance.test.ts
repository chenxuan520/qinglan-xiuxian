import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { freshSave, realmCost, train, trainingCost, trainingYears } from '../src/progress.ts';
import { SPIRIT_ROOTS } from '../src/data.ts';
import { spiritPower } from '../src/spirit-power.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} ≠ ${b}`);
const cultivationAt = (step: number) =>
  Array.from({ length: step }, (_, i) => realmCost(i)).reduce((a, b) => a + b, 0);

test('悟道独立增伤，不被境界与功法稀释，灵根满阶差异适度且逐阶线性累加', () => {
  const full = [1.4, 1.36, 1.32, 1.32, 1.28, 1.28, 1.24];
  for (const [i, root] of SPIRIT_ROOTS.entries())
    for (const step of [0, 9, 18, 23, 24])
      for (const path of ['dual', 'orthodox', 'demonic'] as const) {
        const save = freshSave(root.id);
        save.path = path;
        save.cultivation = cultivationAt(step);
        if (step === 24) save.completed = [6];
        save.retreatBonus.power = 12;
        save.tribulations = 2;
        const game = new Game(save, 0, 0);
        game.passives = { power: 5, blood: 4, spirit: 3, forbidden: 2 };
        const base = game.stats.damage;
        const hp = game.player.maxHp;
        const speed = game.stats.speed;
        for (const level of [1, 10, 20]) {
          save.training.power = level;
          near(game.stats.damage / base, 1 + ((full[i] - 1) * level) / 20);
          assert.equal(game.player.maxHp, hp);
          assert.equal(game.stats.speed, speed);
        }
      }
});

test('悟道独立加成进入实际法宝伤害统计，觉醒与未觉醒均适用', () => {
  for (const evolved of [false, true]) {
    const hit = (power: number) => {
      const save = freshSave();
      save.cultivation = cultivationAt(23);
      save.training.power = power;
      const game = new Game(save, 6, 0, () => 0.99);
      game.weapons[0].evolved = evolved;
      const enemy = game.spawnEnemy(0, false, false, { x: 100, y: 0 });
      enemy.hp = enemy.maxHp = 1e9;
      enemy.speed = enemy.damage = 0;
      for (let frame = 0; frame < 10; frame++) game.update(0.05);
      assert.ok(game.damageBySource.sword > 0);
      return game.damageBySource.sword;
    };
    near(hit(20) / hit(0), 1.4);
  }
});

test('根基前十阶费用保留，后十阶递增但修满总价低于五万，寿元和满阶门禁保留', () => {
  for (let level = 0; level < 10; level++)
    assert.equal(trainingCost(level), Math.round(45 * 1.42 ** level));
  assert.equal(trainingCost(19), 9838);
  assert.equal(
    Array.from({ length: 20 }, (_, level) => trainingCost(level)).reduce((a, b) => a + b, 0),
    47373,
  );
  for (let level = 1; level < 20; level++) assert.ok(trainingCost(level) > trainingCost(level - 1));
  for (const root of SPIRIT_ROOTS) {
    const save = freshSave(root.id);
    save.stones = 9838;
    save.training.power = 19;
    const age = save.age;
    assert.equal(train(save, 'power'), true);
    assert.equal(save.training.power, 20);
    near(save.age - age, trainingYears(save));
    assert.equal(save.stones, 0);
    save.stones = 1e6;
    const full = JSON.stringify(save);
    assert.equal(train(save, 'power'), false);
    assert.equal(JSON.stringify(save), full);
    save.training.power = 19;
    save.age = 99.9;
    const old = JSON.stringify(save);
    assert.equal(train(save, 'power'), false);
    assert.equal(JSON.stringify(save), old);
  }
});

test('已有根基等级和受伤续局保留，灵威与战斗一致，重复导入不叠加加成或返还物资', () => {
  const save = freshSave('dual');
  save.cultivation = cultivationAt(23);
  save.unlocked = 6;
  save.completed = [0, 1, 2, 3, 4, 5];
  save.training = { vitality: 10, power: 19, speed: 8 };
  save.stones = 234;
  save.age = 81;
  const game = new Game(save, 6, 0);
  game.player.hp -= 77;
  game.pause();
  const imported = importSave(exportSave(save, game));
  const restored = imported.run!;
  assert.deepEqual(imported.save.training, save.training);
  assert.equal(imported.save.stones, 234);
  assert.equal(imported.save.age, 81);
  assert.equal(restored.player.maxHp - restored.player.hp, 77);
  near(restored.stats.damage, game.stats.damage);
  near(spiritPower(imported.save).damage, restored.stats.damage);
  const twice = importSave(exportSave(imported.save, restored));
  near(twice.run!.stats.damage, restored.stats.damage);
  assert.equal(twice.run!.player.hp, restored.player.hp);
  assert.equal(twice.save.stones, 234);
});
