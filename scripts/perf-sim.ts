// 模拟成本基准：固定种子的后期高压场景下统计每帧 g.update 耗时，防止战斗模拟复杂度回归。
// 预算宽松（常态数倍余量），只拦灾难性回归，不因运行机器快慢抖动；结果写入 artifacts/perf-sim/。
import { performance } from 'node:perf_hooks';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { Game } from '../src/game.ts';
import { freshSave, realmCost } from '../src/progress.ts';
import { autoplayChoice, autoplayInput } from '../src/autoplay.ts';
import { TREASURES, PASSIVES, FINAL_TRIAL_STAGE } from '../src/data.ts';
import { seeded } from './balance-policy.ts';

// 每帧模拟耗时预算：全部为宽松兜底，本地实测余量见 docs/development.md。
export const FRAME_BUDGET = { p95Ms: 4, maxMs: 60 };

export interface Scenario {
  id: string;
  label: string;
  stage: number;
  seconds: number;
  // 开局时间快进比例：跳到后期高密度刷怪阶段。
  progress: number;
  // full：6 法宝满级觉醒 + 4 功法满级，制造最大弹丸与技能负载；
  // mid：中等搭配，留妖王存活以制造持续弹幕压力。
  gear: 'full' | 'mid';
}
export const SCENARIOS: Scenario[] = [
  {
    id: 'sixth-late',
    label: '第六境后期 · 满配',
    stage: 5,
    seconds: 90,
    progress: 0.8,
    gear: 'full',
  },
  {
    id: 'final-trial',
    label: '第七境 · 满配逢妖王',
    stage: FINAL_TRIAL_STAGE,
    seconds: 90,
    progress: 0,
    gear: 'full',
  },
  {
    id: 'sixth-boss',
    label: '第六境妖王弹幕 · 满配',
    stage: 5,
    seconds: 75,
    progress: 1,
    gear: 'full',
  },
];

export interface ScenarioResult {
  id: string;
  label: string;
  frames: number;
  simSeconds: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  totalMs: number;
  enemyPeak: number;
  shotPeak: number;
  endState: string;
}

export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

export function frameStats(
  ms: number[],
): Omit<
  ScenarioResult,
  'id' | 'label' | 'simSeconds' | 'enemyPeak' | 'shotPeak' | 'endState' | 'totalMs'
> {
  const sorted = [...ms].sort((a, b) => a - b);
  const total = ms.reduce((sum, value) => sum + value, 0);
  return {
    frames: ms.length,
    meanMs: ms.length ? total / ms.length : NaN,
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    maxMs: sorted.length ? sorted[sorted.length - 1] : NaN,
  };
}

export function budgetBreaches(result: ScenarioResult, budget = FRAME_BUDGET): string[] {
  const breaches: string[] = [];
  if (result.p95Ms > budget.p95Ms)
    breaches.push(`p95 每帧 ${result.p95Ms.toFixed(2)}ms 超预算 ${budget.p95Ms}ms`);
  if (result.maxMs > budget.maxMs)
    breaches.push(`最差帧 ${result.maxMs.toFixed(2)}ms 超预算 ${budget.maxMs}ms`);
  // 场景必须真的跑了足够秒数（满配早杀妖王通关也会提前收尾，30 秒下限足够形成压力）。
  if (result.simSeconds < 30)
    breaches.push(`场景仅持续推进 ${result.simSeconds.toFixed(1)} 秒，压力不足`);
  return breaches;
}

