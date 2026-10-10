import { summarize, quantile } from './balance-metrics.ts';
import type { BalanceCase } from './balance-policy.ts';
import { caseKey } from './balance-policy.ts';
import type { CampaignSample } from './balance-simulation.ts';

export interface ReportLabels {
  roots: Record<string, string>;
  paths: Record<string, string>;
  treasures: Record<string, string>;
  profiles: Record<string, string>;
  difficulties: string[];
  stages: string[];
  bosses: string[];
  targets: Record<string, { min: number; max: number }>;
}

// 同一份统计和表格用于初始报告与浏览器筛选，计划分母始终包含未返回样本。
export function reportTables(
  rows: CampaignSample[],
  plan: BalanceCase[],
  labels: ReportLabels,
  subgroup = false,
) {
  const escape = (value: unknown) =>
    String(value ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
    );
  const percent = (n: number | undefined) => (n === undefined ? '—' : `${(n * 100).toFixed(1)}%`);
  const seconds = (n: number | null | undefined) => (n == null ? '—' : `${n.toFixed(1)}秒`);
  const attrs = (root: string, profile: string, difficulty: string) =>
    `data-root="${escape(root)}" data-profile="${escape(profile)}" data-difficulty="${escape(difficulty)}"`;
  const stats = summarize(rows, plan),
    six = summarize(rows, plan, 6);
  const roots: string[] = [],
    stages: string[] = [],
    groups: string[] = [];
  for (const [key, metric] of Object.entries(stats)) {
    const match = /^root\/([^/]+)\/([^/]+)\/(\d+)\/clear$/.exec(key);
    if (!match) continue;
    const [, root, profile, difficulty] = match;
    const prefix = key.slice(0, -6),
      attributes = attrs(root, profile, difficulty);
    const base = `<td>${escape(labels.roots[root] ?? root)}</td><td>${escape(labels.profiles[profile])}</td><td>${escape(labels.difficulties[+difficulty])}</td>`;
    const target =
      !subgroup && profile === 'bare' && difficulty === '0' ? labels.targets[root] : null;
    roots.push(
      `<tr ${attributes}>${base}<td>${Math.round(metric.n * (stats[`${prefix}/observed`].rate ?? 0))}/${metric.n}</td><td>${Math.round(metric.n * six[key].rate!)}/${metric.n} · ${percent(six[key].rate)}</td><td>${percent(metric.rate)}</td><td>${target ? `${percent(target.min)}～${percent(target.max)}` : '独立统计'}</td><td>${seconds(stats[`${prefix}/clear-seconds`].median)} / ${seconds(stats[`${prefix}/clear-seconds`].p90)}</td></tr>`,
    );
    for (let stage = 0; stage < 7; stage++) {
      const p = `${prefix}/stage-${stage}`;
      const entered = Math.round(metric.n * (stats[`${p}/entered`].rate ?? 0));
      const wins = Math.round(metric.n * (stats[`${p}/clear`].rate ?? 0));
      for (const king of stage === 6 ? [0, 1, 2, 3, 4, 5, 6] : [stage]) {
        const bp = `${p}/boss-${king}`;
        stages.push(
          `<tr ${attributes}>${base}<td>${escape(labels.stages[stage])}</td><td>${wins}/${entered}（累计${percent(stats[`${p}/clear`].rate)}）</td><td>${seconds(stats[`${p}/seconds`].median)} / ${seconds(stats[`${p}/seconds`].p90)}</td><td>${stats[`${p}/failed-seconds`].n} · ${seconds(stats[`${p}/failed-seconds`].median)}</td><td>${escape(labels.bosses[king])}</td><td>${seconds(stats[`${bp}/spawn`].median)}</td><td>${stats[`${bp}/lifetime`].n}/${stats[`${bp}/spawn`].n}</td><td>${seconds(stats[`${bp}/lifetime`].median)} / ${seconds(stats[`${bp}/lifetime`].p90)}</td><td>${seconds(stats[`${bp}/alive-observed`].median)}</td><td>${stats[`${p}/growth90`].median ?? '—'} / ${stats[`${p}/step90`].median ?? '—'}</td></tr>`,
        );
      }
    }
  }
  for (const [key, metric] of Object.entries(six)) {
    const match =
      /^(route|starter)\/([^/]+)\/([^/]+)\/([^/]+)\/([^/]+)\/(\d+)(?:\/([^/]+))?\/clear$/.exec(key);
    if (!match) continue;
    const [, type, root, path, device, profile, difficulty, starter] = match;
    if (
      (type === 'route' && starter) ||
      (type === 'starter' && (!starter || !labels.treasures[starter]))
    )
      continue;
    groups.push(
      `<tr ${attrs(root, profile, difficulty)} data-path="${escape(path)}" data-device="${escape(device)}" data-starter="${escape(starter ?? '')}"><td>${escape(labels.roots[root] ?? root)}</td><td>${escape(labels.profiles[profile])}</td><td>${escape(labels.difficulties[+difficulty])}</td><td>${escape(labels.paths[path] ?? path)}</td><td>${device === 'phone' ? '手机' : '电脑'}</td><td>${type === 'starter' ? escape(labels.treasures[starter] ?? starter) : '路线合计'}</td><td>${Math.round(metric.n * metric.rate!)}/${metric.n} · ${percent(metric.rate)}</td></tr>`,
    );
  }
  return { roots: roots.join(''), stages: stages.join(''), groups: groups.join('') };
}

