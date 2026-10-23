import assert from 'node:assert/strict';
import test from 'node:test';
import { TREASURES, evolutionPassives } from '../src/data.ts';
import { Game } from '../src/game.ts';
import { freshSave } from '../src/progress.ts';
import { TreasureTrial, type TrialForm, type TrialFormation } from '../src/treasure-trial.ts';

const forms: TrialForm[] = ['one', 'six', 'evolved'];
const formations: TrialFormation[] = ['scattered', 'surround', 'single'];

function advance(trial: TreasureTrial, seconds: number, moving = false) {
  for (let frame = 0; frame < seconds * 20; frame++) {
    const time = frame / 20;
    trial.update(
      0.05,
      moving ? { x: Math.cos(time * 0.7), y: Math.sin(time * 0.7) } : { x: 0, y: 0 },
    );
  }
}

test('所有法宝的三种试演形态使用真实等级、配套功法与伤害公式', () => {
  for (const item of TREASURES) {
    for (const form of forms) {
      const trial = new TreasureTrial(item.id, form);
      const g = trial.game;
      assert.ok(g instanceof Game);
      assert.equal(g.weapons.length, 1);
      assert.equal(g.weapons[0].id, item.id);
      assert.equal(g.weapons[0].level, form === 'one' ? 1 : 6);
      assert.equal(g.weapons[0].evolved, form === 'evolved');
      assert.equal(g.level, form === 'one' ? 1 : form === 'six' ? 6 : 12);
      const recipe = evolutionPassives(item, item.school)[0];
      assert.deepEqual(g.passives, form === 'evolved' ? { [recipe]: 5 } : {});
      assert.equal(g.save.spiritRoot, 'none');
      assert.equal(g.save.path, 'dual');
      assert.deepEqual(g.save.forge, {});
      assert.deepEqual(g.save.training, { vitality: 0, power: 0, speed: 0 });
      const reference = new Game(structuredClone(g.save), 0, 0, () => 0.5);
      reference.weapons = g.weapons.map((weapon) => ({ ...weapon }));
      reference.passives = { ...g.passives };
      assert.equal(
        g.weaponHitDamage(g.weapons[0]),
        reference.weaponHitDamage(reference.weapons[0]),
      );
    }
  }
});

test('所有法宝三种形态在三种敌阵中真实施法，走位可命中且不升级、不产资源', () => {
  for (const item of TREASURES) {
    for (const form of forms) {
      for (const formation of formations) {
        const trial = new TreasureTrial(item.id, form, formation);
        advance(trial, 16, true);
        // Lingering ground fields also need time near a target after walking;
        // a continuously circling player can leave every field behind them.
        for (let frame = 0; frame < 160; frame++) {
          const target = trial.game.enemies[0];
          const p = trial.game.player;
          const dx = target ? target.x - p.x : 0;
          const dy = target ? target.y - p.y : 0;
          const length = Math.hypot(dx, dy);
          trial.update(0.05, length > 70 ? { x: dx / length, y: dy / length } : { x: 0, y: 0 });
        }
        const g = trial.game;
        assert.ok(g.weapons[0].timer > 0, `${item.id}/${form}/${formation} 未施法`);
        assert.ok(g.damageBySource[item.id] > 0, `${item.id}/${form}/${formation} 法宝未命中`);
        assert.equal(g.state, 'playing');
        assert.equal(g.level, form === 'one' ? 1 : form === 'six' ? 6 : 12);
        assert.equal(g.xp, 0);
        assert.deepEqual(g.pickups, []);
        assert.deepEqual(g.choices, []);
        assert.deepEqual(g.loot, { artifacts: [], medicines: {}, curios: {}, complete: true });
        assert.equal(g.save.cultivation, 0);
        assert.equal(g.save.stones, 0);
        assert.equal(g.save.iron, 0);
        assert.equal(g.save.runs, 0);
        assert.equal(g.save.age, 15);
        assert.equal(g.elapsedYears, 0);
        assert.equal(g.combatCultivation, 0);
        assert.equal(g.creditedCultivation, 0);
        assert.equal(g.bossCultivation, 0);
      }
    }
  }
});

test('敌阵会补入相同目标，长期试演不混入关卡刷怪、妖王奖励或寿尽', () => {
  for (const formation of formations) {
    const trial = new TreasureTrial('sword', 'six', formation);
    const count = formation === 'single' ? 1 : formation === 'surround' ? 12 : 8;
    assert.equal(trial.game.enemies.length, count);
    const target = trial.game.enemies[0];
    const hp = target.maxHp;
    trial.game.hitEnemy(target, hp + 100, false, 'sword');
    assert.equal(trial.game.kills, 1);
    assert.equal(trial.game.state, 'playing');
    advance(trial, 1);
    assert.ok(!trial.game.enemies.includes(target));
    assert.ok(trial.game.enemies.some((enemy) => enemy.type === target.type && enemy.maxHp === hp));
    advance(trial, 310);
    assert.equal(trial.game.state, 'playing');
    assert.ok(trial.game.enemies.length <= count);
    assert.equal(trial.game.nextElite, Number.MAX_SAFE_INTEGER);
    assert.equal(trial.game.save.age, 15);
    assert.deepEqual(trial.game.save.completed, []);
    assert.deepEqual(trial.game.pickups, []);
    assert.equal(trial.game.save.cultivation, 0);
  }
});

