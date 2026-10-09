import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import {
  DIFFICULTIES,
  FIRST_STAGE_CLEAR_CULTIVATION,
  LEGACY_STAGE_REALM_STEPS,
  SPIRIT_ROOTS,
  STAGE_REALM_STEPS,
} from '../src/data.ts';
import {
  bossCultivationReward,
  cultivationReward,
  freshSave,
  parseSave,
  realmCost,
  realmDamageMultiplier,
  realmHealthMultiplier,
  realmInfo,
  settleRun,
} from '../src/progress.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';

const threshold = (step: number) =>
  Array.from({ length: step }, (_, i) => realmCost(i)).reduce((a, b) => a + b, 0);
function encounter(stage: number, step = 23, version = 2) {
  const save = freshSave('heaven', ['metal'], 'orthodox');
  save.unlocked = 6;
  save.cultivation = threshold(step);
  const game = new Game(save, stage, 0, () => 0.5);
  game.progressionVersion = version;
  return game;
}

test('新历练同种妖物随秘境提高修为，不随玩家变强减奖，妖王奖励逐境递增', () => {
  for (const elite of [false, true]) {
    let previous = 0;
    for (let stage = 0; stage < 7; stage++) {
      const low = encounter(stage, 0),
        high = encounter(stage, 23);
      for (const g of [low, high]) {
        for (let i = 0; i < 20; i++) {
          const enemy = g.spawnEnemy(0, elite, false, { x: 300, y: 0 });
          g.hitEnemy(enemy, enemy.maxHp, false, 'sword');
        }
      }
      assert.equal(low.creditedCultivation, high.creditedCultivation);
      assert.ok(low.creditedCultivation > previous, `stage ${stage}, elite ${elite}`);
      previous = low.creditedCultivation;
    }
  }
  for (let stage = 1; stage < 7; stage++)
    assert.ok(bossCultivationReward(stage) > bossCultivationReward(stage - 1));
  for (let boss = 0; boss < 6; boss++)
    assert.ok(bossCultivationReward(6, boss) > bossCultivationReward(boss));
});

test('首关机缘只随首次胜利结算，失败、重游、刷新与导入不会再次领取', () => {
  for (const root of SPIRIT_ROOTS)
    for (const difficulty of [0, 1, 2]) {
      const save = freshSave(root.id);
      const run = {
        stage: 0,
        difficulty,
        kills: 100,
        time: 180,
        iron: 3,
        level: 10,
        combatCultivation: 120,
        progressionVersion: 2,
      };
      const failed = settleRun(save, { ...run, victory: false });
      assert.equal(failed.firstClearCultivation, 0);
      const won = settleRun(save, { ...run, victory: true });
      const bonus = Math.floor(
        FIRST_STAGE_CLEAR_CULTIVATION * DIFFICULTIES[difficulty].reward * root.rate,
      );
      assert.equal(won.firstClearCultivation, bonus);
      for (const restored of [
        save,
        parseSave(JSON.stringify(save)),
        importSave(exportSave(save, null)).save,
      ]) {
        const repeat = settleRun(restored, { ...run, victory: true });
        assert.equal(repeat.firstClearCultivation, 0);
        assert.equal(won.cultivation - repeat.cultivation, bonus);
      }
      const legacy = freshSave(root.id);
      assert.equal(
        settleRun(legacy, { ...run, progressionVersion: 1, victory: true }).firstClearCultivation,
        0,
      );
    }
});

test('旧续局保留原关卡强度与修为规则，新开局采用新梯度，恢复不重复发奖', () => {
  for (const stage of [0, 1, 3, 5, 6]) {
    const old = encounter(stage, 23, 1);
    for (let i = 0; i < 20; i++) {
      const enemy = old.spawnEnemy(0, false, false, { x: 300, y: 0 });
      old.hitEnemy(enemy, enemy.maxHp, false, 'sword');
    }
    const raw = JSON.parse(JSON.stringify(old.snapshot()));
    delete raw.progressionVersion;
    const before = old.save.cultivation;
    const restored = Game.restore(parseSave(JSON.stringify(old.save)), raw)!;
    assert.ok(restored);
    assert.equal(restored.progressionVersion, 1);
    assert.equal(old.save.cultivation, before);
    const fresh = encounter(stage);
    const a = restored.spawnEnemy(0, false, false, { x: 500, y: 0 });
    const b = fresh.spawnEnemy(0, false, false, { x: 500, y: 0 });
    assert.ok(
      Math.abs(
        a.hp / b.hp -
          realmDamageMultiplier(LEGACY_STAGE_REALM_STEPS[stage]) /
            realmDamageMultiplier(STAGE_REALM_STEPS[stage]),
      ) < 1e-8,
    );
    assert.ok(
      Math.abs(
        a.damage / b.damage -
          realmHealthMultiplier(LEGACY_STAGE_REALM_STEPS[stage]) /
            realmHealthMultiplier(STAGE_REALM_STEPS[stage]),
      ) < 1e-8,
    );
    for (const g of [old, restored]) {
      const boss = g.spawnEnemy(10, false, true, { x: 700, y: 0 }, stage);
      g.hitEnemy(boss, boss.maxHp, false, 'sword');
    }
    assert.equal(old.creditedCultivation, restored.creditedCultivation);
    assert.equal(old.save.cultivation, restored.save.cultivation);
    const malformed = { ...fresh.snapshot(), progressionVersion: 5 };
    assert.equal(Game.restore(fresh.save, malformed), null);
  }
});

test('新修为累计支持断点续局与失败结算，已获境界保留且终关门槛不变', () => {
  for (const stage of [0, 2, 6])
    for (const root of ['heaven', 'five', 'none'] as const) {
      const save = freshSave(root);
      save.unlocked = 6;
      save.cultivation = threshold(23);
      const g = new Game(save, stage, 0, () => 0.5);
      for (let i = 0; i < 30; i++) {
        const enemy = g.spawnEnemy(0, false, false, { x: 500, y: 0 });
        g.hitEnemy(enemy, enemy.maxHp, false, 'sword');
      }
      const before = save.cultivation;
      const restored = Game.restore(save, JSON.parse(JSON.stringify(g.snapshot())))!;
      assert.ok(restored);
      assert.equal(restored.progressionVersion, 4);
      assert.equal(save.cultivation, before);
      assert.equal(restored.creditedCultivation, g.creditedCultivation);
      assert.ok(Game.restore(save, restored.snapshot()));
      assert.equal(save.cultivation, before);
      const result = settleRun(save, { ...restored.snapshot(), victory: false });
      assert.equal(result.cultivationRemaining, 0);
      assert.equal(save.cultivation, before);
    }
  assert.equal(realmInfo(threshold(24) * 100, false).name, '渡劫');
  assert.equal(realmInfo(threshold(24), true).name, '真仙');
});

test('重复首关收益与后段秘境拉开差距，局内等级不能绕过修为梯度', () => {
  const run = {
    kills: 1000,
    level: 100,
    difficulty: 0,
    progressionVersion: 2,
    spiritRoot: 'heaven' as const,
  };
  const early = cultivationReward(
    { ...run, stage: 0, combatCultivation: bossCultivationReward(0) },
    100,
  );
  const late = cultivationReward(
    { ...run, stage: 5, combatCultivation: bossCultivationReward(5) },
    350,
  );
  assert.ok(early < 400);
  assert.ok(late > early * 60);
  assert.ok(threshold(24) / early > 300);
});
