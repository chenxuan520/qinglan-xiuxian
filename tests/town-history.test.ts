import test from 'node:test';
import assert from 'node:assert/strict';
import { townVisit, townLayout, validTownScenery } from '../src/town-history.ts';
import {
  TOWN_BUILDINGS,
  TOWN_NPCS,
  TOWN_PROPS,
  TOWN_START,
  nearbyTownNpc,
  moveInTown,
  townWalkable,
  townNpcPosition,
} from '../src/town.ts';
import { townResidents } from '../src/town-population.ts';
import { freshSave, parseSave } from '../src/progress.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';

test('按上次入城年岁判断百年变迁，短别、重载和千年离别不反复换景', () => {
  const first = townVisit(undefined, 15);
  assert.deepEqual(first, { lastVisitAge: 15, revision: 0 });
  const soon = townVisit(first, 114.9);
  assert.equal(soon.revision, 0);
  assert.equal(townVisit(soon, 115).revision, 0);
  const century = townVisit(first, 115);
  assert.deepEqual(century, { lastVisitAge: 115, revision: 1 });
  assert.deepEqual(townVisit(century, 115), century);
  assert.equal(townVisit(century, 10115).revision, 2);
  assert.equal(first.lastVisitAge, 15);
});

test('城景随存档保留，旧档不强行改城，轮回清除，非法城景拒绝导入', () => {
  const save = freshSave();
  assert.equal(save.mortal.scenery, undefined);
  save.age = 315;
  save.mortal.population = { seed: 12345, since: 15 };
  save.mortal.scenery = { lastVisitAge: 315, revision: 2 };
  for (const restored of [
    parseSave(JSON.stringify(save)),
    importSave(exportSave(save, null)).save,
  ]) {
    assert.deepEqual(restored.mortal.scenery, save.mortal.scenery);
    assert.deepEqual(
      townLayout(restored.mortal.population!.seed, restored.mortal.scenery!.revision),
      townLayout(12345, 2),
    );
  }
  for (const scenery of [
    null,
    { lastVisitAge: -1, revision: 0 },
    { lastVisitAge: 15, revision: -1 },
    { lastVisitAge: 15, revision: 0.5 },
    { lastVisitAge: '15', revision: 1 },
  ]) {
    assert.equal(validTownScenery(scenery), false);
    assert.throws(() =>
      importSave(JSON.stringify({ ...save, mortal: { ...save.mortal, scenery } })),
    );
  }
});

test('旧街完整保留，百年后房舍实际迁位、空院与树木陈设改变，生成结果稳定', () => {
  const original = townLayout(12345, 0);
  assert.deepEqual(original.buildings, TOWN_BUILDINGS);
  assert.deepEqual(original.npcs, TOWN_NPCS);
  assert.deepEqual(original.props, TOWN_PROPS);
  for (const seed of [0, 12345, 0xffffffff]) {
    let previous = original;
    for (let revision = 1; revision <= 12; revision++) {
      const next = townLayout(seed, revision);
      assert.deepEqual(next, townLayout(seed, revision));
      assert.notDeepEqual(next.buildings, previous.buildings);
      assert.equal(next.vacantLots.length, 3);
      assert.equal(next.buildings.length, 25);
      assert.equal(next.npcs.length, 21);
      for (const id of [
        'herbs',
        'tea',
        'escort',
        'market',
        'smith',
        'scholar',
        'farmer',
        'tailor',
      ]) {
        const npc = next.npcs.find((n) => n.id === id)!;
        const old = previous.npcs.find((n) => n.id === id)!;
        assert.notDeepEqual({ x: npc.x, y: npc.y }, { x: old.x, y: old.y });
        assert.ok(next.buildings.some((b) => b.x === npc.x && b.y + 110 === npc.y));
      }
      assert.deepEqual(
        next.npcs.find((n) => n.id === 'fisher'),
        TOWN_NPCS.find((n) => n.id === 'fisher'),
      );
      assert.notDeepEqual(next.props, original.props);
      previous = next;
    }
  }
});

test('换景后全部镇民可达，交谈判定与姓名换代使用新坐标，变迁不改变人物身份', () => {
  for (const revision of [1, 2, 5, 100, 1e6]) {
    const layout = townLayout(234, revision);
    const population = { seed: 234, since: 15 };
    const residents = townResidents(population, 116, layout.npcs);
    const before = townResidents(population, 116);
    for (const [i, npc] of residents.entries()) {
      assert.equal(npc.name, before[i].name);
      assert.equal(npc.generation, before[i].generation);
      assert.ok(townWalkable(npc));
      let p = { ...TOWN_START };
      for (const target of [{ x: TOWN_START.x, y: npc.y }, npc]) {
        for (let j = 0; j < 600 && Math.hypot(target.x - p.x, target.y - p.y) > 2; j++) {
          const delta = { x: target.x - p.x, y: target.y - p.y };
          p = moveInTown(p, delta, Math.min(0.05, Math.hypot(delta.x, delta.y) / 180));
        }
      }
      assert.equal(nearbyTownNpc(p, undefined, layout.npcs)?.id, npc.id);
      for (const seconds of [0, 5, 30, 100]) {
        const point = townNpcPosition(npc, seconds);
        assert.ok(townWalkable(point));
        assert.equal(nearbyTownNpc(point, seconds, layout.npcs)?.id, npc.id);
      }
    }
  }
});
