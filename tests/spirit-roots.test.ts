import test from 'node:test';
import assert from 'node:assert/strict';
import { SPIRIT_ROOTS, rollSpiritRoot, xpNeeded, DIFFICULTIES, rootStarter } from '../src/data.ts';
import { Game } from '../src/game.ts';
import {
  freshSave,
  parseSave,
  cultivationReward,
  settleRun,
  bossCultivationReward,
  realmBonuses,
  realmInfo,
  attuneSpiritRoot,
} from '../src/progress.ts';

test('七档灵根按公开概率抽取，新档随机，已存档与旧档读取不重抽', () => {
  const counts = Object.fromEntries(SPIRIT_ROOTS.map((root) => [root.id, 0]));
  for (let i = 0; i < 100; i++) counts[rollSpiritRoot(() => (i + 0.5) / 100)]++;
  assert.deepEqual(counts, {
    heaven: 5,
    variant: 10,
    dual: 15,
    triple: 25,
    quad: 25,
    five: 10,
    none: 10,
  });
  assert.equal(parseSave(null, () => 0).spiritRoot, 'heaven');
  assert.equal(parseSave(null, () => 0.99).spiritRoot, 'none');
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

test('灵根同时缩放基础和功法灵气，天灵根保持原速度，未修炼悟道的基础攻击属性不变', () => {
  for (const difficulty of [0, 1, 2]) {
    const baseline = new Game(freshSave(), 0, difficulty, () => 0.5);
    baseline.passives.spirit = 3;
    for (const root of SPIRIT_ROOTS) {
      const g = new Game(freshSave(root.id), 0, difficulty, () => 0.5);
      g.passives.spirit = 3;
      assert.ok(Math.abs(g.stats.xp - baseline.stats.xp * root.rate) < 1e-10);
      assert.equal(g.stats.damage, baseline.stats.damage);
      g.pickups.push({ x: 0, y: 0, kind: 'xp', value: 3, pull: false });
      g.update(0.01);
      assert.ok(Math.abs(g.xp - 3 * baseline.stats.xp * root.rate) < 1e-10);
    }
  }
});

test('灵根基础气血依次100/95/90/85/80，正道、境界与淬体在基础上叠加', () => {
  const expected = [100, 95, 90, 90, 85, 85, 80];
  for (const [i, root] of SPIRIT_ROOTS.entries()) {
    for (const path of ['orthodox', 'demonic', 'dual'] as const) {
      const save = freshSave(root.id);
      save.path = path;
      save.starter = rootStarter(save.rootElements, path);
      const factor = path === 'orthodox' ? 1.12 : 1;
      assert.equal(new Game(save, 0, 0).player.maxHp, Math.round(expected[i] * factor));
      save.training.vitality = 10;
      save.cultivation = 12345;
      const hp = expected[i] + 100 + realmBonuses(realmInfo(save.cultivation).step).hp;
      const g = new Game(save, 0, 0);
      assert.equal(g.player.maxHp, Math.round(hp * factor));
      g.state = 'upgrade';
      g.choices = [{ type: 'passive', id: path === 'demonic' ? 'bone' : 'guard', level: 1 }];
      g.choose(0);
      assert.equal(g.player.maxHp, Math.round((path === 'demonic' ? hp * 1.18 : hp + 20) * factor));
    }
  }
});

test('旧续局按开局灵根换算气血，保留损失血量，洗根与重复读档不会补满', () => {
  const save = freshSave('triple');
  const g = new Game(save, 0, 0);
  const old = JSON.parse(JSON.stringify(g.snapshot()));
  old.player.maxHp = 100;
  old.player.hp = 67;
  save.spiritRoot = 'heaven';
  const restored = Game.restore(save, old)!;
  assert.equal(restored.spiritRoot, 'triple');
  assert.equal(restored.player.maxHp, 90);
  assert.equal(restored.player.hp, 57);
  const again = Game.restore(save, restored.snapshot())!;
  assert.equal(again.player.maxHp, 90);
  assert.equal(again.player.hp, 57);
  old.state = 'lost';
  old.player.hp = 0;
  assert.equal(Game.restore(save, old)!.player.hp, 0);
  assert.equal(new Game(save, 0, 0).player.maxHp, 100);
});

test('灵根基础回血分档，功法正常叠加，正道合计加20%，洗根不改变当前局', () => {
  const rates = [0.18, 0.16, 0.14, 0.14, 0.12, 0.12, 0.1];
  for (const [i, root] of SPIRIT_ROOTS.entries()) {
    for (const path of ['orthodox', 'demonic', 'dual'] as const) {
      for (const level of [0, 3]) {
        const save = freshSave(root.id);
        save.path = path;
        const g = new Game(save, 0, 0);
        g.passives.duration = level;
        const expected = (rates[i] + level * 0.2) * (path === 'orthodox' ? 1.2 : 1);
        assert.ok(Math.abs(g.stats.regen - expected) < 1e-10);
        g.player.hp -= 10;
        const before = g.player.hp;
        g.update(0.05);
        assert.ok(Math.abs(g.player.hp - before - expected * 0.05) < 1e-10);
        save.spiritRoot = 'heaven';
        assert.ok(Math.abs(g.stats.regen - expected) < 1e-10);
      }
    }
  }
});

test('灵根基础暴击与移速分档，实际移动使用各自速度并正常叠加根基与功法', () => {
  const crits = [0.07, 0.07, 0.05, 0.05, 0.03, 0.03, 0.01];
  const speeds = [175, 175, 160, 160, 150, 150, 140];
  for (const [i, root] of SPIRIT_ROOTS.entries()) {
    const save = freshSave(root.id);
    const g = new Game(save, 0, 0);
    assert.equal(g.stats.crit, crits[i]);
    assert.equal(g.stats.speed, speeds[i]);
    g.input = { x: 1, y: 0 };
    g.update(0.05);
    assert.equal(g.player.x, speeds[i] * 0.05);
    save.training.speed = 5;
    save.retreatBonus.speed = 10;
    g.passives = { crit: 2, curse: 3, frenzy: 1 };
    g.player.hp = g.player.maxHp * 0.4;
    assert.ok(Math.abs(g.stats.crit - (crits[i] + 0.14 + 0.24)) < 1e-10);
    assert.ok(Math.abs(g.stats.speed - speeds[i] * 1.2 * 1.1) < 1e-10);
    g.passives.crit = g.passives.curse = 10;
    assert.equal(g.stats.crit, 0.85);
    assert.equal(g.stats.criticalDamage, 3);
  }
});

test('洗根只改变后续新局的暴击与移速，旧续局继续按原资质计算', () => {
  const save = freshSave('none');
  const g = new Game(save, 0, 0);
  assert.equal(attuneSpiritRoot(save, 'heaven', ['metal']), true);
  for (const run of [g, Game.restore(save, g.snapshot())!]) {
    assert.equal(run.stats.crit, 0.01);
    assert.equal(run.stats.speed, 140);
  }
  const next = new Game(save, 0, 0);
  assert.equal(next.stats.crit, 0.07);
  assert.equal(next.stats.speed, 175);
  const legacy = JSON.parse(JSON.stringify(g.snapshot()));
  delete legacy.spiritRoot;
  delete legacy.rootElements;
  const restored = Game.restore(save, legacy)!;
  assert.equal(restored.stats.crit, 0.07);
  assert.equal(restored.stats.speed, 175);
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
