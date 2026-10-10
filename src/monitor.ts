import Chart from 'chart.js/auto';
import { assetUrl } from './asset-url.ts';
import {
  BALANCE_REPORT_URL,
  MONITOR_DAYS,
  MONITOR_ENDPOINT,
  MONITOR_SITES,
  monitorFilter,
  validMonitorData,
  type MonitorData,
  type MonitorRow,
  type MonitorSection,
} from './monitor-protocol.ts';
import {
  monitorEscape as esc,
  monitorCount as count,
  monitorNumber as num,
  monitorAverage as average,
  monitorRate as rate,
  monitorTime as time,
  monitorRoot,
  monitorPath,
  monitorStage,
  monitorDifficulty,
  monitorSite,
  monitorRealm,
  monitorReason,
  monitorTable as table,
  validMonitorCI,
} from './monitor-view.ts';
import './monitor.css';
import { monitorDeadline } from './monitor-request.ts';
import {
  validPerformanceSnapshot,
  type PerformanceKind,
  type PerformanceSource,
} from './monitor-performance.ts';

const root = document.querySelector<HTMLDivElement>('#monitor')!;
const initial = monitorFilter(new URLSearchParams(location.search)) ?? { days: 7, site: 'all' };
root.innerHTML = `<main>
  <header><div><h1>运行监控</h1><p>叩仙门：青岚纪 · 公开汇总数据</p></div><a class="button" href="${esc(assetUrl('/'))}">返回游戏</a></header>
  <section aria-labelledby="ci-title"><div class="section-heading"><h2 id="ci-title">每日测试与诊断</h2><button id="ci-refresh">刷新测试摘要</button></div><p class="note">独立于下方线上筛选。完整矩阵每天北京时间 12:00 开始，完成后更新；这里读取最近已发布的正式报告。</p><div id="ci-content" aria-live="polite"><p>正在读取 GitHub Pages 报告…</p></div><p><a href="${BALANCE_REPORT_URL}" target="_blank" rel="noopener noreferrer">打开完整报告：筛选路线、法宝、场地与投入，组合汇总及保存图表 ↗</a></p></section>
  <section aria-labelledby="live-title"><h2 id="live-title">线上游玩统计</h2><div class="filters"><label>最近时间<select id="days">${MONITOR_DAYS.map((n) => `<option value="${n}"${n === initial.days ? ' selected' : ''}>最近 ${n} 天</option>`).join('')}</select></label><label>统计站点<select id="site">${Object.entries(
    MONITOR_SITES,
  )
    .map(
      ([id, name]) =>
        `<option value="${id}"${id === initial.site ? ' selected' : ''}>${name}</option>`,
    )
    .join(
      '',
    )}</select></label><button id="live-refresh">刷新线上统计</button><a id="live-api" href="${MONITOR_ENDPOINT}" target="_blank" rel="noopener noreferrer">聚合 JSON 接口 ↗</a></div><p id="live-status" class="note" role="status">正在读取…</p><div id="cards" class="cards"></div><details><summary>统计口径与保存时间</summary><ul><li>数据来自游戏的匿名事件，不含存档或闲聊；开启匿名统计的浏览器才会发送。打开次数指游戏 session，不包含监控页访问。</li><li>匿名浏览器编号不能代表真实人数；换设备、清理缓存或关闭统计会影响记录。跨站概览按编号去重，分站数量不能直接相加。</li><li>事件量按 Analytics Engine 采样权重估算，编号分布仍为实际观测去重，少量数据也会有波动。排除版本 verification 的上线验证记录。</li><li>历练通关率＝通关结算／全部结算，主动结束也在分母中；不是从第一关到第六关的整条路线通过率。开局和结算可能跨时间窗，灵根与路线是事件发生时的状态，不能严格配对。</li><li>普通历练和天劫分开统计。最高境界及最远通关只表示当前窗口内观测到的记录。版本和错误明细分别最多展示 100 组。</li><li>原始数据约保留三个月；统计接口缓存最多五分钟。日趋势按北京时间划分；「最近 N 天」为滚动 N×24 小时，首尾日期可能是不完整的一天。</li></ul></details></section>
  <section aria-labelledby="performance-title"><div class="section-heading"><h2 id="performance-title">性能与每日渲染</h2><button id="performance-refresh">刷新性能摘要</button></div><p class="note">独立于线上筛选。每日无头 Chrome 在第六境后期满配场景采样 60 秒；CI 机器的帧率仅用于观察，不能代表手机真机帧率。模拟成本、构建体积取最近已完成的 master 快检。</p><div id="performance-content" aria-live="polite">正在读取性能摘要…</div></section>
  <section aria-labelledby="errors-title"><h2 id="errors-title">运行错误</h2><p class="note">按站点、版本、摘要合并，最近出现优先；前端会去重限频。这是浏览器上报记录，不代表所有运行故障。摘要可能含浏览器原始错误文本。</p><div id="errors"></div></section>
  <section><h2>访问与开局趋势</h2><div id="trend"></div></section>
  <section><h2>关卡历练</h2><p class="note">不含天劫，按关卡及难度区分。均值仅使用结算记录；通关率包含主动结束。</p><div id="stages"></div></section>
  <section><div class="two-column"><div><h2>灵根</h2><div id="roots"></div></div><div><h2>路线</h2><div id="paths"></div></div></div></section>
  <section><div class="two-column"><div><h2>最远通关记录</h2><div id="best"></div></div><div><h2>最高境界记录</h2><div id="realms"></div></div></div></section>
  <section><h2>天劫历练</h2><p class="note">现有打点记录迎劫与成功渡劫，没有完整的失败或弃劫结算；这里不计算天劫胜率。</p><div id="tribulations"></div></section>
  <section><h2>轮回原因</h2><div id="reasons"></div></section>
  <section><h2>站点分布</h2><div id="sites"></div></section>
  <section><h2>版本分布</h2><div id="versions"></div></section>
  <footer>线上汇总由 Cloudflare Worker 查询 Analytics Engine；测试摘要来自 GitHub Pages。两者分别显示更新时间。仅公开汇总，不输出匿名编号或查询凭证。</footer>
</main>`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const charts: Chart[] = [];
let liveController: AbortController | undefined;
let ciController: AbortController | undefined;
let performanceController: AbortController | undefined;
const sections: [MonitorSection, string][] = [
  ['days', 'trend'],
  ['stages', 'stages'],
  ['roots', 'roots'],
  ['paths', 'paths'],
  ['best', 'best'],
  ['realms', 'realms'],
  ['tribulations', 'tribulations'],
  ['reasons', 'reasons'],
  ['sites', 'sites'],
  ['versions', 'versions'],
  ['errors', 'errors'],
];

