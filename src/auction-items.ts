import { TREASURES, treasure } from './data.ts';
import { medicineInfo, medicineMarketValue } from './medicine-data.ts';
import { forgeCost, type SaveData } from './progress.ts';
import { freeStarter, type AuctionItem } from './auction-data.ts';
export function auctionValue(item: AuctionItem) {
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
export function auctionItemName(item: AuctionItem) {
  return item.kind === 'medicine' ? medicineInfo(item.id)!.name : treasure(item.id).name;
}
export function releaseAuctionItem(save: SaveData, item: AuctionItem) {
  if (item.kind === 'medicine') save.medicine.bag[item.id] -= item.quantity;
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
