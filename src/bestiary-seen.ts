import { ENEMIES, STAGES } from './data.ts';

export interface BestiarySeen {
  enemies: number[];
  bosses: number[];
}
export const freshBestiarySeen = (): BestiarySeen => ({ enemies: [], bosses: [] });
const ids = (value: unknown, limit: number) =>
  Array.isArray(value)
    ? [
        ...new Set(
          value.filter((id): id is number => Number.isInteger(id) && id >= 0 && id < limit),
        ),
      ]
    : [];

export function restoreBestiarySeen(
  value: unknown,
  completed: readonly number[] = [],
): BestiarySeen {
  if (value === undefined)
    return { enemies: ENEMIES.map((_, id) => id), bosses: STAGES.map((_, id) => id) };
  const saved =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Partial<BestiarySeen>)
      : {};
  return {
    enemies: ids(saved.enemies, ENEMIES.length),
    bosses: ids(Array.isArray(saved.bosses) ? saved.bosses : completed, STAGES.length),
  };
}

// 只追加实际出生的种类，重复遭遇不写入重复项，不取随机数、不改变战况。
export function recordBestiarySeen(seen: BestiarySeen, id: number, boss = false) {
  const list = boss ? seen.bosses : seen.enemies;
  if (
    Number.isInteger(id) &&
    id >= 0 &&
    id < (boss ? STAGES.length : ENEMIES.length) &&
    !list.includes(id)
  )
    list.push(id);
}
