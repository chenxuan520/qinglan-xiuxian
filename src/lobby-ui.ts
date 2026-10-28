import { isExtremeLife, rewardDisabled } from './life-mode.ts';
import {
  CULTIVATION_PATHS,
  DIFFICULTIES,
  ELEMENTS,
  FINAL_TRIAL_STAGE,
  MAX_REVIVES,
  REALMS,
  ROOT_STARTERS,
  SPIRIT_ROOTS,
  STAGES,
  STAGE_YEARS_PER_MINUTE,
  TRIAL_BOSS_TIMES,
  adSupplies,
  formatTime,
  pathInfo,
  spiritRootInfo,
  treasure,
  type ElementId,
  type SpiritRootId,
} from './data.ts';
import { realmInfo, type SaveData } from './progress.ts';
import type { Game } from './game.ts';
import {
  autoplayButton,
  choiceCard,
  completedJourney,
  controls,
  currency,
  damageReport,
  realmVerse,
  spiritRootSummary,
  weaponAffinity,
} from './common-ui.ts';
import { homeTownEntrance } from './home-town.ts';
import { preparationAdviceContent } from './preparation-advice.ts';
import { humanRecollection } from './human-recollection.ts';
import { medicineEntrance } from './medicine-ui.ts';
import { activeMedicines } from './medicine-data.ts';
import { journeyMap } from './journey-map.ts';
import { chronicleEntrance } from './chronicle-ui.ts';
import { runLootContent } from './run-loot-ui.ts';
import { icon, smallIcon } from './icons.ts';
import { currentRealm } from './opening-ui.ts';
import type { PanelParts } from './panel-host.ts';

export function saveLockPanel(
  saveLock: 'unreadable' | 'newer' | 'stale',
  unreadableBackedUp: boolean,
): PanelParts {
  const copy = {
    stale: [
      '此页已停止保存',
      '存档已在其他窗口更新',
      '另一窗口已有更新的进度，请继续最新的一份修行。',
      '请关闭多余的窗口，或在此页载入最新进度继续。',
      '<button class="primary-button" data-action="save-lock-reload">载入最新进度</button>',
    ],
    newer: [
      '存档来自新版本',
      '请先更新游戏',
      '这份存档需要更新的游戏版本，请先更新游戏后继续。',
      '请刷新页面载入新版本；也可先下载一份存档留底。',
      '<button class="secondary-button" data-action="save-lock-download">下载存档留底</button><button class="primary-button" data-action="save-lock-reload">刷新页面</button>',
    ],
    unreadable: [
      '存档无法读取',
      unreadableBackedUp ? '原存档已备份' : '原存档尚未覆盖',
      unreadableBackedUp
        ? '暂时读不出这份存档，已为你保留备份。请先下载备份，再开始新的一世。'
        : '暂时读不出这份存档，也未能备份。开始新的一世会覆盖原存档，请先下载留底。',
      '建议先下载原存档，留作备份。',
      '<button class="secondary-button" data-action="save-lock-download">下载原存档</button><button class="primary-button" data-action="save-lock-continue">开始新的一世</button>',
    ],
  }[saveLock];
  return [
    copy[0],
    copy[1],
    `<div class="save-lock"><p class="pause-description">${copy[2]}</p><p class="panel-note">${copy[3]}</p><div class="save-actions">${copy[4]}</div></div>`,
  ];
}

