import type { SaveData } from './progress.ts';
import type { MarketCultivator } from './sect-market-data.ts';
import { medicineInfo } from './medicine-data.ts';
import { medicineArt } from './medicine-ui.ts';
import { treasure } from './data.ts';
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
export function marketSocialContent(save: SaveData, npc: MarketCultivator, unfinished = false) {
  const s = save.mortal.marketSocial,
    visit = save.mortal.sectMarket?.visit;
  if (!s || !visit) return '';
  const latest = s.logs.find((l) => l.visit === visit && l.npcId === npc.id);
  const debate = debateReason(save, npc.id, visit);
  const request = marketRequest(save, npc.id);
  const offer = marketOpportunity(save, npc.id);
  const attrs = `data-id="${npc.id}" data-visit="${visit}"`;
  return `<div class="market-social-cards">${latest ? `<p class="market-social-result" role="status">${text(latest.text)}</p>` : ''}<details class="market-social-section"><summary>坐而论道 <small>${debate ? '再历山河，互证所得' : '可有所获 · 一年'}</small></summary><p>结合此世灵根、修行路线与本命交流。前辈或同阶修士可能传授当前可用的未知丹方；无合适丹方时赠一份凡品余丹，收入丹囊，不自动服用。同一世相隔十个游戏年可有所获，换人、重进不重置。</p><button class="secondary-button" data-action="sect-market-debate" ${attrs} ${debate ? 'disabled' : ''}>${debate || '坐而论道 · 一年'}</button></details>${request ? `<details class="market-social-section"><summary>修士求购 <small>${request.kind === 'medicine' ? medicineInfo(request.id)!.name : treasure(request.id).name} ×${request.quantity}</small></summary>${s.fulfilled.includes(npc.id) ? '<p>本批委托已完成，物资与报酬已结算，不可重复交货。</p>' : `<p>${request.kind === 'medicine' ? '炼丹备药，尚缺此物。' : '游历需换一件护身法宝。'}所需：<strong>${request.kind === 'medicine' ? medicineInfo(request.id)!.name : treasure(request.id).name} ×${request.quantity}</strong>${request.kind === 'artifact' ? `，至少炼器 ${request.minimumLevel} 阶，实际将交出炼器 ${request.forgeLevel} 阶` : '，只交付库存，不影响已服药效'}。</p><p>当面交货，实收 <strong>${request.price.toLocaleString('zh-CN')} 灵石</strong> · 半年 · 无额外佣金。报价可能高低不同，可自行取舍；当前本命不可交付，未完成历练时不可交易法宝。</p><button class="secondary-button" data-action="sect-market-request" ${attrs} data-level="${request.forgeLevel}" ${requestReason(save, npc.id, visit, request.forgeLevel, unfinished) ? 'disabled' : ''}>${requestReason(save, npc.id, visit, request.forgeLevel, unfinished) || '当面交货 · 实收灵石'}</button>`}</details>` : ''}${offer ? `<details class="market-social-section market-opportunity"><summary>坊间机缘 <small>${s.used.includes(npc.id) ? '此事已了' : offer.kind === 'invitation' ? '坊外取药之邀' : offer.kind === 'deposit' ? '先垫路费的求购' : offer.kind === 'haggle' ? '卖家的好价钱' : '低价转让一炉丹'}</small></summary><div class="sect-market-offer">${medicineArt(medicineInfo(offer.item.id)!)}<div><strong>${medicineInfo(offer.item.id)!.name} ×1</strong><small>${medicineInfo(offer.item.id)!.tier} · ${medicineInfo(offer.item.id)!.desc}</small></div></div><p>${offer.kind === 'goods' ? `他说封瓶里的丹药可以低价转让，开价 ${offer.cost} 灵石。封签边缘有新旧两层纸，药香隔瓶难辨。` : offer.kind === 'deposit' ? `他答应以 ${offer.price} 灵石收购一份，但要你先垫 ${offer.cost} 灵石路费。言语急促，收货凭据暂未拿出。` : offer.kind === 'haggle' ? `他把一枚凡品说得天花乱坠，开价 ${offer.cost} 灵石；同药药铺参考价 ${medicineInfo(offer.item.id)!.price} 灵石。` : `他邀你花一年去坊外取药，约定处偏僻，袖口有旧血迹。对方为${npc.realm}，境界高于你时更难击退。若遭劫修伏击，最多暂扣 ${offer.cost} 灵石；可走位自动应战或脱身，击退取回，败退/离开/刷新损失暂扣限额。`}</p><p class="panel-note">私下机缘有真假，可以花半年核验，也可直接作别。主动成交或赴约的收获相隔十年；一次损失不超过 80 灵石。普通拍卖与当面交货委托照明示规则结算。</p>${s.inspected.includes(npc.id) ? `<p class="market-inspection">${offer.kind === 'haggle' ? '报价明显高于药铺。' : offer.honest ? '已核验，未见破绽。' : '已查出骗局，这桩机缘不可信。'}</p>` : ''}<div class="market-social-actions"><button class="secondary-button" data-action="sect-market-inspect" ${attrs} ${opportunityReason(save, npc.id, visit, 'inspect', unfinished) ? 'disabled' : ''}>${s.inspected.includes(npc.id) ? '已核验' : '核验 · 半年'}</button><button class="secondary-button" data-action="sect-market-opportunity" ${attrs} ${opportunityReason(save, npc.id, visit, 'accept', unfinished) ? 'disabled' : ''}>${opportunityReason(save, npc.id, visit, 'accept', unfinished) || (offer.kind === 'invitation' ? '赴约 · 一年' : offer.kind === 'deposit' ? `垫付 ${offer.cost} 灵石 · 半年` : `付 ${offer.cost} 灵石取药 · 半年`)}</button><button class="secondary-button" data-action="sect-market-decline" ${attrs} ${s.used.includes(npc.id) ? 'disabled' : ''}>${s.used.includes(npc.id) ? '此事已了' : '婉拒作别'}</button></div></details>` : ''}</div>`;
}
