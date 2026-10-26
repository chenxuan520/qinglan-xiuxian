// 自营广告只传图片与链接，不接受 HTML、脚本或游戏奖励配置。
export const HOUSE_AD_PLACEMENTS = [
  'revive',
  'reward-root',
  'reward-supplies',
  'lifespan',
] as const;
export type HouseAdPlacement = (typeof HOUSE_AD_PLACEMENTS)[number];
export interface HouseAd {
  id: string;
  name: string;
  imageUrl: string;
  targetUrl: string;
}
export interface HouseAdCampaign extends HouseAd {
  enabled: boolean;
  placements: HouseAdPlacement[];
}
export interface HouseAdConfig {
  revision: number;
  campaigns: HouseAdCampaign[];
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
export function validHouseAd(value: unknown): value is HouseAd {
  return (
    record(value) &&
    typeof value.id === 'string' &&
    /^[a-zA-Z0-9-]{1,64}$/.test(value.id) &&
    typeof value.name === 'string' &&
    value.name.trim().length > 0 &&
    value.name.length <= 40 &&
    !/[\u0000-\u001f\u007f]/.test(value.name) &&
    houseAdUrl(value.imageUrl) &&
    houseAdUrl(value.targetUrl)
  );
}
export function validHouseAdConfig(value: unknown): value is HouseAdConfig {
  if (
    !record(value) ||
    !keys(value, ['revision', 'campaigns']) ||
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
      !keys(ad, ['id', 'name', 'imageUrl', 'targetUrl', 'enabled', 'placements']) ||
      !validHouseAd(ad) ||
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
export function publicHouseAd(ad: HouseAdCampaign): HouseAd {
  return { id: ad.id, name: ad.name, imageUrl: ad.imageUrl, targetUrl: ad.targetUrl };
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