export type ReportChartMetric = 'clear' | 'time' | 'boss';
export function reportChartData(
  rows: CampaignSample[],
  plan: BalanceCase[],
  metric: ReportChartMetric,
  labels: ReportLabels,
) {
  // 与 summarize 一致：只关联计划身份，每个身份最多计一次，失败报告也不虚增比例。
  const byKey = new Map(rows.map((row) => [row.key, row]));
  rows = plan.flatMap((c) => {
    const row = byKey.get(caseKey(c));
    return row ? [{ ...row, case: c }] : [];
  });
  const roots = Object.keys(labels.roots).filter((root) => plan.some((c) => c.root === root));
  const slots =
    metric === 'boss'
      ? [
          ...Array.from({ length: 6 }, (_, stage) => ({ stage, king: stage })),
          ...Array.from({ length: 7 }, (_, king) => ({ stage: 6, king })),
        ]
      : Array.from({ length: 7 }, (_, stage) => ({ stage, king: stage }));
  return {
    labels: slots.map((s) =>
      metric === 'boss'
        ? `${s.stage === 6 ? '终关' : `第${s.stage + 1}境`}·${labels.bosses[s.king]}`
        : labels.stages[s.stage],
    ),
    datasets: roots.map((root) => {
      const index = Object.keys(labels.roots).indexOf(root);
      const samples = rows.filter((r) => r.case.root === root),
        n = plan.filter((c) => c.root === root).length;
      return {
        label: labels.roots[root],
        borderColor: ['#176357', '#a66523', '#4778b4', '#9064ac', '#ba5665', '#6c8042', '#606d79'][
          index
        ],
        backgroundColor: [
          '#176357',
          '#a66523',
          '#4778b4',
          '#9064ac',
          '#ba5665',
          '#6c8042',
          '#606d79',
        ][index],
        data: slots.map(({ stage, king }) => {
          if (metric === 'clear')
            return (samples.filter((r) => r.cleared > stage).length / n) * 100;
          const battles = samples.flatMap((r) => r.battles.filter((b) => b.stage === stage));
          if (metric === 'time')
            return quantile(
              battles.filter((b) => b.state === 'won').map((b) => b.seconds),
              0.5,
            );
          return quantile(
            battles.flatMap((b) =>
              b.bosses
                .filter((k) => k.stage === king && k.deadAt !== null)
                .map((k) => k.observedSeconds),
            ),
            0.5,
          );
        }),
      };
    }),
  };
}
