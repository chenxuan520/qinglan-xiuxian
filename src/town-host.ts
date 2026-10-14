import type { CultivationPath } from './data.ts';
import type { SaveData } from './progress.ts';
import { medicineInfo } from './medicine-data.ts';
import { medicineArt } from './medicine-ui.ts';
import { freshTownPopulation, type TownResident } from './town-population.ts';
import { townVisit, townReturnMemory } from './town-history.ts';
import { visitTownImmortal } from './town-immortal.ts';
import { joinSect, leaveSect, startActivity, tradeIron } from './mortal.ts';
import type { MarketCultivator } from './sect-market-data.ts';
import {
  chooseMarketOpportunity,
  debateMarket,
  fulfillMarketRequest,
  prepareMarketSocial,
} from './market-social.ts';
import { auctionBuyReason, auctionSellReason, buyAuction, sellAuction } from './auction.ts';
import type { AuctionItem, AuctionKind } from './auction-data.ts';
import type { PanelParts } from './panel-host.ts';

export function immortalEncounterPanel(
  save: SaveData,
  npc: TownResident,
  granted: boolean,
): PanelParts {
  const visitor = save.mortal.immortal!;
  const medicine = medicineInfo(visitor.medicineId)!;
  const story = granted
    ? '<p>那人混在赶集的人群里，衣衫寻常，正替摊主扶稳一盏旧灯。你停步问路，他却笑着说起千年前的渡口——连那时桥下的一株老柳，也记得清楚。</p><p>街声依旧喧闹，四周灵机却在他抬眼时静了一瞬。你才明白，眼前并非凡人。</p><p>“走得远了，才知人间一碗热茶，也值得回来。”他将一只小瓷瓶放入你掌心，“长生路长，莫只顾赶路。今日相逢，便赠你这一炉余香。”</p><p>再望去，他仍只是街巷里一张平常的面孔。你收好瓷瓶，把这场相逢记在心里。</p>'
    : '<p>你再度向这位前辈问候。他仍坐在街巷间，笑着与你说起人间烟火。这场仙缘已记在心里，此次相遇的丹药也已赠过。</p>';
  return [
    '市井逢仙',
    `青岚镇 · 与${npc.name}的一席闲谈`,
    `<section class="immortal-gift${granted ? '' : ' is-claimed'}" aria-label="仙人赠药">${medicineArt(medicine)}<div><small>仙人赠药 · ${medicine.years ? '珍品' : '本世珍品'}</small><strong>${granted ? '获赠' : '此前获赠'}：${medicine.name} <span>×1</span></strong><p>${granted ? '已收入丹囊' : '此次仙缘已赠药 · 不重复赠送'} · 现持有 ${save.medicine.bag[medicine.id] || 0} 份</p></div></section><div class="town-story immortal-encounter">${story}</div><button class="primary-button" data-action="close">${granted ? '谢过前辈' : '与前辈作别'} · 继续游历</button>`,
  ];
}

export function teaStoryPanel(): PanelParts {
  return [
    '一盏茶，半卷仙途',
    '听雨茶馆 · 仙途旧闻',
    '<section class="tea-story" aria-label="茶馆说书"><p class="tea-story-status panel-note" role="status">正在生成故事，请稍候…</p><div class="tea-story-text"></div><div class="save-actions"><button class="secondary-button tea-story-play" hidden>朗读故事</button><button class="secondary-button tea-story-stop" hidden disabled>停止朗读</button></div><p class="tea-story-image-status panel-note" role="status"></p><p class="panel-note">本次听书已消耗半载并判定机缘（30% 概率获赠 8 灵石）。失败重试不再扣年岁；再听一回会另耗半载并判定机缘。配图不阻塞正文，阅读与朗读不再计龄。</p><div class="save-actions"><button class="primary-button" data-action="close">回到街巷</button><button class="secondary-button tea-story-next" data-action="mortal-activity" data-id="tea" disabled>再听一回 · 半载</button><button class="secondary-button tea-story-retry" hidden disabled>重试这一回</button></div></section>',
  ];
}

