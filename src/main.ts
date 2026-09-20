import './style.css';
import './mortal.css';
import { chronicleEntrance, chronicleContent } from './chronicle-ui.ts';
import {
  TREASURES,
  CULTIVATION_PATHS,
  pathInfo,
  isCultivationPath,
  allowsSchool,
  evolutionPassives,
  PASSIVES,
  STAGES,
  FINAL_TRIAL_STAGE,
  TRIAL_BOSS_STAGES,
  TRIAL_BOSS_TIMES,
  DIFFICULTIES,
  REALMS,
  ENEMIES,
  enemyWave,
  STAGE_ENEMIES,
  treasure,
  passive,
  formatTime,
  xpNeeded,
  MAX_RUN_LEVEL,
  MAX_REVIVES,
  MAX_FORGE_LEVEL,
  spiritRootInfo,
  rollSpiritRoot,
  rootElementsFor,
  elementInfo,
  weaponRootBonus,
  ELEMENTS,
  SPIRIT_ROOTS,
  ROOT_STARTERS,
  rootStarter,
  type Treasure,
  type CultivationPath,
  type SpiritRootId,
  type ElementId,
  AD_SUPPLIES,
  STAGE_YEARS_PER_MINUTE,
} from './data.ts';
import {
  parseSave,
  freshSave,
  claimArtifacts,
  SAVE_KEY,
  realmInfo,
  realmBonuses,
  trainingCost,
  forgeCost,
  forgeDamageBonus,
  train,
  forge,
  settleRun,
  attuneSpiritRoot,
  lifespanInfo,
  extendLifespan,
  trainingYears,
  tribulationDue,
  completeTribulation,
  retreatPlan,
  retreat,
} from './progress.ts';
import { Game } from './game.ts';
import { exportSave, importSave, restoreSavedRun, MAX_SAVE_FILE_BYTES } from './save-transfer.ts';
import { autoplayChoice, autoplayInput } from './autoplay.ts';
import type { Choice } from './game.ts';
import { Renderer } from './render.ts';
import { icon, smallIcon } from './icons.ts';
import { GUIDE_TABS, guideContent } from './guide.ts';
import { spriteStyle } from './sprites.ts';
import { assetUrl } from './asset-url.ts';
import { MobileDisplay } from './mobile-display.ts';
import { TownScene } from './town-scene.ts';
import { TOWN_START, townClockRunning } from './town.ts';
import { freshTownPopulation, type TownResident } from './town-population.ts';
import { closeNpcChat, mountNpcChat, mountTeaStory } from './npc-chat.ts';
import { townVisit } from './town-history.ts';
import { chooseSmithStory } from './town-story.ts';

import {
  advanceMortal,
  joinSect,
  leaveSect,
  startActivity,
  tradeIron,
  sectDuesPending,
  settleSectDues,
} from './mortal.ts';
import {
  mortalEntrance,
  mortalPage,
  mortalStatus,
  townPage,
  townStatus,
  mortalTabContent,
  townEventContent,
  masteryDescription,
} from './mortal-ui.ts';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `<canvas id="world" aria-label="修仙战斗场景"></canvas><div class="screen-grain"></div><div id="ui"></div><div id="modal-root"></div><div id="joystick"><span></span></div><div id="toast" role="status"></div>`;
const ui = document.querySelector<HTMLDivElement>('#ui')!;
const modal = document.querySelector<HTMLDivElement>('#modal-root')!;
const joystick = document.querySelector<HTMLDivElement>('#joystick')!;
const renderer = new Renderer(document.querySelector<HTMLCanvasElement>('#world')!);
let sceneLoading = false;
let storageAvailable = true;
let raw: string | null = null;
try {
  raw = localStorage.getItem(SAVE_KEY);
} catch {
  storageAvailable = false;
}
const save = parseSave(raw);
const PROLOGUE_IMAGE = '/assets/qinglan-prologue-dark.webp';
// 展示顺序独立于图集顺序，避免移动追魂钉后图标错位。
const catalogTreasures = [...TREASURES];
catalogTreasures.splice(
  catalogTreasures.findIndex((t) => t.id === 'nail'),
  1,
);
catalogTreasures.splice(
  catalogTreasures.findIndex((t) => t.school === 'demonic'),
  0,
  treasure('nail'),
);
let pendingRun: Game | null = null;
try {
  pendingRun = restoreSavedRun(save, JSON.parse(raw || '{}').activeRun);
} catch {
  /* 无有效对局时仍保留永久进度。 */
}
let selectedStage = save.unlocked,
  difficulty = 0,
  game: Game | null = null;
let panel = '',
  bookTab = 'treasures',
  selectedTreasure = save.starter,
  settled = false;
let inMortalWorld = false;
let mortalFilter = 'all';
let mortalTab: 'town' | 'sects' = 'town';
let inTown = false;
let townScene: TownScene | null = null;
let townPosition = { ...TOWN_START };
let townNpc: TownResident | null = null;
let lastMortalTick = performance.now();
let nextMortalStatus = 0;
let guideTab = 'basics';
let schoolFilter = 'all';
let bestiaryStage = -1;
let treasurePage = Math.floor(catalogTreasures.findIndex((t) => t.id === save.starter) / 12);
let rewards: ReturnType<typeof settleRun> | null = null,
  oldRealm = '',
  abandonConfirm = false;
const keys = new Set<string>();
let touchInput = { x: 0, y: 0 },
  pointer: number | null = null,
  touchOrigin = { x: 0, y: 0 };
let audio: AudioContext | null = null,
  lastSound = 0,
  assetsReady = false;
