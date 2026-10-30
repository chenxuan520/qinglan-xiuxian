import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MEDICINES,
  freshMedicine,
  medicineInfo,
  medicineLoot,
  townMedicineReward,
  validMedicine,
} from '../src/medicine-data.ts';

const permanentIds = ['butian', 'huiyang', 'peiying', 'jiuqu'];

function bossLoot(stage: number, roll: number, pick = 0, first = false, sovereign = false) {
  const state = freshMedicine(() => 0);
  let draws = 0;
  const rewards = medicineLoot(state, stage, first, sovereign, () => (draws++ ? pick : roll));
  assert.equal(validMedicine(state), true);
  return { state, rewards };
}

test('第一至第六境妖王4%本世珍品边界明确，只有首通保底可额外掉落限时珍品', () => {
  for (let stage = 0; stage <= 5; stage++) {
    for (const roll of [0, 0.039, 0.039999999]) {
      const { state, rewards } = bossLoot(stage, roll);
      assert.deepEqual(state.bag, { butian: 1 }, `stage=${stage}, roll=${roll}`);
      assert.equal(rewards.length, 1, '未触发首通时不同时掉灵品或限时珍品');
    }
    for (const roll of [0.04, 0.041]) {
      const { state, rewards } = bossLoot(stage, roll);
      assert.equal(rewards.length, 1);
      assert.ok(Object.keys(state.bag).every((id) => medicineInfo(id)!.years > 0));
    }
    assert.deepEqual(bossLoot(stage, 0.999999).state.bag, {}, '没有额外保底');
  }
});

test('前四境本世珍品池不受出场关卡限制，四种均可等概率抽到', () => {
  for (let stage = 0; stage <= 3; stage++)
    for (const [index, id] of permanentIds.entries()) {
      const pick = (index + 0.5) / permanentIds.length;
      assert.deepEqual(bossLoot(stage, 0.039, pick).state.bag, { [id]: 1 });
    }
});

test('本世珍品4%并不改变灵品和限时珍品池的关卡过滤或原分支边界', () => {
  for (let stage = 0; stage <= 6; stage++) {
    const spiritualRoll = stage < 2 ? 0.349999999 : 0.509999999;
    for (const pick of [0, 0.25, 0.5, 0.75, 0.999999]) {
      const spiritual = bossLoot(stage, spiritualRoll, pick).state;
      assert.equal(Object.keys(spiritual.bag).length, 1);
      for (const id of Object.keys(spiritual.bag)) {
        const medicine = medicineInfo(id)!;
        assert.equal(medicine.tier, '灵品');
        assert.ok(medicine.years > 0 && medicine.stage <= Math.max(1, stage));
      }
      if (stage < 2) continue;
      const timed = bossLoot(stage, 0.159999999, pick).state;
      assert.equal(Object.keys(timed.bag).length, 1);
      for (const id of Object.keys(timed.bag)) {
        const medicine = medicineInfo(id)!;
        assert.equal(medicine.tier, '珍品');
        assert.ok(medicine.years > 0 && medicine.stage <= stage);
      }
      const boundary = Object.keys(bossLoot(stage, 0.16, pick).state.bag)[0];
      assert.equal(medicineInfo(boundary)!.tier, '灵品');
    }
    assert.deepEqual(bossLoot(stage, stage < 2 ? 0.35 : 0.51).state.bag, {});
  }
});

test('第三至第七境首次通关仍仅保底一枚限时珍品，与本世珍品分开且不重复保底', () => {
  for (let stage = 0; stage <= 6; stage++) {
    const ordinary = bossLoot(stage, 0.9, 0.999999, true);
    assert.deepEqual(ordinary.state.firstClears, stage >= 2 ? [stage] : []);
    assert.equal(ordinary.rewards.length, stage >= 2 ? 1 : 0);
    for (const id of Object.keys(ordinary.state.bag)) {
      assert.equal(medicineInfo(id)!.tier, '珍品');
      assert.ok(medicineInfo(id)!.years > 0);
      assert.ok(medicineInfo(id)!.stage <= stage);
    }
    const before = structuredClone(ordinary.state.bag);
    assert.deepEqual(
      medicineLoot(ordinary.state, stage, true, false, () => 0.9),
      [],
    );
    assert.deepEqual(ordinary.state.bag, before);
    if (stage > 5) continue;
    const rareFirst = bossLoot(stage, 0.039, 0, true);
    assert.equal(rareFirst.state.bag.butian, 1);
    assert.equal(rareFirst.rewards.length, stage >= 2 ? 2 : 1);
    assert.equal(
      Object.entries(rareFirst.state.bag)
        .filter(([id]) => medicineInfo(id)!.years > 0)
        .reduce((sum, [, n]) => sum + n, 0),
      stage >= 2 ? 1 : 0,
    );
  }
});

