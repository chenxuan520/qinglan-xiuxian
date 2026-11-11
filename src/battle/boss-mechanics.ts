import type { Enemy, Point, Shot } from './game-types.ts';

export const SOVEREIGN_GOLD = '#e8d69c';

export const BOSS_MECHANICS = {
  heartGrow: 1.2,
  heartGuard: 0.3,
  heartLife: 10,
  heartLimit: 3,
  wolfFlank: 1.2,
  wolfWindup: 0.425,
  wolfDash: 0.55,
  wolfLife: 6,
  wolfLimit: 2,
  nativeMiasmaLife: 6,
  miasmaSettleLife: 5,
  miasmaSettleDelay: 0.3,
  nativeMiasmaSpeed: 95,
  nativePursuitMiasmaSpeed: 120,
  returnWarmup: 0.8,
  returnSpeed: 155,
  nativeReturnSpeed: 348.75,
  nativeReturnSpeedLegacy: 232.5,
  returnOut: 1.15,
  nativeReturnOut: 2.3,
  returnRest: 0.4,
  orbitRadius: 135,
  orbitSpeed: 1.1,
  memorySpeed: 320,
  memoryWarmup: 0.8,
  memoryStagger: 0.2,
  memoryOvershoot: 160,
  trailStep: 0.15,
  trailLimit: 24,
} as const;

export function heartGuardReady(e: Enemy) {
  return e.bossSummon?.kind === 'heart' && e.bossSummon.age >= BOSS_MECHANICS.heartGrow;
}
export function bossGuardedByHearts(enemies: Enemy[], bossId: number) {
  return enemies.some((c) => !c.dead && c.summonedBy === bossId && heartGuardReady(c));
}
export function summonLinkAlpha(a: Point, b: Point) {
  const distance = Math.hypot(a.x - b.x, a.y - b.y);
  return distance >= 300 ? 0 : distance <= 200 ? 1 : (300 - distance) / 100;
}

export type BossMotion =
  | { kind: 'return'; velocity: Point }
  | { kind: 'memory'; path: Point[]; warmup: number; locked?: boolean }
  | { kind: 'star'; center: Point; angle: number; launchAt: number };
export interface BossSummon {
  kind: 'heart' | 'wolf';
  age: number;
  round?: number;
  side: number;
  color?: string;
}
export interface TrailPoint extends Point {
  time: number;
}

// 速度已保存在弹丸中：原生与终关新回焰同轨，旧续局及天劫事件保留原轨迹。
export function bossReturnOut(b: Shot) {
  const m = b.bossMotion;
  return m?.kind === 'return' &&
    [BOSS_MECHANICS.nativeReturnSpeed, BOSS_MECHANICS.nativeReturnSpeedLegacy].some(
      (speed) => Math.abs(Math.hypot(m.velocity.x, m.velocity.y) - speed) < 1e-6,
    )
    ? BOSS_MECHANICS.nativeReturnOut
    : BOSS_MECHANICS.returnOut;
}

// 同一条轨迹供模拟、画面方向和自动走位预测使用，不读取未来选招。
export function bossShotPose(b: Shot, age = b.age) {
  const m = b.bossMotion!;
  if (m.kind === 'return') {
    const t = age - BOSS_MECHANICS.returnWarmup;
    const out = bossReturnOut(b),
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

const LEGACY_MEMORY_WARMUPS = [1, 1.35, 1.7, 2.05, 2.4];
export function validMemoryWarmup(warmup: number) {
  return (
    Number.isFinite(warmup) &&
    [0, 1, 2, 3, 4].some(
      (i) =>
        Math.abs(warmup - (BOSS_MECHANICS.memoryWarmup + i * BOSS_MECHANICS.memoryStagger)) < 1e-8,
    )
  );
}
export function validMemoryShape(path: Point[], locked: boolean | undefined) {
  return locked === true ? path.length === 3 : path.length === 2;
}
export function validBossMotion(m: BossMotion, stage: number | undefined) {
  const point = (p: Point) => p && Number.isFinite(p.x) && Number.isFinite(p.y);
  if (!m || typeof m !== 'object') return false;
  if (m.kind === 'return')
    return (
      stage === 1 &&
      point(m.velocity) &&
      [
        BOSS_MECHANICS.returnSpeed,
        BOSS_MECHANICS.nativeReturnSpeed,
        BOSS_MECHANICS.nativeReturnSpeedLegacy,
      ].some((speed) => Math.abs(Math.hypot(m.velocity.x, m.velocity.y) - speed) < 1e-6)
    );
  if (m.kind === 'star')
    return (
      stage === 5 &&
      point(m.center) &&
      Number.isFinite(m.angle) &&
      Number.isFinite(m.launchAt) &&
      [1.3, 1.75, 2.2, ...Array.from({ length: 5 }, (_, i) => 1.3 + i * 0.35)].some(
        (launchAt) => Math.abs(launchAt - m.launchAt) < 1e-8,
      )
    );
  if (
    m.kind !== 'memory' ||
    stage !== 4 ||
    !Array.isArray(m.path) ||
    m.path.length < 2 ||
    m.path.length > BOSS_MECHANICS.trailLimit + 2 ||
    !m.path.every(point) ||
    !Number.isFinite(m.warmup) ||
    (m.locked !== undefined && typeof m.locked !== 'boolean')
  )
    return false;
  if (m.locked === true) return validMemoryWarmup(m.warmup) && m.path.length === 3;
  if (m.locked === false) return validMemoryWarmup(m.warmup) && m.path.length === 2;
  // 未锁定：2 点短路径是新格式；长路径为旧规则魂影，续局时由 restore 丢弃。
  if (m.path.length === 2) return validMemoryWarmup(m.warmup);
  return LEGACY_MEMORY_WARMUPS.some((warmup) => Math.abs(m.warmup - warmup) < 1e-8);
}
