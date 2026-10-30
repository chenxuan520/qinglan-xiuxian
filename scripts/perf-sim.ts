// 模拟成本基准：固定种子的后期高压场景下统计每帧 g.update 耗时，防止战斗模拟复杂度回归。
// 预算宽松（常态数倍余量），只拦灾难性回归，不因运行机器快慢抖动；结果写入 artifacts/perf-sim/。
import { performance } from 'node:perf_hooks';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { Game } from '../src/game.ts';
import { freshSave, realmCost } from '../src/progress.ts';
import { freshMedicine } from '../src/medicine-data.ts';
import { autoplayChoice, autoplayInput } from '../src/autoplay.ts';
import { TREASURES, PASSIVES, FINAL_TRIAL_STAGE, STAGE_REALM_STEPS } from '../src/data.ts';
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
  // full：预设6法宝满级觉醒 + 4功法满级的混合负载，不代表所有搭配的全局最大值；
  // mid：中等搭配，留妖王存活以制造持续弹幕压力。
  gear: 'full' | 'mid';
  // 从真实0秒开始暖场，不用直接改time来跳过妖王排程。
  warmupSeconds?: number;
  seed?: number;
  requiredBossStage?: number;
}
export const FINAL_TRIAL_SEED = 20261011;
export const FINAL_TRIAL_SCENARIO: Scenario = {
  id: 'final-trial-late',
  label: '第七境末段至终态 · 自然推进满配',
  stage: FINAL_TRIAL_STAGE,
  seconds: 150,
  progress: 0,
  gear: 'full',
  warmupSeconds: 300,
  seed: FINAL_TRIAL_SEED,
  requiredBossStage: FINAL_TRIAL_STAGE,
};
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
    label: '第七境前段 0–90 秒 · 满配对照',
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
  FINAL_TRIAL_SCENARIO,
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
  seed: number;
  input: Scenario;
  initial: { save: ReturnType<typeof freshSave>; run: ReturnType<Game['snapshot']> };
  startTime: number;
  endTime: number;
  attemptedSteps: number;
  stalledSteps: number;
  warmup: { requestedSeconds: number; frames: number; startTime: number; endTime: number };
  zonePeak: number;
  effectPeak: number;
  pickupPeak: number;
  bossPeak: number;
  bossStages: number[];
  finalBossFrames: number;
  bossSpawns: { time: number; count: number }[];
}

export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

export function frameStats(
  ms: number[],
): Pick<ScenarioResult, 'frames' | 'meanMs' | 'p50Ms' | 'p95Ms' | 'maxMs'> {
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
  return [...breaches, ...coverageBreaches(result)];
}

export function coverageBreaches(result: ScenarioResult): string[] {
  const breaches: string[] = [];
  // 场景必须真的跑了足够秒数（满配早杀妖王通关也会提前收尾，30 秒下限足够形成压力）。
  if (result.simSeconds + 1e-6 < 30)
    breaches.push(`场景仅持续推进 ${result.simSeconds.toFixed(1)} 秒，压力不足`);
  if (result.frames !== result.attemptedSteps || result.stalledSteps)
    breaches.push(`含未推进的更新：有效 ${result.frames} / 尝试 ${result.attemptedSteps} 步`);
  if (Math.abs(result.simSeconds - (result.endTime - result.startTime)) > 1e-6)
    breaches.push('模拟时长与实际战斗时间区间不一致');
  if (Math.abs(result.simSeconds - result.frames / 30) > 1e-6)
    breaches.push('战斗实际推进与有效更新步数不一致');
  if (result.warmup.endTime - result.warmup.startTime + 1e-6 < result.warmup.requestedSeconds)
    breaches.push('自然暖场未推进至要求的后期，不能作为后期性能样本');
  if (
    result.input.requiredBossStage !== undefined &&
    !result.bossStages.includes(result.input.requiredBossStage)
  )
    breaches.push(`未实际覆盖要求的妖王阶段 ${result.input.requiredBossStage}`);
  if (result.input.requiredBossStage === FINAL_TRIAL_STAGE && !result.finalBossFrames)
    breaches.push('没有仙尊存活时的有效更新，不能作为终关末段样本');
  return breaches;
}

