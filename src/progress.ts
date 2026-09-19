import { REALMS, STAGES, TREASURES, DIFFICULTIES } from './data.ts';

export interface SaveData {
  version: 1;
  stones: number;
  iron: number;
  cultivation: number;
  unlocked: number;
  completed: number[];
  bestKills: number;
  runs: number;
  training: { vitality: number; power: number; speed: number };
  forge: Record<string, number>;
  starter: string;
  sound: boolean;
}
export const SAVE_KEY = 'qinglan-immortal-v1';
export function freshSave(): SaveData {
  return {
    version: 1,
    stones: 0,
    iron: 0,
    cultivation: 0,
    unlocked: 0,
    completed: [],
    bestKills: 0,
    runs: 0,
    training: { vitality: 0, power: 0, speed: 0 },
    forge: {},
    starter: 'sword',
    sound: false,
  };
}
const int = (n: unknown, max = Number.MAX_SAFE_INTEGER) =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(0, Math.floor(n))) : 0;
export function parseSave(raw: string | null): SaveData {
  const base = freshSave();
  try {
    if (!raw) return base;
    const s = JSON.parse(raw);
    if (!s || s.version !== 1) return base;
    for (const key of ['stones', 'iron', 'cultivation', 'bestKills', 'runs'] as const)
      base[key] = int(s[key]);
    base.unlocked = int(s.unlocked, STAGES.length - 1);
    base.completed = Array.isArray(s.completed)
      ? [
          ...new Set<number>(
            s.completed.filter(
              (v: unknown) =>
                typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < STAGES.length,
            ),
          ),
        ]
      : [];
    for (const key of ['vitality', 'power', 'speed'] as const)
      base.training[key] = int(s.training?.[key], 20);
    for (const t of TREASURES) base.forge[t.id] = int(s.forge?.[t.id], 5);
    base.starter = TREASURES.some((t) => t.id === s.starter) ? s.starter : 'sword';
    base.sound = s.sound === true;
    return base;
  } catch {
    return base;
  }
}
export function realmInfo(cultivation: number) {
  let remaining = cultivation;
  let step = 0;
  while (step < 26 && remaining >= realmCost(step)) {
    remaining -= realmCost(step);
    step++;
  }
  return {
    step,
    index: Math.floor(step / 3),
    name: `${REALMS[Math.floor(step / 3)]}${['初期', '中期', '后期'][step % 3]}`,
    progress: remaining,
    needed: realmCost(step),
    max: step === 26,
  };
}
export const realmCost = (step: number) => Math.round(90 * 1.28 ** step);
export const trainingCost = (level: number) => Math.round(45 * 1.42 ** level);
export const forgeCost = (level: number) => ({ iron: 3 + level * 3, stones: 35 + level * 45 });
export function train(save: SaveData, kind: keyof SaveData['training']) {
  const cost = trainingCost(save.training[kind]);
  if (save.training[kind] >= 20 || save.stones < cost) return false;
  save.stones -= cost;
  save.training[kind]++;
  return true;
}
export function forge(save: SaveData, id: string) {
  if (!TREASURES.some((t) => t.id === id)) return false;
  const level = save.forge[id] || 0;
  const cost = forgeCost(level);
  if (level >= 5 || save.stones < cost.stones || save.iron < cost.iron) return false;
  save.stones -= cost.stones;
  save.iron -= cost.iron;
  save.forge[id] = level + 1;
  return true;
}
export function settleRun(
  save: SaveData,
  run: {
    stage: number;
    difficulty: number;
    kills: number;
    time: number;
    victory: boolean;
    iron: number;
    level: number;
  },
) {
  const multiplier = DIFFICULTIES[run.difficulty].reward;
  const rewards = {
    stones: Math.floor(
      (run.kills * 0.35 + run.time * 0.1 + (run.victory ? STAGES[run.stage].reward : 0)) *
        multiplier,
    ),
    cultivation: Math.floor(
      (run.kills * 0.7 + run.level * 8 + (run.victory ? 100 + run.stage * 50 : 0)) * multiplier,
    ),
    iron: run.iron + (run.victory ? 3 + run.stage * 2 : 0),
  };
  save.stones += rewards.stones;
  save.iron += rewards.iron;
  save.cultivation += rewards.cultivation;
  save.runs++;
  save.bestKills = Math.max(save.bestKills, run.kills);
  if (run.victory) {
    save.unlocked = Math.max(save.unlocked, Math.min(STAGES.length - 1, run.stage + 1));
    if (!save.completed.includes(run.stage)) save.completed.push(run.stage);
  }
  return rewards;
}
