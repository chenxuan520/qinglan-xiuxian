import { curioName } from './curio-data.ts';
import { curioArt } from './curio-art.ts';
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
  gift.kind === 'artifact'
    ? treasure(gift.id).name
    : gift.kind === 'curio'
      ? curioName(gift.id)
      : medicineInfo(gift.id)!.name;
const rank = (level: number) => (level ? `${'一二三四五六七八九十'[level - 1]}阶` : '未炼器');

export function isImmortalSuccessor(save: SaveData) {
  return Object.hasOwn(save.chronicle.milestones, 'immortal-successor');
}

export function inheritancePreview(save: SaveData, key = '') {
  const gift = resolveInheritance(save, key);
  if (!gift)
    return '<span class="inheritance-seal" aria-hidden="true">缘</span><div><strong>一言指路，亦是机缘</strong><p>不赠物，少年仍会循着你的指引，从十五岁启程。</p></div>';
  return giftPreview(gift);
}
function giftPreview(gift: BirthInheritance) {
  const art =
    gift.kind === 'artifact'
      ? icon(gift.id)
      : gift.kind === 'curio'
        ? curioArt(gift.id)
        : medicineArt(medicineInfo(gift.id)!);
  const detail =
    gift.kind === 'artifact'
      ? `炼器阶数保留（${rank(gift.level)}）· 法宝只入少年的藏器阁。局内等级与觉醒重新开始，本命由你自行选择。`
      : gift.kind === 'curio'
        ? '赠予一件，收入少年的行囊，持有即获其助益；此物不会再从少年的其他机缘中出现。'
        : '赠予一枚，收入少年的丹囊，由你自行服用。原修士的药效与已服用的提升不会带入。';
  return `${art}<div><strong>${name(gift)}<small>${gift.kind === 'artifact' ? rank(gift.level) : gift.kind === 'curio' ? '一件奇物' : '一枚'}</small></strong><p>${detail}</p></div>`;
}
export function inheritanceContent(save: SaveData) {
  const gifts = inheritanceChoices(save);
  if (!gifts.length) return '';
  const group = (kind: BirthInheritance['kind'], label: string) => {
    const options = gifts.filter((gift) => gift.kind === kind);
    return options.length
      ? `<optgroup label="${label}">${options.map((gift) => `<option value="${gift.kind}:${gift.id}">${name(gift)} · ${gift.kind === 'artifact' ? rank(gift.level) : gift.kind === 'curio' ? '传一件' : `现有 ${save.medicine.bag[gift.id]} 枚，传一枚`}</option>`).join('')}</optgroup>`
      : '';
  };
  return `<section class="inheritance-section" aria-labelledby="inheritance-title"><div class="inheritance-heading"><span class="eyebrow">真仙传承 · 临别机缘</span><h3 id="inheritance-title">留一物，续一程</h3><p>可将一件已收藏法宝、一枚现有丹药，或一件随身奇物赠给青岚渡口的少年。少年的灵根仍随机，本命由你自行选择。</p></div><label class="inheritance-label" for="reincarnate-inheritance">临行赠物 <span>任选其一，也可只留指引</span></label><select id="reincarnate-inheritance"><option value="">不赠物 · 只留指引</option>${group('artifact', '法宝 · 保留炼器阶数')}${group('medicine', '丹药 · 仅传一枚')}${group('curio', '奇物 · 仅传一件')}</select><div class="inheritance-preview" aria-live="polite">${inheritancePreview(save)}</div></section>`;
}
export function birthInheritanceNotice(gift: BirthInheritance | null) {
  return gift
    ? `<div class="inheritance-arrival"><span class="eyebrow">前人所赠 · 已收入行囊</span><div class="inheritance-preview">${giftPreview(gift)}</div></div>`
    : '';
}
