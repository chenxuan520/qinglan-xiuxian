import test from 'node:test';
import assert from 'node:assert/strict';
import { freshMedicine, medicineLoot, grantMedicine, validMedicine } from '../src/medicine-data.ts';
import { freshSave, parseSave, SAVE_SCHEMA } from '../src/progress.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';
import { inspectSaveIntegrity, sealSaveSnapshot } from '../src/leaderboard-integrity.ts';
import { Game } from '../src/game.ts';

test('前六境各自按成功掉落递减4%→2%→1%，失败不递减且长期保持1%下限', () => {
  for (let stage = 0; stage < 6; stage++) {
    const state = freshMedicine(() => 0);
    for (let drop = 0; drop < 5; drop++) {
      const chance = drop === 0 ? 0.04 : drop === 1 ? 0.02 : 0.01;
      for (const roll of [chance, chance + 1e-9, 0.9]) {
        const before = [...state.permanentDrops];
        medicineLoot(state, stage, false, false, () => roll);
        assert.equal(state.bag.butian ?? 0, drop);
        assert.deepEqual(state.permanentDrops, before);
      }
      let draws = 0;
      medicineLoot(state, stage, false, false, () => (draws++ ? 0 : chance - 1e-9));
      assert.equal(draws, 2, '仍只判定一次概率，再抽具体丹药');
      assert.equal(state.bag.butian, drop + 1);
      assert.deepEqual(
        state.permanentDrops,
        Array.from({ length: 6 }, (_, i) => (i === stage ? Math.min(2, drop + 1) : 0)),
      );
      assert.equal(validMedicine(state), true);
    }
  }
});

test('每境独立；终关旧王、仙尊、其他来源、服用与售出均不改变前六境掉率', () => {
  const state = freshMedicine(() => 0);
  medicineLoot(state, 2, true, false, () => 0);
  assert.deepEqual(state.permanentDrops, [0, 0, 1, 0, 0, 0]);
  // 同关反复给出的首通标志不会重复保底；永久丹失败不会改计数。
  medicineLoot(state, 2, true, false, () => 0.03);
  assert.deepEqual(state.permanentDrops, [0, 0, 1, 0, 0, 0]);
  assert.equal(state.bag.butian, 1);
  medicineLoot(state, 1, false, false, () => 0.03);
  assert.deepEqual(state.permanentDrops, [0, 1, 1, 0, 0, 0]);
  const before = [...state.permanentDrops];
  for (let i = 0; i < 6; i++) medicineLoot(state, 6, false, false, () => 0);
  for (let i = 0; i < 3; i++) medicineLoot(state, 6, false, true, () => 0.9);
  grantMedicine(state, 'butian');
  state.used.peiying = 1;
  state.bag.butian = 0;
  assert.deepEqual(state.permanentDrops, before);
});

test('递减只减少永久丹，不额外发限时丹或改变首通保底', () => {
  for (let stage = 0; stage < 6; stage++) {
    const state = freshMedicine(() => 0);
    state.permanentDrops[stage] = 2;
    for (const roll of [0.01, 0.019999, 0.02, 0.039999]) {
      assert.deepEqual(
        medicineLoot(state, stage, false, false, () => roll),
        [],
      );
      assert.deepEqual(state.bag, {});
    }
    const rewards = medicineLoot(state, stage, true, false, () => 0.03);
    assert.equal(rewards.length, stage >= 2 ? 1 : 0);
    assert.equal(state.permanentDrops[stage], 2);
  }
});

test('递减落空仍保留原永久丹抽取的随机步进，首通限时丹与后续随机数不变', () => {
  for (let stage = 0; stage < 6; stage++) {
    const initial = freshMedicine(() => 0);
    const reduced = structuredClone(initial);
    reduced.permanentDrops[stage] = 2;
    const states = [initial, reduced];
    const remaining = states.map((state) => {
      const values = [0.03, 0.6, 0.8, 0.12345];
      medicineLoot(state, stage, true, false, () => values.shift()!);
      return values;
    });
    assert.deepEqual(remaining[1], remaining[0]);
    assert.deepEqual(
      Object.fromEntries(Object.entries(initial.bag).filter(([id]) => id !== 'peiying')),
      reduced.bag,
      '只减少抽中的培婴丹，首通另一份丹药的种类与数量保持',
    );
    assert.equal(initial.bag.peiying, 1);
    assert.equal(reduced.bag.peiying, undefined);
  }
});

