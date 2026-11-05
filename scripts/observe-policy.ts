import type {
  Decision,
  Incident,
  Metric,
  Observation,
  ObserverConfig,
  ObserverState,
  Signal,
  Snapshot,
} from './observe-types.ts';

// 这些是输入/存储容量边界，不是游戏验收门槛；实际策略全部由配置传入。
const LIMITS = {
  sources: 64,
  metrics: 256,
  signals: 1024,
  history: 1000,
  incidents: 16384,
  hours: 8760,
  samples: 1e9,
  threshold: 1e15,
  confirmations: 100,
} as const;
type Fields = Record<string, unknown>;
type Policy = ObserverConfig['policy'];

function requireValue(condition: unknown, path: string): asserts condition {
  if (!condition) throw new Error(`观察器数据无效：${path}`);
}

function object(raw: unknown, path: string): Fields {
  requireValue(raw !== null && typeof raw === 'object' && !Array.isArray(raw), path);
  const prototype = Object.getPrototypeOf(raw);
  requireValue(prototype === Object.prototype || prototype === null, path);
  return raw as Fields;
}

function shape(raw: unknown, path: string, required: string[], optional: string[] = []): Fields {
  const value = object(raw, path);
  const keys = new Set([...required, ...optional]);
  requireValue(
    Object.keys(value).every((key) => keys.has(key)),
    `${path}.fields`,
  );
  requireValue(
    required.every((key) => Object.hasOwn(value, key)),
    `${path}.required`,
  );
  return value;
}

function string(raw: unknown, path: string, max = 4096, empty = false): string {
  requireValue(typeof raw === 'string' && raw.length <= max && (empty || raw.trim().length), path);
  return raw;
}

function id(raw: unknown, path: string, max = 256): string {
  const value = string(raw, path, max);
  requireValue(!/[\u0000-\u001f\u007f]/u.test(value), path);
  return value;
}

function number(raw: unknown, path: string, min: number, max: number, integer = false): number {
  requireValue(
    typeof raw === 'number' &&
      Number.isFinite(raw) &&
      raw >= min &&
      raw <= max &&
      (!integer || Number.isSafeInteger(raw)),
    path,
  );
  return raw;
}

function positive(raw: unknown, path: string, max: number): number {
  const result = number(raw, path, 0, max);
  requireValue(result > 0, path);
  return result;
}

function choice<T extends string>(raw: unknown, path: string, values: readonly T[]): T {
  requireValue(values.includes(raw as T), path);
  return raw as T;
}

function array(raw: unknown, path: string, max: number): unknown[] {
  requireValue(Array.isArray(raw) && raw.length <= max, path);
  // JSON 数组不会有空洞；手工构造的输入也不能靠空洞跳过校验。
  requireValue(
    Array.from(raw.keys()).every((index) => Object.hasOwn(raw, index)),
    path,
  );
  return raw;
}

function unique(values: string[], path: string) {
  requireValue(new Set(values).size === values.length, `${path}.duplicate`);
}

function timestamp(raw: unknown, path: string): string {
  const value = string(raw, path, 64);
  requireValue(
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value) &&
      Number.isFinite(Date.parse(value)),
    path,
  );
  const day = value.slice(0, 10);
  requireValue(new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day, path);
  return value;
}

function url(raw: unknown, path: string): string {
  const value = string(raw, path);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`观察器数据无效：${path}`);
  }
  requireValue(
    !parsed.username &&
      !parsed.password &&
      !parsed.hash &&
      (parsed.protocol === 'https:' ||
        (parsed.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname))),
    path,
  );
  return value;
}

function envName(raw: unknown, path: string): string {
  const value = string(raw, path, 256);
  requireValue(/^[A-Za-z_][A-Za-z0-9_]*$/.test(value), path);
  return value;
}

function pointer(raw: unknown, path: string): string {
  const value = string(raw, path, 4096, true);
  requireValue((value === '' || value.startsWith('/')) && !/~(?:[^01]|$)/.test(value), path);
  return value;
}

