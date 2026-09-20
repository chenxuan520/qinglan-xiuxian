import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { freshSave, realmCost, realmBonuses } from '../src/progress.ts';
import { joinSect } from '../src/mortal.ts';

const near = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
function learn(game: Game, id: string, level: number) {
  game.state = 'upgrade';
  game.choices = [{ type: 'passive', id, level }];
  assert.equal(game.choose(0), true);
}

test('白骨每重按整体基础气血加14%，与正道、劫印、闭关及金刚功法共同生效', () => {
  for (const step of [0, 9, 24]) {
    const save = freshSave();
    save.cultivation = Array.from({ length: step }, (_, i) => realmCost(i)).reduce(
      (a, b) => a + b,
      0,
    );
    if (step === 24) save.completed = [6];
    save.training.vitality = 10;
    save.tribulations = 2;
    save.retreatBonus.vitality = 7;
    const game = new Game(save, 0, 0, () => 0.9, 'orthodox');
    learn(game, 'guard', 2);
    game.player.hp -= 30;
    for (let level = 1; level <= 5; level++) {
      learn(game, 'bone', level);
      assert.equal(
        game.player.maxHp,
        Math.round((240 + realmBonuses(step).hp) * (1 + level * 0.14) * 1.12 * 1.06 * 1.07),
      );
      assert.equal(game.player.maxHp - game.player.hp, 30);
    }
  }
});

test('骨刺按最大气血12%每重反击并计入伤害统计，无敌期间与致命伤不触发', () => {
  const save = freshSave();
  save.cultivation = 1e9;
  save.completed = [6];
  save.stones = 1000;
  joinSect(save, 'bone');
  save.mortal.mastery.bone = 10;
  const game = new Game(save, 0, 0, () => 0.9);
  learn(game, 'bone', 3);
  const enemy = game.spawnEnemy(1, false, false, { x: 80, y: 0 });
  enemy.hp = enemy.maxHp = 1e8;
  const expected = game.player.maxHp * 0.12 * 3 * 1.3 * game.stats.damage;
  game.hurtPlayer(1);
  near(enemy.maxHp - enemy.hp, expected);
  near(game.damageBySource.bone, expected);
  game.hurtPlayer(1);
  near(game.damageBySource.bone, expected);
  game.player.invincible = 0;
  game.hurtPlayer(game.player.maxHp * 2);
  near(game.damageBySource.bone, expected);
});

test('固定气血白骨旧局迁移保留损失气血，重复续局不加血，死者不复活', () => {
  const save = freshSave();
  save.training.vitality = 30;
  const game = new Game(save, 0, 0);
  const old = game.snapshot();
  old.passives = { bone: 2 };
  old.player.maxHp = 428;
  old.player.hp = 391;
  const restored = Game.restore(save, old)!;
  assert.equal(restored.player.maxHp, 512);
  assert.equal(restored.player.hp, 475);
  assert.equal(Game.restore(save, restored.snapshot())!.player.hp, 475);
  old.state = 'lost';
  old.player.hp = 0;
  assert.equal(Game.restore(save, old)!.player.hp, 0);
});
