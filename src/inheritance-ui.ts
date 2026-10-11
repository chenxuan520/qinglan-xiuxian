import { treasure } from './data.ts';
import { medicineInfo } from './medicine-data.ts';
import { medicineArt } from './medicine-ui.ts';
import { icon } from './icons.ts';
import {
  inheritanceChoices,
  resolveInheritance,
  type BirthInheritance,
  type SaveData,
} from './progress.ts';

const name = (gift: BirthInheritance) =>
  gift.kind === 'artifact' ? treasure(gift.id).name : medicineInfo(gift.id)!.name;
const rank = (level: number) => (level ? `${'一二三四五六七八九十'[level - 1]}阶` : '未炼器');

export function inheritancePreview(save: SaveData, key = '') {
  const gift = resolveInheritance(save, key);
  if (!gift)
    return '<span class="inheritance-seal" aria-hidden="true">缘</span><div><strong>轻装再启程</strong><p>不留遗物，新一世从头修行。</p></div>';
  return giftPreview(gift);
}
function giftPreview(gift: BirthInheritance) {
  const art = gift.kind === 'artifact' ? icon(gift.id) : medicineArt(medicineInfo(gift.id)!);
  const detail =
    gift.kind === 'artifact'
      ? `炼器阶数保留（${rank(gift.level)}）· 法宝只入新一世藏器阁。局内等级与觉醒重新开始，本命由你自行选择。`
      : '传下一枚，收入新一世丹囊，由你自行服用。此世药效与已服用的提升不会带入。';
  return `${art}<div><strong>${name(gift)}<small>${gift.kind === 'artifact' ? rank(gift.level) : '一枚'}</small></strong><p>${detail}</p></div>`;
}
export function inheritanceContent(save: SaveData) {
  const gifts = inheritanceChoices(save);
  if (!gifts.length) return '';
  const group = (kind: BirthInheritance['kind'], label: string) => {
    const options = gifts.filter((gift) => gift.kind === kind);
    return options.length
      ? `<optgroup label="${label}">${options.map((gift) => `<option value="${gift.kind}:${gift.id}">${name(gift)} · ${gift.kind === 'artifact' ? rank(gift.level) : `现有 ${save.medicine.bag[gift.id]} 枚，传一枚`}</option>`).join('')}</optgroup>`
      : '';
  };
  return `<section class="inheritance-section" aria-labelledby="inheritance-title"><div class="inheritance-heading"><span class="eyebrow">真仙传承</span><h3 id="inheritance-title">留一物，续一程</h3><p>可将一件已收藏法宝，或一枚现有丹药留给后人。灵根仍随机，本命不自动更换。</p></div><label class="inheritance-label" for="reincarnate-inheritance">此世遗物 <span>任选其一，也可不传承</span></label><select id="reincarnate-inheritance"><option value="">不传承遗物</option>${group('artifact', '法宝 · 保留炼器阶数')}${group('medicine', '丹药 · 仅传一枚')}</select><div class="inheritance-preview" aria-live="polite">${inheritancePreview(save)}</div></section>`;
}
export function birthInheritanceNotice(gift: BirthInheritance | null) {
  return gift
    ? `<div class="inheritance-arrival"><span class="eyebrow">前人遗物 · 已随你启程</span><div class="inheritance-preview">${giftPreview(gift)}</div></div>`
    : '';
}
