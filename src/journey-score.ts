import { isExtremeLife } from './life-mode.ts';
import { chronicleAchievements } from './chronicle-achievements.ts';
import { SPIRIT_ROOTS, STAGES, spiritRootInfo, type SpiritRootId } from './data.ts';
import type { SaveData } from './progress.ts';
import { spiritPower } from './spirit-power.ts';

export interface AdUsage {
  root: number;
  revive: number;
  lifespan: number;
  supplies: number;
  bestRoot: SpiritRootId;
}

export const AD_PENALTIES = {
  root: 80,
  lifespan: 50,
  revive: 35,
  supplies: 20,
} as const;

export const ROOT_REVERSE_RATES: Record<SpiritRootId, number> = {
  heaven: 0,
  variant: 0.06,
  dual: 0.12,
  triple: 0.2,
  quad: 0.3,
  five: 0.4,
  none: 0.55,
};

export const ACHIEVEMENT_SCORES: Record<string, number> = {
  story: 15,
  'permanent-medicine': 20,
  'curio-three': 25,
  mastery: 30,
  'three-paths': 35,
  'level-100': 40,
  collection: 45,
  'six-immortals': 50,
  forge: 50,
  'training-master': 55,
  'five-tribulations': 60,
  'hard-immortal': 80,
  'one-life-clear': 100,
  'rootless-immortal': 110,
  peerless: 150,
};

export const STAGE_CLEAR_SCORE = 10;
export const BASE_POWER_ANCHOR = 480;
export const CLARITY_FULL_BONUS = 1.1;
export const EXTREME_SCORE_FACTOR = 1.15;
export const CLARITY_STEP_DECAY = 0.03;
export const CLARITY_MIN_FACTOR = 0.7;

export const JOURNEY_SCORE_TIERS = [
  { min: 2500, title: '万古绝尘', grade: '帝品' },
  { min: 2000, title: '道参造化', grade: '仙品' },
  { min: 1500, title: '震古烁今', grade: '极品' },
  { min: 1000, title: '道行通玄', grade: '上品' },
  { min: 450, title: '一方真人', grade: '中上品' },
  { min: 250, title: '道基渐成', grade: '中品' },
  { min: 100, title: '山海寻道', grade: '中下品' },
  { min: 0, title: '凡尘初涉', grade: '下品' },
] as const;

export function journeyScoreTier(total: number) {
  return (
    JOURNEY_SCORE_TIERS.find((item) => total >= item.min) ??
    JOURNEY_SCORE_TIERS[JOURNEY_SCORE_TIERS.length - 1]
  );
}

export function easierSpiritRoot(a: SpiritRootId, b: SpiritRootId): SpiritRootId {
  return spiritRootInfo(a).rate >= spiritRootInfo(b).rate ? a : b;
}

export function freshAdUsage(spiritRoot: SpiritRootId = 'heaven'): AdUsage {
  return {
    root: 0,
    revive: 0,
    lifespan: 0,
    supplies: 0,
    bestRoot: spiritRoot,
  };
}

export function validAdUsage(value: unknown): value is AdUsage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const u = value as Record<string, unknown>;
  const int = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
  return (
    int(u.root) &&
    int(u.revive) &&
    int(u.lifespan) &&
    int(u.supplies) &&
    SPIRIT_ROOTS.some((r) => r.id === u.bestRoot)
  );
}

export function normalizeAdUsage(value: unknown, currentRoot: SpiritRootId): AdUsage {
  if (!validAdUsage(value)) return freshAdUsage(currentRoot);
  return {
    root: value.root,
    revive: value.revive,
    lifespan: value.lifespan,
    supplies: value.supplies,
    bestRoot: easierSpiritRoot(value.bestRoot, currentRoot),
  };
}

export function journeyScore(save: SaveData) {
  const permanentSave: SaveData = {
    ...save,
    medicine: { ...save.medicine, active: {} },
  };
  const permanentPower = spiritPower(permanentSave).score;
  const powerScore = Math.max(
    10,
    Math.round(45 * Math.log2(Math.max(1, permanentPower / BASE_POWER_ANCHOR))),
  );
  const usage = normalizeAdUsage(save.adUsage, save.spiritRoot);
  const effectiveRoot = easierSpiritRoot(usage.bestRoot, save.spiritRoot);
  const reverseRate = ROOT_REVERSE_RATES[effectiveRoot];
  const rootBonus = Math.round(powerScore * reverseRate);

  const stageCount = new Set(save.completed.filter((s) => s >= 0 && s < STAGES.length)).size;
  const stageScore = stageCount * STAGE_CLEAR_SCORE;
  const achieved = chronicleAchievements(save)
    .filter((a) => a.achieved)
    .map((a) => ({ id: a.id, title: a.title, score: ACHIEVEMENT_SCORES[a.id] ?? 0 }));
  const featScore = achieved.reduce((sum, item) => sum + item.score, 0);
  const achievementScore = stageScore + featScore;

  const adCount = usage.root + usage.lifespan + usage.revive + usage.supplies;
  const adPenalty =
    usage.root * AD_PENALTIES.root +
    usage.lifespan * AD_PENALTIES.lifespan +
    usage.revive * AD_PENALTIES.revive +
    usage.supplies * AD_PENALTIES.supplies;

  const rawScore = Math.max(0, powerScore + rootBonus + achievementScore - adPenalty);
  const clarityFactor =
    adCount === 0
      ? CLARITY_FULL_BONUS
      : Math.max(CLARITY_MIN_FACTOR, Number((1 - adCount * CLARITY_STEP_DECAY).toFixed(2)));
  const clarityTotal = Math.round(rawScore * clarityFactor);
  const clarityDelta = clarityTotal - rawScore;
  const modeFactor = isExtremeLife(save) ? EXTREME_SCORE_FACTOR : 1;
  const total = Math.round(clarityTotal * modeFactor);
  const modeDelta = total - clarityTotal;
  const tier = journeyScoreTier(total);

  return {
    total,
    rawScore,
    tier: tier.title,
    grade: tier.grade,
    permanentPower,
    powerScore,
    effectiveRoot: spiritRootInfo(effectiveRoot),
    reverseRate,
    rootBonus,
    stageCount,
    stageScore,
    achieved,
    featScore,
    achievementScore,
    adUsage: usage,
    adCount,
    adPenalty,
    clarityFactor,
    clarityDelta,
    clarityTotal,
    modeFactor,
    modeDelta,
  };
}