export function lobbyView(
  save: SaveData,
  selectedStage: number,
  difficulty: number,
  volumeOpen: boolean,
  mobileDisplay: { available: boolean; active: boolean },
  pendingRun: Game | null,
  assetsReady: boolean,
  storageAvailable: boolean,
  narrow: boolean,
): string {
  const stage = STAGES[selectedStage],
    realm = currentRealm(save),
    completed = save.completed.includes(FINAL_TRIAL_STAGE),
    verse = realmVerse(realm),
    shortVerse = verse.replace(/[，。·\s]/g, '').length <= 8,
    verticalVerse = shortVerse ? verse : verse.replace('，', '，<br>').replace(' · ', '<br>');
  return `
    <header class="lobby-header">
      <a class="brand" href="#" data-action="home" aria-label="叩仙门：青岚纪首页"><span class="brand-emblem">${icon('sword')}</span><span class="brand-title">叩仙门<small>青岚纪</small></span><span class="seal">${completed ? '圆满' : '问道'}</span></a>
      <nav aria-label="修行菜单"><button class="nav-link active" data-action="home">${completed ? '七境巡游' : '秘境历练'}</button><button class="nav-link" data-action="cultivation">洞府修炼</button><button class="nav-link" data-action="arsenal">藏器阁</button><button class="nav-link" data-action="bestiary">妖物志</button><button class="nav-link" data-action="medicine">炼丹炉</button></nav>
      <div class="header-right">${currency(save)}${controls(save, volumeOpen, mobileDisplay)}</div>
    </header>
    <main class="lobby-main ${completed ? 'journey-lobby' : ''}">
      ${
        completed
          ? completedJourney(save, realm.name, realm.max, realmVerse(realm))
          : `<section class="hero">
        <div class="hero-copy"><div class="eyebrow"><span></span>青岚少年 · 觅长生 · 寻大道</div><h1>御剑问长生<span>青岚入仙途</span></h1><p>在青岚镇长大，十五岁踏上仙途。<br>为觅长生，为追寻大道，向山海深处去。</p>
          <div class="hero-features"><span>一世修行，叩问仙门</span>${isExtremeLife(save) ? '<span class="life-mode-badge">极限模式 · 一命问道</span>' : ''}</div>
        </div>
        <button class="realm-preview" data-action="cultivation"><span class="vertical-poem${shortVerse ? ' is-short' : ''}">${verticalVerse}</span><span class="realm-circle"><small>当前境界</small><strong>${save.cultivation === 0 ? '凡人' : realm.ascending ? '渡劫' : REALMS[realm.index]}</strong><span>${save.cultivation === 0 ? '尚未入道' : realm.ascending ? '待破七境' : ['初期', '中期', '后期'][realm.step % 3]}</span></span><span class="realm-link">洞府修炼 ${smallIcon('arrow')}</span></button>
      </section>`
      }
      ${spiritRootSummary(save, true)}
      ${pendingRun ? `<div class="resume-banner"><div><span class="status-dot"></span>尚有一段仙缘未了<small>${pendingRun.encounterName} · ${formatTime(pendingRun.time)} · ${pathInfo(pendingRun.path).name} · 局内 ${pendingRun.level} 级</small></div><button class="secondary-button" data-action="restore">继续上次历练 ${smallIcon('arrow')}</button></div>` : ''}
      ${homeTownEntrance(save)}
      <section class="expedition" aria-label="选择秘境">
        <div class="journey-selection"><div class="journey-destination" aria-live="polite"><small>第${stage.chapter}境 · ${save.completed.includes(selectedStage) ? '故地重游' : '此行将至'}</small><h3>${stage.name}</h3><p>${stage.description}</p><div class="journey-destination-facts"><span>${selectedStage === FINAL_TRIAL_STAGE ? `仙尊最早 ${formatTime(TRIAL_BOSS_TIMES.at(-1)!)}` : `历练 ${stage.minutes} 分钟`}</span><span>每分钟 ${STAGE_YEARS_PER_MINUTE[selectedStage]} 年</span><span>妖王 · ${stage.boss}</span></div></div><div class="journey-depart"><div class="loadout-preview"><span>本命法宝</span><button data-action="arsenal">${icon(save.starter, treasure(save.starter).color)}${treasure(save.starter).name}${smallIcon('arrow')}</button></div><button class="primary-button embark" data-action="start" ${assetsReady ? '' : 'disabled'}><span>${assetsReady ? (completed ? '再入山河' : '踏入秘境') : '秘境凝聚中…'}</span>${smallIcon('arrow')}</button><small>${pathInfo(save.path).name} · ${DIFFICULTIES[difficulty].name}</small></div></div>
        <div class="path-selection"><span class="field-label">修行之道 · 本局法宝与功法路线</span><div class="path-grid" role="group" aria-label="选择修行路线">${CULTIVATION_PATHS.map((p) => `<button data-action="path" data-id="${p.id}" class="path-card ${save.path === p.id ? 'active' : ''}" aria-pressed="${save.path === p.id}" ${save.mortal.member && p.id !== save.path ? 'disabled' : ''} style="--path-color:${p.color}"><strong>${p.name}</strong><span>${p.desc}</span></button>`).join('')}</div><small>正道、魔道各 18 件法宝与 8 种功法，兼修可混搭。${save.mortal.member ? '宗门在籍：仅可修习本门路线，退宗后解锁其他路线。' : '路线仅影响新历练，续局保留原路线。'}</small></div>
        ${medicineEntrance(save, selectedStage)}
        <div class="depart-row"><div class="difficulty-wrap"><span class="field-label">历练难度</span><div class="difficulty-switch" role="group" aria-label="历练难度">${DIFFICULTIES.map((d, i) => `<button data-action="difficulty" data-id="${i}" class="${i === difficulty ? 'active' : ''}" aria-pressed="${i === difficulty}" ${isExtremeLife(save) && i === 0 ? 'disabled title="极限模式从第二档难度起选"' : ''}>${d.name}<small>${i === 0 ? (isExtremeLife(save) ? '极限不可选' : '推荐初修') : `收益 ×${d.reward}`}</small></button>`).join('')}</div></div><button class="journey-map-link" data-action="journey-map">展开山河 · 另择秘境 <span aria-hidden="true">↓</span></button></div>
        ${journeyMap(save, selectedStage, narrow)}
      </section>
    </main>
    <footer class="lobby-footer"><button class="prologue-revisit" data-action="prologue-revisit">重温序章</button><button class="lobby-save-status lobby-about${storageAvailable ? '' : ' storage-warning'}" data-action="about">${storageAvailable ? '关于《叩仙门》 · GitHub' : '本机存档不可用 · 关于《叩仙门》'}</button><span class="lobby-footer-links">${chronicleEntrance(save)}</span></footer>`;
}

