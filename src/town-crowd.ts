import { TOWN_STREETS, type TownPoint } from './town.ts';

export interface TownPasserby extends TownPoint {
  art: number;
  tint: number;
  destination: TownPoint;
  speed: number;
  phase: number;
}

// 市井人流只作场景点缀，沿用九人格图集，不改变具名镇民的身份和交谈位置。
export function townCrowd(seed: number, buildings: readonly (TownPoint & { art: number })[]) {
  const crowd: TownPasserby[] = [];
  const add = (x: number, y: number, destination = { x, y }) => {
    const index = crowd.length;
    crowd.push({
      x,
      y,
      destination,
      art: (index * 5 + seed) % 9,
      tint: ((index * 7 + seed) % 9) * 8 - 32,
      speed: 34 + ((index * 13 + seed) % 24),
      phase: index * 3.7 + (seed % 61),
    });
  };
  // 每条往返路线收在同一段路面内，不用直线切过折角或穿越河道。
  const horizontal = TOWN_STREETS.filter(([left, , right]) => left < 3150 && right - left >= 400);
  for (let i = 0; i < 30; i++) {
    const [left, top, right, bottom] = horizontal[i % horizontal.length];
    const x = left + 40 + ((i * 137 + seed) % (right - left - 290));
    const y = (top + bottom) / 2 + (i % 2 ? 24 : -24);
    add(x, y, { x: x + 210, y });
  }
  const vertical = TOWN_STREETS.filter(
    ([left, top, , bottom]) => left < 3150 && bottom - top >= 300,
  );
  for (let i = 0; i < 18; i++) {
    const [left, top, right, bottom] = vertical[i % vertical.length];
    const x = (left + right) / 2 + (i % 2 ? 22 : -22);
    const y = top + 40 + ((i * 97 + seed) % (bottom - top - 300));
    add(x, y, { x, y: y + 220 });
  }
  // 顾客随当前店铺位置摆放，百年迁城后不留在空宅地前。
  for (const shop of buildings.filter((b) => b.art !== 3 && b.y < 1800).slice(0, 12))
    add(shop.x + 56, shop.y + 72);
  return crowd;
}

export function townCrowdPosition(npc: TownPasserby, seconds: number) {
  const dx = npc.destination.x - npc.x;
  const dy = npc.destination.y - npc.y;
  const duration = Math.hypot(dx, dy) / npc.speed;
  if (!duration) return { x: npc.x, y: npc.y, facing: 1 };
  // 在路段两端各驻足一秒，再折返；不同步速与起点避免整齐列队。
  const half = duration + 1;
  const time = (seconds + npc.phase) % (half * 2);
  const forward = time < half;
  const fraction = Math.min(1, (forward ? time : time - half) / duration);
  const progress = forward ? fraction : 1 - fraction;
  return { x: npc.x + dx * progress, y: npc.y + dy * progress, facing: forward ? 1 : -1 };
}
