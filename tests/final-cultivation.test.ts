import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { SPIRIT_ROOTS, STAGE_ENEMIES, STAGE_CULTIVATION_RATES, DIFFICULTIES } from '../src/data.ts';
import { freshSave, parseSave, settleRun } from '../src/progress.ts';
import { useMedicine } from '../src/medicine.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';

function fixture(stage = 6, version = 3, root = 'heaven', difficulty = 0, medicine = false) {
  const save = freshSave(root, ['metal'], 'orthodox', () => 0.5);
  save.unlocked = 6;
  save.medicine.recipeSeed = 41;
  // 固定在大乘后期，避免不同奖励触发突破后改变敌人和掉落对照。
  save.cultivation = 1e6;
  if (medicine) {
    for (const id of ['xuling', 'zengyuan']) {
      save.medicine.bag[id] = 1;
      assert.equal(useMedicine(save, id).ok, true);
    }
  }
  const g = new Game(save, stage, difficulty, () => 0.5);
  g.progressionVersion = version;
  return g;
}
function kill(g: Game, type: number, elite = true, bossStage?: number) {
  const e = g.spawnEnemy(type, elite, bossStage !== undefined, { x: 500, y: 0 }, bossStage);
  g.hitEnemy(e, e.maxHp, false, 'sword');
  return e;
}
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test('终关全部妖物及召唤物永久修为降到四分之一，药效、灵根与难度按原规则相乘', () => {
  for (const root of SPIRIT_ROOTS)
    for (const difficulty of [0, 1, 2])
      for (const medicine of [false, true]) {
        const old = fixture(6, 2, root.id, difficulty, medicine);
        const now = fixture(6, 3, root.id, difficulty, medicine);
        // 遍历所有地区兵种，包含复临妖王召唤的早期兵种。
        for (const type of new Set(STAGE_ENEMIES.flat())) {
          assert.deepEqual(kill(now, type), kill(old, type));
          const base = now.kills * 0.7 * STAGE_CULTIVATION_RATES[6];
          close(now.combatCultivation + base, (old.combatCultivation + base) / 4);
          assert.deepEqual(now.pickups, old.pickups);
          assert.deepEqual(now.loot, old.loot);
          assert.equal(now.xp, old.xp);
          assert.equal(now.level, old.level);
          const expected = Math.floor(
            (now.level * 8 * STAGE_CULTIVATION_RATES[6] + (old.combatCultivation + base) / 4) *
              root.rate *
              DIFFICULTIES[difficulty].reward,
          );
          // 不同求和顺序在整数边界可能相差 1；未取整奖励已严格比较。
          assert.ok(Math.abs(now.creditedCultivation - expected) <= 1);
        }
      }
});

test('前六境普通怪与精英奖励、终关七王奖励及丹药掉落不受削减', () => {
  for (const medicine of [false, true]) {
    for (let stage = 0; stage < 6; stage++) {
      const old = fixture(stage, 2, 'triple', 1, medicine);
      const now = fixture(stage, 3, 'triple', 1, medicine);
      for (const elite of [false, true])
        for (const type of STAGE_ENEMIES[stage]) {
          kill(old, type, elite);
          kill(now, type, elite);
        }
      assert.equal(now.creditedCultivation, old.creditedCultivation);
      assert.deepEqual(now.pickups, old.pickups);
    }
    const old = fixture(6, 2, 'five', 2, medicine);
    const now = fixture(6, 3, 'five', 2, medicine);
    for (let boss = 0; boss < 7; boss++) {
      kill(old, 10, false, boss);
      kill(now, 10, false, boss);
      assert.equal(now.bossCultivation, old.bossCultivation);
      assert.equal(now.creditedCultivation, old.creditedCultivation);
      assert.deepEqual(now.save.medicine, old.save.medicine);
      assert.deepEqual(now.loot, old.loot);
      assert.equal(now.xp, old.xp);
      assert.equal(now.level, old.level);
    }
  }
});

test('终关同种妖物仍比第六境普通怪多给修为，精英属性及局内经验保留', () => {
  const early = fixture(5),
    late = fixture(6);
  const a = kill(early, 0, false),
    b = kill(late, 0);
  const earlyReward = early.combatCultivation + 0.7 * STAGE_CULTIVATION_RATES[5];
  const lateReward = late.combatCultivation + 0.7 * STAGE_CULTIVATION_RATES[6];
  close(lateReward / earlyReward, 1.38);
  assert.ok(b.maxHp > a.maxHp);
  assert.ok(
    late.pickups.find((p) => p.kind === 'xp')!.value >
      early.pickups.find((p) => p.kind === 'xp')!.value * 8,
  );
});

test('旧版续局保留已入账及后续奖励，新局使用第四版，导入续局与失败结算不重复入账', () => {
  for (const version of [2, 3]) {
    const g = fixture(6, version);
    for (const type of STAGE_ENEMIES[6]) kill(g, type);
    const before = g.save.cultivation;
    const copiedSave = parseSave(JSON.stringify(g.save));
    const restored = Game.restore(copiedSave, JSON.parse(JSON.stringify(g.snapshot())))!;
    assert.ok(restored);
    assert.equal(restored.progressionVersion, version);
    assert.equal(restored.save.cultivation, before);
    const imported = importSave(exportSave(restored.save, restored));
    assert.ok(imported.run);
    assert.equal(imported.run.progressionVersion, version);
    assert.equal(imported.save.cultivation, before);
    for (const candidate of [g, restored, imported.run]) kill(candidate, STAGE_ENEMIES[6][0]);
    assert.equal(restored.save.cultivation, g.save.cultivation);
    assert.equal(imported.save.cultivation, g.save.cultivation);
    for (const candidate of [restored, imported.run]) {
      const earned = candidate.save.cultivation;
      const result = settleRun(candidate.save, { ...candidate.snapshot(), victory: false });
      assert.equal(result.cultivationRemaining, 0);
      assert.equal(candidate.save.cultivation, earned);
    }
    assert.equal(new Game(g.save, 6, 0).progressionVersion, 4);
  }
});
