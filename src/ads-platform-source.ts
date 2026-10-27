import { STANDALONE } from './build-mode.ts';
import { ModuleSource, retryModule } from './module-source.ts';
import type { RewardAdProvider } from './ads.ts';
const source = STANDALONE
  ? null
  : new ModuleSource<typeof import('./ads-platform.ts')>((attempt) =>
      attempt ? retryModule('ads-platform', 'ad-platform', attempt) : import('./ads-platform.ts'),
    );
let warming: AbortController | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let listening = false,
  pageActive = true,
  refill = false;
function canPreload() {
  return (
    pageActive &&
    !document.hidden &&
    navigator.onLine !== false &&
    !(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData
  );
}
function warmNextAd() {
  clearTimeout(refreshTimer);
  if (!source || !canPreload()) {
    warming?.abort();
    return;
  }
  if (warming) {
    refill = true;
    return;
  }
  const controller = (warming = new AbortController());
  const timeout = setTimeout(() => controller.abort(), 15_000);
  const start = () => {
    void (async () => {
      if (controller.signal.aborted || !canPreload()) return;
      const module = await source.load();
      if (!controller.signal.aborted && canPreload())
        await module.warmAdPlatform(controller.signal);
    })()
      .catch(() => {})
      .finally(() => {
        clearTimeout(timeout);
        warming = null;
        if (!canPreload()) {
          refill = false;
          return;
        }
        const delay = refill ? 0 : 60_000;
        refill = false;
        refreshTimer = setTimeout(warmNextAd, delay);
      });
  };
  if (window.requestIdleCallback) window.requestIdleCallback(start, { timeout: 1000 });
  else window.setTimeout(start, 0);
}
export function preloadRewardAds() {
  if (!source || typeof window === 'undefined') return;
  if (!listening) {
    listening = true;
    document.addEventListener('visibilitychange', warmNextAd);
    window.addEventListener('online', warmNextAd);
    window.addEventListener('offline', warmNextAd);
    window.addEventListener('pagehide', () => {
      pageActive = false;
      warmNextAd();
    });
    window.addEventListener('pageshow', () => {
      pageActive = true;
      warmNextAd();
    });
  }
  warmNextAd();
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
