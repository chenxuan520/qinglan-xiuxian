// 模拟成本基准的纯逻辑与小规模场景冒烟测试；完整基准由 CI 的 perf:sim 执行。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  percentile,
  frameStats,
  budgetBreaches,
  coverageBreaches,
  runScenario,
  FRAME_BUDGET,
  SCENARIOS,
  FINAL_TRIAL_SCENARIO,
  FINAL_TRIAL_SEED,
  createScenarioGame,
  advanceScenarioStep,
  type ScenarioResult,
} from '../scripts/perf-sim.ts';
import { FINAL_TRIAL_STAGE, TRIAL_BOSS_TIMES, TRIAL_BOSS_INTERVAL } from '../src/data.ts';

test('percentile 取排序后向上取整位置，空序列为 NaN', () => {
  assert.ok(Number.isNaN(percentile([], 95)));
  assert.equal(percentile([1], 95), 1);
  assert.equal(percentile([10, 20, 30, 40], 50), 20);
  assert.equal(percentile([10, 20, 30, 40], 95), 40);
  assert.equal(percentile([10, 20, 30, 40], 100), 40);
  assert.equal(percentile([10, 20, 30, 40], 0), 10);
});

test('frameStats 汇总均值与分位并保持空序列安全', () => {
  const stats = frameStats([0.1, 0.2, 0.3]);
  assert.equal(stats.frames, 3);
  assert.ok(Math.abs(stats.meanMs - 0.2) < 1e-9);
  assert.equal(stats.p50Ms, 0.2);
  assert.equal(stats.p95Ms, 0.3);
  assert.equal(stats.maxMs, 0.3);
  const empty = frameStats([]);
  assert.ok(Number.isNaN(empty.meanMs));
  assert.equal(empty.frames, 0);
});

test('budgetBreaches 保留原耗时预算，并拒绝未实际推进的空采样', () => {
  const game = createScenarioGame(SCENARIOS[0], 1);
  const base: ScenarioResult = {
    id: 'x',
    label: 'x',
    frames: 2700,
    simSeconds: 90,
    meanMs: 0.2,
    p50Ms: 0.2,
    p95Ms: 0.5,
    maxMs: 2,
    totalMs: 540,
    enemyPeak: 50,
    shotPeak: 60,
    endState: 'playing',
    seed: 1,
    input: { id: 'x', label: 'x', stage: 5, seconds: 90, progress: 0.8, gear: 'full' },
    initial: { save: structuredClone(game.save), run: game.snapshot() },
    startTime: 0,
    endTime: 90,
    attemptedSteps: 2700,
    stalledSteps: 0,
    warmup: { requestedSeconds: 0, frames: 0, startTime: 0, endTime: 0 },
    zonePeak: 10,
    effectPeak: 100,
    pickupPeak: 50,
    bossPeak: 1,
    bossStages: [5],
    finalBossFrames: 0,
    bossSpawns: [],
  };
  assert.deepEqual(budgetBreaches(base), []);
  assert.equal(budgetBreaches({ ...base, p95Ms: FRAME_BUDGET.p95Ms + 1 }).length, 1);
  assert.equal(budgetBreaches({ ...base, maxMs: FRAME_BUDGET.maxMs + 1 }).length, 1);
  assert.equal(
    budgetBreaches({ ...base, simSeconds: 10, endTime: 10, frames: 300, attemptedSteps: 300 })
      .length,
    1,
  );
  assert.ok(budgetBreaches({ ...base, frames: 0, attemptedSteps: 0 }).length > 0);
  assert.ok(budgetBreaches({ ...base, stalledSteps: 1 }).length > 0);
  assert.ok(
    budgetBreaches({
      ...base,
      warmup: { requestedSeconds: 300, frames: 0, startTime: 0, endTime: 0 },
    }).some((message) => message.includes('暖场未推进')),
  );
  assert.ok(
    budgetBreaches({
      ...base,
      input: { ...base.input, requiredBossStage: FINAL_TRIAL_STAGE },
    }).some((message) => message.includes('仙尊')),
  );
});

test('高压场景冒烟：三秒模拟产出有限统计且持续推进', () => {
  const result = runScenario(
    { id: 'smoke', label: '冒烟', stage: 5, seconds: 3, progress: 0.8, gear: 'full' },
    424242,
  );
  assert.equal(result.frames, 90);
  assert.ok(result.simSeconds >= 1);
  assert.ok(Number.isFinite(result.meanMs) && result.meanMs > 0);
  assert.ok(result.enemyPeak > 0 && result.shotPeak > 0);
  assert.equal(result.attemptedSteps, result.frames);
  assert.equal(result.stalledSteps, 0);
  assert.ok(Math.abs(result.endTime - result.startTime - 3) < 1e-6);
});

test('暂停状态不计有效更新；升级状态通过正常选择后继续', () => {
  const game = createScenarioGame(SCENARIOS[0], 424242);
  game.pause();
  const time = game.time;
  assert.equal(advanceScenarioStep(game, 0), null);
  assert.equal(game.time, time);
  game.resume();
  game.state = 'upgrade';
  game.choices = [{ type: 'heal', id: 'heal', level: 1 }];
  assert.equal(advanceScenarioStep(game, 0)?.advanced, true);
  assert.equal(game.state, 'playing');
  assert.ok(game.time > time);
});

test('保留终关前段对照；后期样本从0秒自然排程到仙尊，包含最后压力与真实终态', () => {
  const early = SCENARIOS.find((scenario) => scenario.id === 'final-trial')!;
  assert.equal(early.progress, 0);
  assert.equal(early.seconds, 90);
  assert.match(early.label, /前段/);
  const result = runScenario(FINAL_TRIAL_SCENARIO, FINAL_TRIAL_SEED);
  assert.equal(result.seed, FINAL_TRIAL_SEED);
  assert.equal(result.warmup.startTime, 0);
  assert.equal(result.warmup.frames, 9000);
  assert.ok(Math.abs(result.startTime - 300) < 1e-6);
  assert.ok(result.endTime > TRIAL_BOSS_TIMES.at(-1)! + 30);
  assert.ok(['won', 'lost', 'playing'].includes(result.endState));
  assert.equal(result.bossSpawns.length, TRIAL_BOSS_TIMES.length);
  for (const [index, spawn] of result.bossSpawns.entries()) {
    assert.equal(spawn.count, index + 1);
    assert.ok(spawn.time >= TRIAL_BOSS_TIMES[index]);
    if (index)
      assert.ok(spawn.time - result.bossSpawns[index - 1].time + 1e-6 >= TRIAL_BOSS_INTERVAL);
  }
  assert.ok(result.bossStages.includes(FINAL_TRIAL_STAGE));
  assert.ok(result.finalBossFrames > 0);
  assert.ok(result.enemyPeak > 0 && result.shotPeak > 0);
  assert.ok(result.zonePeak > 0 && result.effectPeak > 0);
  assert.equal(result.stalledSteps, 0);
  assert.ok(Math.abs(result.frames / 30 - result.simSeconds) < 1e-6);
  // 耗时随机器变化；这里检查真实覆盖，其余门禁仍由perf:sim原预算判定。
  assert.deepEqual(coverageBreaches(result), []);
});
