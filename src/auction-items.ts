import { isCurio, curioValue, curioName } from './curio-data.ts';
import { TREASURES, treasure } from './data.ts';
import { medicineInfo, medicineMarketValue } from './medicine-data.ts';
import { forgeCost, type SaveData } from './progress.ts';
import { freeStarter, type AuctionItem } from './auction-data.ts';
export function auctionValue(item: AuctionItem) {
  if (item.kind === 'curio') return curioValue(item.id) * item.quantity;
  if (item.kind === 'medicine') {
    return medicineMarketValue(item.id) * item.quantity;
  }
  if (!TREASURES.some((t) => t.id === item.id)) return 0;
  let value = freeStarter(item.id) ? 0 : 180;
  for (let level = 0; level < item.forgeLevel; level++) {
    const cost = forgeCost(level);
    value += cost.stones + cost.iron * 12;
  }
  return value;
}
// 奇物估值计入整世使用收益，急售接盘价单独计算，避免重复掉落放大灵石产出。
export function auctionSaleRates(item: AuctionItem): readonly [number, number] {
  return item.kind === 'curio' ? [10, 15] : [60, 80];
}
export function auctionItemName(item: AuctionItem) {
  return item.kind === 'medicine'
    ? medicineInfo(item.id)!.name
    : item.kind === 'curio'
      ? curioName(item.id)
      : treasure(item.id).name;
}
export function releaseAuctionItem(save: SaveData, item: AuctionItem) {
  if (item.kind === 'medicine') save.medicine.bag[item.id] -= item.quantity;
  else if (item.kind === 'curio' && isCurio(item.id))
    save.curios.bag[item.id] = (save.curios.bag[item.id] ?? 0) - item.quantity;
  else {
    save.artifacts = save.artifacts.filter((id) => id !== item.id);
    save.artifactDrops = save.artifactDrops.filter((id) => id !== item.id);
    save.forge[item.id] = 0;
    if (freeStarter(item.id)) {
      const auction = (save.mortal.auction ??= {
        visit: save.mortal.sectMarket?.visit ?? 0,
        closed: [],
        releasedArtifacts: [],
        history: [],
      });
      if (!auction.releasedArtifacts.includes(item.id)) auction.releasedArtifacts.push(item.id);
    }
  }
}
