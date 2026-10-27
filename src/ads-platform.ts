import { ADS_SETTINGS } from './setting.ts';
import { adLoadJson } from './ad-load-request.ts';
import type { AdLoadTrace } from './ad-load-diagnostics.ts';
import { validAdPlatformSettings } from './ad-platform-contract.ts';
import { houseAdProvider } from './ads-house-source.ts';
import { createAdsenseProvider } from './ads-adsense.ts';
import type { AdPlacement, RewardAdProvider } from './ads.ts';
let warmedHouseUntil = 0;
export async function warmAdPlatform(signal: AbortSignal) {
  const body = await adLoadJson(new URL(ADS_SETTINGS.platform.endpoint), signal, 8000, fetch);
  if (
    !signal.aborted &&
    body &&
    typeof body === 'object' &&
    'settings' in body &&
    validAdPlatformSettings(body.settings) &&
    body.settings.provider === 'house'
  ) {
    warmedHouseUntil = performance.now() + 15_000;
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
  // 仅短期复用自营供给类型；实际创意仍重新抽取并校验最新权重/开关。
  if (fetcher === fetch && performance.now() < warmedHouseUntil) return houseAdProvider;
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
    if (body && trace) trace.code = 'invalid';
    return null;
  }
  if (body.settings.provider === 'house') return houseAdProvider;
  if (body.settings.provider === 'adsense')
    return createAdsenseProvider(
      body.settings.adsense,
      'receipt' in body ? body.receipt : undefined,
    );
  if (trace) trace.empty = true;
  return null;
}
