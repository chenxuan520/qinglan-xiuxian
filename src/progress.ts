import {
  REALMS,
  STAGES,
  TREASURES,
  DIFFICULTIES,
  isCultivationPath,
  allowsSchool,
  treasure,
  FINAL_TRIAL_STAGE,
  MAX_FORGE_LEVEL,
} from './data.ts';
import type { CultivationPath } from './data.ts';

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
  artifacts: string[];
  artifactDrops: string[];
  starter: string;
  sound: boolean;
  volume: number;
  autoplay: boolean;
  path: CultivationPath;
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
    artifacts: ['sword', 'nail'],
    artifactDrops: [],
    starter: 'sword',
    sound: false,
    volume: 0.6,
    autoplay: false,
    path: 'dual',
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
    if (base.completed.includes(FINAL_TRIAL_STAGE - 1)) base.unlocked = FINAL_TRIAL_STAGE;
    for (const key of ['vitality', 'power', 'speed'] as const)
      base.training[key] = int(s.training?.[key], 20);
    for (const t of TREASURES) base.forge[t.id] = int(s.forge?.[t.id], MAX_FORGE_LEVEL);
    const validIds = (ids: unknown): string[] =>
      Array.isArray(ids) ? ids.filter((id) => TREASURES.some((t) => t.id === id)) : [];
    // 旧档保留已经投入资源的法宝和本命，未投入的法宝开始收集。
    const legacy =
      s.artifacts === undefined
        ? [
            ...TREASURES.filter((t) => base.forge[t.id] > 0).map((t) => t.id),
            ...validIds([s.starter]),
          ]
        : validIds(s.artifacts);
    base.artifacts = [...new Set([...base.artifacts, ...legacy])];
    base.artifactDrops = [...new Set(validIds(s.artifactDrops))].filter(
      (id) => !base.artifacts.includes(id),
    );
    base.starter = TREASURES.some((t) => t.id === s.starter) ? s.starter : 'sword';
    base.sound = s.sound === true;
    if (typeof s.volume === 'number' && Number.isFinite(s.volume))
      base.volume = Math.min(1, Math.max(0, s.volume));
    base.autoplay = s.autoplay === true;
    base.path = isCultivationPath(s.path) ? s.path : 'dual';
    if (
      !base.artifacts.includes(base.starter) ||
      !allowsSchool(base.path, treasure(base.starter).school)
    )
      base.starter = base.path === 'demonic' ? 'nail' : 'sword';
    return base;
  } catch {
    return base;
  }
}
export function realmInfo(cultivation: number, finalTrialCleared = false) {
  let remaining = cultivation;
  let step = 0;
  while (step < (finalTrialCleared ? 26 : 23) && remaining >= realmCost(step)) {
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
    locked: step === 23 && !finalTrialCleared,
  };
}
export const realmCost = (step: number) => Math.round(90 * 1.28 ** step);
export function cultivationFactor(step: number) {
  if (step < 15) return 1;
  return [2, 6, 16, 28][Math.min(3, Math.floor(step / 3) - 5)] * 1.15 ** (step % 3);
}
// 各秘境对应的大境界修为预算，Boss 奖励不受高境界小怪折算影响。
export function bossCultivationReward(stage: number, bossStage = stage) {
  const major = Math.min(7, stage + 1);
  const budget = realmCost(major * 3) + realmCost(major * 3 + 1) + realmCost(major * 3 + 2);
  return Math.max(
    2500 * (stage + 1),
    Math.round(
      budget * (stage === FINAL_TRIAL_STAGE ? (bossStage === FINAL_TRIAL_STAGE ? 1 : 0.3) : 0.8),
    ),
  );
}
export function realmBonuses(step: number) {
  const major = Math.floor(step / 3);
  const minor = step - major;
  return { hp: major * 45 + minor * 3, damage: (major * 35 + minor * 2.5) / 100 };
}
export function cultivationReward(
  run: { kills: number; level: number; difficulty: number; combatCultivation?: number },
  bonus = 0,
) {
  return Math.floor(
    (run.kills * 0.7 + (run.combatCultivation || 0) + run.level * 8 + bonus) *
      DIFFICULTIES[run.difficulty].reward,
  );
}
export const trainingCost = (level: number) => Math.round(45 * 1.42 ** level);
export const forgeCost = (level: number) => {
  const advanced = Math.max(0, level - 4) ** 2;
  return { iron: 3 + level * 3 + advanced * 12, stones: 35 + level * 45 + advanced * 180 };
};
export function train(save: SaveData, kind: keyof SaveData['training']) {
  const cost = trainingCost(save.training[kind]);
  if (save.training[kind] >= 20 || save.stones < cost) return false;
  save.stones -= cost;
  save.training[kind]++;
  return true;
}
export function forge(save: SaveData, id: string) {
  if (!save.artifacts.includes(id) || !TREASURES.some((t) => t.id === id)) return false;
  const level = save.forge[id] || 0;
  const cost = forgeCost(level);
  if (level >= MAX_FORGE_LEVEL || save.stones < cost.stones || save.iron < cost.iron) return false;
  save.stones -= cost.stones;
  save.iron -= cost.iron;
  save.forge[id] = level + 1;
  return true;
}
export function dropArtifacts(save: SaveData, random: () => number) {
  const pool = TREASURES.filter(
    (t) => !save.artifacts.includes(t.id) && !save.artifactDrops.includes(t.id),
  );
  const dropped: string[] = [];
  while (pool.length && dropped.length < 3) {
    const [item] = pool.splice(Math.floor(random() * pool.length), 1);
    dropped.push(item.id);
  }
  save.artifactDrops.push(...dropped);
  return dropped;
}
export function claimArtifacts(save: SaveData) {
  const claimed = save.artifactDrops.filter((id) => !save.artifacts.includes(id));
  save.artifacts.push(...claimed);
  save.artifactDrops = [];
  return claimed;
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
    creditedCultivation?: number;
    combatCultivation?: number;
  },
) {
  const multiplier = DIFFICULTIES[run.difficulty].reward;
  const cultivation = cultivationReward(run, run.victory ? 100 + run.stage * 50 : 0);
  const rewards = {
    stones: Math.floor(
      (run.kills * 0.35 + run.time * 0.1 + (run.victory ? STAGES[run.stage].reward : 0)) *
        multiplier,
    ),
    cultivation,
    cultivationRemaining: cultivation - int(run.creditedCultivation, cultivation),
    iron: run.iron + (run.victory ? 3 + run.stage * 2 : 0),
  };
  save.stones += rewards.stones;
  save.iron += rewards.iron;
  save.cultivation += rewards.cultivationRemaining;
  save.runs++;
  save.bestKills = Math.max(save.bestKills, run.kills);
  if (run.victory) {
    save.unlocked = Math.max(save.unlocked, Math.min(STAGES.length - 1, run.stage + 1));
    if (!save.completed.includes(run.stage)) save.completed.push(run.stage);
  }
  return rewards;
}
