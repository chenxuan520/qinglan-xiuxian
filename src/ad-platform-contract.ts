import { HOUSE_AD_PLACEMENTS } from './house-ad-contract.ts';
import type { HouseAdPlacement } from './house-ad-contract.ts';

export interface AdPlatformSettings {
  provider: 'house' | 'adsense' | 'placeholder';
  adsense: { client: string; testMode: boolean; placements: Record<HouseAdPlacement, string> };
}
export const defaultAdPlatformSettings = (): AdPlatformSettings => ({
  provider: 'house',
  adsense: {
    client: '',
    testMode: false,
    placements: {
      revive: 'qinglan-revive',
      'reward-root': 'qinglan-reward-root',
      'reward-supplies': 'qinglan-reward-supplies',
      lifespan: 'qinglan-lifespan',
    },
  },
});
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (v: Record<string, unknown>, names: string[]) =>
  Object.keys(v).length === names.length && names.every((n) => Object.hasOwn(v, n));
export function validAdPlatformSettings(v: unknown): v is AdPlatformSettings {
  if (
    !object(v) ||
    !keys(v, ['provider', 'adsense']) ||
    !['house', 'adsense', 'placeholder'].includes(String(v.provider)) ||
    !object(v.adsense) ||
    !keys(v.adsense, ['client', 'testMode', 'placements'])
  )
    return false;
  const a = v.adsense;
  return (
    typeof a.client === 'string' &&
    (a.client === '' ? v.provider !== 'adsense' : /^ca-pub-\d{16}$/.test(a.client)) &&
    typeof a.testMode === 'boolean' &&
    object(a.placements) &&
    keys(a.placements, [...HOUSE_AD_PLACEMENTS]) &&
    HOUSE_AD_PLACEMENTS.every(
      (p) =>
        typeof (a.placements as Record<string, unknown>)[p] === 'string' &&
        /^[a-zA-Z0-9_-]{1,80}$/.test(String((a.placements as Record<string, unknown>)[p])),
    )
  );
}
export function adSellerLine(settings: AdPlatformSettings) {
  return settings.adsense.client
    ? `google.com, ${settings.adsense.client.slice(3)}, DIRECT, f08c47fec0942fa0\n`
    : '';
}
