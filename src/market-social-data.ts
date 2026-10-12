import {
  isMarketCultivatorId,
  type MarketCultivatorId,
  type SectMarketState,
} from './sect-market-data.ts';
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
    Array.isArray(v) &&
    v.length <= 3 &&
    new Set(v).size === v.length &&
    v.every(isMarketCultivatorId);
  return (
    visit(s.visit) &&
    ids(s.fulfilled) &&
    ids(s.used) &&
    ids(s.inspected) &&
    (s.lastDebateAt === null || at(s.lastDebateAt)) &&
    (s.lastOpportunityAt === null || at(s.lastOpportunityAt)) &&
    (s.ambush === null ||
      (!!s.ambush &&
        visit(s.ambush.visit) &&
        s.ambush.visit === s.visit &&
        isMarketCultivatorId(s.ambush.npcId) &&
        s.used.includes(s.ambush.npcId) &&
        at(s.ambush.at) &&
        Number.isSafeInteger(s.ambush.held) &&
        s.ambush.held >= 0 &&
        s.ambush.held <= 80)) &&
    Array.isArray(s.logs) &&
    s.logs.length <= 12 &&
    s.logs.every(
      (l) =>
        !!l &&
        visit(l.visit) &&
        isMarketCultivatorId(l.npcId) &&
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
