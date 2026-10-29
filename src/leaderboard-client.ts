import { leaderboardAvailable } from './leaderboard-availability.ts';
import {
  LEADERBOARD_MAX_BYTES,
  LEADERBOARD_VERSION,
  isLeaderboardBoard,
  isLeaderboardResult,
  normalizeLeaderboardName,
  type LeaderboardBoard,
  type LeaderboardFacts,
  type LeaderboardResult,
} from './leaderboard-contract.ts';

export type LeaderboardErrorCode =
  | 'invalid-input'
  | 'name-taken'
  | 'rate-limited'
  | 'not-qualified'
  | 'unavailable'
  | 'identity-required'
  | 'timeout'
  | 'cancelled';
export class LeaderboardError extends Error {
  readonly code: LeaderboardErrorCode;
  constructor(code: LeaderboardErrorCode) {
    super(code);
    this.code = code;
  }
}
export interface LeaderboardClientOptions {
  origin?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  enabled?(): boolean;
}
const RESPONSE_LIMIT = 65536;
const errors: readonly string[] = [
  'invalid-input',
  'name-taken',
  'rate-limited',
  'not-qualified',
  'unavailable',
  'identity-required',
];
async function readResponse(response: Response, signal: AbortSignal): Promise<unknown> {
  const length = response.headers.get('Content-Length');
  if (
    (length && /^\d+$/.test(length) && Number(length) > RESPONSE_LIMIT) ||
    !response.headers.get('Content-Type')?.toLowerCase().includes('application/json')
  ) {
    void response.body?.cancel().catch(() => {});
    throw new LeaderboardError('unavailable');
  }
  if (response.body?.getReader && typeof TextDecoder === 'function') {
    const reader = response.body.getReader();
    const abort = () => void reader.cancel().catch(() => {});
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (signal.aborted) throw new LeaderboardError('cancelled');
        if (done) break;
        size += value.byteLength;
        if (size > RESPONSE_LIMIT) throw new LeaderboardError('unavailable');
        chunks.push(value);
      }
    } catch (error) {
      void reader.cancel().catch(() => {});
      throw error;
    } finally {
      signal.removeEventListener('abort', abort);
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  }
  const text = await response.text();
  if (new Blob([text]).size > RESPONSE_LIMIT) throw new LeaderboardError('unavailable');
  return JSON.parse(text);
}

export class LeaderboardClient {
  private readonly options: LeaderboardClientOptions;
  constructor(options: LeaderboardClientOptions = {}) {
    this.options = options;
  }
  available() {
    return leaderboardAvailable(this.options.origin) && this.options.enabled?.() !== false;
  }
  async read(signal: AbortSignal): Promise<LeaderboardBoard> {
    const value = await this.request(signal);
    if (!isLeaderboardBoard(value)) throw new LeaderboardError('unavailable');
    return value;
  }
  async submit(
    name: string,
    facts: LeaderboardFacts,
    signal: AbortSignal,
  ): Promise<LeaderboardResult> {
    const normalized = normalizeLeaderboardName(name);
    if (!normalized) throw new LeaderboardError('invalid-input');
    let body: string;
    try {
      body = JSON.stringify({ version: LEADERBOARD_VERSION, name: normalized.name, facts });
      if (new Blob([body]).size > LEADERBOARD_MAX_BYTES) throw Error('too-large');
    } catch {
      throw new LeaderboardError('invalid-input');
    }
    const value = await this.request(signal, body);
    if (!isLeaderboardResult(value)) throw new LeaderboardError('unavailable');
    return value;
  }
  private async request(signal: AbortSignal, body?: string): Promise<unknown> {
    if (signal.aborted) throw new LeaderboardError('cancelled');
    if (!this.available() || (typeof navigator !== 'undefined' && navigator.onLine === false))
      throw new LeaderboardError('unavailable');
    const controller = new AbortController();
    let rejectCancelled: (error: LeaderboardError) => void = () => {};
    const cancelled = new Promise<never>((_resolve, reject) => {
      rejectCancelled = reject;
    });
    const abort = () => {
      controller.abort();
      rejectCancelled(new LeaderboardError('cancelled'));
    };
    signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => {
      controller.abort();
      rejectCancelled(new LeaderboardError('timeout'));
    }, this.options.timeoutMs ?? 8000);
    const work = async () => {
      // 身份Cookie握手只有一次重发机会，整个操作共用同一个超时预算。
      for (let attempt = 0; attempt < 2; attempt++) {
        if (controller.signal.aborted || !this.available()) throw new LeaderboardError('cancelled');
        const response = await (this.options.fetcher ?? fetch)('/api/leaderboard', {
          method: body === undefined ? 'GET' : 'POST',
          ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body }),
          credentials: 'same-origin',
          cache: 'no-store',
          redirect: 'error',
          signal: controller.signal,
        });
        const value = await readResponse(response, controller.signal);
        if (response.ok) return value;
        const code =
          value &&
          typeof value === 'object' &&
          'error' in value &&
          errors.includes(String(value.error))
            ? (value.error as LeaderboardErrorCode)
            : 'unavailable';
        if (
          body !== undefined &&
          response.status === 428 &&
          code === 'identity-required' &&
          !attempt
        )
          continue;
        throw new LeaderboardError(code);
      }
      throw new LeaderboardError('identity-required');
    };
    try {
      const result = await Promise.race([work(), cancelled]);
      if (signal.aborted || controller.signal.aborted || !this.available())
        throw new LeaderboardError('cancelled');
      return result;
    } catch (error) {
      throw error instanceof LeaderboardError ? error : new LeaderboardError('unavailable');
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    }
  }
}

export function fetchLeaderboardBoard(
  signal = new AbortController().signal,
  options: LeaderboardClientOptions = {},
) {
  return new LeaderboardClient(options).read(signal);
}
export function canSubmitLeaderboardScore(board: LeaderboardBoard, score: number) {
  return (
    Number.isSafeInteger(score) &&
    score >= 0 &&
    (board.entries.length < board.limit || score > board.minimumScore)
  );
}
export function leaderboardErrorMessage(error: unknown, writing = false) {
  const code = error instanceof LeaderboardError ? error.code : 'unavailable';
  if (code === 'invalid-input') return '请检查姓名后重试。';
  if (code === 'name-taken') return '这个名字已有人留名，请换一个。';
  if (code === 'rate-limited') return '请求过于频繁，请稍后再试。';
  if (code === 'not-qualified') return '道果尚未进入前百，可待修行有成后再留名。';
  if (code === 'identity-required') return '暂时无法确认署名，请允许本站 Cookie 后重试。';
  if (code === 'timeout') return '请求超时，请重试。';
  return writing ? '此次留名尚未确认，请重试。' : '榜单暂不可用，请重试。';
}
