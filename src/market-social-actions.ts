import type { SaveData } from './progress.ts';
import type { MarketCultivator } from './sect-market-data.ts';
import {
  chooseMarketOpportunity,
  debateMarket,
  fulfillMarketRequest,
  prepareMarketSocial,
} from './market-social.ts';

// 坊间互动只在坊市面板载入后触发，随坊市懒加载包加载，不进入首屏入口。
export function executeMarketSocial(
  next: SaveData,
  action: string,
  id: MarketCultivator['id'],
  visit: number,
  level: number,
  hasPendingRun: boolean,
  debateChoice = 'talk',
) {
  if (!prepareMarketSocial(next)) return { ok: false as const, stale: false };
  const result = [
    'sect-market-debate',
    'sect-market-debate-pay',
    'sect-market-debate-swap',
  ].includes(action)
    ? (action === 'sect-market-debate' && debateChoice === 'talk') ||
      (action === 'sect-market-debate-pay' && debateChoice.startsWith('pay:')) ||
      (action === 'sect-market-debate-swap' && debateChoice.startsWith('swap:'))
      ? debateMarket(next, id, visit, debateChoice)
      : undefined
    : action === 'sect-market-request'
      ? fulfillMarketRequest(next, id, visit, level, hasPendingRun)
      : chooseMarketOpportunity(
          next,
          id,
          visit,
          action === 'sect-market-inspect'
            ? 'inspect'
            : action === 'sect-market-decline'
              ? 'decline'
              : 'accept',
          hasPendingRun,
        );
  if (!result) return { ok: false as const, stale: true };
  const message =
    result.kind === 'debate'
      ? '论道已完成 · 本次所得已记在此处'
      : result.kind === 'exposed'
        ? '核验完成 · 可查看本次线索'
        : result.text.length > 75
          ? `${result.text.slice(0, 72)}…`
          : result.text;
  return { ok: true as const, stale: false, message };
}
