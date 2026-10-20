import test from 'node:test';
import assert from 'node:assert/strict';
import { walkRoute, destinationInput, mapClick } from '../src/walk-navigation.ts';
import {
  TOWN_WIDTH,
  TOWN_HEIGHT,
  TOWN_START,
  TOWN_NPCS,
  townWalkable,
  moveInTown,
} from '../src/town.ts';
import {
  MARKET_WIDTH,
  MARKET_HEIGHT,
  MARKET_BUILDINGS,
  MARKET_START,
} from '../src/sect-market-data.ts';
import { moveInSectMarket } from '../src/sect-market.ts';

function follow(
  start: { x: number; y: number },
  route: { x: number; y: number }[],
  move: typeof moveInTown,
  allowed: typeof townWalkable,
) {
  let position = { ...start };
  for (const target of route) {
    for (
      let frame = 0;
      frame < 3000 && Math.hypot(target.x - position.x, target.y - position.y) > 0.01;
      frame++
    ) {
      const x = target.x - position.x,
        y = target.y - position.y,
        distance = Math.hypot(x, y);
      position = move(
        position,
        { x: x / distance, y: y / distance },
        Math.min(1 / 60, distance / 180),
      );
      assert.ok(allowed(position), `不能穿墙: ${JSON.stringify(position)}`);
    }
    assert.ok(
      Math.hypot(target.x - position.x, target.y - position.y) < 0.01,
      `不能卡在路径上: ${JSON.stringify(target)}`,
    );
  }
  return position;
}

test('小镇点击路线可抵达全部职业人物、屋后与窄隙，沿真实碰撞行走', () => {
  for (const target of [
    ...TOWN_NPCS.slice(0, 9),
    { x: 600, y: 125 },
    { x: 439, y: 324 },
    { x: 3300, y: 1850 },
  ]) {
    const route = walkRoute(TOWN_START, target, townWalkable, TOWN_WIDTH, TOWN_HEIGHT);
    assert.ok(route.length);
    assert.deepEqual(follow(TOWN_START, route, moveInTown, townWalkable), {
      x: target.x,
      y: target.y,
    });
  }
});

test('点击建筑、河面或地图外，终点投到可达地面，不穿过建筑和水面', () => {
  for (const target of [
    { x: 600, y: 400 },
    { x: 3300, y: 1000 },
    { x: -500, y: -800 },
    { x: 8000, y: 9000 },
  ]) {
    const route = walkRoute(TOWN_START, target, townWalkable, TOWN_WIDTH, TOWN_HEIGHT);
    assert.ok(route.length);
    assert.ok(townWalkable(follow(TOWN_START, route, moveInTown, townWalkable)));
  }
  assert.deepEqual(
    walkRoute(TOWN_START, { x: NaN, y: 50 }, townWalkable, TOWN_WIDTH, TOWN_HEIGHT),
    [],
  );
});

test('坊市绕过实际屋楼，并遵守四边可走界限', () => {
  const allowed = (p: { x: number; y: number }) =>
    p.x >= 24 &&
    p.x <= MARKET_WIDTH - 24 &&
    p.y >= 24 &&
    p.y <= MARKET_HEIGHT - 24 &&
    townWalkable(p, MARKET_BUILDINGS, 260);
  for (const target of [
    { x: 1000, y: 535 },
    { x: 1060, y: 1130 },
    ...MARKET_BUILDINGS.map((b) => ({ x: b.x, y: b.y - 100 })),
    { x: 0, y: 0 },
    { x: MARKET_WIDTH, y: MARKET_HEIGHT },
  ]) {
    const route = walkRoute(MARKET_START, target, allowed, MARKET_WIDTH, MARKET_HEIGHT);
    assert.ok(route.length);
    assert.ok(allowed(follow(MARKET_START, route, moveInSectMarket, allowed)));
  }
});

test('屏幕点击按当前镜头和缩放映射，不使用未缩放的CSS坐标', () => {
  const map = {
    getBoundingClientRect: () => ({ left: -250, top: -450, width: 1800, height: 1250 }),
  } as HTMLElement;
  assert.deepEqual(mapClick(map, 3600, 2500, 200, 175), { x: 900, y: 1250 });
});

test('战斗点击移动不超速，低帧率也在终点停止，长距离不触碰输入方向以外的逻辑', () => {
  for (const speed of [80, 160, 420, 1800])
    for (const dt of [1 / 120, 1 / 60, 0.05]) {
      const target = { x: 193.43, y: -287.77 };
      let position = { x: 0, y: 0 };
      for (let frame = 0; frame < 3000; frame++) {
        const input = destinationInput(position, target, speed * dt);
        assert.ok(Math.hypot(input.x, input.y) <= 1 + 1e-9);
        if (!input.x && !input.y) break;
        position = { x: position.x + input.x * speed * dt, y: position.y + input.y * speed * dt };
      }
      assert.ok(
        Math.hypot(target.x - position.x, target.y - position.y) <= Math.max(1, speed * dt * 0.051),
      );
    }
});
