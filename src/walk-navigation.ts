import type { TownPoint } from './town.ts';

export function destinationInput(from: TownPoint, to: TownPoint, step: number) {
  const x = to.x - from.x,
    y = to.y - from.y,
    distance = Math.hypot(x, y);
  if (distance <= Math.max(1, step * 0.051)) return { x: 0, y: 0 };
  const length = Math.max(distance, step);
  return { x: x / length, y: y / length };
}
