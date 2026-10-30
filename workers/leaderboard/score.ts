import {
  ELEMENTS,
  MAX_FORGE_LEVEL,
  SPIRIT_ROOTS,
  STAGES,
  STAGE_YEARS_PER_MINUTE,
  FINAL_TRIAL_STAGE,
  TRIAL_BOSS_STAGES,
  TRIAL_BOSS_TIMES,
  TREASURES,
  allowsSchool,
} from '../../src/data.ts';
import { CURIO_IDS } from '../../src/curio-data.ts';
import { MAX_MASTERY, SECTS } from '../../src/mortal-data.ts';
import { freshSave, IMMORTAL_CULTIVATION, type SaveData } from '../../src/progress.ts';
import { journeyScore, validAdUsage } from '../../src/journey-score.ts';
import { LEADERBOARD_ACHIEVEMENTS, type LeaderboardFacts } from '../../src/leaderboard-contract.ts';

const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const count = (v: unknown, max = Number.MAX_SAFE_INTEGER): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= max;
const exact = (v: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(v).length === keys.length && keys.every((key) => Object.hasOwn(v, key));
const choice = <T extends string>(v: unknown, allowed: readonly T[]): v is T =>
  typeof v === 'string' && allowed.includes(v as T);
const ids = <T extends string>(v: unknown, allowed: readonly T[]): v is T[] =>
  Array.isArray(v) &&
  v.length <= allowed.length &&
  new Set(v).size === v.length &&
  v.every((id) => choice(id, allowed));
const levels = (v: unknown, allowed: readonly string[], max: number): v is Record<string, number> =>
  record(v) &&
  Object.keys(v).length <= allowed.length &&
  Object.entries(v).every(([key, value]) => allowed.includes(key) && count(value, max));
const triple = (v: unknown, max: number): v is SaveData['training'] =>
  record(v) &&
  exact(v, ['vitality', 'power', 'speed']) &&
  Object.values(v).every((n) => count(n, max));
const sortedRecord = (v: Record<string, number>) =>
  Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)));
function validShape(v: unknown): v is LeaderboardFacts {
  if (
    !record(v) ||
    !exact(v, [
      'ending',
      'lifeMode',
      'cultivation',
      'completed',
      'age',
      'tribulations',
      'path',
      'spiritRoot',
      'rootElements',
      'training',
      'retreatBonus',
      'forge',
      'artifacts',
      'starter',
      'curios',
      'acquiredCurios',
      'member',
      'mastery',
      'peiyingUsed',
      'achievements',
      'inherited',
      'inheritanceValue',
      'adUsage',
    ])
  )
    return false;
  const roots = SPIRIT_ROOTS.find((r) => r.id === v.spiritRoot);
  return (
    !!roots &&
    choice(v.lifeMode, ['normal', 'extreme']) &&
    choice(v.path, ['orthodox', 'demonic', 'dual']) &&
    choice(v.ending, ['lifespan', 'tribulation', 'ambush', 'extreme', 'immortal']) &&
    count(v.cultivation) &&
    count(v.inheritanceValue) &&
    count(v.tribulations) &&
    typeof v.age === 'number' &&
    Number.isFinite(v.age) &&
    v.age >= 15 &&
    Array.isArray(v.completed) &&
    v.completed.length <= STAGES.length &&
    new Set(v.completed).size === v.completed.length &&
    v.completed.every((n) => count(n, STAGES.length - 1)) &&
    ids(
      v.rootElements,
      ELEMENTS.map((e) => e.id),
    ) &&
    v.rootElements.length === roots.count &&
    triple(v.training, 20) &&
    triple(v.retreatBonus, Number.MAX_SAFE_INTEGER) &&
    levels(
      v.forge,
      TREASURES.map((t) => t.id),
      MAX_FORGE_LEVEL,
    ) &&
    ids(
      v.artifacts,
      TREASURES.map((t) => t.id),
    ) &&
    choice(
      v.starter,
      TREASURES.map((t) => t.id),
    ) &&
    v.artifacts.includes(v.starter) &&
    ids(v.curios, CURIO_IDS) &&
    ids(v.acquiredCurios, CURIO_IDS) &&
    (v.member === null ||
      choice(
        v.member,
        SECTS.map((s) => s.id),
      )) &&
    levels(
      v.mastery,
      SECTS.map((s) => s.id),
      MAX_MASTERY,
    ) &&
    count(v.peiyingUsed, 3) &&
    ids(v.achievements, LEADERBOARD_ACHIEVEMENTS) &&
    typeof v.inherited === 'boolean' &&
    validAdUsage(v.adUsage) &&
    record(v.adUsage) &&
    exact(v.adUsage, ['root', 'revive', 'lifespan', 'supplies', 'bestRoot'])
  );
}

