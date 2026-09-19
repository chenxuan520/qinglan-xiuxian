import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { TREASURES, PASSIVES, STAGES, ENEMIES, xpNeeded } from '../src/data.ts';
import { spriteFrame } from '../src/sprites.ts';
import {
  freshSave,
  parseSave,
  realmCost,
  realmInfo,
  settleRun,
  train,
  forge,
} from '../src/progress.ts';

function seeded(seed = 42) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
const createGame = () => new Game(freshSave(), 0, 0, seeded());
function advance(game: Game, seconds: number) {
  for (let i = 0; i < seconds * 20; i++) game.update(0.05);
}

test('暂停与升级选择冻结模拟，恢复后时间继续', () => {
  const game = createGame();
  game.pause();
  advance(game, 2);
  assert.equal(game.time, 0);
  game.resume();
  game.xp = xpNeeded(1);
  game.update(0.05);
  assert.equal(game.state, 'upgrade');
  assert.equal(game.level, 2);
  const time = game.time;
  advance(game, 2);
  assert.equal(game.time, time);
  assert.equal(game.choose(8), false);
  assert.equal(game.state, 'upgrade');
  assert.equal(game.choose(0), true);
  game.update(0.05);
  assert.ok(game.time > time);
});
test('斜向移动不比直线快，受伤具有无敌间隔', () => {
  const straight = createGame(),
    diagonal = createGame();
  straight.input = { x: 1, y: 0 };
  diagonal.input = { x: 1, y: 1 };
  advance(straight, 0.5);
  advance(diagonal, 0.5);
  assert.ok(Math.abs(straight.player.x - Math.hypot(diagonal.player.x, diagonal.player.y)) < 0.001);
  straight.hurtPlayer(10);
  straight.hurtPlayer(10);
  assert.equal(straight.player.hp, 90);
  straight.pause();
  advance(straight, 2);
  straight.hurtPlayer(10);
  assert.equal(straight.player.hp, 90);
});
test('16 种攻击法宝均能独立对妖物造成伤害', () => {
  assert.equal(TREASURES.length, 16);
  assert.equal(new Set(TREASURES.map((t) => t.id)).size, 16);
  for (const t of TREASURES) {
    const save = freshSave();
    save.starter = t.id;
    const game = new Game(save, 0, 0, seeded());
    game.player.maxHp = game.player.hp = 10000;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      game.spawnEnemy(4, false, false, { x: Math.cos(a) * 100, y: Math.sin(a) * 100 });
    }
    advance(game, 5);
    assert.ok(game.damageDealt > 0, `${t.name} 没有造成伤害`);
  }
});
test('每个进化配方满足条件后都进入选择，未满足时不出现', () => {
  for (const t of TREASURES) {
    const game = createGame();
    game.weapons = [{ id: t.id, level: 6, timer: 0, evolved: false }];
    assert.ok(!game.makeChoices().some((c) => c.type === 'evolve'));
    game.passives[t.passive] = 3;
    game.state = 'upgrade';
    game.choices = game.makeChoices();
    assert.equal(game.choices[0].type, 'evolve');
    assert.equal(game.choices[0].id, t.id);
    game.choose(0);
    assert.equal(game.weapons[0].evolved, true);
    assert.ok(!game.makeChoices().some((c) => c.type === 'evolve'));
  }
});
test('满负载不会提供第七件法宝或第五种功法，重悟次数有上限', () => {
  const game = createGame();
  game.weapons = TREASURES.slice(0, 6).map((t) => ({
    id: t.id,
    level: 6,
    timer: 0,
    evolved: true,
  }));
  game.passives = Object.fromEntries(PASSIVES.slice(0, 4).map((p) => [p.id, 5]));
  game.state = 'upgrade';
  game.choices = game.makeChoices();
  assert.deepEqual(
    game.choices.map((c) => c.type),
    ['heal'],
  );
  assert.ok(game.reroll());
  assert.ok(game.reroll());
  assert.ok(game.reroll());
  assert.equal(game.reroll(), false);
});
test('妖物掉落灵气可拾取，精英宝匣直接升阶并给玄铁', () => {
  const game = createGame();
  const enemy = game.spawnEnemy(0, true, false, { x: 0, y: 0 });
  game.hitEnemy(enemy, enemy.maxHp);
  assert.equal(game.kills, 1);
  assert.ok(game.pickups.some((p) => p.kind === 'chest'));
  game.update(0.05);
  assert.equal(game.weapons[0].level, 2);
  assert.equal(game.iron, 2);
  assert.equal(game.level, 2);
});
test('倒计时结束只召唤妖王，击败才通关', () => {
  const game = createGame();
  game.time = STAGES[0].minutes * 60 - 0.01;
  game.update(0.05);
  assert.ok(game.bossSpawned);
  assert.ok(game.boss);
  assert.equal(game.state, 'playing');
  game.hitEnemy(game.boss!, 1e6);
  assert.equal(game.state, 'won');
});
test('死亡会结算失败，回血不会复活已结束的一局', () => {
  const game = createGame();
  game.hurtPlayer(1000);
  game.update(0.05);
  assert.equal(game.state, 'lost');
  const time = game.time;
  advance(game, 3);
  assert.equal(game.time, time);
  assert.equal(game.player.hp, 0);
});
test('境界按九大境界三阶段逐级突破，达到渡劫封顶', () => {
  assert.equal(realmInfo(0).name, '炼气初期');
  assert.equal(realmInfo(realmCost(0)).name, '炼气中期');
  const toFoundation = realmCost(0) + realmCost(1) + realmCost(2);
  assert.equal(realmInfo(toFoundation).name, '筑基初期');
  assert.equal(realmInfo(1e9).name, '渡劫后期');
  assert.ok(realmInfo(1e9).max);
});
test('失败保留收益但不解锁，通关逐境解锁并保存', () => {
  const save = freshSave();
  const run = { stage: 0, difficulty: 0, kills: 100, time: 150, victory: false, iron: 2, level: 9 };
  const rewards = settleRun(save, run);
  assert.ok(rewards.stones > 0 && rewards.cultivation > 0);
  assert.equal(save.iron, 2);
  assert.equal(save.unlocked, 0);
  settleRun(save, { ...run, victory: true });
  assert.equal(save.unlocked, 1);
  assert.deepEqual(save.completed, [0]);
  assert.deepEqual(parseSave(JSON.stringify(save)), {
    ...save,
    forge: Object.fromEntries(TREASURES.map((t) => [t.id, 0])),
  });
});
test('灵石和玄铁不足不扣款，成功升级按对应成本扣款且有封顶', () => {
  const save = freshSave();
  assert.equal(train(save, 'power'), false);
  assert.equal(forge(save, 'sword'), false);
  save.stones = 100;
  save.iron = 3;
  assert.equal(forge(save, 'sword'), true);
  assert.equal(save.stones, 65);
  assert.equal(save.iron, 0);
  assert.equal(save.forge.sword, 1);
  assert.equal(train(save, 'power'), true);
  assert.equal(save.stones, 20);
  assert.equal(save.training.power, 1);
  save.training.power = 20;
  save.stones = 1000000;
  assert.equal(train(save, 'power'), false);
  save.forge.sword = 5;
  save.iron = 100;
  assert.equal(forge(save, 'sword'), false);
});
test('损坏和越界存档不会破坏游戏初始化', () => {
  assert.deepEqual(parseSave('{broken'), freshSave());
  assert.deepEqual(parseSave('null'), freshSave());
  const s = parseSave(
    JSON.stringify({
      version: 1,
      stones: -80,
      cultivation: 'bad',
      unlocked: 100,
      starter: 'bad',
      forge: { sword: 999 },
      training: { speed: 999 },
      completed: [-1, 0, 0, 70],
    }),
  );
  assert.equal(s.stones, 0);
  assert.equal(s.unlocked, 5);
  assert.equal(s.starter, 'sword');
  assert.equal(s.forge.sword, 5);
  assert.equal(s.training.speed, 20);
  assert.deepEqual(s.completed, [0]);
});
test('不同难度增加妖物强度与收益，精英和妖王不会在首秒出现', () => {
  const easy = createGame(),
    hard = new Game(freshSave(), 0, 2, seeded());
  const a = easy.spawnEnemy(0),
    b = hard.spawnEnemy(0);
  assert.ok(b.hp > a.hp);
  assert.ok(b.damage > a.damage);
  advance(easy, 1);
  assert.ok(easy.enemies.every((e) => !e.elite && !e.boss));
  const s1 = freshSave(),
    s2 = freshSave();
  const run = { stage: 0, difficulty: 0, kills: 100, time: 100, victory: false, iron: 0, level: 5 };
  assert.ok(settleRun(s2, { ...run, difficulty: 2 }).stones > settleRun(s1, run).stones);
});
test('吞天纳灵自动吸取范围外的经验，未修炼时不吸取', () => {
  const plain = createGame(),
    trained = createGame();
  trained.passives.magnet = 5;
  for (const g of [plain, trained])
    g.pickups = [{ x: 180, y: 0, kind: 'xp', value: 4, pull: false }];
  plain.update(0.05);
  trained.update(0.05);
  assert.equal(plain.pickups[0].pull, false);
  assert.equal(trained.pickups[0].pull, true);
  advance(trained, 0.5);
  assert.ok(trained.xp > 4);
  assert.equal(trained.pickups.length, 0);
});
test('对局快照经过 JSON 存取后恢复位置、战斗、掉落和弹道命中集合', () => {
  const game = createGame();
  game.player.x = 45;
  game.player.y = -89;
  game.player.hp = 71;
  game.spawnEnemy(0, false, false, { x: 150, y: 0 });
  game.pickups.push({ x: 350, y: 45, kind: 'iron', value: 1, pull: false });
  game.update(0.05);
  assert.ok(game.shots.length > 0);
  game.shots[0].hit.add(777);
  const stored = JSON.parse(JSON.stringify(game.snapshot()));
  const restored = Game.restore(game.save, stored)!;
  assert.ok(restored);
  assert.equal(restored.state, 'paused');
  assert.equal(restored.player.x, 45);
  assert.equal(restored.player.y, -89);
  assert.equal(restored.player.hp, game.player.hp);
  assert.equal(restored.time, game.time);
  assert.equal(restored.enemies.length, game.enemies.length);
  assert.equal(restored.pickups.length, 1);
  assert.ok(restored.shots[0].hit instanceof Set);
  assert.ok(restored.shots[0].hit.has(777));
  advance(restored, 3);
  assert.equal(restored.time, game.time);
  restored.resume();
  restored.update(0.05);
  assert.ok(restored.time > game.time);
});
test('升级中的存档保留原有三选一和重悟次数，不会刷新选项', () => {
  const game = createGame();
  game.xp = xpNeeded(1);
  game.update(0.05);
  game.reroll();
  const restored = Game.restore(game.save, JSON.parse(JSON.stringify(game.snapshot())))!;
  assert.equal(restored.state, 'upgrade');
  assert.equal(restored.rerolls, 2);
  assert.deepEqual(restored.choices, game.choices);
  const selection = restored.choices[0];
  assert.ok(restored.choose(0));
  assert.equal(restored.state, 'playing');
  if (selection.type === 'weapon')
    assert.ok(restored.weapons.some((w) => w.id === selection.id && w.level === selection.level));
});
test('已结束或损坏的对局不恢复，永久进度仍可读取', () => {
  const game = createGame();
  const snapshot = game.snapshot();
  assert.equal(Game.restore(game.save, { ...snapshot, state: 'won' }), null);
  assert.equal(Game.restore(game.save, { ...snapshot, enemies: [{}] }), null);
  assert.equal(
    Game.restore(game.save, { ...snapshot, weapons: [{ id: 'missing', level: 1 }] }),
    null,
  );
  assert.equal(Game.restore(game.save, { ...snapshot, stage: 5 }), null);
  assert.equal(Game.restore(game.save, null), null);
  const s = parseSave(JSON.stringify({ ...game.save, stones: 35, activeRun: { invalid: true } }));
  assert.equal(s.stones, 35);
});
test('十二种普通妖物分别使用独立立绘，图集坐标不会越界', () => {
  assert.equal(new Set(ENEMIES.map((e) => e.sprite)).size, 12);
  for (const e of [...ENEMIES, ...STAGES]) {
    const f = spriteFrame(e.sprite);
    assert.ok(f.x >= 0 && f.y >= 0);
    assert.ok(f.x + f.width <= 1536 && f.y + f.height <= 1024);
  }
});
