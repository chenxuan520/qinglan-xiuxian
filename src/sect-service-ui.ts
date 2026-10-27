import { curioSeekingContent } from './curio-ui.ts';
import { treasure } from './data.ts';
import { SECTS } from './mortal-data.ts';
import { SECT_SPECIALTIES } from './sect-service-data.ts';
import type { SaveData } from './progress.ts';
import { sectRole, studyPlan } from './mortal.ts';
import { icon } from './icons.ts';
import { auctionItemName } from './auction-items.ts';
import { medicineInfo } from './medicine-data.ts';
import { sectArt } from './mortal-ui.ts';
import {
  sectServiceChoices,
  sectServiceQuote,
  sectServiceStamp,
  sectServiceTier,
} from './sect-services.ts';

export const serviceEscape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
export function sectServiceContent(save: SaveData, unfinished = false, selected = '') {
  const sect = SECTS.find((s) => s.id === save.mortal.member?.id);
  if (!sect) return '<p>尚未拜入宗门。</p>';
  const spec = SECT_SPECIALTIES[sect.id],
    choices = sectServiceChoices(save);
  if (!choices.some((c) => c.id === selected))
    selected = choices.length === 1 && !['bone', 'devour'].includes(sect.id) ? choices[0].id : '';
  const empty = ['power', 'frenzy'].includes(sect.id)
    ? '已无符合代寻条件的未藏法宝。本门只代寻同流派、本命同五行或与本门功法配套的法宝；其他未藏法宝可到坊市法器阁寻访。'
    : sect.id === 'bone'
      ? '暂无可献出的非本命法宝。当前本命受保护；尚无炼器投入的零估值入门器不能抵费。献器会连同炼器阶数转出，请按报价取舍。'
      : sect.id === 'duration'
        ? '尚无已掌握且关卡已解锁的灵品、限时珍品丹方。可先在丹药页购方或到坊市论道，再来药庐代炼。'
        : sect.id === 'crit'
          ? '尚无可参悟的样丹。需持有一份已解锁关卡的灵品或限时珍品，且尚未掌握其丹方；已有丹方无需重复参悟。'
          : sect.id === 'devour'
            ? '丹囊暂无可献出的时效丹。本世永久珍品不参与；余丹抵价可连续淬体多阶，差额补灵石，不会自动服用；满阶前用不完抵价则保留丹药。'
            : '暂无合适的换丹组合。需丹囊现有时效丹与本门可提供之丹相合；境界、关卡和品级要求照常生效，估值差超过35%的组合不列入报价。';
  const q = sectServiceQuote(save, selected, unfinished),
    esc = serviceEscape;
  const result =
    q.levels === 0
      ? '暂不献物 · 物品保留'
      : q.seek
        ? `${icon(q.seek)}${treasure(q.seek).name}`
        : q.receive
          ? `${medicineInfo(q.receive)!.name} ×${q.receiveCount ?? 1}`
          : q.recipe
            ? `${medicineInfo(q.recipe)!.name}丹方 · 样丹保留`
            : q.study
              ? `本门精研 +${q.levels ?? 1}阶 · 至${studyPlan(save).level + (q.levels ?? 1)}阶`
              : q.train
                ? `${{ vitality: '淬体', power: '悟道', speed: '身法' }[q.train]} +${q.levels ?? 1}阶 · 至${save.training[q.train] + (q.levels ?? 1)}阶`
                : '';
  return `<div class="sect-service-hero">${sectArt(sect)}<div><small>${sectRole(save)} · 本门专长</small><h3>${spec.title}</h3><p>${spec.text}</p></div></div><div id="sect-service-result" role="status"></div><p class="panel-note">筑基开放 · 部分专长随化神、炼虚职务改善条件，以报价为准 · 当前为${['弟子', '执事', '长老'][sectServiceTier(save)]}待遇。每十年可办一桩专长，所有宗门共用，换宗仍须等满十年；浏览不计龄。</p>${choices.length ? `<label class="service-field">选择本次事项<select id="sect-service-choice"><option value="">请选择</option>${choices.map((c) => `<option value="${esc(c.id)}" ${selected === c.id ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select></label>` : `<p class="market-inspection">${empty}</p>`}${selected ? `<article class="market-venue-card service-quote"><small>${q.seek ? '本次寻访' : '本次所得'}</small><h3>${result}</h3><p>${esc(q.detail)}</p>${q.give.length ? `<p class="service-give">交出：${q.give.map((i) => `${auctionItemName(i)}${i.kind === 'artifact' ? `（炼器${i.forgeLevel}阶）` : ''} ×${i.quantity}`).join('、')}</p>` : ''}<div class="service-price"><strong>${q.stones} 灵石${q.iron ? ` · ${q.iron} 玄铁` : ''}</strong><span>${q.years} 年岁${q.reserve ? ` · 另预留${q.reserve}灵石供奉` : ''}</span></div><button class="primary-button" data-action="sect-service-act" data-id="${esc(selected)}" data-stamp="${esc(sectServiceStamp(save))}" data-cost-stones="${q.stones + q.reserve}" data-cost-iron="${q.iron}" ${q.reason ? 'disabled' : ''}>${esc(q.reason || (q.give.length ? '按上述交割并办理' : '办理本次事项'))}</button></article>` : ''}<p class="panel-note">点击即消耗明示资源与年岁并结清，不需等待现实时间。办理前须备足费用与到期供奉，并留有足够寿元；未结历练或待渡天劫请先处理。</p>${curioSeekingContent(save, true, unfinished)}${save.mortal.sectServices?.receipts.length ? `<details class="market-venue-history"><summary>本世专长往来</summary>${save.mortal.sectServices.receipts.map((r) => `<p><small>${r.at.toFixed(1)}岁</small><br>${esc(r.text)}</p>`).join('')}</details>` : ''}<button class="secondary-button" data-action="close">返回宗门</button>`;
}
