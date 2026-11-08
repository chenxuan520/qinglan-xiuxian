import { STANDALONE } from '../core/build-mode.ts';
import { NPC_AI_SETTINGS } from '../core/setting.ts';

export const GUIDE_ASK_PATH = '/guide-ask';
export const GUIDE_ASK_TIMEOUT = 10000;
export const GUIDE_ASK_FAILURE = '暂时联系不上答疑人，请稍后再试。';
export const GUIDE_ASK_BUSY = '问得太快了，歇一口气再问。';
export interface GuideAskMessage {
  role: 'user' | 'assistant';
  content: string;
}
export interface GuideAskReply {
  answer: string;
  source: { tab: string; heading: string } | null;
}
export function guideAskBaseUrl() {
  return STANDALONE || !NPC_AI_SETTINGS.baseUrl
    ? ''
    : (
        (import.meta as ImportMeta & { env?: { VITE_NPC_AI_URL?: string } }).env?.VITE_NPC_AI_URL ||
        NPC_AI_SETTINGS.baseUrl
      ).replace(/\/$/, '');
}
