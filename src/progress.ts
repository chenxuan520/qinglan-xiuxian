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
  SPIRIT_ROOTS,
  spiritRootInfo,
  rollSpiritRoot,
  rootElementsFor,
  ROOT_STARTERS,
  rootStarter,
  ELEMENTS,
  REALM_LIFESPANS,
} from './data.ts';
import type { CultivationPath, SpiritRootId, ElementId } from './data.ts';

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
  retreatBonus: { vitality: number; power: number; speed: number };
  forge: Record<string, number>;
  artifacts: string[];
  artifactDrops: string[];
  starter: string;
  sound: boolean;
  volume: number;
  autoplay: boolean;
  path: CultivationPath;
  spiritRoot: SpiritRootId;
  rootElements: ElementId[];
  age: number;
  lifespanBonus: number;
  tribulations: number;
  nextTribulationAge: number;
  tribulationReturn: unknown | null;
}
export const SAVE_KEY = 'qinglan-immortal-v1';
export function freshSave(
  spiritRoot: SpiritRootId = 'heaven',
  rootElements = rootElementsFor(spiritRoot, [], () => 0),
): SaveData {
  return {
    version: 1,
    age: 0,
    lifespanBonus: 0,
    tribulations: 0,
    nextTribulationAge: 0,
    tribulationReturn: null,
    stones: 0,
    iron: 0,
    cultivation: 0,
    unlocked: 0,
    completed: [],
    bestKills: 0,
    runs: 0,
    training: { vitality: 0, power: 0, speed: 0 },
    retreatBonus: { vitality: 0, power: 0, speed: 0 },
    forge: {},
    artifacts: [...new Set(['sword', 'nail', ...ROOT_STARTERS[rootElements[0] ?? 'metal']])],
    artifactDrops: [],
    starter: rootStarter(rootElements, 'dual'),
    sound: true,
    volume: 0.6,
    autoplay: false,
    path: 'dual',
    spiritRoot,
    rootElements: [...rootElements],
  };
}
const int = (n: unknown, max = Number.MAX_SAFE_INTEGER) =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(0, Math.floor(n))) : 0;
export function parseSave(raw: string | null, random: () => number = Math.random): SaveData {
  const base = freshSave();
  try {
    if (!raw) {
      const root = rollSpiritRoot(random);
      return freshSave(root, rootElementsFor(root, [], random));
    }
    const s = JSON.parse(raw);
    if (!s || s.version !== 1) return base;
    if (typeof s.age === 'number' && Number.isFinite(s.age)) base.age = Math.max(0, s.age);
    base.lifespanBonus = int(s.lifespanBonus);
    base.tribulations = int(s.tribulations);
    if (typeof s.nextTribulationAge === 'number' && Number.isFinite(s.nextTribulationAge))
      base.nextTribulationAge = Math.max(0, s.nextTribulationAge);
    base.tribulationReturn = s.tribulationReturn ?? null;
    base.spiritRoot = SPIRIT_ROOTS.find((root) => root.id === s.spiritRoot)?.id ?? 'heaven';
    base.rootElements = rootElementsFor(base.spiritRoot, s.rootElements, random);
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
    for (const key of ['vitality', 'power', 'speed'] as const) {
      base.training[key] = int(s.training?.[key], 20);
      base.retreatBonus[key] = int(s.retreatBonus?.[key]);
    }
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
    base.artifacts = [
      ...new Set([...base.artifacts, ...ROOT_STARTERS[base.rootElements[0] ?? 'metal'], ...legacy]),
    ];
    base.artifactDrops = [...new Set(validIds(s.artifactDrops))].filter(
      (id) => !base.artifacts.includes(id),
    );
    base.starter = TREASURES.some((t) => t.id === s.starter) ? s.starter : 'sword';
    if (typeof s.sound === 'boolean') base.sound = s.sound;
    if (typeof s.volume === 'number' && Number.isFinite(s.volume))
      base.volume = Math.min(1, Math.max(0, s.volume));
    base.autoplay = s.autoplay === true;
    base.path = isCultivationPath(s.path) ? s.path : 'dual';
    if (
      !base.artifacts.includes(base.starter) ||
      !allowsSchool(base.path, treasure(base.starter).school)
    )
      base.starter = rootStarter(base.rootElements, base.path);
    syncTribulationClock(base);
    return base;
  } catch {
    return base;
  }
}
export function attuneSpiritRoot(save: SaveData, root: SpiritRootId, elements: ElementId[]) {
  const info = SPIRIT_ROOTS.find((r) => r.id === root);
  if (
    !info ||
    elements.length !== info.count ||
    new Set(elements).size !== elements.length ||
    !elements.every((id) => ELEMENTS.some((e) => e.id === id))
  )
    return false;
  save.rootElements = [...elements];
  save.spiritRoot = root;
  save.artifacts = [...new Set([...save.artifacts, ...ROOT_STARTERS[elements[0] ?? 'metal']])];
  save.artifactDrops = save.artifactDrops.filter((id) => !save.artifacts.includes(id));
  save.starter = rootStarter(elements, save.path);
  return true;
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
export function lifespanInfo(save: SaveData) {
  const realm = realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE));
  const base = REALM_LIFESPANS[realm.index];
  const limit = base + save.lifespanBonus;
  return { age: save.age, base, limit, remaining: Math.max(0, limit - save.age) };
}
export function extendLifespan(save: SaveData) {
  const base = lifespanInfo(save).base;
  if (!Number.isFinite(base)) return 0;
  const years = Math.round(base * 0.3);
  save.lifespanBonus += years;
  return years;
}
export const TRIBULATION_INTERVAL = 20000;
export function syncTribulationClock(save: SaveData) {
  if (
    !save.nextTribulationAge &&
    realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).index >= 7
  )
    save.nextTribulationAge = save.age + TRIBULATION_INTERVAL;
}
export function tribulationDue(save: SaveData) {
  return save.nextTribulationAge > 0 && save.age >= save.nextTribulationAge - 1e-9;
}
export function completeTribulation(save: SaveData, round: number) {
  if (!tribulationDue(save) || round !== save.tribulations + 1) return false;
  save.tribulations = round;
  save.nextTribulationAge += TRIBULATION_INTERVAL;
  return true;
}
export const trainingYears = (save: SaveData) =>
  Math.round(10 / spiritRootInfo(save.spiritRoot).rate) / 10;
