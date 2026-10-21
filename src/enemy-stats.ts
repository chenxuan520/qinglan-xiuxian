import {
  BOSS_COMBAT,
  DIFFICULTIES,
  ELITE_PACING,
  ENEMIES,
  FINAL_TRIAL_STAGE,
  STAGES,
  STAGE_COMBAT_SCALING,
  STAGE_REALM_STEPS,
  TRIAL_PRESSURE_SECONDS,
} from './data.ts';
import { realmDamageMultiplier, realmHealthMultiplier } from './progress.ts';

export const REGIONAL_DAMAGE_MULTIPLIER = 1.1;

// 图鉴与出生时共用数值，不读取玩家资质、装备或已造成的伤害。
export function enemyCombatStats(
  stage: number,
  difficultyIndex: number,
  time: number,
  type: number,
  elite = false,
  boss = false,
  bossStage = stage,
  tribulation = 0,
) {
  const isFinalTrial = stage === FINAL_TRIAL_STAGE && !tribulation;
  if (isFinalTrial && !boss) elite = true;
  const template = ENEMIES[type];
  const difficulty = DIFFICULTIES[difficultyIndex];
  const realmStep = STAGE_REALM_STEPS[stage];
  const scaling = STAGE_COMBAT_SCALING[stage];
  const eliteScaling = elite && !boss ? scaling.elite : undefined;
  const progress = Math.min(
    1,
    time / (isFinalTrial ? TRIAL_PRESSURE_SECONDS : STAGES[stage].minutes * 60),
  );
  const strengthTime = isFinalTrial ? progress * 600 : time;
  const strength = (1 + strengthTime / 260) * (1 + stage * 0.22);
  const hp = boss
    ? (isFinalTrial
        ? bossStage === FINAL_TRIAL_STAGE
          ? 560000
          : 120000 + bossStage * 35000
        : (16000 + stage * 11000) * (tribulation ? 1 : stage === 4 ? 1.3 : stage === 5 ? 1.5 : 1)) *
      difficulty.hp *
      (tribulation ? 1 : isFinalTrial ? BOSS_COMBAT.trialHp : BOSS_COMBAT.hp[stage])
    : template.hp * strength * difficulty.hp * (elite ? 7 : 1) * (eliteScaling?.hp ?? 1);
  const lateHealth =
    !tribulation && stage >= 2 && stage <= 5 && elite && !boss
      ? 1 +
        (ELITE_PACING.hpPeaks[stage] - 1) *
          Math.max(0, Math.min(1, (progress - ELITE_PACING.hpStart) / ELITE_PACING.hpRamp)) ** 1.5
      : 1;
  return {
    hp: hp * scaling.hp * realmDamageMultiplier(realmStep) * lateHealth,
    damage:
      (boss
        ? isFinalTrial
          ? bossStage === FINAL_TRIAL_STAGE
            ? 220
            : 85 + bossStage * 10
          : 52 + stage * 16
        : template.damage * (1 + stage * 0.12)) *
      (boss ? 1 : isFinalTrial ? 1.1 + progress * 0.9 : 1 + progress * 0.35) *
      difficulty.damage *
      (boss || elite ? scaling.damage : 1 + (scaling.damage - 1) * 0.65) *
      (isFinalTrial || boss ? 1 : elite ? 2.2 : 1.3) *
      realmHealthMultiplier(realmStep) *
      (eliteScaling?.damage ?? 1) *
      (boss && !tribulation
        ? isFinalTrial
          ? BOSS_COMBAT.trialDamage
          : BOSS_COMBAT.damage[stage]
        : 1) *
      (!tribulation && stage >= 1 && stage < FINAL_TRIAL_STAGE ? REGIONAL_DAMAGE_MULTIPLIER : 1),
  };
}
