import { acquiredCurio, CURIO_IDS, curioName, grantCurio } from './curio-data.ts';
import { recordChronicle, recordCurioAchievement } from './chronicle.ts';
import { grantMedicine } from './medicine-data.ts';
import { lifespanInfo, type SaveData } from './progress.ts';
import { validNightBoat } from './night-boat.ts';

export function nightBoatCanClaim(save: SaveData, pendingCurios: Record<string, number> = {}) {
  const boat = save.mortal.nightBoat;
  if (
    !validNightBoat(boat, save.age) ||
    boat.claimed ||
    save.journeyEnded ||
    save.pendingReincarnation ||
    save.mortal.marketSocial?.ambush ||
    !Number.isSafeInteger(save.lifespanSpent) ||
    save.lifespanSpent < 0 ||
    !Number.isSafeInteger(save.lifespanSpent + boat.cost)
  )
    return false;
  const life = lifespanInfo(save);
  if (
    !Number.isFinite(life.base) ||
    !Number.isFinite(life.remaining) ||
    life.remaining - boat.cost < life.base * 0.1
  )
    return false;
  if (boat.kind === 'curio')
    return !acquiredCurio(save, boat.id as (typeof CURIO_IDS)[number]) && !pendingCurios[boat.id];
  const count = save.medicine.bag[boat.id] ?? 0;
  return Number.isSafeInteger(count) && count >= 0 && Number.isSafeInteger(count + 1);
}

// 调用方仍用 clone→保存→应用，写入失败时不应用这份待结快照。
export function claimNightBoat(save: SaveData, pendingCurios: Record<string, number> = {}) {
  if (!nightBoatCanClaim(save, pendingCurios)) return false;
  const boat = save.mortal.nightBoat!;
  let item: string;
  if (boat.kind === 'curio') {
    if (!grantCurio(save, boat.id)) return false;
    item = curioName(boat.id);
    recordCurioAchievement(save);
  } else item = grantMedicine(save.medicine, boat.id);
  save.lifespanSpent += boat.cost;
  boat.claimed = true;
  recordChronicle(save, '夜船', `${item} ×1，折寿 ${boat.cost} 年。`);
  return true;
}
