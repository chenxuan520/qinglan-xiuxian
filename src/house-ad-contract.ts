import { validAdPlatformSettings, type AdPlatformSettings } from './ad-platform-contract.ts';
// 自营广告只传图片与链接，不接受 HTML、脚本或游戏奖励配置。
export const HOUSE_AD_PLACEMENTS = [
  'revive',
  'reward-root',
  'reward-supplies',
  'lifespan',
] as const;
export type HouseAdPlacement = (typeof HOUSE_AD_PLACEMENTS)[number];
export type HouseAdDevice = 'desktop' | 'mobile';
export const isHouseAdDevice = (value: unknown): value is HouseAdDevice =>
  value === 'desktop' || value === 'mobile';
export const houseAdDeviceFromUserAgent = (
  userAgent: string,
  mobileHint?: string | null,
): HouseAdDevice =>
  mobileHint === '?1' || /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) ? 'mobile' : 'desktop';
export interface HouseAd {
  id: string;
  name: string;
  imageUrl: string;
  mobileImageUrl?: string;
  targetUrl: string;
}
export interface HouseAdCampaign extends HouseAd {
  weight?: number;
  desktopWeight?: number;
  mobileWeight?: number;
  enabled: boolean;
  placements: HouseAdPlacement[];
}
export interface HouseAdConfig {
  revision: number;
  campaigns: HouseAdCampaign[];
  settings?: AdPlatformSettings;
}
export const HOUSE_AD_MAX_BYTES = 96_000;
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const keys = (value: Record<string, unknown>, expected: string[]) =>
  Object.keys(value).length === expected.length &&
  expected.every((key) => Object.hasOwn(value, key));
export function houseAdUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048 || value.trim() !== value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !!url.hostname;
  } catch {
    return false;
  }
}
export const isHouseAdPlacement = (value: unknown): value is HouseAdPlacement =>
  typeof value === 'string' && (HOUSE_AD_PLACEMENTS as readonly string[]).includes(value);
