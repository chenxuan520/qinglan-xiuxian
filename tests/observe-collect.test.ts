import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MONITOR_COLUMNS } from '../src/monitor-protocol.ts';
import { performanceSource } from '../src/monitor-performance.ts';
import { collectSource, normalizeSource, pointer, safeText } from '../scripts/observe-collect.ts';
import { emptyObserverState, parseObserverConfig } from '../scripts/observe-policy.ts';
import {
  observerSummary,
  readObserverState,
  restoreObserverState,
  runObserver,
} from '../scripts/observer.ts';
import type { AnalysisResult, SourceSpec } from '../scripts/observe-types.ts';

const at = '2026-11-05T12:00:00.000Z';
const spec: SourceSpec = {
  id: 'test',
  title: '测试来源',
  kind: 'json',
  url: 'https://example.test/metrics',
  maxAgeHours: 2,
  metricRules: [
    {
      id: 'error-rate',
      label: '错误率',
      pointer: '/value',
      samplePointer: '/n',
      minSamples: 100,
      alertAbove: 0.1,
    },
  ],
};
const report = { generatedAt: at, version: 'v1', value: 0.2, n: 200 };
const config = () =>
  parseObserverConfig(JSON.parse(readFileSync('scripts/observer.config.json', 'utf8')));
const skipped: AnalysisResult = {
  engine: 'none',
  model: 'none',
  status: 'skipped',
  summary: '',
  findings: [],
};

test('JSON Pointer reads only own fields and decodes escaped names', () => {
  assert.equal(pointer({ 'a/b': { '~key': 3 } }, '/a~1b/~0key'), 3);
  assert.equal(pointer({}, '/constructor'), undefined);
  assert.equal(pointer(report, 'value'), undefined);
});

test('generic sources retain sample identities; absent numbers are invalid rather than zero', () => {
  const result = normalizeSource(spec, report, at);
  assert.equal(result.metrics[0].sampleSize, 200);
  assert.equal(result.version, 'v1');
  assert.equal(normalizeSource(spec, { generatedAt: at, value: 2 }, at).status, 'invalid');
  assert.equal(normalizeSource(spec, { ...report, generatedAt: 'invalid' }, at).status, 'invalid');
});

test('freshness and future timestamps are distinct from healthy reports', () => {
  assert.equal(
    normalizeSource(spec, { ...report, generatedAt: '2026-11-04T00:00:00Z' }, at).status,
    'unavailable',
  );
  assert.equal(
    normalizeSource(spec, { ...report, generatedAt: '2026-11-06T00:00:00Z' }, at).status,
    'invalid',
  );
});

test('source fetch injects env headers, rejects redirects and bounds streamed bodies', async () => {
  const result = await collectSource({ ...spec, headersEnv: { Authorization: 'TEST_AUTH' } }, at, {
    env: { TEST_AUTH: 'Bearer test-only-key' },
    fetch: async (_url, init) => {
      assert.equal(init?.redirect, 'error');
      assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer test-only-key');
      return new Response(JSON.stringify(report));
    },
  });
  assert.equal(result.status, 'ready');
  const tooLarge = await collectSource({ ...spec, maxBytes: 3 }, at, {
    fetch: async () => new Response('1234'),
  });
  assert.equal(tooLarge.status, 'unavailable');
  assert.equal(tooLarge.metrics.length, 0);
});

test('source failures do not leak response bodies, headers or exception text', async () => {
  const failed = await collectSource(spec, at, {
    fetch: async () => {
      throw new Error('Bearer fixture-secret sk-test-secret');
    },
  });
  assert.equal(failed.status, 'unavailable');
  assert.doesNotMatch(JSON.stringify(failed), /fixture-secret|sk-test-secret/);
  assert.doesNotMatch(
    safeText('sk-test-secret person@example.com 192.0.2.1 https://x.test/?token=secret'),
    /sk-test-secret|person@|192\.0|token/,
  );
});

