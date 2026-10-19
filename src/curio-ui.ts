import { CURIOS } from './curio-info.ts';
import { curioArt } from './curio-art.ts';
import { ownsCurio } from './curio-data.ts';
import type { SaveData } from './progress.ts';
import { curioSeekingQuote } from './curio-market.ts';
import { venueStamp } from './market-venues.ts';

export function curioSeekingContent(save: SaveData, sect = false, unfinished = false) {
  return `<details class="disclosure curio-seeking"><summary>寻古问缘 · 奇物寻访</summary><p class="panel-note">筑基后可寻访八件古修奇物。每件需三次托付，每次三年，合计${sect ? '按估值加8%' : '按估值加20%'}酬金；与法器阁、执事堂托付共用十年间隔。线索随本世保留，寻得后不再受理。同名奇物的助益不叠加，掌天瓶只待偶然机缘。</p><div class="curio-grid">${CURIOS.slice(
    1,
  )
    .map((c) => {
      const q = curioSeekingQuote(save, c.id, sect, unfinished);
      return `<article class="curio-card"><header>${curioArt(c.id)}<div><h3>${c.name}</h3><small>${ownsCurio(save, c.id) ? '已持有' : `寻访 ${q.progress} / 3`}</small></div></header><p>${c.effect}</p><small>本次${q.price}灵石 · 三年${q.reserve ? ` · 另预留供奉${q.reserve}灵石` : ''}</small><button class="secondary-button" data-action="${sect ? 'sect-service-curio' : 'market-venue-curio'}" data-id="${c.id}" data-stamp="${venueStamp(save)}" data-cost-stones="${q.price + q.reserve}" ${q.reason ? 'disabled' : ''}>${q.reason || `托付寻访 · ${q.progress + 1}/3`}</button></article>`;
    })
    .join('')}</div></details>`;
}
export function curioCollection(save: SaveData) {
  const owned = CURIOS.filter((c) => ownsCurio(save, c.id)).length;
  return `<div class="book-tabs" role="group" aria-label="藏器分类"><button data-action="book-tab" data-id="treasures" aria-pressed="false">法宝</button><button data-action="book-tab" data-id="passives" aria-pressed="false">功法</button><button data-action="book-tab" data-id="curios" class="active" aria-pressed="true">奇物 <b>${owned}/9</b></button></div><p class="panel-note">随身珍藏，持有即获其助益。同名奇物可留多件，效力只计一份；售出最后一件后不再生效。寻访、拍卖和修士机缘也能觅得奇物。普通轮回不保留，真仙离界可择一赠给少年，与法宝、丹药共用一个名额。</p><div class="curio-grid">${CURIOS.map((c) => `<article class="curio-card ${ownsCurio(save, c.id) ? 'is-owned' : 'is-unowned'}"><header>${curioArt(c.id)}<div><h3>${c.name}</h3><small>${ownsCurio(save, c.id) ? `持有 ${save.curios.bag[c.id]} 件 · 生效中` : '尚未结缘'}</small></div></header><p>${c.effect}</p><small>${c.story}</small><small class="curio-source">${c.id === 'heaven-bottle' ? '难得机缘 · 妖王遗宝或修士私下寻古偶获' : `妖王遗宝 · 坊市寄拍 · 法器阁或宗门寻访${save.curios.seeking[c.id] ? `（${save.curios.seeking[c.id]}/3）` : ''}`}</small></article>`).join('')}</div>`;
}
