import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { SPIRIT_ROOTS } from '../src/data.ts';
import {
  IMMORTAL_CULTIVATION,
  SAVE_SCHEMA,
  cultivationReward,
  freshSave,
  parseSave,
  readSave,
  realmInfo,
  settleRun,
  enterImmortalGate,
} from '../src/progress.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';

const victory = {
  stage: 6,
  difficulty: 0,
  kills: 7,
  time: 425,
  iron: 3,
  level: 100,
  combatCultivation: 217600,
  victory: true,
};

test('七种灵根三档难度均在终关结算补足成仙，保留超额且不重复乘倍率', () => {
  assert.equal(IMMORTAL_CULTIVATION, 119940);
  for (const root of SPIRIT_ROOTS)
    for (const difficulty of [0, 1, 2])
      for (const initial of [0, 57024, 119000, 1e6]) {
        const save = freshSave(root.id);
        const run = { ...victory, difficulty, spiritRoot: root.id };
        const ordinary = cultivationReward(run, 400);
        const creditedCultivation = Math.floor(ordinary / 2);
        save.cultivation = initial + creditedCultivation;
        const before = save.cultivation;
        const result = settleRun(save, { ...run, creditedCultivation });
        const expected = Math.max(initial + ordinary, IMMORTAL_CULTIVATION);
        assert.equal(save.cultivation, expected);
        assert.equal(result.ascensionCultivation, expected - initial - ordinary);
        assert.equal(result.cultivation, expected - initial);
        assert.equal(result.cultivationRemaining, expected - before);
        assert.equal(result.cultivation - result.cultivationRemaining, creditedCultivation);
        assert.equal(realmInfo(save.cultivation, save.completed.includes(6)).name, '真仙');
        assert.equal(save.chronicle.milestones['realm-24'], save.age);
        assert.equal(enterImmortalGate(save), true);
      }
});

test('前六关、终关失败和放弃没有补足；足额但未通关仍被成仙门槛锁住', () => {
  for (let stage = 0; stage < 7; stage++)
    for (const won of [false, true]) {
      if (stage === 6 && won) continue;
      const save = freshSave('none');
      const result = settleRun(save, {
        ...victory,
        stage,
        victory: won,
        combatCultivation: 0,
        kills: 0,
        level: 1,
      });
      assert.equal(result.ascensionCultivation, 0);
      assert.equal(realmInfo(save.cultivation, save.completed.includes(6)).max, false);
      assert.equal(enterImmortalGate(save), false);
    }
  const save = freshSave();
  save.cultivation = IMMORTAL_CULTIVATION * 2;
  settleRun(save, { ...victory, victory: false });
  assert.equal(realmInfo(save.cultivation, save.completed.includes(6)).name, '渡劫');
  assert.equal(enterImmortalGate(save), false);
});

test('仙尊提前被杀不触发保底，六王后的读档不成仙，最后一王倒下才结算', () => {
  for (const root of ['none', 'five', 'heaven'] as const) {
    const save = freshSave(root);
    save.unlocked = 6;
    save.completed = [0, 1, 2, 3, 4, 5];
    save.cultivation = 57024;
    let g = new Game(save, 6, 0, () => 0.5);
    g.trialBossesSpawned = 7;
    const order = [6, 0, 1, 2, 3, 4, 5];
    const enemies = order.map((stage) => g.spawnEnemy(10, false, true, { x: 500, y: 0 }, stage));
    for (const e of enemies.slice(0, 6)) g.hitEnemy(e, e.maxHp, false, 'sword');
    assert.equal(g.trialBossesDefeated, 6);
    assert.notEqual(g.state, 'won');
    assert.equal(save.completed.includes(6), false);
    assert.equal(realmInfo(save.cultivation, false).max, false);
    const before = save.cultivation;
    const imported = importSave(exportSave(save, g));
    assert.equal(imported.save.cultivation, before);
    g = imported.run!;
    assert.ok(g);
    g.resume();
    const final = g.enemies.find((e) => e.boss && !e.dead)!;
    g.hitEnemy(final, final.maxHp, false, 'sword');
    assert.equal(g.state, 'won');
    const earned = g.save.cultivation;
    const result = settleRun(g.save, { ...g.snapshot(), victory: g.state === 'won' });
    assert.equal(g.save.cultivation, earned + result.cultivationRemaining);
    assert.equal(realmInfo(g.save.cultivation, g.save.completed.includes(6)).name, '真仙');
    if (root === 'none') assert.ok(result.ascensionCultivation > 0);
    const once = g.save.cultivation;
    const restored = importSave(exportSave(g.save, null)).save;
    assert.equal(restored.cultivation, once);
    assert.deepEqual(restored.chronicle, g.save.chronicle);
    // 重游仍发正常收益，但不会再发成仙补足。
    const repeat = settleRun(restored, { ...victory, spiritRoot: root });
    assert.equal(repeat.ascensionCultivation, 0);
    assert.equal(restored.cultivation, once + repeat.cultivation);
    assert.equal(
      restored.chronicle.entries.filter((e) => e.title === '七劫登仙').length,
      result.ascensionCultivation > 0 ? 1 : 0,
    );
  }
});

test('更新版本存档只读，旧版本档不可读', () => {
  const save = freshSave('none');
  save.cultivation = 1000;
  save.completed = [0, 1, 2, 3, 4, 5, 6];
  save.schema = SAVE_SCHEMA + 1;
  const newer = readSave(JSON.stringify(save));
  assert.equal(newer.status, 'newer');
  assert.equal(newer.save.cultivation, 1000);
  assert.throws(() => importSave(JSON.stringify(save)), /更新的版本/);
  const older = freshSave('none');
  older.schema = SAVE_SCHEMA - 1;
  assert.equal(readSave(JSON.stringify(older)).status, 'unreadable');
  assert.equal(parseSave(JSON.stringify(freshSave('none'))).cultivation, 0);
});
