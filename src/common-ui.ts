// 首页、洞府与战斗共用的纯展示小片段：只按参数渲染 HTML，不读写全局游戏状态。
import {
  ELEMENTS,
  REALMS,
  REALM_VERSES,
  TREASURES,
  STAGES,
  STAGE_YEARS_PER_MINUTE,
  FINAL_TRIAL_STAGE,
  spiritRootInfo,
  elementInfo,
  weaponRootBonus,
  pathInfo,
  treasure,
  passive,
  evolutionPassives,
  weaponLevelDamage,
  EVOLVED_DAMAGE,
  EVOLVED_COOLDOWN,
  AWAKENING_BURST,
  MAX_WEAPON_LEVEL,
  type Treasure,
  type CultivationPath,
  type SpiritRootId,
  type ElementId,
} from './data.ts';
import { lifespanInfo, retreatPlan, type SaveData, type realmInfo } from './progress.ts';
import type { Game, Choice } from './game.ts';
import { icon, smallIcon } from './icons.ts';
import { spriteStyle } from './sprites.ts';
import { masteryDescription } from './mortal-ui.ts';
import { formatNumber } from './number-format.ts';

export function telemetryRow(enabled: boolean, active: boolean) {
  const status = !enabled ? '已关闭' : active ? '已开启' : '已开启 · 本网址不发送';
  return `<p class="about-telemetry"><span>匿名统计</span>${status}<button class="about-toggle" data-action="telemetry-toggle" aria-pressed="${enabled}">${enabled ? '关闭' : '开启'}</button></p><small class="about-telemetry-note">为了解玩家常在哪一步卡住，官网与平台站会在开局、结算、入城、轮回和叩门时记录关卡、境界、年岁、时长与胜负，附一个随机匿名编号；不上传存档、闲聊或任何个人信息，数据保留三个月。</small>`;
}
export function currency(save: SaveData) {
  return `<span class="currency">${smallIcon('gem')}<b>${save.stones}</b><span>灵石</span></span><span class="currency iron"><i>◆</i><b>${save.iron}</b><span>玄铁</span></span>`;
}
export function autoplayButton(autoplay: boolean, inGame = false) {
  const title = autoplay
    ? '自动走位、拾取与选择升级；点击或移动键切回手动'
    : inGame
      ? '按 E 或点击开启自动走位、拾取与选择升级'
      : '点击开启自动走位、拾取与选择升级';
  return `<button class="round-button auto-button ${autoplay ? 'active' : ''}" data-action="autoplay" aria-pressed="${autoplay}" title="${title}">自动历练 · ${autoplay ? '开' : '关'}</button>`;
}
export function fullscreenButton(available: boolean, active: boolean) {
  return available
    ? `<button class="round-button fullscreen-button" data-action="fullscreen" aria-label="${active ? '退出全屏' : '进入全屏'}" aria-pressed="${active}">${active ? '还原' : '全屏'}</button>`
    : '';
}
export function controls(
  save: SaveData,
  volumeOpen: boolean,
  display: { available: boolean; active: boolean },
  inGame = false,
) {
  return `${autoplayButton(save.autoplay, inGame)}<span class="sound-control"><button class="round-button" data-action="sound" aria-label="${save.sound ? '调节音量' : '开启音乐与音效'}" title="${save.sound ? '调节音乐与音效音量' : '开启音乐与音效'}">${smallIcon(save.sound ? 'sound' : 'mute')}</button>${save.sound && volumeOpen ? `<div class="volume-control"><label>音乐与音效 <output>${Math.round(save.volume * 100)}%</output><input type="range" min="0" max="100" value="${Math.round(save.volume * 100)}" data-volume aria-label="音乐与音效音量" /></label><button data-action="mute">静音</button></div>` : ''}</span><button class="round-button help-button" data-action="guide" aria-label="修行指南" title="修行指南 · 玩法与道具">?</button>${inGame ? `<button class="round-button damage-button" data-action="damage" aria-label="伤害统计" title="查看本局法宝伤害占比">伤害</button>${fullscreenButton(display.available, display.active)}<button class="round-button" data-action="pause" aria-label="暂停游戏" title="暂停 · Esc">${smallIcon('pause')}</button>` : ''}`;
}
export function realmVerse(realm: ReturnType<typeof realmInfo>) {
  return REALM_VERSES[realm.ascending ? '渡劫' : REALMS[realm.index]];
}
export function completedJourney(
  save: SaveData,
  realmName: string,
  immortal: boolean,
  verse: string,
) {
  return `<section class="hero journey-hero" aria-label="仙途通关"><div class="hero-copy"><div class="eyebrow"><span></span>七境已破 · 山河可期</div><h1>七境皆过客<span>天地一逍遥</span></h1><p>曾执一剑入青岚，今携万法越重山。<br>七境已破，天劫已散。往后山河，任你来去。</p><div class="journey-badges"><span>七境通关</span><span>天劫止息</span><span>修行永存</span></div><div class="journey-actions">${immortal ? `<button class="primary-button" data-action="immortal-gate">叩入仙门 ${smallIcon('arrow')}</button>` : ''}<button class="${immortal ? 'secondary-button' : 'primary-button'}" data-action="revisit">重游七境 ${smallIcon('arrow')}</button><button class="secondary-button" data-action="arsenal">查看珍藏</button></div></div><button class="journey-portrait" data-action="cultivation" aria-label="当前${realmName}，进入洞府修炼"><span class="journey-orbit" aria-hidden="true"></span><span class="journey-poem">${verse}</span><span class="journey-character" style="${spriteStyle(0)}" aria-hidden="true"></span><span class="journey-realm"><small>此世道果</small><strong>${realmName}</strong><span>进入洞府 ${smallIcon('arrow')}</span></span></button></section><section class="journey-records" aria-label="此世修行成果"><div><span>累积修为</span><strong title="${save.cultivation.toLocaleString('zh-CN', { useGrouping: false })}">${Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1, useGrouping: false }).format(save.cultivation)}</strong><small>一念一境，皆成过往</small></div><div><span>此世年岁</span><strong>${Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1, useGrouping: false }).format(save.age)}<em>年</em></strong><small>岁月悠长，道心未改</small></div><div><span>法宝珍藏</span><strong>${save.artifacts.length}<em>/ ${TREASURES.length}</em></strong><small>万般法器，随心而御</small></div><div><span>历劫留印</span><strong>${save.tribulations}<em>枚</em></strong><small>气血 +${save.tribulations * 3}% · 伤害 +${save.tribulations * 2}%</small></div></section>`;
}
export const ROOT_IMPRESSIONS: Record<SpiritRootId, { seal: string; verse: string }> = {
  heaven: { seal: '天', verse: '一气天成，百脉皆通。长生路上，似有清风送君行。' },
  variant: { seal: '异', verse: '灵机独异，不循常途。天地万法，或为你另开一门。' },
  dual: { seal: '凡', verse: '两脉相依，资质平常。肯踏千山，凡根亦可问长生。' },
  triple: { seal: '凡', verse: '三脉交织，仙路渐远。不借天资，便以岁月磨道心。' },
  quad: { seal: '伪', verse: '四脉纷杂，聚气维艰。命数未许，仍可执灯向山行。' },
  five: { seal: '伪', verse: '五行俱在，却难归一。大道无言，且看你如何叩门。' },
  none: { seal: '废', verse: '五行沉寂，仙缘如尘。若道心不灭，凡骨也敢问苍天。' },
};
export function spiritRootDiagram(save: SaveData, reveal = false) {
  const root = spiritRootInfo(save.spiritRoot);
  const vertices = ELEMENTS.map((element, i) => {
    const angle = ((i * 72 - 90) * Math.PI) / 180;
    return {
      ...element,
      x: (50 + Math.cos(angle) * 40).toFixed(2),
      y: (50 + Math.sin(angle) * 40).toFixed(2),
      active: save.rootElements.includes(element.id),
    };
  });
  const rootLabel = `${root.name}；${vertices.map((e) => `${e.name}灵根${e.active ? '已显现' : '未显现'}`).join('，')}`;
  return `<div class="root-pentagon" role="img" aria-label="${rootLabel}"><svg class="root-pentagon-lines" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="40"/><polygon points="${vertices.map((e) => `${e.x},${e.y}`).join(' ')}"/>${vertices.map((e) => `<path d="M50 50L${e.x} ${e.y}"/>`).join('')}</svg><div class="root-quality"><small>此世灵根</small><strong>${reveal ? ROOT_IMPRESSIONS[save.spiritRoot].seal : root.name}</strong><small>${reveal ? `${root.name} · ` : ''}${root.count ? `${root.count} 系共鸣` : '五行未显'}</small></div>${vertices.map((e) => `<span class="root-node${e.active ? ' is-active' : ''}" style="--root-x:${e.x}%;--root-y:${e.y}%;--element-color:${e.color}"><i class="root-orb"></i><span>${e.name}</span></span>`).join('')}</div>`;
}
export function spiritRootEffects(save: SaveData) {
  const root = spiritRootInfo(save.spiritRoot);
  return `灵气获取 · 修为积累 <b>${Math.round(root.rate * 100)}%</b><br>${root.count ? `对应属性法宝伤害 <b>+${root.damageBonus}%</b>` : '法宝伤害加成 <b>0%</b>'}<br>基础气血 <b>${root.baseHp}</b> · 基础回血 <b>${root.baseRegen.toFixed(2)}/秒</b><br>基础暴击 <b>${Math.round(root.baseCrit * 100)}%</b> · 基础移速 <b>${root.baseSpeed}</b><br>悟道每阶独立增伤 <b>+${root.powerPerLevel}%</b>`;
}
export function spiritRootSummary(save: SaveData, showAge = false) {
  const life = lifespanInfo(save);
  const root = spiritRootInfo(save.spiritRoot);
  return `<section class="root-profile" aria-label="此世灵根"><div class="root-profile-heading"><strong>${root.name}<small>${save.rootElements.map((id) => elementInfo(id).name).join(' · ') || '五行未显'} · 修为积累 ${Math.round(root.rate * 100)}%</small></strong>${showAge ? `<span>年岁 ${life.age.toFixed(1)} / ${Number.isFinite(life.limit) ? `${life.limit} 年寿元` : '无限寿元'}</span>` : ''}</div><div class="root-profile-actions"><button class="secondary-button" data-action="root-guide">资质说明 ${smallIcon('arrow')}</button><button class="secondary-button" data-action="watch-root-ad">看广告 · 自选灵根</button></div><details class="disclosure" data-disclosure="root"><summary>五行命盘与详细属性</summary><div class="spirit-root-summary"><div class="root-identity">${spiritRootDiagram(save)}</div><p>${spiritRootEffects(save)}<small>刷新保留 · 轮回重抽资质与五行</small></p><button class="secondary-button" data-action="reincarnate">轮回转世 · 重启仙途</button></div></details></section>`;
}
export function lifespanSummary(save: SaveData, selectedStage: number) {
  const life = lifespanInfo(save);
  return `<div class="lifespan-summary"><strong>年岁 ${life.age.toFixed(1)} / ${Number.isFinite(life.limit) ? `${life.limit} 年寿元` : '无限寿元'}</strong><span>${STAGES[selectedStage].name} · 战斗每分钟 ${STAGE_YEARS_PER_MINUTE[selectedStage]} 年</span><small>年龄跨局累计，突破大境界延寿；大乘起长生。暂停不计龄，寿尽迎来此世终章，轮回将清空本世进度。${save.lifespanBonus ? `已借寿 ${save.lifespanBonus} 年。` : ''}</small>${save.completed.includes(FINAL_TRIAL_STAGE) ? `<small>七境已通关 · 不再降临天劫 · 已获劫印保留：气血 +${save.tribulations * 3}% / 伤害 +${save.tribulations * 2}%</small>` : save.nextTribulationAge ? `<small>天劫每两万年一次 · 距下次 ${Math.max(0, save.nextTribulationAge - save.age).toFixed(1)} 年 · 已渡 ${save.tribulations} 劫 · 劫印气血 +${save.tribulations * 3}% / 伤害 +${save.tribulations * 2}%</small>` : ''}</div>`;
}
export function retreatEstimate(save: SaveData, years: number) {
  const plan = retreatPlan(save, years);
  if (!plan) return '请输入正数年限（最多一位小数），并留有剩余寿元。';
  return `实际度过 ${Number(plan.years.toFixed(1))} 年 · ${Number.isFinite(lifespanInfo(save).limit) ? `预计修为 +${plan.cultivation.min}～${plan.cultivation.max}（本大境界总修为的 ${Number(plan.cultivation.minPercent.toFixed(2))}%～${Number(plan.cultivation.maxPercent.toFixed(2))}%，不足 1 点舍去）· 另有 ${Number((plan.chance * 100).toFixed(2))}% 概率获得属性提升` : save.completed.includes(FINAL_TRIAL_STAGE) ? '无修为或属性收益 · 通关后不再受天劫截停' : '大乘起无修为或属性收益，到天劫自动出关'}`;
}
export function retreatSection(save: SaveData) {
  const life = lifespanInfo(save);
  const immortal = !Number.isFinite(life.limit);
  const years = immortal
    ? 1000
    : Math.max(0.1, Math.floor(Math.min(life.limit * 0.1, life.remaining / 2) * 10) / 10);
  return `<div class="section-heading"><h3>闭关修炼</h3><span>只耗年岁 · 不花灵石</span></div><p class="panel-note">${immortal ? (save.completed.includes(FINAL_TRIAL_STAGE) ? '七境已破，天劫不再降临。闭关只推进年岁，不获得修为或属性；可按填写年数出关。' : '大乘起闭关不再获得修为或属性，只推进年岁；到达天劫时立即出关迎劫。') : '闭关获得少量随机修为：按投入年数占寿元上限的比例计算，灵根越好收益越高，明显慢于历练。长时间闭关有机会推进小阶段；一世寿元全部闭关仍不足以跨越一个完整大境界。另按相同比例抽取属性提升，例如寿元 100 年闭关 50 年，有 50% 概率随机提升气血、法宝伤害或移速中的一项 1%～3%。不增加根基阶数。'}</p><div class="retreat-form"><label for="retreat-years">闭关年数<input id="retreat-years" type="number" inputmode="decimal" min="0.1" step="0.1" value="${years}" required aria-describedby="retreat-estimate"></label><button class="secondary-button" data-action="retreat" ${retreatPlan(save, years) ? '' : 'disabled'}>开始闭关</button></div><p class="panel-note" id="retreat-estimate" role="status">${retreatEstimate(save, years)}</p><p class="panel-note">闭关累计：气血 +${save.retreatBonus.vitality}% · 法宝伤害 +${save.retreatBonus.power}% · 移速 +${save.retreatBonus.speed}%。轮回后清空。</p>`;
}
export function weaponAffinity(
  item: Treasure,
  root: SpiritRootId,
  elements: ElementId[],
  compact = false,
) {
  const element = elementInfo(item.element);
  const bonus = Math.round(weaponRootBonus(root, elements, item) * 100);
  return `<span class="element-affinity ${bonus ? 'resonant' : ''}" style="--element-color:${element.color}">${element.name}系${bonus ? ` · ${compact ? '' : '灵根加伤 '}+${bonus}%` : compact ? '' : ' · 无灵根加成'}</span>`;
}
export function evolutionRecipe(
  t: Treasure,
  path: CultivationPath,
  requirements = evolutionPassives(t, path),
) {
  const partners = requirements.map((id) => `${passive(id).name}五重`);
  return `<div class="evolution-recipe"><span>仙器 · ${t.evolution}</span><div>${t.name}六重 ＋ ${partners.length > 1 ? `（${partners.join(' 或 ')}）` : partners[0]}</div></div>`;
}
export function choiceCard(game: Game | null, save: SaveData, c: Choice, i: number) {
  const item =
    c.type === 'passive'
      ? passive(c.id)
      : c.type === 'heal'
        ? {
            name: '回春灵露',
            color: '#b6d8a5',
            desc: `恢复 ${game?.isFinalTrial ? 15 : 40}% 最大气血，并获得 1 枚玄铁。`,
            id: 'duration',
          }
        : treasure(c.id);
  const tag =
    c.type === 'evolve'
      ? '仙器觉醒'
      : c.type === 'passive'
        ? `${pathInfo(passive(c.id).school).name}功法`
        : c.type === 'heal'
          ? '修行馈赠'
          : c.level === 1
            ? `${pathInfo(treasure(c.id).school).name}法宝`
            : '法宝升阶';
  const multiplier = (level: number) => `×${weaponLevelDamage(level).toFixed(2)}`;
  const description =
    c.type === 'evolve'
      ? `法术形态强化；觉醒瞬间释放「觉醒一击」，身边妖物受 ${AWAKENING_BURST.hits} 倍单次伤害，妖王至多损失 ${Math.round(AWAKENING_BURST.bossShare * 100)}% 气血。`
      : item.desc;
  const compactDescription =
    c.type === 'evolve'
      ? `形态强化；觉醒一击 ×${AWAKENING_BURST.hits}，妖王至多损失 ${Math.round(AWAKENING_BURST.bossShare * 100)}% 气血。`
      : description;
  const mastery = c.type === 'passive' ? masteryDescription(save, c.id) : '';
  const benefit =
    c.type === 'evolve'
      ? `伤害 ${multiplier(MAX_WEAPON_LEVEL)} → ×${(weaponLevelDamage(MAX_WEAPON_LEVEL) * EVOLVED_DAMAGE).toFixed(2)} · 施法间隔 −${Math.round((1 - EVOLVED_COOLDOWN) * 100)}%`
      : c.type === 'weapon'
        ? c.level === 1
          ? '配方齐备后，升级可选仙器觉醒'
          : `伤害 ${multiplier(c.level - 1)} → ${multiplier(c.level)}`
        : c.type === 'passive'
          ? mastery || '功效按重数叠加'
          : '恢复状态，继续修行';
  const specificBenefit = c.type === 'evolve' || (c.type === 'weapon' && c.level > 1) || mastery;
  const weapon = c.type === 'weapon' || c.type === 'evolve' ? treasure(c.id) : null;
  const partners = weapon
    ? game!.evolutionRequirements(weapon.id).map((id) => passive(id).name)
    : [];
  const compactRecipe =
    c.type === 'evolve'
      ? `配套五重功法：${partners.join(' 或 ')}`
      : c.type === 'weapon'
        ? `觉醒需本法宝六重 ＋ ${partners.map((name) => `${name}五重`).join(' 或 ')}`
        : '';
  return `<button class="choice-card ${c.type === 'evolve' ? 'evolution-choice' : ''}" data-action="choose" data-id="${i}" style="--item-color:${item.color}"><div class="choice-top"><span>${tag}</span><kbd>${i + 1}</kbd></div><div class="choice-art">${icon(item.id, item.color)}</div><h3>${c.type === 'evolve' ? treasure(c.id).evolution : item.name}</h3><div class="choice-level">${c.type === 'evolve' ? '六重 → 仙器' : c.type === 'heal' ? '固本培元' : c.level === 1 ? '领悟 · 一重' : `${c.level - 1} 重 → ${c.level} 重`}</div><p><span class="choice-description-full">${description}</span><span class="choice-description-compact">${compactDescription}</span></p><div class="choice-meta">${weapon ? weaponAffinity(weapon, game!.spiritRoot, game!.rootElements, true) : ''}<div class="choice-benefit ${specificBenefit ? '' : 'choice-benefit-hint'}">${benefit}</div></div>${weapon ? evolutionRecipe(weapon, game!.path, game!.evolutionRequirements(weapon.id)) : ''}${compactRecipe ? `<div class="choice-recipe-compact">${compactRecipe}</div>` : ''}<span class="choice-select">领悟此法 ${smallIcon('arrow')}</span></button>`;
}
export function damageReport(game: Game | null) {
  if (!game) return '';
  const total = game.damageDealt;
  const rows = game.weapons.map((w) => {
    const item = treasure(w.id);
    return {
      id: w.id as string,
      name: w.evolved ? item.evolution : item.name,
      color: item.color,
      damage: game!.damageBySource[w.id] || 0,
    };
  });
  if (game.damageBySource.bone)
    rows.push({
      id: 'bone',
      name: '白骨魔甲 · 反伤',
      color: passive('bone').color,
      damage: game.damageBySource.bone,
    });
  const other = Math.max(0, total - rows.reduce((sum, row) => sum + row.damage, 0));
  if (other > 0.01)
    rows.push({ id: '', name: '其他 / 旧记录未分类', color: '#a7bbae', damage: other });
  rows.sort((a, b) => b.damage - a.damage);
  return `<section class="damage-report" aria-label="本局伤害统计"><div class="damage-heading"><h3>法宝伤害占比</h3><span>总伤害 ${formatNumber(Math.round(total))}</span></div>${rows
    .map((row) => {
      const percent = total > 0 ? (row.damage / total) * 100 : 0;
      return `<div class="damage-row" style="--damage-color:${row.color}">${row.id ? icon(row.id, row.color) : '<span class="damage-other">✧</span>'}<div class="damage-detail"><div class="damage-label"><strong>${row.name}</strong><span>${formatNumber(Math.round(row.damage))} <b>${percent.toFixed(1)}%</b></span></div><div class="damage-bar"><i style="width:${percent}%"></i></div></div></div>`;
    })
    .join(
      '',
    )}<p class="panel-note">按实际扣血统计，不含击杀时的溢出伤害；反伤单列。${other > 0.01 ? '旧版对局已造成的伤害无法追溯法宝归属。' : ''}</p></section>`;
}
export function updateStorySoundButton(button: HTMLButtonElement, sound: boolean) {
  const label = sound ? '关闭声音' : '开启声音';
  button.innerHTML = smallIcon(sound ? 'sound' : 'mute');
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-pressed', String(sound));
  button.title = label;
}
