import type { CultivationPath } from './data.ts';
import type { SaveData } from './progress.ts';
import { medicineInfo } from './medicine-data.ts';
import { medicineArt } from './medicine-ui.ts';
import { curioArt } from './curio-art.ts';
import { curioName, acquiredCurio } from './curio-data.ts';
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
import type { PanelParts } from './panel-host.ts';

export function immortalEncounterPanel(
  save: SaveData,
  npc: TownResident,
  granted: boolean,
  pendingCurios: Record<string, number> = {},
): PanelParts {
  const visitor = save.mortal.immortal!;
  const medicine = medicineInfo(visitor.medicineId)!;
  const curio =
    visitor.curioId &&
    (visitor.claimed || (!acquiredCurio(save, visitor.curioId) && !pendingCurios[visitor.curioId]))
      ? visitor.curioId
      : undefined;
  const name = curio ? curioName(curio) : medicine.name;
  const held = curio ? save.curios.bag[curio] || 0 : save.medicine.bag[medicine.id] || 0;
  const offered = visitor.claimed;
  let story = granted
    ? '<p>那人混在赶集的人群里，衣衫寻常，正替摊主扶稳一盏旧灯。你停步问路，他却笑着说起千年前的渡口——连那时桥下的一株老柳，也记得清楚。</p><p>街声依旧喧闹，四周灵机却在他抬眼时静了一瞬。你才明白，眼前并非凡人。</p><p>“走得远了，才知人间一碗热茶，也值得回来。”他将一只小瓷瓶放入你掌心，“长生路长，莫只顾赶路。今日相逢，便赠你这一炉余香。”</p><p>再望去，他仍只是街巷里一张平常的面孔。你收好瓷瓶，把这场相逢记在心里。</p>'
    : '<p>你再度向这位前辈问候。他仍坐在街巷间，笑着与你说起人间烟火。这场仙缘已记在心里，此次相遇的赠礼也已收下。</p>';
  if (curio)
    story = story
      .replace('一只小瓷瓶', '一件随身旧物')
      .replace('这一炉余香', '这件随我走过山河的旧物')
      .replace('收好瓷瓶', '将旧物收入行囊');
  if (!offered)
    story = '<p>前辈将赠礼收在袖中，笑着等你整理行囊。腾出余地后，再来领这场仙缘便是。</p>';
  return [
    '市井逢仙',
    `青岚镇 · 与${npc.name}的一席闲谈`,
    `<section class="immortal-gift${granted ? '' : ' is-claimed'}" aria-label="仙人赠礼">${curio ? curioArt(curio) : medicineArt(medicine)}<div><small>仙人赠礼 · ${curio ? '奇物' : medicine.years ? '珍品' : '本世珍品'}</small><strong>${granted ? '获赠' : offered ? '此前获赠' : '待赠'}：${name} <span>×1</span></strong><p>${granted ? (curio ? '已收入行囊 · 持有即生效' : '已收入丹囊') : offered ? '此次赠礼已收下' : '行囊已满，尚未领取'} · 现持有 ${held} ${curio ? '件' : '份'}</p></div></section><div class="town-story immortal-encounter">${story}</div><button class="primary-button" data-action="close">${granted ? '谢过前辈' : '与前辈作别'} · 继续游历</button>`,
  ];
}

export function teaStoryPanel(): PanelParts {
  return [
    '一盏茶，半卷仙途',
    '听雨茶馆 · 仙途旧闻',
    '<section class="tea-story" aria-label="茶馆说书"><p class="tea-story-status panel-note" role="status">说书人正待开讲…</p><div class="tea-story-text"></div><div class="save-actions"><button class="secondary-button tea-story-play" hidden>朗读故事</button><button class="secondary-button tea-story-stop" hidden disabled>停止朗读</button></div><p class="tea-story-image-status panel-note" role="status"></p><p class="panel-note">听书半载，有 30% 机会获赠 8 灵石。阅读与朗读不另耗年岁；再听一回另耗半载。</p><div class="save-actions"><button class="primary-button" data-action="close">回到街巷</button><button class="secondary-button tea-story-next" data-action="mortal-activity" data-id="tea" disabled>再听一回 · 半载</button><button class="secondary-button tea-story-retry" hidden disabled>重试这一回</button></div></section>',
  ];
}

export function marketAmbushPanel(held: number, extreme = false): PanelParts {
  return [
    '话中藏刃',
    '坊外 · 劫修伏击',
    `<div id="market-ambush"></div><details class="market-ambush-rules"><summary>遭遇规则与战利品</summary><p class="panel-note">${held} 灵石已暂扣。击败劫修后自动取回，并收取其携带的战利品：一份丹药，可能另有一件法宝，品级与炼器符合对方境界。战利品自动收入行囊。</p><p class="panel-note">${extreme ? '极限模式无法撤离或复活，战败与未完战斗刷新、关闭页面都将结束此世。离开画面时战斗暂停。' : '点「尝试撤离」后会自动向左退，也可手动走位；到达左侧退路、与追兵拉开距离并连续守住两秒才算脱身，成功后损失本次暂扣灵石。气血耗尽会身死，可选择广告复活；放弃复活或机会用尽时，点「查看此世落幕」进入身陨落幕页。离开画面时战斗暂停。'}</p></details>`,
  ];
}

export function marketAmbushRecoveryPanel(): PanelParts {
  return [
    '尚有一场劫修遭遇未结',
    '坊外险路',
    '<p>这场遭遇尚未结束，暂时无法继续。请重试后应战。</p><button class="secondary-button" data-action="market-ambush-recover">重试恢复遭遇</button>',
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
  debateChoice = 'talk',
) {
  if (!prepareMarketSocial(next)) return { ok: false as const, stale: false };
  const result = [
    'sect-market-debate',
    'sect-market-debate-pay',
    'sect-market-debate-swap',
  ].includes(action)
    ? (action === 'sect-market-debate' && debateChoice === 'talk') ||
      (action === 'sect-market-debate-pay' && debateChoice.startsWith('pay:')) ||
      (action === 'sect-market-debate-swap' && debateChoice.startsWith('swap:'))
      ? debateMarket(next, id, visit, debateChoice)
      : undefined
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
