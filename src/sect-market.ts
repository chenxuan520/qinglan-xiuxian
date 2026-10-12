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
  isMarketCultivatorId,
  isMarketTraderId,
  marketMedicinePool,
  type MarketCultivatorId,
} from './sect-market-data.ts';
import { SECT_MARKET_SETTINGS } from './setting.ts';

export function sectMarketOpen(save: SaveData) {
  return save.cultivation > 0 && !save.journeyEnded && !save.pendingReincarnation;
}
export function beginSectMarketVisit(save: SaveData) {
  if (!sectMarketOpen(save)) return false;
  if (save.mortal.marketSocial?.ambush) return false;
  const visit = (save.mortal.sectMarket?.visit ?? 0) + 1;
  if (!Number.isSafeInteger(visit)) return false;
  save.mortal.sectMarket = {
    openedAt: save.age,
    visit,
    realmIndex: realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).index,
    exchanged: [],
  };
  if (save.mortal.auction) {
    save.mortal.auction.visit = visit;
    save.mortal.auction.closed = [];
  }
  save.mortal.auction ??= { visit, closed: [], releasedArtifacts: [], history: [] };
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
  if (!state || !isMarketTraderId(id)) return undefined;
  const pool = marketMedicinePool(save.mortal.population!, state, id);
  const index = MARKET_CULTIVATORS.findIndex((npc) => npc.id === id);
  const seed = (save.medicine.recipeSeed ^ Math.imul(state.visit, 2654435761)) >>> 0;
  return pool[(seed + index) % pool.length];
}
export function sectMarketExchangeReason(
  save: SaveData,
  id: MarketCultivatorId,
  giveId: string,
  visit: number,
) {
  const state = save.mortal.sectMarket;
  if (!sectMarketOpen(save) || !state || !isMarketCultivatorId(id)) return '暂时无法互换';
  if (lifespanInfo(save).remaining <= 0 || tribulationDue(save) || sectDuesPending(save))
    return '请先处理寿元、天劫或供奉';
  if (state.visit !== visit) return '来访修士已更换，请重新交谈';
  if (state.exchanged.includes(id)) return '本批已互换';
  const received = sectMarketOffer(save, id);
  if (
    !received ||
    received.id === giveId ||
    !marketMedicinePool(save.mortal.population!, state, id).some(
      (m) => m.id === giveId && !!m.years === !!received.years,
    )
  )
    return '请选同品级、同类的另一种丹药';
  if ((save.medicine.bag[giveId] || 0) < SECT_MARKET_SETTINGS.exchangeCost)
    return '所选丹药不足两份';
  if (!Number.isSafeInteger((save.medicine.bag[received.id] || 0) + 1)) return '丹囊数量已达上限';
  return '';
}
// 调用者在独立存档副本上互换，成功保存后才应用；对话或 AI 不调用此函数。
export function exchangeSectMedicine(
  save: SaveData,
  id: MarketCultivatorId,
  giveId: string,
  visit: number,
) {
  if (sectMarketExchangeReason(save, id, giveId, visit)) return false;
  const received = sectMarketOffer(save, id)!;
  const given = marketMedicinePool(save.mortal.population!, save.mortal.sectMarket!, id).find(
    (m) => m.id === giveId,
  )!;
  save.medicine.bag[giveId] -= SECT_MARKET_SETTINGS.exchangeCost;
  save.medicine.bag[received.id] = (save.medicine.bag[received.id] || 0) + 1;
  save.mortal.sectMarket!.exchanged.push(id);
  const text = `宗门坊市：以${given.name}两份换得${received.name}一份，已收入丹囊。`;
  save.mortal.events.unshift(`${save.age.toFixed(1)} 岁 · ${text}`);
  save.mortal.events.splice(6);
  recordChronicle(save, '同道互通', text);
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
