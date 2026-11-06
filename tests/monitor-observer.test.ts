import assert from 'node:assert/strict';
import test from 'node:test';
import { observerMonitorHTML, requestObserverReport } from '../src/monitor-observer.ts';
import { OBSERVER_REPORT_URL, type ObserverReport } from '../src/observer-report.ts';

const checkedAt = '2026-11-06T03:00:00.000Z';
const now = Date.parse(checkedAt);
function report(): ObserverReport {
  return {
    schemaVersion: 1,
    checkedAt,
    commit: 'a'.repeat(40),
    runId: 12345,
    state: 'healthy',
    summary: '本次读取完成，未发现异常。',
    counts: { sources: 1, new: 0, current: 0, recovered: 0, unresolved: 0, pending: 0 },
    analysis: {
      engine: 'pi',
      model: 'gpt-6-luna',
      status: 'skipped',
      verificationOnly: false,
      summary: '没有新增待分析信号。',
    },
    sources: [{ id: 'players', title: '玩家聚合统计', status: 'ready', generatedAt: checkedAt }],
    items: [],
  };
}

test('巡检结论清晰区分规则无异常、模型跳过和来源任务链接', () => {
  const html = observerMonitorHTML(report(), now);
  assert.match(html, /未发现异常/);
  assert.match(html, /本次未调用 AI/);
  assert.doesNotMatch(html, /AI 分类完成/);
  assert.match(html, /2026\/11\/6 11:00:00/);
  assert.match(html, /actions\/runs\/12345/);
  assert.match(html, /workflows\/observer.yml/);
  assert.match(html, /没有新增待分析信号/);
});

test('巡检模型失败保留独立错误，不把零新增提醒画成正常', () => {
  const data = report();
  data.state = 'incomplete';
  data.analysis.status = 'failed';
  data.analysis.error = 'AI 服务认证失败（401/403）';
  data.analysis.diagnostics = { stage: 'response', elapsedMs: 500, httpStatus: 401 };
  const html = observerMonitorHTML(data, now);
  assert.match(html, /badge error">巡检未完成/);
  assert.match(html, /AI 分析失败/);
  assert.match(html, /HTTP 401/);
  assert.match(html, /AI 服务认证失败/);
});

test('手动合成连通测试不能显示为真实异常分类', () => {
  const data = report();
  data.analysis.status = 'complete';
  data.analysis.verificationOnly = true;
  data.analysis.diagnostics = { stage: 'complete', elapsedMs: 1243, httpStatus: 200 };
  const html = observerMonitorHTML(data, now);
  assert.match(html, /连通校验完成（合成证据）/);
  assert.match(html, /校验结果不作为线上异常/);
  assert.doesNotMatch(html, /AI 分类完成/);
});

test('保留未恢复问题、本次恢复与普通候选的不同状态', () => {
  const data = report();
  data.state = 'attention';
  data.counts = { sources: 1, new: 1, current: 2, recovered: 1, unresolved: 2, pending: 0 };
  data.items = (['new', 'existing', 'candidate', 'recovered'] as const).map((status) => ({
    sourceId: 'players',
    title: `样本${status}`,
    detail: '须核对统计口径与来源。',
    status,
    severity: 'warning',
    assessment: 'AI 分类：需要核实',
    nextSteps: ['核对来源数据'],
  }));
  const html = observerMonitorHTML(data, now);
  for (const label of ['新增提醒', '尚未恢复', '待确认', '已恢复'])
    assert.ok(html.includes(`${label} · 样本`));
  assert.match(html, /diagnostic good"><strong>已恢复/);
  assert.match(html, /核对来源数据/);
});

test('旧结论以待更新提示显示，后台运行不会被标成失败', () => {
  const data = report();
  const old = observerMonitorHTML(data, now + 37 * 3600_000);
  assert.match(old, /巡检结果待更新/);
  assert.match(old, /下方为历史结论/);
  assert.doesNotMatch(old, /badge good">未发现异常/);
  data.state = 'pending';
  data.counts.pending = 1;
  data.sources[0].status = 'pending';
  const pending = observerMonitorHTML(data, now);
  assert.match(pending, /后台任务运行中/);
  assert.doesNotMatch(pending, /badge error/);
});

test('巡检及来源所有文本按纯文本转义，不执行模型文本或外部摘要', () => {
  const data = report();
  const injection = '<img src=x onerror="alert(1)">';
  data.summary = injection;
  data.analysis.summary = injection;
  data.analysis.error = injection;
  data.sources[0].title = injection;
  data.sources[0].version = injection;
  data.sources[0].url = 'https://example.test/?a=1&b=2';
  data.items = [
    {
      sourceId: 'players',
      title: injection,
      detail: injection,
      severity: 'critical',
      status: 'new',
      assessment: injection,
      nextSteps: [injection],
    },
  ];
  const html = observerMonitorHTML(data, now);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
  assert.match(html, /https:\/\/example.test\/\?a=1&amp;b=2/);
});

test('巡检请求不带凭据、不缓存，并拒绝无效报告', async () => {
  const signal = new AbortController().signal;
  let options: RequestInit | undefined;
  const request: typeof fetch = async (url, init) => {
    assert.equal(url, OBSERVER_REPORT_URL);
    options = init;
    return Response.json(report());
  };
  assert.deepEqual(await requestObserverReport(signal, request), report());
  assert.equal(options?.credentials, 'omit');
  assert.equal(options?.cache, 'no-store');
  assert.equal(options?.signal, signal);
  await assert.rejects(
    requestObserverReport(signal, async () => Response.json({ schemaVersion: 1 })),
    /格式或完整性不一致/,
  );
});

test('404、服务故障、坏JSON与请求取消均不返回假成功', async () => {
  const signal = new AbortController().signal;
  for (const [status, message] of [
    [404, /尚未发布首份巡检结论/],
    [503, /HTTP 503/],
  ] as const)
    await assert.rejects(
      requestObserverReport(signal, async () => new Response('not a report', { status })),
      message,
    );
  await assert.rejects(
    requestObserverReport(signal, async () => new Response('<html>offline</html>')),
    SyntaxError,
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    requestObserverReport(controller.signal, async (_, init) => {
      init?.signal?.throwIfAborted();
      return Response.json(report());
    }),
    { name: 'AbortError' },
  );
});
