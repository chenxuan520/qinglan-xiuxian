import { assetUrl } from './asset-url.ts';
import { passive, REALMS, spiritRootInfo, type CultivationPath } from './data.ts';
import { lifespanInfo, type SaveData } from './progress.ts';
import { SECTS, SECT_DUES, SECT_ROLES, TOWN_JOBS, MAX_MASTERY } from './mortal-data.ts';
import { entryCost, masteryBonus, sectDues, sectRole, studyPlan } from './mortal.ts';
import { icon } from './icons.ts';

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
  return `<span class="sect-art" aria-hidden="true" style="background-image:url('${assetUrl(`assets/sects-${sect.school}.png`)}');background-size:${(1536 / width) * 100}% 200%;background-position:${(x / (1536 - width)) * 100}% ${Math.floor(sect.art / 4) * 100}%"></span>`;
}
export function masteryDescription(save: SaveData, id: string) {
  const level = save.mortal.mastery[id] || 0;
  return level
    ? `宗门精研 ${level} 阶 · ${masteryBonus(save, id) ? `正向效果 +${level * 3}%（在籍生效）` : '未在本门，加成未生效'}`
    : '';
}
export function mortalEntrance(save: SaveData) {
  const member = SECTS.find((s) => s.id === save.mortal.member?.id);
  return `<section class="mortal-entrance"><div><small>山下有烟火，山上有仙门</small><h2>入世问道</h2><p>十六宗门 · 功法精研 · 凡人城镇</p><div class="mortal-identity"><span>当前身份</span><strong>${member ? `${member.name} · ${member.school === 'orthodox' ? '正道' : '魔道'}` : '散修'}</strong>${member ? `<b>${sectRole(save)}</b>` : ''}</div></div><button class="secondary-button" data-action="mortal-enter">游历人间 <span>前台 1 分钟 = 1 年 →</span></button></section>`;
}
export function mortalStatus(save: SaveData) {
  const world = save.mortal;
  const life = lifespanInfo(save);
  const member = world.member;
  const free = sectDues(save).stones === 0;
  const activity = world.activity;
  return `<div><small>此世年岁 / 寿元</small><strong>${life.age.toFixed(2)} <em>/ ${Number.isFinite(life.limit) ? life.limit : '长生'}</em></strong></div><div><small>累计游历人间</small><strong>${world.years.toFixed(2)} <em>年</em></strong></div><div><small>${member ? '下次宗门供奉' : '宗门身份'}</small><strong>${member ? (free ? '渡劫 · 免供奉' : `${Math.max(0, member.dueAt - world.years).toFixed(1)} 年后`) : '逍遥散修'}</strong><span>${member && !free ? `${member.dues} 灵石 · 到期自动缴纳` : member ? '在籍精研加成持续生效' : '可拜入任一正道或魔道宗门'}</span></div><div><small>正在进行</small><strong>${activity ? (activity.kind === 'study' ? '研习本门功法' : TOWN_JOBS[activity.kind].name) : '闲游人间'}</strong><span>${activity ? `剩余 ${activity.remaining.toFixed(2)} 年 · 离开暂停` : '可承接委托或入门研习'}</span></div>`;
}
export function mortalPage(save: SaveData, filter: string, unfinishedPath?: CultivationPath) {
  const world = save.mortal;
  const member = SECTS.find((s) => s.id === world.member?.id);
  const plan = studyPlan(save);
  const dues = sectDues(save);
  return `<header class="mortal-header"><button class="mortal-back secondary-button" data-action="home">← 返回仙途</button><a class="mortal-brand" href="#" data-action="mortal-enter">青岚 · 人间</a><div id="mortal-currency">灵石 ${save.stones.toLocaleString('zh-CN')} · 玄铁 ${save.iron}</div></header>
  <main class="mortal-main">
    <section class="mortal-hero"><div><div class="eyebrow"><span></span>仙凡之间 · 自有天地</div><h1>且向人间<span>借一程烟火</span></h1><p>寻一处仙门，修一卷真经。<br>也可入市听书，替凡人解几分忧。</p><p class="mortal-clock-note">只在本界面前台计时 · 现实 1 分钟 = 1 年<br>离开、切后台或关闭页面暂停，无离线扣费。</p></div><div class="mortal-hero-art">${sectArt(SECTS[4])}${sectArt(SECTS[0])}</div></section>
    <section id="mortal-status" class="mortal-status" aria-label="人间年岁与供奉">${mortalStatus(save)}</section>
    <section class="mortal-membership"><div><small>我的仙门 · ${sectRole(save)}</small><h2>${member?.name ?? '尚未拜入宗门'}</h2><p>${member ? `${passive(member.id).name} · 精研 ${plan.level} / ${MAX_MASTERY} 阶 · 正向效果 +${plan.level * 3}%` : '同时只能加入一个宗门；入宗锁定本门正魔路线，不能兼修。开局赠本门功法一重，退宗后可重新选择路线。'}</p><p>入宗后锁定本门路线，不能兼修；退宗才可换道或改投他门。精研每阶增强本门功法正向效果 3%，满阶 30%；离宗保留成果，加成暂停。新历练自动获本门功法一重，占 4 个功法槽之一；局内升至三重才能参与仙器觉醒。</p></div>${member ? `<div class="mortal-study"><button class="primary-button" data-action="mortal-activity" data-id="study" ${world.activity || plan.level >= MAX_MASTERY || save.stones < plan.stones ? 'disabled' : ''}>${plan.level >= MAX_MASTERY ? '本门精研圆满' : `精研下一阶 · ${plan.stones} 灵石`}</button><small>${spiritRootInfo(save.spiritRoot).name} · 耗时 ${plan.years} 年<br>先付研习费；未完成时退宗或被清退，研习作废，不退费。</small><button class="mortal-leave" data-action="mortal-leave">退出宗门</button></div>` : ''}</section>
    <section class="mortal-town"><div class="section-heading"><div><span class="section-number">凡尘</span><h2>青岚镇</h2></div><span class="muted">以劳换资粮，不增加修为</span></div><div class="town-grid">${Object.entries(
      TOWN_JOBS,
    )
      .map(
        ([id, job], i) =>
          `<article class="town-card"><span class="town-mark">${['药', '镖', '茶'][i]}</span><h3>${job.name}</h3><p>${job.desc}</p><small>${job.years} 年 · ${job.stones ? `${job.stones} 灵石${job.iron ? ` + ${job.iron} 玄铁` : ''}` : '30% 概率获赠 8 灵石'}</small><button class="secondary-button" data-action="mortal-activity" data-id="${id}" ${world.activity ? 'disabled' : ''}>${world.activity?.kind === id ? '进行中' : '前往'}</button></article>`,
      )
      .join(
        '',
      )}<article class="town-card"><span class="town-mark">市</span><h3>灵材坊市</h3><p>灵石换玄铁，亦可出售余材。</p><small>买入 30 灵石 / 枚 · 卖出 12 灵石 / 枚</small><div class="town-trades"><button class="secondary-button" data-action="mortal-buy" ${save.stones < 30 ? 'disabled' : ''}>购入 1 枚</button><button class="secondary-button" data-action="mortal-sell" ${save.iron < 1 ? 'disabled' : ''}>售出 1 枚</button></div></article></div></section>
    <section class="mortal-sects"><div class="section-heading"><div><span class="section-number">仙门</span><h2>十六宗门，各有其道</h2></div><div class="mortal-filters" role="group" aria-label="宗门流派">${[
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
      )}</div></div><p class="mortal-sect-note">${spiritRootInfo(save.spiritRoot).name}入门礼：${entryCost(save)} 灵石。${dues.stones ? `当前境界新账期每 ${dues.years} 年缴 ${dues.stones} 灵石。` : '渡劫免供奉。'}不论在哪一门，入门礼与供奉标准相同。门费只按人间时间累计，秘境、闭关不计入账期。${unfinishedPath ? '尚有未结束的历练：只能拜入相同路线的宗门；兼修旧局需先结束历练再入宗，避免更改原战况。' : ''}</p><div class="sect-grid">${SECTS.filter(
      (s) => filter === 'all' || s.school === filter,
    )
      .map((s) => {
        const manual = passive(s.id);
        return `<article class="sect-card ${s.school} ${member?.id === s.id ? 'joined' : ''}">${sectArt(s)}<div class="sect-copy"><span class="sect-school">${s.school === 'orthodox' ? '正道' : '魔道'}仙门${member?.id === s.id ? ` · 本门${sectRole(save)}` : ''}</span><h3>${s.name}</h3><p class="sect-motto">${s.motto}</p><div class="sect-manual">${icon(manual.id, manual.color)}<strong>${manual.name}<small>本门专修功法</small></strong></div><p>${manual.desc}</p><small class="sect-mastery">精研 ${world.mastery[s.id] || 0} / ${MAX_MASTERY} 阶${world.mastery[s.id] ? ` · ${member?.id === s.id ? '加成生效' : '成果保留，待入本门'}` : ''}</small><button class="secondary-button" data-action="mortal-join" data-id="${s.id}" ${member || (unfinishedPath && unfinishedPath !== s.school) || save.stones < entryCost(save) ? 'disabled' : ''}>${member?.id === s.id ? '已拜入本门' : member ? '需先退出当前宗门' : unfinishedPath && unfinishedPath !== s.school ? '需先结束不同路线的历练' : `拜入山门 · ${entryCost(save)} 灵石`}</button></div></article>`;
      })
      .join('')}</div></section>
    <section class="mortal-rules"><h2>入世须知</h2><p>炼气至合体每隔寿元上限的 1/5 缴纳一次，借寿也计入下一账期；大乘每 5000 年一次，渡劫免供奉。入门礼不抵供奉。突破或借寿后，当前账期按原约定结清，下一账期更新；进入渡劫立即免除供奉。余额不足会自动清退出宗门，不产生欠款。</p><div class="dues-grid">${SECT_DUES.map((d, i) => `<span>${REALMS[i]} · ${SECT_ROLES[i]}<b>${d.stones ? `${d.years} 年 / ${d.stones} 灵石` : '免供奉'}</b></span>`).join('')}</div><small>职务随境界自动晋升，重新入宗按当前境界授职；未突破渡劫时不会提前成为开宗老祖。表中为未借寿的标准间隔。未完成的委托和研习可离开后继续，不会自动重复；退宗与轮回会影响宗门成果，轮回清空本世全部精研。</small></section>
    <section class="mortal-journal"><h2>人间见闻</h2><ol>${world.events.length ? world.events.map((event) => `<li>${escape(event)}</li>`).join('') : '<li>初入人间，山河待访。</li>'}</ol></section>
    <footer class="mortal-footer">一程烟火，一卷仙缘。<button data-action="home">返回仙途 →</button></footer>
  </main>`;
}
