import { FINAL_TRIAL_STAGE } from './data.ts';
import { marketFellowCharacter, marketFellowView } from './market-fellow.ts';
import { playerSpriteBackground } from './player-appearance.ts';
import { realmInfo, type SaveData } from './progress.ts';
import { marketRealmLabel, marketRelation } from './sect-market-data.ts';
import type { marketOpportunity } from './market-social.ts';

export function marketFellowContent(save: SaveData) {
  const npc = marketFellowCharacter(save),
    view = marketFellowView(save);
  if (!npc || !view) return '';
  const rank = realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).index;
  const relation = marketRelation(npc.realmIndex, rank);
  return `<div class="sect-market-profile"><span class="sect-market-portrait" aria-hidden="true" style="background:${playerSpriteBackground(npc.path)}"></span><div><strong>${relation} · ${marketRealmLabel(npc, rank)} · ${npc.role}</strong><p>${view.alive ? '炉边相识，山河再逢。' : '旧人已去，药册传家。'}</p></div></div><section class="town-story immortal-encounter" aria-label="炉边故人"><span class="eyebrow">${view.phase}</span>${view.text.map((line) => `<p>${line}</p>`).join('')}<blockquote>${view.quote}</blockquote>${view.hint ? `<p class="market-inspection">${view.hint}</p>` : ''}${view.actions.length ? `<div class="story-choices">${view.actions.map((action) => `<button class="secondary-button" data-action="sect-market-fellow" data-id="${action.id}" data-visit="${save.mortal.sectMarket!.visit}">${action.label}</button>`).join('')}</div>` : ''}<small>相逢与选择记入此世纪事，交谈不另耗年岁。历练、闭关与闲逛期间，故人也会继续修行、老去。</small></section><button class="secondary-button" data-action="close">回到坊市</button>`;
}

// 旧识教会辨认具体凭据，而非改变机缘真假或代替玩家成交。按已有机缘提供可核对的线索。
export function marketFellowClue(save: SaveData, offer: ReturnType<typeof marketOpportunity>) {
  if (!offer) return '';
  const kind = marketFellowView(save)?.hintKind;
  if (kind === 'trade' && offer.kind === 'goods')
    return offer.honest
      ? '循着沈氏药册的方法细看，新纸只护住瓶口，底下原封的药号与凭据相合。实物药性仍可再核验。'
      : '循着沈氏药册的方法细看，新封签压住了原药号，底下字迹却与交货凭据对不上。先别急着付钱。';
  if (kind === 'trade' && offer.kind === 'deposit')
    return offer.honest
      ? '按沈氏药册所记追问，对方说出的交货处与收货人能在坊内名册查到，细节前后一致。仍可花时间核验。'
      : '按沈氏药册所记追问，对方两次说出的收货人并不相同，只催你先垫路费，不肯说明凭据。';
  if (kind === 'trail' && offer.kind === 'invitation')
    return offer.honest
      ? '照沈氏路书先问归路，对方说清了接应处、折返路和同行安排，暂未露出矛盾。赴约前仍可再核验。'
      : '照沈氏路书先问归路，对方却临时改了接应处，催你独自赴约，对退路含糊其辞。';
  return '';
}
