import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPIRIT_ROOTS, CULTIVATION_PATHS, DIFFICULTIES, STAGES, treasure } from '../src/data.ts';
import { BARE_CLEAR_TARGETS, balanceCases, caseKey } from './balance-policy.ts';
import type { BalanceCase } from './balance-policy.ts';
import { distribution, quantile, summarize, verifyCoverage } from './balance-metrics.ts';
import type { CampaignSample } from './balance-simulation.ts';

import { reportTables, reportChartData } from './balance-report-view.ts';
import type { ReportLabels } from './balance-report-view.ts';
import { installReportFilters } from './balance-report-client.ts';
import { reportDiagnostics } from './balance-report-diagnostics.ts';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const escape = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const rootName = (id: string) =>
  (
    ({ dual: '双灵根', triple: '三灵根', quad: '四灵根', five: '五灵根' }) as Record<string, string>
  )[id] ??
  SPIRIT_ROOTS.find((r) => r.id === id)?.name ??
  id;
const profiles: Record<string, string> = {
  bare: '无辅助',
  earned: '收益养成',
  'ads-only': '仅广告',
  maxed: '广告与根基满级',
};
const seconds = (n: number | null | undefined) => (n == null ? '—' : `${n.toFixed(1)}秒`);
export interface DailyReport {
  commit?: string;
  currentHash?: string;
  generatedAt?: string;
  elapsedSeconds?: number;
  cases?: number;
  passed?: boolean;
  error?: string;
  current?: CampaignSample[];
  simulationErrors?: { key: string; error: string }[];
  failures?: string[];
  regressionFailures?: string[];
  readinessFailures?: string[];
  targetFailures?: string[];
  groupFailures?: string[];
  bossFailures?: string[];
  reference?: string;
  full?: boolean;
}
function passedFullReport(report: DailyReport, planned: BalanceCase[]) {
  if (
    report.passed !== true ||
    report.error ||
    report.failures?.length ||
    report.readinessFailures?.length ||
    report.targetFailures?.length ||
    report.simulationErrors?.length
  )
    return false;
  try {
    verifyCoverage(report.current ?? [], planned);
    return true;
  } catch {
    return false;
  }
}
function failedReport(error: string): DailyReport {
  return {
    commit: process.env.GITHUB_SHA,
    generatedAt: new Date().toISOString(),
    passed: false,
    error,
  };
}
function loadReport(input: string): DailyReport {
  if (!existsSync(input))
    return failedReport(
      '完整模拟未生成结果；请查看 GitHub Actions 原始错误，当前报告不能判定通过。',
    );
  try {
    const report = JSON.parse(readFileSync(input, 'utf8'));
    if (!report || typeof report !== 'object' || Array.isArray(report)) throw new Error();
    return report;
  } catch {
    return failedReport('测试报告无法读取或解析；请查看 GitHub Actions 原始错误和保留的报告文件。');
  }
}
function reportLabels(plan: BalanceCase[]): ReportLabels {
  return {
    roots: Object.fromEntries(SPIRIT_ROOTS.map((r) => [r.id, rootName(r.id)])),
    paths: Object.fromEntries(CULTIVATION_PATHS.map((p) => [p.id, p.name])),
    treasures: Object.fromEntries(
      [...new Set(plan.map((c) => c.starter))].map((id) => [id, treasure(id).name]),
    ),
    profiles,
    difficulties: DIFFICULTIES.map((d) => d.name),
    stages: STAGES.map((s) => s.name),
    bosses: STAGES.map((s) => s.boss),
    targets: BARE_CLEAR_TARGETS,
  };
}
export function reportHtml(report: DailyReport) {
  const rows = report.current ?? [],
    plan = balanceCases(true),
    labels = reportLabels(plan);
  const passed = passedFullReport(report, plan),
    diagnostics = reportDiagnostics(report, plan, labels, passed);
  const tables = reportTables(rows, plan, labels);
  const select = (id: string, label: string, items: [string, string][]) =>
    `<label>${label}<select id="${id}"><option value="">全部</option>${items.map(([v, l]) => `<option value="${escape(v)}">${escape(l)}</option>`).join('')}</select></label>`;
  const table = (id: string, headers: string[], content: string) =>
    `<div class="table" tabindex="0" aria-label="${id === 'roots' ? '通过率' : id === 'stages' ? '逐关与妖王' : '分组'}表格，可左右滚动"><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody id="${id}-body">${content}</tbody></table></div>`;
  const embedded = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');
  const diagnosticRows = diagnostics.items
    .map(
      (item) =>
        `<li class="diagnostic ${item.severity}"><strong>${item.severity === 'error' ? 'Error' : 'Warning'}</strong> ${escape(item.displayMessage)}</li>`,
    )
    .join('');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="../favicon.svg" type="image/svg+xml"><title>青岚纪 · 每日平衡测试</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f3f5f6;color:#22312d;font:16px/1.7 system-ui,sans-serif}main{max-width:1500px;margin:auto;padding:24px}h1{font-size:26px}h2{font-size:21px;margin:24px 0 12px}section>h2:first-child{margin-top:0}a{color:#176357}code{overflow-wrap:anywhere}header,section{min-width:0;background:white;padding:20px;border:1px solid #d8e1dd;border-radius:10px;margin-bottom:20px}.status{font-weight:700;color:${passed ? '#176357' : '#a12626'}}.filters,.chart-controls{display:flex;gap:12px;flex-wrap:wrap;align-items:center}label{display:flex;gap:8px;align-items:center;min-width:0}select,button{padding:8px;font:inherit;max-width:100%;min-height:44px}button{border:1px solid #b7c8bf;border-radius:4px;background:#eef4f0;color:#22312d;cursor:pointer}button:disabled{opacity:.5;cursor:default}.table{overflow:auto;max-width:100%}table{border-collapse:collapse;font-size:14px;white-space:nowrap;width:100%}th,td{padding:10px;text-align:left;border-bottom:1px solid #e1e7e4}th{background:#eef4f0}li{overflow-wrap:anywhere}[hidden]{display:none!important}small{color:#53665d}#diagnostic-details summary{cursor:pointer;padding:8px 0;min-height:44px}#diagnostic-details[open] summary{margin-bottom:8px}.diagnostics{list-style:none;padding:0;margin:12px 0}.diagnostic{border-left:4px solid;padding:10px 12px;margin:8px 0;border-radius:4px}.error{border-color:#b42318;background:#fff0ef;color:#8b1e16}.warning{border-color:#d3a11b;background:#fff8d9;color:#765100}.diagnostic strong{display:inline-block;margin-right:8px}.chart-grouping{min-width:0;margin:12px 0;padding:12px;border:1px solid #d8e1dd;border-radius:4px}.chart-group-options,.chart-legend,.chart-pagination{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.chart-group-options label{min-height:44px;padding:6px 10px}.chart-group-options input{width:18px;height:18px;margin:0}.chart-legend-item{display:flex;gap:8px;align-items:center;text-align:left;max-width:100%;min-width:0;background:transparent}.chart-legend-label{min-width:0;overflow-wrap:anywhere}.chart-legend-item[aria-pressed=false]{opacity:.5;text-decoration:line-through}.chart-swatch{width:16px;height:16px;flex-shrink:0;border-radius:2px}.chart-legend{margin-top:12px}.chart-pagination{margin-top:12px}.chart-wrap{position:relative;width:100%;min-width:0;margin-top:16px}#filter-status,#chart-status{overflow-wrap:anywhere}#chart-stale{position:absolute;inset:0;z-index:1;display:flex;align-items:center;justify-content:center;text-align:center;padding:16px;background:rgba(255,255,255,.85);color:#765100;font-weight:700}@media(max-width:480px){main{padding:12px}header,section{padding:14px}h1{font-size:22px}.filters label{width:100%;justify-content:space-between}.filters select{width:68%}.chart-controls label{flex-wrap:wrap}}
  </style></head><body><main><header><h1>青岚纪 · 每日平衡测试</h1><p class="status">${passed ? '通过' : '未通过'} · 返回 ${rows.length}/${plan.length} 条 · 模拟异常 ${report.simulationErrors?.length ?? 0} 条</p><p>测试提交：<code>${escape(report.commit ?? '未知（未完成）')}</code><br>生成时间：${escape(report.generatedAt ?? '未知')}<br>实际用时：${seconds(report.elapsedSeconds)}；每日北京时间 12:00 启动，排队或执行期间仍显示上次完成报告。</p><p>20 个固定种子，七种灵根、正/魔/兼修、十种本命、手机/电脑、四种投入及三个难度。无辅助一试即停，其他投入另算，自动模拟不等于真人胜率。前六关无辅助按用户确认范围验收，第七关只展示实测。</p><p><a href="../">返回游戏</a> · <a href="results.json">查看原始数据</a> · <a href="diagnostics.json">诊断 JSON 接口</a></p></header>
  <section id="diagnostics"><h2>失败与诊断</h2><p><strong class="error">Error ${diagnostics.counts.error}</strong> · <strong class="warning">Warning ${diagnostics.counts.warning}</strong></p><p>${passed ? '本次硬门槛全部通过。' : '本次未通过，请展开查看红色 Error。'}</p><details id="diagnostic-details"><summary>诊断明细（${diagnostics.items.length} 项）</summary><p>以下诊断覆盖整次测试，不受下方筛选影响；黄色 Warning 为观察提示，不单独判定门禁失败。</p>${diagnosticRows ? `<ul class="diagnostics">${diagnosticRows}</ul>` : '<p>没有检测到额外异常。</p>'}</details></section>
  <section id="statistics"><div class="filters">${select('root', '灵根', Object.entries(labels.roots))}${select('path', '路线', Object.entries(labels.paths))}${select('starter', '本命法宝', Object.entries(labels.treasures))}${select(
    'device',
    '场地',
    [
      ['phone', '手机'],
      ['desktop', '电脑'],
    ],
  )}${select('profile', '投入', Object.entries(profiles))}${select(
    'difficulty',
    '难度',
    DIFFICULTIES.map((d, i) => [String(i), d.name]),
  )}<button id="reset-filters" type="button">重置筛选</button></div><p id="filter-status" role="status">返回 ${rows.length}/${plan.length} 条。</p><p><small>未返回样本仍保留在计划分母中。空观测显示「—」。本命法宝指测试开局使用的法宝；路线、本命及场地筛选会重新统计，通过率不会沿用整体结果。</small></p>
  <h2>筛选统计图</h2><fieldset id="chart-grouping" class="chart-grouping"><legend>汇总维度（可多选）</legend><div class="chart-group-options">${[
    ['root', '灵根'],
    ['path', '路线'],
    ['starter', '本命法宝'],
    ['device', '场地'],
    ['profile', '投入'],
    ['difficulty', '难度'],
  ]
    .map(
      ([id, label]) =>
        `<label><input type="checkbox" id="chart-group-${id}" value="${id}"${id === 'root' ? ' checked' : ''}>${label}</label>`,
    )
    .join(
      '',
    )}</div><small>组合勾选可对比不同分组；全部取消时汇总当前筛选。每页最多展示 8 组，可翻页查看全部分组。</small></fieldset><div class="chart-controls"><label>图表<select id="chart-metric"><option value="clear">逐关累计通关率 · 柱状图</option><option value="time">逐关胜局耗时 · 折线图</option><option value="boss">妖王存活时长 · 条形图</option></select></label><button id="generate-chart" type="button">生成图表</button><button id="save-chart" type="button" disabled>保存图片</button></div><p id="chart-status" role="status">选择筛选条件及汇总维度后，点击「生成图表」；更改条件不会自动重画。</p><div id="chart-pagination" class="chart-pagination" hidden><button id="chart-previous" type="button">上一页</button><label>页码<select id="chart-page" aria-label="图表页码"></select></label><button id="chart-next" type="button">下一页</button><span id="chart-page-status" role="status"></span></div><div id="chart-wrap" class="chart-wrap" hidden><canvas id="report-chart" aria-label="已生成统计图" role="img"></canvas><div id="chart-stale" role="status" hidden>图表已过期，请重新生成</div></div><div id="chart-legend" class="chart-legend" aria-label="图表分组，点击切换显示"></div>
  <h2>完整路线通过率</h2>${table('roots', ['灵根', '投入', '难度', '返回/计划', '前六关连通率', '七关成仙率', '前六关验收范围', '七关胜局耗时 中位/P90'], tables.roots)}<h2>逐关成长、耗时与妖王</h2><p>未击杀妖王单独记录存活观测下界；胜利耗时只统计胜局。终关分别列出七位妖王。</p>${table('stages', ['灵根', '投入', '难度', '关卡', '胜利/进入', '胜局耗时 中位/P90', '失败数/耗时中位', '妖王', '出场中位', '击杀/出场', '存活 中位/P90', '未击杀观测中位', '90秒修为/境界阶'], tables.stages)}<h2>路线、本命和场地</h2>${table('groups', ['灵根', '投入', '难度', '路线', '场地', '本命', '前六关通过/计划'], tables.groups)}</section></main>
  <script src="chart.js"></script><script>
  const caseKey = ${caseKey.toString()};
  const quantile = ${quantile.toString()};
  const distribution = ${distribution.toString()};
  const summarize = ${summarize.toString()};
  const reportTables = ${reportTables.toString()};
  const reportChartData = ${reportChartData.toString()};
  (${installReportFilters.toString()})(${embedded(plan)},${embedded(labels)},${embedded({ commit: report.commit, generatedAt: report.generatedAt })},${embedded(rows.map((r) => r.key))});
  </script></body></html>`;
}
export function renderReport(input: string, output: string) {
  const root = resolve(output);
  if (!root.startsWith(join(repository, 'artifacts') + '/') && !root.startsWith('/tmp/'))
    throw new Error('报告只允许写入 artifacts/ 或 /tmp/');
  let report = loadReport(input);
  const claimedPass = report.passed === true;
  report.passed = passedFullReport(report, balanceCases(true));
  if (claimedPass && !report.passed && !report.error)
    report.error = '完整结果校验未通过；请检查样本身份、重复、缺失、战斗结构与原始门禁错误。';
  let html: string;
  try {
    html = reportHtml(report);
  } catch {
    report = failedReport(
      '测试报告的样本结构无效；请查看 GitHub Actions 原始错误和保留的报告文件。',
    );
    html = reportHtml(report);
  }
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'index.html'), html);
  copyFileSync(
    join(dirname(createRequire(import.meta.url).resolve('chart.js')), 'chart.umd.min.js'),
    join(root, 'chart.js'),
  );
  writeFileSync(
    join(root, 'diagnostics.json'),
    JSON.stringify(
      reportDiagnostics(
        report,
        balanceCases(true),
        reportLabels(balanceCases(true)),
        report.passed === true,
      ),
    ),
  );
  // 不上传体积翻倍的旧引擎结果；本次逐局数据、失败信息与源版本完整保留。
  writeFileSync(join(root, 'results.json'), JSON.stringify(report));
  const summary = `每日完整平衡测试：${report.passed === true ? '通过' : '未通过'}；返回 ${report.current?.length ?? 0}/10,080 条。\n\n在线报告：https://chenxuan520.github.io/qinglan-xiuxian/balance-report/\n`;
  writeFileSync(join(root, 'summary.md'), summary);
  console.log(summary);
}
// 更新静态展示，保留已完成测试的源提交、时间与原始逐局数据。
export function refreshReport(output = join(repository, 'dist/balance-report')) {
  const root = resolve(output);
  if (
    root !== join(repository, 'dist/balance-report') &&
    !root.startsWith(join(repository, 'artifacts') + '/') &&
    !root.startsWith('/tmp/')
  )
    throw new Error('报告刷新只允许 dist/balance-report、artifacts/ 或 /tmp/');
  mkdirSync(join(repository, 'artifacts'), { recursive: true });
  const staging = mkdtempSync(join(repository, 'artifacts/report-refresh-'));
  try {
    renderReport(join(root, 'results.json'), staging);
    mkdirSync(root, { recursive: true });
    for (const file of ['results.json', 'diagnostics.json', 'chart.js', 'summary.md', 'index.html'])
      copyFileSync(join(staging, file), join(root, file));
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--refresh') refreshReport(process.argv[3]);
  else {
    const input = process.argv[2] ?? join(repository, 'artifacts/balance-gate.json');
    const output = process.argv[3] ?? join(repository, 'artifacts/balance-daily-report');
    const report = loadReport(input);
    const { currentMetrics, referenceMetrics, before, beforeFarms, ...compact } =
      report as DailyReport & Record<string, unknown>;
    const temp = join(repository, 'artifacts/balance-report-input.json');
    mkdirSync(dirname(temp), { recursive: true });
    writeFileSync(temp, JSON.stringify(compact));
    renderReport(temp, output);
  }
}
