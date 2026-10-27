import { CURIOS } from './curio-info.ts';
import { curioArt } from './curio-art.ts';
import { ownsCurio, acquiredCurio } from './curio-data.ts';
import type { SaveData } from './progress.ts';
import { curioSeekingQuote } from './curio-market.ts';
import { venueStamp } from './market-venues.ts';

export function curioSeekingContent(save: SaveData, sect = false, unfinished = false) {
  return `<details class="disclosure curio-seeking"><summary>寻古问缘 · 奇物寻访</summary><p class="panel-note">筑基后可寻访古修奇物。每次耗十年、支付明示酬金，未获也不退费。首访机会20%，每次未获提高10个百分点，最高70%，不保证第几次得手。办毕后与法器阁、执事堂托付共用十年间隔。线索随本世保留，已得之物不再受理，掌天瓶只待偶然机缘。</p><div class="curio-grid">${CURIOS.slice(
    1,
  )
    .filter((c) => !acquiredCurio(save, c.id))
    .map((c) => {
      const q = curioSeekingQuote(save, c.id, sect, unfinished);
      return `<article class="curio-card"><header>${curioArt(c.id)}<div><h3>${c.name}</h3><small>已寻访 ${q.progress} 次 · 本次机会 ${q.chance}%</small></div></header><p>${c.effect}</p><small>本次${q.price.toLocaleString('zh-CN', { useGrouping: false })}灵石 · 十年${q.reserve ? ` · 另预留供奉${q.reserve}灵石` : ''}</small><button class="secondary-button" data-action="${sect ? 'sect-service-curio' : 'market-venue-curio'}" data-id="${c.id}" data-stamp="${venueStamp(save)}" data-cost-stones="${q.price + q.reserve}" ${q.reason ? 'disabled' : ''}>${q.reason || '托付寻访'}</button></article>`;
    })
    .join('')}</div></details>`;
}
export function curioCollection(save: SaveData) {
  const owned = CURIOS.filter((c) => ownsCurio(save, c.id)).length;
  return `<p class="panel-note">奇物已收藏 ${owned} / ${CURIOS.length} 件 · 随身珍藏，持有即获其助益。每件奇物本世仅有一件，获得后不再从其他机缘中出现；售出即失去助益，本世无法再得。寻访、拍卖和修士机缘也能觅得奇物。普通轮回不保留。</p><div class="curio-grid">${CURIOS.map((c) => `<article class="curio-card ${ownsCurio(save, c.id) ? 'is-owned' : 'is-unowned'}"><header>${curioArt(c.id)}<div><h3>${c.name}</h3><small>${ownsCurio(save, c.id) ? `持有 ${save.curios.bag[c.id]} 件 · 生效中` : acquiredCurio(save, c.id) ? '此缘已尽 · 本世不再出现' : '尚未结缘'}</small></div></header><p>${c.effect}</p><small>${c.story}</small><small class="curio-source">${c.id === 'heaven-bottle' ? '难得机缘 · 妖王遗宝、修士私下寻古或小镇逢仙偶获' : `妖王遗宝 · 坊市寄拍 · 法器阁或宗门寻访 · 小镇逢仙${save.curios.seeking[c.id] ? `（已访${save.curios.seeking[c.id]}次）` : ''}`}</small></article>`).join('')}</div>`;
}
