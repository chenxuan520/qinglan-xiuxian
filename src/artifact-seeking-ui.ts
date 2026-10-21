import { ELEMENTS } from './data.ts';
import type { SaveData } from './progress.ts';
import { icon } from './icons.ts';
import { seekingOptions, seekingQuote } from './artifact-seeking.ts';
import { venueStamp } from './market-venues.ts';
import { serviceEscape as esc } from './sect-service-ui.ts';

export interface SeekingSelection {
  school?: string;
  element?: string;
  id?: string;
}
export function seekingContent(
  save: SaveData,
  unfinished = false,
  selection: SeekingSelection = {},
) {
  const { school = '', element = '', id = '' } = selection;
  const choices = seekingOptions(save).filter(
    (t) => (!school || t.school === school) && (!element || t.element === element),
  );
  const selected = choices.find((t) => t.id === id),
    q = seekingQuote(save, selected?.id ?? '', false, unfinished);
  return `<h3>指名寻访</h3><p class="panel-note">筑基后可托法器阁寻一件尚未收藏的法宝，每件法宝各有机会与报价，机会越高酬金越高，行情每十年轮换。每次耗时一年，可能落空，费用不退、不保底；寻得后零阶入藏，本命不变。与执事堂托付、寻物共用办毕后十年间隔。</p><div class="seeking-filters"><label class="service-field">流派<select id="seeking-school"><option value="">全部流派</option>${[
    ['orthodox', '正道'],
    ['demonic', '魔道'],
  ]
    .map(([v, n]) => `<option value="${v}" ${school === v ? 'selected' : ''}>${n}</option>`)
    .join(
      '',
    )}</select></label><label class="service-field">五行<select id="seeking-element"><option value="">全部五行</option>${ELEMENTS.map((e) => `<option value="${e.id}" ${element === e.id ? 'selected' : ''}>${e.name}系</option>`).join('')}</select></label></div><label class="service-field">尚未收藏的法宝<select id="seeking-item"><option value="">${choices.length ? '请选择法宝' : '已无符合条件的法宝'}</option>${choices.map((t) => `<option value="${t.id}" ${selected?.id === t.id ? 'selected' : ''}>${t.name}</option>`).join('')}</select></label>${selected ? `<article class="market-venue-card service-quote"><h3>${icon(selected.id)}${selected.name}</h3><p>本次寻得机会 ${q.chance}% · 未获不退费，寻得后炼器零阶入藏。</p><div class="service-price"><strong>${q.price} 灵石</strong><span>一年${q.reserve ? ` · 另预留${q.reserve}灵石供奉` : ''}</span></div><button class="primary-button" data-action="market-venue-direct-seek" data-id="${selected.id}" data-stamp="${esc(venueStamp(save))}" data-cost-stones="${q.price + q.reserve}" ${q.reason ? 'disabled' : ''}>${esc(q.reason || '委托寻访')}</button></article>` : ''}`;
}
