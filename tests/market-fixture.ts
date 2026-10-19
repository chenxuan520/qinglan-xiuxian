import type { SaveData } from '../src/progress.ts';
import { beginSectMarketVisit } from '../src/sect-market.ts';

// 需要新一批修士的场景先推进到合法换批年岁；首次进入不改测试年岁。
export function enterNextMarketBatch(save: SaveData) {
  if (save.mortal.sectMarket) save.age = Math.max(save.age, save.mortal.sectMarket.openedAt + 1);
  return beginSectMarketVisit(save);
}
