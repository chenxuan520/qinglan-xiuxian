import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  validObserverReport,
  validObserverReportUrl,
  OBSERVER_REPORT_URL,
} from '../../src/services/observer-report.ts';
import {
  eligibleObserverReportRun,
  incompleteObserverReport,
  projectObserverReport,
  restoreObserverReport,
} from '../../scripts/observer/restore-observer-report.ts';
import type { ObserverReportRun } from '../../scripts/observer/restore-observer-report.ts';

const repository = 'chenxuan520/qinglan-xiuxian';
const at = '2026-11-06T04:00:00.000Z';
function run(id = 42, patch = {}): ObserverReportRun {
  return {
    id,
    head_sha: 'a'.repeat(40),
    path: '.github/workflows/observer.yml',
    head_branch: 'master',
    event: 'workflow_dispatch',
    status: 'completed',
    conclusion: 'success',
    created_at: at,
    updated_at: at,
    repository: { full_name: repository },
    head_repository: { full_name: repository },
    ...patch,
  };
}
function raw() {
  return {
    result: {
      snapshot: {
        schemaVersion: 1,
        at,
        observations: [
          {
            id: 'balance',
            title: '完整平衡报告',
            status: 'ready',
            metrics: [{ private: 'private-metric' }],
            signals: [],
            url: 'https://chenxuan520.github.io/qinglan-xiuxian/balance-report/diagnostics.json',
            version: 'a'.repeat(40),
            generatedAt: at,
          },
        ],
      },
      signals: [] as any[],
      notifications: [] as any[],
      recovered: [] as any[],
      analysis: {
        engine: 'pi',
        model: 'gpt-6-luna',
        status: 'skipped',
        summary: 'private-original-summary',
        findings: [] as any[],
        credentialSource: { selectedSecret: 'OPENAI_API_KEY', openaiConfigured: true },
      },
    },
    state: {
      schemaVersion: 1,
      incidents: {} as Record<string, any>,
      history: [{ secret: 'private-history' }],
    },
  };
}
function alert(id = 'hard-error') {
  return {
    id,
    sourceId: 'balance',
    title: '完整报告未通过',
    detail: '完整返回10080条，出现两项错误。',
    severity: 'critical',
    evidenceIds: ['balance'],
    immediate: true,
  };
}
function fixture() {
  const data = raw();
  return projectObserverReport(data.result, data.state, run());
}
function writeSource(directory: string, data = raw()) {
  writeFileSync(join(directory, 'result.json'), JSON.stringify(data.result));
  writeFileSync(join(directory, 'state.json'), JSON.stringify(data.state));
}

test('公开协议保持指定URL和必选字段，正常skipped不冒充AI执行', () => {
  const report = fixture();
  assert.equal(
    OBSERVER_REPORT_URL,
    'https://chenxuan520.github.io/qinglan-xiuxian/monitor/observer.json',
  );
  assert.ok(validObserverReport(report));
  assert.equal(report.state, 'healthy');
  assert.equal(report.analysis.status, 'skipped');
  assert.equal(report.analysis.verificationOnly, false);
  assert.match(report.analysis.summary, /未调用/);
  const json = JSON.stringify(report);
  assert.doesNotMatch(
    json,
    /private-history|private-metric|private-original-summary|credentialSource|OPENAI_API_KEY/,
  );
  assert.deepEqual(Object.keys(report.sources[0]).sort(), [
    'generatedAt',
    'id',
    'status',
    'title',
    'url',
    'version',
  ]);
});

test('新告警、已有问题、未确认候选、恢复条目和计数来自同一批实际记录', () => {
  const data = raw();
  const fresh = alert('new'),
    existing = alert('existing'),
    candidate = { ...alert('candidate'), immediate: false, severity: 'warning' },
    recovered = alert('recovered');
  data.result.signals = [fresh, existing, candidate];
  data.result.notifications = [fresh];
  data.result.recovered = [{ signal: recovered, resolvedAt: at }];
  data.state.incidents.existing = { signal: existing, notifiedAt: at };
  data.state.incidents.recovered = { signal: recovered, notifiedAt: at, resolvedAt: at };
  data.result.analysis.status = 'complete';
  const report = projectObserverReport(data.result, data.state, run(42, { conclusion: 'failure' }));
  assert.equal(report.state, 'attention');
  assert.deepEqual(report.counts, {
    sources: 1,
    new: 1,
    current: 3,
    recovered: 1,
    unresolved: 1,
    pending: 0,
  });
  assert.deepEqual(
    report.items.map((item) => item.status),
    ['new', 'existing', 'candidate', 'recovered'],
  );
  assert.ok(validObserverReport(report));
});

