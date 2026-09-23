import test from 'node:test';
import assert from 'node:assert/strict';
import { townSceneryLayout } from '../src/town-history.ts';
import {
  TOWN_START,
  TOWN_NPCS,
  TOWN_BUILDINGS,
  TOWN_STREETS,
  TOWN_WIDTH,
  TOWN_HEIGHT,
  moveInTown,
  townWalkable,
  nearbyTownNpc,
  townClockRunning,
  townNpcPosition,
  townDockPath,
  HOMETOWN_START,
  HOMETOWN_DOCK,
  HOMETOWN_NAV_SPEED,
} from '../src/town.ts';

test('房前屋后与两侧空地可走，不再把整块宅地当作空气墙', () => {
  for (const p of [
    { x: 600, y: 470 },
    { x: 770, y: 350 },
    { x: 600, y: 125 },
    { x: 600, y: 680 },
  ])
    assert.equal(townWalkable(p), true, `${p.x},${p.y} 是房屋外的空地`);
  assert.equal(townWalkable({ x: 600, y: 400 }), false);
  assert.equal(townWalkable({ x: 3300, y: 1000 }), false);
});

test('渡口自动寻路从故居、屋后、窄隙及其他栈桥绕开房屋和河面', () => {
  for (const start of [
    HOMETOWN_START,
    { x: 600, y: 125 },
    { x: 440, y: 350 },
    { x: 440, y: 300 },
    { x: 439, y: 324 },
    { x: 445, y: 264 },
    { x: 447.4, y: 264 },
    { x: 770, y: 350 },
    { x: 3300, y: 650 },
    { x: 3500, y: 1850 },
  ]) {
    const original = { ...start };
    const path = townDockPath(start);
    assert.ok(path.length > 0, JSON.stringify(start));
    assert.deepEqual(path.at(-1), HOMETOWN_DOCK);
    assert.deepEqual(start, original);
    for (const dt of [1 / 60, 0.05]) {
      let p = { ...start };
      let seconds = 0;
      for (const target of path) {
        for (
          let step = 0;
          step < 2000 && Math.hypot(target.x - p.x, target.y - p.y) > 0.01;
          step++
        ) {
          const time = Math.min(
            dt,
            Math.hypot(target.x - p.x, target.y - p.y) / HOMETOWN_NAV_SPEED,
          );
          const remaining = Math.hypot(target.x - p.x, target.y - p.y);
          p = moveInTown(
            p,
            { x: (target.x - p.x) / remaining, y: (target.y - p.y) / remaining },
            time,
            TOWN_BUILDINGS,
            305,
            HOMETOWN_NAV_SPEED,
          );
          seconds += dt;
          assert.ok(townWalkable(p), '自动走动不能穿过房屋或进入河面');
        }
        assert.ok(
          Math.hypot(target.x - p.x, target.y - p.y) <= 0.01,
          `不能卡住：${JSON.stringify(start)} -> ${JSON.stringify(target)}`,
        );
      }
      assert.ok(seconds < 40);
    }
  }
});

test('自动走动按离乡速度前进且约十秒走完，不在最后不足一像素处停顿', () => {
  const start = { x: 600, y: 597 },
    target = { x: 720, y: 720 };
  const expected = Math.hypot(target.x - start.x, target.y - start.y) / HOMETOWN_NAV_SPEED;
  for (const dt of [1 / 60, 0.05]) {
    let p = { ...start },
      frames = 0;
    while (Math.hypot(target.x - p.x, target.y - p.y) > 0.01 && frames < 200) {
      const distance = Math.hypot(target.x - p.x, target.y - p.y);
      p = moveInTown(
        p,
        { x: (target.x - p.x) / distance, y: (target.y - p.y) / distance },
        Math.min(dt, distance / HOMETOWN_NAV_SPEED),
        TOWN_BUILDINGS,
        305,
        HOMETOWN_NAV_SPEED,
      );
      frames++;
    }
    assert.ok(frames * dt <= expected + dt);
    assert.ok(Math.hypot(target.x - p.x, target.y - p.y) <= 0.01);
  }
  assert.equal(moveInTown(start, { x: 1, y: 0 }, 0.05).x - start.x, 9);
  const route = townDockPath(HOMETOWN_START);
  let distance = 0,
    previous = HOMETOWN_START;
  for (const point of route) {
    distance += Math.hypot(point.x - previous.x, point.y - previous.y);
    previous = point;
  }
  assert.ok(distance / HOMETOWN_NAV_SPEED >= 9 && distance / HOMETOWN_NAV_SPEED <= 11);
  for (const x of [432.6, 439, 440, 445, 447.4])
    for (let y = 145; y <= 450; y += 13) assert.ok(townDockPath({ x, y }).length > 0);
});

