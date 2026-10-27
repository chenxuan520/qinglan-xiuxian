import { STANDALONE } from './build-mode.ts';
import { ModuleSource, retryModule } from './module-source.ts';
import type { RewardAdProvider } from './ads.ts';
const source = STANDALONE
  ? null
  : new ModuleSource<typeof import('./ads-platform.ts')>((attempt) =>
      attempt ? retryModule('ads-platform', 'ad-platform', attempt) : import('./ads-platform.ts'),
    );
export function preloadRewardAds() {
  if (!source || typeof window === 'undefined') return;
  const start = () => {
    if (
      document.hidden ||
      navigator.onLine === false ||
      (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData
    )
      return;
    const controller = new AbortController();
    const cancel = () => controller.abort();
    window.addEventListener('pagehide', cancel, { once: true });
    const timer = setTimeout(cancel, 15_000);
    void source
      .load()
      .then((module) => {
        if (!controller.signal.aborted) return module.warmAdPlatform(controller.signal);
      })
      .catch(() => {})
      .finally(() => {
        clearTimeout(timer);
        window.removeEventListener('pagehide', cancel);
      });
  };
  if (window.requestIdleCallback) window.requestIdleCallback(start, { timeout: 5000 });
  else window.setTimeout(start, 1500);
}
export function platformAdProvider(): RewardAdProvider {
  let selected: RewardAdProvider | null = null;
  return {
    name: 'platform',
    loadTimeoutMs: 30000,
    ownsPlaybackClock: true,
    placementName: (p) => selected?.placementName(p) ?? `qinglan-${p}`,
    async prepare(context) {
      const current = () => !!context && !context.signal.aborted && context.alive?.() !== false;
      if (!source || !context || !current()) return false;
      const module = await source.load();
      if (!current()) return false;
      selected = await module.configuredAdProvider(
        context.placement,
        context.signal,
        fetch,
        context.trace,
      );
      if (selected?.name === 'adsense') context.trace?.at('sdk');
      return current() && !!selected && selected.prepare(context);
    },
    play(placement, callbacks, context) {
      if (!selected || context?.signal.aborted) {
        callbacks.onFailed('广告暂不可用');
        return;
      }
      selected.play(placement, callbacks, context);
    },
  };
}
