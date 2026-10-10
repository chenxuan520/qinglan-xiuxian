import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../workers/npc-ai/index.ts';
import { monitorDeadline } from '../src/monitor-request.ts';
import { monitorResponse, type MonitorEnv } from '../workers/npc-ai/monitor.ts';
import {
  MONITOR_COLUMNS,
  monitorFilter,
  monitorQueries,
  monitorRows,
  validMonitorData,
  type MonitorData,
  type MonitorSection,
} from '../src/monitor-protocol.ts';
import {
  monitorTable,
  monitorTime,
  monitorRate,
  monitorAverage,
  validMonitorCI,
} from '../src/monitor-view.ts';

const now = Date.parse('2026-10-10T12:00:00Z');

test('请求截止区分超时与主动取消，不依赖新的静态 AbortSignal API', async () => {
  const timeout = new AbortController(),
    due = monitorDeadline(timeout, 5);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(timeout.signal.aborted, true);
  assert.equal(due.expired(), true);
  due.clear();
  const cancelled = new AbortController(),
    manual = monitorDeadline(cancelled, 50);
  cancelled.abort();
  manual.clear();
  assert.equal(manual.expired(), false);
});
const official = 'https://xiuxian.011203.xyz',
  pages = 'https://chenxuan520.github.io';
const env: MonitorEnv = {
  MONITOR_PUBLIC: 'true',
  ANALYTICS_READ_TOKEN: 'private-test-token',
  ANALYTICS_ACCOUNT_ID: 'a'.repeat(32),
  MONITOR_LIMITER: { limit: async () => ({ success: true }) },
};
const request = (query = '', origin = official, method = 'GET') =>
  new Request(`https://npc.example/monitor/stats${query}`, {
    method,
    headers: origin ? { Origin: origin, 'CF-Connecting-IP': '192.0.2.8' } : {},
  });
const headers = (origin = official) => new Headers({ 'Access-Control-Allow-Origin': origin });
const strings = new Set(['site', 'root', 'path', 'day', 'reason', 'version', 'summary', 'last']);
const row = (key: MonitorSection) =>
  Object.fromEntries(
    MONITOR_COLUMNS[key].map((c) => [
      c,
      strings.has(c)
        ? c === 'last'
          ? '2026-10-10 12:00:00'
          : '<img src=x onerror=alert(1)>'
        : '0',
    ]),
  );
function harness(failing?: MonitorSection | 'all') {
  const stored = new Map<string, Response>(),
    calls: string[] = [];
  let clock = now,
    active = 0,
    peak = 0;
  const queries = monitorQueries({ days: 7, site: 'all' });
  const cache = {
    match: async (r: Request) => stored.get(r.url)?.clone(),
    put: async (r: Request, v: Response) => {
      stored.set(r.url, v.clone());
    },
  };
  const fakeFetch = async (_url: unknown, options?: RequestInit) => {
    const sql = String(options?.body);
    calls.push(sql);
    active++;
    peak = Math.max(active, peak);
    await Promise.resolve();
    active--;
    const section = (Object.entries(queries).find(([, q]) => `${q} FORMAT JSON` === sql)?.[0] ??
      'overview') as MonitorSection;
    return failing === section || failing === 'all'
      ? new Response('do not disclose token or SQL', { status: 403 })
      : Response.json({
          data: [{ ...row(section), index1: 'private-browser-id', token: 'private-test-token' }],
        });
  };
  return {
    calls,
    stored,
    deps: { cache, fetch: fakeFetch as typeof fetch, now: () => clock },
    advance: (ms: number) => {
      clock += ms;
    },
    peak: () => peak,
  };
}

