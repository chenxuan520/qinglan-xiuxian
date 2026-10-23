import { MEDICINES, grantMedicine, medicineInfo } from './medicine-data.ts';
import {
  CURIO_IDS,
  acquiredCurio,
  grantCurio,
  isCurio,
  curioName,
  type CurioId,
} from './curio-data.ts';
import { recordChronicle, recordCurioAchievement } from './chronicle.ts';
import { TOWN_NPCS } from './town.ts';
import type { SaveData } from './progress.ts';

export const TOWN_IMMORTAL_REWARDS = { timed: 20, curio: 40, permanent: 40 } as const;

export interface TownImmortal {
  npcId: string;
  appearedAt: number;
  medicineId: string;
  claimed: boolean;
  curioId?: CurioId;
}

export function validTownImmortal(value: unknown, age: number): value is TownImmortal {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as TownImmortal;
  return (
    TOWN_NPCS.some((n) => n.id === v.npcId && n.id.startsWith('villager-')) &&
    Number.isFinite(v.appearedAt) &&
    v.appearedAt >= 0 &&
    v.appearedAt <= age &&
    medicineInfo(v.medicineId)?.tier === '珍品' &&
    (v.curioId === undefined || (isCurio(v.curioId) && !medicineInfo(v.medicineId)!.years)) &&
    typeof v.claimed === 'boolean'
  );
}

// 仅在实际入镇、更新上次入镇年岁之前调用；短时间重进与刷新不重新抽取。
export function visitTownImmortal(save: SaveData, lastVisitAge?: number, random = Math.random) {
  if (lastVisitAge === undefined || save.age - lastVisitAge < 1000) return;
  if (random() >= 0.5) {
    save.mortal.immortal = null;
    return;
  }
  const villagers = TOWN_NPCS.filter((n) => n.id.startsWith('villager-'));
  const npcId = villagers[Math.floor(random() * villagers.length)].id;
  const rewardRoll = random() * 100;
  const timed = rewardRoll < TOWN_IMMORTAL_REWARDS.timed;
  const curios = CURIO_IDS.filter((id) => !acquiredCurio(save, id));
  const curioId =
    !timed &&
    rewardRoll < TOWN_IMMORTAL_REWARDS.timed + TOWN_IMMORTAL_REWARDS.curio &&
    curios.length
      ? curios[Math.floor(random() * curios.length)]
      : undefined;
  const pool = MEDICINES.filter((m) => m.tier === '珍品' && !!m.years === timed);
  save.mortal.immortal = {
    npcId,
    appearedAt: save.age,
    medicineId: pool[Math.floor(random() * pool.length)].id,
    claimed: false,
    ...(curioId ? { curioId } : {}),
  };
}

export function meetTownImmortal(
  save: SaveData,
  npcId: string,
  name: string,
  pendingCurios: Record<string, number> = {},
) {
  const encounter = save.mortal.immortal;
  if (!encounter || encounter.npcId !== npcId || encounter.claimed || save.journeyEnded)
    return false;
  const curio = encounter.curioId;
  // 已在其他机缘中取得（包括待结历练）的奇物不再发放，改赠入镇时已固定的丹药。
  const canGiftCurio = curio && !acquiredCurio(save, curio) && !pendingCurios[curio];
  if (!canGiftCurio && !Number.isSafeInteger((save.medicine.bag[encounter.medicineId] || 0) + 1))
    return false;
  let gift: string;
  if (canGiftCurio && grantCurio(save, curio)) {
    gift = curioName(curio);
    recordCurioAchievement(save);
  } else {
    delete encounter.curioId;
    gift = grantMedicine(save.medicine, encounter.medicineId);
  }
  encounter.claimed = true;
  const memory = `游历青岚镇，与${name}闲谈，方知仙人也恋人间烟火。获赠${gift}一份，记下一场街巷仙缘。`;
  recordChronicle(save, '市井逢仙', memory);
  save.mortal.events.unshift(`${save.age.toFixed(1)} 岁 · ${memory}`);
  save.mortal.events.splice(6);
  return true;
}
