// 各类资源失败共用同一信号；保留原来的异常、重试和离线回退。
export const resourceFailed = (handled = false) =>
  globalThis.dispatchEvent?.(
    Object.assign(new Event('vite:preloadError'), { handledResourceFailure: handled }),
  );

export function createUpdateCheck(
  build: string,
  url: URL,
  updated: () => void,
  fetcher: typeof fetch = fetch,
) {
  let pending: Promise<void> | undefined;
  return () => {
    pending ??= (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const requestUrl = new URL(url);
        requestUrl.searchParams.set('_', String(Date.now()));
        const response = await fetcher(requestUrl, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) return;
        const latest = await response.json();
        if (
          latest?.schema === 1 &&
          typeof latest.build === 'string' &&
          /^[a-f0-9]{24}$/.test(latest.build) &&
          latest.build !== build
        )
          updated();
      } catch {
        // 无法确认版本时，继续沿用原加载失败提示。
      } finally {
        clearTimeout(timer);
      }
    })().finally(() => {
      pending = undefined;
    });
    return pending;
  };
}
