import { isCurio, acquiredCurio, curioCycle, prepareCurioConsignment } from './curio-data.ts';
import { FINAL_TRIAL_STAGE, TREASURES } from './data.ts';
import { medicineInfo } from './medicine-data.ts';
import { lifespanInfo, realmInfo, tribulationDue, type SaveData } from './progress.ts';
import { sectDues, sectDuesPending } from './mortal.ts';
import { sectMarketOpen } from './sect-market.ts';
import {
  AUCTION_HALLS,
  AUCTION_IRON_MIN,
  auctionHallForRealm,
  type AuctionHall,
  type AuctionItem,
} from './auction-data.ts';

export {
  auctionValue,
  auctionSaleRates,
  auctionItemName,
  releaseAuctionItem,
} from './auction-items.ts';
import { auctionValue } from './auction-items.ts';
import { AUCTION_SETTINGS } from './setting.ts';

export function auctionHallLimit(save: SaveData) {
  return Math.max(
    auctionHallForRealm(
      realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).index,
    ),
    save.mortal.auction?.paidHall ?? 0,
  );
}
export function auctionHallReason(save: SaveData, hall: number) {
  return !Number.isInteger(hall) || hall < 0 || hall > 2
    ? '会场不存在'
    : hall > auctionHallLimit(save)
      ? '尚未取得该会场资格'
      : '';
}
export function selectAuctionHall(save: SaveData, hall: number, visit: number, pay = false) {
  if (
    !sectMarketOpen(save) ||
    save.mortal.sectMarket?.visit !== visit ||
    save.mortal.auction?.visit !== visit ||
    !Number.isInteger(hall) ||
    hall < 0 ||
    hall > 2
  )
    return '本批拍卖已结束';
  if (
    save.mortal.marketSocial?.ambush ||
    lifespanInfo(save).remaining <= 0 ||
    tribulationDue(save) ||
    sectDuesPending(save)
  )
    return '请先处理寿元、天劫、供奉或遭遇';
  if (auctionHallReason(save, hall)) {
    if (!pay) return '尚未取得该会场资格';
    const fee = AUCTION_HALLS[hall as AuctionHall].admission;
    if (save.stones - auctionDues(save) < fee) return '灵石不足入场费用';
    save.stones -= fee;
    save.mortal.auction.paidHall = hall as 1 | 2;
  }
  save.mortal.auction.hall = hall as AuctionHall;
  return '';
}
export function prepareAuction(save: SaveData) {
  const market = save.mortal.sectMarket;
  if (!market) return false;
  prepareCurioConsignment(save);
  save.mortal.auction ??= {
    visit: market.visit,
    hall: auctionHallForRealm(market.realmIndex),
    closed: [],
    releasedArtifacts: [],
    history: [],
  };
  const state = save.mortal.auction;
  if (state.visit !== market.visit) {
    state.visit = market.visit;
    state.closed = [];
    delete state.curioSlot;
  }
  if (auctionHallReason(save, state.hall)) state.hall = auctionHallLimit(save) as AuctionHall;
  const special = save.curios.consignment;
  if (state.curioSlot === undefined)
    state.curioSlot =
      special?.id && special.cycle === curioCycle(save.age) && !acquiredCurio(save, special.id)
        ? { id: special.id, cycle: special.cycle }
        : null;
  return true;
}

export function auctionItemAllowed(hall: AuctionHall, item: AuctionItem) {
  return item.kind === 'iron'
    ? hall === 0
    : hall > 0 ||
        (item.kind !== 'curio' &&
          (item.kind !== 'medicine' || medicineInfo(item.id)?.tier !== '珍品'));
}

export function auctionFee(price: number, selling = false) {
  return Math.ceil(
    (price * (selling ? AUCTION_SETTINGS.sellerFee : AUCTION_SETTINGS.buyerFee)) / 100,
  );
}
export function auctionDues(save: SaveData, years = AUCTION_SETTINGS.years) {
  const member = save.mortal.member;
  return member?.dues &&
    sectDues(save).stones > 0 &&
    member.dueAt <= save.mortal.years + years + 1e-9
    ? Math.min(member.dues, sectDues(save).stones)
    : 0;
}

export function auctionReason(
  save: SaveData,
  visit: number,
  artifact: boolean,
  unfinished = false,
  years = AUCTION_SETTINGS.years,
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
  const duration = years === 0.5 ? '半年' : `${years}年`;
  if (lifespanInfo(save).remaining <= years + 1e-9) return `寿元不足${duration}，请先借寿`;
  if (
    save.nextTribulationAge > 0 &&
    !save.completed.includes(FINAL_TRIAL_STAGE) &&
    save.nextTribulationAge <= save.age + years + 1e-9
  )
    return `${duration}内将迎天劫，请先处理天劫`;
  if (save.mortal.activity) return '请先完成当前委托或研习';
  if (save.stones < auctionDues(save, years)) return '请先备足本场到期的宗门供奉';
  if (save.mortal.marketSocial?.ambush) return '请先处理尚未结束的劫修遭遇';
  if (save.mortal.sectMarket.visit !== visit || save.mortal.auction.visit !== visit)
    return '本批拍卖已结束，请重新入席';
  if (artifact && (unfinished || save.tribulationReturn != null))
    return '请先结束未完成的历练，再交易法宝';
  return '';
}

export function auctionSellReason(
  save: SaveData,
  item: AuctionItem,
  visit: number,
  unfinished = false,
  years = AUCTION_SETTINGS.years,
  checkHall = true,
) {
  const reason = auctionReason(
    save,
    visit,
    item.kind === 'artifact' || item.kind === 'curio',
    unfinished,
    years,
  );
  if (reason) return reason;
  if (checkHall && auctionHallReason(save, save.mortal.auction!.hall)) return '尚未取得该会场资格';
  if (checkHall && !auctionItemAllowed(save.mortal.auction!.hall, item))
    return item.kind === 'iron' ? '玄铁只在初级会场交易' : '初级会场不收珍品丹药与奇物';
  if (
    !Number.isSafeInteger(item.quantity) ||
    item.quantity < 1 ||
    item.quantity > (item.kind === 'iron' ? 9999 : 99)
  )
    return '每次可委托一至九十九份';
  if (item.kind === 'iron') {
    if (item.quantity < AUCTION_IRON_MIN) return `玄铁每批至少${AUCTION_IRON_MIN}枚`;
    if (item.id !== 'iron' || item.forgeLevel !== 0 || save.iron < item.quantity)
      return '玄铁库存不足';
  } else if (item.kind === 'medicine') {
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
  } else if (item.kind === 'curio') {
    if (
      !isCurio(item.id) ||
      item.quantity !== 1 ||
      item.forgeLevel !== 0 ||
      (save.curios.bag[item.id] ?? 0) < 1
    )
      return '奇物已变化，请重新选择';
  } else return '拍品不存在';
  if (auctionValue(item) <= 0) return '入门赠品未炼器，无人出价';
  return '';
}
