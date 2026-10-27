import { boundedAdJson } from './house-ad-contract.ts';
import type { AdLoadTrace } from './ad-load-diagnostics.ts';

// 每次请求包含读响应体的预算；仅瞬时网络/超时/5xx重试一次，关闭立即取消。
export async function adLoadJson(
  url: URL,
  signal: AbortSignal,
  maxBytes: number,
  fetcher: typeof fetch,
  trace?: AdLoadTrace,
): Promise<unknown> {
  for (let attempt = 0; attempt < 2 && !signal.aborted; attempt++) {
    const controller = new AbortController(),
      abort = () => controller.abort();
    let expired = false;
    signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => {
      expired = true;
      abort();
    }, 6000);
    try {
      const response = await fetcher(url, {
        credentials: 'omit',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) {
        if (trace) {
          trace.code = 'http';
          trace.status = response.status;
        }
        await response.body?.cancel();
        if (response.status >= 500 && attempt === 0) continue;
        return null;
      }
      let body: unknown;
      try {
        body = await boundedAdJson(response, maxBytes);
      } catch (error) {
        if (controller.signal.aborted) throw error;
        if (trace) trace.code = 'invalid';
        return null;
      }
      return signal.aborted || controller.signal.aborted ? null : body;
    } catch {
      if (signal.aborted) return null;
      if (trace) {
        trace.code = expired ? 'timeout' : 'network';
        trace.status = 0;
      }
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    }
  }
  return null;
}
