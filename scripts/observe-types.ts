// 观察器只消费运行证据；不导入游戏引擎，也不改平衡验收区间。
export type Severity = 'warning' | 'critical';
export interface Metric {
  id: string;
  label: string;
  value: number;
  generatedAt?: string;
  unit?: string;
  sampleSize?: number;
  comparisonKey?: string;
  direction?: 'higher' | 'lower';
  alertAbove?: number;
  alertBelow?: number;
  relativeChange?: number;
  absoluteChange?: number;
  minSamples?: number;
}
export interface Signal {
  id: string;
  sourceId: string;
  severity: Severity;
  title: string;
  detail: string;
  evidenceIds: string[];
  immediate?: boolean;
}
export interface Observation {
  id: string;
  title: string;
  kind: string;
  url?: string;
  observedAt: string;
  generatedAt?: string;
  version?: string;
  comparisonKey?: string;
  status: 'ready' | 'pending' | 'failed' | 'unavailable' | 'invalid';
  metrics: Metric[];
  signals: Signal[];
}
export interface Snapshot {
  schemaVersion: 1;
  at: string;
  observations: Observation[];
}
export interface Incident {
  signal: Signal;
  firstSeen: string;
  lastSeen: string;
  confirmations: number;
  notifiedAt?: string;
  resolvedAt?: string;
}
export interface ObserverState {
  schemaVersion: 1;
  history: Snapshot[];
  incidents: Record<string, Incident>;
}
export interface MetricRule extends Omit<Metric, 'value' | 'sampleSize'> {
  pointer: string;
  samplePointer?: string;
}
export interface SourceSpec {
  id: string;
  title: string;
  kind: 'balance' | 'performance' | 'weapons' | 'autoplay' | 'telemetry' | 'github' | 'json';
  url?: string;
  maxAgeHours: number;
  timeoutMs?: number;
  maxBytes?: number;
  headersEnv?: Record<string, string>;
  generatedAtPointer?: string;
  versionPointer?: string;
  metricRules?: MetricRule[];
  workflow?: {
    repository: string;
    path: string;
    branch: string;
    job?: string;
    maxRunHours: number;
  };
}
export interface AnalysisConfig {
  engine: 'pi' | 'openai' | 'none';
  model: string;
  baseUrl: string;
  protocol: 'responses' | 'chat-completions' | 'decisions';
  apiKeyEnv: string;
  timeoutMs: number;
  maxInputChars: number;
  maxOutputTokens: number;
}
export interface ObserverConfig {
  schemaVersion: 1;
  sources: SourceSpec[];
  policy: {
    confirmations: number;
    historyLimit: number;
    maxHistoryHours: number;
    baselineSamples: number;
    relativeChange: number;
    absoluteChange: number;
    minMetricSamples: number;
  };
  analysis: AnalysisConfig;
}
export interface Decision {
  state: ObserverState;
  signals: Signal[];
  notifications: Signal[];
  recovered: Incident[];
}
export interface AnalysisInput {
  at: string;
  signals: Signal[];
  evidence: { id: string; text: string }[];
}
export interface AnalysisDiagnostics {
  stage: 'setup' | 'pi' | 'request' | 'fetch' | 'response' | 'response-body' | 'parse' | 'complete';
  elapsedMs: number;
  endpoint?: { origin: string; path: string };
  httpStatus?: number;
  errorName?: string;
  causeCode?: string;
  keyFormatReason?: 'empty' | 'unmatched-wrapper' | 'internal-whitespace' | 'non-ascii' | 'quote';
}
export interface ObserverCredentialSource {
  selectedSecret: 'OPENAI_API_KEY' | 'OBSERVER_API_KEY' | 'custom-secret';
  openaiConfigured: boolean;
  observerConfigured: boolean;
}
export interface AnalysisResult {
  engine: AnalysisConfig['engine'];
  model: string;
  status: 'complete' | 'unavailable' | 'failed' | 'skipped';
  summary: string;
  findings: { signalId: string; explanation: string; nextSteps: string[] }[];
  usage?: { inputTokens: number; outputTokens: number };
  error?: string;
  diagnostics?: AnalysisDiagnostics;
  reanalyzed?: boolean;
  verificationOnly?: boolean;
  credentialSource?: ObserverCredentialSource;
}