function telemetry(versions = 1) {
  const data = {
    schemaVersion: 1,
    generatedAt: at,
    filter: { days: 1, site: 'all' },
    sections: Object.fromEntries(
      Object.keys(MONITOR_COLUMNS).map((key) => [
        key,
        { rows: [] as Record<string, string | number>[] },
      ]),
    ),
  };
  data.sections.overview.rows = [
    Object.fromEntries(MONITOR_COLUMNS.overview.map((k) => [k, k === 'sampleMax' ? 1 : 10])),
  ];
  data.sections.versions.rows = Array.from({ length: versions }, (_, i) => ({
    version: `v${i}`,
    sessions: 10,
    starts: 10,
    errors: 3,
  }));
  data.sections.stages.rows = [
    {
      stage: 0,
      difficulty: 0,
      starts: 10,
      won: 1,
      lost: 9,
      abandoned: 0,
      ends: 10,
      seconds: 500,
      levels: 1,
      levelCount: 1,
      kills: 1,
      killCount: 1,
    },
  ];
  return data;
}

test('player rates carry conservative samples; mixed-version stage rates are excluded', () => {
  const source = { ...spec, kind: 'telemetry' as const };
  const small = normalizeSource(source, telemetry(), at);
  assert.equal(small.status, 'ready');
  assert.equal(small.metrics.find((m) => m.id.startsWith('errors-'))?.sampleSize, 10);
  assert.equal(small.signals.length, 0);
  const mixed = normalizeSource(source, telemetry(2), at);
  assert.equal(
    mixed.metrics.some((m) => m.id.startsWith('stage-')),
    false,
  );
  const sampled = telemetry();
  sampled.sections.overview.rows[0].sampleMax = 5;
  assert.equal(
    normalizeSource(source, sampled, at).metrics.find((m) => m.id.startsWith('errors-'))
      ?.sampleSize,
    2,
  );
});

test('player backend section failure remains unavailable and is not zeroed', () => {
  const data = telemetry();
  (data.sections.stages as any).error = 'fixture backend failure';
  const o = normalizeSource({ ...spec, kind: 'telemetry' }, data, at);
  assert.equal(o.status, 'unavailable');
  assert.equal(o.signals[0].id, 'section-stages');
  assert.doesNotMatch(JSON.stringify(o), /fixture backend failure/);
});

const githubSpec: SourceSpec = {
  id: 'task',
  title: '后台',
  kind: 'github',
  maxAgeHours: 48,
  workflow: {
    repository: 'owner/repo',
    branch: 'master',
    path: '.github/workflows/balance.yml',
    job: 'full',
    maxRunHours: 6,
  },
};
function run(id: number, extra = {}) {
  return {
    id,
    head_branch: 'master',
    repository: { full_name: 'owner/repo' },
    head_repository: { full_name: 'owner/repo' },
    event: 'workflow_dispatch',
    conclusion: 'success',
    status: 'completed',
    created_at: at,
    head_sha: 'a'.repeat(40),
    ...extra,
  };
}

test('full task source skips forks, push and render-only runs; pending execution is not failure', async () => {
  const result = await collectSource(githubSpec, at, {
    github: async (path) => {
      if (path.includes('/jobs'))
        return { jobs: [{ name: 'full', conclusion: path.includes('/2/') ? 'skipped' : null }] };
      return {
        workflow_runs: [
          run(4, { head_repository: { full_name: 'other/fork' } }),
          run(3, { event: 'push' }),
          run(2),
          run(1, { status: 'in_progress', conclusion: null }),
        ],
      };
    },
  });
  assert.equal(result.url, 'https://github.com/owner/repo/actions/runs/1');
  assert.equal(result.status, 'pending');
  assert.deepEqual(result.signals, []);
});

