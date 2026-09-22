import { assetUrl } from './asset-url.ts';
import {
  passive,
  REALMS,
  FINAL_TRIAL_STAGE,
  spiritRootInfo,
  type CultivationPath,
} from './data.ts';
import { lifespanInfo, realmInfo, type SaveData } from './progress.ts';
import { hometownParents, hometownLetter, type ParentId } from './hometown.ts';
import {
  SECTS,
  SECT_DUES,
  SECT_ROLES,
  TOWN_JOBS,
  MAX_MASTERY,
  MAX_SECT_DUES,
} from './mortal-data.ts';
import { entryCost, masteryBonus, sectDues, sectRole, studyPlan } from './mortal.ts';
import { icon } from './icons.ts';
import { type TownResident } from './town-population.ts';
import { npcDefaultLine } from './npc-dialogue.ts';
import { NPC_AI_SETTINGS } from './setting.ts';
import { smithAt, smithStoryView } from './town-story.ts';
import {
  HUMAN_STORIES,
  HUMAN_STORY_IDS,
  humanStoryView,
  type HumanStoryId,
} from './human-stories.ts';

const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
function sectArt(sect: (typeof SECTS)[number]) {
  // 魔道建筑左右展开不等宽，按实际边界取景，避免相邻建筑串入。
  const [x, width] =
    sect.school === 'demonic'
      ? [
          [0, 420],
          [420, 367],
          [787, 360],
          [1147, 389],
          [0, 416],
          [416, 377],
          [793, 350],
          [1143, 393],
        ][sect.art]
      : [(sect.art % 4) * 384, 384];
  return `<span class="sect-art" aria-hidden="true" style="background-image:url('${assetUrl(`assets/sects-${sect.school}.webp`)}');background-size:${(1536 / width) * 100}% 200%;background-position:${(x / (1536 - width)) * 100}% ${Math.floor(sect.art / 4) * 100}%"></span>`;
}
export function masteryDescription(save: SaveData, id: string) {
  const level = save.mortal.mastery[id] || 0;
  const bonus = masteryBonus(save, id);
  return level
    ? `宗门精研 ${level} 阶 · ${save.mortal.member?.id === id ? `当前生效 ${Math.min(level, studyPlan(save).limit)} 阶，正向效果 +${Math.round(bonus * 100)}%` : '未在本门，加成未生效'}`
    : '';
}
export function mortalEntrance(save: SaveData) {
  const member = SECTS.find((s) => s.id === save.mortal.member?.id);
  return `<section class="mortal-entrance"><div><small>山下有烟火，山上有仙门</small><h2>入世问道</h2><p>城镇烟火 · 山门问道 · 人间百态</p><div class="mortal-identity"><span>当前身份</span><strong>${member ? `${member.name} · ${member.school === 'orthodox' ? '正道' : '魔道'}` : '散修'}</strong>${member ? `<b>${sectRole(save)}</b>` : ''}</div></div><button class="secondary-button" data-action="mortal-enter">游历人间 <span>入城游历 →</span></button></section>`;
}
export function mortalStatus(save: SaveData) {
  const world = save.mortal;
  const life = lifespanInfo(save);
  const member = world.member;
  const free = sectDues(save).stones === 0;
  const activity = world.activity;
  const study = activity?.kind === 'study' ? studyPlan(save) : null;
  return `<div><small>此世年岁 / 寿元</small><strong>${life.age.toFixed(2)} <em>/ ${Number.isFinite(life.limit) ? life.limit : '长生'}</em></strong></div><div><small>累计游历人间</small><strong>${world.years.toFixed(2)} <em>年</em></strong></div><div><small>${member ? '下次宗门供奉' : '宗门身份'}</small><strong>${member ? (free ? '真仙 · 免供奉' : `${Math.max(0, member.dueAt - world.years).toFixed(1)} 年后`) : '逍遥散修'}</strong><span>${member && !free ? `${member.dues} 灵石 · 到期自动缴纳` : member ? '在籍精研加成持续生效' : '可拜入任一正道或魔道宗门'}</span></div><div><small>人间行迹</small><strong>${activity ? (activity.kind === 'study' ? (study?.eligible ? '研习待结算' : '研习待突破') : TOWN_JOBS[activity.kind].name) : '闲游人间'}</strong><span>${activity ? `尚需消耗 ${activity.remaining.toFixed(2)} 年 · ${study && !study.eligible ? `需${study.requiredRealm}，达标后再访人间即结算` : '先处理供奉、寿元或天劫'}` : '办事直接消耗年岁，即时结算'}</span></div>`;
}
export function townStatus(save: SaveData) {
  const life = lifespanInfo(save);
  const activity = save.mortal.activity;
  const study = activity?.kind === 'study' ? studyPlan(save) : null;
  return `<strong>年岁 ${life.age.toFixed(2)} <em>/ ${Number.isFinite(life.limit) ? life.limit : '长生'}</em></strong><span>灵石 ${save.stones.toLocaleString('zh-CN')} · 玄铁 ${save.iron}</span>${activity ? `<span>${activity.kind === 'study' ? (study!.eligible ? '功法研习' : `研习暂停 · 需${study!.requiredRealm}`) : TOWN_JOBS[activity.kind].name} · 尚需消耗 ${activity.remaining.toFixed(2)} 年</span>` : ''}`;
}
export function townPage(save: SaveData, fullscreenButton: string) {
  if (save.mortal.hometown && save.mortal.hometown.stage !== 'departed')
    return `<main class="town-scene hometown-departure" aria-label="十五岁离乡"><div id="town-view" class="town-view" tabindex="0" role="region" aria-label="青岚镇，方向键或触屏拖动移动，也可点击前往渡口自动走动"></div><header class="town-scene-heading"><div class="town-hud"><small>十五岁 · 青岚镇</small><h2>前往渡口</h2><small>沿街向东，循河到渡口</small></div><div class="town-scene-actions">${fullscreenButton}</div></header><footer class="town-scene-controls"><p>WASD / 方向键 · 触屏拖动<br>手动移动可接管自动前往</p><button class="primary-button" data-action="town-talk">前往渡口</button></footer></main>`;
  return `<main class="town-scene" aria-label="青岚镇游历"><div id="town-view" class="town-view" tabindex="0" role="region" aria-label="青岚镇，可用方向键移动，靠近镇民按 E 交谈"></div><header class="town-scene-heading"><div class="town-hud"><h2>青岚镇</h2>${save.mortal.scenery?.since !== undefined ? `<small>自记城景 · 已过 ${Math.floor(save.mortal.scenery.lastVisitAge - save.mortal.scenery.since)} 年</small>` : ''}<small>现实 1 分钟 = 1 年</small><div id="town-status">${townStatus(save)}</div></div><div class="town-scene-actions">${fullscreenButton}<button class="secondary-button" data-action="town-exit">离开城镇</button></div></header><footer class="town-scene-controls"><p>WASD / 方向键 · 触屏拖动<br>靠近镇民，按 E 或点击交谈</p><button class="primary-button" data-action="town-talk" disabled>走近镇民可交谈</button></footer></main>`;
}
export function mortalPage(
  save: SaveData,
  tab: 'town' | 'sects',
  filter: string,
  unfinishedPath?: CultivationPath,
) {
  return `<header class="mortal-header"><button class="mortal-back secondary-button" data-action="home">← 返回仙途</button><a class="mortal-brand" href="#" data-action="mortal-enter">青岚 · 人间</a><div id="mortal-currency">灵石 ${save.stones.toLocaleString('zh-CN')} · 玄铁 ${save.iron}</div></header>
  <main class="mortal-main">
    <section class="mortal-hero"><div><div class="eyebrow"><span></span>山河万象 · 烟火人间</div><h1>且向人间<span>借一程烟火</span></h1><p>行过市井长街，听一段山河旧事。<br>走访城镇、拜入仙门，皆是人间修行。</p><p class="mortal-clock-note">城镇内现实 1 分钟 = 1 年 · 办事直接消耗对应年岁<br>浏览入口、宗门页签与弹窗不计时；切后台暂停。</p></div></section>
    <section id="mortal-status" class="mortal-status" aria-label="人间年岁与供奉">${mortalStatus(save)}</section>
    <nav class="mortal-tabs" role="group" aria-label="人间去处">${[
      ['town', '城镇', '市井委托 · 灵材交易'],
      ['sects', '宗门', '拜入仙门 · 功法精研'],
    ]
      .map(
        ([id, name, detail]) =>
          `<button data-action="mortal-tab" data-id="${id}" class="${tab === id ? 'active' : ''}" aria-pressed="${tab === id}"><strong>${name}</strong><span>${detail}</span></button>`,
      )
      .join('')}</nav>
    <div id="mortal-content">${mortalTabContent(save, tab, filter, unfinishedPath)}</div>
    ${humanStoryJournal(save)}${smithStoryJournal(save)}<section class="mortal-journal"><h2>人间见闻</h2><ol>${save.mortal.events.length ? save.mortal.events.map((event) => `<li>${escape(event)}</li>`).join('') : '<li>初入人间，山河待访。</li>'}</ol></section>
    <footer class="mortal-footer">一程烟火，一卷仙缘。<button data-action="home">返回仙途 →</button></footer>
  </main>`;
}
export function mortalTabContent(
  save: SaveData,
  tab: 'town' | 'sects',
  filter: string,
  unfinishedPath?: CultivationPath,
) {
  const world = save.mortal;
  if (tab === 'town')
    return `<section class="town-arrival"><div><span class="eyebrow">山下烟火</span><h2>青岚镇</h2><p>商铺沿街，炊烟绕巷。<br>走进城镇，去港口听潮，拜访九位行当中人，与街上十二位村民闲谈。</p><p class="panel-note">城门外不消耗寿元。入城后时间流逝，切换到宗门或离开城镇即暂停。</p><button class="primary-button" data-action="town-enter">走进青岚镇 →</button></div><div class="town-arrival-art" aria-hidden="true"><span></span><span></span><span></span></div></section>`;
  const member = SECTS.find((s) => s.id === world.member?.id);
  const plan = studyPlan(save);
  const dues = sectDues(save);
  const effectiveLevel = Math.min(plan.level, plan.limit);
  return `<section class="mortal-membership"><div><small>我的仙门 · ${sectRole(save)}</small><h2>${member?.name ?? '尚未拜入宗门'}</h2><p>${member ? `${passive(member.id).name} · 精研 ${plan.level} / ${MAX_MASTERY} 阶 · 当前生效 ${effectiveLevel} 阶 · 正向效果 +${effectiveLevel * 3}%` : '同时只能加入一个宗门；入宗锁定本门正魔路线，不能兼修。开局赠本门功法一重，退宗后可重新选择路线。'}</p><p>入宗后锁定本门路线，不能兼修；退宗才可换道或改投他门。精研每阶增强本门功法正向效果 3%，满阶 30%；离宗保留成果，加成暂停。新历练自动获本门功法一重，占 4 个功法槽之一；局内升至三重才能参与仙器觉醒。</p></div>${member ? `<div class="mortal-study"><button class="primary-button" data-action="mortal-activity" data-id="study" data-cost-stones="${plan.stones}" ${world.activity || !plan.eligible ? 'disabled' : ''}>${plan.level >= MAX_MASTERY ? '本门精研已满' : !plan.eligible ? `需${plan.requiredRealm}解锁` : world.activity ? '有事项待结算' : `精研下一阶 · ${plan.stones} 灵石 / ${plan.years} 年`}</button><small>当前境界可精研至 ${plan.limit} 阶${plan.requiredRealm ? ` · 下一阶需${plan.requiredRealm}` : ''}<br>境界只作门槛，不消耗修为；超出的旧成果在突破后恢复。<br>${spiritRootInfo(save.spiritRoot).name} · 消耗 ${plan.years} 年<br>点击即扣灵石与年岁，立即精研；遇供奉、寿尽或天劫时先处理，未完成时退宗不退费。精研五阶赠随机凡品丹药一颗，十阶赠随机灵品丹药一颗；每门各一次，自动收入丹囊。</small><button class="mortal-leave" data-action="mortal-leave">退出宗门</button></div>` : ''}</section>    <section class="mortal-sects"><div class="section-heading"><div><span class="section-number">仙门</span><h2>十六宗门，各有其道</h2></div><div class="mortal-filters" role="group" aria-label="宗门流派">${[
    ['all', '全部'],
    ['orthodox', '正道'],
    ['demonic', '魔道'],
  ]
    .map(
      ([id, label]) =>
        `<button data-action="mortal-filter" data-id="${id}" aria-pressed="${filter === id}" class="${filter === id ? 'active' : ''}">${label}</button>`,
    )
    .join(
      '',
    )}</div></div><p class="mortal-sect-note">${spiritRootInfo(save.spiritRoot).name}入门礼：${entryCost(save)} 灵石。${dues.stones ? `当前境界新账期每 ${dues.years} 年缴 ${dues.stones} 灵石。` : '真仙免供奉。'}不论在哪一门，入门礼与供奉标准相同。城镇游历及人间办事消耗的年岁计入账期；浏览宗门页签、秘境、闭关不计入。${unfinishedPath ? '尚有未结束的历练：只能拜入相同路线的宗门；兼修旧局需先结束历练再入宗，避免更改原战况。' : ''}</p><div class="sect-grid">${SECTS.filter(
    (s) => filter === 'all' || s.school === filter,
  )
    .map((s) => {
      const manual = passive(s.id);
      return `<article class="sect-card ${s.school} ${member?.id === s.id ? 'joined' : ''}">${sectArt(s)}<div class="sect-copy"><span class="sect-school">${s.school === 'orthodox' ? '正道' : '魔道'}仙门${member?.id === s.id ? ` · 本门${sectRole(save)}` : ''}</span><h3>${s.name}</h3><p class="sect-motto">${s.motto}</p><div class="sect-manual">${icon(manual.id, manual.color)}<strong>${manual.name}<small>本门专修功法</small></strong></div><p>${manual.desc}</p><small class="sect-mastery">精研 ${world.mastery[s.id] || 0} / ${MAX_MASTERY} 阶${world.mastery[s.id] ? ` · ${member?.id === s.id ? `当前生效 ${Math.min(world.mastery[s.id], plan.limit)} 阶` : '成果保留，待入本门'}` : ''}</small><button class="secondary-button" data-action="mortal-join" data-id="${s.id}" data-cost-stones="${entryCost(save)}" ${member || (unfinishedPath && unfinishedPath !== s.school) ? 'disabled' : ''}>${member?.id === s.id ? '已拜入本门' : member ? '需先退出当前宗门' : unfinishedPath && unfinishedPath !== s.school ? '需先结束不同路线的历练' : `拜入山门 · ${entryCost(save)} 灵石`}</button></div></article>`;
    })
    .join('')}</div></section>
    <section class="mortal-rules"><h2>入世须知</h2><p>炼气至合体每隔寿元上限的 1/5 缴纳一次，借寿也计入下一账期；大乘每 5000 年一次，真仙免供奉。每次供奉最多 ${MAX_SECT_DUES} 灵石，旧档尚未缴纳的超额账单同步封顶。入门礼不抵供奉。突破或借寿后，当前账期按原约定结清，下一账期更新；进入真仙立即免除供奉。余额不足时暂停等待补缴，补缴后保留宗门身份与精研；明确放弃补缴才会被清退。</p><div class="dues-grid">${SECT_DUES.map((d, i) => `<span>${REALMS[i]} · ${SECT_ROLES[i]}<b>${d.stones ? `${d.years} 年 / ${d.stones} 灵石` : '免供奉'}</b></span>`).join('')}</div><small>职务随境界自动晋升，重新入宗按当前境界授职；未突破真仙时不会提前成为开宗老祖。表中为未借寿的标准间隔。未完成的委托和研习可离开后继续，不会自动重复；退宗与轮回会影响宗门成果，轮回清空本世全部精研。</small></section>`;
}

