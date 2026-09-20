import test from 'node:test';
import assert from 'node:assert/strict';
import { townCrowd, townCrowdPosition } from '../src/town-crowd.ts';
import { townLayout } from '../src/town-history.ts';
import { townWalkable } from '../src/town.ts';

test('人流沿可走街巷折返，迁城后的顾客仍在实际店铺门口', () => {
  for (const seed of [0, 12345, 0xffffffff])
    for (const revision of [0, 1, 2, 100]) {
      const layout = townLayout(seed, revision);
      const crowd = townCrowd(seed, layout.buildings);
      assert.ok(crowd.length >= 56 && crowd.length <= 60);
      assert.deepEqual(townCrowd(seed, layout.buildings), crowd);
      for (const npc of crowd) {
        assert.ok(npc.art >= 0 && npc.art < 9);
        for (let seconds = 0; seconds < 120; seconds += 0.5)
          assert.ok(townWalkable(townCrowdPosition(npc, seconds)));
        if (npc.x === npc.destination.x && npc.y === npc.destination.y)
          assert.ok(layout.buildings.some((b) => b.x + 56 === npc.x && b.y + 72 === npc.y));
        else assert.notDeepEqual(townCrowdPosition(npc, 0), townCrowdPosition(npc, 3));
      }
    }
});
