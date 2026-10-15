import {
  isMarketTraderId,
  type MarketCultivatorId,
  type SectMarketState,
} from './sect-market-data.ts';
import { MAX_REVIVES, REALMS, TREASURES, MAX_FORGE_LEVEL, isCultivationPath } from './data.ts';
import { medicineInfo } from './medicine-data.ts';
import type { AuctionItem } from './auction-data.ts';
import type { MarketIdentity } from './market-relations-data.ts';
import {
  validAmbushStats,
  validAmbushSnapshot,
  type AmbushStats,
  type AmbushSnapshot,
} from './market-ambush-data.ts';
import type { MarketCultivator } from './sect-market-data.ts';
import type { TownPopulation } from './town-population.ts';

export const MARKET_LOG_KINDS = [
  'debate',
  'request',
  'declined',
  'exposed',
  'fraud',
  'gift',
  'ambush',
  'victory',
  'escaped',
  'defeat',
] as const;
export interface MarketSocialLog {
  visit: number;
  npcId: MarketCultivatorId;
  at: number;
  kind: (typeof MARKET_LOG_KINDS)[number];
  text: string;
}
export interface MarketAmbush {
  visit: number;
  npcId: MarketCultivatorId;
  at: number;
  held: number;
  identity: MarketIdentity;
  npc: MarketCultivator;
  stats: AmbushStats;
  loot: AuctionItem[];
  snapshot: AmbushSnapshot;
  revivesUsed: number;
}
export interface MarketSocialState {
  visit: number;
  fulfilled: MarketCultivatorId[];
  used: MarketCultivatorId[];
  inspected: MarketCultivatorId[];
  lastDebateAt: number | null;
  lastOpportunityAt: number | null;
  ambush: MarketAmbush | null;
  logs: MarketSocialLog[];
}
export function validMarketSocial(
  value: unknown,
  age: number,
  market: SectMarketState | undefined,
): value is MarketSocialState {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !market) return false;
  const s = value as MarketSocialState;
  const visit = (v: unknown) =>
    Number.isSafeInteger(v) && Number(v) > 0 && Number(v) <= market.visit;
  const at = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= age;
  const ids = (v: unknown) =>
    Array.isArray(v) && v.length <= 3 && new Set(v).size === v.length && v.every(isMarketTraderId);
  return (
    visit(s.visit) &&
    ids(s.fulfilled) &&
    ids(s.used) &&
    ids(s.inspected) &&
    (s.lastDebateAt === null || at(s.lastDebateAt)) &&
    (s.lastOpportunityAt === null || at(s.lastOpportunityAt)) &&
    (s.ambush === null || validMarketAmbush(s.ambush, age, market, s)) &&
    Array.isArray(s.logs) &&
    s.logs.length <= 12 &&
    s.logs.every(
      (l) =>
        !!l &&
        visit(l.visit) &&
        isMarketTraderId(l.npcId) &&
        at(l.at) &&
        MARKET_LOG_KINDS.some((k) => k === l.kind) &&
        typeof l.text === 'string' &&
        l.text.length > 0 &&
        l.text.length <= 600,
    )
  );
}
export function marketSocialRoll(population: TownPopulation, visit: number, key: string) {
  let hash = population.seed;
  for (const c of `market-social:${visit}:${key}`)
    hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
  return (hash ^ (hash >>> 16)) >>> 0;
}
export function marketDisposition(
  population: TownPopulation,
  visit: number,
  id: MarketCultivatorId,
) {
  const n = marketSocialRoll(population, visit, `disposition:${id}`) % 10;
  return n < 6 ? '平和' : n < 8 ? '精明' : n === 8 ? '虚浮' : '强横';
}

export function validMarketAmbush(
  value: unknown,
  age: number,
  market: SectMarketState,
  social: Pick<MarketSocialState, 'visit' | 'used'>,
): value is MarketAmbush {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const a = value as MarketAmbush;
  const n = a.npc,
    i = a.identity;
  return (
    Number.isSafeInteger(a.visit) &&
    a.visit === market.visit &&
    a.visit === social.visit &&
    isMarketTraderId(a.npcId) &&
    social.used.includes(a.npcId) &&
    typeof a.at === 'number' &&
    Number.isFinite(a.at) &&
    a.at >= 15 &&
    a.at <= age &&
    Number.isSafeInteger(a.held) &&
    a.held >= 0 &&
    a.held <= 80 &&
    !!i &&
    Number.isSafeInteger(i.birthVisit) &&
    i.birthVisit > 0 &&
    i.birthVisit <= a.visit &&
    isMarketTraderId(i.slot) &&
    !!n &&
    n.id === a.npcId &&
    typeof n.name === 'string' &&
    n.name.length > 0 &&
    n.name.length <= 30 &&
    Number.isInteger(n.realmIndex) &&
    n.realmIndex >= 0 &&
    n.realmIndex <= 7 &&
    n.realm === REALMS[n.realmIndex] &&
    n.generation === i.birthVisit - 1 &&
    isCultivationPath(n.path) &&
    typeof n.role === 'string' &&
    n.role.length <= 30 &&
    typeof n.greeting === 'string' &&
    n.greeting.length <= 200 &&
    Number.isFinite(n.x) &&
    Number.isFinite(n.y) &&
    n.x >= 0 &&
    n.x <= 1600 &&
    n.y >= 0 &&
    n.y <= 1100 &&
    Number.isSafeInteger(a.revivesUsed) &&
    a.revivesUsed >= 0 &&
    a.revivesUsed <= MAX_REVIVES &&
    validAmbushStats(a.stats) &&
    validAmbushSnapshot(a.snapshot, a.stats) &&
    Array.isArray(a.loot) &&
    a.loot.length >= 1 &&
    a.loot.length <= 2 &&
    new Set(a.loot.map((l) => `${l?.kind}:${l?.id}`)).size === a.loot.length &&
    a.loot.every((l) => {
      if (
        !l ||
        !Number.isSafeInteger(l.quantity) ||
        l.quantity < 1 ||
        l.quantity > 2 ||
        !Number.isInteger(l.forgeLevel)
      )
        return false;
      if (l.kind === 'artifact')
        return (
          l.quantity === 1 &&
          l.forgeLevel >= 0 &&
          l.forgeLevel <= Math.min(4, MAX_FORGE_LEVEL, Math.max(1, Math.floor(n.realmIndex / 2))) &&
          TREASURES.some(
            (t) => t.id === l.id && t.school === (n.path === 'demonic' ? 'demonic' : 'orthodox'),
          )
        );
      const m = l.kind === 'medicine' ? medicineInfo(l.id) : undefined;
      return (
        !!m &&
        l.forgeLevel === 0 &&
        m.stage <= (n.realmIndex === 0 ? 0 : Math.min(6, Math.max(1, n.realmIndex - 1))) &&
        m.tier === (n.realmIndex === 0 ? '凡品' : n.realmIndex < 3 ? '灵品' : '珍品') &&
        (m.years > 0 || n.realmIndex >= 6)
      );
    })
  );
}
