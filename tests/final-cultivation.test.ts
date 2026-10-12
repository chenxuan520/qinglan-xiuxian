import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { SPIRIT_ROOTS, STAGE_ENEMIES, STAGE_CULTIVATION_RATES, DIFFICULTIES } from '../src/data.ts';
import { freshSave, settleRun } from '../src/progress.ts';
import { useMedicine } from '../src/medicine.ts';

function fixture(stage = 6, root = 'heaven', difficulty = 0, medicine = false) {
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
  return new Game(save, stage, difficulty, () => 0.5);
}
function kill(g: Game, type: number, elite = true, bossStage?: number) {
  const e = g.spawnEnemy(type, elite, bossStage !== undefined, { x: 500, y: 0 }, bossStage);
  g.hitEnemy(e, e.maxHp, false, 'sword');
  return e;
}
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test('终关全部妖物永久修为按普通倍率：精英与普通增益一致，灵根难度药效照常相乘', () => {
  for (const root of SPIRIT_ROOTS)
    for (const difficulty of [0, 1, 2])
      for (const medicine of [false, true]) {
        const now = fixture(6, root.id, difficulty, medicine);
        // 遍历所有地区兵种，包含复临妖王召唤的早期兵种。
        for (const type of new Set(STAGE_ENEMIES.flat())) {
          const base = now.kills * 0.7 * STAGE_CULTIVATION_RATES[6];
          const before = now.combatCultivation;
          kill(now, type, false);
          const normalGain = now.combatCultivation - before;
          const beforeElite = now.combatCultivation;
          kill(now, type, true);
          close(now.combatCultivation - beforeElite, normalGain);
          const expected = Math.floor(
            ((now.kills * 0.7 + now.level * 8) * STAGE_CULTIVATION_RATES[6] +
              now.combatCultivation) *
              root.rate *
              DIFFICULTIES[difficulty].reward,
          );
          // 不同求和顺序在整数边界可能相差 1；未取整奖励已严格比较。
          assert.ok(Math.abs(now.creditedCultivation - expected) <= 1);
        }
      }
});

test('前六境精英永久修为为普通怪的四倍，七王奖励逐王入账', () => {
  for (const medicine of [false, true]) {
    for (let stage = 0; stage < 6; stage++) {
      const g = fixture(stage, 'triple', 1, medicine);
      for (const type of STAGE_ENEMIES[stage]) {
        const before = g.combatCultivation;
        kill(g, type, false);
        const normalGain = g.combatCultivation - before;
        const beforeElite = g.combatCultivation;
        kill(g, type, true);
        if (normalGain > 0) assert.ok(g.combatCultivation - beforeElite > normalGain);
      }
      assert.ok(g.creditedCultivation > 0);
    }
    const now = fixture(6, 'five', 2, medicine);
    for (let boss = 0; boss < 7; boss++) {
      const before = now.bossCultivation;
      kill(now, 10, false, boss);
      assert.ok(now.bossCultivation > before);
    }
    assert.ok(now.bossCultivation > 0);
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

test('断点续局与失败结算不重复入账，已获境界保留', () => {
  const g = fixture(6);
  for (const type of STAGE_ENEMIES[6]) kill(g, type);
  const before = g.save.cultivation;
  const restored = Game.restore(g.save, JSON.parse(JSON.stringify(g.snapshot())))!;
  assert.ok(restored);
  assert.equal(restored.save.cultivation, before);
  for (const candidate of [g, restored]) kill(candidate, STAGE_ENEMIES[6][0]);
  assert.equal(restored.save.cultivation, g.save.cultivation);
  const earned = restored.save.cultivation;
  const result = settleRun(restored.save, { ...restored.snapshot(), victory: false });
  assert.equal(result.cultivationRemaining, 0);
  assert.equal(restored.save.cultivation, earned);
});