test('completed background failure is immediate; timeout is separate and confirmed', async () => {
  const api = (r: unknown) => async (path: string) =>
    path.includes('/jobs')
      ? { jobs: [{ name: 'full', conclusion: 'failure' }] }
      : { workflow_runs: [r] };
  const failed = await collectSource(githubSpec, at, {
    github: api(run(1, { conclusion: 'failure' })),
  });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.signals[0].immediate, true);
  const pending = await collectSource(githubSpec, at, {
    github: api(
      run(1, { status: 'in_progress', conclusion: null, created_at: '2026-11-05T00:00:00Z' }),
    ),
  });
  assert.equal(pending.signals[0].id, 'run-stuck');
  assert.equal(pending.signals[0].immediate, undefined);
});

test('report validation failure is not described as a numeric balance regression', () => {
  const o = normalizeSource(
    { ...spec, kind: 'balance' },
    {
      schemaVersion: 1,
      generatedAt: at,
      passed: false,
      plannedSamples: 10080,
      returnedSamples: 10080,
      simulationErrors: 0,
      items: [],
      commit: 'a'.repeat(40),
    },
    at,
  );
  assert.equal(o.status, 'failed');
  assert.match(o.signals[0].detail, /不等同于通关率下降/);
});

test('performance metrics use actual sample counts and source timestamps, not publication time', () => {
  const generatedAt = '2026-11-05T11:00:00Z';
  const commit = 'a'.repeat(40);
  const data = {
    schemaVersion: 1,
    publishedAt: at,
    sources: {
      render: performanceSource(
        'render',
        {
          generatedAt,
          summary: {
            samples: 3600,
            meanFps: 60,
            p5Fps: 50,
            maxGapMs: 30,
            longTasks: 0,
            longestTaskMs: null,
          },
        },
        commit,
        1,
      ),
      simulation: performanceSource(
        'simulation',
        {
          generatedAt,
          budget: { p95Ms: 4, maxMs: 60 },
          scenarios: ['第六境后期 · 满配', '第七境 · 满配逢妖王', '第六境妖王弹幕 · 满配'].map(
            (label) => ({
              label,
              frames: 900,
              simSeconds: 30,
              meanMs: 0.2,
              p50Ms: 0.1,
              p95Ms: 0.5,
              maxMs: 1,
              enemyPeak: 200,
              shotPeak: 90,
            }),
          ),
          breaches: [],
        },
        commit,
        2,
      ),
      size: performanceSource(
        'size',
        {
          generatedAt,
          budget: { jsBytes: 600000, jsGzip: 213000, cssBytes: 170000, cssGzip: 35000 },
          measure: { jsBytes: 570000, jsGzip: 210000, cssBytes: 160000, cssGzip: 34000 },
          breaches: [],
        },
        commit,
        2,
      ),
    },
  };
  const o = normalizeSource({ ...spec, kind: 'performance' }, data, at);
  assert.equal(o.status, 'ready');
  assert.ok(o.metrics.length >= 6);
  for (const metric of o.metrics) {
    assert.equal(metric.generatedAt, generatedAt);
    assert.equal(metric.sampleSize, metric.id.startsWith('render-') ? 3600 : 900);
  }
});