test('渡口寻路遵循当前城景房屋，非法起点不生成路线', () => {
  const layout = townSceneryLayout(12345, { revision: 2, since: 315, lastVisitAge: 415 });
  const path = townDockPath(TOWN_START, layout.buildings, 270);
  assert.ok(path.length > 0);
  assert.ok(path.every((p) => townWalkable(p, layout.buildings, 270)));
  assert.deepEqual(townDockPath({ x: 600, y: 400 }), []);
  assert.deepEqual(townDockPath({ x: NaN, y: 400 }), []);
});

test('只有载入完成、前台有焦点的城镇场景且无弹窗才计时', () => {
  assert.equal(townClockRunning(true, true, true, true, ''), true);
  for (let i = 0; i < 4; i++) {
    const flags = [true, true, true, true];
    flags[i] = false;
    assert.equal(townClockRunning(flags[0], flags[1], flags[2], flags[3], ''), false);
  }
  for (const panel of ['town-event', 'supplies-shortage', 'reward-ad', 'cultivation'])
    assert.equal(townClockRunning(true, true, true, true, panel), false);
});
test('城镇移动归一化且不穿墙，长帧不会跨过建筑', () => {
  const straight = moveInTown(TOWN_START, { x: 0, y: -1 }, 0.05);
  const diagonal = moveInTown(TOWN_START, { x: 1, y: -1 }, 0.05);
  assert.ok(
    Math.abs(
      Math.hypot(diagonal.x - TOWN_START.x, diagonal.y - TOWN_START.y) -
        (TOWN_START.y - straight.y),
    ) < 1e-8,
  );
  assert.deepEqual(moveInTown({ x: 600, y: 450 }, { x: 0, y: -1 }, 100), { x: 600, y: 450 });
  assert.deepEqual(moveInTown(TOWN_START, { x: 0, y: 0 }, 1), TOWN_START);
});
test('九位职业镇民与十二位村民均在可达街巷，走近可触发对应交谈', () => {
  assert.equal(TOWN_NPCS.length, 21);
  assert.equal(nearbyTownNpc({ x: 1740, y: 2350 }), undefined);
  const contains = (street: number[], p: { x: number; y: number }) =>
    p.x >= street[0] && p.x <= street[2] && p.y >= street[1] && p.y <= street[3];
  const start = TOWN_STREETS.findIndex((street) => contains(street, TOWN_START));
  assert.notEqual(start, -1);
  const previous = new Map([[start, -1]]);
  const queue = [start];
  // 只在测试中遍历有实际重叠面积的矩形路段，不再假设两段直线能到达所有门口。
  for (const index of queue) {
    const [left, top, right, bottom] = TOWN_STREETS[index];
    TOWN_STREETS.forEach(([l, t, r, b], next) => {
      if (
        !previous.has(next) &&
        Math.min(right, r) - Math.max(left, l) >= 18 &&
        Math.min(bottom, b) - Math.max(top, t) >= 18
      ) {
        previous.set(next, index);
        queue.push(next);
      }
    });
  }
  assert.equal(previous.size, TOWN_STREETS.length, '全部街巷与码头应连成一张路网');
  for (const npc of TOWN_NPCS) {
    assert.ok(townWalkable(npc));
    assert.equal(nearbyTownNpc(npc)?.id, npc.id);
    const route: number[] = [];
    for (
      let index = TOWN_STREETS.findIndex((street) => contains(street, npc));
      index !== -1;
      index = previous.get(index)!
    )
      route.unshift(index);
    const targets = route.slice(1).map((index, step) => {
      const [l, t, r, b] = TOWN_STREETS[route[step]];
      const [left, top, right, bottom] = TOWN_STREETS[index];
      return {
        x: (Math.max(left, l) + Math.min(right, r)) / 2,
        y: (Math.max(top, t) + Math.min(bottom, b)) / 2,
      };
    });
    let p = { ...TOWN_START };
    for (const target of [...targets, npc]) {
      for (let i = 0; i < 600 && Math.hypot(target.x - p.x, target.y - p.y) > 2; i++) {
        const delta = { x: target.x - p.x, y: target.y - p.y };
        p = moveInTown(p, delta, Math.min(0.05, Math.hypot(delta.x, delta.y) / 180));
        assert.ok(townWalkable(p));
      }
      assert.ok(Math.hypot(target.x - p.x, target.y - p.y) <= 2, npc.id);
    }
    assert.equal(nearbyTownNpc(p)?.id, npc.id);
  }
});

