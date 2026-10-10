export type PerformanceKind = 'render' | 'simulation' | 'size';
export type PerformanceSource = {
  state: 'ready' | 'failed' | 'unavailable';
  commit: string | null;
  runId: number | null;
  generatedAt: string | null;
  data: Record<string, unknown> | null;
  frame?: boolean;
};
export type PerformanceSnapshot = {
  schemaVersion: 1;
  publishedAt: string;
  sources: Record<PerformanceKind, PerformanceSource>;
};
const record = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === 'object' && !Array.isArray(x);
const numeric = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x >= 0;
const date = (x: unknown): x is string => typeof x === 'string' && Number.isFinite(Date.parse(x));
const fields = (input: Record<string, unknown>, keys: readonly string[]) =>
  Object.fromEntries(keys.map((key) => [key, input[key]]));

// 只发布监控使用的字段；CI 的完整 JSON 和截图仍保存在 artifact，不进入 Git。
export function performanceData(
  kind: PerformanceKind,
  input: unknown,
): Record<string, unknown> | null {
  if (!record(input) || !date(input.generatedAt)) return null;
  if (kind === 'render') {
    const s = input.summary;
    if (
      !record(s) ||
      !['samples', 'meanFps', 'p5Fps', 'maxGapMs', 'longTasks'].every((k) => numeric(s[k])) ||
      !Number.isInteger(s.samples) ||
      Number(s.samples) <= 0 ||
      !Number.isInteger(s.longTasks) ||
      !(numeric(s.longestTaskMs) || (s.longestTaskMs === null && s.longTasks === 0))
    )
      return null;
    return {
      summary: fields(s, ['samples', 'meanFps', 'p5Fps', 'maxGapMs', 'longTasks', 'longestTaskMs']),
    };
  }
  if (kind === 'simulation') {
    if (
      !record(input.budget) ||
      !numeric(input.budget.p95Ms) ||
      !numeric(input.budget.maxMs) ||
      !Array.isArray(input.scenarios) ||
      input.scenarios.length !== 3 ||
      !Array.isArray(input.breaches) ||
      !input.breaches.every((s) => typeof s === 'string')
    )
      return null;
    const keys = [
      'frames',
      'simSeconds',
      'meanMs',
      'p50Ms',
      'p95Ms',
      'maxMs',
      'enemyPeak',
      'shotPeak',
    ];
    if (
      !input.scenarios.every(
        (s) => record(s) && typeof s.label === 'string' && keys.every((k) => numeric(s[k])),
      )
    )
      return null;
    return {
      scenarios: input.scenarios.map((s) =>
        fields(s as Record<string, unknown>, ['label', ...keys]),
      ),
      budget: fields(input.budget, ['p95Ms', 'maxMs']),
      breaches: input.breaches,
    };
  }
  const keys = ['jsBytes', 'jsGzip', 'cssBytes', 'cssGzip'];
  if (
    !record(input.budget) ||
    !record(input.measure) ||
    !keys.every(
      (k) =>
        numeric((input.budget as Record<string, unknown>)[k]) &&
        numeric((input.measure as Record<string, unknown>)[k]),
    ) ||
    !Array.isArray(input.breaches) ||
    !input.breaches.every((s) => typeof s === 'string')
  )
    return null;
  return {
    budget: fields(input.budget, keys),
    measure: fields(input.measure, keys),
    breaches: input.breaches,
  };
}

export function performanceSource(
  kind: PerformanceKind,
  input: unknown,
  commit: string | null,
  runId: number | null,
): PerformanceSource {
  const data = performanceData(kind, input);
  if (data)
    return {
      state: kind === 'render' || (data.breaches as string[]).length === 0 ? 'ready' : 'failed',
      commit,
      runId,
      generatedAt: (input as Record<string, unknown>).generatedAt as string,
      data,
    };
  return {
    state: record(input) && typeof input.error === 'string' ? 'failed' : 'unavailable',
    commit,
    runId,
    generatedAt: record(input) && date(input.generatedAt) ? input.generatedAt : null,
    data: null,
  };
}
export function validPerformanceSnapshot(input: unknown): input is PerformanceSnapshot {
  if (
    !record(input) ||
    input.schemaVersion !== 1 ||
    !date(input.publishedAt) ||
    !record(input.sources)
  )
    return false;
  return (['render', 'simulation', 'size'] as const).every((kind) => {
    const s = (input.sources as Record<string, unknown>)[kind];
    if (
      !record(s) ||
      !['ready', 'failed', 'unavailable'].includes(String(s.state)) ||
      !(s.commit === null || (typeof s.commit === 'string' && /^[a-f0-9]{40}$/.test(s.commit))) ||
      !(
        s.runId === null ||
        (numeric(s.runId) && Number.isSafeInteger(s.runId) && Number(s.runId) > 0)
      ) ||
      !(s.generatedAt === null || date(s.generatedAt)) ||
      (s.frame !== undefined && typeof s.frame !== 'boolean')
    )
      return false;
    if (s.data === null) return s.state !== 'ready';
    const data = performanceData(kind, { ...(s.data as object), generatedAt: s.generatedAt });
    if (!data) return false;
    return (
      s.state ===
      (kind === 'render' || (data.breaches as string[]).length === 0 ? 'ready' : 'failed')
    );
  });
}