export function townEventContent(save: SaveData, npc: TownResident) {
  let actions = '';
  if (npc.id === 'market') {
    actions = `<p>每枚玄铁：买入 30 灵石 · 卖出 12 灵石</p><p class="panel-note">当前持有 ${save.stones} 灵石、${save.iron} 玄铁。</p><div class="save-actions"><button class="secondary-button" data-action="mortal-buy" data-cost-stones="30">购入 1 枚玄铁</button><button class="secondary-button" data-action="mortal-sell" ${save.iron < 1 ? 'disabled' : ''}>售出 1 枚玄铁</button></div>`;
  } else if (npc.id === 'herbs' || npc.id === 'tea' || npc.id === 'escort') {
    const job = TOWN_JOBS[npc.id];
    actions = `<p>${job.desc}</p><p class="panel-note">消耗 ${job.years} 年 · ${job.stones ? `${job.stones} 灵石${job.iron ? ` + ${job.iron} 玄铁` : ''}` : '30% 概率获赠 8 灵石'}<br>点击即增加年岁并结算收益，完成后不自动重复。</p><button class="primary-button" data-action="mortal-activity" data-id="${npc.id}" ${save.mortal.activity ? 'disabled' : ''}>${save.mortal.activity ? '有事项待结算' : npc.id === 'tea' ? '入座听书' : '接下这件事'}</button>`;
  }
  if (npc.id === 'herbs')
    actions +=
      '<div class="save-actions"><button class="secondary-button" data-action="medicine-shop">药铺 · 看看本批丹药</button></div>';
  return `<p class="panel-note">凡人 · ${npc.role}${npc.generation > 0 ? ' · 旧人已远，烟火相传。如今在这里的是一张新的面孔。' : ''}</p>${npc.id === 'smith' ? smithStoryContent(save) : ''}${HUMAN_STORY_IDS.filter(
    (id) => HUMAN_STORIES[id].npcId === npc.id,
  )
    .map((id) => humanStoryContent(save, id, true))
    .join(
      '',
    )}<section class="npc-dialogue" aria-label="与${npc.name}闲谈"><div class="npc-chat-log" role="log" aria-live="polite"><p>${npcDefaultLine(npc.id)}</p></div><small class="npc-chat-status" role="status">街巷闲谈 · 随口聊聊</small><form class="npc-chat-form"><input type="text" maxlength="${NPC_AI_SETTINGS.maxMessageLength}" aria-label="想对镇民说的话" placeholder="问问近况，聊聊山外的事…" autocomplete="off"/><button type="submit" class="secondary-button">交谈</button></form><small class="panel-note">闲谈不改变修为与物资，办事请用故事或委托按钮。</small></section>${actions}`;
}

