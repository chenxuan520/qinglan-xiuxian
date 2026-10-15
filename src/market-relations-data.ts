import { medicineInfo } from './medicine-data.ts';
import { isMarketTraderId, type MarketTraderId, type SectMarketState } from './sect-market-data.ts';

export const MAX_MARKET_CONTACTS = 8;
export interface MarketIdentity {
  birthVisit: number;
  slot: MarketTraderId;
}
export interface MarketContact extends MarketIdentity {
  realmIndex: number;
  metAt: number;
  seenAt: number;
  lastVisit: number;
  goodwill: number;
  grudge: number;
  dead: boolean;
  tradeVisit: number;
  aidVisit?: number;
  aidAt?: number;
  debateGiftAt?: number;
  taughtRecipes?: string[];
}
export interface MarketRelationsState {
  contacts: MarketContact[];
}
export function validMarketRelations(
  value: unknown,
  age: number,
  market: SectMarketState | undefined,
): value is MarketRelationsState {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !market) return false;
  const contacts = (value as MarketRelationsState).contacts;
  const integer = (n: unknown, max: number) =>
    Number.isSafeInteger(n) && Number(n) >= 0 && Number(n) <= max;
  return (
    Array.isArray(contacts) &&
    contacts.length <= MAX_MARKET_CONTACTS &&
    new Set(contacts.map((c) => `${c?.birthVisit}:${c?.slot}`)).size === contacts.length &&
    (market.returning ?? []).every((r) =>
      contacts.some(
        (c) =>
          !!c &&
          c.birthVisit === r.birthVisit &&
          c.slot === r.birthSlot &&
          (!c.dead || market.absent?.includes(r.slot)) &&
          c.realmIndex === r.realmIndex,
      ),
    ) &&
    contacts.every(
      (c) =>
        !!c &&
        integer(c.birthVisit, market.visit) &&
        c.birthVisit > 0 &&
        isMarketTraderId(c.slot) &&
        integer(c.realmIndex, 7) &&
        typeof c.metAt === 'number' &&
        Number.isFinite(c.metAt) &&
        c.metAt >= 15 &&
        c.metAt <= age &&
        typeof c.seenAt === 'number' &&
        Number.isFinite(c.seenAt) &&
        c.seenAt >= c.metAt &&
        c.seenAt <= age &&
        integer(c.lastVisit, market.visit) &&
        c.lastVisit >= c.birthVisit &&
        integer(c.goodwill, 3) &&
        integer(c.grudge, 3) &&
        typeof c.dead === 'boolean' &&
        integer(c.tradeVisit, c.lastVisit) &&
        (c.debateGiftAt === undefined ||
          (c.aidAt !== undefined &&
            typeof c.debateGiftAt === 'number' &&
            Number.isFinite(c.debateGiftAt) &&
            c.debateGiftAt >= c.metAt &&
            c.debateGiftAt <= age)) &&
        (c.taughtRecipes === undefined ||
          (Array.isArray(c.taughtRecipes) &&
            c.taughtRecipes.length <= 16 &&
            new Set(c.taughtRecipes).size === c.taughtRecipes.length &&
            c.taughtRecipes.every((id) => {
              const m = typeof id === 'string' ? medicineInfo(id) : undefined;
              return !!m && m.years > 0 && m.tier !== '凡品';
            }))) &&
        ((c.aidAt === undefined && c.aidVisit === undefined) ||
          (integer(c.aidVisit, c.lastVisit) &&
            Number(c.aidVisit) >= c.birthVisit &&
            typeof c.aidAt === 'number' &&
            Number.isFinite(c.aidAt) &&
            c.aidAt >= c.metAt &&
            c.aidAt <= age)),
    )
  );
}
