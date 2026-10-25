import { TREASURES, treasure } from './data.ts';
import { medicineInfo } from './medicine-data.ts';
import { forgeCost, type SaveData } from './progress.ts';
import { advanceMortal } from './mortal.ts';
import { sectMarketOpen } from './sect-market.ts';
import { serviceDues, serviceReason } from './service-preflight.ts';
import { auctionItemName, releaseAuctionItem } from './auction-items.ts';
import type { AuctionItem } from './auction-data.ts';
import { venueStamp } from './market-venues.ts';
import { recordChronicle } from './chronicle.ts';

export type MarketShopId = 'medicine' | 'stalls';
export const MARKET_SHOP_YEARS = 0.5;
export const MARKET_SHOP_COOLDOWN = 10;
export const SALVAGE_RATE = 0.4;
export interface MarketShopQuote {
  kind: 'exchange' | 'salvage';
  title: string;
  stones: number;
  reserve: number;
  give: AuctionItem[];
  receive: AuctionItem[];
  reason: string;
}
const pill = (id: string, quantity = 1): AuctionItem => ({
  kind: 'medicine',
  id,
  quantity,
  forgeLevel: 0,
});

// 炼器返还只认本件累计玄铁投入，不认法宝估值，也不返灵石。
export function salvageIron(level: number) {
  let spent = 0;
  for (let i = 0; i < level; i++) spent += forgeCost(i).iron;
  return Math.floor(spent * SALVAGE_RATE);
}

export function marketShopCooldown(save: SaveData) {
  const at = save.mortal.marketVenues?.shops?.exchangeAt;
  return at != null && save.age < at + MARKET_SHOP_COOLDOWN - 1e-9
    ? `再过${Math.ceil((at + MARKET_SHOP_COOLDOWN - save.age - 1e-9) * 10) / 10}年可再调剂`
    : '';
}

export function marketShopQuote(
  save: SaveData,
  venue: MarketShopId,
  choice: string,
  unfinished = false,
): MarketShopQuote {
  const q: MarketShopQuote = {
    kind: venue === 'medicine' ? 'exchange' : 'salvage',
    title: '',
    stones: 0,
    reserve: serviceDues(save, MARKET_SHOP_YEARS),
    give: [],
    receive: [],
    reason: '',
  };
  const invalid = (reason: string) => {
    q.reason = reason;
    return q;
  };
  if (venue !== 'medicine' && venue !== 'stalls') return invalid('此处不办理购货');
  if (venue === 'medicine') {
    const [fromId, toId, extra] = choice.split('@');
    const from = medicineInfo(fromId),
      to = medicineInfo(toId);
    if (
      extra !== undefined ||
      !from?.years ||
      !to?.years ||
      from.id === to.id ||
      from.tier !== to.tier
    )
      return invalid('请选择两种不同的同品时效丹');
    q.title = '余丹调剂';
    q.give = [pill(from.id, 2)];
    q.receive = [pill(to.id)];
    if ((save.medicine.bag[from.id] || 0) < 2) return invalid('这味丹药不足两份');
  } else if (venue === 'stalls') {
    if (!TREASURES.some((t) => t.id === choice)) return invalid('请选择要拆解的旧器');
    if (choice === save.starter) return invalid('本命法宝不可拆解');
    if (!save.artifacts.includes(choice)) return invalid('这件法宝已不在收藏中');
    const level = save.forge[choice] || 0,
      iron = salvageIron(level);
    if (!iron) return invalid('此宝尚无可回收的炼器用材');
    q.title = `拆解${treasure(choice).name}`;
    q.give = [{ kind: 'artifact', id: choice, quantity: 1, forgeLevel: level }];
    q.receive = [{ kind: 'iron', id: 'iron', quantity: iron, forgeLevel: 0 }];
  }
  if (!sectMarketOpen(save) || !save.mortal.population || !save.mortal.sectMarket)
    return invalid('请先进入坊市');
  const reason = serviceReason(save, MARKET_SHOP_YEARS, unfinished || !!save.tribulationReturn);
  if (reason) return invalid(reason);
  if (q.kind !== 'salvage') {
    const cooldown = marketShopCooldown(save);
    if (cooldown) return invalid(cooldown);
  }
  if (save.stones < q.stones + q.reserve) return invalid('请备足价款与到期供奉');
  for (const item of q.receive) {
    const held = item.kind === 'iron' ? save.iron : save.medicine.bag[item.id] || 0;
    if (!Number.isSafeInteger(held + item.quantity)) return invalid('行囊数量已达上限');
  }
  return q;
}

export function marketShopStamp(save: SaveData, venue: MarketShopId, choice: string) {
  const q = marketShopQuote(save, venue, choice);
  return `${venueStamp(save)}:${venue}:${choice}:${JSON.stringify([q.stones, q.reserve, q.give, q.receive])}`;
}

// 仅对待写入副本结算；所有验价、寿元、供奉、容量与持有检查都在扣物之前完成。
export function executeMarketShop(
  save: SaveData,
  venue: MarketShopId,
  choice: string,
  stamp: string,
  unfinished = false,
) {
  if (stamp !== marketShopStamp(save, venue, choice)) return undefined;
  const q = marketShopQuote(save, venue, choice, unfinished);
  if (q.reason) return undefined;
  for (const item of q.give) releaseAuctionItem(save, item);
  save.stones -= q.stones;
  advanceMortal(save, MARKET_SHOP_YEARS * 60);
  for (const item of q.receive) {
    if (item.kind === 'iron') save.iron += item.quantity;
    else save.medicine.bag[item.id] = (save.medicine.bag[item.id] || 0) + item.quantity;
  }
  const state = (save.mortal.marketVenues ??= { workAt: null, favorAt: null, receipts: [] });
  if (q.kind !== 'salvage') {
    state.shops ??= { exchangeAt: null, caravanAt: null };
    state.shops.exchangeAt = save.age;
  }
  const items = (list: AuctionItem[]) =>
    list.map((i) => `${auctionItemName(i)} ×${i.quantity}`).join('、');
  const result = `${q.title}：${q.give.length ? `交出${items(q.give)}，` : ''}${q.stones ? `支付${q.stones}灵石，` : ''}获得${items(q.receive)}，耗时半年。${q.kind === 'salvage' ? '旧器已拆去，不再留在收藏中。' : '所得丹药已收入丹囊，未自动服用。'}`;
  state.receipts.unshift({ kind: q.kind, at: save.age, text: result });
  state.receipts.splice(6);
  save.mortal.events.unshift(`${save.age.toFixed(1)}岁 · ${result}`.slice(0, 160));
  save.mortal.events.splice(6);
  recordChronicle(save, q.title, result);
  return result;
}