test('终关六位旧王仍不掉本世珍品，最后仙尊每次必掉且四种均可出现', () => {
  for (let oldKing = 0; oldKing < 6; oldKing++)
    for (const roll of [0, 0.039, 0.04, 0.5, 0.999999]) {
      const { state } = bossLoot(6, roll, (oldKing + 0.5) / 6);
      assert.ok(Object.keys(state.bag).every((id) => medicineInfo(id)!.years > 0));
    }
  for (const [index, id] of permanentIds.entries())
    for (const roll of [0, 0.039, 0.5, 0.999999]) {
      const pick = (index + 0.5) / permanentIds.length;
      assert.deepEqual(bossLoot(6, roll, pick, false, true).state.bag, { [id]: 1 });
      const first = bossLoot(6, roll, pick, true, true);
      assert.equal(first.state.bag[id], 1);
      assert.equal(first.rewards.length, 2, '仙尊首通的限时保底仍另外领取');
    }
});

test('垂钓单次抽取0.5%限时珍品、额外5%灵品，两者互斥且没有本世珍品', () => {
  for (const [roll, expectedTier] of [
    [0, '珍品'],
    [0.004999999, '珍品'],
    [0.005, '灵品'],
    [0.049999999, '灵品'],
    [0.05, '灵品'],
    [0.054999999, '灵品'],
    [0.055, null],
    [0.999999, null],
  ] as const) {
    const state = freshMedicine(() => 0);
    let draws = 0;
    const reward = townMedicineReward(state, 'fishing', () => (draws++ ? 0.5 : roll));
    const ids = Object.keys(state.bag);
    assert.equal(ids.length, expectedTier ? 1 : 0, String(roll));
    assert.equal(draws, expectedTier ? 2 : 1, '一次概率判定，命中后才抽取一种丹药');
    assert.equal(validMedicine(state), true);
    if (!expectedTier) {
      assert.equal(reward, '');
      continue;
    }
    const medicine = medicineInfo(ids[0])!;
    assert.equal(medicine.tier, expectedTier);
    assert.ok(medicine.years > 0);
    assert.equal(state.bag[medicine.id], 1);
    assert.equal(reward, `${medicine.name} ×1`);
  }
});

test('垂钓的两种池涵盖全部限时同品丹药，不受秘境关卡限制', () => {
  for (const [roll, tier] of [
    [0.001, '珍品'],
    [0.03, '灵品'],
  ] as const) {
    const pool = MEDICINES.filter((m) => m.tier === tier && m.years > 0);
    assert.equal(pool.length, 8);
    for (const [index, medicine] of pool.entries()) {
      const state = freshMedicine(() => 0);
      let draws = 0;
      const pick = (index + 0.5) / pool.length;
      const reward = townMedicineReward(state, 'fishing', () => (draws++ ? pick : roll));
      assert.deepEqual(state.bag, { [medicine.id]: 1 });
      assert.equal(reward, `${medicine.name} ×1`);
    }
  }
});

test('采药10%、听书2%凡品额外奖励保持原样，其他打工不掉药', () => {
  for (const [kind, threshold] of [
    ['herbs', 0.1],
    ['tea', 0.02],
  ] as const)
    for (const roll of [0, threshold - 1e-9, threshold]) {
      const state = freshMedicine(() => 0);
      let draws = 0;
      const reward = townMedicineReward(state, kind, () => (draws++ ? 0.999999 : roll));
      if (roll < threshold) {
        assert.deepEqual(state.bag, { chousui: 1 });
        assert.equal(reward, '抽髓丸 ×1');
      } else {
        assert.deepEqual(state.bag, {});
        assert.equal(reward, '');
      }
    }
  for (const kind of ['escort', 'repair', 'study', 'unknown']) {
    const state = freshMedicine(() => 0);
    assert.equal(
      townMedicineReward(state, kind, () => assert.fail('不应抽取额外掉落')),
      '',
    );
    assert.deepEqual(state.bag, {});
  }
});

test('垂钓赠丹不写出非法药囊，满量药不入候选、同阶全满则不赠丹', () => {
  const state = freshMedicine(() => 0);
  const timed = MEDICINES.filter((m) => m.tier === '珍品' && m.years > 0);
  for (const m of timed) state.bag[m.id] = Number.MAX_SAFE_INTEGER;
  const before = structuredClone(state);
  assert.equal(
    townMedicineReward(state, 'fishing', () => 0),
    '',
  );
  assert.deepEqual(state, before);
  assert.equal(validMedicine(state), true);
  state.bag[timed.at(-1)!.id]--;
  assert.ok(townMedicineReward(state, 'fishing', () => 0));
  assert.equal(state.bag[timed.at(-1)!.id], Number.MAX_SAFE_INTEGER);
  assert.equal(validMedicine(state), true);
});
