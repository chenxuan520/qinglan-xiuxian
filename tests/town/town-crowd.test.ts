import test from 'node:test';
import assert from 'node:assert/strict';
import { townCrowd, townCrowdPosition } from '../../src/town/town-crowd.ts';
import { townLayout } from '../../src/town/town-history.ts';
import { TOWN_STREETS, townWalkable } from '../../src/town/town.ts';

test('人流沿可走街巷折返，迁城后的顾客仍在实际店铺门口', () => {
  for (const seed of [0, 12345, 0xffffffff])
    for (const revision of [0, 1, 2, 100]) {
      const layout = townLayout(seed, revision);
      const crowd = townCrowd(seed, layout.buildings);
      assert.ok(crowd.length >= 56 && crowd.length <= 60);
      assert.equal(crowd.filter((npc) => npc.x !== npc.destination.x).length, 30);
      assert.equal(crowd.filter((npc) => npc.y !== npc.destination.y).length, 18);
      assert.deepEqual(townCrowd(seed, layout.buildings), crowd);
      for (const npc of crowd) {
        assert.ok(npc.art >= 0 && npc.art < 9);
        assert.ok(
          TOWN_STREETS.some(([l, t, r, b]) =>
            [npc, npc.destination].every((p) => p.x >= l && p.x <= r && p.y >= t && p.y <= b),
          ),
          '整段路线须位于同一可走矩形内，不能在拐角处抄近路',
        );
        for (const b of layout.buildings) {
          const size = revision ? 270 : 305;
          assert.ok(
            Math.max(npc.x, npc.destination.x) < b.x - size / 2 ||
              Math.min(npc.x, npc.destination.x) > b.x + size / 2 ||
              Math.max(npc.y, npc.destination.y) < b.y - size ||
              Math.min(npc.y, npc.destination.y) > b.y,
            `人流路线不能穿过房屋 ${b.x},${b.y}`,
          );
        }
        for (let seconds = 0; seconds < 120; seconds += 0.5)
          assert.ok(townWalkable(townCrowdPosition(npc, seconds)));
        if (npc.x === npc.destination.x && npc.y === npc.destination.y)
          assert.ok(layout.buildings.some((b) => b.x + 56 === npc.x && b.y + 72 === npc.y));
        else assert.notDeepEqual(townCrowdPosition(npc, 0), townCrowdPosition(npc, 3));
      }
    }
});

test('路径距离优化保持轴向、原地和斜线的停步、折返与朝向逐值一致', () => {
  const original = (npc: ReturnType<typeof townCrowd>[number], seconds: number) => {
    const dx = npc.destination.x - npc.x;
    const dy = npc.destination.y - npc.y;
    const duration = Math.hypot(dx, dy) / npc.speed;
    if (!duration) return { x: npc.x, y: npc.y, facing: 1 };
    const half = duration + 1;
    const time = (seconds + npc.phase) % (half * 2);
    const forward = time < half;
    const fraction = Math.min(1, (forward ? time : time - half) / duration);
    const progress = forward ? fraction : 1 - fraction;
    return { x: npc.x + dx * progress, y: npc.y + dy * progress, facing: forward ? 1 : -1 };
  };
  for (const seed of [0, 12345, 0xffffffff])
    for (const revision of [0, 1, 2, 100]) {
      const crowd = townCrowd(seed, townLayout(seed, revision).buildings);
      // 包含未来可能增加的反向和斜线路线，不把当前地图约定写死到算法。
      for (const [dx, dy] of [
        [-210, 0],
        [0, -220],
        [120, 160],
        [-120, -160],
      ])
        crowd.push({ ...crowd[0], destination: { x: crowd[0].x + dx, y: crowd[0].y + dy } });
      for (const npc of crowd) {
        const duration =
          Math.hypot(npc.destination.x - npc.x, npc.destination.y - npc.y) / npc.speed;
        const half = duration + 1;
        const times = [0, 1 / 60, 3, 100, 10000];
        for (const turn of [duration, half, half + duration, half * 2])
          for (const offset of [-1e-9, 0, 1e-9]) times.push(turn - npc.phase + half * 200 + offset);
        for (const seconds of times)
          assert.deepEqual(townCrowdPosition(npc, seconds), original(npc, seconds));
        // 没有按对象身份缓存：同一对象的坐标、终点、速度和相位修改后即刻生效。
        npc.x += 17;
        npc.destination.y -= 13;
        npc.speed += 3;
        npc.phase += 0.5;
        assert.deepEqual(townCrowdPosition(npc, 9), original(npc, 9));
      }
    }
});
