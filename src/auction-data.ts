import { MAX_FORGE_LEVEL, ROOT_STARTERS, TREASURES } from './data.ts';
import { medicineInfo } from './medicine-data.ts';
import {
  isMarketCultivatorId,
  type MarketCultivatorId,
  type SectMarketState,
} from './sect-market-data.ts';

export const AUCTION_SPOT = { x: 800, y: 330 };
export const AUCTION_LOTS = 4;
export type AuctionKind = 'medicine' | 'artifact';
export type AuctionOutcome = 'won' | 'lost' | 'sold' | 'unsold';
export interface AuctionItem {
  kind: AuctionKind;
  id: string;
  quantity: number;
  forgeLevel: number;
}
export interface AuctionReceipt extends AuctionItem {
  visit: number;
  realmIndex: number;
  age: number;
  outcome: AuctionOutcome;
  price: number;
  fee: number;
  bidder: MarketCultivatorId | 'player' | null;
}
export interface AuctionState {
  visit: number;
  closed: number[];
  releasedArtifacts: string[];
  history: AuctionReceipt[];
}
export function freeStarter(id: string) {
  return Object.values(ROOT_STARTERS)
    .flat()
    .some((starter) => starter === id);
}
const amount = (n: unknown) => Number.isSafeInteger(n) && Number(n) >= 0;
export function validAuction(
  value: unknown,
  age: number,
  market: SectMarketState | undefined,
): value is AuctionState {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !market) return false;
  const s = value as AuctionState;
  return (
    amount(s.visit) &&
    s.visit > 0 &&
    s.visit <= market.visit &&
    Array.isArray(s.closed) &&
    s.closed.length <= AUCTION_LOTS &&
    new Set(s.closed).size === s.closed.length &&
    s.closed.every((n) => amount(n) && n < AUCTION_LOTS) &&
    Array.isArray(s.releasedArtifacts) &&
    s.releasedArtifacts.length <= 10 &&
    new Set(s.releasedArtifacts).size === s.releasedArtifacts.length &&
    s.releasedArtifacts.every(freeStarter) &&
    Array.isArray(s.history) &&
    s.history.length <= 12 &&
    s.history.every((r) => {
      if (!r || typeof r !== 'object') return false;
      const item =
        r.kind === 'medicine'
          ? medicineInfo(r.id)
          : r.kind === 'artifact'
            ? TREASURES.find((t) => t.id === r.id)
            : undefined;
      return (
        !!item &&
        amount(r.visit) &&
        r.visit > 0 &&
        r.visit <= s.visit &&
        amount(r.realmIndex) &&
        r.realmIndex <= 8 &&
        Number.isFinite(r.age) &&
        r.age >= 0 &&
        r.age <= age &&
        amount(r.quantity) &&
        r.quantity > 0 &&
        r.quantity <= 99 &&
        amount(r.forgeLevel) &&
        (r.kind === 'artifact'
          ? r.quantity === 1 && r.forgeLevel <= MAX_FORGE_LEVEL
          : r.forgeLevel === 0) &&
        amount(r.price) &&
        amount(r.fee) &&
        r.fee <= r.price &&
        (r.outcome === 'won'
          ? r.price > 0 && r.bidder === 'player'
          : r.outcome === 'sold' || r.outcome === 'lost'
            ? r.price > 0 && isMarketCultivatorId(r.bidder)
            : r.outcome === 'unsold' && r.price === 0 && r.fee === 0 && r.bidder === null)
      );
    })
  );
}
