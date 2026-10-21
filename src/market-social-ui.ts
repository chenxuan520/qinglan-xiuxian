import { curioArt } from './curio-art.ts';
import { curioInfo } from './curio-info.ts';
import { debateContent } from './market-debate-ui.ts';
import type { SaveData } from './progress.ts';
import type { MarketCultivator } from './sect-market-data.ts';
import { medicineInfo } from './medicine-data.ts';
import { medicineArt } from './medicine-ui.ts';
import { treasure } from './data.ts';
import { itemArt } from './item-art.ts';
import { assetUrl } from './asset-url.ts';
import { auctionItemName } from './auction-items.ts';
import { marketFellowClue } from './market-fellow-ui.ts';
import { marketContact, marketFriendClue, marketKnownMemory } from './market-relations.ts';
import { marketFriendLead, marketWorldEcho } from './market-world.ts';
import {
  debateReason,
  marketRequest,
  requestReason,
  marketOpportunity,
  opportunityReason,
} from './market-social.ts';
const text = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

function requestContent(save: SaveData, npc: MarketCultivator, attrs: string, unfinished: boolean) {
  const request = marketRequest(save, npc.id);
  if (!request) return '';
  const name = auctionItemName(request);
  const fulfilled = save.mortal.marketSocial!.fulfilled.includes(npc.id);
  const reason = requestReason(
    save,
    npc.id,
    save.mortal.sectMarket!.visit,
    request.forgeLevel,
    unfinished,
  );
  return `<details class="market-social-section" data-disclosure="market-request"><summary>修士求购 <small>${name} ×${request.quantity}</small></summary>${
    fulfilled
      ? '<p>本批委托已完成，物资与报酬已结算，不可重复交货。</p>'
      : `<p class="market-trade-motive"><strong>${text(request.motiveTitle)}</strong><br>${text(request.motiveText)}</p><p>所需：<strong>${name} ×${request.quantity}</strong>${request.kind === 'artifact' ? `，至少炼器 ${request.minimumLevel} 阶，实际将交出炼器 ${request.forgeLevel} 阶` : '，只交付库存，不影响已服药效'}。</p><p>当面交货，实收 <strong>${request.price.toLocaleString('zh-CN', { useGrouping: false })} 灵石</strong> · 半年 · 无额外佣金。</p><p class="panel-note">${text(request.priceText)} 当前本命不可交付，未完成历练时不可交易法宝。</p><button class="secondary-button" data-action="sect-market-request" ${attrs} data-level="${request.forgeLevel}" ${reason ? 'disabled' : ''}>${reason || '当面交货 · 实收灵石'}</button>`
  }</details>`;
}

