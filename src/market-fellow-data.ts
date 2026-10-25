import type { TownPopulation } from './town-population.ts';

export const MARKET_FELLOW_SETTINGS = {
  reunionYears: 5,
  outcomeYears: 10,
  remainingYears: 120,
  goldenRemainingYears: 420,
  soulYears: 80,
  soulRemainingYears: 920,
  successorYears: 80,
} as const;

// 只统一游戏故人的历史显示，不改写已保存的原始记录。
export function marketFellowRecordText(text: string) {
  if (
    !/^(?:[\d.e+]+ 岁 · )?(?:在坊市炉边结识(?:筑基)?丹修温照川|再逢温照川|迟归坊市，得知温照川|劝温照川|建议温氏后人接续旧愿|读过(?:温照川这一程的见闻|温氏后人留存的旧信与药册))/.test(
      text,
    )
  )
    return text;
  return text
    .replace('结识筑基丹修温照川', '结识丹修温照川')
    .replaceAll('温照川', '沈怀朴')
    .replaceAll('温氏后人', '沈氏后人')
    .replaceAll('温氏药册', '沈氏药册')
    .replaceAll('温氏路书', '沈氏路书');
}

export type MarketFellowChoice = 'stay' | 'travel';
export interface MarketFellowState {
  metAt: number;
  reunionAt: number | null;
  choice: MarketFellowChoice | null;
  chosenAt: number | null;
  completedAt: number | null;
}

export function validMarketFellow(
  value: unknown,
  age: number,
  population: TownPopulation | undefined,
): value is MarketFellowState {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !population) return false;
  const s = value as MarketFellowState;
  const at = (v: unknown): v is number =>
    typeof v === 'number' && Number.isFinite(v) && v >= population.since && v <= age;
  return (
    Object.keys(s).length === 5 &&
    at(s.metAt) &&
    s.metAt >= 15 &&
    Number.isFinite(s.metAt + MARKET_FELLOW_SETTINGS.remainingYears) &&
    s.metAt + MARKET_FELLOW_SETTINGS.reunionYears > s.metAt &&
    (s.reunionAt === null
      ? s.choice === null && s.chosenAt === null && s.completedAt === null
      : at(s.reunionAt) &&
        s.reunionAt >= s.metAt + MARKET_FELLOW_SETTINGS.reunionYears &&
        (s.choice === null
          ? s.chosenAt === null && s.completedAt === null
          : (s.choice === 'stay' || s.choice === 'travel') &&
            at(s.chosenAt) &&
            s.chosenAt >= s.reunionAt &&
            s.chosenAt + MARKET_FELLOW_SETTINGS.outcomeYears > s.chosenAt &&
            (s.completedAt === null ||
              (at(s.completedAt) &&
                s.completedAt >= s.chosenAt + MARKET_FELLOW_SETTINGS.outcomeYears))))
  );
}