export function retreatPlan(save: SaveData, requested: number) {
  if (
    !Number.isFinite(requested) ||
    requested <= 0 ||
    !Number.isSafeInteger(Math.round(requested * 10)) ||
    Math.abs(requested * 10 - Math.round(requested * 10)) > 1e-7 ||
    tribulationDue(save)
  )
    return null;
  const life = lifespanInfo(save);
  const immortal = !Number.isFinite(life.limit);
  const years = immortal
    ? Math.min(requested, (save.nextTribulationAge || save.age + TRIBULATION_INTERVAL) - save.age)
    : requested;
  if (years <= 0 || life.remaining <= years + 1e-9) return null;
  return { years, chance: immortal ? 0 : years / life.limit };
}
export function retreat(save: SaveData, requested: number, random: () => number = Math.random) {
  const plan = retreatPlan(save, requested);
  if (!plan) return null;
  const { years, chance } = plan;
  syncTribulationClock(save);
  save.age += years;
  const gains = { vitality: 0, power: 0, speed: 0 };
  if (chance > 0 && random() < chance) {
    const key = (['vitality', 'power', 'speed'] as const)[Math.floor(random() * 3)];
    gains[key] = 1 + Math.floor(random() * 3);
    save.retreatBonus[key] += gains[key];
  }
  return { years, gains };
}
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
  run: {
    kills: number;
    level: number;
    difficulty: number;
    combatCultivation?: number;
    spiritRoot?: SpiritRootId;
  },
  bonus = 0,
) {
  return Math.floor(
    (run.kills * 0.7 + (run.combatCultivation || 0) + run.level * 8 + bonus) *
      DIFFICULTIES[run.difficulty].reward *
      spiritRootInfo(run.spiritRoot ?? 'heaven').rate,
  );
}
export const trainingCost = (level: number) => Math.round(45 * 1.42 ** level);
export const forgeCost = (level: number) => {
  const advanced = Math.max(0, level - 4) ** 2;
  return { iron: 3 + level * 3 + advanced * 12, stones: 35 + level * 45 + advanced * 180 };
};
export function train(save: SaveData, kind: keyof SaveData['training']) {
  const cost = trainingCost(save.training[kind]);
  const years = trainingYears(save);
  if (
    save.training[kind] >= 20 ||
    save.stones < cost ||
    lifespanInfo(save).remaining <= years + 1e-9 ||
    tribulationDue(save)
  )
    return false;
  syncTribulationClock(save);
  save.stones -= cost;
  save.age += years;
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
    spiritRoot?: SpiritRootId;
  },
) {
  const multiplier = DIFFICULTIES[run.difficulty].reward;
  const cultivation = cultivationReward(
    { ...run, spiritRoot: run.spiritRoot ?? save.spiritRoot },
    run.victory ? 100 + run.stage * 50 : 0,
  );
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
  syncTribulationClock(save);
  save.runs++;
  save.bestKills = Math.max(save.bestKills, run.kills);
  if (run.victory) {
    save.unlocked = Math.max(save.unlocked, Math.min(STAGES.length - 1, run.stage + 1));
    if (!save.completed.includes(run.stage)) save.completed.push(run.stage);
  }
  return rewards;
}
