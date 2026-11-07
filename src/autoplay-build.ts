import {
  allowsSchool,
  MAX_PASSIVES,
  MAX_WEAPONS,
  MAX_PASSIVE_LEVEL,
  treasure,
  TREASURES,
} from './data.ts';
import type { Choice, Game } from './game.ts';

export const AUTOPLAY_BUILDS = [
  {
    id: 'default',
    name: '默认路线',
    description: '兼顾输出与生存，按当前搭配选择升级。',
  },
  { id: 'native', name: '本命优先', description: '培养入场法宝及觉醒功法。' },
  { id: 'survival', name: '保命稳进', description: '偏重护体、恢复，兼顾输出。' },
  {
    id: 'offense',
    name: '极致进攻',
    description: '偏重升重、伤害、攻速与暴击。',
  },
  { id: 'custom', name: '指定法宝', description: '按顺位培养最多六件指定法宝。' },
] as const;
export const AUTOPLAY_TARGET_SLOTS = 6;
export type AutoplayBuildMode = (typeof AUTOPLAY_BUILDS)[number]['id'];
export interface AutoplayBuild {
  mode: AutoplayBuildMode;
  targets: string[];
}
export function defaultAutoplayBuild(): AutoplayBuild {
  return { mode: 'default', targets: Array(AUTOPLAY_TARGET_SLOTS).fill('') };
}
const validTarget = (id: string) => id === '' || TREASURES.some((t) => t.id === id);
export function validAutoplayBuild(value: unknown): value is AutoplayBuild {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const b = value as AutoplayBuild;
  return (
    Object.keys(b).every((key) => key === 'mode' || key === 'targets') &&
    AUTOPLAY_BUILDS.some((mode) => mode.id === b.mode) &&
    Array.isArray(b.targets) &&
    b.targets.length === AUTOPLAY_TARGET_SLOTS &&
    b.targets.every(validTarget) &&
    new Set(b.targets.filter(Boolean)).size === b.targets.filter(Boolean).length
  );
}
// 旧存档的两件目标即第一、第二顺位，其余槽位补空后按新结构校验。
export function migrateAutoplayBuild(value: unknown): AutoplayBuild | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const b = value as AutoplayBuild;
  if (!Array.isArray(b.targets) || b.targets.length !== 2) return null;
  const migrated = { ...b, targets: [...b.targets, ...Array(AUTOPLAY_TARGET_SLOTS - 2).fill('')] };
  return validAutoplayBuild(migrated) ? migrated : null;
}
export function changeAutoplayBuild(current: AutoplayBuild, field: string, value: string) {
  const next: AutoplayBuild = { mode: current.mode, targets: [...current.targets] };
  if (field === 'mode') {
    if (!AUTOPLAY_BUILDS.some((b) => b.id === value)) return null;
    next.mode = value as AutoplayBuildMode;
  } else if (/^[0-5]$/.test(field)) {
    if (!validTarget(value)) return null;
    const slot = Number(field);
    next.targets[slot] = value;
    if (value)
      next.targets = next.targets.map((id, index) =>
        index === slot ? value : id === value ? '' : id,
      );
  } else return null;
  return next;
}

// 只给实际抽到的机缘排序；不修改候选、随机数、走位或战斗属性。
export function buildChoiceScore(c: Choice, g: Game, original: number) {
  const build = g.save.autoplayBuild;
  if (!build || build.mode === 'default') return original;
  const targets =
    build.mode === 'native'
      ? [g.weapons[0]?.id].filter((id): id is NonNullable<typeof id> => !!id)
      : build.targets.filter((id) => id && allowsSchool(g.path, treasure(id).school));
  const rank = (id: string) => targets.indexOf(id);
  if (build.mode !== 'survival' && build.mode !== 'offense' && !targets.length) return original;
  if (c.type === 'evolve') return original;
  const hp = g.player.hp / g.player.maxHp;
  if (c.type === 'heal') {
    if (hp < 0.3) return 120;
    if (build.mode === 'offense') return -10;
    if (hp < (build.mode === 'survival' ? 0.65 : 0.5)) return 95;
    return original;
  }
  const protective = ['guard', 'bone', 'duration', 'devour'];
  if (hp < 0.35 && c.type === 'passive' && protective.includes(c.id)) return Math.max(original, 96);
  if (build.mode === 'offense') {
    if (original >= 50) return original;
    if (c.type === 'weapon') return original + (c.level > 1 ? 10 : 3);
    if (c.type === 'passive') {
      if (['power', 'blood', 'haste', 'frenzy'].includes(c.id)) return original + 10;
      if (['crit', 'curse', 'spirit', 'forbidden'].includes(c.id)) return original + 8;
      if (protective.includes(c.id)) return original - 10;
    }
    return original;
  }
  if (build.mode === 'survival') {
    if (original >= 50) return original;
    if (c.type === 'passive') {
      const established = g.weapons.some((w) => w.level >= 3);
      if (c.id === 'guard' || c.id === 'bone') {
        const protectedAlready = (g.passives.guard || 0) + (g.passives.bone || 0) > 0;
        return Math.max(
          original,
          (established || !protectedAlready ? 32 : 18) + (hp < 0.6 ? 10 : 0),
        );
      }
      if (c.id === 'duration' || c.id === 'devour')
        return Math.max(original, (established ? 25 : 18) + (hp < 0.6 ? 10 : 0));
      if (['blood', 'frenzy', 'curse', 'forbidden'].includes(c.id)) return original - 6;
    }
    return original;
  }
  if (c.type === 'weapon' && targets.includes(c.id as (typeof targets)[number])) {
    const order = rank(c.id);
    return Math.max(76 + c.level - order * 2, Math.min(85 - order * 2, original + 8));
  }
  const recipes: string[] = [];
  const planned = new Set(Object.keys(g.passives));
  for (const [order, id] of targets.entries()) {
    const owned = g.weapons.find((w) => w.id === id);
    const required = g.evolutionRequirements(id);
    if (!owned || owned.evolved || required.some((p) => (g.passives[p] || 0) >= MAX_PASSIVE_LEVEL))
      continue;
    const known = required
      .filter((p) => g.passives[p])
      .sort((a, b) => g.passives[b] - g.passives[a]);
    const recipe =
      known[0] ??
      required.find((p) =>
        g.choices.some((choice) => choice.type === 'passive' && choice.id === p),
      ) ??
      required[0];
    if (!recipe) continue;
    if (!planned.has(recipe) && planned.size >= MAX_PASSIVES) break;
    planned.add(recipe);
    if (!g.passives[recipe]) recipes.push(recipe);
    if (c.type === 'passive' && c.id === recipe) return Math.max(original, 88 + c.level - order);
  }
  // 培养目标尚未成型时留出末格；只守前两个顺位，避免为靠后目标长期空等。
  if (c.type === 'weapon' && c.level === 1 && g.time < Math.min(120, g.stageDuration * 0.6)) {
    const missing = targets.slice(0, 2).filter((id) => !g.weapons.some((w) => w.id === id)).length;
    if (missing > 0 && MAX_WEAPONS - g.weapons.length <= missing)
      return original - (original >= 77 ? 100 : 20);
  }
  if (
    c.type === 'passive' &&
    !g.passives[c.id] &&
    Object.keys(g.passives).length === MAX_PASSIVES - 1 &&
    recipes.length &&
    !recipes.includes(c.id)
  )
    return original - 20;
  return original;
}
