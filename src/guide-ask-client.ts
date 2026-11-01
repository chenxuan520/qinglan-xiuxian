import {
  guideAskBaseUrl,
  GUIDE_ASK_PATH,
  GUIDE_ASK_TIMEOUT,
  GUIDE_ASK_FAILURE,
  GUIDE_ASK_BUSY,
  type GuideAskMessage,
  type GuideAskReply,
} from './guide-ask-contract.ts';
import { guideCorpus } from './guide-corpus.ts';

export function validGuideAskReply(value: unknown): value is GuideAskReply {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  if (typeof data.answer !== 'string' || !data.answer.trim() || data.answer.length > 300)
    return false;
  if (data.source === null) return true;
  if (!data.source || typeof data.source !== 'object') return false;
  const source = data.source as Record<string, unknown>;
  return (
    typeof source.tab === 'string' &&
    typeof source.heading === 'string' &&
    guideCorpus().some(
      (section) => section.tab === source.tab && section.heading === source.heading,
    )
  );
}

export async function requestGuideAnswer(
  question: string,
  history: GuideAskMessage[],
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
  timeoutMs = GUIDE_ASK_TIMEOUT,
): Promise<GuideAskReply> {
  const base = guideAskBaseUrl();
  if (!base || signal.aborted) throw Error(GUIDE_ASK_FAILURE);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort = () => {};
  try {
    const cancelled = new Promise<never>((_resolve, reject) => {
      abort = () => {
        reject(Error(GUIDE_ASK_FAILURE));
        controller.abort();
      };
      signal.addEventListener('abort', abort, { once: true });
      timer = setTimeout(abort, timeoutMs);
      if (signal.aborted) abort();
    });
    const response = (async () => {
      const result = await fetcher(base + GUIDE_ASK_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim(), history: history.slice(-4) }),
        signal: controller.signal,
        credentials: 'omit',
      });
      if (result.status === 429) throw Error(GUIDE_ASK_BUSY);
      if (!result.ok || Number(result.headers.get('Content-Length')) > 8192)
        throw Error(GUIDE_ASK_FAILURE);
      const value: unknown = await result.json();
      if (!validGuideAskReply(value)) throw Error(GUIDE_ASK_FAILURE);
      return value;
    })();
    return await Promise.race([cancelled, response]);
  } catch (error) {
    throw Error(
      error instanceof Error && error.message === GUIDE_ASK_BUSY
        ? GUIDE_ASK_BUSY
        : GUIDE_ASK_FAILURE,
    );
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}