test('当前signals清空但私有state仍有未解决问题时不可healthy', () => {
  const data = raw();
  data.state.incidents.old = { signal: alert(), notifiedAt: at };
  const report = projectObserverReport(data.result, data.state, run());
  assert.equal(report.state, 'attention');
  assert.equal(report.counts.current, 0);
  assert.equal(report.counts.unresolved, 1);
  assert.equal(report.items[0].status, 'existing');
});

test('来源pending和AI失败分别保留状态，不能被原始summary洗绿', () => {
  const data = raw();
  data.result.snapshot.observations[0].status = 'pending';
  assert.equal(projectObserverReport(data.result, data.state, run()).state, 'pending');
  for (const status of ['failed', 'unavailable']) {
    data.result.analysis.status = status;
    Object.assign(data.result.analysis, {
      error: 'Bearer sk-private-leak',
      diagnostics: {
        stage: 'fetch',
        elapsedMs: 25,
        httpStatus: 403,
        endpoint: { origin: 'https://private.invalid' },
        causeCode: 'private-code',
        keyFormatReason: 'non-ascii',
      },
    });
    const report = projectObserverReport(
      data.result,
      data.state,
      run(42, { conclusion: 'failure' }),
    );
    assert.equal(report.state, 'incomplete');
    assert.equal(report.analysis.status, status);
    assert.deepEqual(report.analysis.diagnostics, {
      stage: 'fetch',
      elapsedMs: 25,
      httpStatus: 403,
    });
    assert.doesNotMatch(JSON.stringify(report), /sk-private|private-code|endpoint|keyFormatReason/);
  }
});

test('assessment只公开真实分类第一句，不带原始metrics全文；短建议和URL脱敏', () => {
  const data = raw(),
    s = alert();
  data.result.signals = data.result.notifications = [s];
  data.result.analysis.status = 'complete';
  data.result.analysis.findings = [
    {
      signalId: 'balance/hard-error',
      explanation:
        'AI 分类：证据支持（支持概率 95.0%）。原始告警：private-full-evidence {"metrics":"Bearer sk-private-value"}',
      nextSteps: ['核对版本与统计窗口。', 'OPENAI_API_KEY=private-value Bearer sk-abcdefghi'],
    },
  ];
  data.result.snapshot.observations[0].url =
    'https://private-user:private-password@chenxuan520.github.io/qinglan-xiuxian/balance-report/?token=private-query#private-hash';
  const report = projectObserverReport(data.result, data.state, run());
  assert.equal(report.items[0].assessment, 'AI 分类：证据支持（支持概率 95.0%）。');
  assert.deepEqual(
    report.sources[0].url,
    'https://chenxuan520.github.io/qinglan-xiuxian/balance-report/',
  );
  assert.ok(validObserverReport(report));
  assert.doesNotMatch(
    JSON.stringify(report),
    /private-|OPENAI_API_KEY|sk-abcdefghi|metrics|history|credentialSource/,
  );
});

test('合成连通校验明确verificationOnly，不把合成finding当真实异常', () => {
  const data = raw();
  data.result.analysis.status = 'complete';
  Object.assign(data.result.analysis, {
    verificationOnly: true,
    findings: [
      {
        signalId: 'observer-check/connectivity',
        explanation: 'AI 分类：证据支持（支持概率 100.0%）。private-synthetic',
        nextSteps: ['private-step'],
      },
    ],
  });
  const report = projectObserverReport(data.result, data.state, run());
  assert.equal(report.state, 'healthy');
  assert.equal(report.analysis.verificationOnly, true);
  assert.match(report.analysis.summary, /合成连通校验/);
  assert.equal(report.items.length, 0);
  assert.doesNotMatch(JSON.stringify(report), /private-synthetic|private-step|observer-check/);
});

