import { prepareCurioConsignment } from './curio-data.ts';
import { FINAL_TRIAL_STAGE } from './data.ts';
import { lifespanInfo, realmInfo, tribulationDue, type SaveData } from './progress.ts';
import { sectDuesPending } from './mortal.ts';
import { recordChronicle } from './chronicle.ts';
import { moveInTown, type TownPoint } from './town.ts';
import {
  MARKET_BUILDINGS,
  MARKET_WIDTH,
  MARKET_HEIGHT,
  MARKET_CULTIVATORS,
  isMarketTraderId,
  marketMedicinePool,
  marketIdentity,
  type MarketCultivatorId,
} from './sect-market-data.ts';
import {
  marketExchangeDeals,
  exchangeGiveText,
  exchangeItemText,
  exchangeOwned,
} from './market-exchange.ts';
import { releaseAuctionItem } from './auction-items.ts';
import { auctionHallForRealm } from './auction-data.ts';
import { marketTradeMotive } from './market-trade-motives.ts';
import {
  marketContact,
  prepareMarketOpportunity,
  rememberMarketTrade,
  returningMarketContact,
} from './market-relations.ts';

export function sectMarketOpen(save: SaveData) {
  return save.cultivation > 0 && !save.journeyEnded && !save.pendingReincarnation;
}
export function beginSectMarketVisit(save: SaveData) {
  if (!sectMarketOpen(save)) return false;
  if (save.mortal.marketSocial?.ambush) return false;
  if (save.mortal.sectMarket && save.age < save.mortal.sectMarket.openedAt + 1 - 1e-9) return true;
  const visit = (save.mortal.sectMarket?.visit ?? 0) + 1;
  if (!Number.isSafeInteger(visit)) return false;
  const returning = returningMarketContact(save, visit);
  save.mortal.sectMarket = {
    openedAt: save.age,
    visit,
    realmIndex: realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).index,
    exchanged: [],
    ...(returning ? { returning } : {}),
  };
  prepareMarketOpportunity(save);
  prepareCurioConsignment(save);
  if (save.mortal.auction) {
    save.mortal.auction.visit = visit;
    save.mortal.auction.closed = [];
    delete save.mortal.auction.curioSlot;
    save.mortal.auction.hall = Math.max(
      auctionHallForRealm(save.mortal.sectMarket.realmIndex),
      save.mortal.auction.paidHall ?? 0,
    ) as 0 | 1 | 2;
  }
  save.mortal.auction ??= {
    visit,
    hall: auctionHallForRealm(save.mortal.sectMarket.realmIndex),
    closed: [],
    releasedArtifacts: [],
    history: [],
  };
  const special = save.curios.consignment;
  save.mortal.auction.curioSlot = special?.id ? { id: special.id, cycle: special.cycle } : null;
  save.mortal.marketSocial ??= {
    visit,
    fulfilled: [],
    used: [],
    inspected: [],
    lastDebateAt: null,
    lastOpportunityAt: null,
    ambush: null,
    logs: [],
  };
  save.mortal.marketSocial.visit = visit;
  save.mortal.marketSocial.fulfilled = [];
  save.mortal.marketSocial.used = [];
  save.mortal.marketSocial.inspected = [];
  return true;
}
export function sectMarketOffer(save: SaveData, id: MarketCultivatorId) {
  const state = save.mortal.sectMarket;
  if (!state || !isMarketTraderId(id) || state.absent?.includes(id)) return undefined;
  const motive = marketTradeMotive(save, id);
  if (!motive) return undefined;
  const all = marketMedicinePool(save.mortal.population!, state, id),
    spare = all.filter((medicine) => !motive.preferredMedicineIds.includes(medicine.id)),
    pool = spare.length ? spare : all,
    identity = marketIdentity(state, id),
    index = MARKET_CULTIVATORS.findIndex((npc) => npc.id === identity.slot),
    seed = (save.medicine.recipeSeed ^ Math.imul(identity.birthVisit, 2654435761)) >>> 0;
  return pool[(seed + index) % pool.length];
}
export function sectMarketDeals(save: SaveData, id: MarketCultivatorId) {
  const receive = sectMarketOffer(save, id);
  return receive ? marketExchangeDeals(save, id, receive) : [];
}
export function sectMarketExchangeReason(
  save: SaveData,
  id: MarketCultivatorId,
  dealId: string,
  visit: number,
  unfinished = false,
) {
  const state = save.mortal.sectMarket;
  if (!sectMarketOpen(save) || !state || !isMarketTraderId(id)) return '暂时无法互换';
  if (lifespanInfo(save).remaining <= 0 || tribulationDue(save) || sectDuesPending(save))
    return '请先处理寿元、天劫或供奉';
  if (save.mortal.marketSocial?.ambush) return '请先处理尚未结束的劫修遭遇';
  if (state.visit !== visit) return '来访修士已更换，请重新交谈';
  if (state.absent?.includes(id) || marketContact(save, id)?.dead)
    return '这名劫修已经身死，无法再交易';
  if (state.exchanged.includes(id)) return '本批已互换';
  const deal = sectMarketDeals(save, id).find((d) => d.id === dealId);
  if (!deal) return '报价已变化，请重新选择';
  if (
    deal.give.some((i) => i.kind === 'artifact') &&
    (unfinished || save.tribulationReturn != null)
  )
    return '请先结束未完成的历练，再交换法宝';
  if (deal.give.some((i) => i.kind === 'artifact' && i.id === save.starter))
    return '当前本命不可交换';
  if (!exchangeOwned(save, deal)) return '所需物品不足，请选择其他报价';
  if (!Number.isSafeInteger((save.medicine.bag[deal.receive.id] || 0) + deal.receive.quantity))
    return '丹囊数量已达上限';
  return '';
}
// 在独立存档副本上结算，成功写入后再应用；对话不能扣物资。
export function exchangeSectMedicine(
  save: SaveData,
  id: MarketCultivatorId,
  dealId: string,
  visit: number,
  unfinished = false,
) {
  if (sectMarketExchangeReason(save, id, dealId, visit, unfinished)) return false;
  const deal = sectMarketDeals(save, id).find((d) => d.id === dealId)!;
  for (const item of deal.give) releaseAuctionItem(save, item);
  save.medicine.bag[deal.receive.id] =
    (save.medicine.bag[deal.receive.id] || 0) + deal.receive.quantity;
  save.mortal.sectMarket!.exchanged.push(id);
  rememberMarketTrade(save, id);
  const text = `宗门坊市：以${exchangeGiveText(deal)}换得${exchangeItemText(deal.receive)}，已收入丹囊。`;
  save.mortal.events.unshift(`${save.age.toFixed(1)} 岁 · ${text}`);
  save.mortal.events.splice(6);
  recordChronicle(save, '同道互通', text);
  if (
    deal.give.some((item) => item.kind === 'artifact') &&
    deal.give.some((item) => item.kind === 'medicine')
  )
    recordChronicle(save, '以物结缘', text, 'mixed-exchange');
  return true;
}
export function moveInSectMarket(position: TownPoint, input: TownPoint, seconds: number) {
  const next = moveInTown(position, input, seconds, MARKET_BUILDINGS, 260);
  return {
    x: Math.max(24, Math.min(MARKET_WIDTH - 24, next.x)),
    y: Math.max(24, Math.min(MARKET_HEIGHT - 24, next.y)),
  };
}
export function nearbyMarketCultivator(
  position: TownPoint,
  residents: readonly (TownPoint & { id: MarketCultivatorId })[] = MARKET_CULTIVATORS,
) {
  return residents
    .map((npc) => ({
      npc,
      distance: Math.hypot(npc.x - position.x, npc.y - position.y),
    }))
    .filter(({ distance }) => distance <= 145)
    .sort((a, b) => a.distance - b.distance)[0]?.npc.id;
}