function chart(
  id: string,
  labels: string[],
  datasets: { label: string; data: number[]; backgroundColor: string }[],
  type: 'line' | 'bar' = 'bar',
) {
  const host = document.createElement('div');
  host.className = 'chart';
  const canvas = document.createElement('canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `${labels.join('、')}统计图，数值见相邻表格`);
  host.append(canvas);
  $(id).append(host);
  charts.push(
    new Chart(canvas, {
      type,
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: { y: { beginAtZero: true } },
        plugins: { legend: { position: 'bottom' } },
      },
    }),
  );
}
const outcomes = (rows: MonitorRow[], name: (row: MonitorRow) => string) =>
  table(
    ['分类', '开局', '通关', '落败', '主动结束', '结算通关率', '平均时长'],
    rows.map((r) => [
      name(r),
      count(r.starts),
      count(r.won),
      count(r.lost),
      count(r.abandoned),
      rate(r),
      average(r.seconds, r.ends, ' 秒'),
    ]),
  );

function renderErrors(rows: MonitorRow[]) {
  if (!rows.length) {
    $('errors').innerHTML = '<p class="note">当前范围没有收到运行错误记录。</p>';
    return;
  }
  $('errors').innerHTML =
    `<p><span class="badge error">${rows.length} 组错误摘要</span></p><label>搜索版本或错误摘要<input id="error-search" class="error-search" type="search" placeholder="输入关键词" /></label><div id="error-list"></div>`;
  const display = () => {
    const query = $<HTMLInputElement>('error-search').value.trim().toLocaleLowerCase();
    const filtered = rows.filter((r) =>
      `${r.version} ${r.summary} ${monitorSite(r.site)}`.toLocaleLowerCase().includes(query),
    );
    $('error-list').innerHTML = filtered.length
      ? filtered
          .map(
            (r) =>
              `<article class="error-row"><small>${esc(monitorSite(r.site))} · ${esc(r.version)} · ${count(r.count)} 次 · 最后 ${esc(time(r.last))}</small><p>${esc(r.summary || '旧版未记录错误摘要')}</p></article>`,
          )
          .join('')
      : '<p class="note">没有匹配的错误摘要。</p>';
  };
  $('error-search').addEventListener('input', display);
  display();
}

