export interface MarketVenueState {
  workAt: number | null;
  favorAt: number | null;
  receipts: { kind: 'work' | 'seek' | 'host' | 'favor'; at: number; text: string }[];
}
export function validMarketVenues(input: unknown, age: number): input is MarketVenueState {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const s = input as MarketVenueState;
  const at = (v: unknown): v is number =>
    typeof v === 'number' && Number.isFinite(v) && v >= 15 && v <= age;
  return (
    (s.workAt === null || at(s.workAt)) &&
    (s.favorAt === null || at(s.favorAt)) &&
    Array.isArray(s.receipts) &&
    s.receipts.length <= 6 &&
    s.receipts.every(
      (r) =>
        r &&
        ['work', 'seek', 'host', 'favor'].includes(r.kind) &&
        at(r.at) &&
        typeof r.text === 'string' &&
        r.text.length > 0 &&
        r.text.length <= 600,
    )
  );
}
