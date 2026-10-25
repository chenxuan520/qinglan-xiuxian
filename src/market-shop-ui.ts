import { TREASURES, treasure } from './data.ts';
import { MEDICINES, medicineInfo } from './medicine-data.ts';
import { medicineArt } from './medicine-ui.ts';
import { icon } from './icons.ts';
import type { SaveData } from './progress.ts';
import { auctionItemName } from './auction-items.ts';
import { serviceEscape as esc } from './sect-service-ui.ts';
import { marketShopQuote, marketShopStamp, type MarketShopId } from './market-shop.ts';

export interface MarketShopSelection {
  from?: string;
  to?: string;
  artifact?: string;
}
export function marketShopContent(
  save: SaveData,
  venue: MarketShopId,
  unfinished = false,
  selection: MarketShopSelection = {},
) {
  if (venue !== 'medicine' && venue !== 'stalls') return '';
  const quote = (choice: string) => {
    const q = marketShopQuote(save, venue, choice, unfinished);
    if (!q.title) return `<p class="panel-note">${esc(q.reason)}</p>`;
    const item = q.receive[0];
    const art =
      item.kind === 'medicine' ? medicineArt(medicineInfo(item.id)!) : icon(selection.artifact!);
    return `<article class="market-venue-card service-quote"><h3>${art}${esc(q.title)}</h3>${q.give.length ? `<p>交出：${q.give.map((i) => `${auctionItemName(i)}${i.kind === 'artifact' ? `（炼器${i.forgeLevel}阶）` : ''} ×${i.quantity}`).join('、')}</p>` : ''}<p><strong>获得：${q.receive.map((i) => `${auctionItemName(i)} ×${i.quantity}`).join('、')}</strong></p>${q.receive
      .filter((i) => i.kind === 'medicine')
      .map((i) => `<p class="panel-note">${auctionItemName(i)}：${medicineInfo(i.id)!.desc}</p>`)
      .join(
        '',
      )}${q.kind === 'salvage' ? '<p class="panel-note">拆解后此宝及其炼器阶数一并失去，只返还用材，不返灵石。</p>' : ''}<div class="service-price"><strong>${q.stones ? `${q.stones} 灵石` : '不收灵石'}</strong><span>半年${q.reserve ? ` · 另预留${q.reserve}灵石供奉` : ''}</span></div><button class="${q.kind === 'salvage' ? 'secondary' : 'primary'}-button" data-action="market-venue-shop" data-id="${esc(choice)}" data-stamp="${esc(marketShopStamp(save, venue, choice))}" ${q.reason ? 'disabled' : ''}>${esc(q.reason || (q.kind === 'exchange' ? '以两换一 · 半年' : '拆解这件旧器'))}</button></article>`;
  };
  if (venue === 'medicine') {
    const from = medicineInfo(selection.from ?? ''),
      to = medicineInfo(selection.to ?? '');
    const available = MEDICINES.filter(
      (m) => m.years && (save.medicine.bag[m.id] > 0 || m.id === from?.id),
    );
    const choices = from?.years
      ? MEDICINES.filter((m) => m.years && m.tier === from.tier && m.id !== from.id)
      : [];
    const target = choices.some((m) => m.id === to?.id) ? to!.id : '';
    return `<h3>余丹调剂</h3><p class="panel-note">两份同名时效丹，换一份同品级的合用之丹。每次耗时半年，不收灵石；办毕后隔十年再换。本世珍品不参与，药方与已服药效照旧。</p>${available.length ? `<div class="market-venue-grid"><label class="service-field">拿出哪味余丹<select id="shop-from"><option value="">请选择</option>${available.map((m) => `<option value="${m.id}" ${from?.id === m.id ? 'selected' : ''}>${m.name} · ${m.tier}</option>`).join('')}</select>${from ? `<small>当前持有${save.medicine.bag[from.id] || 0}份</small>` : ''}</label><label class="service-field">想换取的丹药<select id="shop-to" ${!from?.years ? 'disabled' : ''}><option value="">${from ? '请选择' : '先选余丹'}</option>${choices.map((m) => `<option value="${m.id}" ${target === m.id ? 'selected' : ''}>${m.name}</option>`).join('')}</select>${target ? `<small>当前持有${save.medicine.bag[target] || 0}份</small>` : ''}</label></div>${from && target ? quote(`${from.id}@${target}`) : ''}` : '<p class="market-inspection">丹囊中尚无时效丹。留有用不上的余丹时，可带来调剂。</p>'}`;
  }
  const selected = TREASURES.find((t) => t.id === selection.artifact);
  const choices = TREASURES.filter(
    (t) => t.id !== save.starter && (save.artifacts.includes(t.id) || t.id === selected?.id),
  );
  return `<h3>旧器拆解</h3><p class="panel-note">摊主替你拆去闲置法宝，返还炼器累计所用玄铁的四成，零头舍去。每件耗时半年，不返灵石；本命不可拆，未炼器之物无用材可返。</p>${choices.length ? `<label class="service-field">选择非本命法宝<select id="shop-artifact"><option value="">请选择</option>${choices.map((t) => `<option value="${t.id}" ${t.id === selected?.id ? 'selected' : ''}>${t.name} · ${save.artifacts.includes(t.id) ? `炼器${save.forge[t.id] || 0}阶` : '已不在收藏'}</option>`).join('')}</select></label>${selected ? quote(selected.id) : ''}` : '<p class="market-inspection">暂无可拆解的闲置法宝。</p>'}`;
}

export function marketShopConfirmation(save: SaveData, choice: string, stamp: string) {
  const q = marketShopQuote(save, 'stalls', choice);
  return `<article class="market-venue-card service-quote" data-shop-confirm><h3>拆解${treasure(choice).name}？</h3><p>这件炼器${q.give[0].forgeLevel}阶法宝将从收藏中移除，返还<strong>${q.receive[0].quantity}玄铁</strong>，耗时半年。</p><div class="result-actions"><button class="secondary-button" data-action="market-venue-shop-cancel" data-id="${choice}">留下此宝</button><button class="primary-button" data-action="market-venue-shop-confirm" data-id="${choice}" data-stamp="${esc(stamp)}">确认拆解</button></div></article>`;
}
