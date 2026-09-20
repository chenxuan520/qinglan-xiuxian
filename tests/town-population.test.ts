import test from 'node:test';
import assert from 'node:assert/strict';
import { freshTownPopulation, townResidents } from '../src/town-population.ts';
import { freshSave, parseSave, retreat } from '../src/progress.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';
import { advanceMortal } from '../src/mortal.ts';
import { Game } from '../src/game.ts';

test('二十一位凡人有稳定且不重名的中文姓名，换代时身份、姓名和配色一同更替', () => {
  for (let seed = 0; seed < 30; seed++) {
    const population = { seed, since: 15 };
    let previous = townResidents(population, 15);
    assert.equal(previous.length, 21);
    for (let round = 0; round < 100; round++) {
      const age = Math.min(...previous.map((npc) => npc.leavesAt));
      const before = townResidents(population, age - 0.001);
      const after = townResidents(population, age);
      assert.equal(new Set(after.map((npc) => npc.name)).size, 21);
      after.forEach((npc, index) => {
        assert.match(npc.name, /^[\u4e00-\u9fff]{3}$/);
        assert.ok(npc.leavesAt - npc.arrivedAt >= 50);
        assert.ok(npc.leavesAt - npc.arrivedAt <= 70);
        assert.ok(npc.arrivedAt <= age && npc.leavesAt > age);
        if (before[index].leavesAt === age) {
          assert.equal(npc.generation, before[index].generation + 1);
          assert.notEqual(npc.name, before[index].name);
          assert.notEqual(npc.tint, before[index].tint);
          assert.equal(npc.role, before[index].role);
          assert.equal(npc.art, before[index].art);
        } else assert.deepEqual(npc, before[index]);
      });
      assert.deepEqual(townResidents(population, age), after);
      previous = after;
    }
  }
});

test('姓名和换代节点随存档保留，旧档可首次初始化，坏人口数据拒绝导入', () => {
  const save = freshSave();
  assert.equal(save.mortal.population, undefined);
  save.mortal.population = freshTownPopulation(save.age, () => 0.25);
  save.age += 123.5;
  const expected = townResidents(save.mortal.population, save.age);
  for (const restored of [
    parseSave(JSON.stringify(save)),
    importSave(exportSave(save, null)).save,
  ]) {
    assert.deepEqual(restored.mortal.population, save.mortal.population);
    assert.deepEqual(townResidents(restored.mortal.population!, restored.age), expected);
  }
  for (const population of [
    null,
    { seed: -1, since: 15 },
    { seed: 1.2, since: 15 },
    { seed: 2 ** 32, since: 15 },
    { seed: 1, since: -1 },
    { seed: 1, since: '15' },
  ])
    assert.throws(() =>
      importSave(JSON.stringify({ ...save, mortal: { ...save.mortal, population } })),
    );
  delete save.mortal.population;
  assert.equal(importSave(exportSave(save, null)).save.mortal.population, undefined);
  assert.notDeepEqual(
    freshTownPopulation(15, () => 0.25),
    freshTownPopulation(15, () => 0.75),
  );
});

test('换代使用角色总年岁，历练、闭关和城镇均推进，暂停不变', () => {
  const save = freshSave();
  save.cultivation = 1e9;
  save.completed = [0, 1, 2, 3, 4, 5, 6];
  save.unlocked = 6;
  const population = (save.mortal.population = freshTownPopulation(15, () => 0.5));
  const first = townResidents(population, save.age)[0];
  save.age = first.leavesAt - 0.1;
  const game = new Game(save, 6, 0, () => 0.5);
  game.update(0.05);
  assert.equal(townResidents(population, save.age)[0].generation, 1);
  assert.equal(save.mortal.years, 0);
  game.pause();
  const paused = townResidents(population, save.age);
  game.update(1);
  assert.deepEqual(townResidents(population, save.age), paused);
  assert.ok(retreat(save, 6000));
  const later = townResidents(population, save.age)[0];
  assert.ok(later.generation > 90);
  assert.equal(save.mortal.years, 0);
  save.age = later.leavesAt - 0.5;
  advanceMortal(save, 30);
  assert.equal(townResidents(population, save.age)[0].generation, later.generation + 1);
});

test('久别后直接定位当代镇民，跨越极长年岁无需逐代循环', () => {
  const population = freshTownPopulation(15, () => 0.5);
  for (const age of [1e6, 1e9, 1e12]) {
    const residents = townResidents(population, age);
    assert.equal(new Set(residents.map((npc) => npc.name)).size, 21);
    for (const npc of residents) {
      assert.ok(npc.arrivedAt <= age && npc.leavesAt > age);
      assert.ok(npc.leavesAt - npc.arrivedAt >= 50 && npc.leavesAt - npc.arrivedAt <= 70);
    }
  }
});

test('小数年岁的换代边界准确，同一人物不会在边界反复出现', () => {
  for (let seed = 0; seed < 100; seed++) {
    const population = { seed, since: 15 + seed * 0.013333333333 };
    for (const first of townResidents(population, population.since)) {
      const at = townResidents(population, first.leavesAt).find((npc) => npc.id === first.id)!;
      const before = townResidents(population, first.leavesAt - 0.00001).find(
        (npc) => npc.id === first.id,
      )!;
      assert.equal(before.generation, 0);
      assert.equal(at.generation, 1);
      assert.ok(at.leavesAt > first.leavesAt);
    }
  }
});