test('first restore writes a bootstrap state so installation failure cannot erase history', async () => {
  const output = mkdtempSync(join(tmpdir(), 'observer-bootstrap-'));
  try {
    await restoreObserverState('owner/repo', output, '1', {
      github: async () => ({ workflow_runs: [run(1)] }),
    });
    assert.deepEqual(readObserverState(join(output, 'state.json')), emptyObserverState());
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

test('restore retains failure-run history and rejects corrupt newest state instead of falling back', async () => {
  const output = mkdtempSync(join(tmpdir(), 'observer-restore-'));
  const api = async (path: string) =>
    path.includes('/artifacts')
      ? { artifacts: [{ name: 'observer-state', expired: false, size_in_bytes: 100 }] }
      : { workflow_runs: [run(2, { conclusion: 'failure' }), run(1)] };
  const downloads: number[] = [];
  try {
    await restoreObserverState('owner/repo', output, '3', {
      github: api,
      download: (id, target) => {
        downloads.push(id);
        mkdirSync(target, { recursive: true });
        writeFileSync(join(target, 'state.json'), JSON.stringify(emptyObserverState()));
      },
    });
    assert.deepEqual(downloads, [2]);
    await assert.rejects(
      restoreObserverState('owner/repo', output, '3', {
        github: api,
        download: (id, target) => {
          downloads.push(id);
          mkdirSync(target, { recursive: true });
          writeFileSync(join(target, 'state.json'), '{}');
        },
      }),
    );
    assert.deepEqual(downloads, [2, 2]);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

test('expired prior state is not silently reset; fork history is never restored', async () => {
  const output = mkdtempSync(join(tmpdir(), 'observer-expired-'));
  try {
    let downloaded = false;
    await assert.rejects(
      restoreObserverState('owner/repo', output, '3', {
        github: async (path) =>
          path.includes('/artifacts')
            ? { artifacts: [{ name: 'observer-state', expired: true }] }
            : { workflow_runs: [run(2)] },
        download: () => {
          downloaded = true;
        },
      }),
      /状态缺失或过期/,
    );
    assert.equal(downloaded, false);
    await restoreObserverState('owner/repo', output, '3', {
      github: async () => ({
        workflow_runs: [run(2, { head_repository: { full_name: 'other/fork' } })],
      }),
      download: () => {
        downloaded = true;
      },
    });
    assert.equal(downloaded, false);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

test('end-to-end observer preserves state before failure and suppresses repeat notifications', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'observer-test-'));
  try {
    const c = config();
    c.sources = [spec];
    c.analysis.engine = 'none';
    const collect = async (_source: SourceSpec, time: string) => ({
      ...normalizeSource(spec, { ...report, generatedAt: time }, time),
      status: 'failed' as const,
      signals: [
        {
          id: 'failure',
          sourceId: spec.id,
          severity: 'critical' as const,
          title: '任务失败',
          detail: '样本未返回',
          evidenceIds: [spec.id],
          immediate: true,
        },
      ],
    });
    const analyze = async () => skipped;
    const first = await runObserver(c, emptyObserverState(), directory, at, { collect, analyze });
    assert.equal(first.failed, true);
    assert.equal(JSON.parse(readFileSync(join(directory, 'exit.json'), 'utf8')).newIncidents, 1);
    const restored = readObserverState(join(directory, 'state.json'));
    const second = await runObserver(c, restored, directory, '2026-11-05T13:00:00Z', {
      collect,
      analyze,
    });
    assert.equal(second.failed, false);
    assert.equal(second.decision.signals.length, 1);
    assert.match(readFileSync(join(directory, 'summary.md'), 'utf8'), /未重复提醒/);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test('healthy runs and confirmed recovery summaries are concise', () => {
  const text = observerSummary(
    { schemaVersion: 1, at, observations: [] },
    { state: emptyObserverState(), signals: [], notifications: [], recovered: [] },
    skipped,
  );
  assert.match(text, /未发现异常/);
  assert.equal(text.split('\n').length, 2);
  const pending = observerSummary(
    {
      schemaVersion: 1,
      at,
      observations: [
        {
          id: 'task',
          title: '后台',
          kind: 'github',
          observedAt: at,
          status: 'pending',
          metrics: [],
          signals: [],
        },
      ],
    },
    { state: emptyObserverState(), signals: [], notifications: [], recovered: [] },
    skipped,
  );
  assert.match(pending, /执行中/);
  assert.doesNotMatch(pending, /未发现异常/);
});

test('workflow keeps observer isolated from deployments and simulation jobs', () => {
  const workflow = readFileSync('.github/workflows/observer.yml', 'utf8');
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /actions: read/);
  assert.match(workflow, /secrets\.OBSERVER_API_KEY/);
  assert.doesNotMatch(
    workflow,
    /contents: write|issues: write|pull-requests: write|balance:ci|balance:gate|deploy:|--api-key/,
  );
  assert.equal(config().analysis.model, 'gpt-6-luna');
});
