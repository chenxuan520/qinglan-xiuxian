import { acquiredCurio, CURIO_IDS, isCurio } from './curio-data.ts';
import { MEDICINES, medicineInfo } from './medicine-data.ts';
import { lifespanInfo, type SaveData } from './progress.ts';

export interface NightBoat {
  appearedAt: number;
  kind: 'curio' | 'timed' | 'permanent';
  id: string;
  cost: number;
  claimed: boolean;
}

export function validNightBoat(value: unknown, age: number): value is NightBoat {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const boat = value as NightBoat;
  if (
    !Number.isFinite(age) ||
    !Number.isFinite(boat.appearedAt) ||
    boat.appearedAt < 0 ||
    boat.appearedAt > age ||
    !Number.isSafeInteger(boat.cost) ||
    boat.cost <= 0 ||
    typeof boat.claimed !== 'boolean'
  )
    return false;
  if (boat.kind === 'curio') return isCurio(boat.id) && boat.id !== 'heaven-bottle';
  const medicine = medicineInfo(boat.id);
  return (
    medicine?.tier === '珍品' &&
    (boat.kind === 'timed' ? medicine.years > 0 : boat.kind === 'permanent' && medicine.years === 0)
  );
}

// 实际入镇时重判；离镇及刷新不调用，已固定的货物与折寿不会因此重抽。
export function visitNightBoat(save: SaveData, lastVisitAge?: number, random = Math.random) {
  const life = lifespanInfo(save);
  save.mortal.nightBoat = null;
  if (
    save.journeyEnded ||
    save.pendingReincarnation ||
    lastVisitAge === undefined ||
    !Number.isFinite(lastVisitAge) ||
    lastVisitAge < 0 ||
    !Number.isFinite(save.age) ||
    save.age - lastVisitAge < 2000 ||
    !Number.isFinite(life.base) ||
    random() >= 0.3
  )
    return;

  const roll = random();
  const curios = CURIO_IDS.filter((id) => id !== 'heaven-bottle' && !acquiredCurio(save, id));
  const kind: NightBoat['kind'] =
    roll < 0.4 && curios.length ? 'curio' : roll < 0.8 ? 'timed' : 'permanent';
  const pool =
    kind === 'curio'
      ? curios
      : MEDICINES.filter((m) => m.tier === '珍品' && m.years > 0 === (kind === 'timed')).map(
          (m) => m.id,
        );
  const ratio = kind === 'curio' ? 0.15 : kind === 'timed' ? 0.08 : 0.2;
  save.mortal.nightBoat = {
    appearedAt: save.age,
    kind,
    id: pool[Math.floor(random() * pool.length)],
    cost: Math.round(life.base * ratio),
    claimed: false,
  };
}

export { nightBoatCanClaim, claimNightBoat } from './night-boat-claim.ts';
