import test from 'node:test';
import assert from 'node:assert/strict';
import { SPIRIT_ROOTS, rollSpiritRoot, xpNeeded, DIFFICULTIES } from '../src/data.ts';
import { Game } from '../src/game.ts';
import {
  freshSave,
  parseSave,
  cultivationReward,
  settleRun,
  bossCultivationReward,
} from '../src/progress.ts';

test('六种灵根按公开概率抽取，新档随机，已存档与旧档读取不重抽', () => {
  const counts = Object.fromEntries(SPIRIT_ROOTS.map((root) => [root.id, 0]));
  for (let i = 0; i < 100; i++) counts[rollSpiritRoot(() => (i + 0.5) / 100)]++;
  assert.deepEqual(counts, { heaven: 5, variant: 10, dual: 15, triple: 25, quad: 25, five: 20 });
  assert.equal(parseSave(null, () => 0).spiritRoot, 'heaven');
  assert.equal(parseSave(null, () => 0.99).spiritRoot, 'five');
  const noRoll = () => {
    throw new Error('读档不应重新抽取');
  };
  for (const root of SPIRIT_ROOTS)
    assert.equal(parseSave(JSON.stringify(freshSave(root.id)), noRoll).spiritRoot, root.id);
  const { spiritRoot, ...legacy } = freshSave();
  legacy.forge.sword = 10;
  assert.equal(parseSave(JSON.stringify(legacy), noRoll).spiritRoot, 'heaven');
  assert.equal(parseSave(JSON.stringify(legacy), noRoll).forge.sword, 10);
  assert.equal(
    parseSave(JSON.stringify({ ...legacy, spiritRoot: 'invalid' })).spiritRoot,
    'heaven',
  );
});

test('灵根同时缩放基础和功法灵气，天灵根保持原速度，战斗伤害与气血不受影响', () => {
  for (const difficulty of [0, 1, 2]) {
    const baseline = new Game(freshSave(), 0, difficulty, () => 0.5);
    baseline.passives.spirit = 3;
    for (const root of SPIRIT_ROOTS) {
      const g = new Game(freshSave(root.id), 0, difficulty, () => 0.5);
      g.passives.spirit = 3;
      assert.ok(Math.abs(g.stats.xp - baseline.stats.xp * root.rate) < 1e-10);
      assert.equal(g.stats.damage, baseline.stats.damage);
      assert.equal(g.player.maxHp, baseline.player.maxHp);
      g.pickups.push({ x: 0, y: 0, kind: 'xp', value: 3, pull: false });
      g.update(0.01);
      assert.ok(Math.abs(g.xp - 3 * baseline.stats.xp * root.rate) < 1e-10);
    }
  }
});

test('妖王直接吸收的局内经验也受灵根资质影响', () => {
  let baseline = 0;
  for (const root of SPIRIT_ROOTS) {
    const g = new Game(freshSave(root.id), 0, 0, () => 0.5);
    g.hitEnemy(g.spawnEnemy(0, false, true), 1e9);
    const totalXp =
      g.xp +
      Array.from({ length: g.level - 1 }, (_, i) => xpNeeded(i + 1)).reduce((a, b) => a + b, 0);
    if (root.id === 'heaven') baseline = totalXp;
    assert.ok(baseline > 0);
    assert.ok(Math.abs(totalXp - baseline * root.rate) < 1e-8);
  }
});

test('各灵根的小怪、Boss 与通关修为倍率一致，连续读档不补发，灵石玄铁不打折', () => {
  for (const difficulty of [0, 1, 2]) {
    let expectedStones = 0,
      expectedIron = 0;
    for (const root of SPIRIT_ROOTS) {
      const save = freshSave(root.id);
      const g = new Game(save, 0, difficulty, () => 0.5);
      g.time = 30;
      g.hitEnemy(g.spawnEnemy(0), 1e9);
      assert.equal(save.cultivation, cultivationReward(g));
      const earned = save.cultivation;
      const restored = Game.restore(save, JSON.parse(JSON.stringify(g.snapshot())))!;
      assert.ok(restored);
      assert.equal(restored.spiritRoot, root.id);
      assert.equal(save.cultivation, earned);
      assert.ok(Game.restore(save, restored.snapshot()));
      assert.equal(save.cultivation, earned);
      g.hitEnemy(g.spawnEnemy(0, false, true), 1e9);
      assert.equal(
        g.bossCultivation,
        bossCultivationReward(0) * DIFFICULTIES[difficulty].reward * root.rate,
      );
      assert.equal(save.cultivation, cultivationReward(g));
      const credited = g.creditedCultivation;
      const rewards = settleRun(save, { ...g.snapshot(), victory: true });
      assert.equal(rewards.cultivationRemaining, cultivationReward(g, 100) - credited);
      assert.equal(save.cultivation, cultivationReward(g, 100));
      if (root.id === 'heaven') {
        expectedStones = rewards.stones;
        expectedIron = rewards.iron;
      }
      assert.equal(rewards.stones, expectedStones);
      assert.equal(rewards.iron, expectedIron);
    }
  }
});

test('旧对局按天灵根恢复，洗灵根后的续局保留出发资质，不补发历史修为', () => {
  const save = freshSave();
  const g = new Game(save, 0, 0);
  g.hitEnemy(g.spawnEnemy(0), 1e9);
  const legacy = JSON.parse(JSON.stringify(g.snapshot()));
  delete legacy.spiritRoot;
  assert.equal(Game.restore(save, legacy)?.spiritRoot, 'heaven');
  const lowSave = freshSave('five');
  const lowGame = new Game(lowSave, 0, 0);
  lowGame.hitEnemy(lowGame.spawnEnemy(0), 1e9);
  const snapshot = lowGame.snapshot();
  const credited = lowSave.cultivation;
  lowSave.spiritRoot = 'heaven';
  const restored = Game.restore(lowSave, snapshot)!;
  assert.equal(restored.spiritRoot, 'five');
  assert.equal(lowSave.cultivation, credited);
  const rewards = settleRun(lowSave, { ...snapshot, victory: false });
  assert.equal(rewards.cultivationRemaining, 0);
  assert.equal(new Game(lowSave, 0, 0).spiritRoot, 'heaven');
  assert.equal(Game.restore(save, { ...g.snapshot(), spiritRoot: 'invalid' }), null);
});