export function humanStoryContent(save: SaveData, id: HumanStoryId, atNpc = false) {
  const view = humanStoryView(save, id);
  if (!view) return '';
  const story = save.mortal.humanStories?.[id];
  const actions = view.actions.filter((action) => atNpc && action.id !== 'read');
  return `<section class="town-story immortal-encounter" aria-label="${view.title}"><span class="eyebrow">人间旧事 · ${view.phase}</span><h3>${atNpc ? `${view.title} · ` : ''}${escape(view.name)}</h3>${story ? `<small>${story.metAt.toFixed(1)} 岁相识${story.chosenAt !== null && story.choice === 'bond' ? ` · ${story.chosenAt.toFixed(1)} 岁结为道侣` : ''}</small>` : ''}<p>${escape(view.text)}</p>${view.letter.length ? `<blockquote class="human-letter">${view.letter.map((p) => `<p>${escape(p)}</p>`).join('')}<footer>—— ${escape(view.name)}</footer></blockquote>` : `<blockquote>${escape(view.quote)}</blockquote>`}${view.keepsake ? `<p class="human-keepsake">旧物 · ${view.keepsake}<small>此世纪念，可在人间缘簿重读；随存档保留，轮回重启。</small></p>` : ''}${actions.length ? `<div class="story-choices">${actions.map((action) => `<button class="secondary-button" data-action="human-story" data-id="${id}:${action.id}">${action.label}</button>`).join('')}</div>` : ''}${story && !view.letter.length ? '<small>故人的年岁随历练、闭关与人间生活一同流逝，交谈不额外耗时。旧事与信物会留在缘簿中。</small>' : ''}</section>`;
}
export function humanStoryJournal(save: SaveData, heading = true) {
  const known = HUMAN_STORY_IDS.filter((id) => save.mortal.humanStories?.[id]);
  const home = save.mortal.hometown;
  const familyLetter = home?.letterFoundAt != null;
  if (!known.length && !familyLetter) return '';
  return `<section class="mortal-journal human-journal">${heading ? '<span class="eyebrow">相逢有时 · 岁月留书</span><h2>人间缘簿</h2>' : ''}<div class="human-memories">${familyLetter ? `<article><small>青岚故居${home.letterRead ? '' : ' · 有一封未读家书'}</small><h3>故居家书</h3><p>${home.letterFoundAt!.toFixed(1)} 岁归乡时寻得</p><p>${escape(hometownLetter(home).lines[0])}</p><button class="secondary-button" data-action="hometown-letter">展读家书 →</button></article>` : ''}${known
    .map((id) => {
      const story = save.mortal.humanStories![id]!;
      const view = humanStoryView(save, id)!;
      return `<article><small>${view.phase}${view.keepsake && !story.read ? ' · 有一封未读旧信' : ''}</small><h3>${escape(view.name)}</h3><p>${view.title} · ${story.metAt.toFixed(1)} 岁相识</p><p>${view.keepsake ? `留下「${view.keepsake}」` : story.choice === 'bond' ? '此世道侣 · 人间有一处归灯' : '故人尚在人间，别后亦可再访'}</p><button class="secondary-button" data-action="human-memory" data-id="${id}">${view.keepsake ? '展读旧信' : '重读相逢'} →</button></article>`;
    })
    .join('')}</div></section>`;
}

