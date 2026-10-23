import { STAGES } from './data.ts';

// 各处妖王共用原招式；终关只改变出场排程与冷却，不替换攻击形态。
export function bossSkills(stage: number, _finalTrial: boolean) {
  return STAGES[stage].skills;
}

export function bossSkillCooldown(stage: number, finalTrial: boolean, enraged: boolean) {
  return finalTrial
    ? stage === 6
      ? enraged
        ? 1.1
        : 1.8
      : enraged
        ? 1.5
        : 2.2
    : enraged
      ? 1.85
      : 3;
}
