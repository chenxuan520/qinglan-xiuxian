import type { Enemy, Point, Zone } from './game-types.ts';
import type { EnemySkill } from './data.ts';

export type RegionalField = Omit<Zone, 'tick' | 'maxLife' | 'damage'> & { damageScale: number };
type Tactics = {
  flank: boolean;
  skill: EnemySkill | null;
  eliteSkill: EnemySkill | null;
  regional: boolean;
  deathMiasma: boolean;
  boundSummons: boolean;
};
export function regionalBossSkills(stage: number, original: string[]) {
  return (
    (
      {
        3: ['五毒游瘴', '蚀骨毒息', '万蛊复生'],
        4: ['百鬼夜行', '幽影换形', '六道鬼牢'],
        5: ['三叠天雷', '太虚雷织', '陨星天罚'],
      } as Record<number, string[]>
    )[stage] ?? original
  );
}

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
  if (stage === 5) {
    if (result.skill === 'dash') result.skill = 'thundercharge';
    if (result.eliteSkill === 'dash') result.eliteSkill = 'thundercharge';
  }
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

// 前六关专属；终关仍走原有七劫招式，不共享这组危险区。
export function regionalBossFields(
  stage: number,
  phase: number,
  e: Enemy,
  p: Point,
  nx: number,
  ny: number,
): RegionalField[] | null {
  const fields: RegionalField[] = [];
  if (stage === 0 && phase === 0) {
    for (const turn of [-0.65, 0, 0.65]) {
      const angle = Math.atan2(ny, nx) + turn;
      fields.push(
        lane(
          'boss-roots',
          e,
          offset(e, Math.cos(angle), Math.sin(angle), 290),
          22,
          2,
          1.2,
          1,
          e.id,
        ),
      );
    }
  } else if (stage === 1 && phase === 1) {
    fields.push(
      lane('boss-flame', offset(p, nx, ny, 0, -170), offset(p, nx, ny, 0, 170), 32, 2.6, 1.2),
    );
  } else if (stage === 1 && phase === 2) {
    for (const [index, turn] of [-0.55, 0, 0.55].entries()) {
      const angle = Math.atan2(ny, nx) + turn;
      fields.push(
        lane(
          'boss-flame',
          e,
          offset(e, Math.cos(angle), Math.sin(angle), 330),
          24,
          0.55,
          1.2 + index * 0.4,
          0.85,
        ),
      );
    }
  } else if (stage === 2 && phase === 2) {
    for (const [index, side] of [-60, 60].entries())
      fields.push(
        lane(
          'boss-frost',
          offset(e, nx, ny, 0, side),
          offset(e, nx, ny, 330, side),
          20,
          1.5,
          1.2 + index * 0.4,
        ),
      );
  } else if (stage === 3 && phase === 0) {
    for (const side of [-105, 0, 105])
      fields.push(
        cloud(
          'boss-miasma',
          offset(p, nx, ny, side === 0 ? 0 : 60, side),
          -ny * Math.sign(side || 1) * 24,
          nx * Math.sign(side || 1) * 24,
          62,
          4,
          1.2 + (side ? 0.25 : 0),
        ),
      );
  } else if (stage === 3 && phase === 1) {
    fields.push(lane('boss-miasma', e, offset(e, nx, ny, 320), 32, 1, 1.2, 0.85));
  } else if (stage === 4 && phase === 2) {
    for (const side of [-100, 100]) {
      const z = lane(
        'boss-soul',
        offset(p, nx, ny, -150, side),
        offset(p, nx, ny, 150, side),
        20,
        1.6,
        1.2,
        0.85,
      );
      z.vx = ny * Math.sign(side) * 22;
      z.vy = -nx * Math.sign(side) * 22;
      fields.push(z);
    }
  } else if (stage === 5 && phase === 0) {
    for (const [index, along] of [-110, 0, 110].entries())
      fields.push(
        lane(
          'boss-rift',
          offset(p, nx, ny, along, -150),
          offset(p, nx, ny, along, 150),
          24,
          0.3,
          1.2 + index * 0.45,
        ),
      );
  } else if (stage === 5 && phase === 1) {
    for (const [index, angle] of [0, Math.PI / 3, (Math.PI * 2) / 3].entries())
      fields.push(
        lane(
          'boss-rift',
          offset(p, Math.cos(angle), Math.sin(angle), -175),
          offset(p, Math.cos(angle), Math.sin(angle), 175),
          22,
          0.3,
          1.2 + index * 0.45,
        ),
      );
  } else if (stage === 5 && phase === 2) {
    for (const [index, across] of [-100, 0, 100].entries())
      fields.push(
        lane(
          'boss-rift',
          offset(p, nx, ny, -90, across),
          offset(p, nx, ny, 90, across),
          28,
          0.35,
          1.2 + index * 0.45,
        ),
      );
  } else return null;
  return fields;
}

export function regionalPursuit(stage: number, e: Enemy, p: Point, nx: number, ny: number) {
  if (stage === 0)
    return {
      label: '长藤探路',
      fields: [lane('boss-roots', e, offset(e, nx, ny, 480), 18, 1.5, 1.2, 0.75, e.id)],
    };
  if (stage === 1)
    return {
      label: '离火追径',
      fields: [lane('boss-flame', e, offset(e, nx, ny, 480), 22, 0.7, 1.2, 0.8)],
    };
  if (stage === 3)
    return {
      label: '游瘴驱逐',
      fields: [cloud('boss-miasma', offset(e, nx, ny, 165), nx * 32, ny * 32, 58, 4, 1.2, 0.8)],
    };
  if (stage === 4) return { label: '幽影追踪', fields: [], destination: offset(p, nx, ny, -260) };
  if (stage === 5)
    return {
      label: '落雷问路',
      fields: [
        lane('boss-rift', offset(p, nx, ny, 0, -130), offset(p, nx, ny, 0, 130), 24, 0.3, 1.4),
      ],
    };
  return null;
}
