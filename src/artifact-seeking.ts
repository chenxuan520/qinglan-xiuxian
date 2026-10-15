import { TREASURES, evolutionPassives, treasure } from './data.ts';
import { recordCollectionAchievement, syncTribulationClock, type SaveData } from './progress.ts';
import { SECTS } from './mortal-data.ts';
import { advanceMortal } from './mortal.ts';
import { recordChronicle } from './chronicle.ts';
import { venueCooldown, venueRealm, venueStamp } from './market-venues.ts';
import { serviceDues, serviceReason } from './service-preflight.ts';

export function seekingOptions(save: SaveData, sect = false) {
  const member = SECTS.find((s) => s.id === save.mortal.member?.id);
  return TREASURES.filter(
    (t) =>
      !save.artifacts.includes(t.id) &&
      (!sect ||
        (member &&
          ['power', 'frenzy'].includes(member.id) &&
          t.school === member.school &&
          (evolutionPassives(t).includes(member.id) ||
            t.element === treasure(save.starter).element))),
  );
}
export function seekingQuote(save: SaveData, id: string, sect = false, unfinished = false) {
  const t = seekingOptions(save, sect).find((t) => t.id === id);
  const rank = venueRealm(save),
    tier = rank >= 5 ? 2 : rank >= 4 ? 1 : 0;
  const price = 180 + (sect ? [135, 117, 108][tier] : 180),
    years = 1;
  const reason = !t
    ? '请选择尚未收藏的法宝'
    : rank < 1
      ? '筑基后可指名寻访'
      : !sect && !save.mortal.sectMarket
        ? '请先进入坊市'
        : serviceReason(save, years, unfinished) || venueCooldown(save, 'work');
  return { price, years, reserve: serviceDues(save, years), reason };
}
// 只在克隆档上办理；与托付、寻物共用十年额度，不改变本命或随机掉落。
export function seekArtifact(
  save: SaveData,
  id: string,
  stamp: string,
  sect = false,
  unfinished = false,
) {
  const q = seekingQuote(save, id, sect, unfinished);
  if (stamp !== venueStamp(save) || q.reason || save.stones < q.price + q.reserve) return undefined;
  const age = save.age;
  syncTribulationClock(save);
  save.stones -= q.price;
  advanceMortal(save, q.years * 60);
  if (Math.abs(save.age - age - q.years) > 1e-7) return undefined;
  save.artifacts.push(id);
  save.forge[id] = 0;
  save.artifactDrops = save.artifactDrops.filter((t) => t !== id);
  if (save.mortal.auction)
    save.mortal.auction.releasedArtifacts = save.mortal.auction.releasedArtifacts.filter(
      (t) => t !== id,
    );
  const state = (save.mortal.marketVenues ??= { workAt: null, favorAt: null, receipts: [] });
  state.workAt = save.age;
  const text = `指名寻得${treasure(id).name}，花费${q.price}灵石、一年。以零阶收入藏器阁，本命未变。`;
  state.receipts.unshift({ kind: 'seek', at: save.age, text });
  state.receipts.length = Math.min(6, state.receipts.length);
  recordCollectionAchievement(save);
  recordChronicle(save, '指名寻访', text);
  return text;
}
