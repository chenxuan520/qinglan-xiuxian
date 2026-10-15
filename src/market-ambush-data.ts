export type AmbushOutcome = 'victory' | 'defeat' | 'escaped';
export interface DuelPoint {
  x: number;
  y: number;
}
export interface AmbushStats {
  hp: number;
  damage: number;
  enemyHp: number;
  enemyDamage: number;
  speed: number;
}
export interface AmbushActor extends DuelPoint {
  hp: number;
  maxHp: number;
}
export interface AmbushSnapshot {
  version: 1;
  stats: AmbushStats;
  time: number;
  player: AmbushActor;
  enemy: AmbushActor;
  shots: (DuelPoint & { vx: number; vy: number })[];
  warning: (DuelPoint & { origin: DuelPoint; remaining: number }) | null;
  lunge: { from: DuelPoint; to: DuelPoint; time: number } | null;
  fire: number;
  strike: number;
  retreatRequested: boolean;
  retreatProgress: number;
  invincible: number;
  outcome: AmbushOutcome | null;
}

export const AMBUSH_WIDTH = 640;
export const AMBUSH_HEIGHT = 360;
export const AMBUSH_MAX_SHOTS = 64;
export const AMBUSH_RETREAT_SECONDS = 2;
const statKeys = ['hp', 'damage', 'enemyHp', 'enemyDamage', 'speed'] as const;
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const finite = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const point = (value: unknown, inset = 0): value is DuelPoint =>
  record(value) &&
  finite(value.x, inset, AMBUSH_WIDTH - inset) &&
  finite(value.y, inset, AMBUSH_HEIGHT - inset);

export function validAmbushStats(value: unknown): value is AmbushStats {
  return (
    record(value) &&
    statKeys.every((key) => finite(value[key], Number.MIN_VALUE, key === 'speed' ? 10000 : 1e15))
  );
}

export function initialAmbushSnapshot(stats: AmbushStats): AmbushSnapshot {
  if (!validAmbushStats(stats)) throw new Error('劫修战斗数值无效');
  return {
    version: 1,
    stats: { ...stats },
    time: 0,
    player: { x: 150, y: 180, hp: stats.hp, maxHp: stats.hp },
    enemy: { x: 470, y: 180, hp: stats.enemyHp, maxHp: stats.enemyHp },
    shots: [],
    warning: null,
    lunge: null,
    fire: 0,
    strike: 1,
    retreatRequested: false,
    retreatProgress: 0,
    invincible: 0,
    outcome: null,
  };
}

export function validAmbushSnapshot(
  value: unknown,
  expectedStats?: AmbushStats,
): value is AmbushSnapshot {
  if (!record(value) || value.version !== 1 || !validAmbushStats(value.stats)) return false;
  const s = value as unknown as AmbushSnapshot;
  if (
    expectedStats &&
    (!validAmbushStats(expectedStats) ||
      statKeys.some((key) => s.stats[key] !== expectedStats[key]))
  )
    return false;
  const actor = (value: unknown, hp: number): value is AmbushActor =>
    point(value, 28) && record(value) && value.maxHp === hp && finite(value.hp, 0, hp);
  if (
    !finite(s.time, 0, 1e9) ||
    !actor(s.player, s.stats.hp) ||
    !actor(s.enemy, s.stats.enemyHp) ||
    !finite(s.fire, 0, 0.65) ||
    !finite(s.strike, 0, 1.4) ||
    !finite(s.invincible, 0, 3) ||
    typeof s.retreatRequested !== 'boolean' ||
    !finite(s.retreatProgress, 0, AMBUSH_RETREAT_SECONDS) ||
    s.retreatProgress > s.time + 1e-6 ||
    (!s.retreatRequested && s.retreatProgress !== 0) ||
    !Array.isArray(s.shots) ||
    s.shots.length > AMBUSH_MAX_SHOTS ||
    !s.shots.every(
      (shot) =>
        point(shot) && record(shot) && finite(shot.vx, -420, 420) && finite(shot.vy, -420, 420),
    )
  )
    return false;
  if (
    s.warning !== null &&
    (!point(s.warning, 28) ||
      !point(s.warning.origin, 28) ||
      !finite(s.warning.remaining, Number.MIN_VALUE, 0.8) ||
      Math.hypot(s.warning.x - s.warning.origin.x, s.warning.y - s.warning.origin.y) > 160.000001)
  )
    return false;
  if (
    s.lunge !== null &&
    (!record(s.lunge) ||
      !point(s.lunge.from, 28) ||
      !point(s.lunge.to, 28) ||
      !finite(s.lunge.time, 0, 0.3) ||
      Math.hypot(s.lunge.to.x - s.lunge.from.x, s.lunge.to.y - s.lunge.from.y) > 160.000001)
  )
    return false;
  if (s.warning && s.lunge) return false;
  if (s.player.hp === 0) return s.outcome === 'defeat';
  if (s.enemy.hp === 0) return s.outcome === 'victory';
  if (s.outcome === null) return s.retreatProgress < AMBUSH_RETREAT_SECONDS;
  return (
    s.outcome === 'escaped' &&
    s.retreatRequested &&
    s.retreatProgress === AMBUSH_RETREAT_SECONDS &&
    s.player.x <= 60 &&
    Math.hypot(s.player.x - s.enemy.x, s.player.y - s.enemy.y) >= 150
  );
}