function render(data: MonitorData) {
  const overview = data.sections.overview;
  const total = overview.rows[0] ?? {};
  $('cards').innerHTML = overview.error
    ? `<p class="status error">${esc(overview.error)}</p>`
    : [
        ['打开次数', 'sessions'],
        ['匿名浏览器编号', 'browsers'],
        ['新存档打开', 'fresh'],
        ['历练开局（含天劫）', 'starts'],
        ['进入人间', 'towns'],
        ['叩门终章', 'epilogues'],
        ['运行错误记录', 'errors'],
        ['全部事件', 'events'],
      ]
        .map(
          ([label, key]) =>
            `<div class="card"><span>${label}</span><strong>${count(total[key])}</strong></div>`,
        )
        .join('');
  for (const [key, id] of sections) {
    const section = data.sections[key],
      rows = section.rows;
    if (section.error) {
      $(id).innerHTML = `<p class="status error">${esc(section.error)}</p>`;
      continue;
    }
    switch (key) {
      case 'days':
        $(id).innerHTML = table(
          ['日期（北京）', '打开', '开局（含天劫）', '普通历练通关', '错误'],
          rows.map((r) => [
            r.day,
            count(r.sessions),
            count(r.starts),
            count(r.won),
            count(r.errors),
          ]),
        );
        if (rows.length)
          chart(
            id,
            rows.map((r) => String(r.day)),
            [
              {
                label: '打开次数',
                data: rows.map((r) => num(r.sessions)),
                backgroundColor: '#31836a',
              },
              {
                label: '开局次数',
                data: rows.map((r) => num(r.starts)),
                backgroundColor: '#648ccc',
              },
            ],
            'line',
          );
        break;
      case 'stages':
        $(id).innerHTML = table(
          [
            '秘境 / 难度',
            '开局',
            '通关',
            '落败',
            '主动结束',
            '结算通关率',
            '平均时长',
            '平均等级',
            '平均斩妖',
          ],
          rows.map((r) => [
            `${monitorStage(r.stage)} / ${monitorDifficulty(r.difficulty)}`,
            count(r.starts),
            count(r.won),
            count(r.lost),
            count(r.abandoned),
            rate(r),
            average(r.seconds, r.ends, ' 秒'),
            average(r.levels, r.levelCount),
            average(r.kills, r.killCount),
          ]),
        );
        if (rows.length)
          chart(
            id,
            rows.map((r) => `${monitorStage(r.stage)} · ${monitorDifficulty(r.difficulty)}`),
            [
              { label: '通关', data: rows.map((r) => num(r.won)), backgroundColor: '#31836a' },
              { label: '落败', data: rows.map((r) => num(r.lost)), backgroundColor: '#c45d58' },
              {
                label: '主动结束',
                data: rows.map((r) => num(r.abandoned)),
                backgroundColor: '#b89644',
              },
            ],
          );
        break;
      case 'roots':
        $(id).innerHTML = outcomes(rows, (r) => monitorRoot(r.root));
        break;
      case 'paths':
        $(id).innerHTML = outcomes(rows, (r) => monitorPath(r.path));
        break;
      case 'best': {
        const unobserved = Math.max(
          0,
          num(total.browsers) - rows.reduce((sum, r) => sum + num(r.browsers), 0),
        );
        $(id).innerHTML = table(
          ['最远已通关', '观测编号数'],
          [
            ...(overview.error ? [] : [['窗口内没有通关记录', count(unobserved)]]),
            ...rows.map((r) => [monitorStage(r.best), count(r.browsers)]),
          ],
        );
        break;
      }
      case 'realms':
        $(id).innerHTML = table(
          ['最高已记录境界', '观测编号数'],
          rows.map((r) => [monitorRealm(r.realm), count(r.browsers)]),
        );
        break;
      case 'tribulations':
        $(id).innerHTML = table(
          ['天劫', '迎劫记录', '完成记录', '已记录完成平均时长'],
          rows.map((r) => [
            `第 ${num(r.tribulation)} 次天劫`,
            count(r.starts),
            count(r.won),
            average(r.seconds, r.ends, ' 秒'),
          ]),
        );
        break;
      case 'reasons':
        $(id).innerHTML =
          table(
            ['轮回原因', '次数', '平均境界阶', '平均年岁'],
            rows.map((r) => [
              monitorReason(r.reason),
              count(r.count),
              count(r.realm),
              count(r.age),
            ]),
          ) +
          '<p class="note">境界阶 0＝炼气初期，每 3 阶一个大境界，24＝真仙；均值不对应单个玩家。</p>';
        break;
      case 'sites':
        $(id).innerHTML = table(
          ['站点', '观测编号数', '打开', '新存档打开', '开局', '人间', '叩门', '错误'],
          rows.map((r) => [
            monitorSite(r.site),
            ...['browsers', 'sessions', 'fresh', 'starts', 'towns', 'epilogues', 'errors'].map(
              (k) => count(r[k]),
            ),
          ]),
        );
        break;
      case 'versions':
        $(id).innerHTML = table(
          ['版本', '打开', '开局', '错误'],
          rows.map((r) => [r.version, count(r.sessions), count(r.starts), count(r.errors)]),
        );
        break;
      case 'errors':
        renderErrors(rows);
        break;
    }
  }
}

