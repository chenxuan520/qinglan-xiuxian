import { CULTIVATION_PATHS, DIFFICULTIES, REALMS, SPIRIT_ROOTS, STAGES } from './data.ts';
import type { MonitorRow } from './monitor-protocol.ts';

export const monitorEscape = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[s]!,
  );
export const monitorNumber = (value: unknown) => Number(value) || 0;
export const monitorCount = (value: unknown) =>
  monitorNumber(value).toLocaleString('zh-CN', { maximumFractionDigits: 1 });
export const monitorAverage = (sum: unknown, count: unknown, suffix = '') =>
  monitorNumber(count) > 0
    ? `${monitorCount(monitorNumber(sum) / monitorNumber(count))}${suffix}`
    : '—';
export const monitorRate = (row: MonitorRow) =>
  monitorNumber(row.ends) > 0
    ? `${((100 * monitorNumber(row.won)) / monitorNumber(row.ends)).toFixed(1)}%`
    : '—';
export function monitorTime(value: unknown) {
  if (typeof value !== 'string') return '—';
  // Analytics Engine 的 timestamp 是 UTC，没有时区后缀；不能按设备本地时区解读。
  const normalized = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : value;
  const date = new Date(normalized);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
    : '—';
}
export const monitorRoot = (id: unknown) => SPIRIT_ROOTS.find((r) => r.id === id)?.name ?? '未记录';
export const monitorPath = (id: unknown) =>
  CULTIVATION_PATHS.find((p) => p.id === id)?.name ?? '未记录';
export const monitorStage = (id: unknown) => STAGES[Number(id)]?.name ?? '未记录';
export const monitorDifficulty = (id: unknown) => DIFFICULTIES[Number(id)]?.name ?? '未记录';
export const monitorSite = (id: unknown) =>
  id === 'xiuxian.011203.xyz' ? '官网' : id === 'chenxuan520.github.io' ? 'GitHub Pages' : '未记录';
export function monitorRealm(value: unknown) {
  const step = Number(value);
  if (!Number.isInteger(step) || step < 0 || step > 24) return '未记录';
  return step === 24
    ? '真仙'
    : `${REALMS[Math.floor(step / 3)]}${['初期', '中期', '后期'][step % 3]}`;
}
export const monitorReason = (value: unknown) =>
  ({ lifespan: '寿尽', tribulation: '天劫', epilogue: '叩门后', manual: '主动轮回' })[
    String(value)
  ] ?? '未记录';
export function monitorTable(headers: string[], rows: unknown[][]) {
  if (!rows.length) return '<p class="note">当前范围暂无记录。</p>';
  return `<div class="table-wrap" tabindex="0" role="region" aria-label="${monitorEscape(headers[0])}统计表，可横向滚动"><table><thead><tr>${headers.map((c) => `<th scope="col">${monitorEscape(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((c) => `<td>${monitorEscape(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
export type MonitorCI = {
  schemaVersion: 1;
  commit: string | null;
  generatedAt: string | null;
  passed: boolean;
  plannedSamples: number;
  returnedSamples: number;
  elapsedSeconds: number | null;
  simulationErrors: number;
  counts: { error: number; warning: number };
  items: { severity: 'error' | 'warning'; displayMessage: string }[];
};
export function validMonitorCI(input: unknown): input is MonitorCI {
  if (!input || typeof input !== 'object') return false;
  const data = input as MonitorCI;
  const count = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
  return (
    data.schemaVersion === 1 &&
    typeof data.passed === 'boolean' &&
    (data.commit === null ||
      (typeof data.commit === 'string' && /^[a-f0-9]{40}$/.test(data.commit))) &&
    (data.generatedAt === null ||
      (typeof data.generatedAt === 'string' && Number.isFinite(Date.parse(data.generatedAt)))) &&
    count(data.plannedSamples) &&
    count(data.returnedSamples) &&
    count(data.simulationErrors) &&
    (data.elapsedSeconds === null ||
      (typeof data.elapsedSeconds === 'number' &&
        Number.isFinite(data.elapsedSeconds) &&
        data.elapsedSeconds >= 0)) &&
    !!data.counts &&
    count(data.counts.error) &&
    count(data.counts.warning) &&
    Array.isArray(data.items) &&
    data.items.length <= 20000 &&
    data.items.every(
      (i) => i && ['error', 'warning'].includes(i.severity) && typeof i.displayMessage === 'string',
    ) &&
    data.items.filter((i) => i.severity === 'error').length === data.counts.error &&
    data.items.filter((i) => i.severity === 'warning').length === data.counts.warning &&
    (!data.passed ||
      (data.counts.error === 0 &&
        data.simulationErrors === 0 &&
        data.returnedSamples === data.plannedSamples &&
        data.plannedSamples > 0))
  );
}
