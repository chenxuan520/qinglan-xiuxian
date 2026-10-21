import type { SaveData } from './progress.ts';
import { medicineInfo } from './medicine-data.ts';
import { auctionDues } from './auction.ts';
import { debateQuote, debateRecipeOffer, debateThanks } from './market-debate.ts';
import { debateReason } from './market-social.ts';
import type { MarketCultivatorId } from './sect-market-data.ts';

export function debateContent(save: SaveData, id: MarketCultivatorId, stamp?: string) {
  const offer = debateRecipeOffer(save, id),
    gift = debateThanks(save, id),
    reserve = auctionDues(save, 1);
  const button = (choice: string, label: string) => {
    // 报价先检查全部非资金限制；缺钱仍可走原补给入口，实际结算严格校验原档。
    const reason = debateReason(
      { ...save, stones: Number.MAX_SAFE_INTEGER },
      id,
      save.mortal.sectMarket!.visit,
      choice,
    );
    const cost = (debateQuote(save, id, choice)?.price ?? 0) + reserve;
    const action =
      stamp === undefined
        ? `sect-market-debate${choice === 'talk' ? '' : choice.startsWith('pay:') ? '-pay' : '-swap'}`
        : 'market-venue-act';
    const attrs =
      stamp === undefined
        ? `data-id="${id}" data-visit="${save.mortal.sectMarket!.visit}" data-debate-choice="${choice}"`
        : `data-id="debate@${id}@${choice}" data-stamp="${stamp}"`;
    return `<button class="secondary-button" data-action="${action}" ${attrs} data-cost-stones="${cost}" ${reason ? 'disabled' : ''}>${reason || label}</button>`;
  };
  return `${reserve ? `<p class="panel-note">本次一年内到期供奉另计${reserve}灵石，办理前须一并备足；交流、抄录或互授都会照常结清供奉。</p>` : ''}<p>普通交流、抄录丹方、互授与讲法共用十年一次机会，本次只能择一。免费交流本命与根基的取舍，耗时一年。${gift ? `这位旧识记得你曾切实相助，此次将回赠${medicineInfo(gift)!.name}一份；本人本世仅此一次。` : '普通论道不发放丹药、修为或属性奖励。'}</p>${button('talk', '坐而论道 · 一年')}${offer ? `<p><strong>可交流丹方：${medicineInfo(offer.id)!.name}</strong><br>抄录费${offer.price}灵石，耗时一年。${offer.exchange ? `也可互授：你讲${medicineInfo(offer.exchange)!.name}丹方，对方讲${medicineInfo(offer.id)!.name}丹方；双方保留原有丹方，不消耗丹药。` : '眼下没有对方尚未掌握且同品级的已知丹方可供互授。'}</p><div class="market-social-actions">${button(`pay:${offer.id}`, `付${offer.price}灵石抄录 · 一年`)}${offer.exchange ? button(`swap:${offer.id}:${offer.exchange}`, '互授丹方 · 一年') : ''}</div>` : '<p class="panel-note">眼下没有对方能够传授的、你尚未掌握的丹方。</p>'}<p class="panel-note">论道、抄录、互授与讲法每十年择一办理。曾受你相助的旧识，重逢时可能赠药答谢，一世一次；闲聊与买卖不触发赠药。</p>`;
}
