import { enterNextMarketBatch } from './market-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { FINAL_TRIAL_STAGE } from '../src/data.ts';
import { IMMORTAL_CULTIVATION, SAVE_SCHEMA, freshSave, readSave } from '../src/progress.ts';
import { importSave, exportSave } from '../src/save-transfer.ts';
import { meetMarketFellow } from '../src/market-fellow.ts';

function legacySave() {
  const save = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  save.schema = 15;
  save.age = 45;
  save.cultivation = 12345;
  save.stones = 4321;
  save.iron = 91;
  save.runs = 12;
  save.bestKills = 345;
  save.prologueSeen = save.hometownSeen = true;
  save.mortal.hometown!.stage = 'departed';
  save.mortal.population = { seed: 12345, since: 15 };
  save.mortal.member = { id: 'power', dueAt: 200, dues: 50 };
  save.mortal.mastery.power = 1;
  enterNextMarketBatch(save);
  return save;
}

test('15版未通终关的旧档升级与文件导入不补造成仙记录或修为', () => {
  for (const completed of [[], [0, 1, 2, 3, 4, 5]]) {
    for (const cultivation of [0, 12345, IMMORTAL_CULTIVATION]) {
      const old = legacySave();
      old.completed = completed;
      old.unlocked = completed.length;
      old.cultivation = cultivation;
      const raw = JSON.stringify(old);
      const read = readSave(raw);
      assert.equal(read.status, 'ok');
      for (const upgraded of [read.save, importSave(raw).save]) {
        assert.equal(upgraded.schema, SAVE_SCHEMA);
        assert.equal(upgraded.cultivation, cultivation);
        assert.deepEqual(upgraded.completed, old.completed);
        assert.equal(Object.hasOwn(upgraded.chronicle.milestones, 'realm-24'), false);
        assert.equal(
          upgraded.chronicle.entries.some((entry) => entry.title === '通关成仙补录'),
          false,
        );
        assert.deepEqual(upgraded.chronicle, old.chronicle);
        assert.equal(upgraded.mortal.marketFellow, undefined);
        assert.deepEqual(upgraded.mortal.sectMarket, old.mortal.sectMarket);
      }
      assert.equal(JSON.stringify(old), raw);
    }
  }
});

test('15版已通终关的旧档仅补足真实修为缺口，保留原成仙年龄且往返不重复', () => {
  for (const recordedAge of [null, 42]) {
    const old = legacySave();
    old.completed = [0, 1, 2, 3, 4, 5, FINAL_TRIAL_STAGE];
    old.unlocked = FINAL_TRIAL_STAGE;
    old.cultivation = IMMORTAL_CULTIVATION - 17;
    if (recordedAge !== null) old.chronicle.milestones['realm-24'] = recordedAge;
    const raw = JSON.stringify(old);
    const read = readSave(raw);
    assert.equal(read.status, 'ok');
    for (const upgraded of [read.save, importSave(raw).save]) {
      assert.equal(upgraded.cultivation, IMMORTAL_CULTIVATION);
      assert.equal(upgraded.chronicle.milestones['realm-24'], recordedAge);
      const records = upgraded.chronicle.entries.filter((entry) => entry.title === '通关成仙补录');
      assert.equal(records.length, 1);
      assert.match(records[0].detail, /补足成仙修为 17/);
      for (const key of ['age', 'stones', 'iron', 'runs', 'bestKills'] as const)
        assert.equal(upgraded[key], old[key]);
      assert.equal(upgraded.mortal.marketFellow, undefined);
      const again = importSave(exportSave(upgraded, null)).save;
      assert.equal(again.cultivation, IMMORTAL_CULTIVATION);
      assert.deepEqual(again.chronicle, upgraded.chronicle);
      assert.deepEqual(readSave(JSON.stringify(again)).save.chronicle, upgraded.chronicle);
    }
  }
});

test('15版已通关且修为足够时不追加补录，超额修为完整保留', () => {
  for (const cultivation of [IMMORTAL_CULTIVATION, IMMORTAL_CULTIVATION + 500]) {
    const old = legacySave();
    old.completed = [0, 1, 2, 3, 4, 5, FINAL_TRIAL_STAGE];
    old.unlocked = FINAL_TRIAL_STAGE;
    old.cultivation = cultivation;
    old.chronicle.milestones['realm-24'] = 42;
    const upgraded = importSave(JSON.stringify(old)).save;
    assert.equal(upgraded.cultivation, cultivation);
    assert.deepEqual(upgraded.chronicle, old.chronicle);
  }
});

test('15版旧档不追补同道相识，升级后正常初逢并随16版导入导出保留', () => {
  const old = legacySave();
  const upgraded = importSave(JSON.stringify(old)).save;
  assert.equal(upgraded.mortal.marketFellow, undefined);
  assert.ok(meetMarketFellow(upgraded));
  assert.equal(upgraded.mortal.marketFellow!.metAt, old.age);
  assert.equal(upgraded.mortal.marketFellow!.reunionAt, null);
  const imported = importSave(exportSave(upgraded, null)).save;
  assert.deepEqual(imported.mortal.marketFellow, upgraded.mortal.marketFellow);
  assert.deepEqual(imported.mortal.member, upgraded.mortal.member);
  assert.deepEqual(imported.mortal.mastery, upgraded.mortal.mastery);
  assert.deepEqual(imported.chronicle, upgraded.chronicle);
  assert.equal(meetMarketFellow(imported), false);
});