export function guidePanel(
  guideTab: string,
  inGame: boolean,
  tabs: readonly { id: string; title: string }[],
  content: (tab: string) => string,
): PanelParts {
  return [
    '修行指南',
    '道法有迹',
    `<div class="guide-tabs" role="group" aria-label="说明分类">${tabs.map((t) => `<button data-action="guide-tab" data-id="${t.id}" class="${guideTab === t.id ? 'active' : ''}" aria-pressed="${guideTab === t.id}">${t.title}</button>`).join('')}</div>${content(guideTab)}<button class="primary-button guide-close" data-action="close">${inGame ? '返回暂停界面' : '道心已明'} ${smallIcon('arrow')}</button>`,
  ];
}

export function upgradeChoicesModal(game: Game, save: SaveData): string {
  return `<div class="modal-backdrop upgrade-backdrop"><section class="upgrade-panel" role="dialog" aria-modal="true" aria-label="局内升级，选择一项机缘"><div class="upgrade-heading"><span class="eyebrow">灵气充盈 · 道法自成</span><h2>顿悟新机缘</h2><p>局内等级 <b>${game.level}</b><span class="upgrade-instruction"><span>·</span>选择一项，续写你的修行之路</span></p></div><div class="choice-grid">${game.choices.map((c, i) => choiceCard(game, save, c, i)).join('')}</div><div class="upgrade-footer"><span>法宝 ${game.weapons.length} / 6 <i>·</i> 功法 ${Object.keys(game.passives).length} / 4</span><button class="secondary-button" data-action="reroll" ${game.rerolls === 0 ? 'disabled' : ''}>${smallIcon('refresh')}重悟机缘 <span>${game.rerolls} / 3</span></button>${autoplayButton(save.autoplay)}<small>${save.autoplay ? '自动历练正在挑选适合当前搭配的机缘…' : '按 1 / 2 / 3 选择'}</small></div></section></div>`;
}

