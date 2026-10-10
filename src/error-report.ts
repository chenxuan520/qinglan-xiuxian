// 运行时错误上报：监听未捕获异常与未处理的 Promise 拒绝，去重限频后交给遥测。
// 本模块不读 DOM、存档与游戏状态，监听目标可注入，游戏卡死时仍能工作；
// 页面兜底提示由调用方在 onError 回调里自行处理。
import { TELEMETRY_DETAIL_MAX_LENGTH } from './telemetry.ts';

// 每次页面加载最多上报的不同错误个数；崩溃刷新循环下每次加载至多再发这一批。
export const RUNTIME_ERROR_LIMIT = 8;

export interface RuntimeErrorLike {
  message?: unknown;
  filename?: unknown;
  lineno?: unknown;
  colno?: unknown;
  error?: unknown;
}
export interface RuntimeRejectionLike {
  reason?: unknown;
}
type Listener = (event: any) => void;
export interface ErrorWatchTarget {
  addEventListener(type: string, listener: Listener): void;
  removeEventListener(type: string, listener: Listener): void;
}

// 控制字符（0x00–0x1F、0x7F）替换为空格，再折叠连续空白，防止摘要混入换行或 ANSI 序列。
function clean(text: unknown): string {
  let out = '';
  for (const ch of String(text ?? '')) {
    const code = ch.codePointAt(0) ?? 0;
    out += code < 0x20 || code === 0x7f ? ' ' : ch;
  }
  return out.replace(/\s+/g, ' ').trim();
}
function truncate(text: string): string {
  return text.length > TELEMETRY_DETAIL_MAX_LENGTH
    ? `${text.slice(0, TELEMETRY_DETAIL_MAX_LENGTH - 1)}…`
    : text;
}
function errorName(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const name = (error as { name?: unknown }).name;
  return typeof name === 'string' ? clean(name) : '';
}

export function describeRuntimeError(event: RuntimeErrorLike): string {
  const name = errorName(event.error);
  const message =
    clean(event.message) ||
    clean((event.error as { message?: unknown } | null)?.message) ||
    '未知错误';
  let where = '';
  if (typeof event.filename === 'string' && event.filename) {
    // 只保留文件名与行号，不带部署 URL；跨域脚本本就只有空文件名。
    where = clean(event.filename.split(/[\\/]/).pop()?.split(/[?#]/)[0]);
    const line = Number(event.lineno);
    if (Number.isFinite(line) && line > 0) where += `:${Math.floor(line)}`;
  }
  return truncate(`error: ${name ? `${name}: ` : ''}${message}${where ? ` @ ${where}` : ''}`);
}

export function describeRejection(event: RuntimeRejectionLike): string {
  const reason = event.reason;
  if (reason instanceof Error) {
    const name = errorName(reason) || 'Error';
    return truncate(`rejection: ${name}: ${clean(reason.message) || '未知错误'}`);
  }
  return truncate(`rejection: ${clean(reason) || '未知原因'}`);
}

export interface ErrorWatch {
  detach(): void;
  reported(): number;
}
export function createErrorWatch(options: {
  target: ErrorWatchTarget;
  track: (event: { type: 'error'; detail: string }) => void;
  onError?: (detail: string) => void;
  limit?: number;
}): ErrorWatch {
  const limit = options.limit ?? RUNTIME_ERROR_LIMIT;
  const seen = new Set<string>();
  let sent = 0;
  const report = (detail: string) => {
    if (!detail || seen.has(detail) || sent >= limit) return;
    seen.add(detail);
    sent += 1;
    try {
      options.track({ type: 'error', detail });
    } catch {
      // 上报失败不影响兜底提示。
    }
    try {
      options.onError?.(detail);
    } catch {
      // 提示失败不影响游戏。
    }
  };
  const onError = (event: unknown) => report(describeRuntimeError(event as RuntimeErrorLike));
  const onRejection = (event: unknown) => report(describeRejection(event as RuntimeRejectionLike));
  options.target.addEventListener('error', onError);
  options.target.addEventListener('unhandledrejection', onRejection);
  return {
    detach() {
      options.target.removeEventListener('error', onError);
      options.target.removeEventListener('unhandledrejection', onRejection);
    },
    reported: () => sent,
  };
}