export function marketAmbushPanel(held: number): PanelParts {
  return [
    '话中藏刃',
    '坊外 · 劫修伏击',
    `<p class="panel-note">${held} 灵石已暂扣，击退后全数取回；败退、离开或刷新仅损失此额，行囊中的法宝和丹药保留。</p><div id="market-ambush"></div>`,
  ];
}

export function marketAmbushRecoveryPanel(): PanelParts {
  return [
    '尚有一场劫修遭遇未结',
    '坊外险路',
    '<p>重新载入按脱身结算，暂扣限额不会重复扣除；浏览器暂时无法保存，请重试后继续。</p><button class="secondary-button" data-action="market-ambush-recover">重试保存脱身结果</button>',
  ];
}

export function enterTownVisit(save: SaveData): string | null {
  const previous = save.mortal.scenery;
  save.mortal.population ??= freshTownPopulation(save.age);
  visitTownImmortal(save, previous?.lastVisitAge);
  const scenery = (save.mortal.scenery = townVisit(previous, save.age));
  const memory = townReturnMemory(
    save.mortal.population.seed,
    previous,
    scenery,
    !!save.mortal.hometown,
  );
  if (memory) {
    save.mortal.events.unshift(memory);
    save.mortal.events.splice(6);
  }
  return memory;
}

export function executeMortalAction(
  save: SaveData,
  action: string,
  id: string | undefined,
  pendingPath?: CultivationPath,
): boolean {
  return action === 'mortal-join'
    ? joinSect(save, id ?? '', pendingPath)
    : action === 'mortal-leave'
      ? leaveSect(save)
      : action === 'mortal-activity'
        ? startActivity(save, id ?? '')
        : action === 'mortal-buy'
          ? tradeIron(save, true, Number(id?.split(':')[1]), Number(id?.split(':')[0]))
          : action === 'mortal-sell'
            ? tradeIron(save, false, Number(id?.split(':')[1]), Number(id?.split(':')[0]))
            : false;
}

export function executeMarketSocial(
  next: SaveData,
  action: string,
  id: MarketCultivator['id'],
  visit: number,
  level: number,
  hasPendingRun: boolean,
) {
  if (!prepareMarketSocial(next)) return { ok: false as const, stale: false };
  const result =
    action === 'sect-market-debate'
      ? debateMarket(next, id, visit)
      : action === 'sect-market-request'
        ? fulfillMarketRequest(next, id, visit, level, hasPendingRun)
        : chooseMarketOpportunity(
            next,
            id,
            visit,
            action === 'sect-market-inspect'
              ? 'inspect'
              : action === 'sect-market-decline'
                ? 'decline'
                : 'accept',
            hasPendingRun,
          );
  if (!result) return { ok: false as const, stale: true };
  const message =
    result.kind === 'debate'
      ? '论道已完成 · 本次所得已记在此处'
      : result.kind === 'exposed'
        ? '核验完成 · 可查看本次线索'
        : result.text.length > 75
          ? `${result.text.slice(0, 72)}…`
          : result.text;
  return { ok: true as const, stale: false, message };
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
  if (action === 'auction-buy') {
    const index = Number(id);
    const reason = auctionBuyReason(save, index, visit, hasPendingRun);
    if (reason) return { ok: false as const, error: reason };
    const budget = Number(modal.querySelector<HTMLInputElement>(`#auction-budget-${index}`)?.value);
    const result = buyAuction(next, index, budget, visit, hasPendingRun);
    if (!result)
      return {
        ok: false as const,
        error: '请输入扣除到期供奉后可负担、且足够起拍的整数预算（含手续费）',
      };
    return { ok: true as const, result };
  }
  if (action === 'auction-sell') {
    const selected = modal.querySelector<HTMLSelectElement>('#auction-item')?.value ?? '';
    const item: AuctionItem = {
      kind: auctionKind,
      id: selected,
      quantity:
        auctionKind === 'artifact'
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
    return { ok: true as const, result };
  }
  return null;
}
