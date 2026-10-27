import { adResponseJson, AdResponseError } from './ad-response-json.ts';
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
    if (trace) trace.status = 0;
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
      if (trace) trace.status = response.status;
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
      let stopReading = () => {};
      try {
        const cancelled = new Promise<never>((_resolve, reject) => {
          stopReading = () => reject(new Error('body-cancelled'));
          controller.signal.addEventListener('abort', stopReading, { once: true });
          if (controller.signal.aborted) stopReading();
        });
        body = await Promise.race([adResponseJson(response, maxBytes), cancelled]);
      } catch (error) {
        if (controller.signal.aborted) throw error;
        if (trace) trace.code = error instanceof AdResponseError ? error.code : 'body-read';
        return null;
      } finally {
        controller.signal.removeEventListener('abort', stopReading);
      }
      return signal.aborted || controller.signal.aborted ? null : body;
    } catch {
      if (signal.aborted) return null;
      if (trace) {
        trace.code = expired ? 'timeout' : 'network';
      }
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    }
  }
  return null;
}