let masterGain: GainNode | null = null;
let music: HTMLAudioElement | null = null;
let musicStarting = false;
let volumeOpen = false;
let resumeAfterDamage = false;
let adReadyAt = 0;
let adTimer: number | undefined;
let victoryTimer: number | undefined;
let rewardAd: 'root' | 'supplies' | null = null;
let rewardReturnPanel = '';
let rewardReturnScroll = 0;
let adRoot: SpiritRootId = 'heaven';
let adElements: ElementId[] = [];
let pendingImport: ReturnType<typeof importSave> | null = null;
function persist() {
  const active = game && !settled ? game : pendingRun;
  try {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ ...save, activeRun: active?.snapshot() ?? null }),
    );
  } catch {
    if (storageAvailable) toast('浏览器暂时无法保存进度，请勿关闭当前页面');
    storageAvailable = false;
  }
}
function toast(text: string) {
  const el = document.querySelector<HTMLDivElement>('#toast')!;
  el.textContent = text;
  el.classList.add('visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('visible'), 3200);
}
let toastTimer = 0;
const mobileDisplay = new MobileDisplay(() => {
  const button = document.querySelector<HTMLButtonElement>('[data-action="fullscreen"]');
  if (!button) return;
  button.textContent = mobileDisplay.active ? '还原' : '全屏';
  button.setAttribute('aria-label', mobileDisplay.active ? '退出全屏' : '进入全屏');
  button.setAttribute('aria-pressed', String(mobileDisplay.active));
});
function sound(name: string) {
  if (!save.sound || !audio || audio.state !== 'running') return;
  const now = audio.currentTime;
  if ((name === 'cast' && now - lastSound < 0.3) || now - lastSound < 0.035) return;
  lastSound = now;
  const notes: Record<string, number> = {
    cast: 440,
    hurt: 110,
    upgrade: 660,
    breakthrough: 784,
    select: 880,
    lightning: 160,
    boss: 98,
    win: 1046,
    lose: 147,
  };
  const osc = audio.createOscillator(),
    gain = audio.createGain();
  osc.type = name === 'hurt' ? 'triangle' : 'sine';
  osc.frequency.setValueAtTime(notes[name] || 523, now);
  osc.frequency.exponentialRampToValueAtTime(
    (notes[name] || 523) * (name === 'hurt' ? 0.5 : 1.5),
    now + 0.2,
  );
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(name === 'cast' ? 0.015 : 0.06, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
  osc.connect(gain);
  gain.connect(masterGain!);
  osc.start(now);
  osc.stop(now + 0.36);
}
function unlockAudio() {
  if (!save.sound) {
    if (masterGain && audio) masterGain.gain.setTargetAtTime(0, audio.currentTime, 0.02);
    music?.pause();
    return;
  }
  audio ??= new AudioContext();
  if (!masterGain) {
    masterGain = audio.createGain();
    masterGain.connect(audio.destination);
  }
  masterGain.gain.setTargetAtTime(save.volume, audio.currentTime, 0.02);
  if (!music) {
    music = new Audio(assetUrl('assets/audio/qinglan-mist.m4a'));
    music.loop = true;
    const musicGain = audio.createGain();
    musicGain.gain.value = 0.4;
    audio.createMediaElementSource(music).connect(musicGain);
    musicGain.connect(masterGain);
  }
  // 音乐独立加载，不阻塞场景；播放被浏览器拦截时，在下次操作重试。
  if (audio.state === 'suspended') void audio.resume().catch(() => {});
  if (music.paused && !musicStarting) {
    musicStarting = true;
    void music
      .play()
      .catch(() => {})
      .finally(() => {
        musicStarting = false;
      });
  }
}
const currency = () =>
  `<span class="currency">${smallIcon('gem')}<b>${save.stones}</b><span>灵石</span></span><span class="currency iron"><i>◆</i><b>${save.iron}</b><span>玄铁</span></span>`;
function autoplayButton() {
  return `<button class="round-button auto-button ${save.autoplay ? 'active' : ''}" data-action="autoplay" aria-pressed="${save.autoplay}" title="自动走位、拾取与选择升级；点击切换手动">AI 代打 · ${save.autoplay ? '开' : '关'}</button>`;
}
function fullscreenButton() {
  return mobileDisplay.available
    ? `<button class="round-button fullscreen-button" data-action="fullscreen" aria-label="${mobileDisplay.active ? '退出全屏' : '进入全屏'}" aria-pressed="${mobileDisplay.active}">${mobileDisplay.active ? '还原' : '全屏'}</button>`
    : '';
}
function controls(inGame = false) {
  return `${autoplayButton()}<span class="sound-control"><button class="round-button" data-action="sound" aria-label="${save.sound ? '调节音量' : '开启音乐与音效'}" title="${save.sound ? '调节音乐与音效音量' : '开启音乐与音效'}">${smallIcon(save.sound ? 'sound' : 'mute')}</button>${save.sound && volumeOpen ? `<div class="volume-control"><label>音乐与音效 <output>${Math.round(save.volume * 100)}%</output><input type="range" min="0" max="100" value="${Math.round(save.volume * 100)}" data-volume aria-label="音乐与音效音量" /></label><button data-action="mute">静音</button></div>` : ''}</span><button class="round-button help-button" data-action="guide" aria-label="修行指南" title="修行指南 · 玩法与道具">?</button>${inGame ? `<button class="round-button damage-button" data-action="damage" aria-label="伤害统计" title="查看本局法宝伤害占比">伤害</button>${fullscreenButton()}<button class="round-button" data-action="pause" aria-label="暂停游戏" title="暂停 · Esc">${smallIcon('pause')}</button>` : ''}`;
}
function completedJourney(realmName: string) {
  return `<section class="hero journey-hero" aria-label="仙途通关"><div class="hero-copy"><div class="eyebrow"><span></span>终章 · 仙途圆满</div><h1>七境皆过客<span>天地一逍遥</span></h1><p>曾执一剑入青岚，今携万法越重山。<br>七境已破，天劫已散。往后山河，任你来去。</p><div class="journey-badges"><span>七境通关</span><span>天劫止息</span><span>修行永存</span></div><div class="journey-actions"><button class="primary-button" data-action="revisit">重游七境 ${smallIcon('arrow')}</button><button class="secondary-button" data-action="arsenal">查看珍藏</button></div></div><button class="journey-portrait" data-action="cultivation" aria-label="当前${realmName}，进入洞府修炼"><span class="journey-orbit" aria-hidden="true"></span><span class="journey-poem" aria-hidden="true">山河无恙 · 道心长明</span><span class="journey-character" style="${spriteStyle(0)}" aria-hidden="true"></span><span class="journey-realm"><small>此世道果</small><strong>${realmName}</strong><span>进入洞府 ${smallIcon('arrow')}</span></span></button></section><section class="journey-records" aria-label="此世修行成果"><div><span>累积修为</span><strong title="${save.cultivation.toLocaleString('zh-CN')}">${Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(save.cultivation)}</strong><small>一念一境，皆成过往</small></div><div><span>此世年岁</span><strong>${Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(save.age)}<em>年</em></strong><small>岁月悠长，道心未改</small></div><div><span>法宝珍藏</span><strong>${save.artifacts.length}<em>/ ${TREASURES.length}</em></strong><small>万般法器，随心而御</small></div><div><span>历劫留印</span><strong>${save.tribulations}<em>枚</em></strong><small>气血 +${save.tribulations * 3}% · 伤害 +${save.tribulations * 2}%</small></div></section>`;
}
function renderLobby() {
  leaveTown();
  if (assetsReady && !renderer.hasScene(selectedStage)) {
    ensureScene(selectedStage, renderLobby);
    return;
  }
  if (inMortalWorld) persist();
  inMortalWorld = false;
  document.body.classList.remove('in-mortal');
  canvasDirty = true;
  void mobileDisplay.leave();
  const stage = STAGES[selectedStage],
    realm = realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE));
  const completed = save.completed.includes(FINAL_TRIAL_STAGE);
  document.body.classList.remove('in-game');
  document.body.classList.toggle('journey-complete', completed);
  document.body.classList.toggle('immortal-home', realm.max);
  ui.innerHTML = `
    <header class="lobby-header">
      <a class="brand" href="#" data-action="home" aria-label="青岚仙途首页"><span class="brand-emblem">${icon('sword')}</span><span>青岚仙途<small>QINGLAN · IMMORTAL PATH</small></span><span class="seal">${completed ? '圆满' : '问道'}</span></a>
      <nav aria-label="修行菜单"><button class="nav-link active" data-action="home">${completed ? '七境巡游' : '秘境历练'}<span>EXPLORE</span></button><button class="nav-link" data-action="cultivation">洞府修炼<span>CULTIVATE</span></button><button class="nav-link" data-action="arsenal">藏器阁<span>ARTIFACTS</span></button><button class="nav-link" data-action="bestiary">妖物志<span>BESTIARY</span></button></nav>
      <div class="header-right">${currency()}${controls()}</div>
    </header>
    <main class="lobby-main ${completed ? 'journey-lobby' : ''}">
      ${
        completed
          ? completedJourney(realm.name)
          : `<section class="hero">
        <div class="hero-copy"><div class="eyebrow"><span></span>青岚少年 · 觅长生 · 寻大道</div><h1>御剑问长生<span>青岚入仙途</span></h1><p>在青岚镇长大，十五岁踏上仙途。<br>为觅长生，为追寻大道，向山海深处去。</p>
          <div class="hero-features"><span>三十六法宝</span><i>·</i><span>七重秘境</span><i>·</i><span>正魔兼修</span></div>
        </div>
        <button class="realm-preview" data-action="cultivation"><span class="vertical-poem">万法归一 · 道心长存</span><span class="realm-circle"><small>当前境界</small><strong>${realm.ascending ? '渡劫' : REALMS[realm.index]}</strong><span>${realm.ascending ? '待破七境' : ['初期', '中期', '后期'][realm.step % 3]}</span></span><span class="realm-link">洞府修炼 ${smallIcon('arrow')}</span></button>
      </section>`
      }
      ${spiritRootSummary(true)}${mortalEntrance(save)}
      <section class="expedition" aria-label="选择秘境">
        ${pendingRun ? `<div class="resume-banner"><div><span class="status-dot"></span>尚有一段仙缘未了<small>${pendingRun.encounterName} · ${formatTime(pendingRun.time)} · ${pathInfo(pendingRun.path).name} · 局内 ${pendingRun.level} 级</small></div><button class="secondary-button" data-action="restore">继续上次历练 ${smallIcon('arrow')}</button></div>` : ''}
        <div class="section-heading"><div><span class="section-number">${completed ? '圆满' : '壹 / 柒'}</span><h2>${completed ? '故地重游，山河依旧' : '择一秘境，启程修行'}</h2></div><span class="muted">已探索 ${save.completed.length} / ${STAGES.length} 处秘境</span></div>
        <div class="stage-grid">${STAGES.map((s, i) => `<button class="stage-card ${i === selectedStage ? 'selected' : ''} ${i > save.unlocked ? 'locked' : ''}" data-action="stage" data-id="${i}" ${i > save.unlocked ? 'disabled' : ''} style="--stage-color:${s.color}${completed ? `;--stage-image:url('${assetUrl(s.terrain)}')` : ''}"><span class="stage-top"><span>第${s.chapter}境</span>${i > save.unlocked ? smallIcon('lock') : save.completed.includes(i) ? '<span>已通关 ✓</span>' : '<span>可挑战</span>'}</span><strong>${s.name}</strong><span class="stage-bottom">${i > save.unlocked ? '通关前境解锁' : `${s.minutes} 分钟 · ${s.boss}`}</span><span class="stage-ornament">${s.chapter}</span></button>`).join('')}</div>
        <div class="expedition-footer"><div class="stage-description"><span class="tiny-diamond">◇</span><p>${stage.description}</p></div><div class="loadout-preview"><span>本命法宝</span><button data-action="arsenal">${icon(save.starter, treasure(save.starter).color)}${treasure(save.starter).name}${smallIcon('arrow')}</button></div></div>
        <div class="path-selection"><span class="field-label">修行之道 · 本局法宝与功法路线</span><div class="path-grid" role="group" aria-label="选择修行路线">${CULTIVATION_PATHS.map((p) => `<button data-action="path" data-id="${p.id}" class="path-card ${save.path === p.id ? 'active' : ''}" aria-pressed="${save.path === p.id}" ${save.mortal.member && p.id !== save.path ? 'disabled' : ''} style="--path-color:${p.color}"><strong>${p.name}</strong><span>${p.desc}</span></button>`).join('')}</div><small>正道、魔道各 18 件法宝与 8 种功法，兼修可混搭。${save.mortal.member ? '宗门在籍：仅可修习本门路线，退宗后解锁其他路线。' : '路线仅影响新历练，续局保留原路线。'}</small></div>
        <div class="depart-row"><div class="difficulty-wrap"><span class="field-label">历练难度</span><div class="difficulty-switch" role="group" aria-label="历练难度">${DIFFICULTIES.map((d, i) => `<button data-action="difficulty" data-id="${i}" class="${i === difficulty ? 'active' : ''}" aria-pressed="${i === difficulty}">${d.name}<small>${i === 0 ? '推荐初修' : `收益 ×${d.reward}`}</small></button>`).join('')}</div></div><button class="primary-button embark" data-action="start" ${assetsReady ? '' : 'disabled'}><span>${assetsReady ? (completed ? '再入山河' : '踏入秘境') : '秘境凝聚中…'}</span>${smallIcon('arrow')}</button></div>
      </section>
    </main>
    <footer class="lobby-footer"><span class="control-hint"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>/ 方向键移动</span><i></i><span>自动施法 · 触屏拖动</span></span><span><span class="status-dot"></span>${storageAvailable ? '修行进度自动保存于本机' : '本机存档不可用'}</span>${chronicleEntrance(save)}</footer>`;
  if (sectDuesPending(save)) renderSectDues();
}
function renderPrologue() {
  if (save.prologueSeen || game || inMortalWorld || panel) return;
  panel = 'prologue';
  ui.inert = true;
  modal.innerHTML = `<div class="modal-backdrop prologue-backdrop"><section class="prologue-scene" role="dialog" aria-modal="true" aria-labelledby="prologue-title"><button class="prologue-skip" data-action="prologue-enter">略过序章 ${smallIcon('arrow')}</button><div class="prologue-heading"><span class="eyebrow">青岚仙途 · 序</span><h1 id="prologue-title">山河<span>一梦</span></h1><p>山河未老，故人先秋。</p><span class="prologue-seal" aria-hidden="true">问长生</span></div><div class="prologue-story" tabindex="0" aria-label="序章正文"><p>青岚山下，有一座临水的小镇。清晨炊烟漫过青瓦，暮色里渔火一盏盏亮起。人们在此迎春、送雪，把一生过成几声钟响。</p><p>你便生在这座小镇。儿时听过茶馆的醒木，也曾在渡口等过一盏归灯。镇上的人总说，稻熟一季，人又老了一岁。你渐渐明白，有些告别，来年春天也等不回。</p><p>十五岁那年，一位过路修士告诉你：山河之外，还有求长生、问大道的路。于是你收拾行囊，向青岚山深处走去。你想看看凡人的一生之外，天地究竟还有多远；也想在漫长岁月里，寻得一个不负此生的答案。</p><p>山外却有另一种岁月。传说云海尽头藏着仙门，一炉香可燃尽百年，一柄剑曾照彻长夜。有人得道归来，故园已成荒丘；有人问遍诸天，仍寻不回旧时的一场雨。</p><p>如今灵潮再起，沉寂的秘境次第苏醒。正道山门重开，魔宗旧灯复燃。风从竹海吹来，带着妖雾，也带着无人认领的仙缘。</p><p>你从青岚的烟火中来，以觅长生为愿，以追寻大道为志。此后每一次修行，都是向天地多问一句；而故乡的万家灯火，会在身后一代代明灭，提醒你为何出发。</p><p class="prologue-last">此去青岚，愿你历尽千劫，<br>仍记得为何出发。</p></div><footer class="prologue-footer"><span>一程山水，自此启行。</span><button class="primary-button" data-action="prologue-enter">入此山河 ${smallIcon('arrow')}</button></footer></section></div>`;
  modal
    .querySelector<HTMLElement>('.prologue-scene')!
    .style.setProperty('--prologue-image', `url("${assetUrl(PROLOGUE_IMAGE)}")`);
  modal.querySelector<HTMLButtonElement>('.prologue-skip')?.focus({ preventScroll: true });
}
function releaseTownScene() {
  if (!townScene) return;
  townPosition = { ...townScene.position };
  townScene.destroy();
  townScene = null;
}
function leaveTown() {
  closeNpcChat();
  releaseTownScene();
  if (inTown) void mobileDisplay.leave();
  document.body.classList.remove('in-town');
  inTown = false;
  lastMortalTick = performance.now();
}
function mountTownScene() {
  const host = document.getElementById('town-view');
  if (!inTown || !host) return;
  if (!save.mortal.population) {
    save.mortal.population = freshTownPopulation(save.age);
    persist();
  }
  townScene = new TownScene(
    host,
    { ...townPosition },
    save.mortal.population,
    save.age,
    showTownEvent,
    save.mortal.scenery?.revision ?? 0,
  );
}
function showTownEvent(npc: TownResident) {
  if (!inTown || townScene?.nearbyNpc?.id !== npc.id) return;
  townNpc = npc;
  panel = 'town-event';
  panelFrame(npc.name, `${npc.place} · ${npc.role}`, townEventContent(save, npc));
  mountNpcChat(modal.querySelector<HTMLElement>('.npc-dialogue')!, save, npc);
}
function showTeaStory() {
  panel = 'tea-story';
  panelFrame(
    '一盏茶，半卷仙途',
    '听雨茶馆 · 仙途旧闻',
    '<section class="tea-story" aria-label="茶馆说书"><p class="tea-story-status panel-note" role="status">醒木初落，且候这一回故事…</p><div class="tea-story-text"></div><div class="save-actions"><button class="secondary-button tea-story-play" hidden>朗读故事</button><button class="secondary-button tea-story-stop" hidden disabled>停止朗读</button></div></section><p class="panel-note">阅读与朗读时不计龄；回到城镇后继续半载听书委托，完成时有 30% 概率获赠 8 灵石。说书暂歇也不影响原有机缘。</p><button class="primary-button" data-action="close">回到街巷</button>',
  );
  void mountTeaStory(modal.querySelector<HTMLElement>('.tea-story')!, save, () => {
    save.sound = true;
    if (save.volume === 0) save.volume = 0.6;
    unlockAudio();
    persist();
  });
}
function renderMortal(enter = false) {
  releaseTownScene();
  const scroll = enter ? 0 : ui.scrollTop;
  if (enter) {
    inMortalWorld = true;
    inTown = false;
    mortalTab = 'town';
    lastMortalTick = performance.now();
    panel = '';
    modal.innerHTML = '';
    clearInput();
    void mobileDisplay.leave();
  }
  document.body.classList.remove('in-game', 'journey-complete', 'immortal-home');
  document.body.classList.add('in-mortal');
  document.body.classList.toggle('in-town', inTown);
  ui.innerHTML = inTown
    ? townPage(save, fullscreenButton())
    : mortalPage(save, mortalTab, mortalFilter, pendingRun?.path);
  ui.scrollTop = inTown ? 0 : scroll;
  mountTownScene();
  if (sectDuesPending(save)) renderSectDues();
}
function syncMortalChange() {
  if (pendingRun) pendingRun = Game.restore(save, pendingRun.snapshot());
  persist();
  renderMortal();
}
function tickMortal(now: number) {
  if (
    !inMortalWorld ||
    !townClockRunning(inTown, !!townScene?.ready, !document.hidden, document.hasFocus(), panel)
  ) {
    lastMortalTick = now;
    return;
  }
  if (now - lastMortalTick < 250) return;
  const elapsed = (now - lastMortalTick) / 1000;
  lastMortalTick = now;
  const changed = advanceMortal(save, elapsed);
  townScene?.refreshResidents(save.age);
  if (sectDuesPending(save)) {
    persist();
    renderSectDues();
    return;
  }
  if (lifespanInfo(save).remaining < 1e-9 || tribulationDue(save)) {
    renderLobby();
    if (tribulationDue(save)) renderTribulationPending();
    else renderLifespanEnd();
    persist();
    return;
  }
  if (changed) {
    syncMortalChange();
    toast(save.mortal.events[0]);
  } else if (now >= nextMortalStatus) {
    const status = document.getElementById('mortal-status');
    if (status) status.innerHTML = mortalStatus(save);
    const townHud = document.getElementById('town-status');
    if (townHud) townHud.innerHTML = townStatus(save);
    nextMortalStatus = now + 1000;
  }
}
function spiritRootSummary(showAge = false) {
  const life = lifespanInfo(save);
  const root = spiritRootInfo(save.spiritRoot);
  return `<div class="spirit-root-summary"><div><small>此世灵根${root.count ? ` · ${root.count} 系` : ''}</small><strong>${root.name}</strong><div class="root-elements">${save.rootElements.length ? save.rootElements.map((id) => `<span class="element-affinity resonant" style="--element-color:${elementInfo(id).color}">${elementInfo(id).name}灵根</span>`).join('') : '<small>五行未显</small>'}</div>${showAge ? `<small class="root-age">年岁 <b>${life.age.toFixed(1)}</b> / ${Number.isFinite(life.limit) ? `${life.limit} 年寿元` : '无限寿元'}</small>` : ''}</div><p>灵气获取 · 修为积累 <b>${Math.round(root.rate * 100)}%</b><br>${root.count ? `对应属性法宝伤害 <b>+${root.damageBonus}%</b>` : '法宝伤害加成 <b>0%</b>'}<br>基础气血 <b>${root.baseHp}</b> · 基础回血 <b>${root.baseRegen.toFixed(2)}/秒</b><br>基础暴击 <b>${Math.round(root.baseCrit * 100)}%</b> · 基础移速 <b>${root.baseSpeed}</b><br>悟道每阶独立增伤 <b>+${root.powerPerLevel}%</b><small>刷新保留 · 轮回重抽资质与五行</small></p><button class="secondary-button" data-action="root-guide">资质说明 ${smallIcon('arrow')}</button><div class="spirit-root-rewards"><button class="secondary-button" data-action="watch-root-ad">看广告 · 自选灵根</button><button class="secondary-button" data-action="reincarnate">轮回转世 · 重启仙途</button></div></div>`;
}
function lifespanSummary() {
  const life = lifespanInfo(save);
  return `<div class="lifespan-summary"><strong>年岁 ${life.age.toFixed(1)} / ${Number.isFinite(life.limit) ? `${life.limit} 年寿元` : '无限寿元'}</strong><span>${STAGES[selectedStage].name} · 战斗每分钟 ${STAGE_YEARS_PER_MINUTE[selectedStage]} 年</span><small>年龄跨局累计，突破大境界延寿；大乘起长生。暂停不计龄，寿尽可广告续命，放弃则强制轮回清空本世进度。${save.lifespanBonus ? `已借寿 ${save.lifespanBonus} 年。` : ''}</small>${save.completed.includes(FINAL_TRIAL_STAGE) ? `<small>七境已通关 · 不再降临天劫 · 已获劫印保留：气血 +${save.tribulations * 3}% / 伤害 +${save.tribulations * 2}%</small>` : save.nextTribulationAge ? `<small>天劫每两万年一次 · 距下次 ${Math.max(0, save.nextTribulationAge - save.age).toFixed(1)} 年 · 已渡 ${save.tribulations} 劫 · 劫印气血 +${save.tribulations * 3}% / 伤害 +${save.tribulations * 2}%</small>` : ''}</div>`;
}
function retreatEstimate(years: number) {
  const plan = retreatPlan(save, years);
  if (!plan) return '请输入正数年限（最多一位小数），并留有剩余寿元。';
  return `实际度过 ${Number(plan.years.toFixed(1))} 年 · ${Number.isFinite(lifespanInfo(save).limit) ? `预计修为 +${plan.cultivation.min}～${plan.cultivation.max}（本大境界总修为的 ${Number(plan.cultivation.minPercent.toFixed(2))}%～${Number(plan.cultivation.maxPercent.toFixed(2))}%，不足 1 点舍去）· 另有 ${Number((plan.chance * 100).toFixed(2))}% 概率获得属性提升` : save.completed.includes(FINAL_TRIAL_STAGE) ? '无修为或属性收益 · 通关后不再受天劫截停' : '大乘起无修为或属性收益，到天劫自动出关'}`;
}
function retreatSection() {
  const life = lifespanInfo(save);
  const immortal = !Number.isFinite(life.limit);
  const years = immortal
    ? 1000
    : Math.max(0.1, Math.floor(Math.min(life.limit * 0.1, life.remaining / 2) * 10) / 10);
  return `<div class="section-heading"><h3>闭关修炼</h3><span>只耗年岁 · 不花灵石</span></div><p class="panel-note">${immortal ? (save.completed.includes(FINAL_TRIAL_STAGE) ? '七境已破，天劫不再降临。闭关只推进年岁，不获得修为或属性；可按填写年数出关。' : '大乘起闭关不再获得修为或属性，只推进年岁；到达天劫时立即出关迎劫。') : '闭关获得少量随机修为：按投入年数占寿元上限的比例计算，灵根越好收益越高，明显慢于历练。长时间闭关有机会推进小阶段；一世寿元全部闭关仍不足以跨越一个完整大境界。另按相同比例抽取属性提升，例如寿元 100 年闭关 50 年，有 50% 概率随机提升气血、法宝伤害或移速中的一项 1%～3%。不增加根基阶数。'}</p><div class="retreat-form"><label for="retreat-years">闭关年数<input id="retreat-years" type="number" inputmode="decimal" min="0.1" step="0.1" value="${years}" required aria-describedby="retreat-estimate"></label><button class="secondary-button" data-action="retreat" ${retreatPlan(save, years) ? '' : 'disabled'}>开始闭关</button></div><p class="panel-note" id="retreat-estimate" role="status">${retreatEstimate(years)}</p><p class="panel-note">闭关累计：气血 +${save.retreatBonus.vitality}% · 法宝伤害 +${save.retreatBonus.power}% · 移速 +${save.retreatBonus.speed}%。轮回后清空。</p>`;
}
function weaponAffinity(
  item: Treasure,
  root: SpiritRootId = save.spiritRoot,
  elements: ElementId[] = save.rootElements,
  compact = false,
) {
  const element = elementInfo(item.element);
  const bonus = Math.round(weaponRootBonus(root, elements, item) * 100);
  return `<span class="element-affinity ${bonus ? 'resonant' : ''}" style="--element-color:${element.color}">${element.name}系${bonus ? ` · ${compact ? '' : '灵根加伤 '}+${bonus}%` : compact ? '' : ' · 无灵根加成'}</span>`;
}
function evolutionRecipe(t: Treasure, path: CultivationPath) {
  const partners = evolutionPassives(t, path).map((id) => `${passive(id).name}三重`);
  return `<div class="evolution-recipe"><span>仙器 · ${t.evolution}</span><div>${t.name}六重 ＋ ${partners.length > 1 ? `（${partners.join(' 或 ')}）` : partners[0]}</div></div>`;
}
function showPanel(name: string) {
  panel = name;
  renderPanel();
}
function panelFrame(title: string, subtitle: string, body: string, wide = false) {
  closeNpcChat();
  const existing = modal.querySelector<HTMLElement>('.modal-backdrop > .panel');
  const focused =
    document.activeElement instanceof HTMLElement ? document.activeElement.dataset : {};
  const scroll = existing?.scrollTop ?? 0;
  if (!existing)
    modal.innerHTML =
      '<div class="modal-backdrop"><section role="dialog" aria-modal="true"></section></div>';
  const section = modal.querySelector<HTMLElement>('section')!;
  section.className = `panel ${wide ? 'wide-panel' : ''} ${panel === 'arsenal' || panel === 'guide' || panel === 'bestiary' ? 'tabbed-panel' : ''}`;
  section.setAttribute('aria-label', title);
  section.innerHTML = `<div class="panel-heading"><div><div class="eyebrow">${subtitle}</div><h2>${title}</h2></div><button class="round-button" data-action="close" aria-label="关闭">${smallIcon('close')}</button></div>${body}`;
  if (existing) {
    section.scrollTop = scroll;
    [...section.querySelectorAll<HTMLButtonElement>('button')]
      .find(
        (button) => button.dataset.action === focused.action && button.dataset.id === focused.id,
      )
      ?.focus({ preventScroll: true });
  } else section.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
}
function renderPanel() {
  if (panel === 'arsenal') {
    const visibleTreasures = catalogTreasures.filter(
      (t) => schoolFilter === 'all' || t.school === schoolFilter,
    );
    const t = treasure(selectedTreasure),
      level = save.forge[t.id] || 0,
      cost = forgeCost(level),
      owned = save.artifacts.includes(t.id);
    const detail =
      bookTab === 'treasures'
        ? `<div class="treasure-detail"><div class="detail-emblem" style="--item-color:${t.color}">${icon(t.id, t.color)}</div><div class="detail-copy"><span class="item-tag">${pathInfo(t.school).name} · ${t.tag}</span><h3>${t.name}<small>炼器 ${level} / ${MAX_FORGE_LEVEL}</small></h3><p>${t.desc}</p>${weaponAffinity(t)}${evolutionRecipe(t, save.path)}<p>法宝六重与任一配套功法三重齐备后，在局内升级中选择仙器觉醒。这里的重数是局内等级，与永久炼器阶数无关。</p></div><div class="detail-actions"><button class="secondary-button" data-action="equip" ${!owned || save.starter === t.id || !allowsSchool(save.path, t.school) ? 'disabled' : ''}>${!owned ? '需拾取妖王遗宝解锁' : !allowsSchool(save.path, t.school) ? `需选择${pathInfo(t.school).name}或兼修` : save.starter === t.id ? '已设为本命法宝' : '设为本命法宝'}</button><button class="primary-button compact" data-action="forge" data-cost-stones="${cost.stones}" data-cost-iron="${cost.iron}" ${!owned || level >= MAX_FORGE_LEVEL ? 'disabled' : ''}>${!owned ? '尚未收藏 · 可局内领悟' : level >= MAX_FORGE_LEVEL ? '炼器圆满' : `炼器 · ${cost.iron} 玄铁 + ${cost.stones} 灵石`}</button><small>炼器伤害 +${Math.round(forgeDamageBonus(level) * 100)}%${level < MAX_FORGE_LEVEL ? ` · 下一阶 +${Math.round(forgeDamageBonus(level + 1) * 100)}%（较当前提升 ${(((1 + forgeDamageBonus(level + 1)) / (1 + forgeDamageBonus(level)) - 1) * 100).toFixed(1)}%）` : ' · 十阶圆满'}</small></div></div>`
        : '<p class="panel-note">正道与魔道各 8 种功法，纯修仅出现本流派功法，兼修可自由混搭。每局最多修炼 4 种，每种可升至五重。将对应功法修至三重，可使六重法宝进化为仙器。</p>';
    panelFrame(
      '万般法宝，皆可入道',
      '藏器阁 / ARTIFACT COLLECTION',
      `${artifactLoot()}<p class="panel-note">已收藏 ${save.artifacts.length} / ${TREASURES.length} 件 · 妖王必掉 3 件未拥有法宝，拾取后可设本命与炼器。</p><div class="panel-toolbar"><div class="book-tabs"><button data-action="book-tab" data-id="treasures" class="${bookTab === 'treasures' ? 'active' : ''}">法宝 <b>${TREASURES.length}</b></button><button data-action="book-tab" data-id="passives" class="${bookTab === 'passives' ? 'active' : ''}">功法 <b>${PASSIVES.length}</b></button></div><div class="header-right">${currency()}</div></div><div class="guide-tabs" role="group" aria-label="物品流派筛选">${[{ id: 'all', name: '全部流派' }, ...CULTIVATION_PATHS.filter((p) => p.id !== 'dual')].map((p) => `<button data-action="school-filter" data-id="${p.id}" class="${schoolFilter === p.id ? 'active' : ''}" aria-pressed="${schoolFilter === p.id}">${p.name}</button>`).join('')}</div>${
        bookTab === 'treasures'
          ? `<div class="guide-tabs collection-pages" role="group" aria-label="法宝分页">${Array.from(
              { length: Math.ceil(visibleTreasures.length / 12) },
              (_, page) => page,
            )
              .map(
                (page) =>
                  `<button data-action="treasure-page" data-id="${page}" aria-pressed="${treasurePage === page}" class="${treasurePage === page ? 'active' : ''}">${page * 12 + 1}–${Math.min(visibleTreasures.length, page * 12 + 12)} / ${visibleTreasures.length}</button>`,
              )
              .join('')}</div>`
          : ''
      }<div class="collection-grid ${bookTab === 'treasures' ? 'treasure-grid' : ''}">${
        bookTab === 'treasures'
          ? visibleTreasures
              .slice(treasurePage * 12, treasurePage * 12 + 12)
              .map(
                (t) =>
                  `<button class="collection-card ${selectedTreasure === t.id ? 'selected' : ''}" data-action="treasure" data-id="${t.id}" style="--item-color:${t.color}">${icon(t.id, t.color)}<div><strong>${t.name}</strong><small>${pathInfo(t.school).name} · ${save.artifacts.includes(t.id) ? '已收藏' : '待收集'}</small>${weaponAffinity(t, save.spiritRoot, save.rootElements, true)}${evolutionRecipe(t, save.path)}</div>${save.starter === t.id ? '<span class="equipped-label">本命</span>' : ''}<span class="forge-dots">炼器 ${save.forge[t.id] || 0} / ${MAX_FORGE_LEVEL}</span></button>`,
              )
              .join('')
          : PASSIVES.filter((p) => schoolFilter === 'all' || p.school === schoolFilter)
              .map(
                (p) =>
                  `<article class="passive-card">${icon(p.id, p.color)}<h3>${p.name}</h3><span class="school-label" style="color:${pathInfo(p.school).color}">${pathInfo(p.school).name} · 每重效果</span><p>${p.desc}</p><small>${masteryDescription(save, p.id)}</small><small>共鸣：${
                    TREASURES.filter((t) => evolutionPassives(t).includes(p.id))
                      .map((t) => t.name)
                      .join('、') || '提升所有法宝'
                  }</small></article>`,
              )
              .join('')
      }</div>${detail}<p class="panel-note">当前路线：${pathInfo(save.path).name}。纯修只领悟本流派法宝和功法，兼修可混搭。出发携带 1 件本命法宝，局内最多 6 件。精英宝匣可直接提升法宝重数，拾取妖王遗宝后可设本命与永久炼器；未收藏法宝仍可在局内领悟。</p>`,
      true,
    );
  } else if (panel === 'cultivation') {
    const r = realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE));
    const bonus = realmBonuses(r.step);
    panelFrame(
      '积一寸修为，近一寸长生',
      '洞府 / CULTIVATION',
      `<div class="cultivation-overview"><div class="realm-circle"><small>当前境界</small><strong>${r.ascending ? '渡劫' : REALMS[r.index]}</strong><span>${r.max ? '长生久视' : r.ascending ? '待破七境' : ['初期', '中期', '后期'][r.step % 3]}</span></div><div class="cultivation-progress"><h3>${r.name}<span>累计修为 ${save.cultivation}</span></h3><div class="thin-bar"><i style="width:${r.max ? 100 : Math.min(100, (r.progress / r.needed) * 100)}%"></i></div><p>${r.max ? '真仙 · 长生久视，仙途无尽。' : r.ascending ? '修为已达标，正待渡劫。通关第七境「万劫归墟」后成就真仙，获得 +200 基础气血，法宝最终伤害翻倍；无需再刷一轮修为。' : r.locked ? `成仙瓶颈：须通关第七境「万劫归墟」。已积攒 ${r.progress} / ${r.needed} 修为，超额保留。` : `距下一境界还需 ${Math.max(0, r.needed - r.progress)} 修为，斩妖、升级实时积累，满额立即突破。`}</p><small>当前境界加成：基础气血 +${bonus.hp}，基础伤害加成 +${Math.round(bonus.damage * 1000) / 10}%${r.max ? '；真仙最终伤害另乘 2' : ''}<br>小阶段 +3 基础气血 / +2.5% 基础伤害加成；大境界增量逐步提高，详见修行指南。成就真仙另增 200 基础气血，同配置最终伤害翻倍。</small></div></div>${spiritRootSummary()}${lifespanSummary()}<div class="realm-road">${REALMS.map((name, i) => `<div class="${i === r.index ? 'current' : i < r.index ? 'passed' : ''}"><span>${['一', '二', '三', '四', '五', '六', '七', '八', '九'][i]}</span><strong>${r.ascending && i === r.index ? '渡劫' : name}</strong></div>`).join('')}</div><div class="section-heading"><h3>修习根基</h3><div class="header-right">${currency()}</div></div><div class="training-grid">${(
        [
          {
            id: 'vitality',
            name: '淬体',
            icon: 'guard',
            desc: '每阶气血上限 +10',
            detail: '筋骨如玉，百劫不摧',
          },
          {
            id: 'power',
            name: '悟道',
            icon: 'power',
            desc: `每阶独立增伤 +${spiritRootInfo(save.spiritRoot).powerPerLevel}%`,
            detail: `${spiritRootInfo(save.spiritRoot).name} · 当前增伤 +${Number((save.training.power * spiritRootInfo(save.spiritRoot).powerPerLevel).toFixed(1))}%`,
          },
          {
            id: 'speed',
            name: '身法',
            icon: 'haste',
            desc: '每阶移动速度 +2%',
            detail: '身随风起，踏雪无痕',
          },
        ] as const
      )
        .map(
          (t) =>
            `<article class="training-card">${icon(t.icon, '#cfcb9c')}<h3>${t.name}<small>${save.training[t.id]} / 20 阶</small></h3><p>${t.detail}</p><strong>${t.desc}</strong><button class="secondary-button" data-action="train" data-id="${t.id}" data-cost-stones="${trainingCost(save.training[t.id])}" ${save.training[t.id] >= 20 || lifespanInfo(save).remaining <= trainingYears(save) + 1e-9 ? 'disabled' : ''}>${save.training[t.id] >= 20 ? '修习圆满' : lifespanInfo(save).remaining <= trainingYears(save) + 1e-9 ? '寿元不足' : `修炼 · ${trainingCost(save.training[t.id])} 灵石 · ${trainingYears(save)} 年`}</button></article>`,
        )
        .join(
          '',
        )}</div><p class="panel-note">修习根基每阶消耗 ${trainingYears(save)} 年岁（${spiritRootInfo(save.spiritRoot).name}），资质越高修炼越快；寿元不足不扣资源。悟道各阶增伤相加后独立生效，不被境界与功法稀释；前十阶费用保持，后十阶涨幅放缓，单项修满共需 47373 灵石。斩妖与升级的修为实时入账，突破立即生效。通关额外修为、灵石和玄铁在历练结束时结算，失败也有收益。</p>${retreatSection()}<div class="reincarnation-row"><div><h3>存档备份</h3><p>导出 JSON 保存全部进度，可在其他设备或网址导入。</p></div><div class="save-actions"><button class="secondary-button" data-action="export-save">导出存档</button><button class="secondary-button" data-action="import-save">导入存档</button><input id="save-import" type="file" accept=".json,application/json" hidden></div></div>`,
      true,
    );
  } else if (panel === 'chronicle') {
    panelFrame('仙途履历', '岁月留痕 · 此世道果', chronicleContent(save), true);
  } else if (panel === 'bestiary') {
    const behavior: Record<string, string> = {
      chase: '追击 · 保持距离',
      ranged: '远程 · 侧向躲避灵弹',
      dash: '突袭 · 避开冲刺预警',
      tank: '重甲 · 持续输出',
      explode: '自爆 · 离开红圈',
      summon: '召唤 · 优先击杀',
      poison: '毒域 · 避开地面毒圈',
      volley: '散射 · 穿过弹幕间隙',
      nova: '环射 · 保持距离，寻找缺口',
      shield: '护盾 · 亮盾时减伤 55%，暗盾时集中攻击',
    };
    panelFrame(
      '知妖性，方能破万劫',
      '妖物志 / BESTIARY',
      `<p class="panel-note">前六境各有 12 种专属妖物，共 72 种；普通秘境只出现本境妖物。每关分四批加入强敌：前六境按时长 0%、25%、50%、75% 解锁，终关提前到 0:00、0:45、1:30、2:30，后续以新批次为主。第七境「万劫归墟」汇聚历境精英，六位妖王与九天执劫仙尊依次登场；全部击败才能通关并解除成仙瓶颈。</p><div class="guide-tabs bestiary-tabs" role="group" aria-label="秘境妖物池">${[{ name: '全部', id: -1 }, ...STAGES.map((stage, id) => ({ name: stage.name, id }))].map((stage) => `<button data-action="bestiary-stage" data-id="${stage.id}" class="${bestiaryStage === stage.id ? 'active' : ''}" aria-pressed="${bestiaryStage === stage.id}">${stage.name}</button>`).join('')}</div><div class="bestiary-grid">${ENEMIES.filter(
        (_, index) => bestiaryStage < 0 || STAGE_ENEMIES[bestiaryStage].includes(index),
      )
        .map(
          (e) =>
            `<article class="enemy-card"><span class="sprite-thumb ${e.sprite >= 8 ? 'extra-sprite' : ''}" style="${spriteStyle(e.sprite)}"></span><div><h3>${e.name}</h3><p>${behavior[e.behavior]}</p><small>${bestiaryStage === FINAL_TRIAL_STAGE ? '终关以精英形态出现 · ' : ''}基础气血 ${e.hp} · 伤害 ${e.damage}</small></div></article>`,
        )
        .join(
          '',
        )}</div><h3 class="guide-subheading">历境妖王与执劫仙尊</h3><div class="bestiary-grid">${STAGES.filter(
        (_, index) =>
          bestiaryStage < 0 ||
          (bestiaryStage === FINAL_TRIAL_STAGE && TRIAL_BOSS_STAGES.includes(index)) ||
          index === bestiaryStage,
      )
        .map(
          (stage) =>
            `<article class="enemy-card"><span class="sprite-thumb" style="${spriteStyle(stage.sprite)}"></span><div><h3>${stage.boss}</h3><p>${bestiaryStage === FINAL_TRIAL_STAGE ? `第 ${TRIAL_BOSS_STAGES.indexOf(STAGES.indexOf(stage)) + 1} 劫 · 最早 ${formatTime(TRIAL_BOSS_TIMES[TRIAL_BOSS_STAGES.indexOf(STAGES.indexOf(stage))])} 后现身` : `${stage.name} · ${stage.minutes} 分钟后现身`}</p><small>${stage.skills.join(' · ')}<br>半血后攻势加快</small></div></article>`,
        )
        .join(
          '',
        )}</div><div class="boss-note">${smallIcon('book')} 前六位首领各有三招，最终仙尊有六招交替施放，半血后攻势加快。冲刺与落地法阵有预警，及时横移；召唤物优先清理。终关第二批阶段开始追击精英追加冲刺，远程怪后期施法更快。</div>`,
      true,
    );
  } else if (panel === 'guide') {
    panelFrame(
      '修行指南',
      '道法有迹 / THE CULTIVATOR’S HANDBOOK',
      `<div class="guide-tabs" role="group" aria-label="说明分类">${GUIDE_TABS.map((t) => `<button data-action="guide-tab" data-id="${t.id}" class="${guideTab === t.id ? 'active' : ''}" aria-pressed="${guideTab === t.id}">${t.title}</button>`).join('')}</div>${guideContent(guideTab)}<button class="primary-button guide-close" data-action="close">${game ? '返回暂停界面' : '道心已明'} ${smallIcon('arrow')}</button>`,
    );
  }
}
function renderHud() {
  if (!game) return;
  document.body.classList.remove('immortal-home');
  lastLoadout = '';
  document.body.classList.add('in-game');
  ui.innerHTML = `<div class="game-hud"><div class="player-panel"><div class="player-heading"><span id="realm-name">${realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).name}</span><b id="level" title="局内等级：收集灵气升级，选择法宝与功法">LV. 1</b></div><div class="health-label"><span>气血</span><span id="health-text">100 / 100</span></div><div class="health-bar"><i id="health-fill"></i></div><div class="cultivation-label"><span id="cultivation-text"></span><span>实时修为</span></div><div id="lifespan-text" class="lifespan-hud"></div></div><div class="stage-timer"><div>${game.encounterName} · ${pathInfo(game.path).name}<i>·</i>${DIFFICULTIES[game.difficulty].name}</div><strong id="time">00:00</strong><span> / ${game.tribulation ? '渡劫中' : formatTime(STAGES[game.stage].minutes * 60)}</span><small id="wave-label">初入秘境 · 稳固道心</small></div><div class="combat-actions"><span class="kill-counter">斩妖 <b id="kills">0</b></span>${controls(true)}</div></div><div id="boss-bar" class="boss-bar" hidden><div><span>${STAGES[game.stage].boss}</span><small>妖王</small></div><div class="health-bar"><i></i></div></div><div id="notice" class="battle-notice"></div><div class="battle-bottom"><div class="battle-controls"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / 方向键</span><small>触屏拖动 · 自动施法</small></div><div class="equipped-slots" id="equipped-slots"></div><div class="battle-objective"><span id="xp-text">灵气 0 / 20</span><small>${game.tribulation ? '避开劫雷 · 反击核心' : game.isFinalTrial ? '全员精英 · 决战仙尊' : '存活历练 · 斩灭妖王'}</small></div></div><div class="passive-slots" id="passive-slots"></div><div class="xp-track"><i id="xp-fill"></i></div>`;
  updateHud();
}
let lastLoadout = '';
function updateHud() {
  if (!game) return;
  const set = (id: string, text: string) => {
    const el = document.getElementById(id);
    if (el && el.textContent !== text) el.textContent = text;
  };
  const realm = realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE));
  set('realm-name', realm.name);
  set(
    'cultivation-text',
    realm.max
      ? '真仙 · 长生久视'
      : realm.ascending
        ? '渡劫待成仙 · 需通关第七境'
        : realm.locked
          ? '成仙瓶颈 · 积攒修为并通关第七境'
          : `${realm.progress} / ${realm.needed}`,
  );
  set('level', `LV. ${game.level}`);
  const life = lifespanInfo(save);
  set(
    'lifespan-text',
    `年岁 ${life.age.toFixed(1)} / ${Number.isFinite(life.limit) ? life.limit : '∞'} · ${game.tribulation ? '渡劫暂停计龄' : `${STAGE_YEARS_PER_MINUTE[game.stage]}年/分`}`,
  );
  document
    .getElementById('lifespan-text')
    ?.classList.toggle(
      'urgent',
      life.remaining <= life.limit * 0.15 && Number.isFinite(life.limit),
    );
  set('health-text', `${Math.ceil(game.player.hp)} / ${game.player.maxHp}`);
  document.querySelector<HTMLElement>('#health-fill')!.style.width =
    `${Math.max(0, game.player.hp / game.player.maxHp) * 100}%`;
  set('kills', `${game.kills}`);
  set('time', formatTime(game.time));
  const maxLevel = game.level >= MAX_RUN_LEVEL;
  set(
    'xp-text',
    game.tribulation
      ? '走位渡劫 · 不掉落灵气'
      : maxLevel
        ? `已满级 · LV. ${MAX_RUN_LEVEL}`
        : `灵气 ${Math.floor(game.xp)} / ${xpNeeded(game.level)}`,
  );
  document.querySelector<HTMLElement>('#xp-fill')!.style.width =
    `${maxLevel ? 100 : Math.min(100, (game.xp / xpNeeded(game.level)) * 100)}%`;
  set(
    'wave-label',
    game.tribulation
      ? game.tribulationVulnerable
        ? '核心显露 · 集中输出'
        : '劫雷蓄势 · 留意预警'
      : game.isFinalTrial
        ? `七劫试炼 · 已破 ${game.trialBossesDefeated} / 7 劫 · 妖潮 ${enemyWave(game.stage, game.time) + 1} / 4`
        : game.bossSpawned
          ? '妖王现身 · 决战之时'
          : [
              '初入秘境 · 稳固道心',
              '第二批妖物 · 突袭来袭',
              '第三批妖物 · 强敌压境',
              '最后一批 · 妖潮汹涌',
            ][enemyWave(game.stage, game.time)],
  );
  const notice = document.getElementById('notice')!;
  notice.textContent = game.noticeTime > 0 ? game.notice : '';
  notice.classList.toggle('visible', game.noticeTime > 0);
  const aliveBosses = game.enemies.filter((e) => e.boss && !e.dead);
  const bossBar = document.querySelector<HTMLElement>('#boss-bar')!;
  bossBar.hidden = !game.boss;
  if (game.boss) {
    bossBar.querySelector<HTMLElement>('span')!.textContent =
      (game.tribulation
        ? `天劫 · 第 ${game.tribulation} 劫`
        : STAGES[game.boss.bossStage ?? game.stage].boss) +
      (aliveBosses.length > 1 ? ` · 同场 ${aliveBosses.length} 位妖王` : '');
    bossBar.querySelector<HTMLElement>('i')!.style.width =
      `${(game.boss.hp / game.boss.maxHp) * 100}%`;
  }
  const loadout = JSON.stringify([
    game.weapons.map((w) => [w.id, w.level, w.evolved]),
    game.passives,
  ]);
  if (loadout !== lastLoadout) {
    lastLoadout = loadout;
    document.getElementById('equipped-slots')!.innerHTML = Array.from({ length: 6 }, (_, i) => {
      const w = game!.weapons[i];
      if (!w)
        return '<div class="equipped-slot empty"><span>＋</span><small>待悟法宝</small></div>';
      const t = treasure(w.id);
      return `<div class="equipped-slot ${w.evolved ? 'evolved' : ''}" title="${t.desc}">${icon(t.id, t.color)}<div><strong>${w.evolved ? t.evolution : t.name}</strong><span>${w.evolved ? '仙器 · 觉醒' : `${['', '一', '二', '三', '四', '五', '六'][w.level]}重`}<i>${'·'.repeat(w.level)}</i></span></div></div>`;
    }).join('');
    document.getElementById('passive-slots')!.innerHTML = Object.entries(game.passives)
      .map(
        ([id, level]) =>
          `<span title="${passive(id).desc}">${icon(id, passive(id).color)}${passive(id).name}<b>${level}</b></span>`,
      )
      .join('');
  }
}
function renderChoices() {
  if (!game) return;
  modal.innerHTML = `<div class="modal-backdrop upgrade-backdrop"><section class="upgrade-panel" role="dialog" aria-modal="true" aria-label="局内升级，选择一项机缘"><div class="upgrade-heading"><span class="eyebrow">灵气充盈 · 道法自成</span><h2>顿悟新机缘</h2><p>局内等级 <b>${game.level}</b> <span>·</span> 选择一项，续写你的修行之路</p></div><div class="choice-grid">${game.choices.map((c, i) => choiceCard(c, i)).join('')}</div><div class="upgrade-footer"><span>法宝 ${game.weapons.length} / 6 <i>·</i> 功法 ${Object.keys(game.passives).length} / 4</span><button class="secondary-button" data-action="reroll" ${game.rerolls === 0 ? 'disabled' : ''}>${smallIcon('refresh')}重悟机缘 <span>${game.rerolls} / 3</span></button>${autoplayButton()}<small>${save.autoplay ? 'AI 正在挑选适合当前搭配的机缘…' : '按 1 / 2 / 3 选择'}</small></div></section></div>`;
  modal.querySelector<HTMLButtonElement>('.choice-card')?.focus();
}
function choiceCard(c: Choice, i: number) {
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
  return `<button class="choice-card ${c.type === 'evolve' ? 'evolution-choice' : ''}" data-action="choose" data-id="${i}" style="--item-color:${item.color}"><div class="choice-top"><span>${tag}</span><kbd>${i + 1}</kbd></div><div class="choice-art">${icon(item.id, item.color)}</div><h3>${c.type === 'evolve' ? treasure(c.id).evolution : item.name}</h3><div class="choice-level">${c.type === 'evolve' ? '六重 → 仙器' : c.type === 'heal' ? '固本培元' : c.level === 1 ? '领悟 · 一重' : `${c.level - 1} 重 → ${c.level} 重`}</div><p>${c.type === 'evolve' ? '伤害大幅提升，施法更快，并强化法术形态。' : item.desc}</p>${c.type === 'weapon' || c.type === 'evolve' ? weaponAffinity(treasure(c.id), game!.spiritRoot, game!.rootElements) + evolutionRecipe(treasure(c.id), game!.path) : ''}<div class="choice-benefit">${c.type === 'weapon' ? '配方齐备后，升级可选仙器觉醒' : c.type === 'passive' ? masteryDescription(save, c.id) || '功效按重数叠加' : c.type === 'evolve' ? '仙器之力，尽破妖潮' : '恢复状态，继续修行'}</div><span class="choice-select">领悟此法 ${smallIcon('arrow')}</span></button>`;
}
function renderPause() {
  if (!game) return;
  panelFrame(
    '静心片刻',
    '修行暂歇 / PAUSED',
    `<p class="pause-description">${game.encounterName} · ${pathInfo(game.path).name} · ${formatTime(game.time)} · 已斩 ${game.kills} 妖</p><div class="pause-build">${game.weapons.map((w) => `<span>${icon(w.id, treasure(w.id).color)}${w.evolved ? treasure(w.id).evolution : treasure(w.id).name} · ${w.level}重 ${weaponAffinity(treasure(w.id), game!.spiritRoot, game!.rootElements, true)}</span>`).join('')}</div><p class="panel-note">${game.tribulation ? '放弃本次天劫会强制轮回，清空这一世进度。' : abandonConfirm ? '提前结束将按当前战绩结算收益，本次不会解锁下一秘境。' : '呼吸之间，万念归一。准备好后继续前行。'}</p><div class="pause-actions">${autoplayButton()}<button class="secondary-button" data-action="damage">伤害统计</button><button class="primary-button" data-action="resume">继续修行 ${smallIcon('play')}</button><button class="secondary-button" data-action="abandon">${game.tribulation ? '放弃渡劫 · 轮回' : abandonConfirm ? '确认结束并结算' : '结束本次历练'}</button></div>`,
  );
}
function artifactLoot() {
  if (!save.artifactDrops.length) return '';
  return `<section class="artifact-loot"><h3>妖王遗宝 · 待拾取 ${save.artifactDrops.length} 件</h3><div class="loot-items">${save.artifactDrops.map((id) => `<span>${icon(id, treasure(id).color)}${treasure(id).name}</span>`).join('')}</div><button class="primary-button compact" data-action="claim-artifacts">拾取全部 · 解锁本命与炼器</button><p class="panel-note">遗宝已保存，也可稍后在藏器阁拾取。</p></section>`;
}
function gameEvent(name: string) {
  sound(name);
  if (name === 'loot') {
    if (save.autoplay) {
      const items = claimArtifacts(save);
      if (items.length) toast(`AI 拾取：${items.map((id) => treasure(id).name).join('、')}`);
    }
    persist();
  }
}
function damageReport() {
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
  return `<section class="damage-report" aria-label="本局伤害统计"><div class="damage-heading"><h3>法宝伤害占比</h3><span>总伤害 ${Math.round(total).toLocaleString('zh-CN')}</span></div>${rows
    .map((row) => {
      const percent = total > 0 ? (row.damage / total) * 100 : 0;
      return `<div class="damage-row" style="--damage-color:${row.color}">${row.id ? icon(row.id, row.color) : '<span class="damage-other">✧</span>'}<div class="damage-detail"><div class="damage-label"><strong>${row.name}</strong><span>${Math.round(row.damage).toLocaleString('zh-CN')} <b>${percent.toFixed(1)}%</b></span></div><div class="damage-bar"><i style="width:${percent}%"></i></div></div></div>`;
    })
    .join(
      '',
    )}<p class="panel-note">按实际扣血统计，不含击杀时的溢出伤害；反伤单列。${other > 0.01 ? '旧版对局已造成的伤害无法追溯法宝归属。' : ''}</p></section>`;
}
function finishRun() {
  if (game?.tribulation) {
    if (game.state === 'won') finishTribulation();
    else if (game.state === 'lost') renderTribulationForfeit();
    return;
  }
  if (!game || settled || (game.state !== 'won' && game.state !== 'lost')) return;
  if (game.expired) {
    renderLifespanEnd();
    return;
  }
  clearInterval(adTimer);
  adReadyAt = 0;
  panel = '';
  settled = true;
  rewards = settleRun(save, {
    stage: game.stage,
    difficulty: game.difficulty,
    kills: game.kills,
    time: game.time,
    victory: game.state === 'won',
    iron: game.iron,
    level: game.level,
    creditedCultivation: game.creditedCultivation,
    combatCultivation: game.combatCultivation,
    spiritRoot: game.spiritRoot,
  });
  persist();
  if (game.state === 'won') renderVictory();
  else renderResult();
}
function renderVictory() {
  if (!game || !rewards) return;
  panel = 'victory';
  const final = game.isFinalTrial;
  modal.innerHTML = `<div class="modal-backdrop victory-backdrop ${final ? 'victory-final' : ''}"><section class="victory-scene" role="dialog" aria-modal="true" aria-labelledby="victory-title"><div class="victory-formation" aria-hidden="true">${Array.from({ length: 8 }, (_, i) => `<span class="victory-sword" style="--angle:${i * 45}deg"><i class="victory-blade"></i></span>`).join('')}</div><div class="victory-sparks" aria-hidden="true">${Array.from(
    { length: 24 },
    (_, i) => {
      const angle = (i / 24) * Math.PI * 2;
      const distance = 35 + (i % 4) * 6;
      return `<i style="--x:${Math.cos(angle) * distance}vmin;--y:${Math.sin(angle) * distance}vmin;--delay:${(i % 4) * 90}ms"></i>`;
    },
  ).join(
    '',
  )}</div><div class="victory-copy"><div class="eyebrow">${game.encounterName} · 历练圆满</div><h2 id="victory-title">${final ? '七劫尽破' : '一剑荡妖尘'}</h2><p>${final ? '七境圆满 · 天劫自此消散' : '妖王伏诛 · 此境已破'}</p>${final ? '<div class="victory-trials" aria-label="七劫全部完成">壹 · 贰 · 叁 · 肆 · 伍 · 陆 · 柒</div>' : ''}</div><button class="secondary-button victory-skip" data-action="victory-result">查看通关战绩 ${smallIcon('arrow')}</button></section></div>`;
  modal.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  victoryTimer = window.setTimeout(() => {
    if (panel === 'victory') renderResult();
  }, 3000);
}
function renderDeath() {
  if (!game || game.state !== 'lost' || settled) return;
  if (game.expired) {
    renderLifespanEnd();
    return;
  }
  if (game.revivesUsed >= MAX_REVIVES) {
    finishRun();
    return;
  }
  panel = 'death';
  modal.innerHTML = `<div class="modal-backdrop"><section class="result-panel" role="dialog" aria-modal="true" aria-label="重燃道心"><div class="eyebrow">仙途未尽</div><h2>重燃道心</h2><p>观看广告后原地满血复活，获得 3 秒护体。<br>每局最多复活 ${MAX_REVIVES} 次，法宝、等级和战绩全部保留。${game.tribulation ? '<br>放弃本次天劫将强制轮回，清空这一世进度。' : ''}</p><div class="result-actions death-actions"><button class="primary-button" data-action="watch-ad">看广告复活 · 剩余 ${MAX_REVIVES - game.revivesUsed} 次</button><button class="secondary-button" data-action="finish-run">${game.tribulation ? '放弃渡劫 · 轮回' : '直接结算'}</button></div></section></div>`;
  modal.querySelector<HTMLButtonElement>('button')?.focus();
}
function showReviveAd() {
  if (
    !game ||
    game.state !== 'lost' ||
    game.revivesUsed >= MAX_REVIVES ||
    settled ||
    panel === 'revive-ad'
  )
    return;
  panel = 'revive-ad';
  modal.innerHTML = `<div class="modal-backdrop"><section class="result-panel" role="dialog" aria-modal="true" aria-label="复活广告"><div class="eyebrow">复活机缘</div><div class="revive-ad">广告位招租</div><p>观看结束即可重返秘境。</p><div class="result-actions death-actions"><button class="primary-button" data-action="ad-revive" disabled>5 秒后可复活</button><button class="secondary-button" data-action="finish-run">${game.tribulation ? '放弃渡劫 · 轮回' : '放弃复活并结算'}</button></div></section></div>`;
  startAdCountdown('ad-revive', '满血复活');
}
function startAdCountdown(action: string, label: string) {
  adReadyAt = Date.now() + 5000;
  clearInterval(adTimer);
  adTimer = window.setInterval(() => {
    if (!refreshAdCountdown(action, label)) clearInterval(adTimer);
  }, 200);
}
function refreshAdCountdown(action: string, label: string) {
  const button = modal.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
  if (!button) return 0;
  const seconds = Math.max(0, Math.ceil((adReadyAt - Date.now()) / 1000));
  const incomplete = rewardAd === 'root' && adElements.length !== spiritRootInfo(adRoot).count;
  button.disabled = seconds > 0 || incomplete;
  button.textContent =
    seconds > 0
      ? `${seconds} 秒后${label}`
      : incomplete
        ? '请选满对应数量的五行'
        : `广告已结束 · ${label}`;
  return seconds;
}
function renderRootPicker() {
  const container = modal.querySelector('#root-picker');
  if (!container) return;
  const root = spiritRootInfo(adRoot);
  container.innerHTML = `<div class="root-quality-options" role="group" aria-label="灵根资质">${SPIRIT_ROOTS.map((r) => `<button class="secondary-button ${r.id === adRoot ? 'selected' : ''}" data-action="ad-root-quality" data-id="${r.id}" aria-pressed="${r.id === adRoot}">${r.name}${r.count > 1 ? `·${r.count}系` : ''}</button>`).join('')}</div><p>选择 ${root.count} 种五行 · 已选 ${adElements.length} / ${root.count} · 对应法宝伤害 +${root.damageBonus}%<br>灵气与修为 ${Math.round(root.rate * 100)}%，基础气血 ${root.baseHp}，基础回血 ${root.baseRegen.toFixed(2)}/秒，悟道每阶独立增伤 +${root.powerPerLevel}%。<br>基础暴击 ${Math.round(root.baseCrit * 100)}% · 基础移速 ${root.baseSpeed} 地图像素/秒。<br>首位五行决定默认本命。</p><div class="root-element-options" role="group" aria-label="灵根五行">${ELEMENTS.map((e) => `<button class="secondary-button ${adElements.includes(e.id) ? 'selected' : ''}" data-action="ad-root-element" data-id="${e.id}" aria-pressed="${adElements.includes(e.id)}" ${root.count ? '' : 'disabled'}>${e.name}${adElements[0] === e.id ? ' · 首位' : ''}</button>`).join('')}</div><small>入门法宝：${ROOT_STARTERS[adElements[0] ?? 'metal'].map((id) => treasure(id).name).join(' / ')}；领取后设为当前路线本命，已有收藏与炼器保留。</small>`;
}
function rememberRewardReturn() {
  rewardReturnPanel = panel;
  rewardReturnScroll = modal.querySelector('.panel')?.scrollTop ?? 0;
}
function renderSectDues() {
  if (!sectDuesPending(save)) return;
  const dues = save.mortal.member!.dues;
  panel = 'sect-dues';
  modal.innerHTML = `<div class="modal-backdrop"><section class="result-panel" role="dialog" aria-modal="true" aria-label="宗门供奉到期"><div class="eyebrow">仙门供奉</div><h2>供奉到期</h2><p>本期需 ${dues} 灵石，现有 ${save.stones} 灵石。${save.stones < dues ? `<br>还缺 ${dues - save.stones} 灵石，可看广告领取 ${AD_SUPPLIES.stones} 灵石与 ${AD_SUPPLIES.iron} 玄铁。` : '<br>物资已足，可以补缴。'}</p><p class="panel-note">人间计时已暂停，在籍身份与精研保留。一次不足可再次领取；放弃补缴会被清退出宗门。</p><div class="result-actions death-actions">${save.stones < dues ? '<button class="primary-button" data-action="dues-ad">看广告 · 领取物资</button>' : '<button class="primary-button" data-action="dues-pay">补缴供奉 · 继续游历</button>'}<button class="secondary-button" data-action="dues-decline">放弃补缴 · 离开宗门</button></div></section></div>`;
  modal.querySelector<HTMLButtonElement>('button')?.focus();
}
function showSuppliesShortage(stones: number, iron: number) {
  if (game || (save.stones >= stones && save.iron >= iron)) return false;
  rememberRewardReturn();
  const missing = [
    stones > save.stones ? `${stones - save.stones} 灵石` : '',
    iron > save.iron ? `${iron - save.iron} 玄铁` : '',
  ]
    .filter(Boolean)
    .join('、');
  panel = 'supplies-shortage';
  modal.innerHTML = `<div class="modal-backdrop"><section class="result-panel" role="dialog" aria-modal="true" aria-label="物资不足"><div class="eyebrow">修行资粮</div><h2>物资不足</h2><p>本次操作还缺 ${missing}。</p><p class="panel-note">当前持有 ${save.stones} 灵石、${save.iron} 玄铁。<br>可观看 5 秒广告，领取 ${AD_SUPPLIES.stones} 灵石与 ${AD_SUPPLIES.iron} 玄铁。领取后返回原页面，再选择要进行的操作。</p><div class="result-actions death-actions"><button class="primary-button" data-action="watch-supplies-ad">看广告 · 领取物资</button><button class="secondary-button" data-action="cancel-supplies">暂不领取</button></div></section></div>`;
  modal.querySelector<HTMLButtonElement>('[data-action="cancel-supplies"]')?.focus();
  return true;
}
function showRewardAd(kind: 'root' | 'supplies') {
  if (game || rewardAd) return;
  if (panel !== 'supplies-shortage') rememberRewardReturn();
  rewardAd = kind;
  adRoot = 'heaven';
  adElements = rootElementsFor(adRoot, save.rootElements);
  panel = 'reward-ad';
  const reward =
    kind === 'root'
      ? '自选灵根资质与五行，解锁对应入门法宝。后续新历练生效，未完成的历练保留原来的灵根和武器。'
      : `领取 ${AD_SUPPLIES.stones} 灵石与 ${AD_SUPPLIES.iron} 玄铁，可再次观看领取。`;
  modal.innerHTML = `<div class="modal-backdrop"><section class="result-panel ${kind === 'root' ? 'root-ad-panel' : ''}" role="dialog" aria-modal="true" aria-label="仙缘广告"><div class="eyebrow">${kind === 'root' ? '自选灵根' : '仙缘补给'}</div><div class="revive-ad">广告位招租</div><p>${reward}<br>完整观看 5 秒后点击领取，中途离开不发放奖励。</p>${kind === 'root' ? '<div id="root-picker"></div>' : ''}<div class="result-actions death-actions"><button class="primary-button" data-action="claim-ad-reward" disabled>5 秒后领取奖励</button><button class="secondary-button" data-action="cancel-reward-ad">放弃领取</button></div></section></div>`;
  if (kind === 'root') renderRootPicker();
  startAdCountdown('claim-ad-reward', '领取奖励');
  modal
    .querySelector<HTMLButtonElement>('[data-action="cancel-reward-ad"]')
    ?.focus({ preventScroll: true });
}
function closeRewardAd() {
  clearInterval(adTimer);
  adReadyAt = 0;
  rewardAd = null;
  panel = '';
  modal.innerHTML = '';
  if (inMortalWorld) renderMortal();
  else renderLobby();
  if (rewardReturnPanel) {
    if (rewardReturnPanel === 'sect-dues') renderSectDues();
    else if (rewardReturnPanel === 'town-event' && townNpc) showTownEvent(townNpc);
    else showPanel(rewardReturnPanel);
    modal.querySelector('.panel')?.scrollTo(0, rewardReturnScroll);
  }
}
function renderResult() {
  if (!game || !rewards) return;
  window.clearTimeout(victoryTimer);
  panel = '';
  const won = game.state === 'won',
    realm = realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).name;
  modal.innerHTML = `<div class="modal-backdrop"><section class="result-panel ${won && game.isFinalTrial ? 'result-complete' : ''}" role="dialog" aria-modal="true" aria-label="历练结算"><div class="result-seal">${won ? (game.isFinalTrial ? '圆满' : '破境') : '归来'}</div><div class="eyebrow">${game.encounterName} · ${pathInfo(game.path).name} · ${DIFFICULTIES[game.difficulty].name}</div><h2>${won ? (game.isFinalTrial ? '仙途圆满，自在长生' : '一剑荡妖尘') : '仙途漫漫，再行一程'}</h2><p>${won ? (game.isFinalTrial ? '七境已破，周期天劫就此止息。修为达标即可突破真仙，既有修行与劫印长存。' : `妖王已斩，${STAGES[game.stage + 1].name}已解锁。`) : '胜败皆为修行。此行所得，尽归道心。'}</p><div class="result-stats"><div><strong>${formatTime(game.time)}</strong><span>历练时长</span></div><div><strong>${game.kills}</strong><span>斩妖数量</span></div><div><strong>${game.level}</strong><span>局内等级</span></div></div><div class="reward-row"><span>${smallIcon('gem')}<b>+${rewards.stones}</b> 灵石</span><span>◆ <b>+${rewards.iron}</b> 玄铁</span><span>✧ <b>+${rewards.cultivation}</b> 本局修为</span></div><p class="panel-note">修为实时入账 ${rewards.cultivation - rewards.cultivationRemaining} · 本次补发 ${rewards.cultivationRemaining}，合计已计入永久修为。</p><div class="result-realm">${realm !== oldRealm ? `境界突破 · ${oldRealm} → ${realm}` : `当前境界 · ${realm}`}</div>${game.bossCultivation > 0 ? `<p class="boss-reward">妖王突破修为 +${Math.floor(game.bossCultivation).toLocaleString('zh-CN')}<small>已计入本局总修为</small></p>` : ''}${damageReport()}${artifactLoot()}<div class="result-actions"><button class="secondary-button" data-action="return">返回洞府</button><button class="primary-button" data-action="${won && game.stage < STAGES.length - 1 ? 'next' : 'retry'}">${won && game.stage < STAGES.length - 1 ? '前往下一秘境' : '再入仙途'} ${smallIcon('arrow')}</button></div></section></div>`;
  modal.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
}
function ensureScene(stage: number, next: () => void, run?: Game | null, tribulation = false) {
  const extra =
    run?.enemies.map((e) =>
      e.boss ? STAGES[e.bossStage ?? run.stage].sprite : ENEMIES[e.type].sprite,
    ) ?? [];
  const isTribulation = tribulation || !!run?.tribulation;
  const extraImages = save.prologueSeen ? [] : [PROLOGUE_IMAGE];
  if (realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).max)
    extraImages.push('/assets/qinglan-prologue.webp');
  if (renderer.hasScene(stage, isTribulation, extra, extraImages)) return true;
  if (sceneLoading) return false;
  sceneLoading = true;
  const loading = document.createElement('div');
  loading.className = 'scene-loading';
  loading.setAttribute('role', 'dialog');
  loading.setAttribute('aria-label', '场景资源加载');
  loading.setAttribute('aria-modal', 'true');
  loading.innerHTML = `<section><div class="eyebrow">青岚仙途</div><h2>${isTribulation ? '天劫将至' : STAGES[stage].name}</h2><p>正在准备地图、人物与法宝</p><progress max="1" value="0" aria-label="素材加载进度"></progress><p class="load-progress" role="status">0%</p><button class="secondary-button" hidden>重新加载</button></section>`;
  app.append(loading);
  let failed = false;
  renderer
    .prepareScene(
      stage,
      isTribulation,
      extra,
      (done, total) => {
        if (failed) return;
        const progress = loading.querySelector('progress')!;
        progress.max = total;
        progress.value = done;
        loading.querySelector('.load-progress')!.textContent =
          `${Math.round((done / total) * 100)}% · ${done} / ${total} 项资源`;
      },
      extraImages,
    )
    .then(() => {
      loading.remove();
      sceneLoading = false;
      assetsReady = true;
      next();
    })
    .catch(() => {
      failed = true;
      loading.querySelector('.load-progress')!.textContent =
        '素材加载失败，请检查网络后重试。尚未进入场景。';
      const retry = loading.querySelector('button')!;
      retry.hidden = false;
      retry.onclick = () => {
        loading.remove();
        sceneLoading = false;
        ensureScene(stage, next, run, tribulation);
      };
      retry.focus();
    });
  return false;
}
function startRun() {
  if (!assetsReady || selectedStage > save.unlocked) return;
  if (tribulationDue(save)) {
    renderTribulationPending();
    return;
  }
  if (pendingRun) {
    panel = 'restart';
    panelFrame(
      '另启一段仙缘',
      '上次历练尚未结束',
      '<p class="panel-note">新开历练会放弃尚未结算的那一局。已经获得的永久修为、灵石和炼器进度不受影响。</p><div class="pause-actions"><button class="secondary-button" data-action="restore">继续上次历练</button><button class="primary-button" data-action="new-run">放弃旧局并开始</button></div>',
    );
    return;
  }
  if (!ensureScene(selectedStage, startRun)) {
    void mobileDisplay.enter();
    return;
  }
  clearInput();
  panel = '';
  modal.innerHTML = '';
  lastLoadout = '';
  settled = false;
  rewards = null;
  abandonConfirm = false;
  game = new Game(save, selectedStage, difficulty);
  game.onEvent = gameEvent;
  previousState = 'playing';
  oldRealm = realmInfo(
    save.cultivation - game.creditedCultivation,
    save.completed.includes(FINAL_TRIAL_STAGE),
  ).name;
  renderHud();
  void mobileDisplay.enter();
  if (save.sound) unlockAudio();
  persist();
}
function restoreRun() {
  if (!pendingRun || !assetsReady) return;
  if (!ensureScene(pendingRun.stage, restoreRun, pendingRun)) {
    void mobileDisplay.enter();
    return;
  }
  game = pendingRun;
  pendingRun = null;
  settled = false;
  rewards = null;
  abandonConfirm = false;
  selectedStage = game.stage;
  difficulty = game.difficulty;
  game.onEvent = gameEvent;
  clearInput();
  panel = '';
  previousState = game.state;
  oldRealm = realmInfo(
    save.cultivation - game.creditedCultivation,
    save.completed.includes(FINAL_TRIAL_STAGE),
  ).name;
  renderHud();
  void mobileDisplay.enter();
  if (game.state === 'upgrade') renderChoices();
  else if (game.state === 'lost') renderDeath();
  else renderPause();
  if (save.sound) unlockAudio();
  persist();
}
function returnLobby() {
  game = null;
  panel = '';
  modal.innerHTML = '';
  previousState = '';
  clearInput();
  renderLobby();
}
function resetLifetime() {
  const root = rollSpiritRoot();
  clearInterval(adTimer);
  window.clearTimeout(victoryTimer);
  adReadyAt = 0;
  rewardAd = null;
  pendingImport = null;
  clearInput();
  game = null;
  pendingRun = null;
  rewards = null;
  const { sound: soundEnabled, volume, prologueSeen } = save;
  Object.assign(save, freshSave(root, rootElementsFor(root)), {
    sound: soundEnabled,
    volume,
    prologueSeen,
  });
  unlockAudio();
  selectedStage = difficulty = treasurePage = 0;
  selectedTreasure = save.starter;
  schoolFilter = 'all';
  bookTab = 'treasures';
  persist();
  returnLobby();
}
function renderTribulationPending() {
  if (game) {
    game.pause();
    previousState = game.state;
  }
  clearInput();
  panel = 'tribulation-pending';
  panelFrame(
    '天劫将至',
    `第 ${save.tribulations + 1} 次天劫 · 两万年一劫`,
    `<p class="pause-description">当前历练已保存。渡劫场只有一位「天劫」，看清预警、侧移避雷，在核心显露时反击。</p><p class="panel-note">携带当前搭配；无未完成历练时，本命在渡劫场临时觉醒。渡劫期间不计龄、不掉经验或回血宝物。战败可使用本次天劫的 ${MAX_REVIVES} 次广告复活；放弃则强制轮回，清空本世全部进度。</p><p class="boss-reward">渡劫成功：永久气血 +3% · 法宝伤害 +2%<small>劫印按次数累加，轮回清空；胜利后返回原历练。</small></p><div class="save-actions"><button class="primary-button" data-action="tribulation-start" ${assetsReady ? '' : 'disabled'}>${pendingRun?.tribulation ? '继续迎劫' : '迎战天劫'}</button><button class="secondary-button" data-action="tribulation-forfeit">放弃渡劫 · 轮回</button></div>`,
  );
  modal.querySelector('[data-action="close"]')?.remove();
}
function beginTribulation() {
  if (!assetsReady || !tribulationDue(save)) return;
  if (pendingRun?.tribulation) {
    restoreRun();
    return;
  }
  if (!ensureScene(6, beginTribulation, null, true)) {
    void mobileDisplay.enter();
    return;
  }
  const source = game && !settled ? game : pendingRun;
  save.tribulationReturn = source?.snapshot() ?? null;
  game = Game.createTribulation(save, source);
  pendingRun = null;
  settled = false;
  rewards = null;
  abandonConfirm = false;
  panel = '';
  previousState = 'playing';
  modal.innerHTML = '';
  clearInput();
  game.onEvent = gameEvent;
  renderHud();
  void mobileDisplay.enter();
  lastFrame = performance.now();
  persist();
}
function renderTribulationForfeit() {
  if (game) {
    game.pause();
    previousState = game.state;
  }
  clearInput();
  panel = 'tribulation-forfeit';
  panelFrame(
    '弃劫即轮回',
    '确认放弃这一世修行',
    `<p class="pause-description">放弃天劫后，境界、物资、法宝收藏、炼器、根基、劫印和已保存的原历练都会清空，重新随机灵根。</p><p class="panel-note">${game?.tribulation && game.revivesUsed >= MAX_REVIVES ? '本次天劫的广告复活次数已用尽。' : '可以继续迎劫；已阵亡时可看广告复活。'}确认后无法撤销。</p><div class="save-actions"><button class="secondary-button" data-action="cancel-forfeit">继续迎劫</button><button class="primary-button" data-action="confirm-forfeit">确认弃劫 · 轮回转世</button></div>`,
  );
  modal.querySelector('[data-action="close"]')?.remove();
}
function finishTribulation() {
  if (!game?.tribulation || game.state !== 'won') return;
  const report = damageReport();
  if (!completeTribulation(save, game.tribulation)) return;
  const original = save.tribulationReturn;
  save.tribulationReturn = null;
  pendingRun = Game.restore(save, original);
  game = null;
  settled = false;
  clearInput();
  persist();
  renderLobby();
  panel = 'tribulation-won';
  panelFrame(
    '天劫已破',
    `第 ${save.tribulations} 枚劫印 · 大道再进`,
    `<div class="result-seal">渡劫</div><p class="boss-reward">永久气血 +3% · 法宝伤害 +2%<small>累计气血 +${save.tribulations * 3}% · 伤害 +${save.tribulations * 2}% · 下一劫在 ${save.nextTribulationAge.toFixed(1)} 岁</small></p>${report}<button class="primary-button guide-close" data-action="${pendingRun ? 'restore' : 'home'}">${pendingRun ? '返回原历练' : '返回洞府'}</button>`,
  );
}
function endLifetime() {
  const life = lifespanInfo(save);
  const realm = realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).name;
  resetLifetime();
  panel = 'lifetime-ended';
  panelFrame(
    '寿元已尽 · 轮回已启',
    '此世修行已结束',
    `<p class="pause-description">此世止于 ${realm}，享年 ${life.age.toFixed(1)} 年。</p><p class="panel-note">已放弃续命。本世修为、物资、法宝收藏、炼器和未完成历练已清空，新一世从 0 岁、炼气初期开始，并重新随机灵根。</p><p class="pause-description">新生资质：${spiritRootInfo(save.spiritRoot).name}</p><button class="primary-button" data-action="home">开启新一世 ${smallIcon('arrow')}</button>`,
  );
}
function renderLifespanEnd() {
  clearInput();
  panel = 'lifespan-ended';
  const life = lifespanInfo(save);
  panelFrame(
    '寿元已尽',
    '向天借寿，或重入轮回',
    `<p class="pause-description">此世年岁 ${life.age.toFixed(1)} / ${life.limit} 年，修行已暂停。</p><p class="panel-note">完整观看 5 秒广告可增加 ${Math.round(life.base * 0.3)} 年寿元（当前境界基础寿命的 30%），保留全部修行进度。放弃续命将强制轮回，清空本世进度。</p><div class="save-actions"><button class="primary-button" data-action="watch-lifespan-ad">向天再借五百年</button><button class="secondary-button" data-action="end-lifetime">放弃续命 · 轮回转世</button></div>`,
  );
  modal.querySelector('[data-action="close"]')?.remove();
}
function showLifespanAd() {
  const life = lifespanInfo(save);
  if (!Number.isFinite(life.base) || life.remaining > 0 || panel !== 'lifespan-ended') return;
  panel = 'lifespan-ad';
  modal.innerHTML = `<div class="modal-backdrop"><section class="result-panel" role="dialog" aria-modal="true" aria-label="借寿广告"><div class="eyebrow">向天再借五百年</div><div class="revive-ad">广告位招租</div><p>本次增加 ${Math.round(life.base * 0.3)} 年寿元（基础寿命的 30%）。<br>再次寿尽时可再借，年数累加；突破后保留已借寿元。</p><div class="result-actions death-actions"><button class="primary-button" data-action="claim-lifespan" disabled>5 秒后借寿</button><button class="secondary-button" data-action="cancel-lifespan">暂不借寿</button></div></section></div>`;
  startAdCountdown('claim-lifespan', '领取寿元');
}
function clearInput() {
  keys.clear();
  touchInput = { x: 0, y: 0 };
  pointer = null;
  joystick.classList.remove('active');
  if (game) game.input = { x: 0, y: 0 };
}
function handleAction(action: string, id?: string) {
  if (panel === 'prologue') {
    if (action === 'prologue-enter' || action === 'close') {
      save.prologueSeen = true;
      ui.inert = false;
      panel = '';
      modal.innerHTML = '';
      persist();
      ui.querySelector<HTMLButtonElement>('[data-action="start"]')?.focus({ preventScroll: true });
    }
    return;
  }
  if (action === 'fullscreen' && (game || inTown)) {
    void (mobileDisplay.active ? mobileDisplay.leave() : mobileDisplay.enter());
    return;
  }
  if (action === 'revisit' && !game) {
    document.querySelector('.expedition')?.scrollIntoView({ block: 'start' });
    document
      .querySelector<HTMLButtonElement>('.stage-card.selected')
      ?.focus({ preventScroll: true });
    return;
  }
  if (panel === 'tribulation-forfeit') {
    if (action === 'confirm-forfeit') {
      resetLifetime();
      toast('渡劫已弃 · 本世进度已清空，轮回重启');
    } else if (action === 'cancel-forfeit' || action === 'close') {
      if (game?.tribulation) game.state === 'lost' ? renderDeath() : renderPause();
      else renderTribulationPending();
    }
    return;
  }
  if (action === 'tribulation-start' && tribulationDue(save)) {
    beginTribulation();
    return;
  }
  if (action === 'tribulation-forfeit' && tribulationDue(save)) {
    renderTribulationForfeit();
    return;
  }
  if (tribulationDue(save) && !game?.tribulation) {
    renderTribulationPending();
    return;
  }

  if (panel === 'lifespan-ended' && !['watch-lifespan-ad', 'end-lifetime'].includes(action)) return;
  if (
    action === 'end-lifetime' &&
    panel === 'lifespan-ended' &&
    lifespanInfo(save).remaining === 0
  ) {
    endLifetime();
    return;
  }
  if (action === 'watch-lifespan-ad') {
    showLifespanAd();
    return;
  }
  if (panel === 'lifespan-ad' && ['close', 'cancel-lifespan', 'claim-lifespan'].includes(action)) {
    const claim = action === 'claim-lifespan';
    if (claim && (!adReadyAt || Date.now() < adReadyAt)) return;
    const target = game ?? pendingRun;
    const years = claim ? (target ? target.borrowLife() : extendLifespan(save)) : 0;
    clearInterval(adTimer);
    adReadyAt = 0;
    persist();
    if (lifespanInfo(save).remaining === 0) renderLifespanEnd();
    else if (game) {
      panel = '';
      previousState = game.state;
      renderPause();
      updateHud();
    } else {
      panel = '';
      modal.innerHTML = '';
      renderLobby();
    }
    if (years) toast(`向天借寿 · 寿元 +${years} 年`);
    return;
  }
  if (panel === 'sect-dues') {
    if (action === 'dues-ad') showRewardAd('supplies');
    else if (action === 'dues-pay' || action === 'dues-decline') {
      if (!settleSectDues(save, action === 'dues-decline')) return;
      panel = '';
      modal.innerHTML = '';
      persist();
      if (inMortalWorld) syncMortalChange();
      else renderLobby();
      toast(action === 'dues-pay' ? '供奉已补缴，继续游历' : '已离宗，精研成果仍保留');
    }
    return;
  }
  if (action === 'mortal-enter' && !game) {
    if (lifespanInfo(save).remaining === 0) {
      renderLifespanEnd();
      return;
    }
    renderMortal(true);
    persist();
    return;
  }
  if (
    action === 'smith-story' &&
    panel === 'town-event' &&
    inTown &&
    !game &&
    townNpc?.id === 'smith'
  ) {
    if (townScene?.nearbyNpc?.id === 'smith' && chooseSmithStory(save, id ?? '')) {
      persist();
      showTownEvent(townNpc);
      toast(save.mortal.events[0]);
    }
    return;
  }
  if (action.startsWith('town-') && inMortalWorld && !game && !panel) {
    if (action === 'town-enter' && mortalTab === 'town') {
      const previous = save.mortal.scenery;
      const scenery = (save.mortal.scenery = townVisit(previous, save.age));
      const changed = previous && scenery.revision !== previous.revision;
      const memory = changed
        ? `一别 ${Math.floor(save.age - previous.lastVisitAge)} 年，青岚旧铺迁址，故宅成庭。河水依旧，已是另一番人间。`
        : '';
      if (memory) {
        save.mortal.events.unshift(memory);
        save.mortal.events.splice(6);
      }
      persist();
      void mobileDisplay.enter();
      inTown = true;
      lastMortalTick = performance.now();
      renderMortal();
      document.getElementById('town-view')?.focus({ preventScroll: true });
      if (memory) toast(memory);
    } else if (action === 'town-retry' && inTown) {
      renderMortal();
    } else if (action === 'town-exit') {
      leaveTown();
      persist();
      renderMortal();
      document.querySelector<HTMLButtonElement>('[data-action="town-enter"]')?.focus();
    } else if (action === 'town-talk') townScene?.talk();
    return;
  }
  if (
    action.startsWith('mortal-') &&
    inMortalWorld &&
    !game &&
    (!panel || panel === 'town-event')
  ) {
    if (action === 'mortal-tab' && (id === 'town' || id === 'sects')) {
      leaveTown();
      mortalTab = id;
      document.getElementById('mortal-content')!.innerHTML = mortalTabContent(
        save,
        mortalTab,
        mortalFilter,
        pendingRun?.path,
      );
      ui.querySelectorAll<HTMLButtonElement>('[data-action="mortal-tab"]').forEach((button) => {
        const active = button.dataset.id === mortalTab;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
    } else if (action === 'mortal-filter' && ['all', 'orthodox', 'demonic'].includes(id ?? '')) {
      mortalFilter = id!;
      renderMortal();
    } else {
      const changed =
        action === 'mortal-join'
          ? joinSect(save, id ?? '', pendingRun?.path)
          : action === 'mortal-leave'
            ? leaveSect(save)
            : action === 'mortal-activity'
              ? startActivity(save, id ?? '')
              : action === 'mortal-buy'
                ? tradeIron(save, true)
                : action === 'mortal-sell'
                  ? tradeIron(save, false)
                  : false;
      if (changed) {
        const fromTown = panel === 'town-event';
        if (fromTown) {
          closeNpcChat();
          panel = '';
          modal.innerHTML = '';
        }
        if (action === 'mortal-join') {
          selectedTreasure = save.starter;
          treasurePage = Math.floor(catalogTreasures.findIndex((t) => t.id === save.starter) / 12);
        }
        syncMortalChange();
        if (fromTown && action === 'mortal-activity' && id === 'tea') showTeaStory();
        if (fromTown && (action === 'mortal-buy' || action === 'mortal-sell') && townNpc)
          showTownEvent(townNpc);
        if (action === 'mortal-join' || action === 'mortal-leave') toast(save.mortal.events[0]);
      }
    }
    return;
  }
  if (action === 'export-save' && !game) {
    const url = URL.createObjectURL(
      new Blob([exportSave(save, pendingRun)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `青岚仙途存档-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('已导出存档，请保留下载的 JSON 文件');
    return;
  }
  if (action === 'import-save' && !game && panel === 'cultivation') {
    document.querySelector<HTMLInputElement>('#save-import')?.click();
    return;
  }
  if (action === 'confirm-import' && !game && panel === 'import-confirm' && pendingImport) {
    const candidate = pendingImport;
    try {
      localStorage.setItem(
        SAVE_KEY,
        JSON.stringify({ ...candidate.save, activeRun: candidate.run?.snapshot() ?? null }),
      );
    } catch {
      toast('浏览器无法写入存档，当前进度未更改');
      return;
    }
    Object.assign(save, candidate.save);
    pendingRun = candidate.run;
    if (pendingRun) pendingRun.save = save;
    pendingImport = null;
    storageAvailable = true;
    selectedStage = save.unlocked;
    selectedTreasure = save.starter;
    treasurePage = Math.floor(catalogTreasures.findIndex((t) => t.id === save.starter) / 12);
    difficulty = 0;
    schoolFilter = 'all';
    bookTab = 'treasures';
    unlockAudio();
    returnLobby();
    if (lifespanInfo(save).remaining === 0) {
      renderLifespanEnd();
      return;
    }
    if (tribulationDue(save)) {
      renderTribulationPending();
      return;
    }
    toast('存档已导入，修行进度已恢复');
    return;
  }
  if (panel === 'import-confirm' && ['close', 'cultivation', 'home'].includes(action))
    pendingImport = null;
  if (panel === 'reward-ad' && rewardAd === 'root') {
    if (action === 'ad-root-quality' && SPIRIT_ROOTS.some((r) => r.id === id)) {
      adRoot = id as SpiritRootId;
      adElements = rootElementsFor(adRoot, adElements);
      renderRootPicker();
      refreshAdCountdown('claim-ad-reward', '领取奖励');
      return;
    }
    if (action === 'ad-root-element' && ELEMENTS.some((e) => e.id === id)) {
      const element = id as ElementId;
      const count = spiritRootInfo(adRoot).count;
      if (!count) return;
      if (adElements.includes(element)) adElements = adElements.filter((e) => e !== element);
      else {
        if (adElements.length === count) adElements.pop();
        adElements.push(element);
      }
      renderRootPicker();
      refreshAdCountdown('claim-ad-reward', '领取奖励');
      return;
    }
  }
  if (panel === 'supplies-shortage' && ['close', 'cancel-supplies'].includes(action)) {
    closeRewardAd();
    return;
  }
  if (
    action === 'watch-root-ad' ||
    (action === 'watch-supplies-ad' && panel === 'supplies-shortage')
  ) {
    showRewardAd(action === 'watch-root-ad' ? 'root' : 'supplies');
    return;
  }
  if (panel === 'reward-ad' && (action === 'close' || action === 'cancel-reward-ad')) {
    closeRewardAd();
    return;
  }
  if (action === 'claim-ad-reward') {
    if (game || panel !== 'reward-ad' || !rewardAd || !adReadyAt || Date.now() < adReadyAt) return;
    const kind = rewardAd;
    if (kind === 'root') {
      if (!attuneSpiritRoot(save, adRoot, adElements)) return;
      selectedTreasure = save.starter;
      treasurePage = Math.floor(catalogTreasures.findIndex((t) => t.id === save.starter) / 12);
    } else {
      save.stones += AD_SUPPLIES.stones;
      save.iron += AD_SUPPLIES.iron;
    }
    persist();
    closeRewardAd();
    toast(
      kind === 'root'
        ? `${spiritRootInfo(save.spiritRoot).name}已成 · ${treasure(save.starter).name}为本命 · 下次历练生效`
        : `仙缘补给 · 灵石 +${AD_SUPPLIES.stones} · 玄铁 +${AD_SUPPLIES.iron}`,
    );
    return;
  }
  if (action === 'root-guide') {
    guideTab = 'roots';
    handleAction('guide');
    return;
  }
  if (panel === 'victory' && (action === 'victory-result' || action === 'close')) {
    renderResult();
    return;
  }
  if (action === 'damage' && game && (game.state === 'playing' || game.state === 'paused')) {
    resumeAfterDamage = game.state === 'playing';
    clearInput();
    game.pause();
    previousState = game.state;
    panel = 'damage';
    panelFrame(
      '伤害统计',
      `${game.encounterName} · ${formatTime(game.time)} · 斩妖 ${game.kills}`,
      `${damageReport()}<button class="primary-button guide-close" data-action="close">${resumeAfterDamage ? '继续修行' : '返回暂停界面'} ${smallIcon('arrow')}</button>`,
    );
    persist();
    return;
  }
  if (action === 'watch-ad') {
    showReviveAd();
    return;
  }
  if (action === 'finish-run' && game?.state === 'lost') {
    finishRun();
    return;
  }
  if (action === 'ad-revive') {
    if (panel !== 'revive-ad' || !adReadyAt || Date.now() < adReadyAt || settled || !game?.revive())
      return;
    clearInterval(adTimer);
    adReadyAt = 0;
    clearInput();
    panel = '';
    modal.innerHTML = '';
    previousState = 'playing';
    if (game.state === 'won') {
      finishRun();
      return;
    }
    lastFrame = performance.now();
    updateHud();
    persist();
    return;
  }
  if (action === 'claim-artifacts') {
    const items = claimArtifacts(save);
    persist();
    if (game && settled) renderResult();
    else renderPanel();
    toast(`已收藏 ${items.length} 件法宝`);
    return;
  }
  if (action === 'reincarnate' && !game) {
    panel = 'reincarnate';
    panelFrame(
      '轮回转世',
      '重启仙途',
      '<p class="pause-description">将清空此浏览器在当前网址的全部进度：累计年岁、境界修为、灵石玄铁、关卡、根基、法宝收藏与炼器，以及未完成的历练。</p><p class="panel-note">确认后无法撤销。从炼气初期重新开始，保留青霄剑与追魂钉入门收藏，并解锁新灵根对应的入门法宝，重新随机灵根资质与五行，资质可能低于当前。</p><div class="pause-actions"><button class="secondary-button" data-action="home">保留此世修行</button><button class="primary-button" data-action="confirm-reincarnate">确认轮回 · 清空进度</button></div>',
    );
    return;
  }
  if (action === 'confirm-reincarnate' && panel === 'reincarnate' && !game) {
    resetLifetime();
    toast(
      `轮回已启 · ${spiritRootInfo(save.spiritRoot).name}${save.rootElements.length ? `（${save.rootElements.map((id) => elementInfo(id).name).join('、')}）` : ''} · 炼气初期，从头修行`,
    );
    return;
  }
  if (action === 'autoplay') {
    save.autoplay = !save.autoplay;
    clearInput();
    aiChoiceTime = 0;
    nextAiMove = 0;
    persist();
    if (game) {
      renderHud();
      if (game.state === 'upgrade') renderChoices();
      else if (game.state === 'paused' && panel !== 'guide') renderPause();
    } else renderLobby();
    toast(save.autoplay ? 'AI 代打已开启 · 自动走位与选技' : '已切回手动操作');
    return;
  }
  if (action === 'sound' || action === 'mute') {
    volumeOpen = action === 'sound' && !volumeOpen;
    save.sound = action === 'sound';
    unlockAudio();
    if (save.sound) sound('select');
    persist();
    if (game) renderHud();
    else renderLobby();
    return;
  }
  if (action === 'close') {
    closeNpcChat();
    if (game?.state === 'lost' && !settled) return;
    if (game?.state === 'paused' && panel === 'damage') {
      panel = '';
      if (resumeAfterDamage) {
        game.resume();
        modal.innerHTML = '';
      } else renderPause();
      resumeAfterDamage = false;
    } else if (game?.state === 'paused' && panel === 'guide') {
      panel = '';
      renderPause();
    } else if (game?.state === 'paused') {
      game.resume();
      modal.innerHTML = '';
    } else {
      panel = '';
      modal.innerHTML = '';
    }
    return;
  }
  if (action === 'home') {
    if (!game) {
      panel = '';
      modal.innerHTML = '';
      renderLobby();
    }
    return;
  }
  if (action === 'guide') {
    if (!game || game.state === 'playing' || game.state === 'paused') {
      if (game) {
        clearInput();
        game.pause();
        previousState = 'paused';
        persist();
      }
      showPanel('guide');
    }
    return;
  }
  if (action === 'bestiary-stage') {
    bestiaryStage = Number(id);
    renderPanel();
    modal.querySelector('.panel')?.scrollTo(0, 0);
  }
  if (action === 'guide-tab') {
    guideTab = id!;
    renderPanel();
    modal.querySelector('.panel')?.scrollTo(0, 0);
    return;
  }
  if (
    action === 'cultivation' ||
    action === 'arsenal' ||
    action === 'bestiary' ||
    action === 'chronicle'
  ) {
    if (!game) showPanel(action);
    return;
  }
  if (action === 'stage') {
    if (Number(id) <= save.unlocked) {
      selectedStage = Number(id);
      if (ensureScene(selectedStage, renderLobby)) renderLobby();
    }
  }
  if (action === 'path' && !game && !save.mortal.member && isCultivationPath(id)) {
    save.path = id;
    if (!allowsSchool(id, treasure(save.starter).school)) {
      save.starter = rootStarter(save.rootElements, id);
      selectedTreasure = save.starter;
      treasurePage = Math.floor(catalogTreasures.findIndex((t) => t.id === save.starter) / 12);
      schoolFilter = 'all';
    }
    persist();
    renderLobby();
  }
  if (action === 'treasure-page') {
    treasurePage = Number(id);
    selectedTreasure = catalogTreasures.filter(
      (t) => schoolFilter === 'all' || t.school === schoolFilter,
    )[treasurePage * 12].id;
    renderPanel();
  }
  if (action === 'school-filter') {
    schoolFilter = id!;
    treasurePage = 0;
    selectedTreasure = catalogTreasures.find(
      (t) => schoolFilter === 'all' || t.school === schoolFilter,
    )!.id;
    renderPanel();
    modal.querySelector('.panel')?.scrollTo(0, 0);
  }
  if (action === 'difficulty') {
    difficulty = Number(id);
    renderLobby();
  }
  if (action === 'treasure') {
    selectedTreasure = id!;
    renderPanel();
  }
  if (action === 'book-tab') {
    bookTab = id!;
    renderPanel();
    modal.querySelector('.panel')?.scrollTo(0, 0);
  }
  if (
    action === 'equip' &&
    save.artifacts.includes(selectedTreasure) &&
    allowsSchool(save.path, treasure(selectedTreasure).school)
  ) {
    save.starter = selectedTreasure;
    persist();
    renderLobby();
    renderPanel();
    toast(`已将${treasure(selectedTreasure).name}设为本命法宝`);
  }
  if (action === 'forge' && forge(save, selectedTreasure)) {
    persist();
    renderLobby();
    renderPanel();
    toast(`${treasure(selectedTreasure).name}炼器成功 · 伤害永久提升`);
  }
  if (action === 'retreat' && !game && panel === 'cultivation') {
    const input = document.querySelector<HTMLInputElement>('#retreat-years');
    if (!input || !input.reportValidity()) return;
    const result = retreat(save, Number(input.value));
    if (!result) return;
    if (pendingRun) pendingRun = Game.restore(save, pendingRun.snapshot());
    persist();
    renderLobby();
    if (tribulationDue(save)) {
      renderTribulationPending();
      return;
    }
    const gains = (['vitality', 'power', 'speed'] as const)
      .filter((key) => result.gains[key] > 0)
      .map(
        (key) =>
          `${{ vitality: '气血', power: '法宝伤害', speed: '移速' }[key]} +${result.gains[key]}%`,
      );
    panel = 'retreat-result';
    panelFrame(
      '岁月流转，出关之时',
      '闭关结束',
      `<p class="pause-description">度过 ${Number(result.years.toFixed(1))} 年，未消耗灵石。</p><p class="boss-reward">修为 +${result.cultivation}<small>${result.cultivation ? `相当于闭关前大境界总修为的 ${Number(result.cultivationPercent.toFixed(2))}%` : '本次未积累到 1 点修为'} · ${realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).name}</small><small>${gains.length ? gains.join(' · ') : '此次无额外属性提升'}</small><small>年岁 ${save.age.toFixed(1)} · 收获已保存</small></p><button class="primary-button guide-close" data-action="cultivation">返回洞府</button>`,
    );
    return;
  }
  if (
    action === 'train' &&
    !game &&
    panel === 'cultivation' &&
    train(save, id as 'vitality' | 'power' | 'speed')
  ) {
    if (pendingRun) pendingRun = Game.restore(save, pendingRun.snapshot());
    persist();
    renderLobby();
    renderPanel();
    sound('upgrade');
    if (tribulationDue(save)) renderTribulationPending();
  }
  if (action === 'start' || action === 'retry') startRun();
  if (action === 'restore') restoreRun();
  if (action === 'new-run') {
    pendingRun = null;
    startRun();
  }
  if (action === 'next' && game) {
    selectedStage = Math.min(STAGES.length - 1, game.stage + 1);
    startRun();
  }
  if (action === 'return') returnLobby();
  if (action === 'pause' && game) {
    clearInput();
    panel = '';
    game.pause();
    renderPause();
    persist();
  }
  if (action === 'resume' && game) {
    clearInput();
    panel = '';
    game.resume();
    modal.innerHTML = '';
  }
  if (action === 'abandon' && game) {
    if (game.tribulation) {
      renderTribulationForfeit();
      return;
    }
    if (!abandonConfirm) {
      abandonConfirm = true;
      renderPause();
    } else {
      game.state = 'lost';
    }
  }
  if (action === 'choose' && game?.choose(Number(id))) {
    // 经验可跨多级：下帧再次进入 upgrade 时也必须显示新选项。
    previousState = game.state;
    clearInput();
    modal.innerHTML = '';
    updateHud();
    persist();
  }
  if (action === 'reroll' && game?.reroll()) {
    renderChoices();
    persist();
  }
}
document.addEventListener('click', (event) => {
  if (event.isTrusted && save.sound) unlockAudio();
  if (volumeOpen && !(event.target as Element).closest('.sound-control')) {
    volumeOpen = false;
    document.querySelector('.volume-control')?.remove();
  }
  const target = (event.target as Element).closest<HTMLElement>('[data-action]');
  if (!target || target.hasAttribute('disabled')) return;
  event.preventDefault();
  if (
    (target.dataset.costStones || target.dataset.costIron) &&
    showSuppliesShortage(
      Number(target.dataset.costStones || 0),
      Number(target.dataset.costIron || 0),
    )
  )
    return;
  handleAction(target.dataset.action!, target.dataset.id);
});
document.addEventListener('input', (event) => {
  const retreatInput = event.target as HTMLInputElement;
  if (retreatInput.id === 'retreat-years') {
    const years = Number(retreatInput.value);
    document.getElementById('retreat-estimate')!.textContent = retreatEstimate(years);
    document.querySelector<HTMLButtonElement>('[data-action="retreat"]')!.disabled = !retreatPlan(
      save,
      years,
    );
    return;
  }
  const input = event.target as HTMLInputElement;
  if (!input.matches('input[data-volume]')) return;
  save.volume = Number(input.value) / 100;
  input.parentElement!.querySelector('output')!.textContent = `${input.value}%`;
  unlockAudio();
  persist();
});
document.addEventListener('change', async (event) => {
  const input = event.target as HTMLInputElement;
  if (input.id !== 'save-import' || game || panel !== 'cultivation') return;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    if (file.size > MAX_SAVE_FILE_BYTES) throw new Error('存档文件过大，请选择 10 MB 以内的文件');
    const candidate = importSave(await file.text());
    if (game || panel !== 'cultivation') return;
    pendingImport = candidate;
    const imported = candidate.save;
    const realm = realmInfo(imported.cultivation, imported.completed.includes(FINAL_TRIAL_STAGE));
    panel = 'import-confirm';
    panelFrame(
      '导入修行存档',
      '确认后覆盖当前进度',
      `<p class="pause-description">${realm.name} · 累计修为 ${imported.cultivation.toLocaleString('zh-CN')}<br>${spiritRootInfo(imported.spiritRoot).name} · 年岁 ${imported.age.toFixed(1)}<br>${imported.stones} 灵石 · ${imported.iron} 玄铁<br>收藏法宝 ${imported.artifacts.length} 件 · 已通关 ${imported.completed.length} 境${candidate.run ? `<br>未完成历练：${STAGES[candidate.run.stage].name} · ${formatTime(candidate.run.time)} · LV.${candidate.run.level}` : '<br>无未完成历练'}</p><p class="panel-note">导入会替换此网址的全部进度和续局。可先导出当前存档备份，取消不会更改进度。</p><div class="save-actions"><button class="secondary-button" data-action="export-save">备份当前存档</button><button class="secondary-button" data-action="cultivation">取消导入</button><button class="primary-button" data-action="confirm-import">确认覆盖并导入</button></div>`,
    );
  } catch (error) {
    if (!game && panel === 'cultivation')
      toast(error instanceof Error ? error.message : '存档读取失败，当前进度未更改');
  }
});
document.addEventListener('keydown', (event) => {
  if (event.isTrusted && save.sound && !event.repeat) unlockAudio();
  if ((event.target as HTMLElement).matches('input[type="range"], input[type="number"]')) return;
  if (
    (event.target as HTMLElement).matches('input, textarea') &&
    !['Escape', 'Tab'].includes(event.key)
  )
    return;
  if (event.key === 'Tab' && modal.innerHTML) {
    const elements = [
      ...modal.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
      ),
    ];
    if (!elements.length) return;
    const first = elements[0],
      last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
    return;
  }
  const key = event.key.toLowerCase();
  if (key === 'escape' || key === 'p') {
    if (event.repeat) return;
    if (panel === 'guide' || panel === 'damage') handleAction('close');
    else if (game?.state === 'playing') handleAction('pause');
    else if (game?.state === 'paused') handleAction('resume');
    else if (panel) handleAction('close');
    return;
  }
  if (game?.state === 'upgrade' && ['1', '2', '3'].includes(key)) {
    event.preventDefault();
    handleAction('choose', `${Number(key) - 1}`);
    return;
  }
  if (
    ['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright'].includes(key) &&
    game?.state === 'playing'
  ) {
    event.preventDefault();
    if (save.autoplay) handleAction('autoplay');
    keys.add(key);
  }
});
document.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => {
  lastMortalTick = performance.now();
  if (inMortalWorld) persist();
  clearInput();
  if (!save.autoplay && game?.state === 'playing') handleAction('pause');
});
window.addEventListener('focus', () => {
  lastMortalTick = performance.now();
});
document.addEventListener('visibilitychange', () => {
  lastMortalTick = performance.now();
  if (document.hidden) {
    clearInput();
    if (!save.autoplay && game?.state === 'playing') handleAction('pause');
    if ((game && !settled) || inMortalWorld) persist();
  }
});
const canvas = renderer.canvas;
canvas.addEventListener('pointerdown', (e) => {
  if (game?.state !== 'playing' || pointer !== null) return;
  e.preventDefault();
  if (save.autoplay) handleAction('autoplay');
  pointer = e.pointerId;
  touchOrigin = { x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
  joystick.style.left = `${e.clientX}px`;
  joystick.style.top = `${e.clientY}px`;
  joystick.classList.add('active');
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== pointer) return;
  const dx = e.clientX - touchOrigin.x,
    dy = e.clientY - touchOrigin.y,
    d = Math.hypot(dx, dy),
    factor = d > 45 ? 45 / d : 1;
  touchInput = { x: (dx * factor) / 45, y: (dy * factor) / 45 };
  joystick.querySelector<HTMLElement>('span')!.style.transform =
    `translate(${dx * factor}px, ${dy * factor}px)`;
});
const releasePointer = (e: PointerEvent) => {
  if (e.pointerId !== pointer) return;
  pointer = null;
  touchInput = { x: 0, y: 0 };
  joystick.classList.remove('active');
  joystick.querySelector<HTMLElement>('span')!.style.transform = '';
};
canvas.addEventListener('pointerup', releasePointer);
canvas.addEventListener('pointercancel', releasePointer);
canvas.addEventListener('lostpointercapture', releasePointer);
window.addEventListener('resize', () => {
  clearInput();
  renderer.resize();
  canvasDirty = true;
});
window.addEventListener('pagehide', () => {
  if ((game && !settled) || inMortalWorld) persist();
});
window.setInterval(() => {
  if ((game && !settled) || inMortalWorld) persist();
}, 5000);
let lastBackgroundSave = 0;
let canvasDirty = true;
let lastRenderedState: Game['state'] | undefined;
let lastFrame = performance.now(),
  lastHud = 0,
  previousState = '',
  nextAiMove = 0,
  aiChoiceTime = 0;
function simulate(dt: number, now: number) {
  if (game) {
    if (save.autoplay) {
      if (game.state === 'playing' && now >= nextAiMove) {
        game.input = autoplayInput(game);
        nextAiMove = now + 120;
      }
      if (game.state === 'upgrade') {
        aiChoiceTime += dt;
        if (aiChoiceTime >= 0.9) {
          const choice = autoplayChoice(game);
          if (choice) handleAction(choice.reroll ? 'reroll' : 'choose', `${choice.index}`);
          aiChoiceTime = 0;
        }
      } else aiChoiceTime = 0;
    } else
      game.input = {
        x:
          Number(keys.has('d') || keys.has('arrowright')) -
          Number(keys.has('a') || keys.has('arrowleft')) +
          touchInput.x,
        y:
          Number(keys.has('s') || keys.has('arrowdown')) -
          Number(keys.has('w') || keys.has('arrowup')) +
          touchInput.y,
      };
    const realmBefore = realmInfo(
      save.cultivation,
      save.completed.includes(FINAL_TRIAL_STAGE),
    ).step;
    game.update(dt);
    if (!game.tribulation && tribulationDue(save)) {
      if (panel !== 'tribulation-pending' && panel !== 'tribulation-forfeit') {
        renderTribulationPending();
        persist();
      }
      return;
    }
    if (game.expired) {
      if (previousState !== 'lost') {
        previousState = 'lost';
        renderLifespanEnd();
        persist();
      }
      return;
    }
    if (game.state !== previousState) {
      clearInput();
      previousState = game.state;
      if (game.state === 'upgrade') {
        renderChoices();
        persist();
      }
      if (game.state === 'paused') renderPause();
      if (game.state === 'won' && !settled) finishRun();
      if (!game) return;
      if (game.state === 'lost' && !settled) {
        if (abandonConfirm) finishRun();
        else {
          renderDeath();
          persist();
        }
      }
    }
    if (
      !settled &&
      realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).step !== realmBefore
    )
      persist();
    if (now - lastHud > 100) {
      updateHud();
      lastHud = now;
    }
  }
}
function tick(now: number, draw: boolean) {
  let remaining = Math.max(0, Math.min(2, (now - lastFrame) / 1000));
  lastFrame = now;
  if (save.autoplay) {
    while (remaining > 0) {
      const dt = Math.min(1 / 30, remaining);
      simulate(dt, now - remaining * 1000);
      remaining -= dt;
    }
  } else simulate(Math.min(0.05, remaining), now);
  if (
    draw &&
    !inMortalWorld &&
    (canvasDirty || !game || game.state === 'playing' || game.state !== lastRenderedState)
  ) {
    renderer.draw(
      game,
      now,
      game?.stage ?? selectedStage,
      game ? 0 : realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).index,
    );
    lastRenderedState = game?.state;
    canvasDirty = false;
  }
}
function frame(now: number) {
  townScene?.update(
    now,
    townClockRunning(inTown, !!townScene?.ready, !document.hidden, document.hasFocus(), panel),
  );
  tickMortal(now);
  tick(now, true);
  requestAnimationFrame(frame);
}
const backgroundClock = new Worker(new URL('./background-clock.ts', import.meta.url), {
  type: 'module',
});
backgroundClock.onmessage = () => {
  if (document.hidden && save.autoplay) {
    const now = performance.now();
    tick(now, false);
    if (game && !settled && now - lastBackgroundSave >= 5000) {
      persist();
      lastBackgroundSave = now;
    }
  }
};
renderLobby();
if (lifespanInfo(save).remaining === 0) renderLifespanEnd();
else if (tribulationDue(save)) renderTribulationPending();
persist();
ensureScene(selectedStage, () => {
  if (!game && !inMortalWorld) renderLobby();
  if (panel === 'tribulation-pending') renderTribulationPending();
  renderPrologue();
});
requestAnimationFrame(frame);

// Development-only access for deterministic browser verification; omitted from production.
if (import.meta.env.DEV)
  Object.defineProperty(window, '__qinglan', {
    value: {
      get game() {
        return game;
      },
      get save() {
        return save;
      },
      start: startRun,
      home: returnLobby,
      renderer,
    },
  });
