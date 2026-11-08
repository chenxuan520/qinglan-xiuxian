// 独立小测试的公开协议，不依赖游戏入口，避免监控模块进入游戏主包。
export const AUTOPLAY_REPORT_URL = 'https://chenxuan520.github.io/qinglan-xiuxian/autoplay-report/';
export const AUTOPLAY_REPORT_MODES = [
  { id: 'default', name: '默认路线' },
  { id: 'native', name: '本命优先' },
  { id: 'survival', name: '保命稳进' },
  { id: 'offense', name: '极致进攻' },
  { id: 'custom', name: '指定法宝' },
] as const;
export interface AutoplayReportRow {
  mode: string;
  samples: number;
  won: number;
  improved: number;
  regressed: number;
  stageClears: number[];
}
export interface AutoplayReport {
  schemaVersion: 1;
  state: 'complete' | 'failed';
  generatedAt: string;
  commit: string;
  sourceHash: string;
  dirty: boolean;
  runId: number | null;
  elapsedSeconds: number;
  planned: 200;
  returned: number;
  error: string | null;
  rows: AutoplayReportRow[];
}
export function autoplayInterval(won: number, count: number): [number, number] {
  const z = 1.96,
    p = won / count,
    denominator = 1 + (z * z) / count;
  const middle = (p + (z * z) / (2 * count)) / denominator;
  const half = (z / denominator) * Math.sqrt((p * (1 - p)) / count + (z * z) / (4 * count * count));
  return [Math.max(0, middle - half), Math.min(1, middle + half)];
}
export function validAutoplayReport(input: unknown): input is AutoplayReport {
  if (!input || typeof input !== 'object') return false;
  const v = input as AutoplayReport;
  const count = (x: unknown): x is number =>
    typeof x === 'number' && Number.isSafeInteger(x) && x >= 0;
  if (
    v.schemaVersion !== 1 ||
    !['complete', 'failed'].includes(v.state) ||
    typeof v.generatedAt !== 'string' ||
    !Number.isFinite(Date.parse(v.generatedAt)) ||
    typeof v.commit !== 'string' ||
    !/^[a-f0-9]{40}$/.test(v.commit) ||
    typeof v.sourceHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(v.sourceHash) ||
    typeof v.dirty !== 'boolean' ||
    !(v.runId === null || (count(v.runId) && v.runId > 0)) ||
    typeof v.elapsedSeconds !== 'number' ||
    !Number.isFinite(v.elapsedSeconds) ||
    v.elapsedSeconds < 0 ||
    v.planned !== 200 ||
    !count(v.returned) ||
    v.returned > v.planned ||
    !Array.isArray(v.rows)
  )
    return false;
  if (v.state === 'failed')
    return typeof v.error === 'string' && v.error.length > 0 && v.rows.length === 0;
  if (v.error !== null || v.returned !== 200 || v.rows.length !== 5) return false;
  const baseline = v.rows[0];
  return v.rows.every(
    (row, i) =>
      row &&
      row.mode === AUTOPLAY_REPORT_MODES[i].id &&
      row.samples === 40 &&
      count(row.won) &&
      row.won <= 40 &&
      count(row.improved) &&
      count(row.regressed) &&
      row.improved <= 40 - baseline.won &&
      row.regressed <= baseline.won &&
      row.won - baseline.won === row.improved - row.regressed &&
      (i !== 0 || (row.improved === 0 && row.regressed === 0)) &&
      Array.isArray(row.stageClears) &&
      row.stageClears.length === 6 &&
      row.stageClears.every(
        (n, stage) => count(n) && n <= (stage === 0 ? 40 : row.stageClears[stage - 1]),
      ) &&
      row.stageClears[5] === row.won,
  );
}