test('妖王真实击杀只递减一次，续局与再挑战沿用该境计数', () => {
  const save = freshSave();
  const game = new Game(save, 0, 0, () => 0);
  game.time = game.stageDuration;
  game.update(0.01);
  const boss = game.boss!;
  game.hitEnemy(boss, 1e20);
  assert.equal(save.medicine.bag.butian, 1);
  assert.deepEqual(save.medicine.permanentDrops, [1, 0, 0, 0, 0, 0]);
  game.hitEnemy(boss, 1e20);
  const nextRun = new Game(save, 0, 0, () => 0.9);
  const imported = importSave(exportSave(save, nextRun));
  assert.ok(imported.run);
  assert.deepEqual(imported.save.medicine.permanentDrops, save.medicine.permanentDrops);
  assert.equal(imported.save.medicine.bag.butian, 1);
  const revisit = new Game(imported.save, 0, 0, () => 0.03);
  revisit.hitEnemy(revisit.spawnEnemy(10, false, true), 1e20);
  assert.equal(imported.save.medicine.bag.butian, 1, '原来4%会掉、现在2%不掉');
  assert.deepEqual(imported.save.medicine.permanentDrops, [1, 0, 0, 0, 0, 0]);
});

test('计数本地读档、导出导入往返保留，不进入道果事实哈希，轮回新世归零', () => {
  const save = freshSave();
  save.medicine.permanentDrops = [2, 1, 0, 1, 2, 0];
  const signed = sealSaveSnapshot(save);
  signed.medicine.permanentDrops[2] = 1;
  assert.equal(inspectSaveIntegrity(signed, 'local'), false);
  assert.deepEqual(parseSave(JSON.stringify(signed)).medicine, signed.medicine);
  const imported = importSave(exportSave(signed, null));
  assert.deepEqual(imported.save.medicine, signed.medicine);
  assert.equal(imported.save.factsTampered, false);
  assert.deepEqual(importSave(exportSave(imported.save, null)).save.medicine, signed.medicine);
  const next = freshSave();
  assert.deepEqual(next.medicine.permanentDrops, [0, 0, 0, 0, 0, 0]);
  next.medicine.permanentDrops[0] = 1;
  assert.equal(freshSave().medicine.permanentDrops[0], 0, '新世计数数组互不共享');
});

test('旧档只补各境零计数，不从其他来源丹药反推历史；非法新字段拒绝导入', () => {
  const legacy = JSON.parse(exportSave(freshSave(), null)).save;
  legacy.schema = SAVE_SCHEMA - 1;
  delete legacy.medicine.permanentDrops;
  legacy.medicine.bag.butian = 10;
  legacy.medicine.used.peiying = 3;
  for (const restored of [
    parseSave(JSON.stringify(legacy)),
    importSave(JSON.stringify(legacy)).save,
  ]) {
    assert.equal(restored.schema, SAVE_SCHEMA);
    assert.deepEqual(restored.medicine.permanentDrops, [0, 0, 0, 0, 0, 0]);
    assert.equal(restored.medicine.bag.butian, 10);
    assert.equal(restored.medicine.used.peiying, 3);
  }
  for (const bad of [
    null,
    {},
    [],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, -1],
    [0, 0, 0, 0, 0, 3],
    [0, 0, 0, 0, 0, 0.5],
    [0, 0, 0, 0, 0, null],
  ]) {
    const raw = freshSave();
    Object.assign(raw.medicine, { permanentDrops: bad });
    assert.equal(validMedicine(raw.medicine), false);
    assert.throws(() => importSave(JSON.stringify(raw)));
  }
  const sparse = freshMedicine();
  sparse.permanentDrops = new Array(6);
  assert.equal(validMedicine(sparse), false);
});
