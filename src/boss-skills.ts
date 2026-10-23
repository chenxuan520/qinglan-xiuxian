import { STAGES } from './data.ts';

// 原三招固定在0～2号，已认可的新机制只追加；仙尊维持原六招。
const additions = [
  ['落种成林'],
  ['九尾回焰'],
  ['双狼合猎', '踏雪连袭'],
  ['五毒游瘴'],
  ['逆行魂影', '幽影换形'],
  ['星位轮转'],
];
const native = STAGES.map((stage, id) =>
  id < 6 ? [...stage.skills, ...additions[id]] : stage.skills,
);
const trial = native.map((skills, id) => [
  ...skills,
  ...(id === 3 ? ['游瘴驱逐'] : id === 4 ? ['幽影追踪'] : []),
]);
export function bossSkills(stage: number, finalTrial: boolean) {
  return (finalTrial ? trial : native)[stage];
}

export function bossSkillCooldown(stage: number, finalTrial: boolean, enraged: boolean) {
  const interval = finalTrial
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
  // 保留原有半血加速；统一缩短15%，半血再额外缩短15%。
  return reducedInterval(interval, enraged);
}

const reducedInterval = (interval: number, enraged: boolean) =>
  Math.round(interval * 0.85 * (enraged ? 0.85 : 1) * 1000) / 1000;
export function bossPursuitCooldown(enraged: boolean) {
  return reducedInterval(enraged ? 6.5 : 9, enraged);
}