const metricFields = [
  'unit',
  'generatedAt',
  'comparisonKey',
  'direction',
  'alertAbove',
  'alertBelow',
  'relativeChange',
  'absoluteChange',
  'minSamples',
];

function metric(raw: unknown, path: string, rule = false): Fields {
  const value = shape(
    raw,
    path,
    ['id', 'label', rule ? 'pointer' : 'value'],
    [...metricFields, rule ? 'samplePointer' : 'sampleSize'],
  );
  id(value.id, `${path}.id`);
  string(value.label, `${path}.label`, 512);
  if (Object.hasOwn(value, 'generatedAt')) timestamp(value.generatedAt, `${path}.generatedAt`);
  for (const key of ['unit', 'comparisonKey'])
    if (Object.hasOwn(value, key)) string(value[key], `${path}.${key}`, 512);
  if (Object.hasOwn(value, 'direction'))
    choice(value.direction, `${path}.direction`, ['higher', 'lower']);
  for (const key of ['alertAbove', 'alertBelow'])
    if (Object.hasOwn(value, key))
      number(value[key], `${path}.${key}`, -LIMITS.threshold, LIMITS.threshold);
  if (value.alertAbove !== undefined && value.alertBelow !== undefined)
    requireValue((value.alertBelow as number) < (value.alertAbove as number), `${path}.alertRange`);
  if (Object.hasOwn(value, 'relativeChange'))
    positive(value.relativeChange, `${path}.relativeChange`, 100);
  if (Object.hasOwn(value, 'absoluteChange'))
    positive(value.absoluteChange, `${path}.absoluteChange`, LIMITS.threshold);
  if (Object.hasOwn(value, 'minSamples'))
    number(value.minSamples, `${path}.minSamples`, 1, LIMITS.samples, true);
  if (rule) {
    pointer(value.pointer, `${path}.pointer`);
    if (Object.hasOwn(value, 'samplePointer'))
      pointer(value.samplePointer, `${path}.samplePointer`);
  } else {
    number(value.value, `${path}.value`, -Number.MAX_VALUE, Number.MAX_VALUE);
    if (Object.hasOwn(value, 'sampleSize'))
      number(value.sampleSize, `${path}.sampleSize`, 0, LIMITS.samples, true);
  }
  return { ...value };
}

function policy(raw: unknown): Policy {
  const value = shape(raw, 'policy', [
    'confirmations',
    'historyLimit',
    'maxHistoryHours',
    'baselineSamples',
    'relativeChange',
    'absoluteChange',
    'minMetricSamples',
  ]);
  number(value.confirmations, 'policy.confirmations', 1, LIMITS.confirmations, true);
  number(value.historyLimit, 'policy.historyLimit', 1, LIMITS.history, true);
  positive(value.maxHistoryHours, 'policy.maxHistoryHours', LIMITS.hours);
  number(value.baselineSamples, 'policy.baselineSamples', 1, value.historyLimit as number, true);
  positive(value.relativeChange, 'policy.relativeChange', 100);
  positive(value.absoluteChange, 'policy.absoluteChange', LIMITS.threshold);
  number(value.minMetricSamples, 'policy.minMetricSamples', 1, LIMITS.samples, true);
  return { ...value } as Policy;
}

