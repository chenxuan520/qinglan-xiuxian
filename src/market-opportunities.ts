import { TREASURES } from './data.ts';
import type { AuctionItem } from './auction-data.ts';
import { marketSocialRoll } from './market-social-data.ts';
import {
  isMarketTraderId,
  marketCultivators,
  marketIdentity,
  marketMedicinePool,
  type MarketCultivatorId,
  type SectMarketState,
} from './sect-market-data.ts';
import type { TownPopulation } from './town-population.ts';

/** Promises use the fixed visitor, never the player's inventory, realm or inspection result. */
export function marketInvitationReward(
  population: TownPopulation,
  market: SectMarketState,
  id: MarketCultivatorId,
) {
  if (!isMarketTraderId(id)) return undefined;
  const npc = marketCultivators(population, market).find((n) => n.id === id);
  if (!npc) return undefined;
  const identity = marketIdentity(market, id);
  const roll = (key: string) =>
    marketSocialRoll(
      population,
      market.visit,
      `invitation:${identity.birthVisit}:${identity.slot}:${key}`,
    );
  const artifact = roll('kind') % (identity.slot === 'market-alchemist' ? 4 : 2) === 0;
  let item: AuctionItem;
  if (artifact) {
    const pool = TREASURES.filter(
      (t) => t.school === (npc.path === 'demonic' ? 'demonic' : 'orthodox'),
    );
    const cap = Math.min(4, Math.max(1, Math.ceil(npc.realmIndex / 2)));
    item = {
      kind: 'artifact',
      id: pool[roll('artifact') % pool.length].id,
      quantity: 1,
      forgeLevel: Math.max(1, cap - (roll('forge') % 2)),
    };
  } else {
    // Keep the NPC's tier and pick from its highest available stage. Permanent root/lifespan
    // medicines remain in the existing paid trades rather than a repeatable invitation gift.
    const allowed = marketMedicinePool(population, market, id).filter((m) => m.years > 0);
    const highestStage = Math.max(...allowed.map((m) => m.stage));
    const pool = allowed.filter((m) => m.stage === highestStage);
    item = {
      kind: 'medicine',
      id: pool[roll('medicine') % pool.length].id,
      quantity: npc.realmIndex < 3 ? 2 : 1,
      forgeLevel: 0,
    };
  }
  return {
    item,
    title: artifact ? '坊外取宝之邀' : '坊外取丹之邀',
    purpose: artifact
      ? '他称有一件法宝寄存在坊外旧居，愿以此物酬谢同行照应。此行若顺利，便按眼前说定的炼器阶数交付。'
      : '他称山中还留着一批封存的余丹，请你同行照应，愿按眼前说定的品种与数量分给你；丹药收入丹囊，由你自行取用。',
  };
}
