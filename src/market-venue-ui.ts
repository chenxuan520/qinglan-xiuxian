import { seekingContent } from './artifact-seeking-ui.ts';
import type { SaveData } from './progress.ts';
import {
  MARKET_BUILDINGS,
  MARKET_VENUES,
  type MarketTraderId,
  type MarketVenueId,
} from './sect-market-data.ts';
import { marketBuildingArt } from './market-art.ts';
import { assetUrl } from './asset-url.ts';
import { medicineInfo } from './medicine-data.ts';
import { auctionItemName } from './auction-items.ts';
import { sectMarketOffer } from './sect-market.ts';
import { debateReward, marketRequest } from './market-social.ts';
import { marketContact } from './market-relations.ts';
import { marketFellowCharacter } from './market-fellow.ts';
import {
  venueActionReason,
  venueFavor,
  venueHostTopics,
  venuePeople,
  venueRealm,
  venueSeekOffers,
  venueStamp,
  venueWork,
} from './market-venues.ts';

const esc = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[s]!,
  );
export function marketVenueContent(save: SaveData, id: MarketVenueId, unfinished = false) {
  const venue = MARKET_VENUES.find((v) => v.id === id)!;
  const building = MARKET_BUILDINGS[venue.building];
  const people = venuePeople(save),
    rank = venueRealm(save);
  const button = (choice: string, label: string) => {
    const reason = venueActionReason(save, choice, venueStamp(save), unfinished);
    return `<button class="secondary-button" data-action="market-venue-act" data-id="${esc(choice)}" data-stamp="${venueStamp(save)}" ${reason ? 'disabled' : ''}>${esc(reason || label)}</button>`;
  };
  const person = (npc: (typeof people)[number], content: string) =>
    `<article class="market-venue-card"><small>${esc(npc.realm)} · ${esc(npc.role)}</small><h3>${esc(npc.name)}</h3>${content}</article>`;
  const guide = (npc: { id: string; name: string }) =>
    `<button class="secondary-button" data-action="market-venue-guide" data-id="${npc.id}">记下${esc(npc.name)}的去处</button>`;
  let content = '';
  if (id === 'forum') {
    content = `<p>${rank < 2 ? '院中留着听道的席位。可向眼下在坊中的前辈请教，先从自己的本命与根基说起。' : rank < 4 ? '修行渐深，已能与同道互证所得。选一位在坊中的修士，谈谈各自遇到的难处。' : '你已有开席讲法的修为。可以继续向同道请教，也可以把自己确实掌握的御器心得或丹方，讲给较低境界的来客。'}</p><div class="market-venue-grid">${people
      .map((npc) => {
        const reward = debateReward(save, npc.id);
        const gain = medicineInfo(reward.id)!.name;
        const topics = venueHostTopics(save, npc.id as MarketTraderId);
        return person(
          npc,
          `<p>一席论道：${reward.kind === 'recipe' ? `可习得${esc(gain)}丹方` : `获赠${esc(gain)}一份`}。</p>${button(`debate@${npc.id}`, rank < npc.realmIndex ? '向前辈请教 · 一年' : '坐而互证 · 一年')}${topics.length ? `<details><summary>开席讲法</summary><p class="panel-note">一年，30灵石茶水与场地费。指点实际在坊中的后学，增加一次有来由的交情，不发修为或战力。</p>${topics.map((t) => button(`host@${npc.id}@${t.id}`, `讲${t.name}`)).join('')}</details>` : ''}`,
        );
      })
      .join(
        '',
      )}</div><p class="panel-note">请教、互证与主持共用原论道十年间隔，换人、重进不重置。高境界也不能凭空传授自己尚未掌握的丹方。</p>`;
  } else if (id === 'office') {
    const work = venueWork(save);
    const seek = venueSeekOffers(save);
    content = `<p>堂中收着各处递来的托付，也替修士把寻物的条件传给来客。${rank < 2 ? '初入道途，可先接一桩巡守照看的护送。' : rank < 4 ? '你的修为已足以替一场交割压阵。' : '你可以主持双方自愿的调停，也能提出自己的寻物要求。散修同样可以办事。'}</p><article class="market-venue-card"><small>眼下可办 · ${work.years}年</small><h3>${work.title}</h3><p>${work.text}</p><p>报酬40灵石、1玄铁 · 不增加修为。</p>${button('work', `承接${work.title} · ${work.years}年`)}</article>${rank >= 4 ? `<h3>委托寻物</h3><p class="panel-note">下面是本批来客愿当面交出的物品。选择一项委托寻访，一年内即时结清；总价按统一估值加15%酬金，不是坊外私下邀约。与承接托付共用十年间隔。</p><div class="market-venue-grid">${seek.map((o) => person(o.npc, `<p><strong>${auctionItemName(o.item)}</strong>${o.item.kind === 'artifact' ? ` · 炼器${o.item.forgeLevel}阶` : ' ×1'}</p><p>总价${o.price}灵石，含寻访酬金。</p>${button(`seek@${o.npc.id}`, '委托寻访 · 一年')}`)).join('')}</div>` : '<p class="panel-note">化神后可在此提出自己的寻物要求。</p>'}<p class="panel-note">托付与寻物十年可办一桩。法宝收入收藏、保留较高炼器阶数，本命自行选择；未完历练不能交易法宝。每次操作前会检查寿元、天劫和到期供奉。</p>`;
  } else if (id === 'guests') {
    const favor = venueFavor(save);
    content = `<p>馆中替往来修士递信、对单。只有真正相识并曾有善意往来的旧人，重逢时才会托你办私事。</p>${favor ? `<article class="market-venue-card"><small>旧识来托 · ${esc(favor.friend.realm)}</small><h3>${esc(favor.friend.name)}的交割争执</h3><p>他称，向${esc(favor.other.name)}订下的一瓶${favor.medicine.name}迟迟未交，想请你帮忙。他带来了旧单，但双方尚未当面对过，不能只听一面。</p><p>${rank < favor.other.realmIndex ? '对方修为更高，你可以请坊中见证查验凭据；此处不冒然赴坊外。' : rank === favor.other.realmIndex ? '你与对方同阶，可以约双方当面说清，仍以封签和凭据为准。' : '你的修为足以让双方认真听一听，但境界不能替一张收货单证明真假。'}</p><div class="market-venue-options">${button('favor@check', '请见证核验 · 半年')}${rank >= favor.other.realmIndex ? button('favor@mediate', '出面调停 · 半年') : ''}${button('favor@pay', `代付取药 · ${favor.price}灵石 · 半年`)}</div><p class="panel-note">核验与调停不收费；代付是你自愿资助，不承诺返还，丹药交给旧识。三种处理只结算一次，十年后才可再帮一桩。普通馆内处理不触发伏击。</p></article>` : '<p class="market-inspection">眼下没有重逢旧识的求助。先在坊中真实相识、交易，别人的名字与经历才会渐渐留在这本名录里。</p>'}<h3>本批来客</h3><div class="market-venue-grid">${people.map((npc) => person(npc, `<p>${marketContact(save, npc.id) ? '有过往来的面孔。' : '此番初见，尚无共同往事。'}</p>${guide(npc)}`)).join('')}</div>${marketFellowCharacter(save) ? guide(marketFellowCharacter(save)!) : ''}`;
  } else {
    const medicines = id === 'medicine' || id === 'stalls';
    content = `<p>${medicines ? '铺前修士各有余丹与所需，先看谁带着合用的东西，再去门前交谈。' : '来客的法宝与行囊各不相同。公开求购照明示报价，私下机缘仍须当面辨清。'}这里列的是本批真实来客；查看和记下去处不扣物资。</p><div class="market-venue-grid">${people
      .map((npc) => {
        const offer = sectMarketOffer(save, npc.id),
          request = marketRequest(save, npc.id);
        return person(
          npc,
          `${offer ? `<p>可换余丹：${offer.name} · ${offer.tier}</p>` : ''}${request ? `<p>公开求购：${auctionItemName(request)} ×${request.quantity}<br>挂牌${request.price}灵石。</p>` : '<p>暂无公开求购，可以互换或闲谈。</p>'}${guide(npc)}`,
        );
      })
      .join('')}</div>`;
  }
  if (id === 'artifacts')
    content =
      `<section id="artifact-seeking">${seekingContent(save, unfinished)}</section>` + content;
  const receipts = save.mortal.marketVenues?.receipts ?? [];
  return `<div class="market-venue-hero"><span class="market-venue-art" aria-hidden="true" style="background-image:url('${assetUrl('/assets/sect-market-buildings.webp')}');${marketBuildingArt(building.art)}"></span><div><small>坊中一席 · ${venue.hint}</small><p>同一条街，你已能参与不同的事情。</p></div></div><div id="market-venue-result" role="status"></div>${content}${receipts.length ? `<details class="market-venue-history"><summary>近来办过的事</summary>${receipts.map((r) => `<p><small>${r.at.toFixed(1)}岁</small><br>${esc(r.text)}</p>`).join('')}</details>` : ''}<button class="secondary-button" data-action="close">回到坊市</button>`;
}
