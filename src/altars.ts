export const ALTARS = [
  {
    kind: 'wood',
    name: '万木回春',
    glyph: '木',
    effect: '立即回满气血，之后 20 秒每秒回复 2% 气血。',
    cost: '年岁增加 {n} 年（寿元上限的 20%）。',
  },
  {
    kind: 'fire',
    name: '焚天一炬',
    glyph: '火',
    effect: '场上妖物立即失去一半气血，精英失去一成半。',
    cost: '失去当前气血的三成。',
  },
  {
    kind: 'ice',
    name: '冰封万里',
    glyph: '冰',
    effect: '场上妖物冻结 8 秒，冻结期间受到伤害提高 30%。',
    cost: '此后 20 秒移速降低 25%。',
  },
  {
    kind: 'poison',
    name: '以毒攻毒',
    glyph: '毒',
    effect: '30 秒内造成的伤害提高 40%。',
    cost: '这 30 秒内无法回复气血。',
  },
  {
    kind: 'soul',
    name: '冥府借命',
    glyph: '冥',
    effect: '30 秒内受到致命伤时保留 1 点气血。',
    cost: '本次历练剩余时间最大气血降低 20%。',
  },
  {
    kind: 'thunder',
    name: '引雷诛邪',
    glyph: '雷',
    effect: '30 秒内每 2 秒落雷劈中至多 3 只妖物。',
    cost: '这 30 秒内每 6 秒也有一道天雷落向你，可走出预警圈躲避。',
  },
] as const;

export type AltarKind = (typeof ALTARS)[number]['kind'];
export interface AltarState {
  kind: AltarKind;
  x: number;
  y: number;
  spawnAt: number;
  expiresAt: number;
  phase: 'pending' | 'offered' | 'prompt' | 'accepted' | 'gone';
  left: boolean;
  regenUntil: number;
  slowUntil: number;
  damageUntil: number;
  deathUntil: number;
  thunderUntil: number;
  nextThunderAt: number;
  nextBacklashAt: number;
}

export function createAltar(
  stage: number,
  duration: number,
  random: () => number,
): AltarState | null {
  const altar = ALTARS[stage];
  if (!altar) return null;
  return {
    kind: altar.kind,
    x: 0,
    y: 0,
    spawnAt: Math.min(duration * (0.55 + random() * 0.25), duration - 60),
    expiresAt: 0,
    phase: 'pending',
    left: true,
    regenUntil: 0,
    slowUntil: 0,
    damageUntil: 0,
    deathUntil: 0,
    thunderUntil: 0,
    nextThunderAt: 0,
    nextBacklashAt: 0,
  };
}

export function validAltarState(
  value: unknown,
  stage: number,
  duration: number,
  time: number,
): value is AltarState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const a = value as AltarState;
  const fields = [
    'x',
    'y',
    'spawnAt',
    'expiresAt',
    'regenUntil',
    'slowUntil',
    'damageUntil',
    'deathUntil',
    'thunderUntil',
    'nextThunderAt',
    'nextBacklashAt',
  ] as const;
  if (
    !fields.every((key) => Number.isFinite(a[key])) ||
    typeof a.left !== 'boolean' ||
    !['pending', 'offered', 'prompt', 'accepted', 'gone'].includes(a.phase) ||
    a.kind !== ALTARS[stage]?.kind ||
    a.spawnAt < duration * 0.55 - 1e-8 ||
    a.spawnAt > Math.min(duration * 0.8, duration - 60) + 1e-8
  )
    return false;
  const times = fields.filter((key) => key !== 'x' && key !== 'y');
  if (!times.every((key) => a[key] >= 0 && a[key] <= duration + 6)) return false;
  if (a.expiresAt && (a.expiresAt < a.spawnAt || a.expiresAt > duration - 30 + 1e-8)) return false;
  if (['offered', 'prompt', 'accepted'].includes(a.phase) && !a.expiresAt) return false;
  if (a.phase === 'prompt' && (time >= a.expiresAt || a.left)) return false;
  const effects = {
    wood: 'regenUntil',
    fire: null,
    ice: 'slowUntil',
    poison: 'damageUntil',
    soul: 'deathUntil',
    thunder: 'thunderUntil',
  } as const;
  for (const key of [
    'regenUntil',
    'slowUntil',
    'damageUntil',
    'deathUntil',
    'thunderUntil',
  ] as const)
    if (
      a[key] > duration + 1e-8 ||
      (a[key] > 0 && (a.phase !== 'accepted' || effects[a.kind] !== key))
    )
      return false;
  if (a.kind !== 'thunder' && (a.nextThunderAt || a.nextBacklashAt)) return false;
  if (
    a.kind === 'thunder' &&
    a.phase === 'accepted' &&
    (!a.thunderUntil || a.nextThunderAt <= 0 || a.nextBacklashAt <= 0)
  )
    return false;
  return true;
}
