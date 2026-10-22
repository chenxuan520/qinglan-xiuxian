import { STANDALONE } from './build-mode.ts';
import { DEBUG_SETTINGS } from './setting.ts';

export async function debugAccess(endpoint: string, fetcher: typeof fetch = fetch) {
  if (STANDALONE) return 'disabled' as const;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEBUG_SETTINGS.requestTimeoutMs);
  try {
    const response = await fetcher(`${endpoint}${DEBUG_SETTINGS.path}`, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
      signal: controller.signal,
    });
    if (!response.ok) return 'unavailable' as const;
    const result: unknown = await response.json();
    if (
      !result ||
      typeof result !== 'object' ||
      !('enabled' in result) ||
      typeof result.enabled !== 'boolean'
    )
      return 'unavailable' as const;
    return result.enabled ? ('enabled' as const) : ('disabled' as const);
  } catch {
    return 'unavailable' as const;
  } finally {
    clearTimeout(timer);
  }
}