test('玩家统计链接保留真实days/site窗口，仅该公开端点接受白名单query', () => {
  for (const days of ['1', '7', '30', '90'])
    for (const site of ['all', 'main', 'pages']) {
      const safe = `https://qinglan-npc-ai.011203.xyz/monitor/stats?days=${days}&site=${site}`;
      const data = raw();
      data.result.snapshot.observations[0].url =
        safe + '&token=private-token&custom=private-query#private-hash';
      const report = projectObserverReport(data.result, data.state, run());
      assert.equal(report.sources[0].url, safe);
      assert.ok(validObserverReportUrl(safe));
      assert.ok(validObserverReport(report));
      assert.doesNotMatch(
        JSON.stringify(report),
        /private-token|private-query|private-hash|token=/,
      );
      assert.equal(validObserverReportUrl(safe + '&token=private'), false);
      assert.equal(
        validObserverReportUrl(safe.replace('qinglan-npc-ai.011203.xyz', 'example.test')),
        false,
      );
    }
});

test('非法或重复的统计窗口不生成默认窗口链接，其他地址继续去query', () => {
  for (const query of ['days=0&site=all', 'days=1&site=private', 'days=1&days=7&site=all']) {
    const url = 'https://qinglan-npc-ai.011203.xyz/monitor/stats?' + query;
    assert.equal(validObserverReportUrl(url), false);
    const data = raw();
    data.result.snapshot.observations[0].url = url;
    assert.equal(projectObserverReport(data.result, data.state, run()).sources[0].url, undefined);
  }
  const data = raw();
  data.result.snapshot.observations[0].url += '?days=1&site=all&token=private';
  const report = projectObserverReport(data.result, data.state, run());
  assert.equal(
    report.sources[0].url,
    'https://chenxuan520.github.io/qinglan-xiuxian/balance-report/diagnostics.json',
  );
});

test('凭据缺失记录只给公共说明，不公开自定义secret名、值和state', () => {
  const data = raw();
  const s = {
    ...alert(),
    sourceId: 'observer-integration',
    detail: '请配置 PRIVATE_VENDOR_SECRET=sk-abcde12345',
  };
  data.result.signals = data.result.notifications = [s];
  const report = projectObserverReport(data.result, data.state, run());
  assert.equal(report.items[0].title, 'AI 分析配置不可用');
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE_VENDOR_SECRET|sk-abcde|private-history/);
});

for (const [name, mutate] of [
  ['额外私有字段', (r: any) => (r.stateHistory = 'private')],
  ['坏时间', (r: any) => (r.checkedAt = '2026-02-30T00:00:00Z')],
  ['坏SHA', (r: any) => (r.commit = 'abc')],
  ['坏run', (r: any) => (r.runId = 0)],
  ['小数计数', (r: any) => (r.counts.current = 0.5)],
  ['虚报来源数', (r: any) => (r.counts.sources = 2)],
  [
    '虚报新告警数',
    (r: any) => {
      r.counts.new = r.counts.current = 1;
    },
  ],
  ['凭据URL', (r: any) => (r.sources[0].url = 'https://user:pass@example.test/report')],
  ['queryURL', (r: any) => (r.sources[0].url += '?token=private')],
  ['脚本URL', (r: any) => (r.sources[0].url = 'javascript:alert(1)')],
  ['未知来源状态', (r: any) => (r.sources[0].status = 'healthy')],
  [
    '重复来源',
    (r: any) => {
      r.sources.push(r.sources[0]);
      r.counts.sources++;
    },
  ],
  ['诊断超限', (r: any) => (r.analysis.diagnostics = { stage: 'fetch', elapsedMs: -1 })],
  [
    '诊断私有字段',
    (r: any) => (r.analysis.diagnostics = { stage: 'fetch', elapsedMs: 1, headers: 'private' }),
  ],
  ['凭据文本', (r: any) => (r.summary = 'Bearer private-token')],
  ['secret名称', (r: any) => (r.summary = 'OPENAI_API_KEY')],
  ['超长摘要', (r: any) => (r.summary = 'x'.repeat(601))],
  [
    '虚假healthy',
    (r: any) => {
      r.counts.unresolved = 1;
    },
  ],
] as const)
  test(`协议拒绝${name}`, () => {
    const report = fixture();
    mutate(report);
    assert.equal(validObserverReport(report), false);
  });