async function loadLive() {
  liveController?.abort();
  const controller = new AbortController();
  const deadline = monitorDeadline(controller, 30_000);
  liveController = controller;
  const params = new URLSearchParams({
    days: $<HTMLSelectElement>('days').value,
    site: $<HTMLSelectElement>('site').value,
  });
  const url = `${MONITOR_ENDPOINT}?${params}`;
  $('live-api').setAttribute('href', url);
  history.replaceState(null, '', `?${params}`);
  $<HTMLButtonElement>('live-refresh').disabled = true;
  charts.splice(0).forEach((c) => c.destroy());
  $('cards').innerHTML = '';
  for (const [, id] of sections) $(id).innerHTML = '<p class="note">正在读取…</p>';
  $('live-status').textContent = '正在读取 Cloudflare 线上统计…';
  $('live-status').className = 'note';
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store',
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
      throw new Error(
        typeof body?.message === 'string'
          ? body.message
          : `线上统计读取失败（HTTP ${response.status}）。`,
      );
    }
    const data: unknown = await response.json();
    if (
      !validMonitorData(data) ||
      data.filter.days !== Number(params.get('days')) ||
      data.filter.site !== params.get('site')
    )
      throw new Error('统计接口格式或筛选条件不一致，请刷新重试。');
    if (controller.signal.aborted) return;
    render(data);
    const failed = Object.values(data.sections).filter((s) => s.error).length;
    $('live-status').textContent =
      `${MONITOR_SITES[data.filter.site]} · 最近 ${data.filter.days} 天 · 查询时间（北京）${time(data.generatedAt)} · 缓存最多 5 分钟${failed ? ` · ${failed} 项读取失败，可重试` : ''}`;
    if (failed) $('live-status').className = 'status warning';
  } catch (error) {
    if (liveController !== controller || (controller.signal.aborted && !deadline.expired())) return;
    $('live-status').textContent =
      `${deadline.expired() ? '统计请求超时。' : error instanceof Error ? error.message : '读取失败。'} 可点击「刷新线上统计」重试。`;
    $('live-status').className = 'status error';
    for (const [, id] of sections) $(id).innerHTML = '<p class="note">未取得统计数据。</p>';
  } finally {
    deadline.clear();
    if (liveController === controller) $<HTMLButtonElement>('live-refresh').disabled = false;
  }
}

