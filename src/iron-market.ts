import type { SaveData } from './progress.ts';
import { ironMarketPeriod, IRON_MARKET_LIMIT } from './iron-market-data.ts';
export function ironMarket(save: SaveData) {
  const period = ironMarketPeriod(save.age);
  let h = (save.medicine.recipeSeed ^ Math.imul(period, 2654435761)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  const index = period === 0 ? 2 : (h ^ (h >>> 16)) >>> 0;
  const wave = index % 5;
  const buy = [25, 28, 30, 33, 35][wave],
    sell = [10, 11, 12, 13, 14][wave];
  const bought = save.mortal.ironMarket?.period === period ? save.mortal.ironMarket.bought : 0;
  return {
    period,
    buy,
    sell,
    remaining: IRON_MARKET_LIMIT - bought,
    bought,
    nextAge: 15 + (period + 1) * 10,
    label: ['货源充足', '行情偏低', '行情平稳', '行情偏高', '货源偏紧'][wave],
  };
}
export function ironTradeQuote(save: SaveData, buy: boolean, quantity: number) {
  const market = ironMarket(save),
    discount = buy ? (quantity >= 50 ? 10 : quantity >= 10 ? 5 : 0) : 0;
  const total = Math.ceil(((buy ? market.buy : market.sell) * quantity * (100 - discount)) / 100);
  const reason =
    !Number.isSafeInteger(quantity) || quantity < 1
      ? '请选择正整数数量'
      : !Number.isSafeInteger(total)
        ? '交易数量过大'
        : buy && quantity > market.remaining
          ? '超过本期可购额度'
          : buy && save.stones < total
            ? '灵石不足'
            : !buy && save.iron < quantity
              ? '玄铁不足'
              : !Number.isSafeInteger(buy ? save.iron + quantity : save.stones + total)
                ? '持有数量已达上限'
                : '';
  return { ...market, quantity, discount, total, reason };
}
