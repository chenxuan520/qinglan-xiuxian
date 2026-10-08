import {
  localJourneyAppraisal,
  type JourneyAppraisal,
  type JourneyAppraisalFacts,
} from './journey-appraisal.ts';
import { validJourneyAppraisal } from './journey-appraisal-ai-protocol.ts';
import { GAME_SITE_URL, JOURNEY_APPRAISAL_SETTINGS, NPC_AI_SETTINGS } from './setting.ts';

const cache = new Map<string, JourneyAppraisal>();
const baseUrl = (import.meta.env?.VITE_NPC_AI_URL || NPC_AI_SETTINGS.baseUrl).replace(/\/$/, '');
export function journeyAppraisalAiOrigin(origin: string) {
  if (origin === new URL(GAME_SITE_URL).origin) return true;
  try {
    const url = new URL(origin);
    return (
      url.origin === origin &&
      ['http:', 'https:'].includes(url.protocol) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

export async function resolveJourneyAppraisal(
  facts: JourneyAppraisalFacts,
  signal: AbortSignal,
  options: { origin?: string; online?: boolean; fetcher?: typeof fetch; timeoutMs?: number } = {},
): Promise<JourneyAppraisal> {
  const fallback = localJourneyAppraisal(facts);
  const origin = options.origin ?? (typeof location === 'undefined' ? '' : location.origin);
  const online = options.online ?? (typeof navigator === 'undefined' || navigator.onLine !== false);
  if (signal.aborted || !online || !journeyAppraisalAiOrigin(origin)) return fallback;
  const key = JSON.stringify(facts);
  const cached = cache.get(key);
  if (cached) return { ...cached };
  const controller = new AbortController();
  let abort = () => {};
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => {
      reject(new Error('appraisal-cancelled'));
      controller.abort();
    };
  });
  signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, options.timeoutMs ?? JOURNEY_APPRAISAL_SETTINGS.requestTimeoutMs);
  try {
    const result = await Promise.race([
      cancelled,
      (async () => {
        const response = await (options.fetcher ?? fetch)(
          `${baseUrl}${JOURNEY_APPRAISAL_SETTINGS.path}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(facts),
            signal: controller.signal,
            credentials: 'omit',
          },
        );
        if (!response.ok) return null;
        const data: unknown = await response.json();
        const appraisal =
          data && typeof data === 'object' && 'appraisal' in data ? data.appraisal : null;
        return validJourneyAppraisal(appraisal, facts) ? appraisal : null;
      })(),
    ]);
    if (!result || signal.aborted || controller.signal.aborted) return fallback;
    if (cache.size >= JOURNEY_APPRAISAL_SETTINGS.cacheEntries)
      cache.delete(cache.keys().next().value!);
    cache.set(key, { ...result });
    return result;
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}
