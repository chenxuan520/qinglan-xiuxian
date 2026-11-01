import { assetUrl } from './asset-url.ts';
import { itemArt } from './item-art.ts';
import { STANDALONE } from './build-mode.ts';

// 中央街巷旁，不占用建筑、人物或交易入口；复用镇魂幡原图集。
export const MARKET_RANKING_SPOT = { x: 1120, y: 930 };
export const MARKET_RANKING_ART = itemArt('talisman')!;

export function marketRankingContent(enabled: boolean) {
  if (STANDALONE || !enabled) return '';
  const art = MARKET_RANKING_ART;
  return `<a class="market-ranking" href="https://xiuxian.011203.xyz/leaderboard/" target="_blank" rel="noopener" aria-label="查看万魂幡（新标签页）" hidden><span class="market-ranking-art" aria-hidden="true" style="background-image:url('${assetUrl(art.src)}');background-position:${(art.column / 3) * 100}% ${(art.row / (art.rows - 1)) * 100}%"></span><span class="market-ranking-name">万魂幡 ↗</span></a>`;
}
