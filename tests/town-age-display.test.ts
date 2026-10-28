import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSave, lifespanInfo } from '../src/progress.ts';
import { mortalStatus, townPage, townStatus, townEventContent } from '../src/mortal-ui.ts';
import { sectMarketPage } from '../src/sect-market-page.ts';
import { advanceMortal, startActivity } from '../src/mortal.ts';
import { freshTownPopulation, townResidents } from '../src/town-population.ts';

test('镇坊闲逛年岁只在跨整年时变化，离场入口保留两位小数，不修改存档', () => {
  const save = freshSave();
  save.prologueSeen = true;
  save.mortal.hometown!.stage = 'departed';
  save.age = 50.8;
  const before = structuredClone(save);
  const status = townStatus(save);
  assert.match(status, /年岁 50 <em>\/ 100<\/em>/);
  assert.doesNotMatch(status, /50\.80|余寿/);
  assert.ok(townPage(save, '').includes(status));
  assert.ok(sectMarketPage(save, '').includes(status));
  assert.match(mortalStatus(save), /50\.80 <em>\/ 100/);
  assert.deepEqual(save, before);
  save.age = 50.999;
  assert.equal(townStatus(save), status);
  save.age = 51;
  assert.match(townStatus(save), /年岁 51 <em>/);
});

test('不足一年余寿保留精确年龄与余寿，极小正余寿不误写为零', () => {
  const save = freshSave();
  for (const [bonus, age, expectedAge, expectedRemaining] of [
    [0, 99, '99', null],
    [0, 99.6, '99.60', '0.40'],
    [30, 129.6, '129.60', '0.40'],
    [0, 99.999, '100.00', '不足 0.01'],
    [0, 100, '100.00', '0.00'],
  ] as const) {
    save.lifespanBonus = bonus;
    save.age = age;
    const before = structuredClone(save);
    const status = townStatus(save);
    assert.ok(status.includes(`年岁 ${expectedAge} <em>`), status);
    if (expectedRemaining === null) assert.doesNotMatch(status, /余寿/);
    else assert.ok(status.includes(`余寿 ${expectedRemaining} 年`), status);
    assert.deepEqual(save, before);
  }
  save.cultivation = 1e9;
  save.age = 12345678.9;
  assert.match(townStatus(save), /年岁 12345678 <em>\/ 长生/);
  assert.doesNotMatch(townStatus(save), /余寿|Infinity|NaN|12,345/);
});

test('实际闲逛与办事仍按完整精度扣龄，展示不改变供奉、寿元或记录', () => {
  const save = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  save.prologueSeen = save.hometownSeen = true;
  save.mortal.hometown!.stage = 'departed';
  save.age = 50.98;
  advanceMortal(save, 0.6);
  assert.ok(Math.abs(save.age - 50.99) < 1e-9);
  assert.match(townStatus(save), /年岁 50 <em>/);
  advanceMortal(save, 1.2);
  assert.ok(Math.abs(save.age - 51.01) < 1e-9);
  assert.match(townStatus(save), /年岁 51 <em>/);
  const before = save.age;
  assert.equal(startActivity(save, 'herbs'), true);
  assert.ok(Math.abs(save.age - before - 1) < 1e-9);
  assert.match(mortalStatus(save), /52\.01 <em>/);
  save.mortal.population = freshTownPopulation(save.age, () => 0.5);
  const herbalist = townResidents(save.mortal.population, save.age).find(
    (npc) => npc.id === 'herbs',
  )!;
  assert.match(townEventContent(save, herbalist), /消耗 1 年/);
  save.age = 99.99;
  advanceMortal(save, 60);
  assert.equal(lifespanInfo(save).remaining, 0);
  assert.equal(save.age, 100);
});
