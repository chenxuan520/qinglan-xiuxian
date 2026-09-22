import test from 'node:test';
import assert from 'node:assert/strict';
import {
  townVisit,
  townLayout,
  townSceneryLayout,
  townReturnMemory,
  validTownScenery,
} from '../src/town-history.ts';
import {
  TOWN_BUILDINGS,
  TOWN_NPCS,
  TOWN_PROPS,
  TOWN_START,
  TOWN_STREETS,
  nearbyTownNpc,
  moveInTown,
  townWalkable,
  townNpcPosition,
} from '../src/town.ts';
import { townResidents } from '../src/town-population.ts';
import { freshSave, parseSave } from '../src/progress.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';

test('城景按累计年岁推进，频繁回城不重置百年节点，长别直接定位当代', () => {
  const first = townVisit(undefined, 15);
  assert.deepEqual(first, { lastVisitAge: 15, revision: 0, since: 15 });
  const soon = townVisit(first, 114.9);
  assert.equal(townSceneryLayout(12345, soon).era, 0);
  assert.equal(townSceneryLayout(12345, townVisit(soon, 115)).era, 1);
  const century = townVisit(first, 115);
  assert.deepEqual(century, { lastVisitAge: 115, revision: 0, since: 15 });
  assert.deepEqual(townVisit(century, 115), century);
  const distant = townVisit(century, 10115);
  assert.equal(townSceneryLayout(12345, distant).era, 101);
  assert.deepEqual(distant, townVisit(first, 10115));
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
    { lastVisitAge: 15, revision: 0, since: -1 },
    { lastVisitAge: 15, revision: 0, since: 16 },
    { lastVisitAge: 15, revision: 0, since: '15' },
  ]) {
    assert.equal(validTownScenery(scenery), false);
    assert.throws(() =>
      importSave(JSON.stringify({ ...save, mortal: { ...save.mortal, scenery } })),
    );
  }
});

test('新城景保留旧档布局，从已知入城年岁起累计，存档往返不重排', () => {
  const save = freshSave();
  save.age = 315;
  save.mortal.population = { seed: 12345, since: 15 };
  const legacy = { lastVisitAge: 315, revision: 2 };
  const migrated = townVisit(legacy, 315);
  assert.equal(migrated.since, 315);
  assert.deepEqual(townSceneryLayout(12345, migrated).buildings, townLayout(12345, 2).buildings);
  assert.deepEqual(townSceneryLayout(12345, migrated).props, townLayout(12345, 2).props);
  save.age = 915;
  save.mortal.scenery = townVisit(townVisit(migrated, 365), save.age);
  const expected = townSceneryLayout(12345, save.mortal.scenery);
  for (const restored of [
    parseSave(JSON.stringify(save)),
    importSave(exportSave(save, null)).save,
  ]) {
    assert.deepEqual(restored.mortal.scenery, save.mortal.scenery);
    assert.deepEqual(townSceneryLayout(12345, restored.mortal.scenery), expected);
  }
});

test('房屋分批陈旧与翻修，少量旧铺歇业再开，地标和功能商铺不搬家', () => {
  for (const seed of [0, 12345, 0xffffffff]) {
    for (const revision of [0, 2]) {
      const first = townVisit({ lastVisitAge: 15, revision }, 15);
      const original = townSceneryLayout(seed, first);
      const century = townSceneryLayout(seed, townVisit(first, 115));
      const changed = century.buildings.filter((b) => b.condition);
      assert.ok(changed.length > 0 && changed.length < original.buildings.length / 2);
      const vacant = new Set<string>();
      let reopened = false;
      for (let era = 0; era <= 16; era++) {
        const scenery = townVisit(first, 15 + era * 100);
        const layout = townSceneryLayout(seed, scenery);
        assert.deepEqual(layout, townSceneryLayout(seed, scenery));
        assert.deepEqual(layout.npcs, original.npcs);
        assert.ok(layout.vacantLots.length <= 3);
        for (const lot of layout.vacantLots) vacant.add(`${lot.x},${lot.y}`);
        for (const b of layout.buildings) {
          if (vacant.has(`${b.x},${b.y}`)) reopened = true;
          assert.ok(
            original.buildings.some((p) => p.x === b.x && p.y === b.y) ||
              original.vacantLots.some((p) => p.x === b.x && p.y === b.y),
          );
        }
        for (const npc of layout.npcs.filter(
          (n) => !n.id.startsWith('villager-') && n.id !== 'fisher',
        )) {
          assert.ok(layout.buildings.some((b) => b.x === npc.x && b.y + 110 === npc.y));
          assert.ok(townWalkable(npc));
        }
        assert.ok(
          layout.props.every((p) =>
            original.props.some((old) => JSON.stringify(old) === JSON.stringify(p)),
          ),
        );
      }
      assert.ok(reopened);
    }
  }
});

