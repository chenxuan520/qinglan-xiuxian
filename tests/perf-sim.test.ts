// 模拟成本基准的纯逻辑与小规模场景冒烟测试；完整基准由 CI 的 perf:sim 执行。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  percentile,
  frameStats,
  budgetBreaches,
  runScenario,
  FRAME_BUDGET,
  type ScenarioResult,
} from '../scripts/perf-sim.ts';

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

test('budgetBreaches 仅按预算字段与持续推进时间判定', () => {
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
  };
  assert.deepEqual(budgetBreaches(base), []);
  assert.equal(budgetBreaches({ ...base, p95Ms: FRAME_BUDGET.p95Ms + 1 }).length, 1);
  assert.equal(budgetBreaches({ ...base, maxMs: FRAME_BUDGET.maxMs + 1 }).length, 1);
  assert.equal(budgetBreaches({ ...base, simSeconds: 10 }).length, 1);
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
});
