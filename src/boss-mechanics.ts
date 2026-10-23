import type { Point, Shot } from './game-types.ts';

export const BOSS_MECHANICS = {
  heartGrow: 2.4,
  heartLife: 8,
  heartLimit: 3,
  wolfFlank: 1.2,
  wolfLife: 6,
  wolfLimit: 2,
  returnWarmup: 0.8,
  returnOut: 1.15,
  returnRest: 0.4,
  orbitRadius: 135,
  orbitSpeed: 1.1,
  memorySpeed: 170,
  trailStep: 0.15,
  trailLimit: 24,
} as const;

export type BossMotion =
  | { kind: 'return'; velocity: Point }
  | { kind: 'memory'; path: Point[]; warmup: number }
  | { kind: 'star'; center: Point; angle: number; launchAt: number };
export interface BossSummon {
  kind: 'heart' | 'wolf';
  age: number;
  side: number;
}
export interface TrailPoint extends Point {
  time: number;
}

// 同一条轨迹供模拟、画面方向和自动走位预测使用，不读取未来选招。
export function bossShotPose(b: Shot, age = b.age) {
  const m = b.bossMotion!;
  if (m.kind === 'return') {
    const t = age - BOSS_MECHANICS.returnWarmup;
    const out = BOSS_MECHANICS.returnOut,
      rest = BOSS_MECHANICS.returnRest;
    const distance = Math.max(0, t < out ? t : t < out + rest ? out : 2 * out + rest - t);
    const direction = t < 0 || (t >= out && t < out + rest) ? 0 : t < out ? 1 : -1;
    return {
      x: b.origin.x + m.velocity.x * distance,
      y: b.origin.y + m.velocity.y * distance,
      vx: m.velocity.x * direction,
      vy: m.velocity.y * direction,
      active: t >= 0,
    };
  }
  if (m.kind === 'star') {
    const t = Math.min(age, m.launchAt);
    const angle = m.angle + t * BOSS_MECHANICS.orbitSpeed;
    const d = BOSS_MECHANICS.orbitRadius + Math.max(0, age - m.launchAt) * 220;
    return {
      x: m.center.x + Math.cos(angle) * d,
      y: m.center.y + Math.sin(angle) * d,
      vx:
        age < m.launchAt ? -Math.sin(angle) * d * BOSS_MECHANICS.orbitSpeed : Math.cos(angle) * 220,
      vy:
        age < m.launchAt ? Math.cos(angle) * d * BOSS_MECHANICS.orbitSpeed : Math.sin(angle) * 220,
      active: age >= m.launchAt,
    };
  }
  let travel = Math.max(0, age - m.warmup) * BOSS_MECHANICS.memorySpeed;
  for (let i = 1; i < m.path.length; i++) {
    const a = m.path[i - 1],
      z = m.path[i],
      length = Math.hypot(z.x - a.x, z.y - a.y);
    if (travel <= length && length > 0)
      return {
        x: a.x + ((z.x - a.x) * travel) / length,
        y: a.y + ((z.y - a.y) * travel) / length,
        vx: ((z.x - a.x) / length) * BOSS_MECHANICS.memorySpeed,
        vy: ((z.y - a.y) / length) * BOSS_MECHANICS.memorySpeed,
        active: age >= m.warmup,
      };
    travel -= length;
  }
  return { ...m.path[m.path.length - 1], vx: 0, vy: 0, active: false };
}
export function cloneBossMotion(m: BossMotion): BossMotion {
  if (m.kind === 'memory') return { ...m, path: m.path.map((p) => ({ ...p })) };
  if (m.kind === 'return') return { ...m, velocity: { ...m.velocity } };
  return { ...m, center: { ...m.center } };
}

export function validBossMotion(m: BossMotion, stage: number | undefined) {
  const point = (p: Point) => p && Number.isFinite(p.x) && Number.isFinite(p.y);
  if (!m || typeof m !== 'object') return false;
  if (m.kind === 'return')
    return (
      stage === 1 &&
      point(m.velocity) &&
      Math.abs(Math.hypot(m.velocity.x, m.velocity.y) - 155) < 1e-6
    );
  if (m.kind === 'star')
    return (
      stage === 5 &&
      point(m.center) &&
      Number.isFinite(m.angle) &&
      [1.3, 1.75, 2.2].includes(m.launchAt)
    );
  return (
    m.kind === 'memory' &&
    stage === 4 &&
    Array.isArray(m.path) &&
    m.path.length >= 2 &&
    m.path.length <= BOSS_MECHANICS.trailLimit + 2 &&
    m.path.every(point) &&
    Number.isFinite(m.warmup) &&
    m.warmup >= 1 &&
    m.warmup <= 1.8
  );
}
