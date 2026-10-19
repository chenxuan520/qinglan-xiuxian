import { isCurio, curioCycle, type CurioId } from './curio-data.ts';
import { MAX_FORGE_LEVEL, ROOT_STARTERS, TREASURES } from './data.ts';
import { medicineInfo } from './medicine-data.ts';
import {
  isMarketTraderId,
  type MarketCultivatorId,
  type SectMarketState,
} from './sect-market-data.ts';

export const AUCTION_SPOT = { x: 1000, y: 535 };
export const AUCTION_LOTS = 8;
export const AUCTION_HALLS = [
  {
    name: '初级会场',
    realms: '炼气、筑基、金丹',
    minRealm: 0,
    forgeMin: 0,
    forgeMax: 1,
    admission: 0,
  },
  {
    name: '中级会场',
    realms: '元婴、化神、炼虚',
    minRealm: 3,
    forgeMin: 1,
    forgeMax: 3,
    admission: 3000,
  },
  {
    name: '高级会场',
    realms: '合体、大乘、渡劫',
    minRealm: 6,
    forgeMin: 3,
    forgeMax: 6,
    admission: 10000,
  },
] as const;
export type AuctionHall = 0 | 1 | 2;
export const AUCTION_CURIO_LOT = AUCTION_LOTS * AUCTION_HALLS.length;
export const AUCTION_IRON_LOT = 7;
export const AUCTION_IRON_MIN = 150;
export const auctionHallForRealm = (realm: number) =>
  Math.min(2, Math.floor(realm / 3)) as AuctionHall;
export type AuctionKind = 'medicine' | 'artifact' | 'curio' | 'iron';
export type AuctionOutcome = 'won' | 'lost' | 'sold' | 'unsold';
export interface AuctionItem {
  kind: AuctionKind;
  id: string;
  quantity: number;
  forgeLevel: number;
}
export interface AuctionReceipt extends AuctionItem {
  hall: AuctionHall;
  visit: number;
  realmIndex: number;
  age: number;
  outcome: AuctionOutcome;
  price: number;
  fee: number;
  bidder: MarketCultivatorId | 'player' | 'commission' | null;
  bidderName?: string;
}
export interface AuctionState {
  paidHall?: 1 | 2;
  curioSlot?: { id: CurioId; cycle: number } | null;
  hall: AuctionHall;
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
  legacy = false,
): value is AuctionState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const s = value as AuctionState;
  return (
    amount(s.visit) &&
    (s.curioSlot === undefined ||
      s.curioSlot === null ||
      (!!s.curioSlot &&
        isCurio(s.curioSlot.id) &&
        amount(s.curioSlot.cycle) &&
        s.curioSlot.cycle <= curioCycle(age))) &&
    (s.paidHall === undefined || s.paidHall === 1 || s.paidHall === 2) &&
    ((legacy && s.hall === undefined) ||
      (Number.isInteger(s.hall) && s.hall >= 0 && s.hall <= 2)) &&
    (market
      ? s.visit > 0 && s.visit <= market.visit
      : s.visit === 0 && s.closed?.length === 0 && s.history?.length === 0) &&
    Array.isArray(s.closed) &&
    s.closed.length <= (legacy ? AUCTION_LOTS : AUCTION_CURIO_LOT) &&
    new Set(s.closed).size === s.closed.length &&
    s.closed.every(
      (n) =>
        amount(n) && n < (legacy ? AUCTION_LOTS : AUCTION_CURIO_LOT) && n !== AUCTION_CURIO_LOT,
    ) &&
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
            : r.kind === 'iron'
              ? r.id === 'iron'
              : r.kind === 'curio' && isCurio(r.id);
      return (
        !!item &&
        ((legacy && r.hall === undefined) ||
          (Number.isInteger(r.hall) && r.hall >= 0 && r.hall <= 2)) &&
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
        r.quantity <= (r.kind === 'iron' ? 9999 : 99) &&
        amount(r.forgeLevel) &&
        (r.kind === 'artifact'
          ? r.quantity === 1 && r.forgeLevel <= MAX_FORGE_LEVEL
          : r.forgeLevel === 0 && (r.kind !== 'curio' || r.quantity === 1)) &&
        (r.bidderName === undefined ||
          (isMarketTraderId(r.bidder) &&
            typeof r.bidderName === 'string' &&
            /^[\p{Script=Han}·]{1,30}$/u.test(r.bidderName))) &&
        amount(r.price) &&
        amount(r.fee) &&
        r.fee <= r.price &&
        (r.outcome === 'won'
          ? r.price > 0 && r.bidder === 'player'
          : r.outcome === 'sold' || r.outcome === 'lost'
            ? r.price > 0 && (isMarketTraderId(r.bidder) || r.bidder === 'commission')
            : r.outcome === 'unsold' && r.price === 0 && r.fee === 0 && r.bidder === null)
      );
    })
  );
}
