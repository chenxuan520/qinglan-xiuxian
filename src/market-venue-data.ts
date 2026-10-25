import { TREASURES } from './data.ts';
import { MEDICINES } from './medicine-data.ts';

export interface MarketVenueState {
  workAt: number | null;
  favorAt: number | null;
  seeking?: Record<string, number>;
  // caravanAt 和旧购货收据仅保留历史存档数据，不再用于购货或发放物品。
  shops?: { exchangeAt: number | null; caravanAt: number | null };
  receipts: {
    kind: 'work' | 'seek' | 'host' | 'favor' | 'exchange' | 'salvage' | 'caravan';
    at: number;
    text: string;
  }[];
}
export function validMarketVenues(input: unknown, age: number): input is MarketVenueState {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const s = input as MarketVenueState;
  const at = (v: unknown): v is number =>
    typeof v === 'number' && Number.isFinite(v) && v >= 15 && v <= age;
  return (
    (s.shops === undefined ||
      (!!s.shops &&
        typeof s.shops === 'object' &&
        !Array.isArray(s.shops) &&
        (s.shops.exchangeAt === null || at(s.shops.exchangeAt)) &&
        (s.shops.caravanAt === null || at(s.shops.caravanAt)))) &&
    (s.seeking === undefined ||
      (!!s.seeking &&
        typeof s.seeking === 'object' &&
        !Array.isArray(s.seeking) &&
        Object.entries(s.seeking).every(
          ([key, count]) =>
            (TREASURES.some((t) => key === `artifact:${t.id}`) ||
              MEDICINES.some((m) => key === `medicine:${m.id}`)) &&
            Number.isSafeInteger(count) &&
            count >= 0,
        ))) &&
    (s.workAt === null || at(s.workAt)) &&
    (s.favorAt === null || at(s.favorAt)) &&
    Array.isArray(s.receipts) &&
    s.receipts.length <= 6 &&
    s.receipts.every(
      (r) =>
        r &&
        ['work', 'seek', 'host', 'favor', 'exchange', 'salvage', 'caravan'].includes(r.kind) &&
        at(r.at) &&
        typeof r.text === 'string' &&
        r.text.length > 0 &&
        r.text.length <= 600,
    )
  );
}