export function hometownContent(save: SaveData, parent?: ParentId) {
  const home = save.mortal.hometown!;
  const parents = hometownParents(home, save.age);
  const alive = parents.filter((p) => p.alive);
  if (parent) {
    const person = alive.find((p) => p.id === parent);
    if (!person) return '';
    const years = Math.floor(save.age - (home.lastVisitAge ?? 15));
    const other = parents.find((p) => p.id !== parent)!;
    const quote = !other.alive
      ? `${parent === 'mother' ? '他' : '她'}走得安稳，叫你不必挂念。山外路远，照顾好自己。`
      : person.old && realmInfo(save.cultivation).index >= 3
        ? '你倒还是走时的模样。'
        : parent === 'mother'
          ? '山里夜凉，记得添衣。'
          : '山外怎么样？回来就好。';
    return `<div class="town-story"><p>${person.old ? '鬓边已见白发，熟悉的声音却没有变。' : '门前仍是熟悉的身影。'}</p><blockquote><p>你回来了。</p>${years >= 1 ? `<p>一别 ${years} 年了。</p>` : ''}<p>${quote}</p></blockquote></div><button class="secondary-button" data-action="hometown-home">回到门前</button>`;
  }
  const longGone =
    save.age >=
    Math.max(...Object.values(home.parents).map((p) => 15 + p.diesAt - p.ageAtStart)) + 200;
  const text = alive.length
    ? '门前灯火如旧。你可以停下来，说几句家常。'
    : realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).max
      ? '许多年前，你从这里出发。那年你十五岁。'
      : longGone
        ? '此处早已另住他人。屋瓦几经翻修，门前的路仍在原处。'
        : '门扉紧闭，院中草木已深。你离乡时，母亲说“有空便回来”。';
  return `<div class="town-story"><p>${text}</p>${!alive.length ? '<p>当年的叮嘱，留在一封家书里。</p>' : ''}</div><div class="save-actions">${alive.map((p) => `<button class="secondary-button" data-action="hometown-parent" data-id="${p.id}">与${p.name}交谈</button>`).join('')}${!alive.length ? '<button class="secondary-button" data-action="hometown-letter">展读家书</button>' : ''}<button class="primary-button" data-action="close">继续走走</button></div>`;
}

