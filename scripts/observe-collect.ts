import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { validMonitorData } from '../src/monitor-protocol.ts';
import { validPerformanceSnapshot } from '../src/monitor-performance.ts';
import { validAutoplayReport } from '../src/autoplay-report.ts';
import { validWeaponReport } from '../src/weapon-report.ts';
import type { Metric, Observation, Signal, SourceSpec } from './observe-types.ts';

const execute = promisify(execFile);
const object = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const count = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
const numeric = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const date = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));
const hash = (v: string) => createHash('sha256').update(v).digest('hex').slice(0, 16);

// 只保留聚合事实。不向模型、日志或状态文件转存原始 HTTP 错误、请求头和玩家文本。
export function safeText(input: unknown, max = 500): string {
  return String(input ?? '')
    .replace(/sk-[\w-]+/gi, '[密钥已隐藏]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [已隐藏]')
    .replace(/https?:\/\/[^\s<>]+/gi, '[链接见来源]')
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[邮箱已隐藏]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[地址已隐藏]')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .slice(0, max);
}

export function pointer(input: unknown, path: string): unknown {
  if (path === '') return input;
  if (!path.startsWith('/')) return undefined;
  let value = input;
  for (const part of path.slice(1).split('/')) {
    const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

export function normalizeSource(spec: SourceSpec, data: unknown, at: string): Observation {
  const o: Observation = {
    id: spec.id,
    title: spec.title,
    kind: spec.kind,
    observedAt: at,
    ...(spec.url ? { url: spec.url } : {}),
    status: 'ready',
    metrics: [],
    signals: [],
  };
  const add = (id: string, title: string, detail: string, critical = false) => {
    o.signals.push({
      id,
      sourceId: spec.id,
      severity: critical ? 'critical' : 'warning',
      title,
      detail: safeText(detail),
      evidenceIds: [spec.id],
      ...(critical ? { immediate: true } : {}),
    });
  };
  const metric = (id: string, label: string, value: number, extra: Partial<Metric> = {}) => {
    o.metrics.push({ id, label, value, ...extra });
  };
  const invalid = () => {
    o.status = 'invalid';
    add('invalid', '数据格式异常', '来源未通过结构校验，不能判断业务健康。');
  };
  if (!object(data)) {
    invalid();
    return o;
  }
  if (spec.kind === 'balance') {
    if (
      data.schemaVersion !== 1 ||
      typeof data.passed !== 'boolean' ||
      !count(data.plannedSamples) ||
      !count(data.returnedSamples) ||
      !count(data.simulationErrors) ||
      !Array.isArray(data.items) ||
      data.items.length > 2000 ||
      !data.items.every(
        (i: unknown) =>
          object(i) &&
          ['error', 'warning'].includes(i.severity) &&
          typeof i.category === 'string' &&
          typeof i.message === 'string',
      ) ||
      !date(data.generatedAt)
    ) {
      invalid();
      return o;
    }
    o.generatedAt = data.generatedAt;
    o.version =
      typeof data.currentHash === 'string' ? data.currentHash : (data.commit ?? 'unknown');
    o.comparisonKey = `simulation/balance/${data.plannedSamples}`;
    metric('returned', '完整模拟返回样本', data.returnedSamples);
    if (!data.passed || data.returnedSamples !== data.plannedSamples || data.simulationErrors) {
      o.status = 'failed';
      add(
        'report-failed',
        '完整平衡报告未通过',
        `返回 ${data.returnedSamples}/${data.plannedSamples}，模拟异常 ${data.simulationErrors}。请结合源版本及 Actions 原始错误判断；报告校验失败不等同于通关率下降。`,
        true,
      );
    }
    // 同类诊断用稳定身份去重；不使用会随排序变化的 diagnostic-1。
    for (const i of data.items.slice(0, 120)) {
      const identity = `${i.category}/${i.source}/${JSON.stringify(i.scope ?? {})}`;
      const id = `diagnostic-${hash(identity)}`;
      if (o.signals.some((s) => s.id === id)) continue;
      add(
        id,
        `平衡报告：${safeText(i.category, 40)}`,
        i.displayMessage ?? i.message,
        i.severity === 'error',
      );
    }
  } else if (spec.kind === 'weapons') {
    if (!validWeaponReport(data)) {
      invalid();
      return o;
    }
    o.generatedAt = data.generatedAt;
    o.version = data.sourceHash;
    o.comparisonKey = `simulation/weapons/${data.options.seeds}/${data.options.seedOffset}/${data.options.extended}`;
    if (data.state === 'failed') {
      o.status = 'failed';
      add('report-failed', '法宝测评未完成', `返回 ${data.returned}/${data.planned}。`, true);
    } else
      for (const w of data.weapons) {
        if (w.natural.n)
          metric(
            `weapon-${w.id}`,
            `${safeText(w.name, 60)}模拟通关率`,
            w.natural.wins / w.natural.n,
            { sampleSize: w.natural.n, direction: 'lower' },
          );
      }
  } else if (spec.kind === 'autoplay') {
    if (!validAutoplayReport(data)) {
      invalid();
      return o;
    }
    o.generatedAt = data.generatedAt;
    o.version = data.sourceHash;
    o.comparisonKey = 'simulation/autoplay/paired-200';
    if (data.state === 'failed') {
      o.status = 'failed';
      add('report-failed', '自动历练对照未完成', `返回 ${data.returned}/200。`, true);
    } else
      for (const row of data.rows)
        metric(`mode-${row.mode}`, `${row.mode}模拟六关连通率`, row.won / row.samples, {
          sampleSize: row.samples,
          direction: 'lower',
        });
  } else if (spec.kind === 'performance') {
    if (!validPerformanceSnapshot(data)) {
      invalid();
      return o;
    }
    o.generatedAt = data.publishedAt;
    for (const [kind, source] of Object.entries(data.sources)) {
      if (source.state !== 'ready') {
        o.status =
          source.state === 'failed' ? 'failed' : o.status === 'failed' ? 'failed' : 'unavailable';
        add(
          `source-${kind}`,
          `性能来源${source.state === 'failed' ? '失败' : '缺失'}：${kind}`,
          '当前性能来源不能判定通过。',
          source.state === 'failed',
        );
      }
      if (
        !source.generatedAt ||
        Date.parse(at) - Date.parse(source.generatedAt) > spec.maxAgeHours * 3600000
      )
        add(
          `stale-${kind}`,
          `性能来源陈旧：${kind}`,
          `未取得 ${spec.maxAgeHours} 小时内的该项数据。`,
        );
      const d = source.data as Record<string, any> | null;
      if (!d) continue;
      const key = `ci-performance/${kind}/${source.commit}`;
      if (kind === 'render')
        for (const id of ['meanFps', 'p5Fps', 'maxGapMs'])
          metric(`render-${id}`, `CI 渲染 ${id}`, d.summary[id], {
            comparisonKey: key,
            sampleSize: d.summary.samples,
            generatedAt: source.generatedAt!,
            direction: id === 'maxGapMs' ? 'higher' : 'lower',
            absoluteChange: id === 'maxGapMs' ? 50 : 10,
          });
      if (kind === 'simulation')
        for (const s of d.scenarios)
          metric(`simulation-${s.id}`, `CI 模拟 ${s.label} p95`, s.p95Ms, {
            unit: 'ms',
            comparisonKey: key,
            sampleSize: s.frames,
            generatedAt: source.generatedAt!,
            direction: 'higher',
            absoluteChange: 1,
          });
      if (Array.isArray(d.breaches) && d.breaches.length)
        add(
          `budget-${kind}`,
          `既有性能门禁超限：${kind}`,
          d.breaches.map((x: unknown) => safeText(x)).join('；'),
          true,
        );
    }
  } else if (spec.kind === 'telemetry') {
    if (!validMonitorData(data)) {
      invalid();
      return o;
    }
    o.generatedAt = data.generatedAt;
    o.comparisonKey = `players/${data.filter.days}/${data.filter.site}`;
    const rows = (key: keyof typeof data.sections) => data.sections[key].rows;
    for (const [section, value] of Object.entries(data.sections))
      if (value.error) {
        o.status = 'unavailable';
        add(
          `section-${section}`,
          `玩家统计分区不可用：${section}`,
          '后台聚合查询失败；该分区不按零计数。',
        );
      }
    const overview = rows('overview')[0];
    const sampling = overview ? Math.max(1, Number(overview.sampleMax)) : Infinity;
    const versions = rows('versions').filter((r) => Number(r.sessions) > 0);
    if (versions.length === 1) o.version = safeText(versions[0].version, 120);
    for (const v of versions) {
      const sessions = Number(v.sessions),
        errors = Number(v.errors);
      if (!sessions) continue;
      metric(
        `errors-${hash(String(v.version))}`,
        `版本 ${safeText(v.version, 70)} 每百会话错误事件`,
        (100 * errors) / sessions,
        {
          unit: 'events/100 sessions',
          sampleSize: Math.floor(sessions / sampling),
          comparisonKey: `${o.comparisonKey}/${hash(String(v.version))}`,
          alertAbove: 10,
          minSamples: 100,
          direction: 'higher',
          absoluteChange: 5,
        },
      );
    }
    // 分关结算没有版本维度；多版本窗口只展示数量，不进行胜率趋势推断。
    if (versions.length === 1)
      for (const s of rows('stages')) {
        const ends = Number(s.won) + Number(s.lost);
        if (ends)
          metric(
            `stage-${s.stage}-${s.difficulty}`,
            `真人关卡 ${Number(s.stage) + 1} 难度 ${s.difficulty} 已记录胜局占比`,
            Number(s.won) / ends,
            { sampleSize: Math.floor(ends / sampling), minSamples: 100, direction: 'lower' },
          );
      }
    if (overview) metric('sessions', '观测会话数（非真实人数）', Number(overview.sessions));
  } else if (spec.kind === 'json') {
    const generated = pointer(data, spec.generatedAtPointer ?? '/generatedAt');
    if (!date(generated)) {
      invalid();
      return o;
    }
    o.generatedAt = generated;
    const version = pointer(data, spec.versionPointer ?? '/version');
    if (typeof version === 'string') o.version = safeText(version, 200);
    o.comparisonKey = 'custom-json';
    for (const rule of spec.metricRules ?? []) {
      const value = pointer(data, rule.pointer);
      const n = rule.samplePointer ? pointer(data, rule.samplePointer) : undefined;
      if (!numeric(value) || (rule.samplePointer && !count(n))) {
        invalid();
        continue;
      }
      const { pointer: _, samplePointer: __, ...rest } = rule;
      o.metrics.push({ ...rest, value, ...(n !== undefined ? { sampleSize: n as number } : {}) });
    }
  } else {
    invalid();
    return o;
  }
  if (o.generatedAt) {
    const age = Date.parse(at) - Date.parse(o.generatedAt);
    if (age < -300000) {
      o.status = 'invalid';
      add('future', '来源时间异常', '生成时间晚于观察时刻超过五分钟。');
    }
    if (age > spec.maxAgeHours * 3600000) {
      if (o.status === 'ready') o.status = 'unavailable';
      add('stale', '来源数据陈旧', `超过 ${spec.maxAgeHours} 小时未更新。`);
    }
  }
  return o;
}

export interface CollectDependencies {
  fetch?: typeof fetch;
  env?: Record<string, string | undefined>;
  github?: (path: string) => Promise<unknown>;
}
export async function githubJson(path: string): Promise<unknown> {
  const { stdout } = await execute('gh', ['api', path], {
    timeout: 30000,
    maxBuffer: 4 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

export async function collectSource(
  spec: SourceSpec,
  at: string,
  deps: CollectDependencies = {},
): Promise<Observation> {
  const base: Observation = {
    id: spec.id,
    title: spec.title,
    kind: spec.kind,
    observedAt: at,
    status: 'unavailable',
    metrics: [],
    signals: [],
    ...(spec.url ? { url: spec.url } : {}),
  };
  const signal = (id: string, title: string, detail: string, immediate = false): Signal => ({
    id,
    sourceId: spec.id,
    severity: immediate ? 'critical' : 'warning',
    title,
    detail,
    evidenceIds: [spec.id],
    ...(immediate ? { immediate: true } : {}),
  });
  try {
    if (spec.kind === 'github') {
      const w = spec.workflow!;
      const api = deps.github ?? githubJson;
      const response = await api(
        `repos/${w.repository}/actions/workflows/${encodeURIComponent(w.path.split('/').pop()!)}/runs?branch=${encodeURIComponent(w.branch)}&per_page=30`,
      );
      if (!object(response) || !Array.isArray(response.workflow_runs)) throw new Error('schema');
      for (const run of response.workflow_runs) {
        if (
          !object(run) ||
          run.head_branch !== w.branch ||
          run.repository?.full_name !== w.repository ||
          run.head_repository?.full_name !== w.repository ||
          !['schedule', 'workflow_dispatch'].includes(run.event) ||
          run.conclusion === 'cancelled' ||
          !count(run.id) ||
          !date(run.created_at)
        )
          continue;
        if (w.job) {
          const jobs = await api(`repos/${w.repository}/actions/runs/${run.id}/jobs?per_page=100`);
          if (!object(jobs) || !Array.isArray(jobs.jobs)) throw new Error('jobs');
          const job = jobs.jobs.find((j: any) => j.name === w.job && j.conclusion !== 'skipped');
          if (!job) continue;
          // 报告发布也可能失败；整个任务结论仍需一并查看。
        }
        base.url = `https://github.com/${w.repository}/actions/runs/${run.id}`;
        base.version = String(run.head_sha);
        base.generatedAt = run.created_at;
        const hours = (Date.parse(at) - Date.parse(run.created_at)) / 3600000;
        if (run.status !== 'completed') {
          base.status = 'pending';
          if (hours > w.maxRunHours) {
            base.status = 'unavailable';
            base.signals.push(
              signal(
                'run-stuck',
                '后台任务长时间未完成',
                `已超过配置的 ${w.maxRunHours} 小时观察窗口。`,
              ),
            );
          }
          // 正在执行不是失败，也不能宣告上次失败已恢复。
          return base;
        }
        base.status = run.conclusion === 'success' ? 'ready' : 'failed';
        if (base.status === 'failed')
          base.signals.push(
            signal(
              'run-failed',
              '后台任务失败',
              `运行 ${run.id} 结论 ${safeText(run.conclusion, 30)}；请查看该任务的原始错误。`,
              true,
            ),
          );
        if (hours > spec.maxAgeHours) {
          if (base.status === 'ready') base.status = 'unavailable';
          base.signals.push(
            signal(
              'stale',
              '后台任务未按期更新',
              `最近符合条件的任务已超过 ${spec.maxAgeHours} 小时。`,
            ),
          );
        }
        return base;
      }
      base.signals.push(
        signal(
          'missing',
          '没有可用的后台任务记录',
          '最近运行中没有找到本仓库、指定分支和任务类型的证据。',
        ),
      );
      return base;
    }
    const headers: Record<string, string> = { Accept: 'application/json' };
    const env = deps.env ?? process.env;
    for (const [name, variable] of Object.entries(spec.headersEnv ?? {})) {
      if (!env[variable]) throw new Error('credential');
      headers[name] = env[variable]!;
    }
    const response = await (deps.fetch ?? fetch)(spec.url!, {
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(spec.timeoutMs ?? 20000),
    });
    if (!response.ok) throw new Error('http');
    const limit = spec.maxBytes ?? 2 * 1024 * 1024;
    if (Number(response.headers.get('content-length')) > limit || !response.body)
      throw new Error('size');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > limit) throw new Error('size');
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    return normalizeSource(spec, JSON.parse(Buffer.concat(chunks).toString('utf8')), at);
  } catch {
    base.signals.push(
      signal(
        'unavailable',
        '数据来源暂不可用',
        '请求、权限或结构检查失败；未将缺失数据视为健康，也未转存原始响应。',
      ),
    );
    return base;
  }
}