test('正式来源限定本仓库master observer.yml的schedule/manual completed，失败仍可信', () => {
  assert.equal(eligibleObserverReportRun(run(), repository), true);
  assert.equal(
    eligibleObserverReportRun(run(42, { event: 'schedule', conclusion: 'failure' }), repository),
    true,
  );
  for (const patch of [
    { event: 'push' },
    { event: 'pull_request' },
    { status: 'in_progress' },
    { conclusion: 'cancelled' },
    { head_branch: 'feature' },
    { path: '.github/workflows/evil.yml' },
    { repository: { full_name: 'fork/evil' } },
    { head_repository: { full_name: 'fork/evil' } },
  ])
    assert.equal(eligibleObserverReportRun(run(42, patch), repository), false);
});

function mockApi(
  runs: ObserverReportRun[],
  artifact: unknown[] = [{ name: 'observer-state', expired: false }],
) {
  return (path: string) =>
    path.includes('/runs?') ? [{ workflow_runs: runs }] : [{ artifacts: artifact }];
}
test('按最新run而非artifact选择失败记录，跳过fork/cancel/pending，绝不回落旧绿色', () => {
  const directory = mkdtempSync(join(tmpdir(), 'observer-public-newest-'));
  try {
    const downloaded: number[] = [];
    const runs = [
      run(46, { conclusion: 'cancelled' }),
      run(45, { status: 'in_progress' }),
      run(44, { head_repository: { full_name: 'fork/evil' } }),
      run(43, { conclusion: 'failure' }),
      run(42),
    ];
    const report = restoreObserverReport(repository, directory, {
      api: mockApi(runs),
      download: (id, target) => {
        downloaded.push(id);
        const data = raw();
        data.result.analysis.status = 'failed';
        writeSource(target, data);
      },
    });
    assert.deepEqual(downloaded, [43]);
    assert.equal(report?.runId, 43);
    assert.equal(report?.state, 'incomplete');
    assert.equal(JSON.parse(readFileSync(join(directory, 'observer.json'), 'utf8')).runId, 43);
    assert.equal(existsSync(join(directory, 'state.json')), false);
    assert.equal(existsSync(join(directory, 'result.json')), false);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

for (const name of ['missing', 'expired', 'bad-json', 'missing-state', 'symlink'])
  test(`最新失败${name}公布当前run incomplete，不选择旧产物`, () => {
    const directory = mkdtempSync(join(tmpdir(), 'observer-public-incomplete-'));
    try {
      const downloads: number[] = [];
      const report = restoreObserverReport(repository, directory, {
        api: mockApi(
          [run(43, { conclusion: 'failure' }), run(42)],
          name === 'missing' ? [] : [{ name: 'observer-state', expired: name === 'expired' }],
        ),
        download: (id, target) => {
          downloads.push(id);
          writeSource(target);
          if (name === 'bad-json') writeFileSync(join(target, 'result.json'), '{');
          if (name === 'missing-state') rmSync(join(target, 'state.json'));
          if (name === 'symlink') {
            rmSync(join(target, 'state.json'));
            symlinkSync(join(target, 'result.json'), join(target, 'state.json'));
          }
        },
      });
      assert.equal(report?.runId, 43);
      assert.equal(report?.state, 'incomplete');
      assert.ok(validObserverReport(report));
      assert.ok(!downloads.includes(42));
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });

test('权限/网络/下载异常明确失败，不伪装无数据或覆盖既有报告', () => {
  const directory = mkdtempSync(join(tmpdir(), 'observer-public-permission-'));
  try {
    const existing = JSON.stringify(fixture());
    writeFileSync(join(directory, 'observer.json'), existing);
    for (const options of [
      {
        api: () => {
          throw new Error('403 Bearer private-token');
        },
      },
      { api: () => ({}) },
      {
        api: mockApi([run()]),
        download: () => {
          throw new Error('network sk-private-value');
        },
      },
    ]) {
      assert.throws(
        () => restoreObserverReport(repository, directory, options),
        (error) => {
          assert.doesNotMatch(String(error), /private-token|sk-private-value/);
          return true;
        },
      );
      assert.equal(readFileSync(join(directory, 'observer.json'), 'utf8'), existing);
    }
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test('真正没有正式completed运行才返回无记录，不捏造run/commit', () => {
  const directory = mkdtempSync(join(tmpdir(), 'observer-public-empty-'));
  try {
    assert.equal(restoreObserverReport(repository, directory, { api: mockApi([]) }), undefined);
    assert.equal(existsSync(join(directory, 'observer.json')), false);
    assert.ok(validObserverReport(incompleteObserverReport(run())));
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});
