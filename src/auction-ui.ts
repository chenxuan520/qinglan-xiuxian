import { CURIOS, curioInfo } from './curio-info.ts';
import { curioArt } from './curio-art.ts';
import { TREASURES, treasure } from './data.ts';
import { MEDICINES, medicineInfo } from './medicine-data.ts';
import { medicineArt } from './medicine-ui.ts';
import { itemArt } from './item-art.ts';
import { assetUrl } from './asset-url.ts';
import type { SaveData } from './progress.ts';
import { marketCultivators } from './sect-market-data.ts';
import type { AuctionItem, AuctionKind, AuctionReceipt } from './auction-data.ts';
import {
  auctionLots,
  auctionValue,
  auctionSaleRates,
  auctionItemName,
  auctionFee,
  auctionBuyReason,
  auctionSellReason,
  auctionDues,
} from './auction.ts';

export type AuctionView = 'buy' | 'sell' | 'history';
const num = (n: number) => n.toLocaleString('zh-CN');
function art(item: AuctionItem) {
  if (item.kind === 'curio') return curioArt(item.id);
  if (item.kind === 'medicine') return medicineArt(medicineInfo(item.id)!);
  const a = itemArt(item.id)!;
  return `<span class="auction-art" aria-hidden="true" style="background-image:url('${assetUrl(a.src)}');background-position:${(a.column / 3) * 100}% ${(a.row / (a.rows - 1)) * 100}%"></span>`;
}
function detail(item: AuctionItem) {
  if (item.kind === 'curio') return curioInfo(item.id)!.effect;
  return item.kind === 'medicine'
    ? `${medicineInfo(item.id)!.years ? medicineInfo(item.id)!.tier : '本世珍品'} · ${medicineInfo(item.id)!.desc}`
    : `炼器 ${item.forgeLevel} 阶 · ${treasure(item.id).school === 'orthodox' ? '正道' : '魔道'}法宝`;
}
export function auctionResult(save: SaveData, r: AuctionReceipt) {
  const name = auctionItemName(r);
  const bidder =
    r.bidder === 'player'
      ? '你'
      : r.bidder === 'commission'
        ? '代客竞价席'
        : r.bidder
          ? (r.bidderName?.replace(
              /[&<>"']/g,
              (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
            ) ??
            marketCultivators(save.mortal.population!, {
              visit: r.visit,
              realmIndex: r.realmIndex,
            }).find((n) => n.id === r.bidder)!.name)
          : '';
  return r.outcome === 'won'
    ? `竞得${name} ×${r.quantity} · 花费 ${num(r.price + r.fee)} 灵石（含手续费 ${num(r.fee)}）`
    : r.outcome === 'lost'
      ? `${bidder}以 ${num(r.price)} 灵石竞得${name} · 你的预算未胜出，未扣款 · 已消耗半年`
      : r.outcome === 'sold'
        ? `${bidder}买下${name} ×${r.quantity} · 实收 ${num(r.price - r.fee)} 灵石（佣金 ${num(r.fee)}）`
        : `${name}未达到保留价 · 物品仍在行囊，未收佣金 · 已消耗半年`;
}
export function auctionContent(
  save: SaveData,
  view: AuctionView,
  unfinished: boolean,
  kind: AuctionKind = 'medicine',
  selected = '',
) {
  const state = save.mortal.auction!;
  const visit = save.mortal.sectMarket!.visit;
  const available = save.stones - auctionDues(save);
  const toolbar = `<div class="auction-toolbar"><span>灵石 <strong>${num(save.stones)}</strong></span><small>本批第 ${visit} 场 · 每场半年 · 即时结算${auctionDues(save) ? ` · 已预留供奉 ${auctionDues(save)} 灵石` : ''}</small></div><div class="medicine-tabs auction-tabs" role="group" aria-label="拍卖用途">${[
    ['buy', '参与竞拍'],
    ['sell', '委托出售'],
    ['history', '成交录'],
  ]
    .map(
      ([id, name]) =>
        `<button data-action="auction-view" data-id="${id}" aria-pressed="${view === id}">${name}</button>`,
    )
    .join('')}</div>`;
  let content: string;
  if (view === 'buy') {
    content = `<p class="panel-note">填一次最高预算，修士代你逐次竞价。每次竞拍消耗半年，落拍也计龄。预算包含 5% 手续费；成交只扣实际成交价与手续费，落拍不扣钱。本批每件只拍一次，离开坊市再进入会更换常规拍品；偶有奇物加拍，按十年更换，不随重进换货。奇物由代客席统一竞价。同名奇物的效力不叠加。法宝保留炼器阶数，收入收藏，自行选择本命。</p><div class="auction-grid">${auctionLots(
      save,
    )
      .map((lot) => {
        const reason = auctionBuyReason(save, lot.index, visit, unfinished);
        const minimum = lot.start + auctionFee(lot.start);
        return `<article class="auction-card"><header>${art(lot)}<div><small>${lot.seller}的委托</small><h3>${auctionItemName(lot)} ×${lot.quantity}</h3></div></header><p>${detail(lot)}</p><strong>起拍 ${num(lot.start)} 灵石</strong><label>最高预算（含手续费）<input id="auction-budget-${lot.index}" type="number" inputmode="numeric" min="${minimum}" max="${available}" step="1" value="${minimum}" aria-label="${auctionItemName(lot)}最高预算" ${reason || available < minimum ? 'disabled' : ''}></label><button class="secondary-button" data-action="auction-buy" data-id="${lot.index}" data-visit="${visit}" data-cycle="${save.curios.consignment?.cycle ?? -1}" ${reason || available < minimum ? 'disabled' : ''}>${reason || (available < minimum ? '灵石不足起拍预算' : '委托竞拍')}</button></article>`;
      })
      .join('')}</div>`;
  } else if (view === 'sell') {
    const choices =
      kind === 'medicine'
        ? MEDICINES.filter((m) => (save.medicine.bag[m.id] || 0) > 0)
        : kind === 'curio'
          ? CURIOS.filter((c) => (save.curios.bag[c.id] ?? 0) > 0)
          : TREASURES.filter((t) => save.artifacts.includes(t.id));
    const id = choices.some((i) => i.id === selected) ? selected : choices[0]?.id;
    const item: AuctionItem | undefined = id
      ? { kind, id, quantity: 1, forgeLevel: kind === 'artifact' ? save.forge[id] || 0 : 0 }
      : undefined;
    const reason = item ? auctionSellReason(save, item, visit, unfinished) : '行囊中暂无可委托物品';
    const [low, high] = item ? auctionSaleRates(item) : [60, 80];
    const value = item ? auctionValue(item) : 0;
    const minimum = Math.max(1, Math.floor((value * low) / 100));
    const maximum = Math.floor((value * high) / 100);
    const resale =
      item?.kind === 'curio'
        ? `<br><small>代客席收购报价 ${num(minimum)}–${num(maximum)} 灵石；扣佣后实收 ${num(minimum - auctionFee(minimum, true))}–${num(maximum - auctionFee(maximum, true))} 灵石。</small>`
        : '';

    content = `<p class="panel-note">可出售行囊中的丹药、收藏法宝和奇物。奇物售出最后一件后，其助益随之消失。每次委托消耗半年，流拍也计龄。丹药与法宝按估值的 60%–80% 出价，受来客财力限制。奇物珍藏估值计入长久使用的助益，急售由代客席按估值的 10%–15% 收购。达到保留价才成交，卖方佣金为成交价的 10%。当前本命不可出售；入门赠品只按炼器投入估值。丹药出售不影响已服用药效、服用次数与药方。</p><div class="auction-seller"><label>委托类别<select id="auction-kind" aria-label="委托类别"><option value="medicine" ${kind === 'medicine' ? 'selected' : ''}>丹药</option><option value="artifact" ${kind === 'artifact' ? 'selected' : ''}>法宝</option><option value="curio" ${kind === 'curio' ? 'selected' : ''}>奇物</option></select></label>${item ? `<label>委托物品<select id="auction-item" aria-label="委托物品">${choices.map((i) => `<option value="${i.id}" ${id === i.id ? 'selected' : ''}>${i.name}${kind === 'medicine' ? `（持有 ${save.medicine.bag[i.id]}）` : kind === 'curio' ? `（持有 ${save.curios.bag[i.id as keyof typeof save.curios.bag] ?? 0} 件）` : `（炼器 ${save.forge[i.id] || 0} 阶${i.id === save.starter ? ' · 当前本命' : ''}）`}</option>`).join('')}</select></label><section class="sect-market-offer">${art(item)}<div><strong>${auctionItemName(item)}</strong><p>${detail(item)}</p><small>${kind === 'curio' ? '珍藏估值' : '单件估值'} ${num(value)} 灵石</small>${resale}</div></section>${kind === 'medicine' ? `<label>委托数量<input id="auction-quantity" type="number" inputmode="numeric" min="1" max="${Math.min(99, save.medicine.bag[item.id])}" step="1" value="1" aria-label="委托数量"></label>` : ''}<label>总保留价（不含佣金）<input id="auction-reserve" type="number" inputmode="numeric" min="1" step="1" value="${minimum}" aria-label="总保留价"></label><small class="panel-note">批量丹药请按总数量填写保留价；未达到此价不扣物品、不收佣金。</small><button class="secondary-button" data-action="auction-sell" data-visit="${visit}" ${reason ? 'disabled' : ''}>${reason || '委托出售'}</button>` : `<p class="panel-note">${reason}</p>`}</div>`;
  } else {
    content = `<p class="panel-note">近来的结拍往来。</p>${state.history.length ? state.history.map((r) => `<article class="auction-receipt">${art(r)}<div><small>${r.age.toFixed(1)} 岁 · 第 ${r.visit} 场</small><p>${auctionResult(save, r)}</p></div></article>`).join('') : '<p class="panel-note">尚未参与竞拍或委托出售。</p>'}`;
  }
  return `${toolbar}<p id="auction-result" class="auction-result" role="status" hidden></p>${content}<button class="secondary-button" data-action="close">回到坊市</button>`;
}
