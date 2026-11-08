// 公开巡检协议：仅含安全投影，不包含私有state/history、凭据或原始证据。
export const OBSERVER_REPORT_URL =
  'https://chenxuan520.github.io/qinglan-xiuxian/monitor/observer.json';

export interface ObserverReport {
  schemaVersion: 1;
  checkedAt: string;
  commit: string;
  runId: number;
  state: 'healthy' | 'attention' | 'incomplete' | 'pending';
  summary: string;
  counts: {
    sources: number;
    new: number;
    current: number;
    recovered: number;
    unresolved: number;
    pending: number;
  };
  analysis: {
    engine: string;
    model: string;
    status: 'complete' | 'skipped' | 'failed' | 'unavailable';
    verificationOnly: boolean;
    summary: string;
    error?: string;
    diagnostics?: { stage: string; elapsedMs: number; httpStatus?: number };
  };
  sources: {
    id: string;
    title: string;
    status: 'ready' | 'pending' | 'failed' | 'unavailable' | 'invalid';
    url?: string;
    version?: string;
    generatedAt?: string;
  }[];
  items: {
    sourceId: string;
    title: string;
    detail: string;
    severity: 'warning' | 'critical';
    status: 'new' | 'existing' | 'candidate' | 'recovered';
    assessment?: string;
    nextSteps?: string[];
  }[];
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function fields(value: Record<string, unknown>, allowed: string[]) {
  return Object.keys(value).every((name) => allowed.includes(name));
}
function count(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 1000000;
}
function text(value: unknown, max: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= max &&
    !/[\x00-\x1f\x7f<>]/.test(value) &&
    !/\b(?:Bearer|Basic)\s+\S+|\b(?:sk-[\w-]+|gh[pousr]_[\w]+|github_pat_[\w]+)|\beyJ[\w-]+\.[\w-]+\.[\w-]+/i.test(
      value,
    ) &&
    !/\b[A-Z][A-Z0-9_]*(?:API_KEY|SECRET|TOKEN)\b/.test(value) &&
    !/(?:authorization|cookie|api[_-]?key|access[_-]?token|password|secret)["']?\s*[:=]/i.test(
      value,
    )
  );
}
function identity(value: unknown) {
  return text(value, 160) && /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value);
}
function time(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value))
    return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 19) === value.slice(0, 19);
}
export function validObserverReportUrl(value: unknown) {
  if (!text(value, 2048)) return false;
  try {
    const parsed = new URL(value);
    const publicStats =
      parsed.hostname === 'qinglan-npc-ai.011203.xyz' && parsed.pathname === '/monitor/stats';
    const query = [...parsed.searchParams.entries()];
    const safeQuery =
      publicStats &&
      new Set(query.map(([key]) => key)).size === query.length &&
      query.every(([key, value]) =>
        key === 'days'
          ? ['1', '7', '30', '90'].includes(value)
          : key === 'site' && ['all', 'main', 'pages'].includes(value),
      );
    return (
      parsed.protocol === 'https:' &&
      !parsed.username &&
      !parsed.password &&
      (!parsed.search || safeQuery) &&
      !parsed.hash &&
      parsed.hostname !== 'localhost' &&
      !/^(?:\d+\.){3}\d+$|^\[/.test(parsed.hostname) &&
      text(decodeURIComponent(parsed.pathname), 2048)
    );
  } catch {
    return false;
  }
}

export function validObserverReport(input: unknown): input is ObserverReport {
  if (
    !record(input) ||
    !fields(input, [
      'schemaVersion',
      'checkedAt',
      'commit',
      'runId',
      'state',
      'summary',
      'counts',
      'analysis',
      'sources',
      'items',
    ])
  )
    return false;
  const v = input;
  if (
    v.schemaVersion !== 1 ||
    !time(v.checkedAt) ||
    typeof v.commit !== 'string' ||
    !/^[a-f0-9]{40}$/.test(v.commit) ||
    !Number.isSafeInteger(v.runId) ||
    (v.runId as number) <= 0 ||
    !['healthy', 'attention', 'incomplete', 'pending'].includes(v.state as string) ||
    !text(v.summary, 600)
  )
    return false;
  const c = v.counts;
  if (
    !record(c) ||
    Object.keys(c).length !== 6 ||
    !fields(c, ['sources', 'new', 'current', 'recovered', 'unresolved', 'pending']) ||
    !Object.values(c).every(count)
  )
    return false;
  const a = v.analysis;
  if (
    !record(a) ||
    !fields(a, [
      'engine',
      'model',
      'status',
      'verificationOnly',
      'summary',
      'error',
      'diagnostics',
    ]) ||
    !identity(a.engine) ||
    !identity(a.model) ||
    !['complete', 'skipped', 'failed', 'unavailable'].includes(a.status as string) ||
    typeof a.verificationOnly !== 'boolean' ||
    !text(a.summary, 400) ||
    (a.error !== undefined && !text(a.error, 240))
  )
    return false;
  if (a.diagnostics !== undefined) {
    const d = a.diagnostics;
    if (
      !record(d) ||
      !fields(d, ['stage', 'elapsedMs', 'httpStatus']) ||
      !identity(d.stage) ||
      !Number.isSafeInteger(d.elapsedMs) ||
      (d.elapsedMs as number) < 0 ||
      (d.elapsedMs as number) > 3600000 ||
      (d.httpStatus !== undefined &&
        (!Number.isSafeInteger(d.httpStatus) ||
          (d.httpStatus as number) < 100 ||
          (d.httpStatus as number) > 599))
    )
      return false;
  }
  if (
    !Array.isArray(v.sources) ||
    v.sources.length > 1000 ||
    c.sources !== v.sources.length ||
    !Array.isArray(v.items) ||
    v.items.length > 2000 ||
    (c.new as number) > (c.current as number) ||
    (c.pending as number) > v.sources.length
  )
    return false;
  const ids = new Set<string>();
  for (const source of v.sources) {
    if (
      !record(source) ||
      !fields(source, ['id', 'title', 'status', 'url', 'version', 'generatedAt']) ||
      !identity(source.id) ||
      ids.has(source.id as string) ||
      !text(source.title, 120) ||
      !['ready', 'pending', 'failed', 'unavailable', 'invalid'].includes(source.status as string) ||
      (source.url !== undefined && !validObserverReportUrl(source.url)) ||
      (source.version !== undefined && !text(source.version, 160)) ||
      (source.generatedAt !== undefined && !time(source.generatedAt))
    )
      return false;
    ids.add(source.id as string);
  }
  for (const item of v.items) {
    if (
      !record(item) ||
      !fields(item, [
        'sourceId',
        'title',
        'detail',
        'severity',
        'status',
        'assessment',
        'nextSteps',
      ]) ||
      !identity(item.sourceId) ||
      !text(item.title, 160) ||
      !text(item.detail, 600) ||
      !['warning', 'critical'].includes(item.severity as string) ||
      !['new', 'existing', 'candidate', 'recovered'].includes(item.status as string) ||
      (item.assessment !== undefined && !text(item.assessment, 160)) ||
      (item.nextSteps !== undefined &&
        (!Array.isArray(item.nextSteps) ||
          item.nextSteps.length > 4 ||
          !item.nextSteps.every((step) => text(step, 240))))
    )
      return false;
  }
  if (v.sources.filter((source) => source.status === 'pending').length !== c.pending) return false;
  if (
    v.items.filter((item) => item.status === 'new').length !== c.new ||
    v.items.filter((item) => item.status === 'recovered').length !== c.recovered
  )
    return false;
  return (
    v.state !== 'healthy' ||
    (!(c.new || c.current || c.unresolved || c.pending) &&
      ['complete', 'skipped'].includes(a.status as string) &&
      v.sources.every((source) => source.status === 'ready'))
  );
}