// 只计必经的首通战斗时间；根基、闭关及人间事项可能被奇物免龄，不据此抬高下限。
export function minimumLeaderboardAge(completed: readonly number[]) {
  return completed.reduce((age, stage) => {
    const minutes =
      stage === FINAL_TRIAL_STAGE
        ? TRIAL_BOSS_TIMES[TRIAL_BOSS_STAGES.indexOf(FINAL_TRIAL_STAGE)] / 60
        : STAGES[stage].minutes;
    return age + minutes * STAGE_YEARS_PER_MINUTE[stage];
  }, 15);
}

export function parseLeaderboardFacts(value: unknown): LeaderboardFacts | null {
  if (!validShape(value)) return null;
  const f = value,
    final = f.completed.includes(STAGES.length - 1);
  const item = TREASURES.find((t) => t.id === f.starter)!;
  if (
    !allowsSchool(f.path, item.school) ||
    (f.member && SECTS.find((s) => s.id === f.member)!.school !== f.path) ||
    !f.curios.every((id) => f.acquiredCurios.includes(id)) ||
    (!f.inherited && f.inheritanceValue !== 0)
  )
    return null;
  if (
    (f.ending === 'extreme' && f.lifeMode !== 'extreme') ||
    (f.ending === 'immortal' && (!final || f.cultivation < IMMORTAL_CULTIVATION)) ||
    (f.ending === 'lifespan' && final)
  )
    return null;
  const has = (id: string) => f.achievements.includes(id);
  if (
    (has('forge') && !Object.values(f.forge).some((n) => n === MAX_FORGE_LEVEL)) ||
    (has('training-master') && !Object.values(f.training).every((n) => n === 20)) ||
    (has('mastery') && !Object.values(f.mastery).some((n) => n === MAX_MASTERY)) ||
    (has('five-tribulations') && f.tribulations < 5) ||
    (has('curio-three') && f.acquiredCurios.length < 3) ||
    (has('one-life-clear') && (f.lifeMode !== 'extreme' || !final)) ||
    ((has('rootless-immortal') || has('hard-immortal')) && !final)
  )
    return null;
  // 为取整、续局及天劫交接留下1年容差；不把该松下限当作真实游玩证明。
  if (f.age + 1 < minimumLeaderboardAge(f.completed)) return null;
  return {
    ...f,
    completed: [...f.completed].sort((a, b) => a - b),
    rootElements: [...f.rootElements],
    training: { vitality: f.training.vitality, power: f.training.power, speed: f.training.speed },
    retreatBonus: {
      vitality: f.retreatBonus.vitality,
      power: f.retreatBonus.power,
      speed: f.retreatBonus.speed,
    },
    forge: sortedRecord(f.forge),
    artifacts: [...f.artifacts].sort(),
    curios: [...f.curios].sort(),
    acquiredCurios: [...f.acquiredCurios].sort(),
    mastery: sortedRecord(f.mastery),
    achievements: LEADERBOARD_ACHIEVEMENTS.filter((id) => f.achievements.includes(id)),
    adUsage: {
      root: f.adUsage.root,
      revive: f.adUsage.revive,
      lifespan: f.adUsage.lifespan,
      supplies: f.adUsage.supplies,
      bestRoot: f.adUsage.bestRoot,
    },
  };
}

export function scoreLeaderboardFacts(facts: LeaderboardFacts) {
  const save = freshSave(facts.spiritRoot, [...facts.rootElements], facts.path, () => 0.5);
  Object.assign(save, {
    lifeMode: facts.lifeMode,
    cultivation: facts.cultivation,
    completed: [...facts.completed],
    age: facts.age,
    tribulations: facts.tribulations,
    training: { ...facts.training },
    retreatBonus: { ...facts.retreatBonus },
    forge: { ...facts.forge },
    artifacts: [...facts.artifacts],
    starter: facts.starter,
    adUsage: { ...facts.adUsage },
    inheritanceValue: facts.inheritanceValue,
    journeyEnded: facts.ending === 'immortal',
    pendingReincarnation: facts.ending === 'immortal' ? null : facts.ending,
  });
  save.curios.bag = Object.fromEntries(facts.curios.map((id) => [id, 1]));
  save.curios.acquired = CURIO_IDS.filter((id) => facts.acquiredCurios.includes(id));
  save.medicine.used.peiying = facts.peiyingUsed;
  save.mortal.mastery = { ...facts.mastery };
  save.mortal.member = facts.member ? { id: facts.member, dueAt: 0, dues: 0 } : null;
  save.chronicle.milestones = Object.fromEntries(facts.achievements.map((id) => [id, null]));
  if (facts.inherited) save.chronicle.milestones['birth-inheritance'] = null;
  return journeyScore(save);
}
