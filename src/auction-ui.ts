import { CURIOS, curioInfo } from './curio-info.ts';
import { curioArt } from './curio-art.ts';
import { TREASURES, treasure, elementInfo, pathInfo } from './data.ts';
import { catalogEvolutionRecipe } from './common-ui.ts';
import { MEDICINES, medicineInfo } from './medicine-data.ts';
import { medicineArt } from './medicine-ui.ts';
import { itemArt } from './item-art.ts';
import { assetUrl } from './asset-url.ts';
import type { SaveData } from './progress.ts';
import { marketCultivators } from './sect-market-data.ts';
import {
  AUCTION_HALLS,
  AUCTION_LOTS,
  AUCTION_IRON_MIN,
  AUCTION_PREMIUM_MIN_VALUE,
  type AuctionItem,
  type AuctionKind,
  type AuctionReceipt,
} from './auction-data.ts';
import type { ActionShell } from './action-controller.ts';
import { ironMarket } from './iron-market.ts';
import {
  auctionHallReason,
  auctionItemAllowed,
  selectAuctionHall,
  auctionValue,
  auctionSaleRates,
  auctionItemName,
  auctionFee,
  auctionSellReason,
  auctionDues,
} from './auction.ts';
import {
  auctionLots,
  buyAuction,
  sellAuction,
  auctionBuyReason,
  auctionNextBid,
} from './auction-trade.ts';