export function pausePanel(
  game: Game,
  save: SaveData,
  fps: number | undefined,
  abandonConfirm: boolean,
): PanelParts {
  return [
    '静心片刻',
    '修行暂歇',
    `<p class="pause-description">${game.encounterName} · ${pathInfo(game.path).name} · ${formatTime(game.time)} · <span class="pause-kills">已斩 ${game.kills} 妖${fps === undefined ? '' : `<small class="pause-frame-rate" title="暂停前最近一秒的平均帧率">${fps} FPS</small>`}</span></p><div class="pause-build">${game.weapons.map((w) => `<span>${icon(w.id, treasure(w.id).color)}<span class="pause-weapon-name">${w.evolved ? treasure(w.id).evolution : treasure(w.id).name} · ${w.level}重</span>${weaponAffinity(treasure(w.id), game.spiritRoot, game.rootElements, true)}</span>`).join('')}</div><p class="panel-note">${isExtremeLife(save) ? '大道无情，生死有命。此战不可退离；未完战斗刷新或关闭页面将身陨。' : game.tribulation ? '放弃后此世落幕，可先留存此世，再确认轮回。' : abandonConfirm ? '提前结束将按当前战绩结算收益，本次不会解锁下一秘境。' : '呼吸之间，万念归一。准备好后继续前行。'}</p><div class="pause-actions">${autoplayButton(save.autoplay)}<button class="secondary-button" data-action="damage">伤害统计</button><button class="primary-button" data-action="resume">继续修行 ${smallIcon('play')}</button><button class="secondary-button" data-action="abandon" ${isExtremeLife(save) ? 'disabled title="极限历练不可主动结束"' : ''}>${game.tribulation ? '放弃渡劫' : abandonConfirm ? '确认结束并结算' : '结束本次历练'}</button></div>`,
  ];
}

export function damagePanel(game: Game, resumeAfterDamage: boolean): PanelParts {
  return [
    '伤害统计',
    `${game.encounterName} · ${formatTime(game.time)} · 斩妖 ${game.kills}`,
    `${damageReport(game)}<button class="primary-button guide-close" data-action="close">${resumeAfterDamage ? '继续修行' : '返回暂停界面'} ${smallIcon('arrow')}</button>`,
  ];
}

export function restartRunPanel(): PanelParts {
  return [
    '另启一段仙缘',
    '上次历练尚未结束',
    '<p class="panel-note">新开历练会放弃旧局，尚未结算的灵石、玄铁与通关奖励将不再领取。已经入库的永久修为、物资、收藏与炼器进度保留。</p><div class="pause-actions"><button class="secondary-button" data-action="restore">继续上次历练</button><button class="primary-button" data-action="new-run">放弃旧局并开始</button></div>',
  ];
}

export function victoryModal(game: Game): string {
  const final = game.isFinalTrial;
  return `<div class="modal-backdrop victory-backdrop ${final ? 'victory-final' : ''}"><section class="victory-scene" role="dialog" aria-modal="true" aria-labelledby="victory-title"><div class="victory-formation" aria-hidden="true">${Array.from({ length: 8 }, (_, i) => `<span class="victory-sword" style="--angle:${i * 45}deg"><i class="victory-blade"></i></span>`).join('')}</div><div class="victory-sparks" aria-hidden="true">${Array.from(
    { length: 24 },
    (_, i) => {
      const angle = (i / 24) * Math.PI * 2;
      const distance = 35 + (i % 4) * 6;
      return `<i style="--x:${Math.cos(angle) * distance}vmin;--y:${Math.sin(angle) * distance}vmin;--delay:${(i % 4) * 90}ms"></i>`;
    },
  ).join(
    '',
  )}</div><div class="victory-copy"><div class="eyebrow">${game.encounterName} · 历练圆满</div><h2 id="victory-title">${final ? '七劫尽破' : '一剑荡妖尘'}</h2><p>${final ? '七境圆满 · 天劫自此消散' : '妖王伏诛 · 此境已破'}</p>${final ? '<div class="victory-trials" aria-label="七劫全部完成">壹 · 贰 · 叁 · 肆 · 伍 · 陆 · 柒</div>' : ''}</div><button class="secondary-button victory-skip" data-action="victory-result">查看通关战绩 ${smallIcon('arrow')}</button></section></div>`;
}

