import {
  BALANCE_PROTOCOL,
  balanceCases,
  FULL_SEEDS,
} from '../../scripts/balance/balance-policy.ts';
import { caseKey } from '../../scripts/balance/balance-policy.ts';
import type { BalanceCase } from '../../scripts/balance/balance-policy.ts';
import type { BattleSample, CampaignSample } from '../../scripts/balance/balance-simulation.ts';
import { TRIAL_BOSS_TIMES } from '../../src/core/data.ts';
import { realmInfo } from '../../src/core/progress.ts';

const plan = balanceCases(true);

// 纯结构/验收行为夹具：10080 个合法计划身份，所有战斗均合成，不代表真实全量实测或胜率。
// 本文件不调用 simulateCampaign/simulateFarm，也不启动 worker 或任何胜率模拟。
export function makeImportedBattleFixture(stage: number, won: boolean): BattleSample {
  return {
    stage,
    attempt: 1,
    state: won ? 'won' : 'lost',
    seconds: stage === 6 ? 400 : 200,
    entryStep: 0,
    exitStep: 1,
    cultivation: 100,
    at90: { cultivation: 65, step: 1, level: 9 },
    trials: [],
    maxAliveBosses: stage === 6 ? 2 : 1,
    firstClearCultivation: 0,
    bosses: (stage === 6 ? TRIAL_BOSS_TIMES : [180]).map((at, index) => ({
      stage: stage === 6 ? index : stage,
      at,
      deadAt: won ? at + 10 : null,
      observedSeconds: won ? 10 : 200 - at,
      hpFraction: won ? 0 : 0.5,
    })),
  };
}
export function makeImportedCampaignFixture(c: BalanceCase, won: boolean): CampaignSample {
  const battles = won
    ? Array.from({ length: 7 }, (_, stage) => makeImportedBattleFixture(stage, true))
    : [makeImportedBattleFixture(0, false)];
  return {
    case: { ...c },
    key: caseKey(c),
    complete: won,
    cleared: won ? 7 : 0,
    stop: won ? 'won' : 'lost',
    battles,
    ads: { supplies: 0, borrow: 0, revive: 0 },
    seconds: battles.reduce((n, b) => n + b.seconds, 0),
    adSeconds: 0,
    cultivation: battles.reduce((n, b) => n + b.cultivation, 0),
  };
}
function farm(c: BalanceCase) {
  let cultivation = 0;
  const battles = Array.from({ length: 20 }, (_, index) => {
    const entryStep = realmInfo(cultivation).step;
    const gain = index === 0 ? 3100 : 100;
    cultivation += gain;
    return {
      ...makeImportedBattleFixture(0, true),
      attempt: index + 1,
      cultivation: gain,
      entryStep,
      exitStep: realmInfo(cultivation).step,
      firstClearCultivation: index === 0 ? 3000 : 0,
    };
  });
  // 与 simulateFarm 的原生结构相同，刻意不添加 campaign 的 key/ads/cleared 字段。
  return { case: { ...c }, battles, cultivation, step: realmInfo(cultivation).step };
}
export function makeImportedReportFixture() {
  const thresholds = { heaven: 9, variant: 7, dual: 4, triple: 3, quad: 1, five: 0, none: 0 };
  return {
    commit: '726acaa30b2efc3a53deff94235176f955c35fcc',
    currentHash: 'a'.repeat(64),
    generatedAt: '2026-11-05T09:12:13.456Z',
    elapsedSeconds: 12345.678,
    protocol: BALANCE_PROTOCOL,
    full: true,
    cases: 10080,
    acceptanceRequired: true,
    growthTargetsRequired: true,
    passed: true,
    current: plan.map((c) =>
      makeImportedCampaignFixture(
        c,
        c.profile === 'bare' &&
          c.difficulty === 0 &&
          FULL_SEEDS.indexOf(c.seed) % 10 < thresholds[c.root],
      ),
    ),
    simulationErrors: [] as { case: BalanceCase; key: string; error: string }[],
    farms: plan
      .filter(
        (c) =>
          c.profile === 'earned' &&
          c.difficulty === 0 &&
          c.seed === 41 &&
          ['sword', 'nail'].includes(c.starter),
      )
      .map(farm),
    failures: [] as string[],
    regressionFailures: [] as string[],
    readinessFailures: [] as string[],
    targetFailures: [] as string[],
    bossFailures: [] as string[],
    groupFailures: [] as string[],
    nativeExtra: { label: '合成结构夹具，非实测', values: [1, null, '原字段'] },
  };
}