function opportunityContent(
  save: SaveData,
  npc: MarketCultivator,
  attrs: string,
  unfinished: boolean,
) {
  const offer = marketOpportunity(save, npc.id);
  if (!offer) return '';
  const s = save.mortal.marketSocial!,
    visit = save.mortal.sectMarket!.visit;
  const item = offer.item,
    medicine = item.kind === 'medicine' ? medicineInfo(item.id)! : undefined;
  const art = item.kind === 'artifact' ? itemArt(item.id)! : undefined;
  const icon =
    item.kind === 'curio'
      ? curioArt(item.id)
      : medicine
        ? medicineArt(medicine)
        : `<span class="auction-art" aria-hidden="true" style="background-image:url('${assetUrl(art!.src)}');background-position:${(art!.column / 3) * 100}% ${(art!.row / (art!.rows - 1)) * 100}%"></span>`;
  const detail =
    item.kind === 'curio'
      ? curioInfo(item.id)!.effect
      : medicine
        ? `${medicine.tier} · ${medicine.desc}`
        : `炼器 ${item.forgeLevel} 阶 · ${treasure(item.id).school === 'orthodox' ? '正道' : '魔道'}法宝`;
  const rewardNote =
    item.kind === 'artifact'
      ? `${save.artifacts.includes(item.id) ? `收藏中已有此物，炼器保留较高的 ${Math.max(save.forge[item.id] || 0, item.forgeLevel)} 阶，不额外增加一件。` : '所得法宝收入收藏，保留标示炼器阶数。'} 本命由你自行选择。`
      : item.kind === 'curio'
        ? '奇物收入行囊，持有即获其助益；本世只此一件。'
        : '所得丹药收入丹囊，不自动服用。';
  const clue = marketFellowClue(save, offer),
    friendClue = marketFriendClue(save, offer.kind);
  const inspect = opportunityReason(save, npc.id, visit, 'inspect', unfinished);
  const accept = opportunityReason(save, npc.id, visit, 'accept', unfinished);
  const description =
    offer.kind === 'goods'
      ? `他说封瓶里的丹药可以转让，总价 ${offer.cost} 灵石，先付 ${offer.deposit} 灵石、收货验丹再付余款；若是假丹，只损失先付款。封签边缘有新旧两层纸，药香隔瓶难辨。`
      : offer.kind === 'deposit'
        ? `他答应以 ${offer.price} 灵石收购一份，但要你先垫 ${offer.cost} 灵石路费。言语急促，收货凭据暂未拿出。`
        : offer.kind === 'haggle'
          ? `他把一枚凡品说得天花乱坠，开价 ${offer.cost} 灵石；同药药铺参考价 ${medicine!.price} 灵石。`
          : `${text(offer.purpose)}<br>同行需一年，约定所得如上。${offer.risk.realmDelta > 0 ? '对方修为难测，独自赴约须格外谨慎。' : `对方为${npc.realm}，${offer.risk.realmDelta < 0 ? `低你${-offer.risk.realmDelta}个大境界` : '与你同一大境界'}。`}暂扣 ${offer.cost} 灵石，平安归来全数返还；若遭伏击，击杀取回并获得其随身战利品，撤离须实际走到退路。<strong>气血归零便是身死，赴约前务必量力而行。</strong>`;
  return `<details class="market-social-section market-opportunity" data-disclosure="market-opportunity"><summary>坊间机缘 <small>${s.used.includes(npc.id) ? '此事已了' : offer.title}</small></summary><div class="sect-market-offer">${icon}<div><strong>${auctionItemName(item)} ×${item.quantity}</strong><small>${detail}</small></div></div><p>${description}</p>${offer.kind === 'invitation' ? `<p class="panel-note">${rewardNote}</p><p class="market-inspection"><strong>赴约须${offer.risk.level === '凶险' ? '格外谨慎 · 凶险' : offer.risk.level === '危险' ? '量力而行 · 危险' : '留心退路'}</strong></p>${offer.risk.clues.map((line) => `<p class="panel-note">${text(line)}</p>`).join('')}` : ''}${friendClue ? `<p class="market-inspection">${text(friendClue)}</p>` : ''}${clue ? `<p class="market-inspection"><strong>故人所授</strong> · ${text(clue)}</p>` : ''}<p class="panel-note">私下机缘有真假，可以花半年核验，也可直接作别。主动成交或赴约的收获相隔十年；假货、骗款最多损失 80 灵石，坊外伏击则有身死风险。普通拍卖、当面互换与求购不触发伏击，照明示规则结算。</p>${s.inspected.includes(npc.id) ? `<p class="market-inspection">${offer.kind === 'haggle' ? '报价明显高于药铺。' : offer.honest ? '已核验，未见破绽。' : '已查出骗局，这桩机缘不可信。'}</p>` : ''}<div class="market-social-actions"><button class="secondary-button" data-action="sect-market-inspect" ${attrs} ${inspect ? 'disabled' : ''}>${s.inspected.includes(npc.id) ? '已核验' : '核验 · 半年'}</button><button class="secondary-button" data-action="sect-market-opportunity" ${attrs} ${accept ? 'disabled' : ''}>${accept || (offer.kind === 'invitation' ? '赴约 · 一年 · 有身死风险' : offer.kind === 'deposit' ? `垫付 ${offer.cost} 灵石 · 半年` : `付 ${offer.cost} 灵石取药 · 半年`)}</button><button class="secondary-button" data-action="sect-market-decline" ${attrs} ${s.used.includes(npc.id) ? 'disabled' : ''}>${s.used.includes(npc.id) ? '此事已了' : '婉拒作别'}</button></div></details>`;
}

export function marketSocialContent(save: SaveData, npc: MarketCultivator, unfinished = false) {
  const s = save.mortal.marketSocial,
    visit = save.mortal.sectMarket?.visit;
  if (!s || !visit) return '';
  if (marketContact(save, npc.id)?.dead)
    return '<p class="market-social-result">此人已在坊外一战身死，旧摊不再接待来客。</p>';
  const memory = marketKnownMemory(save, npc.id);
  const echo = marketWorldEcho(save),
    lead = marketFriendLead(save, npc.id);
  const latest = s.logs.find((l) => l.visit === visit && l.npcId === npc.id);
  const debate = debateReason(save, npc.id, visit);
  const attrs = `data-id="${npc.id}" data-visit="${visit}"`;
  return `<div class="market-social-cards">${echo ? `<p class="market-world-echo"><small>${text(echo.title)}</small>${text(echo.text)}</p>` : ''}${lead ? `<p class="market-inspection market-friend-lead"><strong>${text(lead.title)}</strong><br>${text(lead.text)}</p>` : ''}${memory ? `<p class="market-inspection">${text(memory)}</p>` : ''}${latest ? `<p class="market-social-result" role="status">${text(latest.text)}</p>` : ''}<details class="market-social-section" data-disclosure="market-debate"><summary>坐而论道 <small>${debate ? '再历山河，互证所得' : '交流修行 · 一年'}</small></summary>${debateContent(save, npc.id)}</details>${requestContent(save, npc, attrs, unfinished)}${opportunityContent(save, npc, attrs, unfinished)}</div>`;
}
