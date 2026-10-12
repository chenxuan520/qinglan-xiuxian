import { FINAL_TRIAL_STAGE, MAX_FORGE_LEVEL, TREASURES, treasure } from './data.ts';
import { medicineInfo } from './medicine-data.ts';
import { recordChronicle } from './chronicle.ts';
import {
  forgeCost,
  lifespanInfo,
  tribulationDue,
  recordCollectionAchievement,
  type SaveData,
} from './progress.ts';
import { advanceMortal, sectDues, sectDuesPending } from './mortal.ts';
import { sectMarketOpen } from './sect-market.ts';
import { marketCultivators, marketMedicinePool } from './sect-market-data.ts';
import {
  AUCTION_LOTS,
  freeStarter,
  type AuctionItem,
  type AuctionReceipt,
} from './auction-data.ts';

import { AUCTION_SETTINGS } from './setting.ts';

export function prepareAuction(save: SaveData) {
  const market = save.mortal.sectMarket;
  if (!market) return false;
  save.mortal.auction ??= { visit: market.visit, closed: [], releasedArtifacts: [], history: [] };
  if (save.mortal.auction.visit !== market.visit) {
    save.mortal.auction.visit = market.visit;
    save.mortal.auction.closed = [];
  }
  return true;
}
function roll(save: SaveData, key: string) {
  let hash = save.mortal.population!.seed;
  for (const c of `auction:${save.mortal.sectMarket!.visit}:${key}`)
    hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
  return (hash ^ (hash >>> 16)) >>> 0;
}
export function auctionValue(item: AuctionItem) {
  if (item.kind === 'medicine') {
    const m = medicineInfo(item.id);
    if (!m) return 0;
    const value = m.years
      ? m.tier === '凡品'
        ? m.price
        : m.tier === '灵品'
          ? 60
          : 180
      : ({ butian: 3000, huiyang: 2000, peiying: 1800, jiuqu: 2200 } as Record<string, number>)[
          m.id
        ] || 2000;
    return value * item.quantity;
  }
  if (!TREASURES.some((t) => t.id === item.id)) return 0;
  let value = freeStarter(item.id) ? 0 : 180;
  for (let level = 0; level < item.forgeLevel; level++) {
    const cost = forgeCost(level);
    value += cost.stones + cost.iron * 12;
  }
  return value;
}
export function auctionItemName(item: AuctionItem) {
  return item.kind === 'medicine' ? medicineInfo(item.id)!.name : treasure(item.id).name;
}
export function auctionLots(
  save: SaveData,
): (AuctionItem & { index: number; seller: string; sellerId: string; start: number })[] {
  const state = save.mortal.sectMarket;
  if (!state || !save.mortal.population) return [];
  const npcs = marketCultivators(save.mortal.population, state);
  return Array.from({ length: AUCTION_LOTS }, (_, index) => {
    const seed = roll(save, `lot:${index}`);
    const npc = npcs[seed % npcs.length];
    let item: AuctionItem;
    if (index < 2) {
      const pool = marketMedicinePool(save.mortal.population!, state, npc.id);
      item = {
        kind: 'medicine',
        id: pool[(seed >>> 8) % pool.length].id,
        quantity: 1,
        forgeLevel: 0,
      };
    } else {
      const artifact = TREASURES[(seed >>> 8) % TREASURES.length];
      const cap = Math.max(0, Math.min(MAX_FORGE_LEVEL - 1, npc.realmIndex - 1));
      const level = (seed >>> 16) % (cap + 1);
      item = {
        kind: 'artifact',
        id: artifact.id,
        quantity: 1,
        forgeLevel: freeStarter(artifact.id) ? Math.max(1, level) : level,
      };
    }
    return { ...item, index, seller: npc.name, sellerId: npc.id, start: auctionValue(item) };
  });
}
export function auctionFee(price: number, selling = false) {
  return Math.ceil(
    (price * (selling ? AUCTION_SETTINGS.sellerFee : AUCTION_SETTINGS.buyerFee)) / 100,
  );
}
export function auctionDues(save: SaveData) {
  const member = save.mortal.member;
  return member?.dues &&
    sectDues(save).stones > 0 &&
    member.dueAt <= save.mortal.years + AUCTION_SETTINGS.years + 1e-9
    ? Math.min(member.dues, sectDues(save).stones)
    : 0;
}
function bids(save: SaveData, item: AuctionItem, selling: boolean, sellerId = '') {
  const value = auctionValue(item);
  return marketCultivators(save.mortal.population!, save.mortal.sectMarket!)
    .filter((npc) => npc.id !== sellerId)
    .map((npc) => {
      const ratio =
        (selling ? 60 : 90) +
        (roll(
          save,
          `${selling ? 'sell' : 'buy'}:${item.kind}:${item.id}:${item.forgeLevel}:${npc.id}`,
        ) %
          (selling ? 21 : 36));
      const compatible =
        item.kind !== 'medicine' ||
        (() => {
          const m = medicineInfo(item.id)!;
          const tiers = ['凡品', '灵品', '珍品'];
          const carried = marketMedicinePool(
            save.mortal.population!,
            save.mortal.sectMarket!,
            npc.id,
          );
          return (
            tiers.indexOf(m.tier) <= tiers.indexOf(carried[0].tier) &&
            m.stage <= (npc.realmIndex === 0 ? 0 : Math.max(1, Math.min(6, npc.realmIndex - 1))) &&
            (m.years > 0 || npc.realmIndex >= 6)
          );
        })();
      return {
        id: npc.id,
        price: compatible
          ? Math.min(1000 * (npc.realmIndex + 1) ** 2, Math.floor((value * ratio) / 100))
          : 0,
      };
    })
    .sort((a, b) => b.price - a.price);
}
export function auctionReason(
  save: SaveData,
  visit: number,
  artifact: boolean,
  unfinished = false,
) {
  if (
    !sectMarketOpen(save) ||
    !save.mortal.population ||
    !save.mortal.sectMarket ||
    !save.mortal.auction
  )
    return '请先进入拍卖行';
  if (lifespanInfo(save).remaining <= 0 || tribulationDue(save) || sectDuesPending(save))
    return '请先处理寿元、天劫或供奉';
  if (lifespanInfo(save).remaining <= AUCTION_SETTINGS.years + 1e-9)
    return '寿元不足半年，请先借寿';
  if (
    save.nextTribulationAge > 0 &&
    !save.completed.includes(FINAL_TRIAL_STAGE) &&
    save.nextTribulationAge <= save.age + AUCTION_SETTINGS.years + 1e-9
  )
    return '半年内将迎天劫，请先处理天劫';
  if (save.mortal.activity) return '请先完成当前委托或研习';
  if (save.stones < auctionDues(save)) return '请先备足本场到期的宗门供奉';
  if (save.mortal.sectMarket.visit !== visit || save.mortal.auction.visit !== visit)
    return '本批拍卖已结束，请重新入席';
  if (artifact && (unfinished || save.tribulationReturn != null))
    return '请先结束未完成的历练，再交易法宝';
  return '';
}
export function auctionBuyReason(save: SaveData, index: number, visit: number, unfinished = false) {
  const lot = auctionLots(save).find((l) => l.index === index);
  if (!lot) return '拍品不存在';
  const reason = auctionReason(save, visit, lot.kind === 'artifact', unfinished);
  if (reason) return reason;
  if (save.mortal.auction!.closed.includes(index)) return '本拍品已结拍';
  if (
    lot.kind === 'artifact' &&
    save.artifacts.includes(lot.id) &&
    (save.forge[lot.id] || 0) >= lot.forgeLevel
  )
    return '已收藏，炼器阶数未高于现有法宝';
  if (
    lot.kind === 'medicine' &&
    !Number.isSafeInteger((save.medicine.bag[lot.id] || 0) + lot.quantity)
  )
    return '丹囊数量已达上限';
  return '';
}
function receipt(
  save: SaveData,
  item: AuctionItem,
  outcome: AuctionReceipt['outcome'],
  price: number,
  fee: number,
  bidder: AuctionReceipt['bidder'],
) {
  advanceMortal(save, AUCTION_SETTINGS.years * 60);
  const state = save.mortal.sectMarket!;
  const result: AuctionReceipt = {
    kind: item.kind,
    id: item.id,
    quantity: item.quantity,
    forgeLevel: item.forgeLevel,
    visit: state.visit,
    realmIndex: state.realmIndex,
    age: save.age,
    outcome,
    price,
    fee,
    bidder,
  };
  save.mortal.auction!.history.unshift(result);
  save.mortal.auction!.history.splice(12);
  if (outcome === 'won' || outcome === 'sold') {
    const text = `宗门坊市：${outcome === 'won' ? '竞得' : '售出'}${auctionItemName(item)} ×${item.quantity}，${outcome === 'won' ? '花费' : '实收'} ${outcome === 'won' ? price + fee : price - fee} 灵石。`;
    save.mortal.events.unshift(`${save.age.toFixed(1)} 岁 · ${text}`);
    save.mortal.events.splice(6);
    recordChronicle(save, '坊市拍卖', text);
  }
  return result;
}
// 调用者克隆存档，保存成功后应用；单次结算不等待现实倒计时。
export function buyAuction(
  save: SaveData,
  index: number,
  budget: number,
  visit: number,
  unfinished = false,
) {
  if (auctionBuyReason(save, index, visit, unfinished)) return undefined;
  const lot = auctionLots(save).find((l) => l.index === index)!;
  if (
    !Number.isSafeInteger(budget) ||
    budget < lot.start + auctionFee(lot.start) ||
    budget > save.stones - auctionDues(save)
  )
    return undefined;
  const rival = bids(save, lot, false, lot.sellerId)[0];
  const price =
    rival.price >= lot.start ? rival.price + Math.max(1, Math.ceil(lot.start * 0.05)) : lot.start;
  const fee = auctionFee(price);
  const won = price + fee <= budget;
  save.mortal.auction!.closed.push(index);
  if (!won) return receipt(save, lot, 'lost', rival.price, 0, rival.id);
  save.stones -= price + fee;
  if (lot.kind === 'medicine')
    save.medicine.bag[lot.id] = (save.medicine.bag[lot.id] || 0) + lot.quantity;
  else {
    if (!save.artifacts.includes(lot.id)) save.artifacts.push(lot.id);
    save.forge[lot.id] = lot.forgeLevel;
    save.artifactDrops = save.artifactDrops.filter((id) => id !== lot.id);
    save.mortal.auction!.releasedArtifacts = save.mortal.auction!.releasedArtifacts.filter(
      (id) => id !== lot.id,
    );
    recordCollectionAchievement(save);
  }
  return receipt(save, lot, 'won', price, fee, 'player');
}
export function auctionSellReason(
  save: SaveData,
  item: AuctionItem,
  visit: number,
  unfinished = false,
) {
  const reason = auctionReason(save, visit, item.kind === 'artifact', unfinished);
  if (reason) return reason;
  if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 99)
    return '每次可委托一至九十九份';
  if (item.kind === 'medicine') {
    if (
      !medicineInfo(item.id) ||
      item.forgeLevel !== 0 ||
      (save.medicine.bag[item.id] || 0) < item.quantity
    )
      return '所选丹药库存不足';
  } else if (item.kind === 'artifact') {
    if (
      !TREASURES.some((t) => t.id === item.id) ||
      !save.artifacts.includes(item.id) ||
      item.quantity !== 1 ||
      item.forgeLevel !== (save.forge[item.id] || 0)
    )
      return '法宝已变化，请重新选择';
    if (item.id === save.starter) return '当前本命不可出售';
  } else return '拍品不存在';
  if (auctionValue(item) <= 0) return '入门赠品未炼器，无人出价';
  return '';
}
export function sellAuction(
  save: SaveData,
  item: AuctionItem,
  reserve: number,
  visit: number,
  unfinished = false,
) {
  if (
    auctionSellReason(save, item, visit, unfinished) ||
    !Number.isSafeInteger(reserve) ||
    reserve < 1
  )
    return undefined;
  const bidder = bids(save, item, true)[0];
  if (bidder.price < reserve) return receipt(save, item, 'unsold', 0, 0, null);
  const fee = auctionFee(bidder.price, true);
  if (!Number.isSafeInteger(save.stones + (bidder.price - fee))) return undefined;
  if (item.kind === 'medicine') save.medicine.bag[item.id] -= item.quantity;
  else {
    save.artifacts = save.artifacts.filter((id) => id !== item.id);
    save.artifactDrops = save.artifactDrops.filter((id) => id !== item.id);
    save.forge[item.id] = 0;
    if (freeStarter(item.id) && !save.mortal.auction!.releasedArtifacts.includes(item.id))
      save.mortal.auction!.releasedArtifacts.push(item.id);
  }
  save.stones += bidder.price - fee;
  return receipt(save, item, 'sold', bidder.price, fee, bidder.id);
}
