import { isCurio, grantCurio, acquiredCurio, curioRoll, curioCycle } from './curio-data.ts';
import { TREASURES } from './data.ts';
import { MEDICINES, medicineInfo } from './medicine-data.ts';
import { recordChronicle, recordCurioAchievement } from './chronicle.ts';
import { recordCollectionAchievement, type SaveData } from './progress.ts';
import { advanceMortal } from './mortal.ts';
import {
  marketCultivators,
  marketMedicinePool,
  type MarketCultivatorId,
} from './sect-market-data.ts';
import {
  AUCTION_LOTS,
  AUCTION_HALLS,
  AUCTION_CURIO_LOT,
  AUCTION_IRON_LOT,
  AUCTION_IRON_MIN,
  freeStarter,
  type AuctionItem,
  type AuctionReceipt,
} from './auction-data.ts';
import {
  auctionValue,
  releaseAuctionItem,
  auctionItemName,
  auctionSaleRates,
} from './auction-items.ts';
import {
  auctionHallReason,
  auctionFee,
  auctionDues,
  auctionReason,
  auctionSellReason,
} from './auction.ts';
import { ironMarket } from './iron-market.ts';
import { AUCTION_SETTINGS } from './setting.ts';
function roll(save: SaveData, key: string) {
  let hash = save.mortal.population!.seed;
  for (const c of `auction:${save.mortal.sectMarket!.visit}:${save.mortal.auction!.hall ? `${save.mortal.auction!.hall}:` : ''}${key}`)
    hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
  return (hash ^ (hash >>> 16)) >>> 0;
}

export function auctionLots(
  save: SaveData,
): (AuctionItem & { index: number; seller: string; sellerId: string; start: number })[] {
  const state = save.mortal.sectMarket;
  const hall = save.mortal.auction?.hall;
  if (!state || !save.mortal.population || hall === undefined || auctionHallReason(save, hall))
    return [];
  const spec = AUCTION_HALLS[hall];
  // 本批寄售不随人物离场重排；会场独立记录常规结拍。
  const npcs = marketCultivators(save.mortal.population, { ...state, absent: undefined }).filter(
    (n) => n.realmIndex >= spec.minRealm,
  );
  const lots: ReturnType<typeof auctionLots> = Array.from({ length: AUCTION_LOTS }, (_, slot) => {
    const seed = roll(save, `lot:${slot}`);
    const npc = npcs[seed % npcs.length];
    let item: AuctionItem;
    if (slot % 4 < 2) {
      const tier =
        hall === 0
          ? slot % 4 === 0
            ? '凡品'
            : '灵品'
          : hall === 1 && slot !== 5
            ? '灵品'
            : '珍品';
      const permanent = hall === 2 && slot === 5 && (seed >>> 24) % 4 === 0;
      const pool = MEDICINES.filter((m) => m.tier === tier && (m.years === 0) === permanent);
      item = {
        kind: 'medicine',
        id: pool[(seed >>> 8) % pool.length].id,
        quantity: 1,
        forgeLevel: 0,
      };
    } else {
      const artifact = TREASURES[(seed >>> 8) % TREASURES.length];
      const level = spec.forgeMin + ((seed >>> 16) % (spec.forgeMax - spec.forgeMin + 1));
      item = {
        kind: 'artifact',
        id: artifact.id,
        quantity: 1,
        forgeLevel: freeStarter(artifact.id) ? Math.max(1, level) : level,
      };
    }
    return {
      ...item,
      index: hall * AUCTION_LOTS + slot,
      seller: npc?.name ?? '会场寄售席',
      sellerId: npc?.id ?? '',
      start: auctionValue(item),
    };
  });
  if (hall === 0) {
    const item: AuctionItem = {
      kind: 'iron',
      id: 'iron',
      quantity: AUCTION_IRON_MIN + (roll(save, 'iron') % 3) * 50,
      forgeLevel: 0,
    };
    lots[7] = {
      ...item,
      index: AUCTION_IRON_LOT,
      seller: '灵材行',
      sellerId: '',
      start: auctionValue(item, { ...save, age: state.openedAt }),
    };
  }
  const special = save.curios.consignment;
  const reserved = save.mortal.auction!.curioSlot;
  if (
    hall > 0 &&
    reserved?.id === special?.id &&
    reserved?.cycle === special?.cycle &&
    special?.id &&
    special.cycle === curioCycle(save.age) &&
    !acquiredCurio(save, special.id)
  ) {
    const item: AuctionItem = { kind: 'curio', id: special.id, quantity: 1, forgeLevel: 0 };
    lots[7] = {
      ...item,
      index: AUCTION_CURIO_LOT,
      seller: '行脚修士',
      sellerId: '',
      start: auctionValue(item),
    };
  } else if (hall > 0 && save.mortal.auction?.curioSlot) lots.pop();
  // 仅替换同批重名拍品，原槽位、品级、炼器范围与其他原始拍品均保留。
  // 排除库存与结拍状态，成交、关窗和读档不会重排其余拍品。
  const key = (lot: AuctionItem) => `${lot.kind}:${lot.id}`;
  const reservedIds = new Set(lots.map(key));
  const seen = new Set<string>();
  for (const lot of lots) {
    if (lot.kind !== 'medicine' && lot.kind !== 'artifact') continue;
    if (seen.has(key(lot))) {
      const original = lot.kind === 'medicine' ? medicineInfo(lot.id)! : null;
      const alternatives = (
        original
          ? MEDICINES.filter(
              (m) => m.tier === original.tier && (m.years === 0) === (original.years === 0),
            )
          : TREASURES
      ).filter((item) => !reservedIds.has(`${lot.kind}:${item.id}`));
      if (alternatives.length) {
        lot.id =
          alternatives[
            (roll(save, `lot:${lot.index % AUCTION_LOTS}`) >>> 8) % alternatives.length
          ].id;
        if (lot.kind === 'artifact' && freeStarter(lot.id))
          lot.forgeLevel = Math.max(1, lot.forgeLevel);
        lot.start = auctionValue(lot);
        reservedIds.add(key(lot));
      }
    }
    seen.add(key(lot));
  }
  return lots;
}