function validHouseAdIdentity(
  value: unknown,
): value is Record<string, unknown> & Pick<HouseAd, 'id' | 'name'> {
  return (
    record(value) &&
    typeof value.id === 'string' &&
    /^[a-zA-Z0-9-]{1,64}$/.test(value.id) &&
    typeof value.name === 'string' &&
    value.name.trim().length > 0 &&
    value.name.length <= 40 &&
    !/[\u0000-\u001f\u007f]/.test(value.name)
  );
}
export function validHouseAd(value: unknown): value is HouseAd {
  return (
    validHouseAdIdentity(value) &&
    houseAdUrl(value.imageUrl) &&
    (value.mobileImageUrl === undefined || houseAdUrl(value.mobileImageUrl)) &&
    houseAdUrl(value.targetUrl)
  );
}
function validCampaignLinks(ad: Record<string, unknown>) {
  const desktop = Number(ad.desktopWeight ?? ad.weight ?? 1),
    mobile = Number(ad.mobileWeight ?? ad.weight ?? 1);
  const legacy = ad.desktopWeight === undefined && ad.mobileWeight === undefined;
  const mobileImage = legacy && ad.mobileImageUrl === undefined ? ad.imageUrl : ad.mobileImageUrl;
  return (
    typeof ad.imageUrl === 'string' &&
    (ad.imageUrl === '' ? desktop === 0 : houseAdUrl(ad.imageUrl)) &&
    (ad.mobileImageUrl === undefined ||
      (ad.mobileImageUrl === '' ? mobile === 0 : houseAdUrl(ad.mobileImageUrl))) &&
    (mobile === 0 || houseAdUrl(mobileImage)) &&
    (ad.targetUrl === '' ? desktop === 0 && mobile === 0 : houseAdUrl(ad.targetUrl))
  );
}
export function validHouseAdConfig(value: unknown): value is HouseAdConfig {
  if (
    !record(value) ||
    !keys(value, [
      'revision',
      'campaigns',
      ...(Object.hasOwn(value, 'settings') ? ['settings'] : []),
    ]) ||
    (value.settings !== undefined && !validAdPlatformSettings(value.settings)) ||
    !Number.isSafeInteger(value.revision) ||
    Number(value.revision) < 0 ||
    !Array.isArray(value.campaigns) ||
    value.campaigns.length > 20
  )
    return false;
  const ids = new Set<string>();
  return value.campaigns.every((ad) => {
    if (
      !record(ad) ||
      !keys(ad, [
        'id',
        'name',
        'imageUrl',
        'targetUrl',
        'enabled',
        'placements',
        ...(Object.hasOwn(ad, 'mobileImageUrl') ? ['mobileImageUrl'] : []),
        ...(Object.hasOwn(ad, 'weight') ? ['weight'] : []),
        ...(Object.hasOwn(ad, 'desktopWeight') ? ['desktopWeight'] : []),
        ...(Object.hasOwn(ad, 'mobileWeight') ? ['mobileWeight'] : []),
      ]) ||
      !validHouseAdIdentity(ad) ||
      (ad.weight !== undefined &&
        (!Number.isInteger(ad.weight) || Number(ad.weight) < 1 || Number(ad.weight) > 1000)) ||
      ['desktopWeight', 'mobileWeight'].some(
        (key) =>
          ad[key] !== undefined &&
          (!Number.isInteger(ad[key]) || Number(ad[key]) < 0 || Number(ad[key]) > 1000),
      ) ||
      !validCampaignLinks(ad) ||
      typeof ad.enabled !== 'boolean' ||
      !Array.isArray(ad.placements) ||
      !ad.placements.length ||
      !ad.placements.every(isHouseAdPlacement) ||
      new Set(ad.placements).size !== ad.placements.length ||
      ids.has(ad.id)
    )
      return false;
    ids.add(ad.id);
    return true;
  });
}
export const houseAdWeight = (ad: HouseAdCampaign, device: HouseAdDevice) =>
  (device === 'mobile' ? ad.mobileWeight : ad.desktopWeight) ?? ad.weight ?? 1;
export function weightedHouseAd(
  campaigns: HouseAdCampaign[],
  placement: HouseAdPlacement,
  ticket?: number,
  device: HouseAdDevice = 'desktop',
): HouseAdCampaign | null {
  const available = campaigns.filter(
    (a) => a.enabled && a.placements.includes(placement) && houseAdWeight(a, device) > 0,
  );
  const total = available.reduce((n, a) => n + houseAdWeight(a, device), 0);
  if (!total) return null;
  if (ticket === undefined) {
    // 拒绝尾部余数，整数票严格等概率；不同位置只在各自已启用投放内抽取。
    const bound = Math.floor(0x100000000 / total) * total;
    let draw: number;
    do {
      draw = crypto.getRandomValues(new Uint32Array(1))[0];
    } while (draw >= bound);
    ticket = draw % total;
  }
  if (!Number.isInteger(ticket) || ticket < 0 || ticket >= total)
    throw Error('invalid-weight-ticket');
  for (const ad of available) {
    ticket -= houseAdWeight(ad, device);
    if (ticket < 0) return ad;
  }
  return null;
}
export function publicHouseAd(ad: HouseAdCampaign, device: HouseAdDevice = 'desktop'): HouseAd {
  return {
    id: ad.id,
    name: ad.name,
    imageUrl: device === 'mobile' ? ad.mobileImageUrl || ad.imageUrl : ad.imageUrl,
    targetUrl: ad.targetUrl,
    ...(ad.mobileImageUrl ? { mobileImageUrl: ad.mobileImageUrl } : {}),
  };
}
export async function boundedAdJson(
  source: Pick<Request, 'body'>,
  maxBytes: number,
): Promise<unknown> {
  if (!source.body) throw new Error('empty-body');
  const reader = source.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0,
    text = '';
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new Error('body-too-large');
      }
      text += decoder.decode(part.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    reader.releaseLock();
  }
}
