import { execFileSync } from 'node:child_process';
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validObserverReport, validObserverReportUrl } from '../src/observer-report.ts';
import type { ObserverReport } from '../src/observer-report.ts';

export interface ObserverReportRun {
  id: number;
  path: string;
  head_sha: string;
  head_branch: string;
  event: string;
  status: string;
  conclusion?: string | null;
  created_at: string;
  updated_at?: string;
  repository?: { full_name: string };
  head_repository?: { full_name: string };
}
interface RestoreOptions {
  api?: (path: string) => unknown;
  download?: (runId: number, directory: string) => void;
}
type Row = Record<string, any>;
const object = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v);
function requireValue(value: unknown): asserts value {
  if (!value) throw new Error('巡检产物结构不完整');
}
function array(v: unknown, limit = 2000): any[] {
  requireValue(Array.isArray(v) && v.length <= limit);
  return v;
}
function publicText(input: unknown, fallback: string, max: number) {
  if (typeof input !== 'string' || !input.trim() || input.length > max) return fallback;
  return input
    .trim()
    .replace(/https?:\/\/[^\s<>"']+/gi, '[链接见来源]')
    .replace(/\b(?:Bearer|Basic)\s+\S+/gi, '[已隐藏]')
    .replace(
      /\b(?:sk-[\w-]+|gh[pousr]_[\w]+|github_pat_[\w]+)|\beyJ[\w-]+\.[\w-]+\.[\w-]+/g,
      '[已隐藏]',
    )
    .replace(
      /(?:[A-Z0-9_]*(?:API_KEY|SECRET|TOKEN)|authorization|cookie|api[_-]?key|access[_-]?token|password|secret)["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi,
      '[已隐藏]',
    )
    .replace(/\b[A-Z][A-Z0-9_]*(?:API_KEY|SECRET|TOKEN)\b/g, '[已隐藏]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[已隐藏]')
    .replace(/[\x00-\x1f\x7f<>]/g, ' ');
}
function publicUrl(value: unknown) {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    const original = new URLSearchParams(url.search);
    url.username = url.password = url.search = url.hash = '';
    if (url.hostname === 'qinglan-npc-ai.011203.xyz' && url.pathname === '/monitor/stats') {
      for (const key of ['days', 'site']) {
        const values = original.getAll(key);
        if (!values.length) continue;
        if (
          values.length !== 1 ||
          !(key === 'days' ? ['1', '7', '30', '90'] : ['all', 'main', 'pages']).includes(values[0])
        )
          return undefined;
        url.searchParams.set(key, values[0]);
      }
    }
    return validObserverReportUrl(url.href) ? url.href : undefined;
  } catch {
    return undefined;
  }
}
function runIdentity(run: ObserverReportRun) {
  requireValue(Number.isSafeInteger(run.id) && run.id > 0 && /^[a-f0-9]{40}$/.test(run.head_sha));
  const checkedAt = run.updated_at ?? run.created_at;
  requireValue(typeof checkedAt === 'string' && Number.isFinite(Date.parse(checkedAt)));
  return { commit: run.head_sha, runId: run.id, checkedAt: new Date(checkedAt).toISOString() };
}
export function eligibleObserverReportRun(
  value: unknown,
  repository: string,
): value is ObserverReportRun {
  if (!object(value)) return false;
  return (
    value.path === '.github/workflows/observer.yml' &&
    value.head_branch === 'master' &&
    value.repository?.full_name === repository &&
    value.head_repository?.full_name === repository &&
    value.status === 'completed' &&
    value.conclusion !== 'cancelled' &&
    ['schedule', 'workflow_dispatch'].includes(value.event)
  );
}
export function incompleteObserverReport(run: ObserverReportRun): ObserverReport {
  return {
    schemaVersion: 1,
    ...runIdentity(run),
    state: 'incomplete',
    summary: '本次巡检报告不完整，请查看对应运行详情。',
    counts: { sources: 0, new: 0, current: 0, recovered: 0, unresolved: 0, pending: 0 },
    analysis: {
      engine: 'none',
      model: 'unknown',
      status: 'unavailable',
      verificationOnly: false,
      summary: '本次运行未提供可验证的 AI 分析结果。',
      error: '公开巡检证据不完整。',
    },
    sources: [],
    items: [],
  };
}
function signal(value: unknown): Row {
  requireValue(
    object(value) &&
      typeof value.id === 'string' &&
      typeof value.sourceId === 'string' &&
      ['warning', 'critical'].includes(value.severity),
  );
  requireValue(
    /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/.test(value.id) &&
      /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/.test(value.sourceId),
  );
  return value;
}
const signalKey = (value: Row) => JSON.stringify([value.sourceId, value.id]);
function assessment(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const first = value.match(
    /^AI 分类：(证据支持|支持不足|需要核实)（支持概率 (\d+(?:\.\d+)?)%）。/,
  );
  return first && Number(first[2]) <= 100 ? first[0] : undefined;
}

export function projectObserverReport(
  result: unknown,
  state: unknown,
  run: ObserverReportRun,
): ObserverReport {
  const identity = runIdentity(run);
  try {
    requireValue(object(result) && object(result.snapshot) && result.snapshot.schemaVersion === 1);
    requireValue(
      object(state) &&
        state.schemaVersion === 1 &&
        object(state.incidents) &&
        Array.isArray(state.history),
    );
    const observations = array(result.snapshot.observations, 1000);
    const current = array(result.signals).map(signal),
      notifications = array(result.notifications).map(signal);
    const recovered = array(result.recovered).map((value) => {
      requireValue(object(value));
      return signal(value.signal);
    });
    const incidents = Object.values(state.incidents);
    requireValue(incidents.length <= 2000 && incidents.every((value) => object(value)));
    for (const incident of incidents) {
      signal(incident.signal);
      for (const field of ['notifiedAt', 'resolvedAt'])
        if (incident[field] !== undefined)
          requireValue(
            typeof incident[field] === 'string' && Number.isFinite(Date.parse(incident[field])),
          );
    }
    const unresolved = incidents
      .filter((value) => value.notifiedAt && !value.resolvedAt)
      .map((value) => signal(value.signal));
    const currentKeys = new Set(current.map(signalKey)),
      newKeys = new Set(notifications.map(signalKey));
    const unresolvedKeys = new Set(unresolved.map(signalKey));
    requireValue(
      currentKeys.size === current.length &&
        newKeys.size === notifications.length &&
        unresolvedKeys.size === unresolved.length &&
        notifications.every((value) => currentKeys.has(signalKey(value))),
    );
    const rawAnalysis = result.analysis;
    requireValue(
      object(rawAnalysis) &&
        ['complete', 'skipped', 'failed', 'unavailable'].includes(rawAnalysis.status) &&
        (rawAnalysis.verificationOnly === undefined ||
          typeof rawAnalysis.verificationOnly === 'boolean'),
    );
    const verificationOnly = rawAnalysis.verificationOnly === true;
    const summaries = {
      complete: verificationOnly
        ? '已完成合成连通校验，未分析真实异常。'
        : '已完成候选异常的证据分类。',
      skipped: '本轮未调用 AI 分析。',
      failed: 'AI 分析未完成，原有规则证据保持。',
      unavailable: 'AI 分析暂不可用，原有规则证据保持。',
    };
    const safeIdentity = (value: unknown) =>
      typeof value === 'string' &&
      /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/.test(value) &&
      publicText(value, '', 160) === value
        ? value
        : 'unknown';
    const analysis: ObserverReport['analysis'] = {
      engine: safeIdentity(rawAnalysis.engine),
      model: safeIdentity(rawAnalysis.model),
      status: rawAnalysis.status,
      verificationOnly,
      summary: summaries[rawAnalysis.status as keyof typeof summaries],
    };
    if (analysis.status === 'failed' || analysis.status === 'unavailable')
      analysis.error = 'AI 分析未完成，请查看对应运行详情。';
    if (rawAnalysis.diagnostics !== undefined) {
      const d = rawAnalysis.diagnostics;
      requireValue(
        object(d) &&
          typeof d.stage === 'string' &&
          [
            'setup',
            'pi',
            'request',
            'fetch',
            'response',
            'response-body',
            'parse',
            'complete',
          ].includes(d.stage),
      );
      analysis.diagnostics = {
        stage: d.stage,
        elapsedMs: d.elapsedMs,
        ...(d.httpStatus === undefined ? {} : { httpStatus: d.httpStatus }),
      };
    }
    const sources: ObserverReport['sources'] = observations.map((value) => {
      requireValue(object(value));
      const url = publicUrl(value.url);
      return {
        id: value.id,
        title: publicText(value.title, '运行来源', 120),
        status: value.status,
        ...(url ? { url } : {}),
        ...(typeof value.version === 'string'
          ? { version: publicText(value.version, 'unknown', 160) }
          : {}),
        ...(value.generatedAt === undefined ? {} : { generatedAt: value.generatedAt }),
      };
    });
    const findings = new Map<string, Row>();
    for (const finding of array(rawAnalysis.findings ?? []))
      if (object(finding) && typeof finding.signalId === 'string')
        findings.set(finding.signalId, finding);
    const item = (
      s: Row,
      status: ObserverReport['items'][number]['status'],
    ): ObserverReport['items'][number] => {
      const integration = s.sourceId === 'observer-integration';
      const finding = findings.get(`${s.sourceId}/${s.id}`);
      const first = !verificationOnly && assessment(finding?.explanation);
      const nextSteps =
        !verificationOnly && Array.isArray(finding?.nextSteps)
          ? finding.nextSteps
              .slice(0, 4)
              .map((step: unknown) => publicText(step, '请核对对应运行的公开证据。', 240))
          : undefined;
      return {
        sourceId: s.sourceId,
        title: integration ? 'AI 分析配置不可用' : publicText(s.title, '运行异常', 160),
        detail: integration
          ? '请查看运行详情核对 AI 分析配置。'
          : publicText(s.detail, '请核对对应运行的公开证据。', 600),
        severity: s.severity,
        status,
        ...(first ? { assessment: first } : {}),
        ...(nextSteps?.length ? { nextSteps } : {}),
      };
    };
    const items = current.map((value) =>
      item(
        value,
        newKeys.has(signalKey(value))
          ? 'new'
          : unresolvedKeys.has(signalKey(value))
            ? 'existing'
            : 'candidate',
      ),
    );
    for (const value of unresolved)
      if (!currentKeys.has(signalKey(value))) items.push(item(value, 'existing'));
    for (const value of recovered) items.push(item(value, 'recovered'));
    const counts = {
      sources: sources.length,
      new: notifications.length,
      current: current.length,
      recovered: recovered.length,
      unresolved: unresolved.length,
      pending: sources.filter((value) => value.status === 'pending').length,
    };
    const attention =
      counts.current > 0 ||
      counts.unresolved > 0 ||
      sources.some((value) => ['failed', 'unavailable', 'invalid'].includes(value.status));
    const incomplete =
      ['failed', 'unavailable'].includes(analysis.status) ||
      (run.conclusion !== 'success' && !attention);
    const reportState = incomplete
      ? 'incomplete'
      : attention
        ? 'attention'
        : counts.pending
          ? 'pending'
          : 'healthy';
    const report: ObserverReport = {
      schemaVersion: 1,
      ...identity,
      checkedAt: result.snapshot.at,
      state: reportState,
      summary:
        reportState === 'incomplete'
          ? '本次 AI 巡检未完整完成，请查看运行详情。'
          : reportState === 'attention'
            ? '巡检发现需要关注的运行记录。'
            : reportState === 'pending'
              ? '后台任务仍在执行，尚无新增异常结论。'
              : '本次巡检未发现需要关注的运行异常。',
      counts,
      analysis,
      sources,
      items,
    };
    requireValue(validObserverReport(report));
    return report;
  } catch {
    return incompleteObserverReport(run);
  }
}

function readArtifact(directory: string, name: string) {
  const path = join(directory, name),
    stat = lstatSync(path);
  requireValue(stat.isFile() && stat.size > 0 && stat.size <= 16 * 1024 * 1024);
  return JSON.parse(readFileSync(path, 'utf8'));
}
export function restoreObserverReport(
  repository: string,
  out = 'dist/monitor',
  options: RestoreOptions = {},
) {
  requireValue(/^[\w.-]+\/[\w.-]+$/.test(repository));
  const api = (path: string): any => {
    try {
      return options.api
        ? options.api(path)
        : JSON.parse(
            execFileSync('gh', ['api', path, '--paginate', '--slurp'], {
              encoding: 'utf8',
              maxBuffer: 16 * 1024 * 1024,
              stdio: ['ignore', 'pipe', 'pipe'],
            }),
          );
    } catch {
      throw new Error('无法读取巡检运行记录，拒绝覆盖公开报告。');
    }
  };
  const pages = api(
    `repos/${repository}/actions/workflows/observer.yml/runs?branch=master&per_page=100`,
  );
  requireValue(
    Array.isArray(pages) &&
      pages.every((page) => object(page) && Array.isArray(page.workflow_runs)),
  );
  const listed = pages.flatMap((page) => page.workflow_runs);
  requireValue(
    listed.every(
      (value) =>
        object(value) &&
        Number.isSafeInteger(value.id) &&
        value.id > 0 &&
        typeof value.path === 'string' &&
        typeof value.status === 'string',
    ),
  );
  const runs = listed.filter((run) =>
    eligibleObserverReportRun(run, repository),
  ) as ObserverReportRun[];
  for (const run of runs) {
    runIdentity(run);
    requireValue(Number.isFinite(Date.parse(run.created_at)));
  }
  runs.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id);
  const run = runs[0];
  if (!run) {
    rmSync(join(out, 'observer.json'), { force: true });
    console.log('尚无已完成的正式巡检运行。');
    return undefined;
  }
  const artifactPages = api(`repos/${repository}/actions/runs/${run.id}/artifacts?per_page=100`);
  requireValue(
    Array.isArray(artifactPages) &&
      artifactPages.every((page) => object(page) && Array.isArray(page.artifacts)),
  );
  const artifact = artifactPages
    .flatMap((page) => page.artifacts)
    .find((value) => value.name === 'observer-state' && !value.expired);
  let report = incompleteObserverReport(run);
  if (artifact) {
    const temporary = mkdtempSync(join(tmpdir(), 'qinglan-observer-public-'));
    try {
      try {
        if (options.download) options.download(run.id, temporary);
        else
          execFileSync(
            'gh',
            [
              'run',
              'download',
              String(run.id),
              '--repo',
              repository,
              '--name',
              'observer-state',
              '--dir',
              temporary,
            ],
            { stdio: ['ignore', 'pipe', 'pipe'] },
          );
      } catch {
        throw new Error('无法下载最新巡检证据，拒绝覆盖公开报告。');
      }
      try {
        report = projectObserverReport(
          readArtifact(temporary, 'result.json'),
          readArtifact(temporary, 'state.json'),
          run,
        );
      } catch {
        /* 当前运行缺文件或损坏时公布incomplete，不回落旧绿色。 */
      }
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }
  requireValue(validObserverReport(report));
  mkdirSync(out, { recursive: true });
  const target = join(out, 'observer.json');
  writeFileSync(target + '.next', JSON.stringify(report));
  renameSync(target + '.next', target);
  console.log(`保留最新公开巡检结果：Actions ${run.id}，状态 ${report.state}`);
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    restoreObserverReport(process.env.GITHUB_REPOSITORY ?? '', process.argv[2] ?? 'dist/monitor');
  } catch {
    console.error('公开巡检报告恢复失败，请检查权限、网络和运行证据；未输出原始异常。');
    process.exitCode = 1;
  }
}
