import { ADS_SETTINGS } from './setting.ts';
import { boundedAdJson } from './house-ad-contract.ts';
import { validAdPlatformSettings } from './ad-platform-contract.ts';
import { houseAdProvider } from './ads-house-source.ts';
import { createAdsenseProvider } from './ads-adsense.ts';
import type { AdPlacement, RewardAdProvider } from './ads.ts';
export async function configuredAdProvider(
  placement: AdPlacement,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<RewardAdProvider | null> {
  if (!ADS_SETTINGS.platform.endpoint || signal.aborted) return null;
  const url = new URL(ADS_SETTINGS.platform.endpoint);
  url.searchParams.set('placement', placement);
  const controller = new AbortController(),
    abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 3000);
  try {
    const response = await fetcher(url, {
      credentials: 'omit',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok || signal.aborted || controller.signal.aborted) return null;
    const body = await boundedAdJson(response, 8000);
    if (
      !body ||
      typeof body !== 'object' ||
      !('settings' in body) ||
      !validAdPlatformSettings(body.settings) ||
      signal.aborted ||
      controller.signal.aborted
    )
      return null;
    if (body.settings.provider === 'house') return houseAdProvider;
    if (body.settings.provider === 'adsense')
      return createAdsenseProvider(
        body.settings.adsense,
        'receipt' in body ? body.receipt : undefined,
      );
    return null;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}
