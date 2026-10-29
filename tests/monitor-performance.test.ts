import test from 'node:test';
import assert from 'node:assert/strict';
import {
  performanceSource,
  performanceData,
  validPerformanceSnapshot,
  type PerformanceSnapshot,
} from '../src/monitor-performance.ts';
import {
  eligiblePerformanceRun,
  quickPerformanceReady,
} from '../scripts/restore-monitor-performance.ts';
import { newestArtifacts } from '../scripts/ci-artifacts.ts';

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
  frame: true,
};
const simulation = {
  generatedAt,
  budget: { p95Ms: 4, maxMs: 60 },
  scenarios: ['第六境后期 · 满配', '第七境 · 满配逢妖王', '第六境妖王弹幕 · 满配'].map((label) => ({
    label,
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
  assert.equal('frame' in data.sources.render, false);
  assert.equal(
    (data.sources.render.data!.summary as Record<string, unknown>).meanFpsMethod,
    'legacy-mean-of-instant-fps',
  );
  const corrected = performanceSource(
    'render',
    {
      ...render,
      summary: { ...render.summary, meanFpsMethod: 'interval-count-over-total-ms' },
    },
    commit,
    1,
  );
  assert.equal(
    (corrected.data!.summary as Record<string, unknown>).meanFpsMethod,
    'interval-count-over-total-ms',
  );
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

test('性能摘要保留历史三场景，四场景必须包含真实末段且规范ID不缺失不重复', () => {
  const ids = ['sixth-late', 'final-trial', 'sixth-boss', 'final-trial-late'];
  const historical = performanceData('simulation', simulation)!;
  assert.deepEqual(
    (historical.scenarios as Record<string, unknown>[]).map((scenario) => scenario.id),
    ids.slice(0, 3),
  );
  const rows = [...simulation.scenarios, { ...simulation.scenarios[1], label: '终关末段' }].map(
    (scenario, index) => ({
      ...scenario,
      id: ids[index],
      startTime: index === 3 ? 300 : 0,
      endTime: index === 3 ? 330 : 30,
      attemptedSteps: 900,
      stalledSteps: 0,
      zonePeak: 10,
      effectPeak: 90,
      pickupPeak: 50,
      bossPeak: 2,
      finalBossFrames: index === 3 ? 1 : 0,
      endState: 'playing',
      initial: { privateFixture: 'must-not-publish' },
    }),
  );
  const current = { ...simulation, scenarios: rows };
  const source = performanceSource('simulation', current, commit, 2);
  assert.equal(source.state, 'ready');
  assert.equal((source.data!.scenarios as unknown[]).length, 4);
  assert.ok(!JSON.stringify(source).includes('must-not-publish'));
  assert.equal(
    validPerformanceSnapshot({
      ...snapshot(),
      sources: { ...snapshot().sources, simulation: source },
    }),
    true,
  );
  const invalidRows = [
    rows.slice(0, 2),
    [...rows, { ...rows[0] }],
    rows.map((row, index) => (index === 3 ? { ...row, id: 'other' } : row)),
    rows.map((row, index) => (index === 3 ? { ...row, id: ids[0] } : row)),
    rows.map((row, index) => (index === 3 ? { ...row, id: undefined } : row)),
    rows.map((row, index) => (index === 3 ? { ...row, finalBossFrames: 0 } : row)),
    rows.map((row, index) => (index === 3 ? { ...row, startTime: 0, endTime: 30 } : row)),
    rows.map((row, index) => (index === 3 ? { ...row, endTime: 331 } : row)),
    rows.map((row, index) => (index === 3 ? { ...row, stalledSteps: 10 } : row)),
    rows.map((row, index) => (index === 3 ? { ...row, frames: 0 } : row)),
    rows.map((row, index) => (index === 3 ? { ...row, p95Ms: NaN } : row)),
    rows.map((row, index) => (index === 3 ? { ...row, shotPeak: 1.5 } : row)),
  ];
  for (const scenarios of invalidRows)
    assert.equal(
      performanceSource('simulation', { ...current, scenarios }, commit, 2).state,
      'unavailable',
    );
  const failed = performanceSource(
    'simulation',
    {
      ...current,
      scenarios: rows.map((row, index) => (index === 3 ? { ...row, finalBossFrames: 0 } : row)),
      breaches: ['没有实际覆盖仙尊'],
    },
    commit,
    2,
  );
  assert.equal(failed.state, 'failed');
  assert.equal(
    validPerformanceSnapshot({
      ...snapshot(),
      sources: { ...snapshot().sources, simulation: failed },
    }),
    true,
  );
  assert.equal(
    performanceSource(
      'simulation',
      { ...simulation, scenarios: simulation.scenarios.map(() => simulation.scenarios[0]) },
      commit,
      2,
    ).state,
    'unavailable',
  );
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
  assert.equal(eligiblePerformanceRun({ ...run, event: 'push' }, repo, true), true);
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

test('产物内部编号及列表乱序时，仍选最新生成结果并排除过期或坏时间', () => {
  const artifacts = [
    { id: 11666011051, created_at: '2026-10-10T09:21:42Z', state: 'failed' },
    { id: 11665506904, created_at: '2026-10-10T09:10:08Z', state: 'ready' },
    { id: 11665403763, created_at: '2026-10-10T09:35:55Z', state: 'ready' },
    { id: 99999999999, created_at: '2026-10-10T10:00:00Z', expired: true },
    { id: 88888888888, created_at: 'invalid' },
  ];
  assert.deepEqual(
    newestArtifacts(artifacts).map((a) => a.id),
    [11665403763, 11666011051, 11665506904],
  );
  assert.equal(artifacts[0].id, 11666011051);
  const newestFailure = { id: 1, created_at: '2026-10-10T09:40:00Z', state: 'failed' };
  assert.equal(newestArtifacts([...artifacts, newestFailure])[0].state, 'failed');
});

test('快检性能产物上传完成即可发布，不等待并行全量；取消、未上传与外仓仍拒绝', () => {
  const repo = 'chenxuan520/qinglan-xiuxian';
  const run = {
    path: '.github/workflows/balance.yml',
    head_branch: 'master',
    head_repository: { full_name: repo },
    event: 'push',
    status: 'in_progress',
    conclusion: null,
  };
  const ready = {
    name: 'quick',
    conclusion: null,
    steps: [{ name: 'Preserve performance summaries', status: 'completed', conclusion: 'success' }],
  };
  assert.equal(quickPerformanceReady([ready]), true);
  assert.equal(eligiblePerformanceRun(run, repo, false, true), true);
  assert.equal(eligiblePerformanceRun(run, repo, false, false), false);
  for (const change of [
    { name: 'full' },
    { conclusion: 'cancelled' },
    { steps: [] },
    {
      steps: [{ name: 'Preserve performance summaries', status: 'in_progress', conclusion: null }],
    },
    {
      steps: [
        { name: 'Preserve performance summaries', status: 'completed', conclusion: 'failure' },
      ],
    },
  ])
    assert.equal(quickPerformanceReady([{ ...ready, ...change }]), false);
  for (const change of [
    { conclusion: 'cancelled' },
    { head_repository: { full_name: 'fork/other' } },
    { event: 'pull_request' },
    { head_branch: 'feat/other' },
    { status: 'queued' },
  ])
    for (const render of [true, false])
      assert.equal(eligiblePerformanceRun({ ...run, ...change }, repo, render, true), false);
  assert.equal(quickPerformanceReady([{ ...ready, conclusion: 'failure' }]), true);
});
