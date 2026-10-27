import { boundedAdJson } from '../../src/house-ad-contract.ts';

export const AD_LOGIN_ACTION = 'ad_admin_login';
export type TurnstileEnv = Pick<
  HouseAdsEnv,
  'ADMIN_ORIGIN' | 'TURNSTILE_SECRET' | 'TURNSTILE_SITE_KEY'
>;
export function loginSiteKey(env: TurnstileEnv): string | null {
  return typeof env.TURNSTILE_SITE_KEY === 'string' &&
    /^[A-Za-z0-9_-]{10,64}$/.test(env.TURNSTILE_SITE_KEY)
    ? env.TURNSTILE_SITE_KEY
    : null;
}
export async function verifyAdLogin(
  request: Request,
  env: TurnstileEnv,
  token: unknown,
  verifyFetch: typeof fetch,
): Promise<'valid' | 'invalid' | 'unavailable'> {
  if (
    !loginSiteKey(env) ||
    typeof env.TURNSTILE_SECRET !== 'string' ||
    !env.TURNSTILE_SECRET.trim()
  )
    return 'unavailable';
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) return 'invalid';
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 8000);
  try {
    const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token });
    const ip = request.headers.get('CF-Connecting-IP');
    if (ip) body.set('remoteip', ip);
    const response = await verifyFetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      await response.body?.cancel();
      return 'unavailable';
    }
    const result = await boundedAdJson(response, 4096);
    if (!result || typeof result !== 'object') return 'unavailable';
    const value = result as Record<string, unknown>;
    return value.success === true &&
      value.action === AD_LOGIN_ACTION &&
      value.hostname === new URL(env.ADMIN_ORIGIN).hostname
      ? 'valid'
      : 'invalid';
  } catch {
    return 'unavailable';
  } finally {
    clearTimeout(timer);
  }
}
