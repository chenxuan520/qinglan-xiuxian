import { syncHumanStories } from './human-stories.ts';
import { freshHometown, validHometown } from './hometown.ts';
import { freshMedicine, validMedicine, type MedicineState } from './medicine-data.ts';
import {
  REALMS,
  STAGES,
  TREASURES,
  DIFFICULTIES,
  CULTIVATION_PATHS,
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
import { freshMortal, validMortal, SECTS, SECT_DUES, type MortalState } from './mortal-data.ts';
import {
  freshChronicle,
  restoreChronicle,
  recordChronicle,
  realmTitle,
  type Chronicle,
} from './chronicle.ts';

export interface SaveData {
  medicine: MedicineState;
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
  prologueSeen: boolean;
  hometownSeen: boolean;
  journeyEnded: boolean;
  pendingReincarnation: 'lifespan' | 'tribulation' | null;
  path: CultivationPath;
  spiritRoot: SpiritRootId;
  rootElements: ElementId[];
  age: number;
  lifespanBonus: number;
  tribulations: number;
  nextTribulationAge: number;
  tribulationReturn: unknown | null;
  mortal: MortalState;
  chronicle: Chronicle;
}
export const SAVE_KEY = 'qinglan-immortal-v1';
function initialStarter(
  elements: ElementId[],
  path: CultivationPath,
  random: () => number = Math.random,
) {
  if (elements.length) return rootStarter(elements, path);
  const pairs = Object.values(ROOT_STARTERS);
  const candidates =
    path === 'dual' ? pairs.flat() : pairs.map((pair) => pair[path === 'demonic' ? 1 : 0]);
  return candidates[Math.floor(random() * candidates.length)];
}
function recordCollectionAchievement(save: SaveData) {
  if (save.artifacts.length >= TREASURES.length)
    recordChronicle(save, '万宝归藏', '三十六件法宝尽入珍藏。', 'collection');
}
export function alignStarterWithPath(save: SaveData) {
  if (
    save.artifacts.includes(save.starter) &&
    allowsSchool(save.path, treasure(save.starter).school)
  )
    return false;
  const starter = rootStarter(
    save.rootElements.length ? save.rootElements : [treasure(save.starter).element],
    save.path,
  );
  save.artifacts = [...new Set([...save.artifacts, ...ROOT_STARTERS[treasure(starter).element]])];
  save.artifactDrops = save.artifactDrops.filter((id) => !save.artifacts.includes(id));
  save.starter = starter;
  recordCollectionAchievement(save);
  return true;
}
export function freshSave(
  spiritRoot: SpiritRootId = 'heaven',
  rootElements = rootElementsFor(spiritRoot, [], () => 0),
  path: CultivationPath = 'dual',
  random: () => number = Math.random,
): SaveData {
  const starter = initialStarter(rootElements, path, random);
  return {
    version: 1,
    medicine: freshMedicine(),
    mortal: { ...freshMortal(), hometown: freshHometown(random) },
    chronicle: freshChronicle(),
    age: 15,
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
    artifacts: [...new Set(['sword', 'nail', ...ROOT_STARTERS[treasure(starter).element]])],
    artifactDrops: [],
    starter,
    sound: false,
    volume: 0.6,
    autoplay: false,
    prologueSeen: false,
    hometownSeen: false,
    journeyEnded: false,
    pendingReincarnation: null,
    path,
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
      return freshSave(root, rootElementsFor(root, [], random), 'orthodox', random);
    }
    const s = JSON.parse(raw);
    if (!s || s.version !== 1) return base;
    if (typeof s.age === 'number' && Number.isFinite(s.age)) base.age = Math.max(0, s.age);
    if (validMedicine(s.medicine)) base.medicine = s.medicine;
    // 旧档本世不补父母；损坏的故乡字段不连带丢弃其余人间进度。
    delete base.mortal.hometown;
    if (
      s.mortal &&
      typeof s.mortal === 'object' &&
      !Array.isArray(s.mortal) &&
      s.mortal.hometown !== undefined &&
      !validHometown(s.mortal.hometown, base.age)
    )
      delete s.mortal.hometown;
    if (validMortal(s.mortal, base.age)) base.mortal = s.mortal;
    base.hometownSeen =
      typeof s.hometownSeen === 'boolean' ? s.hometownSeen : !base.mortal.hometown;
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
    base.prologueSeen = s.prologueSeen === true;
    base.path = isCultivationPath(s.path) ? s.path : 'dual';
    const sect = SECTS.find((sect) => sect.id === base.mortal.member?.id);
    if (sect) base.path = sect.school;
    const migrateEarthStarter = base.path === 'demonic' && base.starter === 'meteor';
    alignStarterWithPath(base);
    if (migrateEarthStarter)
      base.forge.vortex = Math.max(base.forge.vortex || 0, base.forge.meteor || 0);
    const realm = realmInfo(base.cultivation, base.completed.includes(FINAL_TRIAL_STAGE));
    base.journeyEnded = s.journeyEnded === true && realm.max;
    if (base.mortal.member) {
      base.mortal.member.dues = Math.min(base.mortal.member.dues, SECT_DUES[realm.index].stones);
      if (realm.max) base.mortal.member.dueAt = 0;
    }
    restoreChronicle(base, s.chronicle, realm.step, realm.ascending);
    syncHumanStories(base);
    claimArtifacts(base);
    syncTribulationClock(base);
    if (
      !base.journeyEnded &&
      ((s.pendingReincarnation === 'lifespan' &&
        Number.isFinite(lifespanInfo(base).limit) &&
        lifespanInfo(base).remaining === 0) ||
        (s.pendingReincarnation === 'tribulation' && tribulationDue(base)))
    )
      base.pendingReincarnation = s.pendingReincarnation;
    return base;
  } catch {
    return base;
  }
}
export function enterImmortalGate(save: SaveData) {
  if (
    save.journeyEnded ||
    save.pendingReincarnation ||
    !realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).max
  )
    return false;
  save.journeyEnded = true;
  save.autoplay = false;
  save.tribulationReturn = null;
  recordChronicle(save, '叩入仙门', '此世仙途圆满，携人间旧忆走向大道深处。', 'immortal-gate');
  return true;
}
export function attuneSpiritRoot(
  save: SaveData,
  root: SpiritRootId,
  elements: ElementId[],
  random: () => number = Math.random,
) {
  const info = SPIRIT_ROOTS.find((r) => r.id === root);
  if (
    !info ||
    elements.length !== info.count ||
    new Set(elements).size !== elements.length ||
    !elements.every((id) => ELEMENTS.some((e) => e.id === id))
  )
    return false;
  const starter = initialStarter(elements, save.path, random);
  save.rootElements = [...elements];
  save.spiritRoot = root;
  save.artifacts = [...new Set([...save.artifacts, ...ROOT_STARTERS[treasure(starter).element]])];
  save.artifactDrops = save.artifactDrops.filter((id) => !save.artifacts.includes(id));
  save.starter = starter;
  recordCollectionAchievement(save);
  return true;
}
export function realmInfo(cultivation: number, finalTrialCleared = false) {
  let remaining = cultivation;
  let step = 0;
  while (step < (finalTrialCleared ? 24 : 23) && remaining >= realmCost(step)) {
    remaining -= realmCost(step);
    step++;
  }
  const ascending = step === 23 && !finalTrialCleared && remaining >= realmCost(step);
  return {
    step,
    index: Math.floor(step / 3),
    name:
      step === 24
        ? REALMS[8]
        : ascending
          ? '渡劫'
          : `${REALMS[Math.floor(step / 3)]}${['初期', '中期', '后期'][step % 3]}`,
    progress: remaining,
    needed: realmCost(step),
    max: step === 24,
    locked: step === 23 && !finalTrialCleared,
    ascending,
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
  if (save.completed.includes(FINAL_TRIAL_STAGE)) {
    save.nextTribulationAge = 0;
    return;
  }
  if (
    !save.nextTribulationAge &&
    realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).index >= 7
  )
    save.nextTribulationAge = save.age + TRIBULATION_INTERVAL;
}
export function tribulationDue(save: SaveData) {
  return (
    !save.completed.includes(FINAL_TRIAL_STAGE) &&
    save.nextTribulationAge > 0 &&
    save.age >= save.nextTribulationAge - 1e-9
  );
}
export function completeTribulation(save: SaveData, round: number) {
  if (!tribulationDue(save) || round !== save.tribulations + 1) return false;
  save.tribulations = round;
  save.nextTribulationAge += TRIBULATION_INTERVAL;
  recordChronicle(
    save,
    `踏破第 ${round} 次天劫`,
    '雷霆散尽，道心仍在。',
    round === 1 ? 'tribulation' : undefined,
  );
  if (round === 5)
    recordChronicle(save, '五劫不灭', '五度踏破天劫，雷霆不能损其道心。', 'five-tribulations');
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
  const years =
    immortal && !save.completed.includes(FINAL_TRIAL_STAGE)
      ? Math.min(requested, (save.nextTribulationAge || save.age + TRIBULATION_INTERVAL) - save.age)
      : requested;
  if (years <= 0 || life.remaining <= years + 1e-9) return null;
  const chance = immortal ? 0 : years / life.limit;
  const major = realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).index;
  const budget = realmCost(major * 3) + realmCost(major * 3 + 1) + realmCost(major * 3 + 2);
  // 天灵根投入整段寿元，也至多获得当前大境界总修为的 32%；历练仍是突破的主要来源。
  const minPercent = chance * 16 * spiritRootInfo(save.spiritRoot).rate;
  const maxPercent = minPercent * 2;
  return {
    years,
    chance,
    cultivation: {
      budget,
      minPercent,
      maxPercent,
      min: Math.floor((budget * minPercent) / 100),
      max: Math.floor((budget * maxPercent) / 100),
    },
  };
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
  const { budget, minPercent, maxPercent } = plan.cultivation;
  const cultivation =
    chance > 0
      ? Math.floor((budget * (minPercent + (maxPercent - minPercent) * random())) / 100)
      : 0;
  recordChronicle(
    save,
    '闭关出关',
    `闭关 ${years.toFixed(1)} 年，修为 +${cultivation}。${
      Object.entries(gains)
        .filter(([, amount]) => amount > 0)
        .map(
          ([key, amount]) =>
            `${({ vitality: '气血', power: '法宝伤害', speed: '移速' } as Record<string, string>)[key]} +${amount}%`,
        )
        .join('、') || '根基未有额外感悟。'
    }`,
  );
  gainCultivation(save, cultivation);
  syncTribulationClock(save);
  return { years, gains, cultivation, cultivationPercent: (cultivation / budget) * 100 };
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
const REALM_HP_BONUSES = [0, 45, 95, 155, 225, 310, 415, 545];
const REALM_DAMAGE_BONUSES = [0, 35, 75, 125, 185, 260, 355, 475];
export function realmBonuses(step: number): { hp: number; damage: number } {
  if (step >= 24) {
    const previous = realmBonuses(23);
    return { hp: previous.hp + 200, damage: previous.damage };
  }
  const major = Math.floor(step / 3);
  const minor = step - major;
  // 大境界累计收益；后期突破的增量随境界提高，避免被已有加成稀释。
  const hp = REALM_HP_BONUSES[major];
  const damage = REALM_DAMAGE_BONUSES[major];
  return { hp: hp + minor * 3, damage: (damage + minor * 2.5) / 100 };
}
export const realmDamageMultiplier = (step: number) => (step >= 24 ? 2 : 1);
function recordRealmChange(
  save: SaveData,
  before: ReturnType<typeof realmInfo>,
  spiritRoot = save.spiritRoot,
) {
  const after = realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE));
  for (let step = before.step + 1; step <= after.step; step++)
    recordChronicle(
      save,
      `突破 · ${realmTitle(step)}`,
      step === 24 ? '七境皆破，渡劫功成，证得真仙。' : '修为凝成新境，气血与法宝威力提升。',
      `realm-${step}`,
    );
  if (after.step === 24 && before.step < 24 && spiritRoot === 'none')
    recordChronicle(save, '凡骨登仙', '无灵根亦证得真仙。', 'rootless-immortal');
  if (!before.ascending && after.ascending)
    recordChronicle(save, '渡劫待成仙', '修为已足，尚待踏破第七境。', 'ascension');
}
export function gainCultivation(save: SaveData, amount: number, spiritRoot = save.spiritRoot) {
  const before = realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE));
  save.cultivation += amount;
  recordRealmChange(save, before, spiritRoot);
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
export const trainingCost = (level: number) =>
  Math.round(45 * 1.42 ** Math.min(level, 9) * 1.25 ** Math.max(0, level - 9));