test('十二位村民沿街行走，交谈判定跟随当前位置，职业镇民驻留原地', () => {
  const villagers = TOWN_NPCS.filter((npc) => npc.id.startsWith('villager-'));
  assert.equal(villagers.length, 12);
  for (const npc of villagers)
    assert.ok(
      TOWN_STREETS.some(
        ([l, t, r, b]) => npc.x - 100 >= l && npc.x + 100 <= r && npc.y >= t && npc.y <= b,
      ),
      `${npc.id} 的完整水平活动范围应留在同一路面内`,
    );
  for (const npc of TOWN_NPCS) {
    for (const seconds of [0, 5, 10, 30, 100]) {
      const point = townNpcPosition(npc, seconds);
      assert.ok(townWalkable(point));
      assert.equal(nearbyTownNpc(point, seconds)?.id, npc.id);
      if (!npc.id.startsWith('villager-')) assert.deepEqual(point, { x: npc.x, y: npc.y });
    }
  }
});

test('宅地错落排列、主街分段折转，街口宽窄不同且房屋不挡路', () => {
  assert.equal(TOWN_BUILDINGS.length, 28);
  assert.deepEqual(TOWN_START, { x: 1740, y: 1250 });
  assert.equal(TOWN_WIDTH, 3600);
  assert.equal(TOWN_HEIGHT, 2500);
  for (let row = 0; row < 4; row++) {
    const buildings = TOWN_BUILDINGS.slice(row * 7, row * 7 + 7);
    assert.ok(new Set(buildings.map((b) => b.y)).size >= 3);
    if (row)
      assert.notDeepEqual(
        buildings.map((b) => b.x),
        TOWN_BUILDINGS.slice((row - 1) * 7, row * 7).map((b) => b.x),
      );
  }
  const widths = new Set<number>();
  for (const [left, top, right, bottom] of TOWN_STREETS) {
    assert.ok(left >= 0 && top >= 0 && right <= TOWN_WIDTH && bottom <= TOWN_HEIGHT);
    assert.ok(right > left && bottom > top);
    widths.add(Math.min(right - left, bottom - top));
    // 默认房屋图集占 305px，底部锚定在 b.y；不能用可走矩形掩盖穿屋路线。
    for (const b of TOWN_BUILDINGS)
      assert.ok(
        right <= b.x - 152.5 || left >= b.x + 152.5 || bottom <= b.y - 305 || top >= b.y,
        `路面 ${left},${top},${right},${bottom} 与房屋 ${b.x},${b.y} 相交`,
      );
  }
  assert.ok(widths.size >= 4);
  for (const y of [650, 1250, 1850])
    assert.ok(
      Array.from({ length: 60 }, (_, i) => ({ x: 150 + i * 50, y })).some(
        (p) => !TOWN_STREETS.some(([l, t, r, b]) => p.x >= l && p.x <= r && p.y >= t && p.y <= b),
      ),
      '不能退回三条横贯全镇的整齐直街',
    );
  assert.equal(townWalkable({ x: 3300, y: 1000 }), false);
  for (const y of [650, 1250, 1850]) assert.ok(townWalkable({ x: 3500, y }));
});