async function loadCI() {
  ciController?.abort();
  const controller = new AbortController();
  const deadline = monitorDeadline(controller, 20_000);
  ciController = controller;
  $<HTMLButtonElement>('ci-refresh').disabled = true;
  $('ci-content').innerHTML = '<p class="note">正在读取 GitHub Pages 报告…</p>';
  try {
    const response = await fetch(`${BALANCE_REPORT_URL}diagnostics.json`, {
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data: unknown = await response.json();
    if (!validMonitorCI(data)) throw new Error('报告格式不一致');
    if (controller.signal.aborted) return;
    const stale = data.generatedAt && Date.now() - Date.parse(data.generatedAt) > 36 * 3600_000;
    $('ci-content').innerHTML =
      `<p><span class="badge ${data.passed ? 'good' : 'error'}">${data.passed ? '硬门槛通过' : '测试未通过'}</span><span class="badge ${data.counts.error ? 'error' : 'good'}">Error ${data.counts.error}</span><span class="badge ${data.counts.warning ? 'warning' : 'good'}">Warning ${data.counts.warning}</span></p><p>已返回 ${count(data.returnedSamples)} / ${count(data.plannedSamples)} 个计划样本 · 执行异常 ${count(data.simulationErrors)} · 耗时 ${data.elapsedSeconds === null ? '未记录' : `${count(data.elapsedSeconds / 60)} 分钟`}</p><p class="note">源提交 ${esc(data.commit?.slice(0, 12) ?? '未记录')} · 生成时间（北京）${esc(time(data.generatedAt))}</p>${stale ? '<p class="status warning">这份报告已超过 36 小时，请查看完整报告或 Actions 是否仍在运行。</p>' : ''}<details id="ci-diagnostics"><summary>诊断明细（${data.items.length} 项），点击展开</summary>${data.items.length ? data.items.map((i) => `<div class="diagnostic ${i.severity}"><strong>${i.severity === 'error' ? 'Error' : 'Warning'}</strong> ${esc(i.displayMessage)}</div>`).join('') : '<p>没有诊断项。</p>'}</details><p class="note">Warning 是待观察的差异，不等于测试失败；线上游玩数据与模拟矩阵不能直接混为同一通过率。</p><p><a href="${BALANCE_REPORT_URL}diagnostics.json" target="_blank" rel="noopener noreferrer">诊断 JSON 接口 ↗</a> · <a href="https://github.com/chenxuan520/qinglan-xiuxian/actions/workflows/balance.yml" target="_blank" rel="noopener noreferrer">查看每日任务 ↗</a></p>`;
  } catch (error) {
    if (ciController === controller && (!controller.signal.aborted || deadline.expired()))
      $('ci-content').innerHTML =
        `<p class="status error">测试摘要读取失败（${esc(deadline.expired() ? '请求超时' : error instanceof Error ? error.message : '网络错误')}），可点击「刷新测试摘要」重试；下方线上统计仍可使用。</p>`;
  } finally {
    deadline.clear();
    if (ciController === controller) $<HTMLButtonElement>('ci-refresh').disabled = false;
  }
}

function performanceHTML(kind: PerformanceKind, source: PerformanceSource) {
  const title = { render: '每日渲染采样', simulation: '战斗模拟成本', size: '游戏入口体积' }[kind];
  const status =
    source.state === 'ready'
      ? kind === 'render'
        ? '采样完成'
        : '门禁通过'
      : source.state === 'failed'
        ? '未通过 / 未完成'
        : '暂无可用结果';
  const link = source.runId
    ? `<a href="https://github.com/chenxuan520/qinglan-xiuxian/actions/runs/${source.runId}" target="_blank" rel="noopener noreferrer">查看来源任务 ↗</a>`
    : '';
  let body = `<p class="note">${source.state === 'failed' ? '本次执行未通过或采样失败，请查看来源任务。' : '尚无可发布的正式数据；任务完成并发布后自动更新。'}</p>`;
  if (source.data) {
    if (kind === 'render') {
      const s = source.data.summary as Record<string, number | null>;
      body = table(
        ['指标', '实测'],
        [
          ['平均帧率', `${count(s.meanFps)} fps`],
          ['5% 低分位帧率', `${count(s.p5Fps)} fps`],
          ['最长帧间隔', `${count(s.maxGapMs)} ms`],
          ['长任务数', count(s.longTasks)],
          ['最长任务', s.longestTaskMs === null ? '—' : `${count(s.longestTaskMs)} ms`],
          ['采样帧数', count(s.samples)],
        ],
      );
      if (source.frame)
        body += `<details><summary>采样结束截图</summary><img class="render-frame" src="https://chenxuan520.github.io/qinglan-xiuxian/monitor/render-frame.png?run=${source.runId}&at=${encodeURIComponent(source.generatedAt ?? '')}" alt="每日无头 Chrome 采样结束时的游戏画面" loading="lazy" /></details>`;
    } else if (kind === 'simulation') {
      const rows = source.data.scenarios as Record<string, string | number>[];
      body = table(
        ['场景', '模拟时长', '均值 ms/帧', 'P95 ms/帧', '最差 ms', '敌人峰值', '弹丸峰值'],
        rows.map((r) => [
          r.label,
          `${count(r.simSeconds)} 秒`,
          num(r.meanMs).toFixed(3),
          num(r.p95Ms).toFixed(3),
          count(r.maxMs),
          count(r.enemyPeak),
          count(r.shotPeak),
        ]),
      );
    } else {
      const measure = source.data.measure as Record<string, number>,
        budget = source.data.budget as Record<string, number>;
      body = table(
        ['指标', '实测字节', '预算字节'],
        [
          ['jsBytes', 'JS'],
          ['jsGzip', 'JS gzip'],
          ['cssBytes', 'CSS'],
          ['cssGzip', 'CSS gzip'],
        ].map(([key, label]) => [label, count(measure[key]), count(budget[key])]),
      );
    }
    const breaches = source.data.breaches as string[] | undefined;
    if (breaches?.length)
      body += `<details><summary>未达标明细（${breaches.length}）</summary>${breaches.map((s) => `<p class="status error">${esc(s)}</p>`).join('')}</details>`;
  }
  const stale = source.generatedAt && Date.now() - Date.parse(source.generatedAt) > 36 * 3600_000;
  return `<div class="performance-item"><h3>${title}</h3><p><span class="badge ${source.state === 'ready' ? 'good' : source.state === 'failed' ? 'error' : 'warning'}">${status}</span>${link}</p><p class="note">采样时间（北京）${esc(time(source.generatedAt))} · 源提交 ${esc(source.commit?.slice(0, 12) ?? '未记录')}${stale ? ' · 结果已超过 36 小时' : ''}</p>${body}</div>`;
}
async function loadPerformance() {
  performanceController?.abort();
  const controller = new AbortController();
  const deadline = monitorDeadline(controller, 20_000);
  performanceController = controller;
  $<HTMLButtonElement>('performance-refresh').disabled = true;
  $('performance-content').innerHTML = '<p class="note">正在读取性能摘要…</p>';
  try {
    const response = await fetch(
      'https://chenxuan520.github.io/qinglan-xiuxian/monitor/performance.json',
      {
        signal: controller.signal,
        credentials: 'omit',
        cache: 'no-store',
      },
    );
    if (!response.ok)
      throw new Error(response.status === 404 ? '尚未发布首份性能摘要' : `HTTP ${response.status}`);
    const data: unknown = await response.json();
    if (!validPerformanceSnapshot(data)) throw new Error('性能摘要格式不一致');
    if (controller.signal.aborted) return;
    $('performance-content').innerHTML =
      `<p class="note">摘要发布时间（北京）${esc(time(data.publishedAt))}；各项可能来自不同任务，以各项源提交和采样时间为准。</p>${(['render', 'simulation', 'size'] as const).map((kind) => performanceHTML(kind, data.sources[kind])).join('')}<p><a href="https://chenxuan520.github.io/qinglan-xiuxian/monitor/performance.json" target="_blank" rel="noopener noreferrer">性能 JSON 接口 ↗</a></p>`;
  } catch (error) {
    if (performanceController === controller && (!controller.signal.aborted || deadline.expired()))
      $('performance-content').innerHTML =
        `<p class="status warning">性能摘要读取失败（${esc(deadline.expired() ? '请求超时' : error instanceof Error ? error.message : '网络错误')}），可刷新重试。其他统计仍可使用。</p>`;
  } finally {
    deadline.clear();
    if (performanceController === controller)
      $<HTMLButtonElement>('performance-refresh').disabled = false;
  }
}
$('live-refresh').addEventListener('click', () => void loadLive());
$('ci-refresh').addEventListener('click', () => void loadCI());
$('performance-refresh').addEventListener('click', () => void loadPerformance());
$('days').addEventListener('change', () => void loadLive());
$('site').addEventListener('change', () => void loadLive());
// 页面不导入游戏入口，不创建匿名编号或发送游玩事件。
void loadLive();
void loadCI();
void loadPerformance();
window.addEventListener('pagehide', () => {
  liveController?.abort();
  ciController?.abort();
  performanceController?.abort();
});
window.addEventListener('pageshow', (e) => {
  if (e.persisted) {
    void loadLive();
    void loadCI();
    void loadPerformance();
  }
});