test('监控查询仅接受有限时间与站点，重复及注入参数均拒绝', () => {
  assert.deepEqual(monitorFilter(new URLSearchParams()), { days: 7, site: 'all' });
  for (const query of [
    'days=0',
    'days=8',
    'days=07',
    'site=evil',
    'site=toString',
    'days=7&days=1',
    'site=all&site=main',
    'sql=SELECT',
    "site=main' OR 1=1",
  ])
    assert.equal(monitorFilter(new URLSearchParams(query)), null);
  assert.throws(() => monitorQueries({ days: 8, site: 'all' } as never));
  const queries = monitorQueries({ days: 30, site: 'main' });
  for (const sql of Object.values(queries)) {
    assert.ok(sql.includes("blob3 != 'verification'"));
    assert.ok(sql.includes("blob2 = 'xiuxian.011203.xyz'"));
  }
  assert.match(queries.overview, /count\(DISTINCT index1\)/);
  assert.match(queries.errors, /blob7 AS summary/);
  assert.match(queries.stages, /double8 = -1/);
  assert.match(queries.stages, /double6 >= 0/);
  assert.match(queries.days, /INTERVAL '8' HOUR/);
});

test('聚合行只投影白名单，拒绝损坏/非有限数值，保留空查询', () => {
  assert.deepEqual(monitorRows('errors', []), []);
  assert.equal(
    monitorRows('errors', [{ ...row('errors'), index1: 'private-id' }])[0].index1,
    undefined,
  );
  for (const value of [
    undefined,
    null,
    {},
    [{ ...row('overview'), events: 'NaN' }],
    [{ ...row('overview'), browsers: -1 }],
    [{ ...row('errors'), count: null }],
  ])
    assert.throws(() =>
      monitorRows(Array.isArray(value) && value[0]?.summary ? 'errors' : 'overview', value),
    );
});

test('统计口径按结算计算胜率，加权和除以对应观测数，UTC 时间展示为北京', () => {
  assert.equal(monitorRate({ starts: 2, ends: 4, won: 3 }), '75.0%');
  assert.equal(monitorRate({ ends: 0, won: 0 }), '—');
  assert.equal(monitorAverage(100, 4, ' 秒'), '25 秒');
  assert.equal(monitorAverage(100, 0), '—');
  assert.equal(monitorTime('2026-10-10 12:00:00'), monitorTime('2026-10-10T12:00:00Z'));
  assert.match(monitorTime('2026-10-10 12:00:00'), /20:00:00/);
  const html = monitorTable(['摘要'], [['<script>private()</script>']]);
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
});

test('公开开关、配置、方法、参数及限流失败均在 SQL 之前终止', async () => {
  const h = harness();
  const checks: [Request, MonitorEnv, number][] = [
    [request(), { ...env, MONITOR_PUBLIC: 'false' }, 403],
    [request(), { ...env, ANALYTICS_READ_TOKEN: undefined }, 503],
    [request(), { ...env, ANALYTICS_ACCOUNT_ID: '../x' }, 503],
    [request('?days=6'), env, 400],
    [request('', official, 'POST'), env, 405],
    [request(), { ...env, MONITOR_LIMITER: undefined }, 503],
    [request(), { ...env, MONITOR_LIMITER: { limit: async () => ({ success: false }) } }, 429],
    [
      request(),
      {
        ...env,
        MONITOR_LIMITER: {
          limit: async () => {
            throw Error('secret binding failure');
          },
        },
      },
      503,
    ],
  ];
  for (const [req, e, status] of checks) {
    const response = await monitorResponse(req, e, headers(), h.deps);
    assert.equal(response.status, status);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), official);
    assert.ok(!(await response.text()).includes('secret binding failure'));
  }
  assert.equal(h.calls.length, 0);
});

test('分批查询、投影及缓存正确，跨站命中重设 CORS，缓存过期和关闭生效', async () => {
  const h = harness();
  const a = await monitorResponse(request(), env, headers(), h.deps);
  const raw = await a.text(),
    data = JSON.parse(raw) as MonitorData;
  assert.equal(a.status, 200);
  assert.equal(validMonitorData(data), true);
  assert.ok(
    !raw.includes('private-browser-id') &&
      !raw.includes('private-test-token') &&
      !raw.includes('analytics_engine/sql'),
  );
  assert.equal(h.calls.length, 12);
  assert.ok(h.peak() <= 4);
  const b = await monitorResponse(request('', pages), env, headers(pages), h.deps);
  assert.equal(b.headers.get('Access-Control-Allow-Origin'), pages);
  assert.equal(h.calls.length, 12);
  h.advance(300_001);
  await monitorResponse(request(), env, headers(), h.deps);
  assert.equal(h.calls.length, 24);
  assert.equal(
    (await monitorResponse(request(), { ...env, MONITOR_PUBLIC: 'false' }, headers(), h.deps))
      .status,
    403,
  );
  assert.equal(h.calls.length, 24);
});