test('空院不保留旧房空气墙，迁城碰撞跟随实际位置与缩小后的图框', () => {
  assert.equal(townWalkable({ x: 600, y: 400 }, []), true);
  const houses = [{ x: 1200, y: 900 }];
  assert.equal(townWalkable({ x: 600, y: 400 }, houses, 270), true);
  assert.equal(townWalkable({ x: 1200, y: 850 }, houses, 270), false);
  assert.equal(townWalkable({ x: 1340, y: 850 }, houses, 270), true);
  assert.deepEqual(moveInTown({ x: 1200, y: 900 }, { x: 0, y: -1 }, 0.05, houses, 270), {
    x: 1200,
    y: 900,
  });
  for (const p of [
    { x: -1, y: 500 },
    { x: 3601, y: 500 },
    { x: 500, y: NaN },
    { x: Infinity, y: 500 },
  ])
    assert.equal(townWalkable(p), false);
});

test('空院重建后旧停留点不可走，原街道起点仍可安全落脚并继续移动', () => {
  const oldPosition = { x: 1467, y: 1111 };
  const before = townSceneryLayout(12345, { revision: 2, since: 315, lastVisitAge: 315 });
  const after = townSceneryLayout(12345, { revision: 2, since: 315, lastVisitAge: 415 });
  assert.equal(townWalkable(oldPosition, before.buildings, 270), true);
  assert.equal(townWalkable(oldPosition, after.buildings, 270), false);
  assert.equal(townWalkable(TOWN_START, after.buildings, 270), true);
  assert.notDeepEqual(
    moveInTown(TOWN_START, { x: 0, y: 1 }, 0.05, after.buildings, 270),
    TOWN_START,
  );
});

test('旧迁城地块门口保留抖动余量，职业身份顺序及对应店铺不变', () => {
  // 旧布局 x ±5、y ±6，额外保留 20px，包含前 21 块可置换宅地。
  for (const b of TOWN_BUILDINGS)
    for (const dx of [-25, 0, 25])
      for (const dy of [-26, 0, 26]) assert.ok(townWalkable({ x: b.x + dx, y: b.y + 110 + dy }));
  assert.deepEqual(
    TOWN_NPCS.slice(0, 9).map(({ id, role, place, art }) => [id, role, place, art]),
    [
      ['herbs', '药铺先生', '百草堂', 0],
      ['tea', '茶馆掌柜', '听雨茶馆', 1],
      ['escort', '镖局教头', '青岚镖局', 2],
      ['market', '坊市货商', '灵材坊市', 3],
      ['smith', '铁匠', '街头匠人', 4],
      ['scholar', '书生', '访学游人', 5],
      ['fisher', '渔夫', '青岚码头', 6],
      ['farmer', '农人', '赶集镇民', 7],
      ['tailor', '裁缝', '布衣手艺人', 8],
    ],
  );
  for (const npc of TOWN_NPCS.slice(0, 9)) {
    if (npc.id === 'fisher') assert.deepEqual({ x: npc.x, y: npc.y }, { x: 3070, y: 1250 });
    else assert.ok(TOWN_BUILDINGS.some((b) => b.x === npc.x && b.y + 110 === npc.y));
  }
  for (const [index, npc] of TOWN_NPCS.slice(9).entries()) {
    assert.equal(npc.id, `villager-${index}`);
    assert.equal(npc.art, (Math.floor(index / 4) * 3 + (index % 4)) % 9);
    assert.equal(npc.role, ['街坊', '赶路村民', '邻里乡亲', '赶集村民'][index % 4]);
    assert.equal(npc.place, ['北街', '河畔长街', '南街'][Math.floor(index / 4)]);
  }
});
