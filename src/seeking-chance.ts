import type { SaveData } from './progress.ts';
import { curioRoll } from './curio-data.ts';

export const seekingAttempts = (save: SaveData, key: string) =>
  save.mortal.marketVenues?.seeking?.[key] ?? 0;

// 每件物品的报价十年一轮；浏览、换入口与刷新不能重抽行情。
export function seekingChance(save: SaveData, key: string, sect = false) {
  const cycle = Math.floor(save.age / 10);
  return (
    35 + (curioRoll(save.curios.seed, `seeking-offer:${key}:${cycle}`) % 8) * 5 + (sect ? 5 : 0)
  );
}

export function seekingPrice(value: number, chance: number, sectTier?: number) {
  return Math.ceil(
    (Math.max(1, value) * chance * (sectTier === undefined ? 135 : 115 - sectTier * 5)) / 10000,
  );
}

// 同一件物品的第N次尝试只抽一次；失败也写次数，只有外层保存成功后才应用。
export function resolveSeeking(save: SaveData, key: string, chance: number) {
  const attempt = seekingAttempts(save, key);
  if (!Number.isSafeInteger(attempt + 1)) return undefined;
  const found =
    curioRoll(save.curios.seed, `item-seeking:${key}:${attempt}`) / 0x100000000 < chance / 100;
  const state = (save.mortal.marketVenues ??= { workAt: null, favorAt: null, receipts: [] });
  (state.seeking ??= {})[key] = attempt + 1;
  return found;
}
