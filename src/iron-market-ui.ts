import type { SaveData } from './progress.ts';
import { ironMarket, ironTradeQuote } from './iron-market.ts';
import { IRON_MARKET_LIMIT } from './iron-market-data.ts';
export function ironMarketContent(save: SaveData, selected = 10) {
  const market = ironMarket(save);
  const quantities = [
    ...new Set([
      1,
      10,
      50,
      100,
      ...(market.remaining > 0 ? [market.remaining] : []),
      ...(save.iron > 0 ? [save.iron] : []),
    ]),
  ].sort((a, b) => a - b);
  const quantity = quantities.includes(selected) ? selected : 10;
  const buy = ironTradeQuote(save, true, quantity),
    sell = ironTradeQuote(save, false, quantity);
  return `<section class="iron-market-trade" id="iron-market-trade" aria-label="玄铁交易"><h3>灵材行情 <small>${market.label}</small></h3><p>每枚玄铁：买入 ${market.buy} 灵石 · 卖出 ${market.sell} 灵石</p><p class="panel-note">当前持有 ${save.stones} 灵石、${save.iron} 玄铁。<br>本期还可购 ${market.remaining} / ${IRON_MARKET_LIMIT} 枚 · ${market.nextAge} 岁补货并调整行情</p><label class="sect-market-give">本次交易数量<select id="iron-quantity" aria-label="玄铁交易数量">${quantities.map((n) => `<option value="${n}" ${n === quantity ? 'selected' : ''}>${n} 枚${n === save.iron ? '（当前全部玄铁）' : ''}</option>`).join('')}</select></label><p class="panel-note">单次买10枚起九五折，50枚起九折；出售按本期收购价结算。每十个游戏年补货。</p><div class="save-actions"><button class="secondary-button" data-action="mortal-buy" data-id="${market.period}:${quantity}" data-cost-stones="${buy.total}" ${buy.reason && buy.reason !== '灵石不足' ? 'disabled' : ''}>${buy.reason || `购入 ${quantity} 枚 · ${buy.total} 灵石${buy.discount ? `（省${market.buy * quantity - buy.total}）` : ''}`}</button><button class="secondary-button" data-action="mortal-sell" data-id="${market.period}:${quantity}" ${sell.reason ? 'disabled' : ''}>${sell.reason || `售出 ${quantity} 枚 · 得 ${sell.total} 灵石`}</button></div><p class="panel-note" id="iron-trade-status" aria-live="polite"></p></section>`;
}
