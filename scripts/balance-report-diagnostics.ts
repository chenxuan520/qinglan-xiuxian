import type { DailyReport } from './balance-report.ts';
import type { ReportLabels } from './balance-report-view.ts';
import type { BalanceCase } from './balance-policy.ts';
import { caseKey } from './balance-policy.ts';

export interface Diagnostic {
  id: string;
  severity: 'error' | 'warning';
  category:
    | 'execution'
    | 'acceptance'
    | 'history'
    | 'boss'
    | 'starter'
    | 'route'
    | 'device'
    | 'group';
  source: string;
  message: string;
  displayMessage: string;
  scope: Partial<BalanceCase> & { stage?: number; boss?: number };
}

// 静态 GET 接口与页面共用；只描述已检测的现象，不猜测原因。
export function reportDiagnostics(
  report: DailyReport,
  plan: BalanceCase[],
  labels: ReportLabels,
  passed: boolean,
) {
  const items: Diagnostic[] = [],
    seen = new Set<string>();
  const cases = new Map(plan.map((c) => [caseKey(c), c]));
  const humanize = (message: string) => {
    const match = /^([^：]+)：/.exec(message);
    if (!match) return message;
    const prefix = match[1],
      c = cases.get(prefix);
    if (c)
      return `${labels.roots[c.root] ?? c.root} / ${labels.paths[c.path] ?? c.path} / ${labels.treasures[c.starter] ?? c.starter} / ${c.device === 'phone' ? '手机' : '电脑'} / ${labels.profiles[c.profile] ?? c.profile} / ${labels.difficulties[c.difficulty] ?? c.difficulty} / 种子 ${c.seed}：${message.slice(match[0].length)}`;
    if (labels.roots[prefix]) return `${labels.roots[prefix]}：${message.slice(match[0].length)}`;
    const parts = prefix.split('/');
    if (!['root', 'route', 'starter'].includes(parts[0]) || !labels.roots[parts[1]]) return message;
    const metricNames: Record<string, string> = {
      root: '灵根',
      route: '路线',
      starter: '本命',
      clear: '通关率',
      entered: '进入率',
      observed: '返回率',
      errors: '缺失率',
      'all-seconds': '总耗时',
      'clear-seconds': '胜局耗时',
      ads: '广告耗时',
      cultivation: '修为',
      seconds: '胜局耗时',
      'failed-seconds': '失败耗时',
      attempts: '尝试次数',
      timeout: '超时率',
      growth90: '90秒修为',
      step90: '90秒境界',
      killed: '击杀率',
      spawn: '出场时间',
      lifetime: '存活时长',
      'alive-observed': '未击杀观测',
      instant: '瞬杀率',
      median: '中位数',
      p90: '90%分位',
    };
    return `${parts.map((part, index) => (index === 1 ? labels.roots[part] : parts[0] !== 'root' && index === 2 ? (labels.paths[part] ?? part) : (labels.profiles[part] ?? labels.treasures[part] ?? (part === 'phone' ? '手机' : part === 'desktop' ? '电脑' : /^stage-\d$/.test(part) ? `第${+part.slice(6) + 1}关` : /^boss-\d$/.test(part) ? `妖王${+part.slice(5) + 1}` : (metricNames[part] ?? part))))).join(' / ')}：${message.slice(match[0].length)}`;
  };
  const add = (
    severity: Diagnostic['severity'],
    category: Diagnostic['category'],
    source: string,
    message: string,
    scope: Diagnostic['scope'] = {},
  ) => {
    const identity = `${severity}/${message}`;
    if (seen.has(identity) || (severity === 'warning' && seen.has(`error/${message}`))) return;
    seen.add(identity);
    let displayMessage = humanize(message);
    if (category === 'group') {
      const match = /^([^：]+)：/.exec(message),
        parts = match?.[1].split('/') ?? [];
      const [root, dimension, device] = parts;
      const isDevice = (id: string) => id === 'phone' || id === 'desktop';
      if (
        match &&
        labels.roots[root] &&
        parts.length >= 2 &&
        parts.length <= 3 &&
        (parts.length === 2
          ? labels.treasures[dimension] || labels.paths[dimension] || isDevice(dimension)
          : labels.paths[dimension] && isDevice(device))
      ) {
        scope = {
          root: root as BalanceCase['root'],
          profile: 'bare',
          difficulty: 0,
        };
        if (labels.treasures[dimension]) {
          category = 'starter';
          scope.starter = dimension as BalanceCase['starter'];
        } else if (labels.paths[dimension]) {
          category = 'route';
          scope.path = dimension as BalanceCase['path'];
          if (device) scope.device = device as BalanceCase['device'];
        } else {
          category = 'device';
          scope.device = dimension as BalanceCase['device'];
        }
        displayMessage = `${parts.map((id, index) => (index === 0 ? labels.roots[id] : (labels.treasures[id] ?? labels.paths[id] ?? (id === 'phone' ? '手机' : '电脑')))).join(' / ')}：${message.slice(match[0].length)}`;
      }
    }
    if (category === 'boss') {
      const match = /^关卡 (\d+)\/妖王 (\d+)：/.exec(message);
      if (match)
        scope = { stage: +match[1] - 1, boss: +match[2] - 1, profile: 'bare', difficulty: 0 };
    }
    items.push({
      id: `diagnostic-${items.length + 1}`,
      severity,
      category,
      source,
      message,
      displayMessage,
      scope,
    });
  };
  if (report.error) add('error', 'execution', 'error', report.error);
  for (const error of report.simulationErrors ?? [])
    add(
      'error',
      'execution',
      'simulationErrors',
      `${error.key}：${error.error}`,
      cases.get(error.key) ?? {},
    );
  for (const source of ['failures', 'readinessFailures', 'targetFailures'] as const)
    for (const message of report[source] ?? []) add('error', 'acceptance', source, message);
  if (!passed && !items.length)
    add(
      'error',
      'execution',
      'coverage',
      '任务未完整通过；请查看 Actions 原始错误，缺失或无效结果不能判定通过。',
    );
  for (const [source, category] of [
    ['regressionFailures', 'history'],
    ['bossFailures', 'boss'],
    ['groupFailures', 'group'],
  ] as const)
    for (const message of report[source] ?? []) add('warning', category, source, message);
  return {
    schemaVersion: 1,
    commit: report.commit ?? null,
    currentHash: report.currentHash ?? null,
    generatedAt: report.generatedAt ?? null,
    elapsedSeconds: report.elapsedSeconds ?? null,
    passed,
    plannedSamples: plan.length,
    returnedSamples: report.current?.length ?? 0,
    simulationErrors: report.simulationErrors?.length ?? 0,
    counts: {
      error: items.filter((i) => i.severity === 'error').length,
      warning: items.filter((i) => i.severity === 'warning').length,
    },
    scope: 'whole-run',
    stageNumbering: 'zero-based',
    links: { report: './', results: 'results.json' },
    items,
  };
}
