import { STAGES } from './data.ts';
import { regionalBossSkills } from './regional-combat.ts';

// 终关旧王的0～2号始终是原三招；只追加不同的地域招式，3表示地域追袭。
const additions = [
  [
    [0, '三路藤牢'],
    [3, '长藤探路'],
  ],
  [
    [1, '离火横径'],
    [2, '三叠焰路'],
    [3, '离火追径'],
  ],
  [
    [0, '踏雪连袭'],
    [2, '冰棱夹击'],
  ],
  [
    [0, '五毒游瘴'],
    [1, '蚀骨毒息'],
    [3, '游瘴驱逐'],
  ],
  [
    [1, '幽影换形'],
    [2, '游魂双障'],
    [3, '幽影追踪'],
  ],
  [
    [0, '三叠天雷'],
    [1, '太虚雷织'],
    [2, '三路陨雷'],
    [3, '落雷问路'],
  ],
] satisfies [number, string][][];
const native = STAGES.map((stage, id) => regionalBossSkills(id, stage.skills));
const trial = STAGES.map((stage, id) => [
  ...stage.skills,
  ...(additions[id]?.map(([, name]) => name) ?? []),
]);

export function bossSkills(stage: number, finalTrial: boolean) {
  return (finalTrial ? trial : native)[stage];
}

export function bossRegionalPhase(stage: number, phase: number, finalTrial: boolean) {
  return finalTrial ? additions[stage]?.[phase - STAGES[stage].skills.length]?.[0] : phase;
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
