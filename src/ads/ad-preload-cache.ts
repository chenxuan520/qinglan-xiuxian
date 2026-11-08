import type { HouseAd, HouseAdDevice, HouseAdPlacement } from './house-ad-contract.ts';

const ready = new Map<string, { ad: HouseAd; until: number }>();
export const AD_PRELOAD_TTL_MS = 120_000;
// 一次性预备素材；后台定期续备，打开时仍核验投放，不复用统计凭条。
export function storePreparedAd(
  placement: HouseAdPlacement,
  device: HouseAdDevice,
  ad: HouseAd,
  now = performance.now(),
) {
  ready.set(placement + ':' + device, { ad, until: now + AD_PRELOAD_TTL_MS });
}
export function clearPreparedAds() {
  ready.clear();
}
export function takePreparedAd(
  placement: HouseAdPlacement,
  device: HouseAdDevice,
  now = performance.now(),
): HouseAd | null {
  const key = placement + ':' + device,
    entry = ready.get(key);
  ready.delete(key);
  return entry && now < entry.until ? entry.ad : null;
}