export function parseObserverConfig(raw: unknown): ObserverConfig {
  const value = shape(raw, 'config', ['schemaVersion', 'sources', 'policy', 'analysis']);
  requireValue(value.schemaVersion === 1, 'config.schemaVersion');
  const sources = array(value.sources, 'sources', LIMITS.sources).map((raw, index) => {
    const path = `sources[${index}]`;
    const source = shape(
      raw,
      path,
      ['id', 'title', 'kind', 'maxAgeHours'],
      [
        'url',
        'timeoutMs',
        'maxBytes',
        'headersEnv',
        'generatedAtPointer',
        'versionPointer',
        'metricRules',
        'workflow',
      ],
    );
    id(source.id, `${path}.id`);
    string(source.title, `${path}.title`, 512);
    choice(source.kind, `${path}.kind`, [
      'balance',
      'performance',
      'weapons',
      'autoplay',
      'telemetry',
      'github',
      'json',
    ]);
    positive(source.maxAgeHours, `${path}.maxAgeHours`, LIMITS.hours);
    if (Object.hasOwn(source, 'url')) url(source.url, `${path}.url`);
    if (Object.hasOwn(source, 'timeoutMs'))
      number(source.timeoutMs, `${path}.timeoutMs`, 1, 300000, true);
    if (Object.hasOwn(source, 'maxBytes'))
      number(source.maxBytes, `${path}.maxBytes`, 1, 32 * 1024 * 1024, true);
    if (Object.hasOwn(source, 'headersEnv')) {
      const headers = object(source.headersEnv, `${path}.headersEnv`);
      requireValue(Object.keys(headers).length <= 32, `${path}.headersEnv.length`);
      for (const [key, entry] of Object.entries(headers)) {
        requireValue(/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}$/.test(key), `${path}.headersEnv.header`);
        envName(entry, `${path}.headersEnv.${key}`);
      }
      unique(
        Object.keys(headers).map((key) => key.toLowerCase()),
        `${path}.headersEnv`,
      );
    }
    for (const key of ['generatedAtPointer', 'versionPointer'])
      if (Object.hasOwn(source, key)) pointer(source[key], `${path}.${key}`);
    if (Object.hasOwn(source, 'metricRules')) {
      const rules = array(source.metricRules, `${path}.metricRules`, LIMITS.metrics).map((raw, i) =>
        metric(raw, `${path}.metricRules[${i}]`, true),
      );
      unique(
        rules.map((rule) => rule.id as string),
        `${path}.metricRules`,
      );
    }
    if (Object.hasOwn(source, 'workflow')) {
      const workflow = shape(
        source.workflow,
        `${path}.workflow`,
        ['repository', 'path', 'branch', 'maxRunHours'],
        ['job'],
      );
      requireValue(
        typeof workflow.repository === 'string' &&
          /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(workflow.repository),
        `${path}.workflow.repository`,
      );
      const workflowPath = string(workflow.path, `${path}.workflow.path`, 512);
      requireValue(
        !workflowPath.startsWith('/') &&
          !workflowPath.split('/').some((part) => part === '..' || !part),
        `${path}.workflow.path`,
      );
      string(workflow.branch, `${path}.workflow.branch`, 256);
      if (Object.hasOwn(workflow, 'job')) string(workflow.job, `${path}.workflow.job`, 256);
      positive(workflow.maxRunHours, `${path}.workflow.maxRunHours`, LIMITS.hours);
    }
    requireValue(
      source.url !== undefined || (source.kind === 'github' && source.workflow !== undefined),
      `${path}.url`,
    );
    return source;
  });
  requireValue(sources.length > 0, 'sources.length');
  unique(
    sources.map((source) => source.id as string),
    'sources',
  );
  policy(value.policy);
  const analysis = shape(value.analysis, 'analysis', [
    'engine',
    'model',
    'baseUrl',
    'protocol',
    'apiKeyEnv',
    'timeoutMs',
    'maxInputChars',
    'maxOutputTokens',
  ]);
  choice(analysis.engine, 'analysis.engine', ['pi', 'openai', 'none']);
  choice(analysis.protocol, 'analysis.protocol', ['responses', 'chat-completions', 'decisions']);
  string(analysis.model, 'analysis.model', 256);
  url(analysis.baseUrl, 'analysis.baseUrl');
  envName(analysis.apiKeyEnv, 'analysis.apiKeyEnv');
  number(analysis.timeoutMs, 'analysis.timeoutMs', 1, 300000, true);
  number(analysis.maxInputChars, 'analysis.maxInputChars', 1, 1000000, true);
  number(analysis.maxOutputTokens, 'analysis.maxOutputTokens', 1, 65536, true);
  // 不补隐式默认值，也不保留调用方可在校验后改写的引用。
  return structuredClone(value) as unknown as ObserverConfig;
}

export function emptyObserverState(): ObserverState {
  return { schemaVersion: 1, history: [], incidents: {} };
}