export function deathModal(game: Game): string {
  return `<div class="modal-backdrop"><section class="result-panel" role="dialog" aria-modal="true" aria-label="重燃道心"><div class="eyebrow">仙途未尽</div><h2>重燃道心</h2><p>气血已尽，本次修行暂停。</p><p class="panel-note">观看广告后原地满血复活，获得 3 秒护体。<br>每局最多复活 ${MAX_REVIVES} 次，法宝、等级和战绩全部保留。${game.tribulation ? '<br>放弃本次天劫后可先留存此世，再确认轮回。' : ''}</p><div class="result-actions death-actions"><button class="primary-button" data-action="watch-ad">看广告复活 · 剩余 ${MAX_REVIVES - game.revivesUsed} 次</button><button class="secondary-button" data-action="finish-run">${game.tribulation ? '放弃渡劫 · 此世落幕' : '直接结算'}</button></div></section></div>`;
}

export function settlementModal(
  save: SaveData,
  game: Game,
  rewards: {
    stones: number;
    iron: number;
    cultivation: number;
    cultivationRemaining: number;
    ascensionCultivation: number;
  },
  oldRealm: string,
): string {
  const won = game.state === 'won',
    realm = currentRealm(save).name;
  const firstReturn = save.mortal.hometown && save.runs === 1 && !game.tribulation;
  const journeyYears =
    game.elapsedYears === undefined
      ? '此行年岁未载'
      : game.elapsedYears < 0.1
        ? '此行不足 0.1 年'
        : firstReturn
          ? `此行 ${game.elapsedYears.toLocaleString('zh-CN', { maximumFractionDigits: 1, useGrouping: false })} 年<br>离乡时十五，如今 ${save.age.toLocaleString('zh-CN', { maximumFractionDigits: 1, useGrouping: false })} 岁。`
          : `此行 ${game.elapsedYears.toLocaleString('zh-CN', { maximumFractionDigits: 1, useGrouping: false })} 年`;
  const actions =
    won && game.isFinalTrial
      ? '<button class="secondary-button" data-action="return">返回首页</button>'
      : `<button class="secondary-button" data-action="return">返回首页</button><button class="primary-button" data-action="${won && game.stage < STAGES.length - 1 ? 'next' : 'retry'}">${won && game.stage < STAGES.length - 1 ? '前往下一秘境' : '再入仙途'} ${smallIcon('arrow')}</button>`;
  return `<div class="modal-backdrop"><section class="result-panel settlement-panel ${won && game.isFinalTrial ? 'result-complete' : ''}" role="dialog" aria-modal="true" aria-label="历练结算"><div class="settlement-content"><div class="result-seal">${won ? (game.isFinalTrial ? '圆满' : '破境') : '归来'}</div><div class="eyebrow">${game.encounterName} · ${pathInfo(game.path).name} · ${DIFFICULTIES[game.difficulty].name}</div><h2>${won ? (game.isFinalTrial ? '仙途圆满，自在长生' : '一剑荡妖尘') : '仙途漫漫，再行一程'}</h2><p>${won ? (game.isFinalTrial ? '七劫尽破，已证真仙。周期天劫就此止息，既有修行与劫印长存。' : `妖王已斩，${STAGES[game.stage + 1].name}已解锁。`) : '胜败皆为修行。此行所得，尽归道心。'}</p><div class="result-stats"><div><strong>${formatTime(game.time)}</strong><span>历练时长</span></div><div><strong>${game.kills}</strong><span>斩妖数量</span></div><div><strong>${game.level}</strong><span>局内等级</span></div></div><div class="reward-row"><span>${smallIcon('gem')}<b>+${rewards.stones}</b> 灵石</span><span>◆ <b>+${rewards.iron}</b> 玄铁</span><span>✧ <b>+${rewards.cultivation}</b> 本局修为</span></div><p class="result-years">${journeyYears}</p>${runLootContent(game.loot)}${rewards.ascensionCultivation > 0 ? `<p class="boss-reward">成仙修为补足 +${rewards.ascensionCultivation}<small>已计入本局总修为，仅补足成仙所需</small></p>` : ''}<div class="result-realm">${realm !== oldRealm ? `境界突破 · ${oldRealm} → ${realm}` : `当前境界 · ${realm}`}</div>${game.bossCultivation > 0 ? `<p class="boss-reward">妖王突破修为 +${Math.floor(game.bossCultivation).toLocaleString('zh-CN', { useGrouping: false })}<small>已计入本局总修为</small></p>` : ''}${won ? '' : preparationAdviceContent(save, false, true)}${humanRecollection(save) ? `<p class="human-recollection">${humanRecollection(save)}</p>` : ''}<details class="disclosure settlement-details"><summary>伤害统计与收益明细</summary><p class="panel-note">修为实时入账 ${rewards.cultivation - rewards.cultivationRemaining} · 本次补发 ${rewards.cultivationRemaining}，合计已计入永久修为。</p>${damageReport(game)}</details></div><div class="result-actions">${actions}</div></section></div>`;
}