export function createScenarioGame(spec: Scenario, seed: number) {
  if (spec.warmupSeconds && spec.progress !== 0) throw new Error('自然暖场必须从0秒开始');
  const save = freshSave('heaven', ['metal'], 'dual', seeded(seed + 1));
  save.medicine = freshMedicine(seeded(seed + 2));
  save.unlocked = spec.stage;
  save.completed = Array.from({ length: spec.stage }, (_, stage) => stage);
  save.prologueSeen = save.hometownSeen = true;
  save.mortal.hometown!.stage = 'departed';
  save.runs = 1;
  // 妖王弹幕与后期自然暖场使用该境正式参考境界；旧前段对照保留原准备口径。
  const realmStep =
    spec.warmupSeconds || spec.progress === 1 ? STAGE_REALM_STEPS[spec.stage] : spec.stage * 3;
  save.cultivation = Array.from({ length: realmStep }, (_, step) => realmCost(step)).reduce(
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
  return game;
}

// 只给playing状态计时，升级照正常自动取舍；不得把暂停后的空更新算成高帧率。
export function advanceScenarioStep(game: Game, frame: number) {
  for (let attempt = 0; game.state === 'upgrade' && attempt < 8; attempt += 1) {
    const choice = autoplayChoice(game);
    if (!choice) throw new Error('性能样本没有可用升级选择');
    if (choice.reroll) game.reroll();
    else game.choose(choice.index);
  }
  if (game.state === 'upgrade') throw new Error('性能样本升级未能完成');
  if (game.state !== 'playing') return null;
  if (frame % 4 === 0) game.input = autoplayInput(game);
  const before = game.time;
  const start = performance.now();
  game.update(1 / 30);
  return { ms: performance.now() - start, advanced: game.time > before };
}

export function runScenario(spec: Scenario, seed: number): ScenarioResult {
  const game = createScenarioGame(spec, seed);
  const initial = { save: structuredClone(game.save), run: game.snapshot() };
  const warmupStart = game.time;
  let warmupFrames = 0;
  const bossSpawns: ScenarioResult['bossSpawns'] = [];
  let spawned = game.trialBossesSpawned;
  const observeSpawn = () => {
    if (game.trialBossesSpawned !== spawned) {
      spawned = game.trialBossesSpawned;
      bossSpawns.push({ time: game.time, count: spawned });
    }
  };
  for (; warmupFrames < Math.round((spec.warmupSeconds ?? 0) * 30); warmupFrames += 1) {
    const step = advanceScenarioStep(game, warmupFrames);
    observeSpawn();
    if (!step || !step.advanced) break;
  }
  const startTime = game.time;
  const ms: number[] = [];
  let enemyPeak = 0;
  let shotPeak = 0;
  let zonePeak = 0;
  let effectPeak = 0;
  let pickupPeak = 0;
  let bossPeak = 0;
  let finalBossFrames = 0;
  let attemptedSteps = 0;
  let stalledSteps = 0;
  const bossStages = new Set<number>();
  const frames = Math.round(spec.seconds * 30);
  for (let frame = 0; frame < frames; frame += 1) {
    const step = advanceScenarioStep(game, warmupFrames + frame);
    observeSpawn();
    if (!step) break;
    attemptedSteps++;
    if (!step.advanced) {
      stalledSteps++;
      break;
    }
    ms.push(step.ms);
    enemyPeak = Math.max(enemyPeak, game.enemies.length);
    shotPeak = Math.max(shotPeak, game.shots.length);
    zonePeak = Math.max(zonePeak, game.zones.length);
    effectPeak = Math.max(effectPeak, game.effects.length);
    pickupPeak = Math.max(pickupPeak, game.pickups.length);
    const bosses = game.enemies.filter((e) => e.boss && !e.dead);
    bossPeak = Math.max(bossPeak, bosses.length);
    for (const boss of bosses) bossStages.add(boss.bossStage ?? game.stage);
    if (bosses.some((boss) => boss.bossStage === FINAL_TRIAL_STAGE)) finalBossFrames++;
  }
  return {
    id: spec.id,
    label: spec.label,
    ...frameStats(ms),
    totalMs: ms.reduce((sum, value) => sum + value, 0),
    simSeconds: game.time - startTime,
    enemyPeak,
    shotPeak,
    endState: game.state,
    seed,
    input: { ...spec },
    initial,
    startTime,
    endTime: game.time,
    attemptedSteps,
    stalledSteps,
    warmup: {
      requestedSeconds: spec.warmupSeconds ?? 0,
      frames: warmupFrames,
      startTime: warmupStart,
      endTime: startTime,
    },
    zonePeak,
    effectPeak,
    pickupPeak,
    bossPeak,
    bossStages: [...bossStages],
    finalBossFrames,
    bossSpawns,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(
    `模拟成本基准：${SCENARIOS.map((s) => s.label).join(' / ')}（固定种子，30fps 逐帧计时）`,
  );
  const started = performance.now();
  const results = SCENARIOS.map((spec, index) => {
    const result = runScenario(spec, spec.seed ?? 20261010 + index);
    console.log(
      `${result.label}：战斗 ${result.startTime.toFixed(2)}–${result.endTime.toFixed(2)} 秒，有效 ${result.frames}/${result.attemptedSteps} 步 · 每帧 均值 ${result.meanMs.toFixed(3)}ms / p50 ${result.p50Ms.toFixed(3)}ms / p95 ${result.p95Ms.toFixed(3)}ms / 最差 ${result.maxMs.toFixed(2)}ms · 峰敌 ${result.enemyPeak} 弹 ${result.shotPeak} 区域 ${result.zonePeak} 特效 ${result.effectPeak} · 仙尊有效 ${result.finalBossFrames} 帧 · 收尾 ${result.endState}`,
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
      `| ${r.label} | ${r.startTime.toFixed(1)}–${r.endTime.toFixed(1)}s | ${r.frames}/${r.attemptedSteps} | ${r.meanMs.toFixed(3)} | ${r.p95Ms.toFixed(3)} | ${r.maxMs.toFixed(2)} | ${r.enemyPeak} | ${r.shotPeak} | ${r.zonePeak} | ${r.effectPeak} | ${r.endState} |`,
  );
  writeFileSync(
    'artifacts/perf-sim/summary.md',
    `# 模拟成本基准\n\n| 场景 | 实际战斗区间 | 有效/尝试步数 | 均值 ms/帧 | p95 ms/帧 | 最差 ms | 峰敌 | 峰弹 | 峰区域 | 峰特效 | 终态 |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n${lines.join('\n')}\n\n预算 p95 ≤ ${FRAME_BUDGET.p95Ms}ms、最差 ≤ ${FRAME_BUDGET.maxMs}ms：${breaches.length ? `未达标 ${breaches.length} 项` : '通过'}。Node ${process.version}，实跑 ${report.wallSeconds.toFixed(1)} 秒。输入、种子、暖场与妖王时刻见 report.json。\n`,
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
