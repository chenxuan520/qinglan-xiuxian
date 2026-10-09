import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { masteryBonus, startActivity } from '../src/mortal.ts';
import {
  cultivationRate,
  STAGE_CULTIVATION_RATES,
  LEGACY_STAGE_CULTIVATION_RATES,
} from '../src/data.ts';
import {
  freshSave,
  readSave,
  SAVE_SCHEMA,
  realmCost,
  legacyRealmCost,
  realmInfo,
  IMMORTAL_CULTIVATION,
  cultivationReward,
  settleRun,
} from '../src/progress.ts';

test('八个大境界累计门槛与成仙总修为完全保留，小阶提前且大突破至少五倍', () => {
  let old = 0,
    current = 0;
  for (let major = 0; major < 8; major++) {
    const i = major * 3;
    assert.ok(realmCost(i) < legacyRealmCost(i));
    assert.ok(realmCost(i + 1) < legacyRealmCost(i + 1));
    assert.ok(realmCost(i + 2) >= realmCost(i + 1) * 5);
    for (let offset = 0; offset < 3; offset++) {
      old += legacyRealmCost(i + offset);
      current += realmCost(i + offset);
    }
    assert.equal(current, old);
    for (const cult of [old - 1, old, old + 1]) {
      assert.equal(realmInfo(cult, true).index, realmInfo(cult, true, 3).index);
      assert.ok(realmInfo(cult, true).step >= realmInfo(cult, true, 3).step);
    }
  }
  assert.equal(IMMORTAL_CULTIVATION, 119940);
  assert.deepEqual(
    [0, 1, 2].map((i) => realmCost(i)),
    [39, 49, 264],
  );
});
test('新局提高首关修为，版本1/2/3冻结原规则，后六关与妖王奖金不追溯改写', () => {
  assert.equal(cultivationRate(0, 4), 0.3);
  assert.equal(cultivationRate(0, 3), 0.15);
  assert.equal(cultivationRate(0, 2), 0.15);
  assert.equal(cultivationRate(0, 1), 1);
  assert.deepEqual(STAGE_CULTIVATION_RATES.slice(1), LEGACY_STAGE_CULTIVATION_RATES.slice(1));
  const run = { kills: 135, level: 9, difficulty: 0, stage: 0, spiritRoot: 'heaven' as const };
  assert.equal(cultivationReward({ ...run, progressionVersion: 4 }), 49);
  assert.equal(cultivationReward({ ...run, progressionVersion: 3 }), 24);
});
test('旧首关已入账快照恢复不补新倍率、不回血，连续恢复与失败结算只补差额', () => {
  const save = freshSave();
  save.spiritRoot = 'heaven';
  save.rootElements = ['metal'];
  save.starter = 'sword';
  save.artifacts = ['sword'];
  const old = new Game(save, 0, 0, () => 0.5, 'orthodox', 3);
  old.kills = 135;
  old.level = 9;
  old.combatCultivation = 7;
  (old as unknown as { creditCultivation: (show: boolean) => void }).creditCultivation(false);
  old.player.hp -= 9;
  const cult = save.cultivation,
    hp = old.player.hp,
    maxHp = old.player.maxHp;
  let snapshot = old.snapshot();
  for (let i = 0; i < 3; i++) {
    const restored = Game.restore(save, snapshot)!;
    assert.ok(restored);
    assert.equal(save.cultivation, cult);
    assert.equal(restored.progressionVersion, 3);
    assert.equal(restored.player.hp, hp);
    assert.equal(restored.player.maxHp, maxHp);
    snapshot = restored.snapshot();
  }
  const restored = Game.restore(save, snapshot)!;
  restored.state = 'lost';
  restored.player.hp = 0;
  settleRun(save, { ...restored.snapshot(), victory: false });
  assert.equal(save.cultivation, cult);
  assert.equal(new Game(save, 0, 0).progressionVersion, 4);
  assert.equal(readSave(JSON.stringify({ ...save, schema: SAVE_SCHEMA + 1 })).status, 'newer');
});
test('跨过新小阶门槛的旧对局保持旧属性，旧局天劫同版本，新局使用新门槛', () => {
  const save = freshSave();
  save.spiritRoot = 'heaven';
  save.rootElements = ['metal'];
  save.cultivation = 64;
  const old = new Game(save, 0, 0, () => 0.5, save.path, 3);
  const restored = Game.restore(save, old.snapshot())!;
  assert.ok(restored);
  assert.equal(restored.player.maxHp, old.player.maxHp);
  assert.equal(restored.stats.damage, old.stats.damage);
  assert.equal(realmInfo(save.cultivation, false, 3).step, 0);
  assert.equal(realmInfo(save.cultivation).step, 1);
  assert.ok(new Game(save, 0, 0).player.maxHp > old.player.maxHp);
  assert.equal(Game.createTribulation(save, old).progressionVersion, 3);
});
test('终关大量合法掉落可完整恢复，不能截断物品或放行无来源的超大数组', () => {
  const save = freshSave();
  save.unlocked = 6;
  save.completed = [0, 1, 2, 3, 4, 5];
  const g = new Game(save, 6, 0);
  g.kills = 1000;
  g.pickups = Array.from({ length: 1200 }, (_, i) => ({
    x: i,
    y: 0,
    kind: 'iron' as const,
    value: 1,
    pull: false,
  }));
  const snapshot = g.snapshot(),
    restored = Game.restore(save, snapshot);
  assert.ok(restored);
  assert.deepEqual(restored.pickups, g.pickups);
  assert.equal(Game.restore(save, { ...snapshot, kills: 0 }), null);
  assert.equal(
    Game.restore(save, {
      ...snapshot,
      pickups: [...snapshot.pickups, { x: NaN, y: 0, kind: 'iron', value: 1, pull: false }],
    }),
    null,
  );
});
test('旧续局宗门精研按旧境界解锁，新门槛不改变原战斗属性', () => {
  for (const id of ['guard', 'bone', 'soul']) {
    const save = freshSave('heaven', ['metal'], id === 'guard' ? 'orthodox' : 'demonic');
    save.cultivation = 100;
    save.mortal.member = { id, dues: 0, dueAt: 0 };
    const old = new Game(save, 0, 0, () => 0.5, save.path, 3);
    const oldStats = old.stats;
    const snapshot = old.snapshot();
    save.stones = 30;
    assert.equal(
      startActivity(save, 'study', () => 0.9),
      true,
    );
    assert.equal(masteryBonus(save, id, 3), 0);
    assert.equal(masteryBonus(save, id), 0.03);
    const loaded = Game.restore(save, snapshot);
    assert.ok(loaded);
    assert.deepEqual(loaded.stats, oldStats);
    const unstudied = structuredClone(save);
    unstudied.mortal.mastery[id] = 0;
    const original = new Game(unstudied, 0, 0, () => 0.5, save.path, 3);
    assert.deepEqual(old.stats, original.stats);
    assert.equal(old.player.maxHp, original.player.maxHp);
    const studied = new Game(save, 0, 0),
      untrained = new Game(unstudied, 0, 0);
    assert.notDeepEqual(
      { stats: studied.stats, maxHp: studied.player.maxHp },
      { stats: untrained.stats, maxHp: untrained.player.maxHp },
    );
    if (id === 'soul') {
      for (const game of [loaded, studied]) {
        const enemy = game.spawnEnemy(1, false, false, { x: 163, y: 0 });
        game.hitEnemy(enemy, 20000);
        assert.equal(game.pickups.find((p) => p.kind === 'xp')?.pull, game === studied);
      }
    }
    save.cultivation = legacyRealmCost(0) + legacyRealmCost(1);
    assert.equal(masteryBonus(save, id, 3), 0.03);
  }
});
