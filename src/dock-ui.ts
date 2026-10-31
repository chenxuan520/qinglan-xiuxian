import type { SaveData } from './progress.ts';
import type { TownResident } from './town-population.ts';
import type { PanelParts } from './panel-host.ts';
import { medicineInfo } from './medicine-data.ts';
import { medicineArt } from './medicine-ui.ts';
import { curioArt } from './curio-art.ts';
import { curioName, acquiredCurio } from './curio-data.ts';
import { nightBoatCanClaim } from './night-boat-claim.ts';
import { lifespanInfo } from './progress.ts';
import { dockRumors, type DockRumor } from './dock-rumors.ts';

const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

export function teaStoryPanel(): PanelParts {
  return [
    '一盏茶，半卷仙途',
    '听雨茶馆 · 仙途旧闻',
    '<section class="tea-story" aria-label="茶馆说书"><p class="tea-story-status panel-note" role="status">说书人正待开讲…</p><div class="tea-story-text"></div><div class="save-actions"><button class="secondary-button tea-story-play" hidden>朗读故事</button><button class="secondary-button tea-story-stop" hidden disabled>停止朗读</button></div><p class="tea-story-image-status panel-note" role="status"></p><p class="panel-note">听书半载，有 30% 机会获赠 8 灵石。阅读与朗读不另耗年岁；再听一回另耗半载。</p><div class="save-actions"><button class="primary-button" data-action="close">回到街巷</button><button class="secondary-button tea-story-next" data-action="mortal-activity" data-id="tea" disabled>再听一回 · 半载</button><button class="secondary-button tea-story-retry" hidden disabled>重试这一回</button></div></section>',
  ];
}

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

let visitCache: { key: string; normal: DockRumor[]; ranked: DockRumor[] } | null = null;
export function dockRumorsContent(save: SaveData, rankingEnabled: boolean) {
  const key = `${save.medicine.recipeSeed}:${save.mortal.population?.seed}:${save.mortal.scenery?.lastVisitAge}`;
  if (visitCache?.key !== key)
    visitCache = { key, normal: dockRumors(save, false), ranked: dockRumors(save, true) };
  return `<section class="dock-rumors"><h3>船客传闻</h3>${(rankingEnabled ? visitCache.ranked : visitCache.normal).map((r) => `<p class="panel-note">${escape(r.text)}${rankingEnabled && r.href ? ` <a class="dock-rumor-link" href="https://xiuxian.011203.xyz/leaderboard/" target="_blank" rel="noopener">去看看 ↗</a>` : ''}</p>`).join('')}</section>`;
}
export function nightBoatPanel(
  save: SaveData,
  pendingCurios: Record<string, number> = {},
): PanelParts {
  const boat = save.mortal.nightBoat!;
  if (boat.claimed)
    return [
      '夜船',
      '青岚码头',
      '<p class="pause-description">那人点了点头，一句话也没多说。等你回头，船已经离岸了。</p><button class="secondary-button" data-action="close">回到码头</button>',
    ];
  const medicine = medicineInfo(boat.id);
  const unknown = boat.kind === 'permanent' && !Object.hasOwn(save.medicine.bag, boat.id);
  const name =
    boat.kind === 'curio'
      ? curioName(boat.id)
      : unknown
        ? '一枚说不上名字的珍品丹'
        : medicine!.name;
  const art =
    boat.kind === 'curio'
      ? curioArt(boat.id)
      : unknown
        ? '<span class="medicine-art night-boat-unknown" aria-hidden="true">？</span>'
        : medicineArt(medicine!);
  const allowed = nightBoatCanClaim(save, pendingCurios);
  const life = lifespanInfo(save);
  const insufficient = !Number.isFinite(life.base) || life.remaining - boat.cost < life.base * 0.1;
  const reason = insufficient ? '寿元不够' : boat.kind === 'curio' ? '此物已得' : '丹囊已满';
  return [
    '夜船',
    '青岚码头',
    `<p class="pause-description">船头没有点灯。撑船的人不要灵石，只问你肯拿几年阳寿来换舱里的东西。</p><section class="night-boat-offer">${art}<div><strong>${escape(name)}</strong><p class="panel-note">折寿 ${boat.cost} 年</p></div></section><button class="primary-button" data-action="night-boat-buy" ${allowed ? '' : 'disabled'}>${allowed ? '换下' : reason}</button>`,
  ];
}
