import test from 'node:test';
import assert from 'node:assert/strict';
import { REALM_LIFESPANS, STAGE_YEARS_PER_MINUTE, SPIRIT_ROOTS } from '../src/data.ts';
import {
  freshSave,
  realmCost,
  lifespanInfo,
  extendLifespan,
  parseSave,
  attuneSpiritRoot,
} from '../src/progress.ts';
import { Game } from '../src/game.ts';

const cultivationAt = (index: number) =>
  Array.from({ length: index * 3 }, (_, i) => realmCost(i)).reduce((a, b) => a + b, 0);
function quietGame(stage = 0) {
  const save = freshSave();
  save.unlocked = stage;
  const g = new Game(save, stage, 0);
  g.weapons = [];
  g.spawnBudget = -10000;
  g.nextElite = 1e9;
  g.bossSpawned = true;
  return g;
}

test('各境寿元符合设定，大乘与渡劫无限，突破保留年岁与广告借寿', () => {
  assert.deepEqual(REALM_LIFESPANS, [100, 250, 500, 1000, 2000, 5000, 10000, Infinity, Infinity]);
  const save = freshSave();
  save.age = 20;
  assert.equal(extendLifespan(save), 30);
  for (let index = 0; index < 9; index++) {
    save.cultivation = cultivationAt(index);
    if (index === 8) save.completed = [6];
    const life = lifespanInfo(save);
    assert.equal(life.limit, REALM_LIFESPANS[index] + 30);
    assert.equal(life.age, 20);
    assert.equal(new Game(save, 0, 0).lifespan, life.limit);
  }
  assert.equal(extendLifespan(save), 0);
  assert.equal(save.lifespanBonus, 30);
});

test('七境按战斗时间计龄，暂停、选技与死亡不计龄，年龄跨局累计', () => {
  assert.deepEqual(STAGE_YEARS_PER_MINUTE, [10, 25, 50, 100, 200, 500, 1000]);
  for (let stage = 0; stage < 7; stage++) {
    const g = quietGame(stage);
    for (let i = 0; i < 20; i++) g.update(0.05);
    assert.ok(Math.abs(g.save.age - 15 - STAGE_YEARS_PER_MINUTE[stage] / 60) < 1e-8);
    const age = g.save.age;
    for (const state of ['paused', 'upgrade', 'lost', 'won'] as const) {
      g.state = state;
      g.update(0.05);
      assert.equal(g.save.age, age);
    }
    const next = new Game(g.save, stage, 0);
    next.update(0.05);
    assert.ok(g.save.age > age);
  }
});

test('炼气在第一境从十五岁累计八分半寿尽，普通复活无效，借寿延长三成并保留战绩', () => {
  const g = quietGame();
  for (let i = 0; i < 10199; i++) g.update(0.05);
  assert.equal(g.state, 'playing');
  g.update(0.05);
  assert.equal(g.save.age, 100);
  assert.equal(g.expired, true);
  assert.equal(g.state, 'lost');
  assert.equal(g.player.hp, 0);
  assert.equal(g.revive(), false);
  assert.equal(g.borrowLife(), 30);
  assert.equal(g.lifespan, 130);
  assert.equal(g.state, 'paused');
  assert.equal(g.player.hp, g.player.maxHp);
  assert.equal(g.player.invincible, 3);
  assert.equal(g.revivesUsed, 0);
  assert.equal(g.save.age, 100);
  const time = g.time;
  g.update(0.05);
  assert.equal(g.time, time);
  g.resume();
  g.update(0.05);
  assert.ok(g.time > time);
  assert.equal(g.borrowLife(), 30);
  assert.equal(g.save.lifespanBonus, 60);
  const fresh = freshSave();
  assert.equal(fresh.age, 15);
  assert.equal(fresh.lifespanBonus, 0);
});

test('年龄与借寿保存恢复不重复扣减，旧档不追扣游戏时间', () => {
  const save = freshSave();
  save.age = 51.25;
  save.lifespanBonus = 60;
  const game = new Game(save, 0, 0);
  game.time = 250;
  const loaded = parseSave(JSON.stringify(save));
  const resumed = Game.restore(loaded, game.snapshot())!;
  assert.ok(resumed);
  assert.equal(resumed.save.age, 51.25);
  assert.equal(resumed.lifespan, 160);
  assert.equal(Game.restore(loaded, resumed.snapshot())!.save.age, 51.25);
  const legacy = parseSave(JSON.stringify({ ...save, age: undefined, lifespanBonus: undefined }));
  assert.equal(legacy.age, 15);
  assert.equal(legacy.lifespanBonus, 0);
});

test('悟道每阶收益按天异普通伪无分别5/4/3/2/1%，旧等级保留且当前局锁定资质', () => {
  assert.deepEqual(
    SPIRIT_ROOTS.map((r) => r.powerPerLevel),
    [5, 4, 3, 3, 2, 2, 1],
  );
  for (const root of SPIRIT_ROOTS) {
    const save = freshSave(root.id);
    save.training.power = 10;
    const g = new Game(save, 0, 0);
    assert.equal(g.stats.damage, 1 + (10 * root.powerPerLevel) / 100);
    attuneSpiritRoot(save, 'heaven', ['metal']);
    assert.equal(save.training.power, 10);
    assert.equal(g.stats.damage, 1 + (10 * root.powerPerLevel) / 100);
    assert.equal(new Game(save, 0, 0).stats.damage, 1.5);
  }
});
