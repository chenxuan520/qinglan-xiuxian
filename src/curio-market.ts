import { isCurio, acquiredCurio, grantCurio, curioName, curioValue } from './curio-data.ts';
import { syncTribulationClock, type SaveData } from './progress.ts';
import { advanceMortal } from './mortal.ts';
import { serviceDues, serviceReason } from './service-preflight.ts';
import { venueCooldown, venueRealm, venueStamp } from './market-venues.ts';
import { recordChronicle } from './chronicle.ts';

export function curioSeekingQuote(save: SaveData, id: string, sect = false, unfinished = false) {
  const progress = isCurio(id) ? (save.curios.seeking[id] ?? 0) : 0;
  const years = 3;
  const price = Math.ceil((curioValue(id) * (sect ? 108 : 120)) / 300);
  const reason =
    !isCurio(id) || id === 'heaven-bottle'
      ? '此物不可指名寻得'
      : acquiredCurio(save, id)
        ? '本世已寻得此物'
        : venueRealm(save) < 1
          ? '筑基后可托付寻访'
          : sect
            ? !save.mortal.member
              ? '请先拜入宗门'
              : ''
            : !save.mortal.sectMarket
              ? '请先进入坊市'
              : '';
  return {
    progress,
    years,
    price,
    reserve: serviceDues(save, years),
    reason: reason || serviceReason(save, years, unfinished) || venueCooldown(save, 'work'),
  };
}
export function seekCurio(
  save: SaveData,
  id: string,
  stamp: string,
  sect = false,
  unfinished = false,
) {
  const q = curioSeekingQuote(save, id, sect, unfinished);
  if (!isCurio(id) || q.reason || stamp !== venueStamp(save) || save.stones < q.price + q.reserve)
    return undefined;
  const age = save.age;
  syncTribulationClock(save);
  save.stones -= q.price;
  advanceMortal(save, q.years * 60);
  if (Math.abs(save.age - age - q.years) > 1e-7) return undefined;
  if (q.progress === 2) grantCurio(save, id);
  save.curios.seeking[id] = q.progress + 1;
  save.curios.soughtAt = save.age;
  const state = (save.mortal.marketVenues ??= { workAt: null, favorAt: null, receipts: [] });
  state.workAt = save.age;
  const text = `寻访${curioName(id)}，花费${q.price}灵石、三年。${q.progress === 2 ? '三次托付已毕，奇物收入行囊。' : `线索已落实${q.progress + 1}/3，再访仍须等满十年。`}`;
  state.receipts.unshift({ kind: 'seek', at: save.age, text });
  state.receipts.splice(6);
  recordChronicle(save, '寻古问缘', text);
  return text;
}
