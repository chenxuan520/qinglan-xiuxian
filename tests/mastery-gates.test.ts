import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSave, parseSave, realmCost } from '../src/progress.ts';
import {
  advanceMortal,
  joinSect,
  masteryBonus,
  startActivity,
  resolveActivity,
  studyPlan,
} from '../src/mortal.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';
import { Game } from '../src/game.ts';

const cultivationAt = (step: number) =>
  Array.from({ length: step }, (_, i) => realmCost(i)).reduce((sum, value) => sum + value, 0);

test('十阶精研逐级检查境界，修为差一点也不能扣费或开始，达标后正常完成', () => {
  const steps = [2, 3, 6, 9, 12, 15, 18, 21, 23, 24];
  for (const [index, step] of steps.entries()) {
    const s = freshSave();
    s.stones = 10000;
    s.cultivation = cultivationAt(step) - 1;
    if (step === 24) s.completed = [6];
    joinSect(s, 'power');
    s.mortal.mastery.power = index;
    const before = JSON.stringify(s);
    assert.equal(studyPlan(s).eligible, false);
    assert.equal(startActivity(s, 'study'), false);
    assert.equal(JSON.stringify(s), before);
    s.cultivation++;
    const plan = studyPlan(s);
    assert.equal(plan.eligible, true);
    const stones = s.stones;
    assert.equal(startActivity(s, 'study'), true);
    assert.equal(s.stones, stones - plan.stones);
    assert.equal(s.cultivation, cultivationAt(step));
    assert.equal(s.age, 15 + plan.years);
    assert.equal(s.mortal.activity, null);
    assert.equal(s.mortal.mastery.power, index + 1);
    assert.equal(startActivity(s, 'study'), false);
  }
});

test('第七境未通关时超额修为也不能开启十阶精研', () => {
  const s = freshSave();
  s.stones = 10000;
  s.cultivation = 1e9;
  joinSect(s, 'power');
  s.mortal.mastery.power = 9;
  assert.equal(studyPlan(s).requiredRealm, '真仙');
  assert.equal(startActivity(s, 'study'), false);
  s.completed = [6];
  assert.equal(startActivity(s, 'study'), true);
});

test('旧高阶成果保留但按境界限制实际加成，突破恢复；导入和续局不能绕过', () => {
  const s = freshSave();
  s.stones = 10000;
  joinSect(s, 'power');
  s.mortal.mastery.power = 10;
  for (const restored of [parseSave(JSON.stringify(s)), importSave(exportSave(s, null)).save]) {
    assert.equal(restored.mortal.mastery.power, 10);
    assert.equal(masteryBonus(restored, 'power'), 0);
    const g = new Game(restored, 0, 0);
    assert.equal(g.passives.power, 1);
    assert.equal(g.stats.damage, 1.12);
    assert.equal(Game.restore(restored, g.snapshot())!.stats.damage, 1.12);
    restored.cultivation = cultivationAt(6);
    assert.equal(masteryBonus(restored, 'power'), 0.09);
    restored.cultivation = cultivationAt(24);
    assert.equal(masteryBonus(restored, 'power'), 0.27);
    restored.completed = [6];
    assert.equal(masteryBonus(restored, 'power'), 0.3);
    assert.equal(restored.mortal.mastery.power, 10);
  }
});

test('旧档未达门槛的进行中研习暂停，入城仍计龄，突破后立即结算剩余年岁且不再收费', () => {
  const s = freshSave();
  s.stones = 10000;
  s.cultivation = cultivationAt(2);
  joinSect(s, 'power');
  s.mortal.mastery.power = 1;
  s.mortal.activity = { kind: 'study', remaining: 0.5, total: 1.4, sect: 'power' };
  const restored = importSave(exportSave(s, null)).save;
  const stones = restored.stones;
  advanceMortal(restored, 60);
  assert.equal(restored.mortal.activity?.remaining, 0.5);
  assert.equal(restored.mortal.mastery.power, 1);
  assert.equal(restored.age, s.age + 1);
  restored.cultivation = cultivationAt(3);
  assert.equal(resolveActivity(restored), true);
  assert.equal(restored.age, s.age + 1.5);
  assert.equal(restored.mortal.activity, null);
  assert.equal(restored.mortal.mastery.power, 2);
  assert.equal(restored.stones, stones);
});

test('新角色、随机灵根和轮回起始十五岁，已有年岁与导入进度保留', () => {
  assert.equal(freshSave().age, 15);
  assert.equal(parseSave(null).age, 15);
  assert.equal(importSave(exportSave(freshSave(), null)).save.age, 15);
  for (const age of [0, 12.5, 99, 10000])
    assert.equal(parseSave(JSON.stringify({ ...freshSave(), age })).age, age);
  assert.equal(parseSave(JSON.stringify({ ...freshSave(), age: undefined })).age, 15);
});