test('试演受击保留护体间隔和白骨反击，致命攻击回满后继续', () => {
  const trial = new TreasureTrial('skull', 'evolved', 'surround');
  const g = trial.game;
  const before = g.damageDealt;
  const hp = g.player.hp;
  g.hurtPlayer(5);
  assert.ok(g.player.hp < hp);
  assert.ok(g.damageDealt > before);
  assert.ok(g.player.invincible > 0);
  const after = g.player.hp;
  g.hurtPlayer(5);
  assert.equal(g.player.hp, after);
  g.player.invincible = 0;
  g.hurtPlayer(1e6);
  assert.equal(g.player.hp, g.player.maxHp);
  trial.update(0.05);
  assert.equal(g.state, 'playing');
  assert.equal(g.revivesUsed, 0);
});

test('真实走位、暂停、重置和切换形态不串入真实角色或其他试演', () => {
  const realSave = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  const realGame = new Game(realSave, 0, 0, () => 0.5);
  const original = structuredClone(realSave);
  const originalRun = realGame.snapshot();
  const trial = new TreasureTrial('sword');
  const oldGame = trial.game;
  trial.resize(320, 640);
  trial.update(0.05, { x: 1, y: 0 });
  assert.ok(trial.game.player.x > 0);
  assert.equal(trial.game.player.y, 0);
  trial.game.pause();
  const time = trial.game.time;
  trial.update(0.05);
  assert.equal(trial.game.time, time);
  trial.reset('evolved', 'single');
  assert.notEqual(trial.game, oldGame);
  assert.equal(trial.game.state, 'playing');
  assert.equal(trial.game.player.x, 0);
  assert.equal(trial.game.damageDealt, 0);
  assert.equal(trial.game.kills, 0);
  assert.deepEqual(trial.game.viewport, { width: 320, height: 640 });
  advance(trial, 10);
  const otherTrial = new TreasureTrial('orbit', 'one', 'surround');
  assert.notEqual(otherTrial.game.save, trial.game.save);
  assert.equal(otherTrial.game.damageDealt, 0);
  assert.deepEqual(realSave, original);
  assert.deepEqual(realGame.snapshot(), originalRun);
});

test('窄屏与横屏敌阵完整容纳精灵，旋转只重排位置并保留血量与试演状态', () => {
  const viewports = [
    { width: 1440, height: 680 },
    { width: 390 / 0.76, height: 460 / 0.76 },
    { width: 320 / 0.76, height: 300 / 0.76 },
    { width: 844 / 0.76, height: 120 / 0.76 },
  ];
  for (const formation of formations) {
    const trial = new TreasureTrial('sword', 'six', formation);
    const game = trial.game;
    const enemies = [...game.enemies];
    game.player.x = 30;
    game.player.y = -20;
    game.time = 7;
    game.enemies[0].hp -= 5;
    const health = enemies.map((enemy) => enemy.hp);
    for (const viewport of viewports) {
      trial.resize(viewport.width, viewport.height);
      assert.equal(trial.game, game);
      assert.equal(game.time, 7);
      assert.deepEqual(game.enemies, enemies);
      assert.deepEqual(
        game.enemies.map((enemy) => enemy.hp),
        health,
      );
      for (const enemy of game.enemies) {
        const x = enemy.x - game.player.x;
        const y = enemy.y - game.player.y;
        // The single boss's sprite extends 74.4 to either side, 114 above and
        // 35 below its feet; its damaged health bar sits 120 above the feet.
        const halfWidth = formation === 'single' ? 74.4 : 23.25;
        const above = formation === 'single' ? 120 : 48;
        const below = formation === 'single' ? 35 : 15;
        assert.ok(Math.abs(x) + halfWidth <= viewport.width / 2);
        assert.ok(y - above >= -viewport.height / 2);
        assert.ok(y + below <= viewport.height / 2);
      }
    }
    trial.reset();
    // Renderer overwrites Game.viewport with the full canvas. New targets must
    // still use the smaller, unobscured trial area supplied by the UI.
    trial.game.viewport = { width: 1440, height: 900 };
    const target = trial.game.enemies[0];
    trial.game.hitEnemy(target, target.hp + 1, false, 'sword');
    advance(trial, 1);
    for (const enemy of trial.game.enemies)
      assert.ok(Math.abs(enemy.y - trial.game.player.y) <= viewports.at(-1)!.height / 2);
  }
  const spread = new TreasureTrial('sword', 'one', 'scattered');
  const near = new TreasureTrial('sword', 'one', 'surround');
  spread.resize(320 / 0.76, 300 / 0.76);
  near.resize(320 / 0.76, 300 / 0.76);
  assert.ok(spread.game.enemies[0].x > near.game.enemies[0].x + 50);
});