export function rootPickerView(
  save: SaveData,
  adRoot: SpiritRootId,
  adElements: ElementId[],
): string {
  const root = spiritRootInfo(adRoot);
  return `<div class="root-quality-options" role="group" aria-label="灵根资质">${SPIRIT_ROOTS.map((r) => `<button class="secondary-button ${r.id === adRoot ? 'selected' : ''}" data-action="ad-root-quality" data-id="${r.id}" aria-pressed="${r.id === adRoot}">${r.name}${r.count > 1 ? `·${r.count}系` : ''}</button>`).join('')}</div><p>选择 ${root.count} 种五行 · 已选 ${adElements.length} / ${root.count} · 对应法宝伤害 +${root.damageBonus}%<br>灵气与修为 ${Math.round(root.rate * 100)}%，基础气血 ${root.baseHp}，基础回血 ${root.baseRegen.toFixed(2)}/秒，悟道前十阶每阶独立增伤 +${root.powerPerLevel}%。<br>基础暴击 ${Math.round(root.baseCrit * 100)}% · 基础移速 ${root.baseSpeed} 地图像素/秒。<br>${root.count ? '首位五行决定默认本命。' : '本命法宝将在领取时随机。'}</p><div class="root-element-options" role="group" aria-label="灵根五行">${ELEMENTS.map((e) => `<button class="secondary-button ${adElements.includes(e.id) ? 'selected' : ''}" data-action="ad-root-element" data-id="${e.id}" aria-pressed="${adElements.includes(e.id)}" ${root.count ? '' : 'disabled'}>${e.name}${adElements[0] === e.id ? ' · 首位' : ''}</button>`).join('')}</div><small>${root.count ? `入门法宝：${ROOT_STARTERS[adElements[0] ?? 'metal'].map((id) => treasure(id).name).join(' / ')}` : `入门法宝：从${save.path === 'dual' ? '正魔十件' : '本门五件'}中随机`}；领取后设为当前路线本命，已有收藏与炼器保留。</small>`;
}

export function sectDuesModal(save: SaveData): string {
  const dues = save.mortal.member!.dues;
  const supplies = adSupplies(save.unlocked);
  return `<div class="modal-backdrop"><section class="result-panel" role="dialog" aria-modal="true" aria-label="宗门供奉到期"><div class="eyebrow">仙门供奉</div><h2>供奉到期</h2><p>本期需 ${dues} 灵石，现有 ${save.stones} 灵石。${save.stones < dues ? `<br>还缺 ${dues - save.stones} 灵石。` : '<br>物资已足，可以补缴。'}</p><p class="panel-note">人间计时已暂停，在籍身份与精研保留。${save.stones < dues ? (isExtremeLife(save) ? '<br>极限模式无法领取补给。' : `<br>可看广告领取 ${supplies.stones} 灵石与 ${supplies.iron} 玄铁，一次不足可再次领取。`) : ''}放弃补缴会被清退出宗门。</p><div class="result-actions death-actions">${save.stones < dues ? `<button class="primary-button" data-action="dues-ad" ${rewardDisabled(save)}>看广告 · 领取物资</button>` : '<button class="primary-button" data-action="dues-pay">补缴供奉 · 继续游历</button>'}<button class="secondary-button" data-action="dues-decline">放弃补缴 · 离开宗门</button></div></section></div>`;
}