export function runScenario(spec: Scenario, seed: number): ScenarioResult {
  const save = freshSave('heaven', ['metal'], 'dual', seeded(seed + 1));
  save.unlocked = spec.stage;
  // 修为对应每关入场大境（关卡 n ≈ 小境界 3n 步），避免开局属性过低秒败。
  save.cultivation = Array.from({ length: spec.stage * 3 }, (_, step) => realmCost(step)).reduce(
    (sum, cost) => sum + cost,
    0,
  );
  const game = new Game(save, spec.stage, 0, seeded(seed));
  if (spec.gear === 'full') {
    game.weapons = TREASURES.slice(0, 6).map((t) => ({
      id: t.id,
      level: 6,
      evolved: true,
      timer: 0,
    }));
    game.passives = Object.fromEntries(PASSIVES.slice(0, 4).map((p) => [p.id, 5]));
  } else {
    game.weapons = TREASURES.slice(0, 3).map((t) => ({
      id: t.id,
      level: 4,
      evolved: false,
      timer: 0,
    }));
    game.passives = Object.fromEntries(PASSIVES.slice(0, 2).map((p) => [p.id, 3]));
  }
  game.time = game.stageDuration * spec.progress;
  const ms: number[] = [];
  let enemyPeak = 0;
  let shotPeak = 0;
  const frames = Math.round(spec.seconds * 30);
  for (let frame = 0; frame < frames; frame += 1) {
    if (game.state === 'won' || game.state === 'lost') break;
    while (game.state === 'upgrade') {
      const choice = autoplayChoice(game)!;
      if (choice.reroll) game.reroll();
      else game.choose(choice.index);
    }
    if (frame % 4 === 0) game.input = autoplayInput(game);
    const start = performance.now();
    game.update(1 / 30);
    ms.push(performance.now() - start);
    enemyPeak = Math.max(enemyPeak, game.enemies.length);
    shotPeak = Math.max(shotPeak, game.shots.length);
  }
  return {
    id: spec.id,
    label: spec.label,
    ...frameStats(ms),
    totalMs: ms.reduce((sum, value) => sum + value, 0),
    simSeconds: ms.length / 30,
    enemyPeak,
    shotPeak,
    endState: game.state,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(
    `模拟成本基准：${SCENARIOS.map((s) => s.label).join(' / ')}（固定种子，30fps 逐帧计时）`,
  );
  const started = performance.now();
  const results = SCENARIOS.map((spec, index) => {
    const result = runScenario(spec, 20261010 + index);
    console.log(
      `${result.label}：${result.simSeconds.toFixed(0)} 秒 ${result.frames} 帧 · 每帧 均值 ${result.meanMs.toFixed(3)}ms / p50 ${result.p50Ms.toFixed(3)}ms / p95 ${result.p95Ms.toFixed(3)}ms / 最差 ${result.maxMs.toFixed(2)}ms · 峰值敌人 ${result.enemyPeak} 弹丸 ${result.shotPeak} · 收尾 ${result.endState}`,
    );
    return result;
  });
  const breaches = results.flatMap((result) =>
    budgetBreaches(result).map((text) => `${result.label}：${text}`),
  );
  const report = {
    generatedAt: new Date().toISOString(),
    node: process.version,
    budget: FRAME_BUDGET,
    wallSeconds: (performance.now() - started) / 1000,
    scenarios: results,
    breaches,
  };
  mkdirSync('artifacts/perf-sim', { recursive: true });
  writeFileSync('artifacts/perf-sim/report.json', JSON.stringify(report, null, 2));
  const lines = results.map(
    (r) =>
      `| ${r.label} | ${r.simSeconds.toFixed(0)}s | ${r.meanMs.toFixed(3)} | ${r.p95Ms.toFixed(3)} | ${r.maxMs.toFixed(2)} | ${r.enemyPeak} | ${r.shotPeak} |`,
  );
  writeFileSync(
    'artifacts/perf-sim/summary.md',
    `# 模拟成本基准\n\n| 场景 | 模拟时长 | 均值 ms/帧 | p95 ms/帧 | 最差 ms | 峰值敌人 | 峰值弹丸 |\n| --- | --- | --- | --- | --- | --- | --- |\n${lines.join('\n')}\n\n预算 p95 ≤ ${FRAME_BUDGET.p95Ms}ms、最差 ≤ ${FRAME_BUDGET.maxMs}ms：${breaches.length ? `未达标 ${breaches.length} 项` : '通过'}。Node ${process.version}，实跑 ${report.wallSeconds.toFixed(1)} 秒。\n`,
  );
  console.log(
    `实跑 ${report.wallSeconds.toFixed(1)} 秒；预算 p95 ≤ ${FRAME_BUDGET.p95Ms}ms、最差 ≤ ${FRAME_BUDGET.maxMs}ms`,
  );
  if (breaches.length) {
    for (const text of breaches) console.error(`未达标：${text}`);
    process.exit(1);
  }
  console.log('模拟成本基准通过。');
}