function signal(raw: unknown, path: string): Signal {
  const value = shape(
    raw,
    path,
    ['id', 'sourceId', 'severity', 'title', 'detail', 'evidenceIds'],
    ['immediate'],
  );
  id(value.id, `${path}.id`, 1024);
  id(value.sourceId, `${path}.sourceId`);
  choice(value.severity, `${path}.severity`, ['warning', 'critical']);
  string(value.title, `${path}.title`, 1536);
  string(value.detail, `${path}.detail`, 16384, true);
  const evidenceIds = array(value.evidenceIds, `${path}.evidenceIds`, 256).map((entry) =>
    id(entry, `${path}.evidenceIds`),
  );
  unique(evidenceIds, `${path}.evidenceIds`);
  if (Object.hasOwn(value, 'immediate'))
    requireValue(typeof value.immediate === 'boolean', `${path}.immediate`);
  return { ...value, evidenceIds } as unknown as Signal;
}

function signalKey(value: Signal): string {
  return JSON.stringify([value.sourceId, value.id]);
}

function derivedSignal(source: Observation, suffix: string, title: string, detail: string): Signal {
  return {
    id: `${source.id}:${suffix}`,
    sourceId: source.id,
    severity: 'warning',
    title,
    detail,
    evidenceIds: [source.id],
  };
}

function snapshot(raw: unknown, tolerateInvalidMetrics = false): Snapshot {
  const value = shape(raw, 'snapshot', ['schemaVersion', 'at', 'observations']);
  requireValue(value.schemaVersion === 1, 'snapshot.schemaVersion');
  timestamp(value.at, 'snapshot.at');
  const observations = array(value.observations, 'snapshot.observations', LIMITS.sources).map(
    (raw, index) => {
      const path = `snapshot.observations[${index}]`;
      const source = shape(
        raw,
        path,
        ['id', 'title', 'kind', 'observedAt', 'status', 'metrics', 'signals'],
        ['url', 'generatedAt', 'version', 'comparisonKey'],
      );
      id(source.id, `${path}.id`);
      string(source.title, `${path}.title`, 512);
      string(source.kind, `${path}.kind`, 256);
      timestamp(source.observedAt, `${path}.observedAt`);
      if (Object.hasOwn(source, 'url')) url(source.url, `${path}.url`);
      if (Object.hasOwn(source, 'generatedAt'))
        timestamp(source.generatedAt, `${path}.generatedAt`);
      for (const key of ['version', 'comparisonKey'])
        if (Object.hasOwn(source, key)) string(source[key], `${path}.${key}`, 512);
      choice(source.status, `${path}.status`, [
        'ready',
        'pending',
        'failed',
        'unavailable',
        'invalid',
      ]);
      const signals = array(source.signals, `${path}.signals`, LIMITS.signals).map((raw, i) =>
        signal(raw, `${path}.signals[${i}]`),
      );
      requireValue(
        signals.every((entry) => entry.sourceId === source.id),
        `${path}.signals.sourceId`,
      );
      const result = { ...source, signals, metrics: [] } as unknown as Observation;
      for (const [i, rawMetric] of array(
        source.metrics,
        `${path}.metrics`,
        LIMITS.metrics,
      ).entries()) {
        try {
          result.metrics.push(metric(rawMetric, `${path}.metrics[${i}]`) as unknown as Metric);
        } catch (error) {
          if (!tolerateInvalidMetrics) throw error;
          result.status = 'invalid';
          // 不把 NaN/Infinity 写回 JSON 历史；保留明确的数据无效证据。
          if (!signals.some((entry) => entry.id === `${result.id}:invalid-metrics`))
            signals.push(
              derivedSignal(
                result,
                'invalid-metrics',
                `${result.title}指标无效`,
                '指标数值、样本数或规则不合法，本次不能确认恢复。',
              ),
            );
        }
      }
      unique(
        result.metrics.map((entry) => entry.id),
        `${path}.metrics`,
      );
      unique(
        signals.map((entry) => entry.id),
        `${path}.signals`,
      );
      requireValue(signals.length <= LIMITS.signals, `${path}.signals.length`);
      return result;
    },
  );
  unique(
    observations.map((entry) => entry.id),
    'snapshot.observations',
  );
  return { schemaVersion: 1, at: value.at as string, observations };
}

