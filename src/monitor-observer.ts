import {
  OBSERVER_REPORT_URL,
  validObserverReport,
  type ObserverReport,
} from './observer-report.ts';
import { monitorDeadline } from './monitor-request.ts';
import {
  monitorEscape as esc,
  monitorCount as count,
  monitorTime as time,
} from './monitor-view.ts';

const actions = 'https://github.com/chenxuan520/qinglan-xiuxian/actions/';
const sourceStatus = {
  ready: '已读取',
  pending: '运行中',
  failed: '未通过',
  unavailable: '未取得数据',
  invalid: '数据格式异常',
};
const itemStatus = {
  new: '新增提醒',
  existing: '尚未恢复',
  candidate: '待确认',
  recovered: '已恢复',
};

export function observerMonitorHTML(data: ObserverReport, now = Date.now()) {
  const stale = now - Date.parse(data.checkedAt) > 36 * 3600_000;
  const [state, color] = stale
    ? ['巡检结果待更新', 'warning']
    : {
        healthy: ['未发现异常', 'good'],
        attention: ['有待关注的问题', 'warning'],
        incomplete: ['巡检未完成', 'error'],
        pending: ['后台任务运行中', 'warning'],
      }[data.state];
  const analysis = data.analysis;
  const aiState =
    analysis.status === 'complete'
      ? analysis.verificationOnly
        ? '连通校验完成（合成证据）'
        : 'AI 分类完成'
      : {
          skipped: '本次未调用 AI',
          failed: 'AI 分析失败',
          unavailable: 'AI 分析不可用',
        }[analysis.status];
  const aiColor = ['failed', 'unavailable'].includes(analysis.status) ? 'error' : '';
  const diagnostic = analysis.diagnostics;
  return `<p><span class="badge ${color}">${state}</span><span class="badge ${aiColor}">${aiState}</span></p>
    <p class="note">检查时间（北京）${esc(time(data.checkedAt))} · 检查来源 ${count(data.counts.sources)} 项 · 源提交 ${esc(data.commit.slice(0, 12))}</p>
    ${stale ? '<p class="status warning">最近一次巡检已超过 36 小时。下方为历史结论，请查看巡检任务是否完成，或刷新重试。</p>' : ''}
    <p class="status ${color}">${stale ? '上次结论：' : ''}${esc(data.summary)}</p>
    <div class="cards">${(
      [
        ['新增提醒', data.counts.new],
        ['当前候选', data.counts.current],
        ['未恢复提醒', data.counts.unresolved],
        ['本次恢复', data.counts.recovered],
      ] as const
    )
      .map(
        ([label, value]) =>
          `<div class="card"><span>${label}</span><strong>${count(value)}</strong></div>`,
      )
      .join('')}</div>
    ${data.items
      .map(
        (item) =>
          `<article class="diagnostic ${item.status === 'recovered' ? 'good' : item.severity === 'critical' ? 'error' : 'warning'}"><strong>${itemStatus[item.status]} · ${esc(item.title)}</strong><p>${esc(item.detail)}</p>${item.assessment ? `<p>${esc(item.assessment)}</p>` : ''}${item.nextSteps?.length ? `<ul>${item.nextSteps.map((step) => `<li>${esc(step)}</li>`).join('')}</ul>` : ''}</article>`,
      )
      .join('')}
    <details><summary>检查来源与 AI 状态</summary>
      <p>${esc(analysis.summary)}</p>
      ${analysis.error ? `<p class="status error">${esc(analysis.error)}</p>` : ''}
      ${analysis.verificationOnly ? '<p class="note">本次模型使用固定合成证据验证连通性，校验结果不作为线上异常。</p>' : ''}
      <p class="note">分析引擎 ${esc(analysis.engine)} · 模型 ${esc(analysis.model)}${diagnostic ? ` · 阶段 ${esc(diagnostic.stage)} · 耗时 ${count(diagnostic.elapsedMs)} ms${diagnostic.httpStatus === undefined ? '' : ` · HTTP ${diagnostic.httpStatus}`}` : ''}</p>
      ${data.sources
        .map(
          (source) =>
            `<div class="performance-item"><h3>${esc(source.title)}</h3><p><span class="badge ${source.status === 'ready' ? 'good' : source.status === 'pending' ? 'warning' : 'error'}">${sourceStatus[source.status]}</span>${source.url ? `<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">查看来源 ↗</a>` : ''}</p><p class="note">数据生成时间（北京）${esc(time(source.generatedAt))}${source.version ? ` · 来源版本 ${esc(source.version)}` : ''}</p></div>`,
        )
        .join('')}
    </details>
    <p class="note">普通异常需达到确认条件后提醒，重复问题保留记录；未发现异常不代表所有指标都已有足够样本。</p>
    <p class="observer-links"><a href="${actions}runs/${data.runId}" target="_blank" rel="noopener noreferrer">本次巡检详情 ↗</a><a href="${actions}workflows/observer.yml" target="_blank" rel="noopener noreferrer">历史巡检 ↗</a><a href="${OBSERVER_REPORT_URL}" target="_blank" rel="noopener noreferrer">结论 JSON ↗</a></p>`;
}

export async function requestObserverReport(signal: AbortSignal, request: typeof fetch = fetch) {
  const response = await request(OBSERVER_REPORT_URL, {
    signal,
    credentials: 'omit',
    cache: 'no-store',
  });
  if (!response.ok)
    throw new Error(response.status === 404 ? '尚未发布首份巡检结论' : `HTTP ${response.status}`);
  const data: unknown = await response.json();
  if (!validObserverReport(data)) throw new Error('巡检结论格式或完整性不一致');
  return data;
}

export function mountObserverMonitor(root: HTMLElement) {
  const section = document.createElement('section');
  section.setAttribute('aria-labelledby', 'observer-title');
  section.innerHTML =
    '<div class="section-heading"><h2 id="observer-title">每日巡检结论</h2><button id="observer-refresh">刷新巡检结论</button></div><p class="note">每天北京时间 12:00 检查已发布报告、玩家聚合统计与后台任务，完成后更新；独立于下方线上筛选。</p><div id="observer-content" aria-live="polite">正在读取巡检结论…</div>';
  root.querySelector('main > section')?.before(section);
  const host = section.querySelector<HTMLElement>('#observer-content')!;
  const button = section.querySelector<HTMLButtonElement>('button')!;
  let active: AbortController | undefined;
  async function load() {
    active?.abort();
    const controller = new AbortController();
    const deadline = monitorDeadline(controller, 20_000);
    active = controller;
    button.disabled = true;
    host.textContent = '正在读取巡检结论…';
    try {
      const data = await requestObserverReport(controller.signal);
      if (!controller.signal.aborted && active === controller)
        host.innerHTML = observerMonitorHTML(data);
    } catch (error) {
      if (active === controller && (!controller.signal.aborted || deadline.expired()))
        host.innerHTML = `<p class="status error">巡检结论读取失败（${esc(deadline.expired() ? '请求超时' : error instanceof Error ? error.message : '网络错误')}），可刷新重试。其他监控仍可使用。</p>`;
    } finally {
      deadline.clear();
      if (active === controller) button.disabled = false;
    }
  }
  button.addEventListener('click', () => void load());
  window.addEventListener('pagehide', () => active?.abort());
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) void load();
  });
  void load();
}
