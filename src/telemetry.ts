// 匿名游玩统计：前端上报与 Worker 校验共用。不读取 DOM，依赖由调用方注入。
import {
  SPIRIT_ROOTS,
  isCultivationPath,
  type CultivationPath,
  type SpiritRootId,
} from './data.ts';
import { TELEMETRY_SETTINGS } from './setting.ts';

export const TELEMETRY_EVENTS = [
  'session',
  'run-start',
  'run-end',
  'town',
  'reincarnate',
  'epilogue',
  'error',
] as const;
// 历练结果，或轮回原因（寿尽、天劫、叩门后、主动）。
export const TELEMETRY_RESULTS = [
  'won',
  'lost',
  'abandon',
  'lifespan',
  'tribulation',
  'epilogue',
  'manual',
] as const;
// 写入 Analytics Engine 的列顺序；查询脚本按同一顺序命名 blob1… 与 double1…。
// 现有数据集已有 blob1…6 的行，detail 只能追加在末尾，旧行该列为空。
export const TELEMETRY_BLOBS = [
  'type',
  'site',
  'version',
  'path',
  'root',
  'result',
  'detail',
] as const;
export const TELEMETRY_DOUBLES = [
  'stage',
  'difficulty',
  'realm',
  'runs',
  'seconds',
  'level',
  'kills',
  'tribulation',
  'age',
  'fresh',
] as const;

type NumberField = Exclude<(typeof TELEMETRY_DOUBLES)[number], 'fresh'>;
// error 事件的错误摘要上限：足够定位名字、信息与文件行号，又限制批量体积。
export const TELEMETRY_DETAIL_MAX_LENGTH = 160;
export type TelemetryEvent = { type: (typeof TELEMETRY_EVENTS)[number] } & Partial<
  Record<NumberField, number>
> & {
    result?: (typeof TELEMETRY_RESULTS)[number];
    path?: CultivationPath;
    root?: SpiritRootId;
    fresh?: boolean;
    detail?: string;
  };
export interface TelemetryBatch {
  id: string;
  version: string;
  events: TelemetryEvent[];
}

const ID_PATTERN = /^[a-z0-9-]{8,40}$/i;
const NUMBER_FIELDS = TELEMETRY_DOUBLES.filter((key) => key !== 'fresh') as NumberField[];
const EVENT_KEYS = new Set<string>([
  'type',
  'result',
  'path',
  'root',
  'fresh',
  'detail',
  ...NUMBER_FIELDS,
]);
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

function validEvent(value: unknown): value is TelemetryEvent {
  if (!record(value) || !TELEMETRY_EVENTS.includes(value.type as TelemetryEvent['type']))
    return false;
  return Object.entries(value).every(([key, field]) => {
    if (!EVENT_KEYS.has(key)) return false;
    if (key === 'type') return true;
    if (key === 'result')
      return TELEMETRY_RESULTS.includes(field as (typeof TELEMETRY_RESULTS)[number]);
    if (key === 'path') return isCultivationPath(field);
    if (key === 'root') return SPIRIT_ROOTS.some((root) => root.id === field);
    if (key === 'fresh') return typeof field === 'boolean';
    if (key === 'detail')
      return typeof field === 'string' && field.length <= TELEMETRY_DETAIL_MAX_LENGTH;
    return typeof field === 'number' && Number.isFinite(field) && field >= 0 && field <= 1e7;
  });
}
export function validTelemetryBatch(value: unknown): value is TelemetryBatch {
  return (
    record(value) &&
    typeof value.id === 'string' &&
    ID_PATTERN.test(value.id) &&
    typeof value.version === 'string' &&
    /^[\w.+-]{1,40}$/.test(value.version) &&
    Array.isArray(value.events) &&
    value.events.length > 0 &&
    value.events.length <= TELEMETRY_SETTINGS.maxEvents &&
    value.events.every(validEvent)
  );
}
export function telemetryPoint(batch: TelemetryBatch, event: TelemetryEvent, site: string) {
  const text: Record<(typeof TELEMETRY_BLOBS)[number], string> = {
    type: event.type,
    site,
    version: batch.version,
    path: event.path ?? '',
    root: event.root ?? '',
    result: event.result ?? '',
    detail: event.detail ?? '',
  };
  return {
    indexes: [batch.id],
    blobs: TELEMETRY_BLOBS.map((key) => text[key]),
    doubles: TELEMETRY_DOUBLES.map((key) =>
      key === 'fresh' ? (event.fresh === undefined ? -1 : Number(event.fresh)) : (event[key] ?? -1),
    ),
  };
}

interface TelemetryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export interface TelemetryOptions {
  origin: string;
  endpoint: string;
  version: string;
  storage: TelemetryStorage | null;
  send: (url: string, body: string) => unknown;
  createId?: () => string;
}
export function createTelemetry(options: TelemetryOptions) {
  const { storage, send } = options;
  const active = (TELEMETRY_SETTINGS.origins as readonly string[]).includes(options.origin);
  const version = /^[\w.+-]{1,40}$/.test(options.version) ? options.version : 'unknown';
  let queue: TelemetryEvent[] = [];
  let id = '';
  const read = (key: string) => {
    try {
      return storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };
  const enabled = () => read(TELEMETRY_SETTINGS.offKey) !== '1';
  const anonymousId = () => {
    if (id) return id;
    const stored = read(TELEMETRY_SETTINGS.idKey);
    id =
      stored && ID_PATTERN.test(stored)
        ? stored
        : options.createId
          ? options.createId()
          : crypto.randomUUID();
    if (id !== stored)
      try {
        storage?.setItem(TELEMETRY_SETTINGS.idKey, id);
      } catch {
        // 无法保存时本次页面仍用同一个临时编号。
      }
    return id;
  };
  const flush = () => {
    while (queue.length) {
      const events = queue.splice(0, TELEMETRY_SETTINGS.maxEvents);
      try {
        send(options.endpoint, JSON.stringify({ id: anonymousId(), version, events }));
      } catch {
        // 统计失败不影响游戏。
      }
    }
  };
  return {
    active,
    enabled,
    setEnabled(on: boolean) {
      try {
        if (on) storage?.removeItem(TELEMETRY_SETTINGS.offKey);
        else storage?.setItem(TELEMETRY_SETTINGS.offKey, '1');
      } catch {
        // 保存失败时保持原状态。
      }
      if (!on) queue = [];
    },
    track(event: TelemetryEvent) {
      if (!active || !enabled()) return;
      queue.push(event);
      if (queue.length >= TELEMETRY_SETTINGS.flushSize) flush();
    },
    flush,
    pending: () => queue.length,
  };
}