export function validateObserverState(raw: unknown): ObserverState {
  const value = shape(raw, 'state', ['schemaVersion', 'history', 'incidents']);
  requireValue(value.schemaVersion === 1, 'state.schemaVersion');
  const history = array(value.history, 'state.history', LIMITS.history).map((raw) => snapshot(raw));
  requireValue(
    history.every(
      (entry, index) => index === 0 || Date.parse(entry.at) > Date.parse(history[index - 1].at),
    ),
    'state.history.order',
  );
  const entries = object(value.incidents, 'state.incidents');
  requireValue(Object.keys(entries).length <= LIMITS.incidents, 'state.incidents.length');
  const incidents: Record<string, Incident> = {};
  for (const raw of Object.values(entries)) {
    const item = shape(
      raw,
      'state.incident',
      ['signal', 'firstSeen', 'lastSeen', 'confirmations'],
      ['notifiedAt', 'resolvedAt'],
    );
    const parsedSignal = signal(item.signal, 'state.incident.signal');
    timestamp(item.firstSeen, 'state.incident.firstSeen');
    timestamp(item.lastSeen, 'state.incident.lastSeen');
    const first = Date.parse(item.firstSeen as string),
      last = Date.parse(item.lastSeen as string);
    requireValue(first <= last, 'state.incident.order');
    number(item.confirmations, 'state.incident.confirmations', 1, LIMITS.confirmations, true);
    if (Object.hasOwn(item, 'notifiedAt')) {
      timestamp(item.notifiedAt, 'state.incident.notifiedAt');
      requireValue(
        Date.parse(item.notifiedAt as string) >= first &&
          Date.parse(item.notifiedAt as string) <= last,
        'state.incident.notifiedAt.order',
      );
    }
    if (Object.hasOwn(item, 'resolvedAt')) {
      timestamp(item.resolvedAt, 'state.incident.resolvedAt');
      requireValue(
        Date.parse(item.resolvedAt as string) >= last,
        'state.incident.resolvedAt.order',
      );
    }
    const key = signalKey(parsedSignal);
    requireValue(!Object.hasOwn(incidents, key), 'state.incidents.duplicate');
    incidents[key] = { ...item, signal: parsedSignal } as unknown as Incident;
  }
  return { schemaVersion: 1, history, incidents };
}

function comparable(source: Observation, value: Metric): string | undefined {
  const key = value.comparisonKey ?? source.comparisonKey;
  if (key === undefined && source.version === undefined) return undefined;
  return JSON.stringify([source.id, value.id, key, source.version, value.unit, value.direction]);
}

function generation(source: Observation): number {
  return Date.parse(source.generatedAt ?? source.observedAt);
}

function metricGeneration(source: Observation, value: Metric): number {
  return value.generatedAt === undefined ? generation(source) : Date.parse(value.generatedAt);
}

function enoughSamples(value: Metric, minimum: number): boolean {
  return (
    value.sampleSize !== undefined && value.sampleSize >= Math.max(minimum, value.minSamples ?? 0)
  );
}

