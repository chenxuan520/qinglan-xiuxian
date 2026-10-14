import { TREASURES, type WeaponKind } from './data.ts';
import { MEDICINES, medicineMarketValue, type Medicine } from './medicine-data.ts';
import type { SaveData } from './progress.ts';
import { marketCultivatorRealm, type MarketCultivatorId } from './sect-market-data.ts';
import { auctionValue, auctionItemName } from './auction-items.ts';
import type { AuctionItem } from './auction-data.ts';

export interface MarketExchangeDeal {
  id: string;
  give: AuctionItem[];
  receive: AuctionItem;
  giveValue: number;
  receiveValue: number;
  category: 'medicine' | 'medicines' | 'artifact' | 'mixed';
}
export const exchangeItemText = (item: AuctionItem) =>
  `${auctionItemName(item)}${item.kind === 'artifact' ? `（炼器${item.forgeLevel}阶）` : ''} ×${item.quantity}`;
export const exchangeGiveText = (deal: MarketExchangeDeal) =>
  deal.give.map(exchangeItemText).join(' ＋ ');
const pill = (id: string, quantity: number): AuctionItem => ({
  kind: 'medicine',
  id,
  quantity,
  forgeLevel: 0,
});
export function exchangeOwned(save: SaveData, deal: MarketExchangeDeal) {
  return deal.give.every((item) =>
    item.kind === 'medicine'
      ? (save.medicine.bag[item.id] || 0) >= item.quantity
      : save.artifacts.includes(item.id) && (save.forge[item.id] || 0) === item.forgeLevel,
  );
}
// 同一来访批次用固定报价；物品估值与拍卖共用，不能拿零价赠品换丹。
export function marketExchangeDeals(
  save: SaveData,
  id: MarketCultivatorId,
  medicine: Medicine,
): MarketExchangeDeal[] {
  const state = save.mortal.sectMarket,
    population = save.mortal.population;
  if (!state || !population) return [];
  const realm = marketCultivatorRealm(population, state, id);
  const tier = ['凡品', '灵品', '珍品'].indexOf(medicine.tier);
  const cap = realm === 0 ? 0 : Math.max(1, Math.min(6, realm - 1));
  const pool = MEDICINES.filter(
    (m) =>
      m.id !== medicine.id &&
      ['凡品', '灵品', '珍品'].indexOf(m.tier) <= tier &&
      m.stage <= cap &&
      (m.years > 0 || realm >= 6),
  );
  const lower = pool.filter(
    (m) => ['凡品', '灵品', '珍品'].indexOf(m.tier) < tier || m.stage < medicine.stage,
  );
  const unit = medicineMarketValue(medicine.id);
  if (unit <= 0) return [];
  const candidates: MarketExchangeDeal[] = [];
  const keys = new Set<string>();
  function add(give: AuctionItem[], quantity: number, category: MarketExchangeDeal['category']) {
    if (quantity < 1 || quantity > 6 || give.some((i) => i.quantity < 1 || i.quantity > 12)) return;
    const giveValue = give.reduce((sum, i) => sum + auctionValue(i), 0),
      receiveValue = unit * quantity;
    if (
      !Number.isSafeInteger(giveValue) ||
      giveValue < receiveValue ||
      giveValue * 100 > receiveValue * 115
    )
      return;
    const key =
      give.map((i) => `${i.kind}:${i.id}:${i.quantity}:${i.forgeLevel}`).join('+') + `=${quantity}`;
    if (!keys.has(key)) {
      keys.add(key);
      candidates.push({
        id: key,
        give,
        receive: pill(medicine.id, quantity),
        giveValue,
        receiveValue,
        category,
      });
    }
  }
  for (const m of pool)
    for (let quantity = 1; quantity <= 6; quantity++)
      add(
        [pill(m.id, Math.ceil((unit * quantity) / medicineMarketValue(m.id)))],
        quantity,
        'medicine',
      );
  for (let a = 0; a < pool.length; a++)
    for (let b = a + 1; b < pool.length; b++) {
      const first = pool[a],
        second = pool[b],
        value = medicineMarketValue(first.id);
      for (let quantity = 1; quantity <= 6; quantity++) {
        const rest = unit - value * quantity;
        if (rest > 0)
          add(
            [
              pill(first.id, quantity),
              pill(second.id, Math.ceil(rest / medicineMarketValue(second.id))),
            ],
            1,
            'medicines',
          );
      }
    }
  const artifacts = TREASURES.filter((t) => t.id !== save.starter);
  for (const t of artifacts) {
    const item: AuctionItem = {
      kind: 'artifact',
      id: t.id as WeaponKind,
      quantity: 1,
      forgeLevel: save.forge[t.id] || 0,
    };
    const value = auctionValue(item);
    if (!value) continue;
    add([item], Math.floor(value / unit), 'artifact');
    for (const m of lower)
      for (let quantity = 1; quantity <= 6; quantity++) {
        const target = unit * quantity,
          rest = target - value;
        if (rest > 0)
          add([item, pill(m.id, Math.ceil(rest / medicineMarketValue(m.id)))], quantity, 'mixed');
      }
  }
  const visit = state.visit;
  function hash(key: string) {
    let h = save.medicine.recipeSeed;
    for (const ch of `${visit}:${id}:${key}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return h >>> 0;
  }
  const result: MarketExchangeDeal[] = [];
  for (const [category, limit] of [
    ['medicine', 3],
    ['medicines', 2],
    ['artifact', 2],
    ['mixed', 2],
  ] as const) {
    const group = candidates
      .filter((d) => d.category === category)
      .sort(
        (a, b) =>
          Number(exchangeOwned(save, b)) - Number(exchangeOwned(save, a)) ||
          hash(a.id) - hash(b.id),
      );
    result.push(...group.slice(0, limit));
  }
  return result;
}
