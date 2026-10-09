import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPIRIT_ROOTS, CULTIVATION_PATHS, DIFFICULTIES, STAGES, treasure } from '../src/data.ts';
import { BARE_CLEAR_TARGETS, balanceCases } from './balance-policy.ts';
import type { BalanceCase } from './balance-policy.ts';
import { summarize, verifyCoverage } from './balance-metrics.ts';
import type { CampaignSample } from './balance-simulation.ts';

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
const percent = (n: number | undefined) => (n === undefined ? '—' : `${(n * 100).toFixed(1)}%`);
const seconds = (n: number | null | undefined) => (n == null ? '—' : `${n.toFixed(1)}秒`);
export interface DailyReport {
  commit?: string;
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
export function reportHtml(report: DailyReport) {
  const rows = report.current ?? [],
    plan = balanceCases(true);
  const stats = summarize(rows, plan),
    six = summarize(rows, plan, 6);
  const failed = !passedFullReport(report, plan);
  const failures = [
    ...new Set([
      ...(report.error ? [report.error] : []),
      ...(report.failures ?? []),
      ...(report.readinessFailures ?? []),
      ...(report.targetFailures ?? []),
      ...(report.simulationErrors ?? []).map((e) => `${e.key}：${e.error}`),
    ]),
  ];
  const warnings = [
    ...(report.regressionFailures ?? []),
    ...(report.bossFailures ?? []),
    ...(report.groupFailures ?? []),
  ];
  const rowAttrs = (root: string, profile: string, difficulty: string) =>
    `data-root="${escape(root)}" data-profile="${escape(profile)}" data-difficulty="${escape(difficulty)}"`;
  const rootRows: string[] = [],
    stageRows: string[] = [],
    groupRows: string[] = [];
  for (const [key, metric] of Object.entries(stats)) {
    const match = /^root\/([^/]+)\/([^/]+)\/(\d+)\/clear$/.exec(key);
    if (!match) continue;
    const [, root, profile, difficulty] = match;
    const prefix = key.slice(0, -6),
      attrs = rowAttrs(root, profile, difficulty);
    const base = `<td>${escape(rootName(root))}</td><td>${escape(profiles[profile])}</td><td>${escape(DIFFICULTIES[+difficulty].name)}</td>`;
    const observed = Math.round(metric.n * (stats[`${prefix}/observed`].rate ?? 0));
    const target =
      profile === 'bare' && difficulty === '0'
        ? BARE_CLEAR_TARGETS[root as keyof typeof BARE_CLEAR_TARGETS]
        : null;
    const sixRate = six[key].rate!;
    rootRows.push(
      `<tr ${attrs}>${base}<td>${observed}/${metric.n}</td><td>${Math.round(metric.n * sixRate)}/${metric.n} · ${percent(sixRate)}</td><td>${percent(metric.rate)}</td><td>${target ? `${percent(target.min)}～${percent(target.max)}` : '独立统计'}</td><td>${seconds(stats[`${prefix}/clear-seconds`].median)} / ${seconds(stats[`${prefix}/clear-seconds`].p90)}</td></tr>`,
    );
    for (let stage = 0; stage < 7; stage++) {
      const p = `${prefix}/stage-${stage}`;
      const entered = Math.round(metric.n * (stats[`${p}/entered`].rate ?? 0));
      const wins = Math.round(metric.n * (stats[`${p}/clear`].rate ?? 0));
      const kings = stage === 6 ? [0, 1, 2, 3, 4, 5, 6] : [stage];
      for (const king of kings) {
        const bp = `${p}/boss-${king}`;
        stageRows.push(
          `<tr ${attrs}>${base}<td>${escape(STAGES[stage].name)}</td><td>${wins}/${entered}（累计${percent(stats[`${p}/clear`].rate)}）</td><td>${seconds(stats[`${p}/seconds`].median)} / ${seconds(stats[`${p}/seconds`].p90)}</td><td>${stats[`${p}/failed-seconds`].n} · ${seconds(stats[`${p}/failed-seconds`].median)}</td><td>${escape(STAGES[king].boss)}</td><td>${seconds(stats[`${bp}/spawn`].median)}</td><td>${stats[`${bp}/lifetime`].n}/${stats[`${bp}/spawn`].n}</td><td>${seconds(stats[`${bp}/lifetime`].median)} / ${seconds(stats[`${bp}/lifetime`].p90)}</td><td>${seconds(stats[`${bp}/alive-observed`].median)}</td><td>${stats[`${p}/growth90`].median ?? '—'} / ${stats[`${p}/step90`].median ?? '—'}</td></tr>`,
        );
      }
    }
  }
  for (const [key, metric] of Object.entries(six)) {
    const match =
      /^(route|starter)\/([^/]+)\/([^/]+)\/([^/]+)\/([^/]+)\/(\d+)(?:\/([^/]+))?\/clear$/.exec(key);
    if (!match) continue;
    const [, type, root, path, device, profile, difficulty, starter] = match;
    groupRows.push(
      `<tr ${rowAttrs(root, profile, difficulty)}><td>${escape(rootName(root))}</td><td>${escape(profiles[profile])}</td><td>${escape(DIFFICULTIES[+difficulty].name)}</td><td>${escape(CULTIVATION_PATHS.find((p) => p.id === path)?.name ?? path)}</td><td>${device === 'phone' ? '手机' : '电脑'}</td><td>${type === 'starter' ? escape(treasure(starter as CampaignSample['case']['starter']).name) : '整条路线'}</td><td>${Math.round(metric.n * metric.rate!)}/${metric.n} · ${percent(metric.rate)}</td></tr>`,
    );
  }
  const select = (id: string, label: string, items: [string, string][]) =>
    `<label>${label}<select id="${id}"><option value="">全部</option>${items.map(([v, l]) => `<option value="${escape(v)}">${escape(l)}</option>`).join('')}</select></label>`;
  const table = (headers: string[], content: string[]) =>
    `<div class="table"><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${content.join('')}</tbody></table></div>`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>青岚纪 · 每日平衡测试</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f3f5f6;color:#22312d;font:16px/1.7 system-ui,sans-serif}main{max-width:1500px;margin:auto;padding:24px}h1{font-size:26px}h2{font-size:21px;margin-top:32px}a{color:#176357}code{overflow-wrap:anywhere}header,section{background:white;padding:20px;border:1px solid #d8e1dd;border-radius:10px;margin-bottom:20px}.status{font-weight:700;color:${failed ? '#a12626' : '#176357'}}.filters{display:flex;gap:16px;flex-wrap:wrap}label{display:flex;gap:8px;align-items:center}select{padding:8px;font:inherit;max-width:100%}.table{overflow:auto}table{border-collapse:collapse;font-size:14px;white-space:nowrap;width:100%}th,td{padding:10px;text-align:left;border-bottom:1px solid #e1e7e4}th{background:#eef4f0}li{overflow-wrap:anywhere}[hidden]{display:none!important}details{margin-top:16px}small{color:#53665d}@media(max-width:480px){main{padding:12px}header,section{padding:14px}h1{font-size:22px}}
  </style></head><body><main><header><h1>青岚纪 · 每日平衡测试</h1><p class="status">${failed ? '未通过' : '通过'} · 返回 ${rows.length}/${plan.length} 条 · 模拟异常 ${report.simulationErrors?.length ?? 0} 条</p><p>测试提交：<code>${escape(report.commit ?? '未知（未完成）')}</code><br>生成时间：${escape(report.generatedAt ?? '未知')}<br>实际用时：${seconds(report.elapsedSeconds)}；每日北京时间 12:00 启动，排队或执行期间仍显示上次完成报告。</p><p>20 个固定种子，七种灵根、正/魔/兼修、十种本命、手机/电脑、四种投入及三个难度。无辅助一试即停，其他投入另算，自动模拟不等于真人胜率。前六关无辅助按用户确认范围验收，第七关只展示实测。</p><p><a href="../">返回游戏</a> · <a href="results.json">查看原始数据</a></p></header><section><div class="filters">${select(
    'root',
    '灵根',
    SPIRIT_ROOTS.map((r) => [r.id, rootName(r.id)]),
  )}${select('profile', '投入', Object.entries(profiles))}${select(
    'difficulty',
    '难度',
    DIFFICULTIES.map((d, i) => [String(i), d.name]),
  )}</div><p><small>未返回样本仍保留在计划分母中，不能用缺失样本提高通过率。空观测显示「—」。</small></p><h2>完整路线通过率</h2>${table(['灵根', '投入', '难度', '返回/计划', '前六关连通率', '七关成仙率', '前六关验收范围', '七关胜局耗时 中位/P90'], rootRows)}<h2>逐关成长、耗时与妖王</h2><p>未击杀妖王单独记录存活观测下界；胜利耗时只统计胜局。终关分别列出七位妖王。</p>${table(['灵根', '投入', '难度', '关卡', '胜利/进入', '胜局耗时 中位/P90', '失败数/耗时中位', '妖王', '出场中位', '击杀/出场', '存活 中位/P90', '未击杀观测中位', '90秒修为/境界阶'], stageRows)}<h2>路线、本命和场地</h2>${table(['灵根', '投入', '难度', '路线', '场地', '本命', '前六关通过/计划'], groupRows)}</section><section><h2>失败与诊断</h2>${failures.length ? `<ul>${failures.map((f) => `<li>${escape(f)}</li>`).join('')}</ul>` : failed ? '<p>任务未完整结束，请查看 Actions 原始错误。没有完整结果不代表通过。</p>' : '<p>本次硬门槛全部通过。</p>'}<details><summary>历史差异与妖王演出诊断（${warnings.length} 项）</summary><ul>${warnings.map((f) => `<li>${escape(f)}</li>`).join('')}</ul></details></section></main><script>
  const filters=['root','profile','difficulty'];function apply(){const selected=Object.fromEntries(filters.map(k=>[k,document.getElementById(k).value]));document.querySelectorAll('tbody tr').forEach(row=>{row.hidden=filters.some(k=>selected[k]&&row.dataset[k]!==selected[k]);});}filters.forEach(k=>document.getElementById(k).addEventListener('change',apply));
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
  // 不上传体积翻倍的旧引擎结果；本次逐局数据、失败信息与源版本完整保留。
  writeFileSync(join(root, 'results.json'), JSON.stringify(report));
  const summary = `每日完整平衡测试：${report.passed === true ? '通过' : '未通过'}；返回 ${report.current?.length ?? 0}/10,080 条。\n\n在线报告：https://chenxuan520.github.io/qinglan-xiuxian/balance-report/\n`;
  writeFileSync(join(root, 'summary.md'), summary);
  console.log(summary);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
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
