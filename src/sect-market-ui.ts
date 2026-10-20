import { playerSpriteBackground } from './player-appearance.ts';
import { medicineArt } from './medicine-ui.ts';
import { npcDialogueContent } from './mortal-ui.ts';
import { marketRealmLabel, marketRelation, type MarketCultivator } from './sect-market-data.ts';
import { sectMarketOffer, sectMarketExchangeReason, sectMarketDeals } from './sect-market.ts';
import { exchangeGiveText, exchangeItemText, exchangeOwned } from './market-exchange.ts';
import { realmInfo, type SaveData } from './progress.ts';
import { FINAL_TRIAL_STAGE } from './data.ts';
import { marketSocialContent } from './market-social-ui.ts';
import { marketWorldScene } from './market-social.ts';
import { marketTradeMotive } from './market-trade-motives.ts';
const text = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

export function sectMarketTradeContent(
  save: SaveData,
  npc: MarketCultivator,
  selected?: string,
  unfinished = false,
) {
  const state = save.mortal.sectMarket,
    receive = sectMarketOffer(save, npc.id);
  if (!state || !receive) return '';
  const deals = sectMarketDeals(save, npc.id),
    deal =
      deals.find((d) => d.id === selected) ??
      deals.find(
        (d) =>
          exchangeOwned(save, d) && (!unfinished || !d.give.some((i) => i.kind === 'artifact')),
      ) ??
      deals[0];
  const traded = state.exchanged.includes(npc.id),
    reason = deal
      ? sectMarketExchangeReason(save, npc.id, deal.id, state.visit, unfinished)
      : '暂无合适报价';
  const motive = marketTradeMotive(save, npc.id);
  const quantity = traded ? '' : ` ×${deal?.receive.quantity ?? 1}`;
  return `<section class="sect-market-trade" aria-label="物品互换"><h3>互通有无</h3>${motive ? `<p class="market-trade-motive"><strong>${text(motive.title)}</strong><br>${text(motive.disclosure)}</p>${motive.friendText ? `<p class="market-inspection">${text(motive.friendText)}</p>` : ''}` : ''}<div class="sect-market-offer">${medicineArt(receive)}<div><small>${receive.years ? receive.tier : '本世珍品'} · 对方愿换出的丹药</small><strong>${receive.name}${quantity}</strong><p>${receive.desc}</p><small>${receive.years ? `药效 ${receive.years} 年` : '本世永久效果，服用上限不变'} · 丹囊现有 ${save.medicine.bag[receive.id] || 0} 份</small></div></div>${traded ? '<p class="panel-note">本批已互换，丹药已收入丹囊。</p>' : `<label class="sect-market-give">对方愿收的物品<select id="sect-market-give" aria-label="选择互换报价">${deals.map((d) => `<option value="${d.id}" ${d.id === deal?.id ? 'selected' : ''}>${exchangeGiveText(d)} → ${exchangeItemText(d.receive)}${d.receiveValue > d.giveValue ? ' · 急需让利' : ''}${exchangeOwned(save, d) ? '' : '（物品不足）'}</option>`).join('')}</select></label>${deal ? `<div class="market-exchange-summary"><p>你交出：<strong>${exchangeGiveText(deal)}</strong></p><p>你获得：<strong>${exchangeItemText(deal.receive)}</strong></p><small>参考估值 ${deal.giveValue} 换 ${deal.receiveValue}</small>${deal.benefitText ? `<p class="market-inspection">${text(deal.benefitText)}</p>` : ''}${deal.give.some((i) => i.kind === 'artifact') ? '<p class="panel-note">交出的法宝会移出收藏，炼器阶数随物转出。当前本命不可交换。</p>' : ''}</div>` : ''}<button class="secondary-button" data-action="sect-market-exchange" data-id="${npc.id}" data-visit="${state.visit}" ${reason ? 'disabled' : ''}>${reason || '确认互换'}</button>`}<small class="panel-note">可选丹药、法宝或搭配余丹的组合，双方估值相差不超过15%。每位修士本批限换一次；不花灵石、不增加年岁，所得丹药不自动服用。</small></section>`;
}
export function sectMarketEventContent(save: SaveData, npc: MarketCultivator, unfinished = false) {
  const rank = realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).index;
  const relation = marketRelation(npc.realmIndex, rank);
  return `<div class="sect-market-profile"><span class="sect-market-portrait" aria-hidden="true" style="background:${playerSpriteBackground(npc.path)}"></span><div><strong>${relation} · ${marketRealmLabel(npc, rank)} · ${npc.role}</strong><p>${npc.roaming ? '正沿街逛市，寻找器物或访友。' : '同道在此设摊，互通见闻与行囊中的余丹。'}</p></div></div><p class="market-world-scene">${npc.roaming ? '街上修士各有来路。对方与路过的同道颔首作礼，随手将行囊系得更紧。' : marketWorldScene(save, npc.id)}</p><div id="sect-market-trade">${sectMarketTradeContent(save, npc, undefined, unfinished)}</div><div id="market-social">${npc.roaming ? '' : marketSocialContent(save, npc, unfinished)}</div>${npcDialogueContent(npc.id, npc.name)}<button class="secondary-button" data-action="close">回到坊市</button>`;
}