function metricSignals(
  source: Observation,
  history: Snapshot[],
  rules: Policy,
  checked: Set<string>,
): Signal[] {
  if (source.status !== 'ready') return [];
  const result: Signal[] = [];
  for (const value of source.metrics) {
    const boundSamplesReady =
      value.minSamples === undefined || enoughSamples(value, value.minSamples);
    for (const [bound, exceeds] of [
      ['alertAbove', value.alertAbove !== undefined && value.value > value.alertAbove],
      ['alertBelow', value.alertBelow !== undefined && value.value < value.alertBelow],
    ] as const) {
      if (!boundSamplesReady) continue;
      if (value[bound] !== undefined)
        checked.add(signalKey(derivedSignal(source, `metric:${value.id}:${bound}`, '', '')));
      if (exceeds)
        result.push(
          derivedSignal(
            source,
            `metric:${value.id}:${bound}`,
            `${source.title}：${value.label}越界`,
            `${value.label}=${value.value}，${bound}=${value[bound]}。`,
          ),
        );
    }
    const key = comparable(source, value);
    if (!key || !value.direction || !enoughSamples(value, rules.minMetricSamples)) continue;
    const samples: number[] = [];
    const currentGeneration = metricGeneration(source, value);
    const seen = new Set<number>([currentGeneration]);
    for (const entry of [...history].reverse()) {
      const oldSource = entry.observations.find((item) => item.id === source.id);
      if (!oldSource || oldSource.status !== 'ready' || oldSource.signals.length > 0) continue;
      const oldMetric = oldSource.metrics.find((item) => item.id === value.id);
      if (
        !oldMetric ||
        comparable(oldSource, oldMetric) !== key ||
        !enoughSamples(oldMetric, Math.max(rules.minMetricSamples, value.minSamples ?? 0))
      )
        continue;
      const oldGeneration = metricGeneration(oldSource, oldMetric);
      if (oldGeneration >= currentGeneration || seen.has(oldGeneration)) continue;
      seen.add(oldGeneration);
      samples.push(oldMetric.value);
      if (samples.length === rules.baselineSamples) break;
    }
    if (samples.length < rules.baselineSamples) continue;
    checked.add(signalKey(derivedSignal(source, `metric:${value.id}:trend`, '', '')));
    samples.sort((a, b) => a - b);
    const middle = Math.floor(samples.length / 2);
    const baseline =
      samples.length % 2 ? samples[middle] : samples[middle - 1] / 2 + samples[middle] / 2;
    // direction 是异常方向：higher 表示升高异常，lower 表示下降异常。
    const delta = value.direction === 'higher' ? value.value - baseline : baseline - value.value;
    if (
      delta > 0 &&
      delta >= (value.absoluteChange ?? rules.absoluteChange) &&
      delta / Math.abs(baseline) >= (value.relativeChange ?? rules.relativeChange)
    )
      result.push(
        derivedSignal(
          source,
          `metric:${value.id}:trend`,
          `${source.title}：${value.label}趋势异常`,
          `${samples.length}批同版本可比数据中位数为${baseline}，本次为${value.value}；已同时达到相对和绝对变化门槛。`,
        ),
      );
  }
  return result;
}

