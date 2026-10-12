import { playerSpriteBackground } from './player-appearance.ts';
import { medicineArt } from './medicine-ui.ts';
import { npcDialogueContent, townStatus } from './mortal-ui.ts';
import { marketMedicinePool, marketRelation, type MarketCultivator } from './sect-market-data.ts';
import { sectMarketOffer, sectMarketExchangeReason } from './sect-market.ts';
import { realmInfo, type SaveData } from './progress.ts';
import { FINAL_TRIAL_STAGE } from './data.ts';

export function sectMarketPage(save: SaveData, fullscreenButton: string) {
  return `<main class="town-scene sect-market-scene" aria-label="宗门坊市游历"><div id="sect-market-view" class="town-view" tabindex="0" role="region" aria-label="宗门坊市，触屏拖动或方向键移动，走近修士交谈"></div><header class="town-scene-heading"><div class="town-hud"><h2>宗门坊市</h2><small>同道往来 · 坊间机缘</small><div id="town-status">${townStatus(save)}</div><small>现实 1 分钟 = 1 年</small></div><div class="town-scene-actions">${fullscreenButton}<button class="secondary-button" data-action="sect-market-exit">离开坊市</button></div></header><footer class="town-scene-controls"><p><span class="keyboard-hint">WASD / 方向键移动</span><span class="touch-hint">按住空白处拖动行走</span><br>走近修士，<span class="keyboard-hint">按 E 或</span>点击交谈</p><button class="primary-button" data-action="sect-market-talk" disabled>走近修士可交谈</button></footer></main>`;
}
export function sectMarketTradeContent(save: SaveData, npc: MarketCultivator, selected?: string) {
  const state = save.mortal.sectMarket;
  const receive = sectMarketOffer(save, npc.id);
  if (!state || !receive) return '';
  const choices = marketMedicinePool(state, npc.id).filter(
    (m) => m.id !== receive.id && !!m.years === !!receive.years,
  );
  const give =
    choices.find((m) => m.id === selected) ??
    choices.find((m) => (save.medicine.bag[m.id] || 0) >= 2) ??
    choices[0];
  const reason = sectMarketExchangeReason(save, npc.id, give.id, state.visit);
  const traded = state.exchanged.includes(npc.id);
  return `<section class="sect-market-trade" aria-label="丹药互换"><h3>互通有无</h3><div class="sect-market-offer">${medicineArt(receive)}<div><small>${receive.years ? receive.tier : '本世珍品'} · 对方拿出的丹药</small><strong>${receive.name} ×1</strong><p>${receive.desc}</p><small>${receive.years ? `药效 ${receive.years} 年` : '本世永久效果，服用上限沿用丹药规则'} · 丹囊现有 ${save.medicine.bag[receive.id] || 0} 份</small></div></div>${traded ? '<p class="panel-note">本批已互换，丹药已收入丹囊。</p>' : `<label class="sect-market-give">你拿出同品级、同类丹药两份<select id="sect-market-give" aria-label="用于互换的丹药">${choices.map((m) => `<option value="${m.id}" ${m.id === give.id ? 'selected' : ''}>${m.name} ×2（持有 ${save.medicine.bag[m.id] || 0}）</option>`).join('')}</select></label><button class="secondary-button" data-action="sect-market-exchange" data-id="${npc.id}" data-visit="${state.visit}" ${reason ? 'disabled' : ''}>${reason || `以${give.name} ×2 换${receive.name} ×1`}</button>`}<small class="panel-note">每位来访修士本次限换一次，离开后重新进入会遇到新的修士。<br>限时丹与限时丹互换，本世永久丹与本世永久丹互换。互换不消耗灵石、不增加年岁，所得丹药收入丹囊，出发前自行服用。</small></section>`;
}
export function sectMarketEventContent(save: SaveData, npc: MarketCultivator) {
  const relation = marketRelation(
    npc.realmIndex,
    realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).index,
  );
  return `<div class="sect-market-profile"><span class="sect-market-portrait" aria-hidden="true" style="background:${playerSpriteBackground(npc.path)}"></span><div><strong>${relation} · ${npc.realm} · ${npc.role}</strong><p>同道在此暂歇，互通见闻与行囊中的余丹。</p></div></div>${npcDialogueContent(npc.id, npc.name)}<div id="sect-market-trade">${sectMarketTradeContent(save, npc)}</div><button class="secondary-button" data-action="close">回到坊市</button>`;
}
