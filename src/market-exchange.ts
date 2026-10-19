import { TREASURES, type WeaponKind } from './data.ts';
import { MEDICINES, medicineMarketValue, type Medicine } from './medicine-data.ts';
import type { SaveData } from './progress.ts';
import {
  MARKET_CULTIVATORS,
  marketCultivatorRealm,
  type MarketCultivatorId,
} from './sect-market-data.ts';
import { marketSocialRoll } from './market-social-data.ts';
import { auctionValue, auctionItemName } from './auction-items.ts';
import type { AuctionItem } from './auction-data.ts';
import { marketTradeMotive, type MarketTradeMotiveKind } from './market-trade-motives.ts';
import { marketIdentity, isMarketTraderId } from './sect-market-data.ts';

export interface MarketExchangeDeal {
  id: string;
  give: AuctionItem[];
  receive: AuctionItem;
  giveValue: number;
  receiveValue: number;
  category: 'medicine' | 'medicines' | 'artifact' | 'mixed';
  motive: MarketTradeMotiveKind;
  motiveMatched: boolean;
  benefitText: string;
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
  const motive = marketTradeMotive(save, id);
  if (!state || !population || !motive || !isMarketTraderId(id)) return [];
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
  // 每批只有一个可能的让利席位，另外十二个结果不让利；库存、交情或离场不重抽。
  const bargain =
    marketSocialRoll(population, state.visit, 'bargain') % 15 ===
    MARKET_CULTIVATORS.findIndex((npc) => npc.id === id);
  const candidates: MarketExchangeDeal[] = [];
  const keys = new Set<string>();
  const add = (give: AuctionItem[], quantity: number, category: MarketExchangeDeal['category']) => {
    if (quantity < 1 || quantity > 6 || give.some((i) => i.quantity < 1 || i.quantity > 12)) return;
    const giveValue = give.reduce((sum, i) => sum + auctionValue(i), 0),
      receiveValue = unit * quantity;
    const wantedValue = give.reduce(
      (sum, item) =>
        sum +
        ((
          item.kind === 'medicine'
            ? motive.preferredMedicineIds.includes(item.id)
            : motive.preferredWeaponIds.includes(item.id as WeaponKind)
        )
          ? auctionValue(item)
          : 0),
      0,
    );
    const motiveMatched = wantedValue * 2 >= giveValue,
      premiumCap = motiveMatched ? (motive.friend ? 105 : 108) : 115;
    const gain = receiveValue > giveValue;
    if (
      !Number.isSafeInteger(giveValue) ||
      (gain
        ? !bargain || !motiveMatched || receiveValue * 100 > giveValue * 108
        : giveValue * 100 > receiveValue * premiumCap)
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
        motive: motive.kind,
        motiveMatched,
        benefitText: gain
          ? `急需让利：此单多换得${receiveValue - giveValue}灵石参考价值。`
          : motiveMatched
            ? motive.friend
              ? give.length > 1
                ? '故交照应：合用之物搭配余丹，估值补差不超过5%。'
                : '故交照应：按合用之物相换，估值补差不超过5%。'
              : `正合「${motive.title}」之需，估值补差不超过8%。`
            : '',
      });
    }
  };
  for (const m of pool)
    for (let quantity = 1; quantity <= 6; quantity++)
      for (const round of bargain ? [Math.ceil, Math.floor] : [Math.ceil])
        add(
          [pill(m.id, round((unit * quantity) / medicineMarketValue(m.id)))],
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
  // 故交愿把大份余丹拆开换，也接受低阶添头；不凭交情凭空增值。
  // 原有普通双药报价只换一份，此处让真正合用的药搭配低阶余丹换多份。
  if (motive.friend) {
    const preferred = pool.filter((m) => motive.preferredMedicineIds.includes(m.id));
    for (const wanted of preferred)
      for (const extra of lower.filter((m) => m.id !== wanted.id))
        for (let receive = 1; receive <= 6; receive++)
          for (let count = 1; count <= 12; count++) {
            const rest = unit * receive - medicineMarketValue(wanted.id) * count;
            if (rest > 0)
              add(
                [
                  pill(wanted.id, count),
                  pill(extra.id, Math.ceil(rest / medicineMarketValue(extra.id))),
                ],
                receive,
                'medicines',
              );
          }
  }
  const identity = marketIdentity(state, id);
  const visit = identity.birthVisit;
  function hash(key: string) {
    let h = save.medicine.recipeSeed;
    for (const ch of `${visit}:${identity.slot}:${key}`)
      h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
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
          Number(b.motiveMatched) - Number(a.motiveMatched) ||
          (a.motiveMatched && b.motiveMatched
            ? a.giveValue / a.receiveValue - b.giveValue / b.receiveValue
            : 0) ||
          hash(a.id) - hash(b.id),
      );
    result.push(...group.slice(0, limit));
  }
  return result;
}
