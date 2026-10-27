import { ADS_SETTINGS } from './setting.ts';
import { adLoadJson } from './ad-load-request.ts';
import { currentHouseAdDevice } from './ads-house.ts';
import { houseAdUrl, validHouseAd, HOUSE_AD_PLACEMENTS } from './house-ad-contract.ts';
import { storePreparedAd } from './ad-preload-cache.ts';

// 不申请凭条、不计曝光，只在空闲时用浏览器HTTP缓存预热当前端图片。
export async function preloadAdImages(
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
  makeImage = () => new Image(),
) {
  const url = new URL(ADS_SETTINGS.house.endpoint.replace(/\/ad$/, '/preload'));
  const device = currentHouseAdDevice();
  url.searchParams.set('device', device);
  const body = await adLoadJson(url, signal, 48_000, fetcher);
  const selectedAt = performance.now();
  if (
    signal.aborted ||
    !body ||
    typeof body !== 'object' ||
    !('images' in body) ||
    !Array.isArray(body.images)
  )
    return;
  const images = [...new Set(body.images.filter(houseAdUrl))].slice(0, 4);
  const loaded = new Set<string>();
  await Promise.all(
    images.map(
      (src) =>
        new Promise<void>((resolve) => {
          if (signal.aborted) return resolve();
          const image = makeImage();
          const stop = () => {
            image.onload = image.onerror = null;
            signal.removeEventListener('abort', abort);
            resolve();
          };
          const abort = () => {
            image.src = '';
            stop();
          };
          image.referrerPolicy = 'no-referrer';
          image.onload = () => {
            if (image.naturalWidth > 0) loaded.add(src);
            stop();
          };
          image.onerror = stop;
          signal.addEventListener('abort', abort, { once: true });
          image.src = src;
        }),
    ),
  );
  if (!signal.aborted && 'ads' in body && body.ads && typeof body.ads === 'object') {
    const ads = body.ads as Record<string, unknown>;
    for (const placement of HOUSE_AD_PLACEMENTS) {
      const ad = ads[placement];
      if (
        validHouseAd(ad) &&
        loaded.has(device === 'mobile' ? (ad.mobileImageUrl ?? ad.imageUrl) : ad.imageUrl)
      )
        storePreparedAd(placement, device, ad, selectedAt);
    }
  }
}