export type AuctionView = 'buy' | 'sell' | 'history';
const num = (n: number) => n.toLocaleString('zh-CN', { useGrouping: false });
function art(item: AuctionItem) {
  if (item.kind === 'iron') return '<span class="auction-iron" aria-hidden="true">◆</span>';
  if (item.kind === 'curio') return curioArt(item.id);
  if (item.kind === 'medicine') return medicineArt(medicineInfo(item.id)!);
  const a = itemArt(item.id)!;
  return `<span class="auction-art" aria-hidden="true" style="background-image:url('${assetUrl(a.src)}');background-position:${(a.column / 3) * 100}% ${(a.row / (a.rows - 1)) * 100}%"></span>`;
}
function detail(item: AuctionItem) {
  if (item.kind === 'iron') return '整批玄铁 · 炼器用材';
  if (item.kind === 'curio') return curioInfo(item.id)!.effect;
  return item.kind === 'medicine'
    ? `${medicineInfo(item.id)!.years ? medicineInfo(item.id)!.tier : '本世珍品'} · ${medicineInfo(item.id)!.desc}`
    : `炼器 ${item.forgeLevel} 阶 · ${treasure(item.id).school === 'orthodox' ? '正道' : '魔道'}法宝`;
}
function artifactInspection(item: AuctionItem) {
  if (item.kind !== 'artifact') return '';
  const t = treasure(item.id);
  return `<details class="auction-inspection"><summary>鉴宝 · 攻击与配套</summary><p>${elementInfo(t.element).name}系 · ${t.tag}</p><p>${t.desc}</p>${catalogEvolutionRecipe(t)}<p class="panel-note">${pathInfo(t.school).name}或兼修路线可领悟此宝、设为本命。法宝六重与任一配套功法五重齐备后，在局内升级中选择仙器觉醒。纯修仅可用本流派功法，兼修可任选配套功法；炼器阶数不代替局内重数。</p></details>`;
}
export function auctionResult(
  save: SaveData,
  r: AuctionReceipt,
  bid?: { budget: number; start: number },
) {
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
      ? `${bidder}以 ${num(r.price)} 灵石竞得${name} · ${
          bid
            ? (() => {
                const next = auctionNextBid(bid.start, r.price);
                return `你的含费预算 ${num(bid.budget)}；下一档需出价 ${num(next.price)} ＋手续费 ${num(next.fee)} ＝ ${num(next.total)}，超出预算`;
              })()
            : '下一档出价与手续费超出你的预算'
        } · 未扣款 · 已消耗半年`
      : r.outcome === 'sold'
        ? `${bidder}买下${name} ×${r.quantity} · 实收 ${num(r.price - r.fee)} 灵石（佣金 ${num(r.fee)}）`
        : `${name}未达到保留价 · 物品仍在行囊，未收佣金 · 已消耗半年`;
}
// closed按竞拍先后追加，history按时间倒序；出售和奇物竞拍不占常规closed槽。
// 只还原同批同场、保留在历史尾段中的真实成交，不用新生成的药品猜测旧货。
function closedReceipt(save: SaveData, index: number) {
  const state = save.mortal.auction!;
  const hall = Math.floor(index / AUCTION_LOTS);
  const closed = state.closed.filter((n) => Math.floor(n / AUCTION_LOTS) === hall);
  const receipts = state.history.filter(
    (r) =>
      r.visit === state.visit &&
      r.hall === hall &&
      r.kind !== 'curio' &&
      (r.outcome === 'won' || r.outcome === 'lost'),
  );
  const position = closed.indexOf(index);
  const r =
    position < 0 || receipts.length > closed.length
      ? undefined
      : receipts[closed.length - 1 - position];
  const kind =
    (index % AUCTION_LOTS) % 4 < 2
      ? 'medicine'
      : hall === 0 && index % AUCTION_LOTS === 7
        ? 'iron'
        : 'artifact';
  return r?.kind === kind ? r : undefined;
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
  if ((kind === 'curio' && state.hall === 0) || (kind === 'iron' && state.hall !== 0))
    kind = 'medicine';
  const available = save.stones - auctionDues(save);
  const halls = `<div class="auction-halls" role="group" aria-label="拍卖会场">${AUCTION_HALLS.map(
    (h, hall) => {
      const locked = !!auctionHallReason(save, hall);
      return `<button class="secondary-button" data-action="auction-hall" data-id="${hall}" data-visit="${visit}" data-pay="${locked ? 1 : 0}" aria-pressed="${state.hall === hall}" ${locked && available < h.admission ? 'disabled' : ''}><strong>${h.name}</strong><small>${h.realms}</small><small>${locked ? `缴纳 ${num(h.admission)} 灵石取得资格` : state.hall === hall ? '当前会场' : '进入会场'}</small></button>`;
    },
  ).join(
    '',
  )}</div><p class="panel-note">${['凡品、灵品丹药 · 大批玄铁', '灵品为主，兼有珍品丹药 · 偶有奇物', '珍品丹药为主，偶有稀有丹药 · 偶有奇物'][state.hall]} · 炼器${AUCTION_HALLS[state.hall].forgeMin}～${AUCTION_HALLS[state.hall].forgeMax}阶法宝${state.hall === 2 ? ` · 起拍至少${AUCTION_PREMIUM_MIN_VALUE}灵石` : ''}。境界不足可缴费取得本世资格，${AUCTION_HALLS[2].name}资格包含${AUCTION_HALLS[1].name}。切场不计龄。</p>`;
  const toolbar = `${halls}<div class="auction-toolbar"><span>灵石 <strong>${num(save.stones)}</strong></span><small>第 ${visit} 批 · 每场半年 · 即时结算${auctionDues(save) ? ` · 已预留供奉 ${auctionDues(save)} 灵石` : ''}</small></div><div class="medicine-tabs auction-tabs" role="group" aria-label="拍卖用途">${[
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
    content = `<details><summary>竞拍规则与换批</summary><p class="panel-note">填一次最高预算，修士代你逐次竞价。每次竞拍消耗半年，落拍也计龄。每次加价至少为起拍价的5%（向上取整，至少1灵石）。预算包含 5% 手续费；不足下一档出价与手续费时便会落拍，不能只拿总预算与对手成交价比较。成交只扣实际成交价与手续费，落拍不扣钱。每场四份丹药、四件物品；本批丹药与法宝各不重名。本批每件只拍一次，本批满一年后，再入坊市才更换修士和常规拍品；偶有奇物寄拍，按十年更换，不随重进换货。奇物由代客席统一竞价。本世已获得过的奇物不再寄拍。法宝保留炼器阶数，收入收藏，自行选择本命。</p></details><div class="auction-grid">${auctionLots(
      save,
    )
      .map((lot) => {
        if (state.closed.includes(lot.index)) {
          const r = closedReceipt(save, lot.index);
          return `<article class="auction-card" data-closed-index="${lot.index}">${r ? `<header>${art(r)}<div><small>已结拍 · ${AUCTION_HALLS[r.hall].name}</small><h3>${auctionItemName(r)} ×${r.quantity}</h3></div></header><p>${auctionResult(save, r)}</p>` : '<h3>本拍品已结拍</h3><p class="panel-note">可在「成交录」查看结拍往来，本批不再开拍。</p>'}</article>`;
        }
        const reason = auctionBuyReason(save, lot.index, visit, unfinished);
        const minimum = lot.start + auctionFee(lot.start);
        return `<article class="auction-card"><header>${art(lot)}<div><small>${lot.seller}的委托</small><h3>${auctionItemName(lot)} ×${lot.quantity}</h3></div></header><p>${detail(lot)}</p>${artifactInspection(lot)}<strong>起拍 ${num(lot.start)} 灵石</strong><label>最高预算（含手续费）<input id="auction-budget-${lot.index}" type="number" inputmode="numeric" min="${minimum}" max="${available}" step="1" value="${minimum}" aria-label="${auctionItemName(lot)}最高预算" ${reason || available < minimum ? 'disabled' : ''}></label><button class="secondary-button" data-action="auction-buy" data-id="${lot.index}" data-visit="${visit}" data-hall="${state.hall}" data-cycle="${save.curios.consignment?.cycle ?? -1}" ${reason || available < minimum ? 'disabled' : ''}>${reason || (available < minimum ? '灵石不足起拍预算' : '委托竞拍')}</button></article>`;
      })
      .join(
        '',
      )}${auctionLots(save).length === 7 ? '<article class="auction-card"><h3>本席寄拍已结束</h3><p class="panel-note">这份机缘已了，本批不再补货。</p></article>' : ''}</div>`;
  } else if (view === 'sell') {
    const choices = (
      kind === 'iron'
        ? save.iron > 0
          ? [{ id: 'iron', name: '玄铁' }]
          : []
        : kind === 'medicine'
          ? MEDICINES.filter((m) => (save.medicine.bag[m.id] || 0) > 0)
          : kind === 'curio'
            ? CURIOS.filter((c) => (save.curios.bag[c.id] ?? 0) > 0)
            : TREASURES.filter((t) => save.artifacts.includes(t.id))
    ).filter((i) => auctionItemAllowed(state.hall, { kind, id: i.id, quantity: 1, forgeLevel: 0 }));
    const id = choices.some((i) => i.id === selected) ? selected : choices[0]?.id;
    const item: AuctionItem | undefined = id
      ? {
          kind,
          id,
          quantity: kind === 'iron' ? AUCTION_IRON_MIN : 1,
          forgeLevel: kind === 'artifact' ? save.forge[id] || 0 : 0,
        }
      : undefined;
    const reason = item ? auctionSellReason(save, item, visit, unfinished) : '行囊中暂无可委托物品';
    const [low, high] = auctionSaleRates(item ?? { kind, id: '', quantity: 1, forgeLevel: 0 });
    const value = item ? auctionValue(item, save) : 0;
    const minimum = Math.max(
      1,
      Math.floor(
        kind === 'iron' ? ironMarket(save).sell * AUCTION_IRON_MIN * 0.9 : (value * low) / 100,
      ),
    );
    const maximum = Math.floor((value * high) / 100);
    const resale =
      item && item.kind !== 'iron' && value > 0
        ? `<br><small>${item.kind === 'curio' ? '代客席收购报价' : '单件收购报价（未计财力上限）'} ${num(minimum)}–${num(maximum)} 灵石；扣佣后实收 ${num(minimum - auctionFee(minimum, true))}–${num(maximum - auctionFee(maximum, true))} 灵石。</small>`
        : '';

    content = `<details><summary>委托规则与估价</summary><p class="panel-note">按会场类别委托行囊中的丹药、法宝、奇物或玄铁。${AUCTION_HALLS[0].name}不收珍品与奇物，玄铁只在${AUCTION_HALLS[0].name}交易。玄铁每批至少150枚，以当期回收行情的九至十折出价。奇物售出后助益消失，本世无法再得。每次委托消耗半年，流拍也计龄。丹药与法宝按估值的 ${auctionSaleRates({ kind: 'medicine', id: '', quantity: 1, forgeLevel: 0 }).join('%–')}% 出价，受来客财力限制；扣佣后通常实收估值的七成二至九成，零头向下取整。大批量或高价物品可能超出来客财力，可拆批或前往更高会场。奇物珍藏估值计入长久使用的助益，急售由代客席按估值的 10%–15% 收购。达到保留价才成交，卖方佣金为成交价的 10%。当前本命不可出售；入门赠品只按炼器投入估值。丹药出售不影响已服用药效、服用次数与药方。</p></details><div class="auction-seller"><label>委托类别<select id="auction-kind" aria-label="委托类别"><option value="medicine" ${kind === 'medicine' ? 'selected' : ''}>丹药</option><option value="artifact" ${kind === 'artifact' ? 'selected' : ''}>法宝</option>${state.hall === 0 ? `<option value="iron" ${kind === 'iron' ? 'selected' : ''}>玄铁</option>` : `<option value="curio" ${kind === 'curio' ? 'selected' : ''}>奇物</option>`}</select></label>${item ? `<label>委托物品<select id="auction-item" aria-label="委托物品">${choices.map((i) => `<option value="${i.id}" ${id === i.id ? 'selected' : ''}>${i.name}${kind === 'iron' ? `（持有 ${save.iron} 枚）` : kind === 'medicine' ? `（持有 ${save.medicine.bag[i.id]}）` : kind === 'curio' ? `（持有 ${save.curios.bag[i.id as keyof typeof save.curios.bag] ?? 0} 件）` : `（炼器 ${save.forge[i.id] || 0} 阶${i.id === save.starter ? ' · 当前本命' : ''}）`}</option>`).join('')}</select></label><section class="sect-market-offer">${art(item)}<div><strong>${auctionItemName(item)}</strong><p>${detail(item)}</p><small>${kind === 'curio' ? '珍藏估值' : kind === 'iron' ? `${AUCTION_IRON_MIN} 枚估值` : '单件估值'} ${num(value)} 灵石</small>${resale}</div></section>${kind === 'medicine' || kind === 'iron' ? `<label>委托数量<input id="auction-quantity" type="number" inputmode="numeric" min="${kind === 'iron' ? AUCTION_IRON_MIN : 1}" max="${Math.min(kind === 'iron' ? 9999 : 99, kind === 'iron' ? save.iron : save.medicine.bag[item.id])}" step="1" value="${item.quantity}" aria-label="委托数量"></label>` : ''}<label>总保留价（不含佣金）<input id="auction-reserve" type="number" inputmode="numeric" min="1" step="1" value="${minimum}" aria-label="总保留价"></label><small class="panel-note">批量物品请按总数量填写保留价；未达到此价不扣物品、不收佣金。</small><button class="secondary-button" data-action="auction-sell" data-visit="${visit}" data-hall="${state.hall}" ${reason ? 'disabled' : ''}>${reason || '委托出售'}</button>` : `<p class="panel-note">${reason}</p>`}</div>`;
  } else {
    content = `<p class="panel-note">近来的结拍往来。</p>${state.history.length ? state.history.map((r) => `<article class="auction-receipt">${art(r)}<div><small>${r.age.toFixed(1)} 岁 · ${AUCTION_HALLS[r.hall].name} · 第 ${r.visit} 批</small><p>${auctionResult(save, r)}</p></div></article>`).join('') : '<p class="panel-note">尚未参与竞拍或委托出售。</p>'}`;
  }
  return `${toolbar}<p id="auction-result" class="auction-result" role="status" hidden></p>${content}<button class="secondary-button auction-return" data-action="close">回到坊市</button>`;
}

// 会场切换与缴费同样先写档，再应用到当前页面。
export function auctionHallAction(shell: ActionShell, id?: string, action = 'auction-hall') {
  const button = shell.modal.querySelector<HTMLButtonElement>(
    `[data-action="${action}"][data-id="${Number(id)}"]`,
  );
  if (!button || button.disabled) return;
  if (action === 'auction-hall-cancel') {
    shell.refreshAuction();
    shell.modal
      .querySelector<HTMLButtonElement>(`[data-action="auction-hall"][data-id="${Number(id)}"]`)
      ?.focus({ preventScroll: true });
    return;
  }
  const next = shell.structuredClone(shell.save);
  const reason = selectAuctionHall(
    next,
    Number(id),
    Number(button.dataset.visit),
    button.dataset.pay === '1',
  );
  if (reason) {
    shell.toast(reason);
    return;
  }
  if (next.stones < shell.save.stones && action !== 'auction-hall-confirm') {
    const host = shell.modal.querySelector<HTMLElement>('#auction-content');
    if (!host) return;
    const hall = AUCTION_HALLS[Number(id)]!;
    host.innerHTML = `<section class="auction-card auction-admission" aria-labelledby="auction-admission-title"><h3 id="auction-admission-title">取得${hall.name}资格？</h3><p>支付 <strong>${num(hall.admission)} 灵石</strong>，取得本世${hall.name}资格${Number(id) === 2 ? `，同时可进入${AUCTION_HALLS[1].name}` : ''}。</p><p class="panel-note">确认后扣除灵石并进入会场，本世不再重复收费。</p><div class="result-actions"><button class="secondary-button" data-action="auction-hall-cancel" data-id="${Number(id)}">暂不支付</button><button class="primary-button" data-action="auction-hall-confirm" data-id="${Number(id)}" data-visit="${button.dataset.visit}" data-pay="1">确认支付 ${num(hall.admission)} 灵石</button></div></section>`;
    const section = shell.modal.querySelector<HTMLElement>('.panel');
    if (section) section.scrollTop = 0;
    host.querySelector<HTMLButtonElement>('[data-action="auction-hall-cancel"]')?.focus();
    return;
  }
  try {
    shell.writeSave(next, shell.pendingRun);
  } catch {
    if (!shell.saveLock) shell.toast('会场切换未完成：暂时无法保存，请重试');
    return;
  }
  Object.assign(shell.save, next);
  if (
    (next.mortal.auction!.hall === 0 && shell.auctionKind === 'curio') ||
    (next.mortal.auction!.hall > 0 && shell.auctionKind === 'iron')
  )
    shell.auctionKind = 'medicine';
  shell.refreshAuction();
  const status = shell.document.getElementById('town-status');
  if (status) status.innerHTML = shell.townStatus(shell.save);
}

export function executeAuctionTrade(
  save: SaveData,
  next: SaveData,
  action: string,
  id: string | undefined,
  visit: number,
  auctionKind: AuctionKind,
  hasPendingRun: boolean,
  modal: Pick<ParentNode, 'querySelector'>,
) {
  const button = modal.querySelector<HTMLButtonElement>(
    action === 'auction-buy'
      ? `[data-action="auction-buy"][data-id="${Number(id)}"]`
      : '[data-action="auction-sell"]',
  );
  if (Number(button?.dataset.hall) !== save.mortal.auction?.hall)
    return { ok: false as const, error: '会场已切换，请重新选择拍品' };
  if (action === 'auction-buy') {
    const index = Number(id);
    const reason = auctionBuyReason(save, index, visit, hasPendingRun);
    if (reason) return { ok: false as const, error: reason };
    const budget = Number(modal.querySelector<HTMLInputElement>(`#auction-budget-${index}`)?.value);
    const start = auctionLots(save).find((lot) => lot.index === index)!.start;
    const result = buyAuction(
      next,
      index,
      budget,
      visit,
      hasPendingRun,
      Number(
        modal.querySelector<HTMLButtonElement>(`[data-action="auction-buy"][data-id="${index}"]`)
          ?.dataset.cycle,
      ),
    );
    if (!result)
      return {
        ok: false as const,
        error: '请输入扣除到期供奉后可负担、且足够起拍的整数预算（含手续费）',
      };
    return { ok: true as const, result, message: auctionResult(save, result, { budget, start }) };
  }
  if (action === 'auction-sell') {
    const selected = modal.querySelector<HTMLSelectElement>('#auction-item')?.value ?? '';
    const item: AuctionItem = {
      kind: auctionKind,
      id: selected,
      quantity:
        auctionKind !== 'medicine' && auctionKind !== 'iron'
          ? 1
          : Number(modal.querySelector<HTMLInputElement>('#auction-quantity')?.value),
      forgeLevel: auctionKind === 'artifact' ? save.forge[selected] || 0 : 0,
    };
    const reason = auctionSellReason(save, item, visit, hasPendingRun);
    if (reason) return { ok: false as const, error: reason };
    const reserve = Number(modal.querySelector<HTMLInputElement>('#auction-reserve')?.value);
    const result = sellAuction(next, item, reserve, visit, hasPendingRun);
    if (!result)
      return { ok: false as const, error: '请输入有效的整数保留价，灵石余额不能超出上限' };
    return { ok: true as const, result, message: auctionResult(save, result) };
  }
  return null;
}