export function evaluateSnapshot(
  input: Snapshot,
  previous: ObserverState,
  rawPolicy: ObserverConfig['policy'],
): Decision {
  const rules = policy(rawPolicy);
  const state = validateObserverState(previous);
  const current = snapshot(input, true);
  const now = Date.parse(current.at);
  const latest = Math.max(
    -Infinity,
    ...state.history.map((entry) => Date.parse(entry.at)),
    ...Object.values(state.incidents).map((entry) =>
      Date.parse(entry.resolvedAt ?? entry.lastSeen),
    ),
  );
  const history = state.history
    .filter((entry) => now - Date.parse(entry.at) <= rules.maxHistoryHours * 3600000)
    .slice(-rules.historyLimit);
  const checked = new Set<string>();
  const signals = current.observations.flatMap((source) => {
    const collected = [...source.signals];
    if (source.status !== 'ready' && source.status !== 'pending' && !collected.length) {
      const fallback = derivedSignal(
        source,
        `status:${source.status}`,
        `${source.title}来源异常`,
        `采集状态为${source.status}。`,
      );
      if (source.status === 'failed')
        Object.assign(fallback, { severity: 'critical', immediate: true });
      collected.push(fallback);
    }
    return [...collected, ...metricSignals(source, history, rules, checked)];
  });
  unique(signals.map(signalKey), 'decision.signals');
  // 重放仍返回候选供外层分析，但绝不改变历史、确认、通知或恢复。
  if (now <= latest) return { state, signals, notifications: [], recovered: [] };
  const notifications: Signal[] = [],
    recovered: Incident[] = [];
  const present = new Set(signals.map(signalKey));
  const fresh = new Set(
    current.observations
      .filter((source) => {
        const old = state.history
          .flatMap((entry) => entry.observations)
          .filter((entry) => entry.id === source.id);
        const lastObserved = Math.max(
          -Infinity,
          ...old.map((entry) => Date.parse(entry.observedAt)),
        );
        const lastGeneration = Math.max(-Infinity, ...old.map(generation));
        const lastIncident = Math.max(
          -Infinity,
          ...Object.values(state.incidents)
            .filter((entry) => entry.signal.sourceId === source.id)
            .map((entry) => Date.parse(entry.resolvedAt ?? entry.lastSeen)),
        );
        return (
          Date.parse(source.observedAt) > Math.max(lastObserved, lastIncident) &&
          generation(source) >= lastGeneration
        );
      })
      .map((source) => source.id),
  );
  for (const candidate of signals) {
    if (!fresh.has(candidate.sourceId)) continue;
    const key = signalKey(candidate);
    const old = state.incidents[key];
    const active = old && !old.resolvedAt;
    const incident: Incident = active
      ? {
          ...old,
          signal: candidate,
          lastSeen: current.at,
          confirmations: Math.min(LIMITS.confirmations, old.confirmations + 1),
        }
      : { signal: candidate, firstSeen: current.at, lastSeen: current.at, confirmations: 1 };
    const escalation =
      active &&
      old.notifiedAt !== undefined &&
      old.signal.severity === 'warning' &&
      candidate.severity === 'critical';
    if (
      escalation ||
      (!incident.notifiedAt &&
        (candidate.immediate || incident.confirmations >= rules.confirmations))
    ) {
      notifications.push(candidate);
      incident.notifiedAt = current.at;
    }
    // 保存已通知的最高严重程度，降级后再次升级不能重复提醒。
    if (
      active &&
      old.notifiedAt &&
      old.signal.severity === 'critical' &&
      candidate.severity === 'warning'
    )
      incident.signal = { ...candidate, severity: 'critical' };
    state.incidents[key] = incident;
  }
  for (const [key, incident] of Object.entries(state.incidents)) {
    if (incident.resolvedAt || present.has(key)) continue;
    const source = current.observations.find((entry) => entry.id === incident.signal.sourceId);
    if (!source || !fresh.has(source.id) || source.status !== 'ready' || source.signals.length)
      continue;
    if (incident.signal.id.startsWith(`${source.id}:metric:`) && !checked.has(key)) continue;
    incident.resolvedAt = current.at;
    recovered.push(structuredClone(incident));
  }
  // 已恢复的旧事件服从保留窗口；活跃事件不能因时间过去而假装恢复。
  for (const [key, incident] of Object.entries(state.incidents))
    if (
      incident.resolvedAt &&
      now - Date.parse(incident.resolvedAt) > rules.maxHistoryHours * 3600000
    )
      delete state.incidents[key];
  if (Object.keys(state.incidents).length > LIMITS.incidents) {
    const resolved = Object.entries(state.incidents)
      .filter(([, entry]) => entry.resolvedAt)
      .sort((a, b) => Date.parse(a[1].resolvedAt!) - Date.parse(b[1].resolvedAt!));
    for (const [key] of resolved) {
      if (Object.keys(state.incidents).length <= LIMITS.incidents) break;
      delete state.incidents[key];
    }
    requireValue(Object.keys(state.incidents).length <= LIMITS.incidents, 'state.incidents.length');
  }
  // 候选也随历史保存，异常批次不能反过来稀释健康基线，制造“已恢复”。
  const stored: Snapshot = {
    ...current,
    observations: current.observations.map((source) => ({
      ...source,
      signals: signals.filter((entry) => entry.sourceId === source.id),
    })),
  };
  requireValue(
    stored.observations.every((source) => source.signals.length <= LIMITS.signals),
    'snapshot.signals.length',
  );
  state.history = [...history, stored].slice(-rules.historyLimit);
  return structuredClone({ state, signals, notifications, recovered });
}
