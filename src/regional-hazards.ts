import type { Point, Zone } from './game-types.ts';

// 条状攻击是两端带圆帽的危险带。渲染、命中和自动走位共用同一几何。
export function hazardDistance(z: Zone, p: Point) {
  if (z.endX === undefined || z.endY === undefined) return Math.hypot(p.x - z.x, p.y - z.y);
  const dx = z.endX - z.x,
    dy = z.endY - z.y;
  const t = Math.max(
    0,
    Math.min(1, ((p.x - z.x) * dx + (p.y - z.y) * dy) / (dx * dx + dy * dy || 1)),
  );
  return Math.hypot(p.x - z.x - dx * t, p.y - z.y - dy * t);
}

export function regionalHazard(z: Zone) {
  return z.endX !== undefined || z.vx !== undefined;
}

export function hazardMargin(z: Zone) {
  return z.radius + 50 + (z.endX === undefined ? 0 : Math.hypot(z.endX - z.x, z.endY! - z.y));
}

function circleInterval(
  x: number,
  y: number,
  vx: number,
  vy: number,
  radius: number,
): [number, number] | null {
  const a = vx * vx + vy * vy;
  if (a < 1e-9) return x * x + y * y < radius * radius ? [0, Infinity] : null;
  const b = x * vx + y * vy;
  const d = b * b - a * (x * x + y * y - radius * radius);
  if (d <= 0) return null;
  return [(-b - Math.sqrt(d)) / a, (-b + Math.sqrt(d)) / a];
}

function slab(at: number, velocity: number, min: number, max: number): [number, number] | null {
  if (Math.abs(velocity) < 1e-9) return at >= min && at <= max ? [-Infinity, Infinity] : null;
  const a = (min - at) / velocity,
    b = (max - at) / velocity;
  return [Math.min(a, b), Math.max(a, b)];
}

// 返回按可见运动速度穿过危险带的时间区间；没有读取未来的技能或随机结果。
export function hazardCrossing(
  z: Zone,
  p: Point,
  vx: number,
  vy: number,
  padding = 8,
): [number, number] | null {
  const radius = z.radius + padding;
  const x = p.x - z.x,
    y = p.y - z.y;
  const intervals: [number, number][] = [];
  const first = circleInterval(x, y, vx, vy, radius);
  if (first) intervals.push(first);
  if (z.endX !== undefined && z.endY !== undefined) {
    const dx = z.endX - z.x,
      dy = z.endY - z.y;
    const length = Math.hypot(dx, dy);
    if (length > 1e-9) {
      const ux = dx / length,
        uy = dy / length;
      const along = slab(x * ux + y * uy, vx * ux + vy * uy, 0, length);
      const across = slab(-x * uy + y * ux, -vx * uy + vy * ux, -radius, radius);
      if (along && across && Math.max(along[0], across[0]) < Math.min(along[1], across[1]))
        intervals.push([Math.max(along[0], across[0]), Math.min(along[1], across[1])]);
      const last = circleInterval(x - dx, y - dy, vx, vy, radius);
      if (last) intervals.push(last);
    }
  }
  if (!intervals.length) return null;
  const enter = Math.max(0, Math.min(...intervals.map((v) => v[0])));
  const exit = Math.max(...intervals.map((v) => v[1]));
  return exit > enter ? [enter, exit] : null;
}

export function regionalExposure(z: Zone, p: Point, x: number, y: number, speed: number) {
  const delay = Math.max(0, z.delay);
  const crossing = hazardCrossing(
    z,
    { x: p.x + x * speed * delay, y: p.y + y * speed * delay },
    x * speed - (z.vx || 0),
    y * speed - (z.vy || 0),
  );
  if (!crossing) return 0;
  const [enter, exit] = crossing;
  const tick =
    Math.max(0, z.tick) + Math.max(0, Math.ceil((enter - 0.12 - Math.max(0, z.tick)) / 0.5)) * 0.5;
  const slows = ['enemy-roots', 'enemy-frost', 'boss-roots', 'boss-frost'].includes(z.kind);
  if (!slows && (tick > z.life || tick > exit + 0.12)) return 0;
  return Math.max(0, Math.min(exit + 0.12, z.life, 1.6) - Math.max(0, enter - 0.12));
}