const FORGE_DAMAGE_BONUSES = [0, 8, 16, 24, 32, 40, 52, 68, 88, 114, 150];
export const forgeDamageBonus = (level: number) =>
  FORGE_DAMAGE_BONUSES[Math.min(MAX_FORGE_LEVEL, Math.max(0, Math.floor(level)))] / 100;
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
  recordChronicle(
    save,
    '修习根基',
    `${{ vitality: '锻体', power: '悟道', speed: '身法' }[kind]}修至 ${save.training[kind]} 阶，耗时 ${years} 年。`,
  );
  if (Object.values(save.training).every((level) => level >= 20))
    recordChronicle(save, '三元归一', '淬体、悟道与身法皆修至二十阶。', 'training-master');
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
  recordChronicle(save, '炼器有成', `${treasure(id).name}炼器至 ${level + 1} 阶。`);
  if (level + 1 === MAX_FORGE_LEVEL)
    recordChronicle(save, '炉火纯青', '首次将法宝炼至十阶。', 'forge');
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
  claimArtifacts(save);
  return dropped;
}
export function claimArtifacts(save: SaveData) {
  const claimed = save.artifactDrops.filter((id) => !save.artifacts.includes(id));
  save.artifacts.push(...claimed);
  save.artifactDrops = [];
  if (claimed.length)
    recordChronicle(save, '妖王遗宝', `收藏${claimed.map((id) => treasure(id).name).join('、')}。`);
  recordCollectionAchievement(save);
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
    path?: CultivationPath;
    startedImmortal?: boolean;
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
  gainCultivation(save, rewards.cultivationRemaining, run.spiritRoot ?? save.spiritRoot);
  save.runs++;
  save.bestKills = Math.max(save.bestKills, run.kills);
  if (run.victory) {
    const before = realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE));
    save.unlocked = Math.max(save.unlocked, Math.min(STAGES.length - 1, run.stage + 1));
    if (!save.completed.includes(run.stage)) save.completed.push(run.stage);
    recordChronicle(
      save,
      `踏破 · ${STAGES[run.stage].name}`,
      `击败${STAGES[run.stage].boss}，首次通关此境。`,
      `stage-${run.stage}`,
    );
    const path = isCultivationPath(run.path) ? run.path : save.path;
    save.chronicle.milestones[`path-${path}`] ??= save.age;
    if (CULTIVATION_PATHS.every(({ id }) => `path-${id}` in save.chronicle.milestones))
      recordChronicle(save, '三道皆证', '正道、魔道与兼修皆有通关之证。', 'three-paths');
    recordRealmChange(save, before, run.spiritRoot ?? save.spiritRoot);
    if (
      run.stage === FINAL_TRIAL_STAGE &&
      run.difficulty === DIFFICULTIES.length - 1 &&
      !(run.startedImmortal ?? before.step >= 24) &&
      realmInfo(save.cultivation, true).step === 24
    )
      recordChronicle(save, '逆境问道', '以天劫降临难度踏破第七境，证得真仙。', 'hard-immortal');
  }
  syncTribulationClock(save);
  return rewards;
}
