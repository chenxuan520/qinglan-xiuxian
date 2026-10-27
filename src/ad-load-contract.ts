import {
  isHouseAdDevice,
  isHouseAdPlacement,
  type HouseAdDevice,
  type HouseAdPlacement,
} from './house-ad-contract.ts';

export const AD_LOAD_STAGES = [
  'platform-module',
  'settings',
  'house-module',
  'creative',
  'image',
  'sdk',
] as const;
export const AD_LOAD_ERRORS = ['timeout', 'network', 'http', 'invalid', 'unavailable'] as const;
export const AD_LOAD_BROWSERS = ['via', 'chromium', 'safari', 'firefox', 'other'] as const;
export interface AdLoadDiagnostic {
  version: string;
  placement: HouseAdPlacement;
  device: HouseAdDevice;
  browser: (typeof AD_LOAD_BROWSERS)[number];
  stage: (typeof AD_LOAD_STAGES)[number];
  code: (typeof AD_LOAD_ERRORS)[number];
  status: number;
  elapsed: number;
}
export function validAdLoadDiagnostic(value: unknown): value is AdLoadDiagnostic {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    Object.keys(v).sort().join(',') ===
      'browser,code,device,elapsed,placement,stage,status,version' &&
    typeof v.version === 'string' &&
    /^(dev|v[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9]+-g[a-f0-9]+)?(?:-dirty)?)$/.test(v.version) &&
    v.version.length <= 64 &&
    isHouseAdPlacement(v.placement) &&
    isHouseAdDevice(v.device) &&
    (AD_LOAD_BROWSERS as readonly unknown[]).includes(v.browser) &&
    (AD_LOAD_STAGES as readonly unknown[]).includes(v.stage) &&
    (AD_LOAD_ERRORS as readonly unknown[]).includes(v.code) &&
    Number.isInteger(v.status) &&
    Number(v.status) >= 0 &&
    Number(v.status) <= 599 &&
    Number.isInteger(v.elapsed) &&
    Number(v.elapsed) >= 0 &&
    Number(v.elapsed) <= 60_000
  );
}
