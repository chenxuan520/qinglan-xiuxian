import test from 'node:test';
import assert from 'node:assert/strict';
import {
  performanceSource,
  validPerformanceSnapshot,
  type PerformanceSnapshot,
} from '../src/monitor-performance.ts';
import { eligiblePerformanceRun } from '../scripts/restore-monitor-performance.ts';

const generatedAt = '2026-10-10T12:00:00Z',
  commit = 'a'.repeat(40);
const render = {
  generatedAt,
  summary: {
    samples: 3600,
    meanFps: 59,
    p5Fps: 48,
    maxGapMs: 35,
    longTasks: 0,
    longestTaskMs: null,
  },
  chrome: '/private/path',
  secret: 'must not appear',
};
const simulation = {
  generatedAt,
  budget: { p95Ms: 4, maxMs: 60 },
  scenarios: Array.from({ length: 3 }, (_, i) => ({
    label: `第${i + 1}场`,
    frames: 900,
    simSeconds: 30,
    meanMs: 0.2,
    p50Ms: 0.1,
    p95Ms: 0.5,
    maxMs: 1,
    enemyPeak: 200,
    shotPeak: 90,
  })),
  breaches: [],
};
const size = {
  generatedAt,
  budget: { jsBytes: 550000, jsGzip: 210000, cssBytes: 150000, cssGzip: 35000 },
  measure: { jsBytes: 500000, jsGzip: 180000, cssBytes: 120000, cssGzip: 26000 },
  breaches: [],
};
const snapshot = (): PerformanceSnapshot => ({
  schemaVersion: 1,
  publishedAt: generatedAt,
  sources: {
    render: performanceSource('render', render, commit, 1),
    simulation: performanceSource('simulation', simulation, commit, 2),
    size: performanceSource('size', size, commit, 2),
  },
});

test('性能公开摘要投影受限，空与失败不冒充采样成功', () => {
  const data = snapshot();
  assert.equal(validPerformanceSnapshot(data), true);
  assert.ok(!JSON.stringify(data).includes('must not appear'));
  assert.ok(!JSON.stringify(data).includes('/private/path'));
  assert.equal(performanceSource('render', null, commit, 1).state, 'unavailable');
  assert.equal(
    performanceSource('render', { generatedAt, error: 'failed' }, commit, 1).state,
    'failed',
  );
  assert.equal(
    performanceSource(
      'render',
      { ...render, summary: { ...render.summary, samples: 0 } },
      commit,
      1,
    ).state,
    'unavailable',
  );
  assert.equal(
    performanceSource(
      'render',
      { ...render, summary: { ...render.summary, meanFps: null } },
      commit,
      1,
    ).state,
    'unavailable',
  );
  data.sources.render = performanceSource('render', { generatedAt, error: 'failed' }, commit, 1);
  assert.equal(validPerformanceSnapshot(data), true);
  data.sources.render.state = 'ready';
  assert.equal(validPerformanceSnapshot(data), false);
});

test('性能门禁失败状态必须匹配明细，不能改成绿色通过', () => {
  const data = snapshot();
  data.sources.simulation = performanceSource(
    'simulation',
    { ...simulation, breaches: ['第六境 P95 超预算'] },
    commit,
    2,
  );
  assert.equal(data.sources.simulation.state, 'failed');
  assert.equal(validPerformanceSnapshot(data), true);
  data.sources.simulation.state = 'ready';
  assert.equal(validPerformanceSnapshot(data), false);
});

test('性能 artifact 仅采纳本仓库 master 正式任务，渲染可在全矩阵运行时发布', () => {
  const repo = 'chenxuan520/qinglan-xiuxian';
  const run = {
    path: '.github/workflows/balance.yml',
    head_branch: 'master',
    head_repository: { full_name: repo },
    event: 'schedule',
    status: 'in_progress',
  };
  assert.equal(eligiblePerformanceRun(run, repo, true), true);
  for (const patch of [
    { path: '.github/workflows/evil.yml' },
    { head_branch: 'feature' },
    { head_repository: { full_name: 'fork/evil' } },
    { event: 'pull_request' },
  ])
    assert.equal(eligiblePerformanceRun({ ...run, ...patch }, repo, true), false);
  assert.equal(
    eligiblePerformanceRun({ ...run, event: 'push', status: 'completed' }, repo, false),
    true,
  );
  assert.equal(eligiblePerformanceRun({ ...run, event: 'push' }, repo, false), false);
});