export function hometownLetterContent(save: SaveData) {
  const letter = hometownLetter(save.mortal.hometown!);
  return `<div class="town-story"><blockquote class="human-letter">${letter.lines.map((line) => `<p>${escape(line)}</p>`).join('')}<footer>${letter.name}</footer></blockquote><p class="panel-note">家书已珍藏于人间缘簿，此后仍可重读。</p></div>`;
}

function smithStoryContent(save: SaveData) {
  const story = save.mortal.smithStory;
  const view = smithStoryView(save.mortal.population!, save.age, story);
  const labels: Record<string, string> = {
    iron: '添两枚玄铁 · 修补钟沿',
    bellows: '留下帮忙 · 拉风箱叙家常',
    harbor: '留在渡口 · 报归船平安',
    school: '送去学堂 · 伴孩子读书',
    remember: `收下旧铃 · 玄铁 +${story?.help === 'iron' ? 6 : 4}`,
  };
  return `<section class="town-story" aria-label="炉火未凉"><span class="eyebrow">青岚旧事 · ${view.chapter} / 3</span><h3>${view.title}</h3><p>${escape(view.text)}</p><blockquote>${escape(view.quote)}</blockquote><div class="story-choices">${view.actions.map((choice) => `<button class="secondary-button" data-action="smith-story" data-id="${choice}" ${choice === 'iron' && save.iron < 2 ? 'disabled' : ''}>${labels[choice]}</button>`).join('')}</div><small>${view.actions.includes('iron') ? `现有 ${save.iron} 枚玄铁；也可免费留下帮忙，两种选择都会被记住。` : story?.completed ? '纪念物 · 炉火旧铃。没有战力加成，这段往事可在人间入口重读。' : view.actions.length ? '选择会写入此世存档，闲谈不会代替你作决定。' : '故人会随年岁老去。历练或闭关后再访，故事随传人更替继续；错过的岁月也有旧信可寻。'}</small></section>`;
}

function smithStoryJournal(save: SaveData) {
  const story = save.mortal.smithStory;
  if (!story || !save.mortal.population) return '';
  const first = smithAt(save.mortal.population, story.metAt);
  const view = smithStoryView(save.mortal.population, save.age, story);
  return `<section class="mortal-journal town-story"><span class="eyebrow">此世旧事 · ${story.completed ? '三代烟火' : `${view.chapter} / 3`}</span><h2>炉火未凉${story.completed ? ' · 炉火旧铃' : ''}</h2><p>${story.metAt.toFixed(1)} 岁，你结识了铁匠${first.name}，${story.help === 'iron' ? '留下两枚玄铁' : '陪他拉风箱、叙家常'}，一起修好渡船旧钟。</p>${story.legacy ? `<p>故人的信托你安置旧钟，你让它${story.legacy === 'school' ? '在学堂伴孩子读书' : '在渡口报归船平安'}。</p>` : ''}<p>${escape(view.text)}</p><small>${story.completed ? '旧铃已收藏于此。此世的纪念会随存档导出，轮回后重新开始。' : view.actions.length ? '铁匠铺有新的往事，入城后可拜访当代传人。' : '一别山川，归来再访。故事随年岁和铁匠换代推进。'}</small></section>`;
}
