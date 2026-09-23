import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSave, type SaveData } from '../src/progress.ts';
import { medicineInfo } from '../src/medicine-data.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';
import { meetTownImmortal, visitTownImmortal } from '../src/town-immortal.ts';

const traveller = () => {
  const save = freshSave();
  save.age = 1015;
  save.cultivation = 20000;
  save.mortal.scenery = { lastVisitAge: 15, revision: 0 };
  return save;
};
const rolls =
  (...values: number[]) =>
  () => {
    assert.ok(values.length, '不应多抽随机数');
    return values.shift()!;
  };

test('首次入镇与距上次不足千年不抽，满千年只判定一次且50%出现', () => {
  const save = traveller();
  const noRoll = () => {
    throw new Error('不应抽取');
  };
  visitTownImmortal(save, undefined, noRoll);
  visitTownImmortal(save, 15.01, noRoll);
  assert.equal(save.mortal.immortal, undefined);
  visitTownImmortal(save, 15, rolls(0.4999, 0.5, 0, 0));
  assert.ok(save.mortal.immortal);
  assert.match(save.mortal.immortal.npcId, /^villager-/);
  const encounter = structuredClone(save.mortal.immortal);
  visitTownImmortal(save, 1015, noRoll);
  assert.deepEqual(save.mortal.immortal, encounter);
  save.age += 1000;
  visitTownImmortal(save, 1015, rolls(0.5));
  assert.equal(save.mortal.immortal, null);
});

test('仙人赠药60%限时珍品、40%本世珍品，不受妖王关卡池限制', () => {
  for (const [roll, timed] of [
    [0, true],
    [0.59999, true],
    [0.6, false],
    [0.99999, false],
  ] as const) {
    for (const indexRoll of [0, 0.99999]) {
      const save = traveller();
      visitTownImmortal(save, 15, rolls(0, 0, roll, indexRoll));
      const medicine = medicineInfo(save.mortal.immortal!.medicineId)!;
      assert.equal(medicine.tier, '珍品');
      assert.equal(!!medicine.years, timed);
    }
  }
});

test('交谈才获赠并留下经历，错误镇民、重复交谈和导入重进都不重复领', () => {
  let save: SaveData = traveller();
  visitTownImmortal(save, 15, rolls(0, 0, 0.8, 0));
  const encounter = structuredClone(save.mortal.immortal!);
  assert.deepEqual(save.medicine.bag, {});
  assert.equal(save.chronicle.entries.filter((e) => e.title === '市井逢仙').length, 0);
  assert.equal(meetTownImmortal(save, 'herbs', '王郎中'), false);
  save = importSave(exportSave(save, null)).save;
  assert.deepEqual(save.mortal.immortal, encounter);
  assert.equal(meetTownImmortal(save, encounter.npcId, '沈云归'), true);
  assert.equal(save.medicine.bag[encounter.medicineId], 1);
  const entry = save.chronicle.entries.find((e) => e.title === '市井逢仙')!;
  assert.equal(entry.age, 1015);
  assert.match(entry.detail, /沈云归/);
  assert.match(save.mortal.events[0], /沈云归/);
  save = importSave(exportSave(save, null)).save;
  assert.equal(meetTownImmortal(save, encounter.npcId, '沈云归'), false);
  assert.equal(save.medicine.bag[encounter.medicineId], 1);
  assert.equal(save.chronicle.entries.filter((e) => e.title === '市井逢仙').length, 1);
  assert.equal(save.mortal.events.filter((e) => e.includes('沈云归')).length, 1);
  assert.equal(freshSave().mortal.immortal, undefined);
});

test('奇遇导入校验拒绝错误镇民、丹药、年岁和领奖状态', () => {
  const save = traveller();
  visitTownImmortal(save, 15, rolls(0, 0, 0, 0));
  for (const patch of [
    { npcId: 'herbs' },
    { medicineId: 'huanglong' },
    { appearedAt: 1016 },
    { claimed: 1 },
  ]) {
    const bad = structuredClone(save);
    Object.assign(bad.mortal.immortal!, patch);
    assert.throws(() => importSave(JSON.stringify(bad)));
  }
});