function bids(
  save: SaveData,
  item: AuctionItem,
  selling: boolean,
  sellerId = '',
): { id: MarketCultivatorId | 'commission'; price: number }[] {
  const value = auctionValue(item, save);
  if (item.kind === 'curio') {
    const [low, high] = auctionSaleRates(item);
    const ratio =
      (selling ? low : 90) +
      (curioRoll(save.curios.seed, `curio-bid:${curioCycle(save.age)}:${item.id}:${selling}`) %
        (selling ? high - low + 1 : 36));
    return [{ id: 'commission', price: Math.floor((value * ratio) / 100) }];
  }
  if (item.kind === 'iron' && selling)
    return [
      {
        id: 'commission',
        price: Math.floor(
          (ironMarket(save).sell * item.quantity * (90 + (roll(save, 'iron-sell') % 11))) / 100,
        ),
      },
    ];
  const eligible = marketCultivators(save.mortal.population!, save.mortal.sectMarket!).filter(
    (n) => n.realmIndex >= AUCTION_HALLS[save.mortal.auction!.hall].minRealm,
  );
  const [low, high] = selling ? auctionSaleRates(item) : [90, 125];
  if (!eligible.some((n) => n.id !== sellerId))
    return [
      {
        id: 'commission',
        price: Math.min(
          64000,
          Math.floor(
            (value * (low + (roll(save, `commission:${item.id}`) % (high - low + 1)))) / 100,
          ),
        ),
      },
    ];
  return eligible
    .filter((npc) => npc.id !== sellerId)
    .map((npc) => {
      const ratio =
        low +
        (roll(
          save,
          `${selling ? 'sell' : 'buy'}:${item.kind}:${item.id}:${item.forgeLevel}:${npc.id}`,
        ) %
          (high - low + 1));
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

export function auctionBuyReason(save: SaveData, index: number, visit: number, unfinished = false) {
  if (save.mortal.auction && auctionHallReason(save, save.mortal.auction.hall))
    return auctionHallReason(save, save.mortal.auction.hall);
  const lot = auctionLots(save).find((l) => l.index === index);
  if (!lot) return '拍品不存在';
  const reason = auctionReason(
    save,
    visit,
    lot.kind === 'artifact' || lot.kind === 'curio',
    unfinished,
  );
  if (reason) return reason;
  if (
    index === AUCTION_CURIO_LOT
      ? save.curios.consignment?.closed
      : save.mortal.auction!.closed.includes(index)
  )
    return '本拍品已结拍';
  if (
    lot.kind === 'artifact' &&
    save.artifacts.includes(lot.id) &&
    (save.forge[lot.id] || 0) >= lot.forgeLevel
  )
    return '已收藏，炼器阶数未高于现有法宝';
  if (lot.kind === 'iron' && !Number.isSafeInteger(save.iron + lot.quantity))
    return '玄铁数量已达上限';
  if (
    lot.kind === 'medicine' &&
    !Number.isSafeInteger((save.medicine.bag[lot.id] || 0) + lot.quantity)
  )
    return '丹囊数量已达上限';
  if (
    lot.kind === 'curio' &&
    isCurio(lot.id) &&
    !Number.isSafeInteger((save.curios.bag[lot.id] ?? 0) + 1)
  )
    return '奇物数量已达上限';
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
    hall: save.mortal.auction!.hall,
    visit: state.visit,
    realmIndex: state.realmIndex,
    age: save.age,
    outcome,
    price,
    fee,
    bidder,
    ...(bidder && bidder !== 'player' && bidder !== 'commission'
      ? {
          bidderName: marketCultivators(save.mortal.population!, state).find(
            (n) => n.id === bidder,
          )!.name,
        }
      : {}),
  };
  save.mortal.auction!.history.unshift(result);
  save.mortal.auction!.history.splice(12);
  if (outcome === 'won' || outcome === 'sold') {
    const text = `宗门坊市：${outcome === 'won' ? '竞得' : '售出'}${auctionItemName(item)} ×${item.quantity}，${outcome === 'won' ? '花费' : '实收'} ${outcome === 'won' ? price + fee : price - fee} 灵石。`;
    save.mortal.events.unshift(`${save.age.toFixed(1)} 岁 · ${text}`);
    save.mortal.events.splice(6);
    recordChronicle(save, '坊市拍卖', text);
    if (outcome === 'won' && item.kind === 'curio') recordCurioAchievement(save);
    if (outcome === 'won' && item.kind === 'artifact' && item.forgeLevel >= 5)
      recordChronicle(
        save,
        '慧眼识珍',
        `在拍卖会竞得${auctionItemName(item)}，炼器${item.forgeLevel}阶。`,
        'auction-treasure',
      );
  }
  return result;
}

// 调用者克隆存档，保存成功后应用；单次结算不等待现实倒计时。
export function auctionNextBid(start: number, rival: number) {
  const step = Math.max(1, Math.ceil(start * 0.05));
  const price = rival >= start ? rival + step : start;
  const fee = auctionFee(price);
  return { step, price, fee, total: price + fee };
}

export function buyAuction(
  save: SaveData,
  index: number,
  budget: number,
  visit: number,
  unfinished = false,
  cycle?: number,
) {
  if (
    index === AUCTION_CURIO_LOT &&
    (cycle === undefined ||
      cycle !== curioCycle(save.age) ||
      cycle !== save.curios.consignment?.cycle)
  )
    return undefined;
  if (auctionBuyReason(save, index, visit, unfinished)) return undefined;
  const lot = auctionLots(save).find((l) => l.index === index)!;
  if (
    !Number.isSafeInteger(budget) ||
    budget < lot.start + auctionFee(lot.start) ||
    budget > save.stones - auctionDues(save)
  )
    return undefined;
  const rival = bids(save, lot, false, lot.sellerId)[0];
  const { price, fee } = auctionNextBid(lot.start, rival.price);
  const won = price + fee <= budget;
  if (index === AUCTION_CURIO_LOT) {
    save.mortal.auction!.curioSlot = {
      id: lot.id as import('./curio-data.ts').CurioId,
      cycle: curioCycle(save.age),
    };
    save.curios.consignment!.closed = true;
  } else save.mortal.auction!.closed.push(index);
  if (!won) return receipt(save, lot, 'lost', rival.price, 0, rival.id);
  save.stones -= price + fee;
  if (lot.kind === 'iron') save.iron += lot.quantity;
  else if (lot.kind === 'medicine')
    save.medicine.bag[lot.id] = (save.medicine.bag[lot.id] || 0) + lot.quantity;
  else if (lot.kind === 'curio') grantCurio(save, lot.id);
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
  releaseAuctionItem(save, item);
  save.stones += bidder.price - fee;
  return receipt(save, item, 'sold', bidder.price, fee, bidder.id);
}
