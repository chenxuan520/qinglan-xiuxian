import type { Enemy, Point, Zone } from './game-types.ts';
import type { EnemySkill } from './data.ts';

export const CHARGE_SKILLS: readonly EnemySkill[] = [
  'dash',
  'firecharge',
  'frostcharge',
  'miasmacharge',
  'soulcharge',
  'thundercharge',
];

export type RegionalField = Omit<Zone, 'tick' | 'maxLife' | 'damage'> & { damageScale: number };
type Tactics = {
  flank: boolean;
  skill: EnemySkill | null;
  eliteSkill: EnemySkill | null;
  regional: boolean;
  deathMiasma: boolean;
  boundSummons: boolean;
};
const tacticsCache = new Map<number, Tactics>();
const overrides: Record<number, Record<number, EnemySkill>> = {
  0: { 2: 'roots', 10: 'roots' },
  1: { 30: 'firebolt', 31: 'firecharge', 33: 'firebolt' },
  2: { 42: 'frostbolt', 45: 'frostbolt', 14: 'frost' },
  3: { 50: 'miasma', 53: 'miasma' },
  4: { 58: 'soul', 61: 'soul' },
  5: { 66: 'storm', 69: 'storm' },
};

export function regionalEnemyTactics(
  stage: number,
  type: number,
  base: Tactics,
  behavior: string,
): Tactics {
  if (stage >= 6) return base;
  const key = stage * 1000 + type;
  const cached = tacticsCache.get(key);
  if (cached) return cached;
  const skill =
    overrides[stage]?.[type] ??
    (stage === 2 && base.flank && behavior === 'chase' ? 'dash' : base.skill);
  const result = {
    ...base,
    skill,
    eliteSkill:
      overrides[stage]?.[type] ??
      (stage === 2 && base.flank && behavior === 'chase' ? 'dash' : base.eliteSkill),
  };
  const charge = (
    ['dash', 'firecharge', 'frostcharge', 'miasmacharge', 'soulcharge', 'thundercharge'] as const
  )[stage];
  if (result.skill === 'dash') result.skill = charge;
  if (result.eliteSkill === 'dash') result.eliteSkill = charge;
  tacticsCache.set(key, result);
  return result;
}

function fieldColor(kind: string) {
  if (kind.includes('fire') || kind.includes('flame')) return '#ffad63';
  if (kind.includes('frost')) return '#9ce5ff';
  if (kind.includes('thunder')) return '#bbc9ff';
  if (kind.includes('storm') || kind.includes('rift')) return '#e9d391';
  return '#b7c992';
}

function lane(
  kind: string,
  from: Point,
  to: Point,
  radius: number,
  life: number,
  delay: number,
  damageScale = 1,
  sourceId?: number,
): RegionalField {
  return {
    x: from.x,
    y: from.y,
    endX: to.x,
    endY: to.y,
    radius,
    life,
    delay,
    castDelay: delay,
    damageScale,
    color: fieldColor(kind),
    kind,
    hostile: true,
    ...(sourceId === undefined ? {} : { sourceId }),
  };
}
function cloud(
  kind: string,
  from: Point,
  vx: number,
  vy: number,
  radius: number,
  life: number,
  delay: number,
  damageScale = 1,
): RegionalField {
  return {
    x: from.x,
    y: from.y,
    vx,
    vy,
    radius,
    life: life * 1.5,
    delay,
    castDelay: delay,
    damageScale,
    color: '#bcc895',
    kind,
    hostile: true,
  };
}
function offset(p: Point, nx: number, ny: number, along: number, across = 0) {
  return { x: p.x + nx * along - ny * across, y: p.y + ny * along + nx * across };
}

export function regionalEnemyFields(
  e: Enemy,
  skill: EnemySkill,
  nx: number,
  ny: number,
): RegionalField[] | null {
  const fields: RegionalField[] = [];
  if (skill === 'roots') {
    for (const side of e.elite ? [-0.4, 0.4] : [0]) {
      const angle = Math.atan2(ny, nx) + side;
      fields.push(
        lane(
          'enemy-roots',
          e,
          offset(e, Math.cos(angle), Math.sin(angle), 155),
          16,
          1.6,
          0.95,
          0.65,
          e.id,
        ),
      );
    }
  } else if (skill === 'thundercharge') {
    fields.push(lane('enemy-thunderpath', e, offset(e, nx, ny, 160), 16, 0.3, 1.3, 0.4, e.id));
  } else if (skill === 'firecharge' || skill === 'firepath') {
    fields.push(lane('enemy-firepath', e, offset(e, nx, ny, 160), 20, 2.4, 0.95, 0.45));
  } else if (skill === 'frostcharge') {
    // 冲刺沿原209距离留冰，预警与实际蓄势同步（冰谷部分兵种多0.3秒）。
    fields.push(lane('enemy-frost', e, offset(e, nx, ny, 209), 16, 1.3, e.charge - 0.55, 0.65));
  } else if (skill === 'miasmacharge') {
    // 只在实际冲刺结束时调用；不从起点预测远处落阵。
    fields.push(cloud('enemy-miasma', e, 0, 0, 50, 3.2, 1, 0.65));
  } else if (skill === 'frost') {
    for (const side of e.elite ? [-28, 28] : [0])
      fields.push(
        lane(
          'enemy-frost',
          offset(e, nx, ny, 0, side),
          offset(e, nx, ny, 155, side),
          16,
          1.3,
          0.95,
          0.65,
        ),
      );
  } else if (skill === 'miasma') {
    fields.push(cloud('enemy-miasma', offset(e, nx, ny, 75), nx * 12, ny * 12, 50, 3.2, 1, 0.65));
  } else if (skill === 'storm') {
    for (const [index, side] of [-1, 1].entries()) {
      const angle = Math.atan2(ny, nx) + side * 0.48;
      const from = e.type === 69 ? e : offset(e, nx, ny, 65 + index * 60, -60);
      const to =
        e.type === 69
          ? offset(e, Math.cos(angle), Math.sin(angle), 165)
          : offset(e, nx, ny, 65 + index * 60, 60);
      fields.push(lane('enemy-thunder', from, to, 16, 0.25, 1.05 + index * 0.6, 0.65, e.id));
    }
  } else return null;
  return fields;
}
