import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TOWN_START,
  TOWN_NPCS,
  moveInTown,
  townWalkable,
  nearbyTownNpc,
  townClockRunning,
} from '../src/town.ts';

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
  assert.deepEqual(moveInTown({ x: 1630, y: 2310 }, { x: -1, y: 0 }, 100), { x: 1630, y: 2310 });
  assert.deepEqual(moveInTown(TOWN_START, { x: 0, y: 0 }, 1), TOWN_START);
});
test('九位镇民均在可达街巷，远处不触发，走近可触发对应事件', () => {
  assert.equal(nearbyTownNpc(TOWN_START), undefined);
  for (const npc of TOWN_NPCS) {
    assert.ok(townWalkable(npc));
    assert.equal(nearbyTownNpc(npc)?.id, npc.id);
    let p = { ...TOWN_START };
    // 先到中央街巷，再沿支路走向对应镇民。
    for (const target of [
      { x: TOWN_START.x, y: npc.y },
      { x: npc.x, y: npc.y },
    ]) {
      for (let i = 0; i < 600 && Math.hypot(target.x - p.x, target.y - p.y) > 2; i++) {
        const delta = { x: target.x - p.x, y: target.y - p.y };
        p = moveInTown(p, delta, Math.min(0.05, Math.hypot(delta.x, delta.y) / 180));
      }
    }
    assert.equal(nearbyTownNpc(p)?.id, npc.id);
  }
});
