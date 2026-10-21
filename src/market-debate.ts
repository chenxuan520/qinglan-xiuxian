import { FINAL_TRIAL_STAGE } from './data.ts';
import { MEDICINES } from './medicine-data.ts';
import { medicineRecipePrice } from './medicine.ts';
import { realmInfo, type SaveData } from './progress.ts';
import { marketContact } from './market-relations.ts';
import { marketSocialRoll } from './market-social-data.ts';
import {
  isMarketTraderId,
  marketCultivators,
  marketIdentity,
  marketMedicinePool,
  type MarketCultivatorId,
} from './sect-market-data.ts';

// 丹方知识固定于真实人物；换摊位、重逢或买卖不重抽。
export function debateRecipeOffer(save: SaveData, id: MarketCultivatorId) {
  const state = save.mortal.sectMarket,
    population = save.mortal.population;
  if (!state || !population || !isMarketTraderId(id)) return undefined;
  const npc = marketCultivators(population, state).find((n) => n.id === id);
  if (
    !npc ||
    npc.realmIndex < realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).index
  )
    return undefined;
  const identity = marketIdentity(state, id);
  const pool = marketMedicinePool(population, state, id).filter(
    (m) => m.years > 0 && m.tier !== '凡品',
  );
  const ordered = [...pool].sort(
    (a, b) =>
      marketSocialRoll(
        population,
        identity.birthVisit,
        `debate-knowledge:${identity.slot}:${a.id}`,
      ) -
        marketSocialRoll(
          population,
          identity.birthVisit,
          `debate-knowledge:${identity.slot}:${b.id}`,
        ) || a.id.localeCompare(b.id),
  );
  const taught = marketContact(save, id)?.taughtRecipes ?? [];
  const known = new Set([
    ...ordered.slice(0, Math.ceil(ordered.length / 2)).map((m) => m.id),
    ...taught,
  ]);
  const recipe = ordered.find((m) => known.has(m.id) && !save.medicine.recipes.includes(m.id));
  if (!recipe) return undefined;
  const exchange = pool.find(
    (m) => m.tier === recipe.tier && save.medicine.recipes.includes(m.id) && !known.has(m.id),
  );
  return { id: recipe.id, price: medicineRecipePrice(recipe.id), exchange: exchange?.id };
}

export function debateThanks(save: SaveData, id: MarketCultivatorId) {
  const c = marketContact(save, id),
    state = save.mortal.sectMarket;
  if (
    !c ||
    !state ||
    !save.mortal.population ||
    c.dead ||
    c.grudge ||
    c.goodwill <= 0 ||
    c.aidAt === undefined ||
    c.aidVisit === undefined ||
    c.aidVisit >= state.visit ||
    c.birthVisit >= state.visit ||
    c.debateGiftAt !== undefined
  )
    return undefined;
  const common = MEDICINES.filter((m) => m.tier === '凡品');
  return common[
    marketSocialRoll(save.mortal.population!, c.birthVisit, `debate-thanks:${c.slot}`) %
      common.length
  ].id;
}

export function debateQuote(save: SaveData, id: MarketCultivatorId, choice = 'talk') {
  if (choice === 'talk') {
    const gift = debateThanks(save, id);
    return gift
      ? { kind: 'medicine' as const, id: gift, price: 0 }
      : { kind: 'insight' as const, price: 0 };
  }
  const [method, recipe, exchange, extra] = choice.split(':');
  const offer = debateRecipeOffer(save, id);
  if (!offer || extra !== undefined || recipe !== offer.id) return undefined;
  if (method === 'pay' && exchange === undefined)
    return { kind: 'recipe' as const, id: recipe, price: offer.price };
  if (method === 'swap' && exchange !== undefined && exchange === offer.exchange)
    return { kind: 'recipe' as const, id: recipe, price: 0, exchange };
  return undefined;
}
