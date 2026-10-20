import {
  isCurio,
  acquiredCurio,
  grantCurio,
  curioName,
  curioValue,
  curioRoll,
} from './curio-data.ts';
import { syncTribulationClock, type SaveData } from './progress.ts';
import { advanceMortal } from './mortal.ts';
import { serviceDues, serviceReason } from './service-preflight.ts';
import { venueCooldown, venueRealm, venueStamp } from './market-venues.ts';
import { recordChronicle, recordCurioAchievement } from './chronicle.ts';

export const CURIO_SEEKING_YEARS = 10;
export const curioSeekingChance = (attempts: number) => 20 + Math.min(5, attempts) * 10;

export function curioSeekingQuote(save: SaveData, id: string, sect = false, unfinished = false) {
  const progress = isCurio(id) ? (save.curios.seeking[id] ?? 0) : 0;
  const years = CURIO_SEEKING_YEARS;
  const price = Math.ceil((curioValue(id) * (sect ? 108 : 120)) / 300);
  const reason =
    !isCurio(id) || id === 'heaven-bottle'
      ? '此物不可指名寻得'
      : acquiredCurio(save, id)
        ? '本世已寻得此物'
        : progress === Number.MAX_SAFE_INTEGER
          ? '寻访记载已满'
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
    chance: curioSeekingChance(progress),
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
  // 同物同次的结果只由本世种子决定；换入口、读档或保存失败重试均不重抽。
  const found =
    curioRoll(save.curios.seed, `seeking:${id}:${q.progress}`) / 0x100000000 < q.chance / 100;
  if (found && grantCurio(save, id)) recordCurioAchievement(save);
  save.curios.seeking[id] = q.progress + 1;
  save.curios.soughtAt = save.age;
  const state = (save.mortal.marketVenues ??= { workAt: null, favorAt: null, receipts: [] });
  state.workAt = save.age;
  const text = `寻访${curioName(id)}，花费${q.price}灵石、十年。${found ? '循着旧闻觅得奇物，已收入行囊。' : `此行未能寻得，下次机会${q.chance < 70 ? '提高至' : '仍为'}${curioSeekingChance(q.progress + 1)}%；再访仍须等满十年。`}`;
  state.receipts.unshift({ kind: 'seek', at: save.age, text });
  state.receipts.splice(6);
  recordChronicle(save, '寻古问缘', text);
  return text;
}
