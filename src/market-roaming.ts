import { MARKET_WIDTH, MARKET_HEIGHT, type MarketCultivator } from './sect-market-data.ts';
import type { TownPoint } from './town.ts';

// 地景在可走范围之外继续铺设，镜头在边缘仍可完整显示角色并避开角落控件。
export const MARKET_SCENE_PADDING = 400;
export const MARKET_SCENE_WIDTH = MARKET_WIDTH + MARKET_SCENE_PADDING * 2;
export const MARKET_SCENE_HEIGHT = MARKET_HEIGHT + MARKET_SCENE_PADDING * 2;

// 路径沿商铺门前、中央街巷和小院外围铺设，避开房屋脚点；到路口会短暂停留。
const ROUTES: readonly (readonly TownPoint[])[] = [
  [
    { x: 380, y: 690 },
    { x: 790, y: 690 },
    { x: 790, y: 810 },
    { x: 380, y: 810 },
  ],
  [
    { x: 1210, y: 690 },
    { x: 1610, y: 690 },
    { x: 1610, y: 810 },
    { x: 1210, y: 810 },
  ],
  [
    { x: 850, y: 510 },
    { x: 1150, y: 510 },
    { x: 1150, y: 610 },
    { x: 850, y: 610 },
  ],
  [
    { x: 720, y: 840 },
    { x: 900, y: 840 },
    { x: 900, y: 1300 },
    { x: 720, y: 1300 },
  ],
  [
    { x: 1180, y: 840 },
    { x: 1530, y: 840 },
    { x: 1530, y: 1290 },
    { x: 1180, y: 1290 },
  ],
  [
    { x: 500, y: 1300 },
    { x: 1500, y: 1300 },
    { x: 1500, y: 1350 },
    { x: 500, y: 1350 },
  ],
];
export function marketVisitorPosition(npc: MarketCultivator, seconds: number) {
  const index = Number(npc.id.slice('market-visitor-'.length));
  const route = ROUTES[index % ROUTES.length];
  const speed = 30 + (index % 5) * 4;
  const pause = 2 + (index % 3);
  const legs = route.map((a, i) => ({
    a,
    b: route[(i + 1) % route.length],
    time:
      Math.hypot(a.x - route[(i + 1) % route.length].x, a.y - route[(i + 1) % route.length].y) /
        speed +
      pause,
  }));
  const total = legs.reduce((sum, leg) => sum + leg.time, 0);
  let t = (Math.max(0, seconds) + index * 7.3 + npc.generation * 3.7) % total;
  for (const leg of legs) {
    if (t < leg.time) {
      const progress = Math.min(1, t / (leg.time - pause));
      return {
        x: leg.a.x + (leg.b.x - leg.a.x) * progress,
        y: leg.a.y + (leg.b.y - leg.a.y) * progress,
        moving: progress < 1,
      };
    }
    t -= leg.time;
  }
  return { ...route[0], moving: false };
}
export function marketCamera(width: number, height: number, position: TownPoint) {
  const scale = Math.max(
    0.68,
    Math.min(1, width / 1100),
    width / MARKET_SCENE_WIDTH,
    height / MARKET_SCENE_HEIGHT,
  );
  return {
    scale,
    x: Math.max(
      width - MARKET_SCENE_WIDTH * scale,
      Math.min(0, width / 2 - (position.x + MARKET_SCENE_PADDING) * scale),
    ),
    y: Math.max(
      height - MARKET_SCENE_HEIGHT * scale,
      Math.min(0, height / 2 - (position.y + MARKET_SCENE_PADDING) * scale),
    ),
  };
}
