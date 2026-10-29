export type PerformanceKind = 'render' | 'simulation' | 'size';
export type PerformanceSource = {
  state: 'ready' | 'failed' | 'unavailable';
  commit: string | null;
  runId: number | null;
  generatedAt: string | null;
  data: Record<string, unknown> | null;
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
const simulationIds = ['sixth-late', 'final-trial', 'sixth-boss', 'final-trial-late'];
const legacySimulationLabels = new Map([
  ['第六境后期 · 满配', 'sixth-late'],
  ['第七境 · 满配逢妖王', 'final-trial'],
  ['第六境妖王弹幕 · 满配', 'sixth-boss'],
]);

// 只发布监控使用的字段；CI 的完整数值报告保存在 artifact，不进入 Git。
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
      !(numeric(s.longestTaskMs) || (s.longestTaskMs === null && s.longTasks === 0)) ||
      !(
        s.meanFpsMethod === undefined ||
        ['interval-count-over-total-ms', 'legacy-mean-of-instant-fps'].includes(
          String(s.meanFpsMethod),
        )
      )
    )
      return null;
    return {
      summary: {
        ...fields(s, ['samples', 'meanFps', 'p5Fps', 'maxGapMs', 'longTasks', 'longestTaskMs']),
        meanFpsMethod: s.meanFpsMethod ?? 'legacy-mean-of-instant-fps',
      },
    };
  }
  if (kind === 'simulation') {
    if (
      !record(input.budget) ||
      !numeric(input.budget.p95Ms) ||
      !numeric(input.budget.maxMs) ||
      !Array.isArray(input.scenarios) ||
      ![3, 4].includes(input.scenarios.length) ||
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
    const extendedKeys = [
      'startTime',
      'endTime',
      'attemptedSteps',
      'stalledSteps',
      'zonePeak',
      'effectPeak',
      'pickupPeak',
      'bossPeak',
      'finalBossFrames',
    ];
    const extended = input.scenarios.length === 4;
    const failed = input.breaches.length > 0;
    const legacy =
      !extended &&
      input.scenarios.every((scenario) => record(scenario) && scenario.id === undefined);
    const ids = new Set<string>();
    if (
      !input.scenarios.every((s) => {
        if (
          !record(s) ||
          typeof s.label !== 'string' ||
          !s.label.length ||
          s.label.length > 120 ||
          !keys.every((key) => numeric(s[key])) ||
          !['frames', 'enemyPeak', 'shotPeak'].every((key) => Number.isSafeInteger(s[key])) ||
          Number(s.frames) <= 0 ||
          Number(s.simSeconds) <= 0 ||
          Number(s.p50Ms) > Number(s.p95Ms) ||
          Number(s.p95Ms) > Number(s.maxMs) ||
          Number(s.meanMs) > Number(s.maxMs) ||
          Math.abs(Number(s.simSeconds) - Number(s.frames) / 30) > 1e-6
        )
          return false;
        const id = legacy ? legacySimulationLabels.get(s.label) : s.id;
        if (
          typeof id !== 'string' ||
          !simulationIds.slice(0, extended ? 4 : 3).includes(id) ||
          ids.has(id)
        )
          return false;
        ids.add(id);
        if (!extended) return true;
        if (
          !extendedKeys.every((key) => numeric(s[key])) ||
          !extendedKeys.slice(2).every((key) => Number.isSafeInteger(s[key])) ||
          Number(s.endTime) < Number(s.startTime) ||
          !['playing', 'won', 'lost', 'paused', 'upgrade'].includes(String(s.endState)) ||
          Number(s.finalBossFrames) > Number(s.frames)
        )
          return false;
        // 失败报告仍展示实际覆盖与门禁原因；不能把空更新或缺失仙尊标为成功。
        if (failed) return true;
        return (
          Number(s.attemptedSteps) === Number(s.frames) &&
          s.stalledSteps === 0 &&
          Math.abs(Number(s.endTime) - Number(s.startTime) - Number(s.simSeconds)) < 1e-6 &&
          (id !== 'final-trial-late' ||
            (Number(s.startTime) >= 300 - 1e-6 &&
              Number(s.endTime) >= 330 &&
              Number(s.finalBossFrames) > 0))
        );
      })
    )
      return null;
    return {
      scenarios: input.scenarios.map((s) => ({
        id: legacy ? legacySimulationLabels.get(s.label) : s.id,
        ...fields(s, ['label', ...keys, ...(extended ? [...extendedKeys, 'endState'] : [])]),
      })),
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
      !(s.generatedAt === null || date(s.generatedAt))
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
