export const IRON_MARKET_LIMIT = 100;
export const ironMarketPeriod = (age: number) => Math.max(0, Math.floor((age - 15 + 1e-9) / 10));
export interface IronMarketState {
  period: number;
  bought: number;
}
export function validIronMarket(value: unknown, age: number): value is IronMarketState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as IronMarketState;
  return (
    Number.isSafeInteger(v.period) &&
    v.period >= 0 &&
    v.period <= ironMarketPeriod(age) &&
    Number.isSafeInteger(v.bought) &&
    v.bought >= 0 &&
    v.bought <= IRON_MARKET_LIMIT
  );
}
