import { TREASURES, PASSIVES } from './data.ts';

// 图集按数据表顺序排列；每格一件物品，三个法宝图集与一个功法图集。
export function itemArt(id: string) {
  const weapon = TREASURES.findIndex((item) => item.id === id);
  const manual = PASSIVES.findIndex((item) => item.id === id);
  if (weapon < 0 && manual < 0) return null;
  const index = weapon >= 0 ? weapon % 12 : manual;
  return {
    src:
      weapon >= 0
        ? `/assets/treasures-${Math.floor(weapon / 12) + 1}.png`
        : '/assets/cultivation-manuals.png',
    column: index % 4,
    row: Math.floor(index / 4),
    rows: weapon >= 0 ? 3 : 4,
  };
}
