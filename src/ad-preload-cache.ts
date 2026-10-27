import type { HouseAd, HouseAdDevice, HouseAdPlacement } from './house-ad-contract.ts';

const ready = new Map<string, { ad: HouseAd; until: number }>();
// 一次性、15秒短缓存；只放已成功加载的素材，不复用统计凭条。
export function storePreparedAd(
  placement: HouseAdPlacement,
  device: HouseAdDevice,
  ad: HouseAd,
  now = performance.now(),
) {
  ready.set(placement + ':' + device, { ad, until: now + 15_000 });
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
