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