export function retreatResultPanel(
  save: SaveData,
  result: {
    years: number;
    cultivation: number;
    cultivationPercent: number;
    gains: { vitality: number; power: number; speed: number };
  },
): PanelParts {
  const gains = (['vitality', 'power', 'speed'] as const)
    .filter((key) => result.gains[key] > 0)
    .map(
      (key) =>
        `${{ vitality: '气血', power: '法宝伤害', speed: '移速' }[key]} +${result.gains[key]}%`,
    );
  return [
    '岁月流转，出关之时',
    '闭关结束',
    `<p class="pause-description">度过 ${Number(result.years.toFixed(1))} 年，未消耗灵石。</p><p class="boss-reward">修为 +${result.cultivation}<small>${result.cultivation ? `相当于闭关前大境界总修为的 ${Number(result.cultivationPercent.toFixed(2))}%` : '本次未积累到 1 点修为'} · ${currentRealm(save).name}</small><small>${gains.length ? gains.join(' · ') : '此次无额外属性提升'}</small><small>年岁 ${save.age.toFixed(1)} · 收获已保存</small></p><button class="primary-button guide-close" data-action="cultivation">返回洞府</button>`,
  ];
}

export function importConfirmPanel(candidate: {
  save: SaveData;
  run: { stage: number; time: number; level: number } | null;
}): PanelParts {
  const imported = candidate.save;
  const realm = realmInfo(imported.cultivation, imported.completed.includes(FINAL_TRIAL_STAGE));
  const curios = Object.values(imported.curios.bag).filter((count) => count > 0).length;
  const endedNotice = imported.journeyEnded
    ? '<p class="panel-note">此存档已叩入仙门，此世修行已结束。导入后将进入终章，不能返回此世继续修行。</p>'
    : '';
  return [
    '导入修行存档',
    '确认后覆盖当前进度',
    `<p class="pause-description">${realm.name} · 累计修为 ${imported.cultivation.toLocaleString('zh-CN', { useGrouping: false })}<br>${isExtremeLife(imported) ? '极限模式' : '普通模式'}${imported.pendingReincarnation ? ' · 此世已落幕' : ''}<br>${spiritRootInfo(imported.spiritRoot).name} · 年岁 ${imported.age.toFixed(1)}<br>${imported.stones} 灵石 · ${imported.iron} 玄铁<br>收藏法宝 ${imported.artifacts.length} 件 · 已通关 ${imported.completed.length} 境<br>奇物珍藏 ${curios} 件<br>丹囊 ${Object.values(imported.medicine.bag).reduce((total, count) => total + count, 0)} 份 · 已购药方 ${imported.medicine.recipes.length} 张 · 生效药效 ${activeMedicines(imported.medicine, imported.age).length} 种<br>人间缘簿 ${Object.keys(imported.mortal.humanStories ?? {}).length} 段 · 旧信与信物已备份<br>仙途履历 ${imported.chronicle.entries.length} 条 · ${imported.mortal.member ? '宗门身份与精研已备份' : '散修'}${imported.mortal.immortal?.claimed ? '<br>人间游历奇遇与领取记录已备份' : ''}${candidate.run ? `<br>未完成历练：${STAGES[candidate.run.stage].name} · ${formatTime(candidate.run.time)} · LV.${candidate.run.level}` : '<br>无未完成历练'}</p>${endedNotice}<p class="panel-note">导入会替换此网址的全部进度和续局。可先导出当前存档备份，取消不会更改进度。</p><div class="save-actions"><button class="secondary-button" data-action="export-save">备份当前存档</button><button class="secondary-button" data-action="settings">取消导入</button><button class="primary-button" data-action="confirm-import">确认覆盖并导入</button></div>`,
  ];
}