test('个别查询失败如实标记并不缓存；全失败返回 502，不冒充零统计', async () => {
  const h = harness('errors'),
    response = await monitorResponse(request(), env, headers(), h.deps);
  const data = (await response.json()) as MonitorData;
  assert.equal(response.status, 200);
  assert.ok(data.sections.errors.error);
  assert.ok(!data.sections.stages.error);
  assert.equal(h.stored.size, 0);
  const all = harness('all'),
    failed = await monitorResponse(request(), env, headers(), all.deps);
  assert.equal(failed.status, 502);
  assert.ok(!(await failed.text()).includes('do not disclose'));
});

test('Worker 监控预检允许两站及本机，保留其他接口原有来源约束', async () => {
  for (const origin of [official, pages, 'http://localhost:5173', '']) {
    const response = await worker.fetch(request('', origin, 'OPTIONS'), {
      ...env,
      ALLOWED_ORIGINS: `${official},${pages}`,
    } as never);
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin || null);
    assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'GET, OPTIONS');
  }
  for (const origin of ['null', 'https://evil.example', `${official}/path`])
    assert.equal(
      (await worker.fetch(request('', origin), { ...env, ALLOWED_ORIGINS: official } as never))
        .status,
      403,
    );
  const response = await worker.fetch(new Request('https://npc.example/health'), {
    ALLOWED_ORIGINS: official,
  } as never);
  assert.equal(response.status, 403);
});

test('CI 摘要要求计数与明细一致，缺样本或 Error 不得冒充已通过', () => {
  const data = {
    schemaVersion: 1,
    commit: 'a'.repeat(40),
    generatedAt: new Date(now).toISOString(),
    passed: true,
    plannedSamples: 10080,
    returnedSamples: 10080,
    elapsedSeconds: 10393,
    simulationErrors: 0,
    counts: { error: 0, warning: 1 },
    items: [{ severity: 'warning', displayMessage: '双灵根 / 白骨髅' }],
  };
  assert.equal(validMonitorCI(data), true);
  assert.equal(validMonitorCI({ ...data, returnedSamples: 10079 }), false);
  assert.equal(validMonitorCI({ ...data, counts: { error: 0, warning: 0 } }), false);
  assert.equal(
    validMonitorCI({
      ...data,
      passed: false,
      simulationErrors: 1,
      counts: { error: 1, warning: 0 },
      items: [{ severity: 'error', displayMessage: '<img>' }],
    }),
    true,
  );
  assert.equal(validMonitorCI({ ...data, generatedAt: 'bad' }), false);
});

test('Worker 正常 GET 使用原生 fetch 的全局接收对象而非依赖对象', async () => {
  const original = globalThis.fetch;
  const cacheDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  const queries = monitorQueries({ days: 7, site: 'all' });
  let calls = 0;
  globalThis.fetch = function (this: unknown, _input: unknown, options?: RequestInit) {
    assert.equal(this, globalThis, 'Cloudflare 原生 fetch 要求全局接收对象');
    calls++;
    const section = Object.entries(queries).find(
      ([, sql]) => `${sql} FORMAT JSON` === options?.body,
    )?.[0] as MonitorSection;
    return Promise.resolve(Response.json({ data: [row(section)] }));
  } as typeof fetch;
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: { default: { match: async () => undefined, put: async () => {} } },
  });
  try {
    const response = await worker.fetch(request(), { ...env, ALLOWED_ORIGINS: official } as never);
    assert.equal(response.status, 200);
    const data = (await response.json()) as MonitorData;
    assert.equal(calls, 12);
    assert.ok(Object.values(data.sections).every((s) => !s.error));
  } finally {
    globalThis.fetch = original;
    if (cacheDescriptor) Object.defineProperty(globalThis, 'caches', cacheDescriptor);
    else Reflect.deleteProperty(globalThis, 'caches');
  }
});
