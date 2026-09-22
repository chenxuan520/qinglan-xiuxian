import test from 'node:test';
import assert from 'node:assert/strict';
import { townCrowd, townCrowdPosition } from '../src/town-crowd.ts';
import { townLayout } from '../src/town-history.ts';
import { TOWN_STREETS, townWalkable } from '../src/town.ts';

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