test('返乡见闻只写可见变化，初访和同阶段重进不重复，长别不虚构中间经历', () => {
  const first = townVisit(undefined, 15);
  assert.equal(townReturnMemory(12345, undefined, first), '');
  assert.equal(townReturnMemory(12345, first, townVisit(first, 114.9)), '');
  const century = townVisit(first, 115);
  const memory = townReturnMemory(12345, first, century);
  assert.match(memory, /阔别 100 年/);
  assert.match(memory, /木色|墙色/);
  assert.ok(memory.length <= 160);
  assert.equal(townReturnMemory(12345, century, townVisit(century, 115)), '');
  let previous = first;
  const memories: string[] = [];
  for (let era = 1; era <= 16; era++) {
    const current = townVisit(previous, 15 + era * 100);
    memories.push(townReturnMemory(12345, previous, current));
    previous = current;
  }
  assert.ok(memories.some((text) => text.includes('只留下空院')));
  assert.ok(memories.some((text) => text.includes('新铺开张')));
  const distant = townVisit(first, 1e9 + 15);
  assert.ok(townSceneryLayout(12345, distant).buildings.length <= 28);
  assert.ok(townReturnMemory(12345, first, distant).length <= 160);
});

test('历史城景版本仍能恢复房舍分配、空院与陈设，生成结果稳定', () => {
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
  const roads = TOWN_STREETS.filter(
    ([left, top, right, bottom]) =>
      TOWN_START.x >= left &&
      TOWN_START.x <= right &&
      TOWN_START.y >= top &&
      TOWN_START.y <= bottom,
  );
  for (let i = 0; i < roads.length; i++) {
    const [left, top, right, bottom] = roads[i];
    for (const road of TOWN_STREETS)
      if (
        !roads.includes(road) &&
        road[0] <= right &&
        road[2] >= left &&
        road[1] <= bottom &&
        road[3] >= top
      )
        roads.push(road);
  }
  for (const revision of [1, 2, 5, 100, 1e6]) {
    const layout = townLayout(234, revision);
    const population = { seed: 234, since: 15 };
    const residents = townResidents(population, 116, layout.npcs);
    const before = townResidents(population, 116);
    for (const [i, npc] of residents.entries()) {
      assert.equal(npc.name, before[i].name);
      assert.equal(npc.generation, before[i].generation);
      assert.ok(townWalkable(npc));
      assert.ok(
        roads.some(
          ([left, top, right, bottom]) =>
            npc.x >= left && npc.x <= right && npc.y >= top && npc.y <= bottom,
        ),
      );
      const p = moveInTown({ x: npc.x, y: npc.y + 9 }, { x: 0, y: -1 }, 0.05);
      assert.equal(nearbyTownNpc(p, undefined, layout.npcs)?.id, npc.id);
      for (const seconds of [0, 5, 30, 100]) {
        const point = townNpcPosition(npc, seconds);
        assert.ok(townWalkable(point));
        assert.equal(nearbyTownNpc(point, seconds, layout.npcs)?.id, npc.id);
      }
    }
  }
});
