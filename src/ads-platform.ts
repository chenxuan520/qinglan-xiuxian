import { ADS_SETTINGS } from './setting.ts';
import { adLoadJson } from './ad-load-request.ts';
import type { AdLoadTrace } from './ad-load-diagnostics.ts';
import { validAdPlatformSettings } from './ad-platform-contract.ts';
import { houseAdProvider } from './ads-house-source.ts';
import { createAdsenseProvider } from './ads-adsense.ts';
import { clearPreparedAds } from './ad-preload-cache.ts';
import type { AdPlacement, RewardAdProvider } from './ads.ts';
export async function warmAdPlatform(signal: AbortSignal) {
  const body = await adLoadJson(new URL(ADS_SETTINGS.platform.endpoint), signal, 8000, fetch);
  if (
    !signal.aborted &&
    body &&
    typeof body === 'object' &&
    'settings' in body &&
    validAdPlatformSettings(body.settings)
  ) {
    if (body.settings.provider !== 'house') {
      clearPreparedAds();
      return;
    }
    const module = await import('./ads-preload.ts');
    if (!signal.aborted) await module.preloadAdImages(signal);
  }
}
export async function configuredAdProvider(
  placement: AdPlacement,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
  trace?: AdLoadTrace,
): Promise<RewardAdProvider | null> {
  if (!ADS_SETTINGS.platform.endpoint || signal.aborted) return null;
  const url = new URL(ADS_SETTINGS.platform.endpoint);
  url.searchParams.set('placement', placement);
  trace?.at('settings');
  const body = await adLoadJson(url, signal, 8000, fetcher, trace);
  if (
    !body ||
    typeof body !== 'object' ||
    !('settings' in body) ||
    !validAdPlatformSettings(body.settings) ||
    signal.aborted
  ) {
    if (body && trace) trace.code = 'schema';
    return null;
  }
  if (body.settings.provider === 'house') return houseAdProvider;
  // 图片仍提前备好；每次打开重新确认供给，切换后不再消费旧的自营素材。
  clearPreparedAds();
  if (body.settings.provider === 'adsense')
    return createAdsenseProvider(
      body.settings.adsense,
      'receipt' in body ? body.receipt : undefined,
    );
  if (trace) trace.empty = true;
  return null;
}
