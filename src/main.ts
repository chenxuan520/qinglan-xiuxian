import { MedicinePanel } from './medicine-panel.ts';
import { catalogPanel } from './catalog-ui.ts';
import { cultivationPanel } from './cultivation-ui.ts';
import { bestiaryPanel } from './bestiary-ui.ts';
import { BattleHud } from './battle-hud.ts';
import { JourneyCardPanel } from './journey-card-panel.ts';
import { PanelHost, type PanelLocation } from './panel-host.ts';
import './medicine.css';
import { medicineEntrance, medicineArt } from './medicine-ui.ts';
import { activeMedicines, medicineInfo } from './medicine-data.ts';

import './styles.ts';
import './battle-hud.css';
import {
  inheritanceContent,
  inheritancePreview,
  birthInheritanceNotice,
  isImmortalSuccessor,
} from './inheritance-ui.ts';
import { recordChronicle } from './chronicle.ts';
import './mortal.css';
import './journey-map.css';
import {
  AD_DURATION_MS,
  AD_SECONDS,
  AD_PLACEHOLDER_HTML,
  getAdProvider,
  watchAdPlacement,
  type AdPlacement,
} from './ads.ts';
import { GAME_VERSION } from './version.ts';
import {
  currency,
  autoplayButton,
  fullscreenButton,
  controls,
  realmVerse,
  completedJourney,
  ROOT_IMPRESSIONS,
  spiritRootDiagram,
  spiritRootEffects,
  spiritRootSummary,
  retreatEstimate,
  weaponAffinity,
  choiceCard,
  damageReport,
  updateStorySoundButton,
  telemetryRow,
  ERROR_NOTICE_ACTIONS,
  ERROR_NOTICE_TEXT,
  ERROR_NOTICE_TITLE,
} from './common-ui.ts';
import { journeyMap, JOURNEY_MAP_IMAGE, JOURNEY_MAP_MOBILE_IMAGE } from './journey-map.ts';
import { chronicleEntrance, chronicleContent } from './chronicle-ui.ts';
import {
  TREASURES,
  CULTIVATION_PATHS,
  pathInfo,
  isCultivationPath,
  allowsSchool,
  STAGES,
  FINAL_TRIAL_STAGE,
  TRIAL_BOSS_TIMES,
  DIFFICULTIES,
  REALMS,
  ENEMIES,
  treasure,
  formatTime,
  MAX_REVIVES,
  spiritRootInfo,
  rollSpiritRoot,
  rootElementsFor,
  elementInfo,
  ELEMENTS,
  SPIRIT_ROOTS,
  ROOT_STARTERS,
  type SpiritRootId,
  type ElementId,
  adSupplies,
  STAGE_YEARS_PER_MINUTE,
} from './data.ts';
import {
  parseSave,
  readSave,
  freshSave,
  applyBirthInheritance,
  resolveInheritance,
  enterImmortalGate,
  SAVE_KEY,
  realmInfo,
  train,
  forge,
  settleRun,
  attuneSpiritRoot,
  alignStarterWithPath,
  lifespanInfo,
  extendLifespan,
  tribulationDue,
  completeTribulation,
  retreatPlan,
  retreat,
  type SaveData,
  type BirthInheritance,
} from './progress.ts';
import { Game } from './game.ts';
import {
  exportSave,
  importSave,
  restoreSavedRun,
  backupUnreadableSave,
  MAX_SAVE_FILE_BYTES,
} from './save-transfer.ts';
import { autoplayChoice, autoplayInput } from './autoplay.ts';
import { Renderer } from './render.ts';
import { icon, smallIcon } from './icons.ts';
import { GUIDE_TABS, guideContent } from './guide.ts';
import { GAME_SITE_URL, SUPPORT_CODE_IMAGE, TELEMETRY_SETTINGS } from './setting.ts';
import { createTelemetry, type TelemetryEvent } from './telemetry.ts';
import { createErrorWatch } from './error-report.ts';
import { assetUrl } from './asset-url.ts';
import { MobileDisplay } from './mobile-display.ts';

import { ScreenAwake } from './screen-awake.ts';
import { FrameRate } from './frame-rate.ts';
import { GameAudio } from './game-audio.ts';
import { SoundSettings } from './sound-settings.ts';
import { runLootContent } from './run-loot-ui.ts';
import { TownScene } from './town-scene.ts';
import { SectMarketScene } from './sect-market-scene.ts';
import {
  debateMarket,
  fulfillMarketRequest,
  chooseMarketOpportunity,
  settleMarketAmbush,
  prepareMarketSocial,
} from './market-social.ts';
import { marketSocialContent } from './market-social-ui.ts';
import { marketFellowCharacter, meetMarketFellow, chooseMarketFellow } from './market-fellow.ts';
import { marketFellowContent } from './market-fellow-ui.ts';
import { MarketAmbushScene } from './market-ambush-scene.ts';
import type { AmbushOutcome } from './market-ambush.ts';
import { marketCultivators } from './sect-market-data.ts';
import {
  prepareAuction,
  auctionBuyReason,
  auctionSellReason,
  buyAuction,
  sellAuction,
} from './auction.ts';
import { auctionContent, auctionResult, type AuctionView } from './auction-ui.ts';
import type { AuctionKind, AuctionItem } from './auction-data.ts';
import { MARKET_START, isMarketCultivatorId, type MarketCultivator } from './sect-market-data.ts';
import {
  sectMarketOpen,
  beginSectMarketVisit,
  exchangeSectMedicine,
  sectMarketExchangeReason,
  sectMarketOffer,
} from './sect-market.ts';
import {
  sectMarketPage,
  sectMarketEventContent,
  sectMarketTradeContent,
} from './sect-market-ui.ts';
import { TOWN_START, HOMETOWN_START, townClockRunning } from './town.ts';
import {
  departHometown,
  acceptHometownRoot,
  hometownParents,
  visitHometown,
  readHometownLetter,
  type ParentId,
} from './hometown.ts';
import { freshTownPopulation, type TownResident } from './town-population.ts';
import { closeNpcChat, mountNpcChat, mountTeaStory, NPC_AI_BASE } from './npc-chat.ts';
import { openOfflinePanel, offlineAction, initOffline } from './offline.ts';
import { settingsContent, settingsSoundNote } from './settings-ui.ts';
import { townVisit, townReturnMemory } from './town-history.ts';
import { visitTownImmortal, meetTownImmortal } from './town-immortal.ts';
import { chooseSmithStory } from './town-story.ts';
import {
  HUMAN_STORIES,
  chooseHumanStory,
  syncHumanStories,
  isHumanStoryId,
  unreadHumanLetterKeys,
} from './human-stories.ts';

import {
  advanceMortal,
  joinSect,
  leaveSect,
  startActivity,
  resolveActivity,
  tradeIron,
  sectDuesPending,
  settleSectDues,
} from './mortal.ts';
import {
  mortalPage,
  mortalStatus,
  townPage,
  townStatus,
  mortalTabContent,
  townEventContent,
  humanStoryContent,
  humanStoryJournal,
  hometownContent,
  hometownLetterContent,
} from './mortal-ui.ts';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `<canvas id="world" aria-label="修仙战斗场景"></canvas><div class="screen-grain"></div><div id="ui"></div><div id="modal-root"></div><div id="joystick"><span></span></div><div id="toast" role="status"></div>`;
const ui = document.querySelector<HTMLDivElement>('#ui')!;
const modal = document.querySelector<HTMLDivElement>('#modal-root')!;
const joystick = document.querySelector<HTMLDivElement>('#joystick')!;
const renderer = new Renderer(document.querySelector<HTMLCanvasElement>('#world')!);
const frameRate = new FrameRate();
let sceneLoading = false;
let storageAvailable = true;
let raw: string | null = null;
try {
  raw = localStorage.getItem(SAVE_KEY);
} catch {
  storageAvailable = false;
}
const saveRead = readSave(raw);
// 读不懂的存档先另存原文，玩家确认前不写入；来自新版本的存档只读不写。
let saveLock: 'unreadable' | 'newer' | 'stale' | null =
  saveRead.status === 'unreadable' || saveRead.status === 'newer' ? saveRead.status : null;
const unreadableBackedUp =
  saveRead.status === 'unreadable' && raw !== null && backupUnreadableSave(localStorage, raw);
let lastSaveText = raw;
const save = saveRead.status === 'unreadable' ? parseSave(null) : saveRead.save;
// 每次进入先静音，保留音量，只有明确开启声音后才播放。
save.sound = false;
if (!save.journeyEnded && !save.pendingReincarnation) resolveActivity(save);
const telemetry = createTelemetry({
  origin: location.origin,
  endpoint: `${NPC_AI_BASE}${TELEMETRY_SETTINGS.path}`,
  version: GAME_VERSION,
  storage: storageAvailable ? localStorage : null,
  send: (url, body) =>
    navigator.sendBeacon?.(url, new Blob([body], { type: 'text/plain;charset=UTF-8' })) ||
    fetch(url, {
      method: 'POST',
      body,
      keepalive: true,
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    }).catch(() => {}),
});
telemetry.track({ type: 'session', fresh: saveRead.status === 'empty', ...lifeStats() });
addEventListener('pagehide', () => telemetry.flush());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') telemetry.flush();
});
// 未捕获错误兜底：摘要去重限频上报，同时提示玩家刷新；提示独立于游戏界面，游戏卡死也能显示。
function showRuntimeErrorNotice() {
  if (document.querySelector('.runtime-error')) return;
  const box = document.createElement('div');
  box.className = 'runtime-error';
  box.setAttribute('role', 'alert');
  box.innerHTML = `${ERROR_NOTICE_TITLE}<p class="runtime-error-text">${ERROR_NOTICE_TEXT}</p>${ERROR_NOTICE_ACTIONS}`;
  box
    .querySelector('[data-error-action="refresh"]')
    ?.addEventListener('click', () => location.reload());
  box.querySelector('[data-error-action="dismiss"]')?.addEventListener('click', () => box.remove());
  document.body.appendChild(box);
}
createErrorWatch({
  target: window,
  track: (event) => {
    telemetry.track(event);
    telemetry.flush();
  },
  onError: showRuntimeErrorNotice,
});
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
  if (saveRead.status !== 'unreadable')
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
let journeyCardReturn: 'chronicle' | 'lifespan-farewell' | 'tribulation-farewell' | 'epilogue' =
  'chronicle';

let inMortalWorld = false;
let mortalFilter = 'all';
let mortalTab: 'town' | 'sects' = 'town';
let inTown = false;
let townScene: TownScene | null = null;
let townPosition = { ...TOWN_START };
let townNpc: TownResident | null = null;
let inMarket = false;
let marketScene: SectMarketScene | null = null;
let ambushScene: MarketAmbushScene | null = null;
let marketPosition = { ...MARKET_START };
let marketNpc: MarketCultivator | null = null;
let auctionView: AuctionView = 'buy';
let auctionKind: AuctionKind = 'medicine';
const shownHumanLetters = new Set<string>();
let lastMortalTick = performance.now();
let nextMortalStatus = 0;
let guideTab = 'basics';

let guideReturn: PanelLocation | null = null;
let treasureReturn: PanelLocation | null = null;
let touchHintDismissed = false;
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
let assetsReady = false;
const gameAudio = new GameAudio(save);
const soundSettings = new SoundSettings(save, gameAudio, persist);
let volumeOpen = false;
let resumeAfterDamage = false;
let adReadyAt = 0;
let adTimer: number | undefined;
// 真实广告 SDK 看完回调置位；占位路径（倒计时走完）仍按 adReadyAt 判定。
let adWatched = false;
let victoryTimer: number | undefined;
let rewardAd: 'root' | 'supplies' | null = null;
let rewardReturn: PanelLocation | null = null;

let adRoot: SpiritRootId = 'heaven';
let adElements: ElementId[] = [];
let pendingImport: ReturnType<typeof importSave> | null = null;
// 只在存档仍是本页上次读写的内容时写入，其他窗口写过后本页停止保存。
function writeSave(data: SaveData, run: Game | null) {
  if (saveLock) throw new Error('存档已停止写入');
  if (localStorage.getItem(SAVE_KEY) !== lastSaveText) {
    lockStaleSave();
    throw new Error('存档已在其他窗口更新');
  }
  const text = JSON.stringify({ ...data, activeRun: run?.snapshot() ?? null });
  localStorage.setItem(SAVE_KEY, text);
  lastSaveText = text;
}
function persist() {
  if (saveLock) return;
  syncHumanStories(save);
  const active = game && !settled ? game : pendingRun;
  try {
    writeSave(save, active);
  } catch {
    if (saveLock) return;
    if (storageAvailable) toast('浏览器暂时无法保存进度，请勿关闭当前页面');
    storageAvailable = false;
  }
}
function lockStaleSave() {
  saveLock = 'stale';
  clearInput();
  game?.pause();
  renderSaveLock();
}
function renderSaveLock() {
  if (!saveLock) return;
  const copy = {
    stale: [
      '此页已停止保存',
      '存档已在其他窗口更新',
      '同一存档刚在另一个窗口或标签页保存了新的进度。为免覆盖那边的修行，此页不再写入存档。',
      '请关闭多余的窗口，或在此页载入最新进度继续。',
      '<button class="primary-button" data-action="save-lock-reload">载入最新进度</button>',
    ],
    newer: [
      '存档来自新版本',
      '此页为旧版本 · 已停止保存',
      '本机存档已由更新版本的游戏保存过。继续在旧版本中游玩可能丢失新版本记录的内容，因此此页不会写入存档。',
      '请刷新页面载入新版本；也可先下载一份存档留底。',
      '<button class="secondary-button" data-action="save-lock-download">下载存档留底</button><button class="primary-button" data-action="save-lock-reload">刷新页面</button>',
    ],
    unreadable: [
      '存档无法读取',
      unreadableBackedUp ? '原始数据已另存' : '原始数据尚未覆盖',
      unreadableBackedUp
        ? '本机存档已损坏或格式无法识别。原始数据已另存在此浏览器中，开始新的一世也不会删除它。'
        : '本机存档已损坏或格式无法识别，且浏览器空间不足，未能另存原始数据。开始新的一世会覆盖它。',
      '建议先下载原始数据留底，便于日后排查或找回。',
      '<button class="secondary-button" data-action="save-lock-download">下载原始数据</button><button class="primary-button" data-action="save-lock-continue">开始新的一世</button>',
    ],
  }[saveLock];
  panel = 'save-lock';
  ui.inert = true;
  panelFrame(
    copy[0],
    copy[1],
    `<div class="save-lock"><p class="pause-description">${copy[2]}</p><p class="panel-note">${copy[3]}</p><div class="save-actions">${copy[4]}</div></div>`,
  );
  modal.querySelector('[data-action="close"]')?.remove();
  modal.querySelector<HTMLButtonElement>('.save-lock .primary-button')?.focus();
}
function downloadJson(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `叩仙门：青岚纪${name}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function toast(text: string, duration = 3200) {
  const el = document.querySelector<HTMLDivElement>('#toast')!;
  el.textContent = text;
  el.classList.add('visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('visible'), duration);
}
let toastTimer = 0;
const panelHost = new PanelHost(modal, ui);
const journeyCardPanel = new JourneyCardPanel(modal, panelFrame);
const mobileDisplay = new MobileDisplay(() => {
  const button = document.querySelector<HTMLButtonElement>('[data-action="fullscreen"]');
  if (!button) return;
  button.textContent = mobileDisplay.active ? '还原' : '全屏';
  button.setAttribute('aria-label', mobileDisplay.active ? '退出全屏' : '进入全屏');
  button.setAttribute('aria-pressed', String(mobileDisplay.active));
});
const battleHud = new BattleHud(ui, save, mobileDisplay);

const medicinePanel = new MedicinePanel(save, modal, {
  show: () => showPanel('medicine'),
  render: renderPanel,
  persist,
  refresh: () => {
    if (inMortalWorld) renderMortal();
    else renderLobby();
    if (panel === 'medicine') renderPanel();
  },
  starterChanged: () => {
    selectedTreasure = save.starter;
  },
  toast,
});

function renderLobby(returnYears?: number) {
  if (ambushScene) return;
  if (save.mortal.marketSocial?.ambush && !ambushScene && !saveLock) {
    const next = structuredClone(save);
    settleMarketAmbush(next, 'escaped');
    try {
      writeSave(next, pendingRun);
    } catch {
      if (!saveLock) {
        panel = 'market-ambush-recovery';
        panelFrame(
          '尚有一场劫修遭遇未结',
          '坊外险路',
          '<p>重新载入按脱身结算，暂扣限额不会重复扣除；浏览器暂时无法保存，请重试后继续。</p><button class="secondary-button" data-action="market-ambush-recover">重试保存脱身结果</button>',
        );
      }
      return;
    }
    Object.assign(save, next);
  }
  if (save.journeyEnded) {
    renderEpilogue();
    return;
  }
  if (resumeHometown()) return;
  leaveTown();
  if (assetsReady && !renderer.hasScene(selectedStage)) {
    ensureScene(selectedStage, () => renderLobby(returnYears));
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
          <div class="hero-features"><span>一世修行，叩问仙门</span></div>
        </div>
        <button class="realm-preview" data-action="cultivation"><span class="vertical-poem">${realmVerse(realm)}</span><span class="realm-circle"><small>当前境界</small><strong>${save.cultivation === 0 ? '凡人' : realm.ascending ? '渡劫' : REALMS[realm.index]}</strong><span>${save.cultivation === 0 ? '尚未入道' : realm.ascending ? '待破七境' : ['初期', '中期', '后期'][realm.step % 3]}</span></span><span class="realm-link">洞府修炼 ${smallIcon('arrow')}</span></button>
      </section>`
      }
      ${spiritRootSummary(save, true)}
      <section class="expedition" aria-label="选择秘境">
        ${pendingRun ? `<div class="resume-banner"><div><span class="status-dot"></span>尚有一段仙缘未了<small>${pendingRun.encounterName} · ${formatTime(pendingRun.time)} · ${pathInfo(pendingRun.path).name} · 局内 ${pendingRun.level} 级</small></div><button class="secondary-button" data-action="restore">继续上次历练 ${smallIcon('arrow')}</button></div>` : ''}
        <div class="journey-selection"><div class="journey-destination" aria-live="polite"><small>第${stage.chapter}境 · ${save.completed.includes(selectedStage) ? '故地重游' : '此行将至'}</small><h3>${stage.name}</h3><p>${stage.description}</p><div class="journey-destination-facts"><span>${selectedStage === FINAL_TRIAL_STAGE ? `仙尊最早 ${formatTime(TRIAL_BOSS_TIMES.at(-1)!)}` : `历练 ${stage.minutes} 分钟`}</span><span>每分钟 ${STAGE_YEARS_PER_MINUTE[selectedStage]} 年</span><span>妖王 · ${stage.boss}</span></div></div><div class="journey-depart"><div class="loadout-preview"><span>本命法宝</span><button data-action="arsenal">${icon(save.starter, treasure(save.starter).color)}${treasure(save.starter).name}${smallIcon('arrow')}</button></div><button class="primary-button embark" data-action="start" ${assetsReady ? '' : 'disabled'}><span>${assetsReady ? (completed ? '再入山河' : '踏入秘境') : '秘境凝聚中…'}</span>${smallIcon('arrow')}</button><small>${pathInfo(save.path).name} · ${DIFFICULTIES[difficulty].name}</small></div></div>
        <div class="path-selection"><span class="field-label">修行之道 · 本局法宝与功法路线</span><div class="path-grid" role="group" aria-label="选择修行路线">${CULTIVATION_PATHS.map((p) => `<button data-action="path" data-id="${p.id}" class="path-card ${save.path === p.id ? 'active' : ''}" aria-pressed="${save.path === p.id}" ${save.mortal.member && p.id !== save.path ? 'disabled' : ''} style="--path-color:${p.color}"><strong>${p.name}</strong><span>${p.desc}</span></button>`).join('')}</div><small>正道、魔道各 18 件法宝与 8 种功法，兼修可混搭。${save.mortal.member ? '宗门在籍：仅可修习本门路线，退宗后解锁其他路线。' : '路线仅影响新历练，续局保留原路线。'}</small></div>
        ${medicineEntrance(save, selectedStage)}
        <div class="depart-row"><div class="difficulty-wrap"><span class="field-label">历练难度</span><div class="difficulty-switch" role="group" aria-label="历练难度">${DIFFICULTIES.map((d, i) => `<button data-action="difficulty" data-id="${i}" class="${i === difficulty ? 'active' : ''}" aria-pressed="${i === difficulty}">${d.name}<small>${i === 0 ? '推荐初修' : `收益 ×${d.reward}`}</small></button>`).join('')}</div></div><button class="journey-map-link" data-action="journey-map">展开山河 · 另择秘境 <span aria-hidden="true">↓</span></button></div>
        ${journeyMap(save, selectedStage, window.matchMedia('(max-width: 640px)').matches)}
      </section>
    </main>
    <footer class="lobby-footer"><span class="control-hint"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>/ 方向键移动</span><i></i><span>自动施法 · 触屏拖动</span></span><button class="lobby-save-status lobby-about${storageAvailable ? '' : ' storage-warning'}" data-action="about">${storageAvailable ? '关于《叩仙门》 · GitHub' : '本机存档不可用 · 关于《叩仙门》'}</button><span class="lobby-footer-links"><button class="prologue-revisit" data-action="prologue-revisit">重温序章</button>${chronicleEntrance(save)}</span></footer>`;
  ui.querySelector('.journey-actions [data-action="arsenal"]')?.remove();
  if (sectDuesPending(save)) renderSectDues();
  else if (returnYears !== undefined && returnYears > 0)
    toast(
      `山中一程，人间已过 ${returnYears < 0.1 ? '不足 0.1' : Number(returnYears.toFixed(1))} 年。`,
      3000,
    );
}

function renderEpilogue() {
  leaveTown();
  inMortalWorld = false;
  game = pendingRun = null;
  clearInput();
  void mobileDisplay.leave();
  document.body.classList.remove('in-game', 'in-mortal', 'journey-complete', 'immortal-home');
  ui.innerHTML = '';
  ui.inert = true;
  panel = 'epilogue';
  modal.innerHTML = `<div class="modal-backdrop prologue-backdrop"><section class="prologue-scene epilogue-scene" role="dialog" aria-modal="true" aria-labelledby="epilogue-title" tabindex="-1"><div class="prologue-controls"><button class="prologue-sound" data-action="epilogue-sound" aria-pressed="${save.sound}">${smallIcon(save.sound ? 'sound' : 'mute')}<span>${save.sound ? '关闭声音' : '开启声音'}</span></button><button class="prologue-skip" data-action="journey-card">留存此世</button></div><div class="prologue-heading"><span class="eyebrow">叩仙门：青岚纪 · 终章</span><h1 id="epilogue-title">云开<span>见长生</span></h1><p>此去长生，亦记人间。</p><span class="prologue-seal">此世圆满</span></div><div class="prologue-story" tabindex="0" aria-label="终章正文"><p>青岚山下，又是一年春水。炊烟漫过新修的青瓦，渡口有人挑起归灯。茶馆里醒木一响，说书人讲起一位从小镇走出的少年——讲到后来，连他的姓名，也渐渐成了传说。</p><p>你立在云海尽头，身后七境归于寂静。曾经惊心的雷声，已远得像一场旧雨。眼前仙门缓缓开启，没有谁问你斩过多少妖、炼成多少法，只见门上浮光如水，映出十五岁那年的衣衫。</p><p>那时行囊很轻，前路很远。你听闻天地间有长生，便以为走得足够远，就能将离别留在身后。直到春秋从指间流过，旧桥几度重修，熟悉的声音一个个散入晚风，才懂得：有些相逢虽只一瞬，也足以陪人走完漫长的一生。</p><p>仙门外的风吹动衣襟，你下意识拢了拢。恍惚间，青岚渡口的旧风，又从岁月深处吹来。</p><p>叩门之前，你曾最后回了一趟青岚。渡口坐着一个十五岁的少年，望着远山，问你外面的天地究竟有多大。你便在他身旁坐下，说起竹海之外的山川、云海尽头的星辰，也说起求道路上的风雪与险恶。末了，你告诉他：山河之外，还有求长生、问大道的路。</p><p>少年听得出神，眼里有一簇你熟悉的光。你忽然想起，许多年前，也有一位过路修士，在这里向你说过同样的话。临别时你替他拢好被风吹开的衣襟，只道：路远，记得添衣。</p><p>一步踏出，仙门在身后合拢。凡间不再有你的归舟，山河却仍循着自己的时序，迎春，送雪。而那个少年，终于背起轻轻的行囊，朝青岚山深处走去。一件随身之物，也能替你陪他一程，将渡口的暖意，带进山河深处。</p><p class="prologue-last">山河未老，故人先秋。<br>幸而此心未改，来路仍明。<br><br>这一程山水，至此落笔。<br>长生已觅，大道无涯。</p></div><footer class="prologue-footer"><span>此界圆满 · 真仙<br>叩门于 ${save.age.toLocaleString('zh-CN', { maximumFractionDigits: 1, useGrouping: false })} 岁</span><button class="primary-button" data-action="epilogue-reincarnate">离界传缘 ${smallIcon('arrow')}</button></footer></section></div>`;
  updateStorySoundButton(
    modal.querySelector<HTMLButtonElement>('[data-action="epilogue-sound"]')!,
    save.sound,
  );
  const scene = modal.querySelector<HTMLElement>('.epilogue-scene')!;
  scene.style.setProperty(
    '--prologue-image',
    `url("${assetUrl('/assets/qinglan-prologue.webp')}")`,
  );
  scene.focus({ preventScroll: true });
}
function renderPrologue(replay = false) {
  if (save.journeyEnded) return;
  if ((!replay && save.prologueSeen) || game || inMortalWorld || panel) return;
  panel = 'prologue';
  ui.inert = true;
  const successor = isImmortalSuccessor(save);
  modal.innerHTML = `<div class="modal-backdrop prologue-backdrop"><section class="prologue-scene" role="dialog" aria-modal="true" aria-labelledby="prologue-title" tabindex="-1"><div class="prologue-controls"><button class="prologue-sound" data-action="prologue-sound" aria-pressed="${save.sound}">${smallIcon(save.sound ? 'sound' : 'mute')}<span>${save.sound ? '关闭声音' : '开启声音'}</span></button><button class="prologue-skip" data-action="${replay ? 'prologue-enter' : 'prologue-skip'}">${replay ? '返回仙途' : '跳过开场'} ${smallIcon('arrow')}</button></div><div class="prologue-heading"><span class="eyebrow">叩仙门：青岚纪 · 序</span><h1 id="prologue-title">${successor ? '少年<span>承缘</span>' : '山河<span>一梦</span>'}</h1><p>${successor ? '前人离界，山河又一程。' : '山河未老，故人先秋。'}</p><span class="prologue-seal" aria-hidden="true">问长生</span></div><div class="prologue-story" tabindex="0" aria-label="序章正文"><p>青岚山下，有一座临水的小镇。清晨炊烟漫过青瓦，暮色里渔火一盏盏亮起。人们在此迎春、送雪，把一生过成几声钟响。</p><p>你便生在这座小镇。儿时听过茶馆的醒木，也曾在渡口等过一盏归灯。镇上的人总说，稻熟一季，人又老了一岁。你渐渐明白，有些告别，来年春天也等不回。</p><p>${successor ? '十五岁那年，渡口的修士临行前告诉你：他已证得长生，将离开此界，而山河之外，还有求长生、问大道的路。' : '十五岁那年，一位过路修士告诉你：山河之外，还有求长生、问大道的路。'}于是你收拾行囊，向青岚山深处走去。你想看看凡人的一生之外，天地究竟还有多远；也想在漫长岁月里，寻得一个不负此生的答案。</p><p>山外却有另一种岁月。传说云海尽头藏着仙门，一炉香可燃尽百年，一柄剑曾照彻长夜。有人得道归来，故园已成荒丘；有人问遍诸天，仍寻不回旧时的一场雨。</p><p>如今灵潮再起，沉寂的秘境次第苏醒。正道山门重开，魔宗旧灯复燃。风从竹海吹来，带着妖雾，也带着无人认领的仙缘。</p><p>你从青岚的烟火中来，以觅长生为愿，以追寻大道为志。此后每一次修行，都是向天地多问一句；而故乡的万家灯火，会在身后一代代明灭，提醒你为何出发。</p><p class="prologue-last">此去青岚，愿你历尽千劫，<br>仍记得为何出发。</p></div><footer class="prologue-footer"><span>一程山水，自此启行。</span><button class="primary-button" data-action="prologue-enter">${replay ? '返回仙途' : '入此山河'} ${smallIcon('arrow')}</button></footer></section></div>`;
  updateStorySoundButton(
    modal.querySelector<HTMLButtonElement>('[data-action="prologue-sound"]')!,
    save.sound,
  );
  modal
    .querySelector<HTMLElement>('.prologue-scene')!
    .style.setProperty('--prologue-image', `url("${assetUrl(PROLOGUE_IMAGE)}")`);
  modal.querySelector<HTMLElement>('.prologue-scene')?.focus({ preventScroll: true });
}
function releaseTownScene() {
  if (marketScene) {
    marketPosition = { ...marketScene.position };
    marketScene.destroy();
    marketScene = null;
  }
  if (!townScene) return;
  townPosition = { ...townScene.position };
  townScene.destroy();
  townScene = null;
}
function leaveTown() {
  closeNpcChat();
  releaseTownScene();
  if (inTown || inMarket) void mobileDisplay.leave();
  document.body.classList.remove('in-town');
  inTown = false;
  inMarket = false;
  marketNpc = null;
  lastMortalTick = performance.now();
}
function mountTownScene() {
  if (inMarket) {
    const marketHost = document.getElementById('sect-market-view');
    if (marketHost)
      marketScene = new SectMarketScene(
        marketHost,
        { ...marketPosition },
        save,
        showMarketEvent,
        showAuction,
      );
    return;
  }
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
    () => save.path,
    save.mortal.scenery,
    save.mortal.hometown
      ? {
          state: save.mortal.hometown,
          interact: (target) => (target === 'dock' ? finishDeparture() : showHometown()),
          ready: () => {
            if (panel !== 'hometown-loading') return;
            if (save.mortal.hometown?.stage === 'farewell') {
              panel = 'hometown-farewell';
              ui.inert = true;
              modal.innerHTML =
                '<section class="hometown-farewell" role="dialog" aria-modal="true" aria-label="家门告别"><p><small>母亲</small>路远，记得添衣。</p><p><small>父亲</small>既选了这条路，便好好走。</p><p><small>母亲</small>有空便回来。</p><button class="primary-button" data-action="hometown-continue">记下叮嘱 · 前往渡口</button></section>';
              modal.querySelector<HTMLButtonElement>('button')?.focus();
            } else {
              panel = '';
              document.getElementById('town-view')?.focus({ preventScroll: true });
            }
          },
        }
      : undefined,
  );
}
function resumeHometown() {
  const home = save.mortal.hometown;
  if (
    !home ||
    home.stage === 'departed' ||
    !save.prologueSeen ||
    save.pendingReincarnation ||
    game ||
    pendingRun ||
    lifespanInfo(save).remaining === 0 ||
    tribulationDue(save)
  )
    return false;
  if (home.stage === 'reveal') {
    if (inTown) {
      leaveTown();
      inMortalWorld = false;
      document.body.classList.remove('in-mortal');
      ui.innerHTML = '';
    }
    renderRootReveal(
      isImmortalSuccessor(save)
        ? '那位修士已离开此界。如今，你是渡口那个十五岁的少年，前路从此由你走。'
        : '十五岁，离乡问道。此世灵根已定，前路自此展开。',
      true,
    );
  } else if (home.stage === 'farewell' && save.hometownSeen) {
    panel = 'hometown-choice';
    ui.inert = true;
    panelFrame(
      isImmortalSuccessor(save) ? '少年将行' : '再别青岚',
      isImmortalSuccessor(save) ? '承缘启程 · 十五岁' : '新一世 · 十五岁',
      `${isImmortalSuccessor(save) ? '<p>渡口的修士已经离界，问道的路留给了你。启程前，可以先向家中亲人告别，也可以径直上路。</p>' : '<p>故居门前，仍有这一世的亲人。你可以再走一程，也可以径直启程。</p>'}<div class="save-actions hometown-choice-actions"><button class="primary-button" data-action="hometown-skip">径直启程</button><button class="secondary-button" data-action="hometown-walk">走一程故乡</button></div>`,
    );
    modal.querySelector('[data-action="close"]')?.remove();
  } else renderDeparture();
  return true;
}
function renderDeparture() {
  closeNpcChat();
  // 同一段离乡行程的素材重试只重建场景，保留玩家当前的全屏状态。
  releaseTownScene();
  inMarket = false;
  inMortalWorld = inTown = true;
  townPosition = { ...HOMETOWN_START };
  save.mortal.population ??= freshTownPopulation(15);
  save.mortal.scenery ??= townVisit(undefined, 15);
  persist();
  panel = 'hometown-loading';
  modal.innerHTML = '';
  ui.inert = false;
  clearInput();
  document.body.classList.remove('in-game', 'journey-complete', 'immortal-home');
  document.body.classList.add('in-mortal', 'in-town');
  ui.innerHTML = townPage(save, fullscreenButton(mobileDisplay.available, mobileDisplay.active));
  mountTownScene();
}
function finishDeparture(skipOpening = false) {
  const next = structuredClone(save);
  if (skipOpening) next.prologueSeen = true;
  if (!departHometown(next)) return;
  try {
    writeSave(next, null);
  } catch {
    if (!saveLock) toast('浏览器暂时无法保存离乡进度，请重试');
    return;
  }
  Object.assign(save, next);
  ui.inert = false;
  panel = '';
  modal.innerHTML = '';
  renderLobby();
  if (!isImmortalSuccessor(save)) toast('十五岁，离乡问道。', 1800);
}
function showHometown(parent?: ParentId) {
  const home = save.mortal.hometown;
  if (
    !home ||
    home.stage !== 'departed' ||
    !inTown ||
    !townScene ||
    Math.hypot(townScene.position.x - HOMETOWN_START.x, townScene.position.y - HOMETOWN_START.y) >
      160
  )
    return;
  const parents = hometownParents(home, save.age);
  if (parent && !parents.some((p) => p.id === parent && p.alive)) return;
  closeNpcChat();
  const content = hometownContent(save, parent);
  if ((parent || parents.every((p) => !p.alive)) && visitHometown(save, parent)) persist();
  panel = 'hometown-home';
  panelFrame(
    parent ? parents.find((p) => p.id === parent)!.name : '故居',
    '青岚镇 · 门前旧路',
    content,
  );
  if (parent)
    mountNpcChat(modal.querySelector<HTMLElement>('.npc-dialogue')!, save, {
      id: parent,
      name: parents.find((p) => p.id === parent)!.name,
      generation: 0,
    });
}
function showTownEvent(npc: TownResident) {
  if (!inTown || townScene?.nearbyNpc?.id !== npc.id) return;
  townNpc = npc;
  panel = 'town-event';
  const visitor = save.mortal.immortal;
  if (visitor?.npcId === npc.id && !save.journeyEnded) {
    closeNpcChat();
    const granted = meetTownImmortal(save, npc.id, npc.name);
    if (granted) persist();
    const medicine = medicineInfo(visitor.medicineId)!;
    const story = granted
      ? '<p>那人混在赶集的人群里，衣衫寻常，正替摊主扶稳一盏旧灯。你停步问路，他却笑着说起千年前的渡口——连那时桥下的一株老柳，也记得清楚。</p><p>街声依旧喧闹，四周灵机却在他抬眼时静了一瞬。你才明白，眼前并非凡人。</p><p>“走得远了，才知人间一碗热茶，也值得回来。”他将一只小瓷瓶放入你掌心，“长生路长，莫只顾赶路。今日相逢，便赠你这一炉余香。”</p><p>再望去，他仍只是街巷里一张平常的面孔。你收好瓷瓶，把这场相逢记在心里。</p>'
      : '<p>你再度向这位前辈问候。他仍坐在街巷间，笑着与你说起人间烟火。这场仙缘已记在心里，此次相遇的丹药也已赠过。</p>';
    panelFrame(
      '市井逢仙',
      `青岚镇 · 与${npc.name}的一席闲谈`,
      `<section class="immortal-gift${granted ? '' : ' is-claimed'}" aria-label="仙人赠药">${medicineArt(medicine)}<div><small>仙人赠药 · ${medicine.years ? '珍品' : '本世珍品'}</small><strong>${granted ? '获赠' : '此前获赠'}：${medicine.name} <span>×1</span></strong><p>${granted ? '已收入丹囊' : '此次仙缘已赠药 · 不重复赠送'} · 现持有 ${save.medicine.bag[medicine.id] || 0} 份</p></div></section><div class="town-story immortal-encounter">${story}</div><button class="primary-button" data-action="close">${granted ? '谢过前辈' : '与前辈作别'} · 继续游历</button>`,
    );
    return;
  }
  const storyId = Object.keys(HUMAN_STORIES).find(
    (id) => isHumanStoryId(id) && HUMAN_STORIES[id].npcId === npc.id,
  );
  const changed = syncHumanStories(save);
  const read = storyId && isHumanStoryId(storyId) && chooseHumanStory(save, storyId, 'read');
  if (changed || read) persist();
  panelFrame(npc.name, `${npc.place} · ${npc.role}`, townEventContent(save, npc));
  mountNpcChat(modal.querySelector<HTMLElement>('.npc-dialogue')!, save, npc);
}
function showMarketEvent(npc: MarketCultivator) {
  if (!inMarket || marketScene?.nearbyNpc?.id !== npc.id) return;
  if (npc.id === 'market-fellow') {
    const next = structuredClone(save);
    if (meetMarketFellow(next)) {
      try {
        writeSave(next, pendingRun);
      } catch {
        if (!saveLock) toast('相逢未能保存，请稍后重新交谈');
        return;
      }
      Object.assign(save, next);
    }
    const fellow = marketFellowCharacter(save);
    if (!fellow) return;
    marketNpc = fellow;
    panel = 'sect-market-event';
    panelFrame(fellow.name, '宗门坊市 · 炉边故人', marketFellowContent(save));
    return;
  }
  marketNpc = npc;
  panel = 'sect-market-event';
  panelFrame(npc.name, '宗门坊市 · 同道往来', sectMarketEventContent(save, npc, !!pendingRun));
  mountNpcChat(modal.querySelector<HTMLElement>('.npc-dialogue')!, save, npc);
}
function refreshMarketTrade(selected?: string) {
  if (!marketNpc || panel !== 'sect-market-event') return;
  const host = modal.querySelector<HTMLElement>('#sect-market-trade');
  if (host) host.innerHTML = sectMarketTradeContent(save, marketNpc, selected);
}
function refreshMarketActivities() {
  if (!marketNpc || panel !== 'sect-market-event') return;
  const host = modal.querySelector<HTMLElement>('#market-social');
  const section = modal.querySelector<HTMLElement>('.panel');
  const scroll = section?.scrollTop ?? 0;
  const opened = host
    ? [...host.querySelectorAll<HTMLDetailsElement>('details')].map((d) => d.open)
    : [];
  if (host) {
    host.innerHTML = marketSocialContent(save, marketNpc, !!pendingRun);
    host
      .querySelectorAll<HTMLDetailsElement>('details')
      .forEach((d, index) => (d.open = opened[index] ?? false));
  }
  if (section) section.scrollTop = scroll;
}
function showMarketAmbush() {
  const a = save.mortal.marketSocial?.ambush;
  if (!a) return;
  closeNpcChat();
  panel = 'market-ambush';
  panelFrame(
    '话中藏刃',
    '坊外 · 劫修伏击',
    `<p class="panel-note">${a.held} 灵石已暂扣，击退后全数取回；败退、离开或刷新仅损失此额，行囊中的法宝和丹药保留。</p><div id="market-ambush"></div>`,
  );
  const npc = marketCultivators(save.mortal.population!, save.mortal.sectMarket!).find(
    (n) => n.id === a.npcId,
  )!;
  ambushScene?.destroy();
  ambushScene = new MarketAmbushScene(
    modal.querySelector<HTMLElement>('#market-ambush')!,
    save,
    npc,
    finishMarketAmbush,
  );
}
function finishMarketAmbush(outcome: AmbushOutcome) {
  ambushScene?.lockOutcome(outcome);
  const next = structuredClone(save);
  const result = settleMarketAmbush(next, outcome);
  if (!result) return;
  try {
    writeSave(next, pendingRun);
  } catch {
    if (!saveLock) {
      const note = modal.querySelector<HTMLElement>('.ambush-result');
      if (note) {
        note.hidden = false;
        note.textContent = '结算暂时无法保存，暂扣记录保留；请重试保存后返回。';
      }
      const button = modal.querySelector<HTMLButtonElement>('[data-action="market-ambush-exit"]');
      if (button) button.textContent = '重试保存结果';
    }
    return;
  }
  Object.assign(save, next);
  ambushScene?.destroy();
  ambushScene = null;
  if (marketNpc) showMarketEvent(marketNpc);
  else {
    panel = '';
    modal.innerHTML = '';
    renderLobby();
  }
  const status = document.getElementById('town-status');
  if (status) status.innerHTML = townStatus(save);
  toast(result.text);
}
function showAuction() {
  if (!inMarket || !marketScene?.nearAuction) return;
  const next = structuredClone(save);
  if (!prepareAuction(next)) return;
  try {
    writeSave(next, pendingRun);
  } catch {
    if (!saveLock) toast('暂时无法保存拍卖进度，请重试');
    return;
  }
  Object.assign(save, next);
  marketNpc = null;
  panel = 'sect-auction';
  auctionView = 'buy';
  auctionKind = 'medicine';
  panelFrame(
    '坊间竞宝',
    '宗门坊市 · 拍卖行',
    `<div id="auction-content">${auctionContent(save, auctionView, !!pendingRun)}</div>`,
  );
}
function refreshAuction(selected = '') {
  const host = modal.querySelector<HTMLElement>('#auction-content');
  if (!host || panel !== 'sect-auction') return;
  const section = modal.querySelector<HTMLElement>('.panel');
  const scroll = section?.scrollTop ?? 0;
  host.innerHTML = auctionContent(save, auctionView, !!pendingRun, auctionKind, selected);
  if (section) section.scrollTop = scroll;
}
function showTeaStory() {
  panel = 'tea-story';
  panelFrame(
    '一盏茶，半卷仙途',
    '听雨茶馆 · 仙途旧闻',
    '<section class="tea-story" aria-label="茶馆说书"><p class="tea-story-status panel-note" role="status">正在生成故事，请稍候…</p><div class="tea-story-text"></div><div class="save-actions"><button class="secondary-button tea-story-play" hidden>朗读故事</button><button class="secondary-button tea-story-stop" hidden disabled>停止朗读</button></div><p class="tea-story-image-status panel-note" role="status"></p><p class="panel-note">本次听书已消耗半载并判定机缘（30% 概率获赠 8 灵石）。失败重试不再扣年岁；再听一回会另耗半载并判定机缘。配图不阻塞正文，阅读与朗读不再计龄。</p><div class="save-actions"><button class="primary-button" data-action="close">回到街巷</button><button class="secondary-button tea-story-next" data-action="mortal-activity" data-id="tea" disabled>再听一回 · 半载</button><button class="secondary-button tea-story-retry" hidden disabled>重试这一回</button></div></section>',
  );
  void mountTeaStory(modal.querySelector<HTMLElement>('.tea-story')!, save, () => {
    soundSettings.enableNarration();
  });
}
function renderMortal(enter = false) {
  if (syncHumanStories(save)) persist();
  if (enter && resolveActivity(save)) {
    if (pendingRun) pendingRun = Game.restore(save, pendingRun.snapshot());
    persist();
  }
  releaseTownScene();
  const scroll = enter ? 0 : ui.scrollTop;
  if (enter) {
    inMortalWorld = true;
    inTown = false;
    inMarket = false;
    mortalTab = 'town';
    lastMortalTick = performance.now();
    panel = '';
    modal.innerHTML = '';
    clearInput();
    void mobileDisplay.leave();
  }
  document.body.classList.remove('in-game', 'journey-complete', 'immortal-home');
  document.body.classList.add('in-mortal');
  document.body.classList.toggle('in-town', inTown || inMarket);
  ui.innerHTML = inMarket
    ? sectMarketPage(save, fullscreenButton(mobileDisplay.available, mobileDisplay.active))
    : inTown
      ? townPage(save, fullscreenButton(mobileDisplay.available, mobileDisplay.active))
      : mortalPage(save, mortalTab, mortalFilter, pendingRun?.path);
  ui.scrollTop = inTown || inMarket ? 0 : scroll;
  mountTownScene();
  if (lifespanInfo(save).remaining === 0) renderLifespanEnd();
  else if (tribulationDue(save)) renderTribulationPending();
  else if (sectDuesPending(save)) renderSectDues();
  else if (enter) {
    const letters = unreadHumanLetterKeys(save);
    if (letters.some((key) => !shownHumanLetters.has(key))) {
      panel = 'human-journal';
      panelFrame(
        '人间缘簿',
        `故人来信 · ${letters.length} 封未读旧信`,
        humanStoryJournal(save, false),
      );
      letters.forEach((key) => shownHumanLetters.add(key));
    }
  }
}
function syncMortalChange() {
  resolveActivity(save);
  if (pendingRun) pendingRun = Game.restore(save, pendingRun.snapshot());
  persist();
  renderMortal();
}
function tickMortal(now: number) {
  if (
    !inMortalWorld ||
    (save.mortal.hometown && save.mortal.hometown.stage !== 'departed') ||
    !townClockRunning(
      inTown || inMarket,
      inMarket ? !!marketScene?.ready : !!townScene?.ready,
      !document.hidden,
      document.hasFocus(),
      panel,
    )
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

function showPanel(name: string) {
  panel = name;
  renderPanel();
}
function rememberPanel(): PanelLocation {
  return panelHost.remember(panel);
}
function restorePanel(location: PanelLocation) {
  panel = location.name;
  panelHost.restore(location, renderPanel);
}
function panelFrame(title: string, subtitle: string, body: string, wide = false) {
  journeyCardPanel.cancel();
  closeNpcChat();
  panelHost.frame(panel, title, subtitle, body, wide);
}
async function renderJourneyCard() {
  if (
    panel === 'chronicle' ||
    panel === 'lifespan-farewell' ||
    panel === 'tribulation-farewell' ||
    panel === 'epilogue'
  )
    journeyCardReturn = panel;
  panel = 'journey-card';
  await journeyCardPanel.show(
    save,
    journeyCardReturn === 'lifespan-farewell'
      ? 'lifespan'
      : journeyCardReturn === 'tribulation-farewell'
        ? 'tribulation'
        : undefined,
  );
}
function renderPanel() {
  if (panel === 'settings') {
    panelFrame('设置', '游戏选项', settingsContent(save));
    void openOfflinePanel();
  } else if (panel === 'about') {
    panelFrame(
      '关于《叩仙门》',
      '独立制作 · 持续更新',
      `<div class="about-copy"><p class="about-lead">《叩仙门：青岚纪》是一款独立制作的 Web 修仙小游戏。三十六法宝 · 七重秘境 · 正魔兼修。</p><div class="about-maker"><span>制作</span><strong>一个想做点自己喜欢的东西的程序员 chenxuan，和一堆 AI 工具。</strong><p>从幸存者玩法出发，慢慢做成了一场关于修行、岁月与故人的仙途。</p></div><p class="panel-note">程序设计、玩法与内容由作者持续迭代；部分开发、美术生成与辅助工作使用 AI 工具完成。项目持续更新中，源码公开于 GitHub。</p><div class="about-meta"><p><span>GitHub</span><a href="https://github.com/chenxuan520/qinglan-xiuxian" target="_blank" rel="noopener noreferrer" tabindex="0">chenxuan520/qinglan-xiuxian</a></p><p><span>官网</span><a href="${GAME_SITE_URL}" target="_blank" rel="noopener noreferrer" tabindex="0">${new URL(GAME_SITE_URL).host}</a></p><p><span>版本</span>${GAME_VERSION}</p><p><span>运行监控</span><a href="${assetUrl('/monitor/')}" target="_blank" rel="noopener noreferrer">公开统计与每日测试</a></p>${telemetryRow(telemetry.enabled(), telemetry.active)}</div><div class="save-actions about-actions"><a class="primary-button" href="https://github.com/chenxuan520/qinglan-xiuxian" target="_blank" rel="noopener noreferrer" tabindex="0">GitHub 源码</a><a class="secondary-button" href="https://github.com/chenxuan520/qinglan-xiuxian/issues" target="_blank" rel="noopener noreferrer" tabindex="0">反馈问题</a></div><div class="about-support"><img src="${assetUrl(SUPPORT_CODE_IMAGE)}" alt="微信赞赏码" width="128" height="128" loading="lazy"><div><strong>请道友喝杯茶</strong><p>这一程山水不收分文。若觉得值得，请作者喝杯茶便好——茶钱不换道具，也不换修为，只换作者多写几段山水。</p><small>微信扫码即可；手机上可先截图，再在「扫一扫」里从相册选取。</small></div></div></div>`,
    );
  } else if (panel === 'medicine') {
    panelFrame(
      '丹香入道',
      '炼丹炉',
      medicinePanel.content(
        selectedStage,
        !!(game || pendingRun),
        inTown && townNpc?.id === 'herbs',
      ),
      true,
    );
  } else if (panel === 'arsenal' || panel === 'treasure-detail') {
    const view = catalogPanel(save, {
      panel,
      catalogTreasures,
      schoolFilter,
      treasurePage,
      selectedTreasure,
      bookTab,
    });
    panelFrame(view.title, view.subtitle, view.body, view.wide);
    if (panel === 'treasure-detail') return;
  } else if (panel === 'cultivation') {
    const view = cultivationPanel(save, selectedStage);
    panelFrame(view.title, view.subtitle, view.body, view.wide);
  } else if (panel === 'chronicle') {
    panelFrame(
      '仙途履历',
      '岁月留痕 · 此世道果',
      chronicleContent(save) +
        '<button class="secondary-button journey-card-entry" data-action="journey-card">留存此世</button>',
      true,
    );
  } else if (panel === 'bestiary') {
    const view = bestiaryPanel(bestiaryStage);
    panelFrame(view.title, view.subtitle, view.body, view.wide);
  } else if (panel === 'guide') {
    panelFrame(
      '修行指南',
      '道法有迹',
      `<div class="guide-tabs" role="group" aria-label="说明分类">${GUIDE_TABS.map((t) => `<button data-action="guide-tab" data-id="${t.id}" class="${guideTab === t.id ? 'active' : ''}" aria-pressed="${guideTab === t.id}">${t.title}</button>`).join('')}</div>${guideTab === 'mortal' ? '<h3 class="guide-subheading">青岚故居</h3><p class="panel-note">初入此世可选「跳过开场」直接看命盘，或选「入此山河」从故居告别、前往渡口，离乡后再看命盘；两种方式不影响灵根和物资，离乡途中不计年岁。之后入镇都从故居门前出发。父母会随年岁老去，与他们交谈没有任务或奖励，家事和家书可在履历与缘簿中重读。轮回默认直接看命盘；想从头再走一遍，可在洞府轮回确认时勾选「重走十五岁那一程」，同样会清空本世进度。真仙终章则由承缘少年接续，可选赠一物，也可选择先走一程故乡。首页「重温序章」只重看序章文字，不影响存档。</p>' : ''}${guideContent(guideTab)}<button class="primary-button guide-close" data-action="close">${game ? '返回暂停界面' : '道心已明'} ${smallIcon('arrow')}</button>`,
    );
  }
}
function renderHud() {
  if (game) battleHud.render(game, volumeOpen, touchHintDismissed);
}

function updateHud() {
  if (game) battleHud.update(game);
}

function renderChoices() {
  if (!game) return;
  modal.innerHTML = `<div class="modal-backdrop upgrade-backdrop"><section class="upgrade-panel" role="dialog" aria-modal="true" aria-label="局内升级，选择一项机缘"><div class="upgrade-heading"><span class="eyebrow">灵气充盈 · 道法自成</span><h2>顿悟新机缘</h2><p>局内等级 <b>${game.level}</b><span class="upgrade-instruction"><span>·</span>选择一项，续写你的修行之路</span></p></div><div class="choice-grid">${game.choices.map((c, i) => choiceCard(game, save, c, i)).join('')}</div><div class="upgrade-footer"><span>法宝 ${game.weapons.length} / 6 <i>·</i> 功法 ${Object.keys(game.passives).length} / 4</span><button class="secondary-button" data-action="reroll" ${game.rerolls === 0 ? 'disabled' : ''}>${smallIcon('refresh')}重悟机缘 <span>${game.rerolls} / 3</span></button>${autoplayButton(save.autoplay)}<small>${save.autoplay ? '自动历练正在挑选适合当前搭配的机缘…' : '按 1 / 2 / 3 选择'}</small></div></section></div>`;
  modal.querySelector<HTMLButtonElement>('.choice-card')?.focus();
}
function renderPause() {
  if (!game) return;
  panelFrame(
    '静心片刻',
    '修行暂歇',
    `<p class="pause-description">${game.encounterName} · ${pathInfo(game.path).name} · ${formatTime(game.time)} · <span class="pause-kills">已斩 ${game.kills} 妖<small class="pause-frame-rate" title="暂停前最近一秒的平均帧率">${frameRate.value === undefined ? '帧率采样中' : `${frameRate.value} FPS`}</small></span></p><div class="pause-build">${game.weapons.map((w) => `<span>${icon(w.id, treasure(w.id).color)}${w.evolved ? treasure(w.id).evolution : treasure(w.id).name} · ${w.level}重 ${weaponAffinity(treasure(w.id), game!.spiritRoot, game!.rootElements, true)}</span>`).join('')}</div><p class="panel-note">${game.tribulation ? '放弃本次天劫会强制轮回，清空这一世进度。' : abandonConfirm ? '提前结束将按当前战绩结算收益，本次不会解锁下一秘境。' : '呼吸之间，万念归一。准备好后继续前行。'}</p><div class="pause-actions">${autoplayButton(save.autoplay)}<button class="secondary-button" data-action="damage">伤害统计</button><button class="primary-button" data-action="resume">继续修行 ${smallIcon('play')}</button><button class="secondary-button" data-action="abandon">${game.tribulation ? '放弃渡劫 · 轮回' : abandonConfirm ? '确认结束并结算' : '结束本次历练'}</button></div>`,
  );
}
function gameEvent(name: string) {
  gameAudio.play(name);
  if (['loot', 'cache'].includes(name)) persist();
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
  adWatched = false;
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
    path: game.path,
    startedImmortal: game.startedImmortal,
  });
  persist();
  telemetry.track({
    type: 'run-end',
    ...lifeStats(),
    stage: game.stage,
    difficulty: game.difficulty,
    result: game.state === 'won' ? 'won' : abandonConfirm ? 'abandon' : 'lost',
    seconds: Math.round(game.time),
    level: game.level,
    kills: game.kills,
  });
  telemetry.flush();
  if (game.state === 'won') {
    selectedStage = Math.min(STAGES.length - 1, game.stage + 1);
    // 结算时预载，返回首页已选中下一境；失败时由正式入场流程提供重试。
    void renderer
      .prepareScene(
        selectedStage,
        false,
        [],
        () => {},
        save.completed.includes(FINAL_TRIAL_STAGE) ? ['/assets/qinglan-prologue.webp'] : [],
      )
      .catch(() => {});
    renderVictory();
  } else renderResult();
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
  modal.innerHTML = `<div class="modal-backdrop"><section class="result-panel" role="dialog" aria-modal="true" aria-label="重燃道心"><div class="eyebrow">仙途未尽</div><h2>重燃道心</h2><p>气血已尽，本次修行暂停。</p><p class="panel-note">观看广告后原地满血复活，获得 3 秒护体。<br>每局最多复活 ${MAX_REVIVES} 次，法宝、等级和战绩全部保留。${game.tribulation ? '<br>放弃本次天劫后可先留存此世，再确认轮回。' : ''}</p><div class="result-actions death-actions"><button class="primary-button" data-action="watch-ad">看广告复活 · 剩余 ${MAX_REVIVES - game.revivesUsed} 次</button><button class="secondary-button" data-action="finish-run">${game.tribulation ? '放弃渡劫 · 此世落幕' : '直接结算'}</button></div></section></div>`;
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
  modal.innerHTML = `<div class="modal-backdrop"><section class="result-panel" role="dialog" aria-modal="true" aria-label="复活广告"><div class="eyebrow">复活机缘</div>${AD_PLACEHOLDER_HTML}<p>观看结束即可重返秘境。</p><div class="result-actions death-actions"><button class="primary-button" data-action="ad-revive" disabled>${AD_SECONDS} 秒后可复活</button><button class="secondary-button" data-action="finish-run">${game.tribulation ? '放弃渡劫 · 此世落幕' : '放弃复活并结算'}</button></div></section></div>`;
  startAdWatch('ad-revive', '满血复活', 'revive');
}
// 广告是否已完整播放：真实 SDK 由观看回调置位，占位模式按倒计时完成判定。
function adCompleted() {
  return adWatched || (adReadyAt !== 0 && Date.now() >= adReadyAt);
}

// 真实 SDK 看过广告后的统一入口：解锁当前进程中的奖励按钮。
function markAdWatched(action: string, label: string) {
  adWatched = true;
  refreshAdCountdown(action, label); // 按钮文本切到「广告已结束 · …」并解除禁用
}

// 三个广告位的公共启动：能用 provider 就由 provider 播放，任何原因不可用（装死沉默也算）都回退占位倒计时。
function startAdWatch(action: string, label: string, placement: AdPlacement) {
  adWatched = false;
  const provider = getAdProvider();
  if (provider.name === 'placeholder') {
    startAdCountdown(action, label);
    return;
  }
  // SDK 分支与倒计时互不承认：先掐断任何遗留的 adReadyAt，避免上个面板的倒计时残留放行领取。
  adReadyAt = 0;
  const watchPanel = panel;
  // 真实广告全屏播放期间按钮保持禁用；看完回调会解锁为「广告已结束 · …」。
  const waiting = modal.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
  if (waiting) {
    waiting.disabled = true;
    waiting.textContent = '观看广告中…';
  }
  watchAdPlacement({
    provider,
    placement,
    alive: () => panel === watchPanel,
    onWatched: () => markAdWatched(action, label),
    onFallback: () => startAdCountdown(action, label),
  });
}

function startAdCountdown(action: string, label: string) {
  adReadyAt = Date.now() + AD_DURATION_MS;
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
  container.innerHTML = `<div class="root-quality-options" role="group" aria-label="灵根资质">${SPIRIT_ROOTS.map((r) => `<button class="secondary-button ${r.id === adRoot ? 'selected' : ''}" data-action="ad-root-quality" data-id="${r.id}" aria-pressed="${r.id === adRoot}">${r.name}${r.count > 1 ? `·${r.count}系` : ''}</button>`).join('')}</div><p>选择 ${root.count} 种五行 · 已选 ${adElements.length} / ${root.count} · 对应法宝伤害 +${root.damageBonus}%<br>灵气与修为 ${Math.round(root.rate * 100)}%，基础气血 ${root.baseHp}，基础回血 ${root.baseRegen.toFixed(2)}/秒，悟道每阶独立增伤 +${root.powerPerLevel}%。<br>基础暴击 ${Math.round(root.baseCrit * 100)}% · 基础移速 ${root.baseSpeed} 地图像素/秒。<br>${root.count ? '首位五行决定默认本命。' : '本命法宝将在领取时随机。'}</p><div class="root-element-options" role="group" aria-label="灵根五行">${ELEMENTS.map((e) => `<button class="secondary-button ${adElements.includes(e.id) ? 'selected' : ''}" data-action="ad-root-element" data-id="${e.id}" aria-pressed="${adElements.includes(e.id)}" ${root.count ? '' : 'disabled'}>${e.name}${adElements[0] === e.id ? ' · 首位' : ''}</button>`).join('')}</div><small>${root.count ? `入门法宝：${ROOT_STARTERS[adElements[0] ?? 'metal'].map((id) => treasure(id).name).join(' / ')}` : `入门法宝：从${save.path === 'dual' ? '正魔十件' : '本门五件'}中随机`}；领取后设为当前路线本命，已有收藏与炼器保留。</small>`;
}
function rememberRewardReturn() {
  rewardReturn = rememberPanel();
}
function renderSectDues() {
  if (!sectDuesPending(save)) return;
  const dues = save.mortal.member!.dues;
  panel = 'sect-dues';
  modal.innerHTML = `<div class="modal-backdrop"><section class="result-panel" role="dialog" aria-modal="true" aria-label="宗门供奉到期"><div class="eyebrow">仙门供奉</div><h2>供奉到期</h2><p>本期需 ${dues} 灵石，现有 ${save.stones} 灵石。${save.stones < dues ? `<br>还缺 ${dues - save.stones} 灵石。` : '<br>物资已足，可以补缴。'}</p><p class="panel-note">人间计时已暂停，在籍身份与精研保留。${save.stones < dues ? `<br>可看广告领取 ${adSupplies(save.unlocked).stones} 灵石与 ${adSupplies(save.unlocked).iron} 玄铁，一次不足可再次领取。` : ''}放弃补缴会被清退出宗门。</p><div class="result-actions death-actions">${save.stones < dues ? '<button class="primary-button" data-action="dues-ad">看广告 · 领取物资</button>' : '<button class="primary-button" data-action="dues-pay">补缴供奉 · 继续游历</button>'}<button class="secondary-button" data-action="dues-decline">放弃补缴 · 离开宗门</button></div></section></div>`;
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
  modal.innerHTML = `<div class="modal-backdrop"><section class="result-panel" role="dialog" aria-modal="true" aria-label="物资不足"><div class="eyebrow">修行资粮</div><h2>物资不足</h2><p>本次操作还缺 ${missing}。</p><p class="panel-note">当前持有 ${save.stones} 灵石、${save.iron} 玄铁。<br>可观看 ${AD_SECONDS} 秒广告，领取 ${adSupplies(save.unlocked).stones} 灵石与 ${adSupplies(save.unlocked).iron} 玄铁。领取后返回原页面，再选择要进行的操作。</p><div class="result-actions death-actions"><button class="primary-button" data-action="watch-supplies-ad">看广告 · 领取物资</button><button class="secondary-button" data-action="cancel-supplies">暂不领取</button></div></section></div>`;
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
      : `领取 ${adSupplies(save.unlocked).stones} 灵石与 ${adSupplies(save.unlocked).iron} 玄铁，可再次观看领取。`;
  modal.innerHTML = `<div class="modal-backdrop"><section class="result-panel ${kind === 'root' ? 'root-ad-panel' : ''}" role="dialog" aria-modal="true" aria-label="仙缘广告"><div class="eyebrow">${kind === 'root' ? '自选灵根' : '仙缘补给'}</div>${AD_PLACEHOLDER_HTML}<p>${reward}<br>完整观看 ${AD_SECONDS} 秒后点击领取，中途离开不发放奖励。</p>${kind === 'root' ? '<div id="root-picker"></div>' : ''}<div class="result-actions death-actions"><button class="primary-button" data-action="claim-ad-reward" disabled>${AD_SECONDS} 秒后领取奖励</button><button class="secondary-button" data-action="cancel-reward-ad">放弃领取</button></div></section></div>`;
  if (kind === 'root') renderRootPicker();
  startAdWatch('claim-ad-reward', '领取奖励', kind === 'root' ? 'reward-root' : 'reward-supplies');
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
  if (rewardReturn) {
    if (rewardReturn.name === 'sect-dues') renderSectDues();
    else if (rewardReturn.name === 'town-event' && townNpc) showTownEvent(townNpc);
    else restorePanel(rewardReturn);
    rewardReturn = null;
  }
}
function renderResult() {
  if (!game || !rewards) return;
  window.clearTimeout(victoryTimer);
  panel = '';
  const won = game.state === 'won',
    realm = realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).name;
  const firstReturn = save.mortal.hometown && save.runs === 1 && !game.tribulation;
  const journeyYears =
    game.elapsedYears === undefined
      ? '此行年岁未载'
      : game.elapsedYears < 0.1
        ? '此行不足 0.1 年'
        : firstReturn
          ? `此行 ${game.elapsedYears.toLocaleString('zh-CN', { maximumFractionDigits: 1, useGrouping: false })} 年<br>离乡时十五，如今 ${save.age.toLocaleString('zh-CN', { maximumFractionDigits: 1, useGrouping: false })} 岁。`
          : `此行 ${game.elapsedYears.toLocaleString('zh-CN', { maximumFractionDigits: 1, useGrouping: false })} 年`;
  modal.innerHTML = `<div class="modal-backdrop"><section class="result-panel settlement-panel ${won && game.isFinalTrial ? 'result-complete' : ''}" role="dialog" aria-modal="true" aria-label="历练结算"><div class="settlement-content"><div class="result-seal">${won ? (game.isFinalTrial ? '圆满' : '破境') : '归来'}</div><div class="eyebrow">${game.encounterName} · ${pathInfo(game.path).name} · ${DIFFICULTIES[game.difficulty].name}</div><h2>${won ? (game.isFinalTrial ? '仙途圆满，自在长生' : '一剑荡妖尘') : '仙途漫漫，再行一程'}</h2><p>${won ? (game.isFinalTrial ? '七劫尽破，已证真仙。周期天劫就此止息，既有修行与劫印长存。' : `妖王已斩，${STAGES[game.stage + 1].name}已解锁。`) : '胜败皆为修行。此行所得，尽归道心。'}</p><div class="result-stats"><div><strong>${formatTime(game.time)}</strong><span>历练时长</span></div><div><strong>${game.kills}</strong><span>斩妖数量</span></div><div><strong>${game.level}</strong><span>局内等级</span></div></div><div class="reward-row"><span>${smallIcon('gem')}<b>+${rewards.stones}</b> 灵石</span><span>◆ <b>+${rewards.iron}</b> 玄铁</span><span>✧ <b>+${rewards.cultivation}</b> 本局修为</span></div><p class="result-years">${journeyYears}</p>${rewards.ascensionCultivation > 0 ? `<p class="boss-reward">成仙修为补足 +${rewards.ascensionCultivation}<small>已计入本局总修为，仅补足成仙所需</small></p>` : ''}<div class="result-realm">${realm !== oldRealm ? `境界突破 · ${oldRealm} → ${realm}` : `当前境界 · ${realm}`}</div>${game.bossCultivation > 0 ? `<p class="boss-reward">妖王突破修为 +${Math.floor(game.bossCultivation).toLocaleString('zh-CN', { useGrouping: false })}<small>已计入本局总修为</small></p>` : ''}<details class="disclosure settlement-details"><summary>伤害统计与收益明细</summary><p class="panel-note">修为实时入账 ${rewards.cultivation - rewards.cultivationRemaining} · 本次补发 ${rewards.cultivationRemaining}，合计已计入永久修为。</p>${damageReport(game)}</details></div><div class="result-actions"><button class="secondary-button" data-action="return">返回首页</button><button class="primary-button" data-action="${won && game.stage < STAGES.length - 1 ? 'next' : 'retry'}">${won && game.stage < STAGES.length - 1 ? '前往下一秘境' : '再入仙途'} ${smallIcon('arrow')}</button></div></section></div>`;
  modal.querySelector('.result-years')?.insertAdjacentHTML('afterend', runLootContent(game.loot));
  if (won && game.isFinalTrial) modal.querySelector('[data-action="retry"]')?.remove();
  modal.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
}
function ensureScene(stage: number, next: () => void, run?: Game | null, tribulation = false) {
  const extra =
    run?.enemies.map((e) =>
      e.boss ? STAGES[e.bossStage ?? run.stage].sprite : ENEMIES[e.type].sprite,
    ) ?? [];
  const isTribulation = tribulation || !!run?.tribulation;
  const extraImages = [
    window.matchMedia('(max-width: 640px)').matches ? JOURNEY_MAP_MOBILE_IMAGE : JOURNEY_MAP_IMAGE,
    ...(save.prologueSeen ? [] : [PROLOGUE_IMAGE]),
  ];
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
  loading.innerHTML = `<section><div class="eyebrow">叩仙门：青岚纪</div><h2>${isTribulation ? '天劫将至' : STAGES[stage].name}</h2><p>正在准备地图、人物与法宝</p><progress max="1" value="0" aria-label="素材加载进度"></progress><p class="load-progress" role="status">0%</p><button class="secondary-button" hidden>重新加载</button></section>`;
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
    return;
  }
  clearInput();
  panel = '';
  modal.innerHTML = '';
  battleHud.reset();
  settled = false;
  rewards = null;
  abandonConfirm = false;
  game = new Game(save, selectedStage, difficulty);
  frameRate.reset();
  game.onEvent = gameEvent;
  telemetry.track({ type: 'run-start', ...lifeStats(), stage: selectedStage, difficulty });
  previousState = 'playing';
  oldRealm = realmInfo(
    save.cultivation - game.creditedCultivation,
    save.completed.includes(FINAL_TRIAL_STAGE),
  ).name;
  renderHud();
  if (save.sound) gameAudio.sync();
  persist();
}
function restoreRun() {
  if (!pendingRun || !assetsReady) return;
  if (!ensureScene(pendingRun.stage, restoreRun, pendingRun)) {
    return;
  }
  game = pendingRun;
  frameRate.reset();
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
  if (game.state === 'upgrade') renderChoices();
  else if (game.state === 'lost') renderDeath();
  else renderPause();
  if (save.sound) gameAudio.sync();
  persist();
}
function returnLobby() {
  const years =
    game && settled && save.runs === 1 && !game.tribulation ? game.elapsedYears : undefined;
  game = null;
  panel = '';
  modal.innerHTML = '';
  previousState = '';
  clearInput();
  renderLobby(years);
}
function rootRevealContent() {
  const starter = treasure(save.starter);
  return `<div class="root-reveal-disc">${spiritRootDiagram(save, true)}</div><div class="root-reveal-effects"><h3>${spiritRootInfo(save.spiritRoot).name}</h3><p>${spiritRootEffects(save)}</p></div><div class="root-reveal-aside"><div class="root-reveal-starter">${icon(starter.id, starter.color)}<div><small>本命法宝 · ${elementInfo(starter.element).name}系</small><strong>${starter.name}</strong></div></div><blockquote class="root-verdict"><span>命批</span><p>${ROOT_IMPRESSIONS[save.spiritRoot].verse}</p></blockquote></div>`;
}
function refreshRootReveal() {
  const content = modal.querySelector<HTMLElement>('.root-reveal-layout');
  const section = modal.querySelector<HTMLElement>('.root-reveal-panel');
  if (!content || !section) return false;
  const scrollTop = section.scrollTop;
  content.innerHTML = rootRevealContent();
  section.scrollTop = scrollTop;
  return true;
}
function renderRootReveal(previousLife = '前尘已散，新一世从十五岁启程。', firstLife = false) {
  const successor = isImmortalSuccessor(save);
  panel = 'root-reveal';
  ui.inert = true;
  panelFrame(
    successor ? '少年承缘，始问长生' : firstLife ? '命盘初现，始问长生' : '一念轮回，再问长生',
    successor ? '前人离界 · 后来者启程' : '命盘初现 · 此世资质',
    `<p class="root-reveal-context">${previousLife}</p><div class="root-reveal-layout">${rootRevealContent()}</div>${birthInheritanceNotice(save.birthInheritance)}<div class="root-reveal-actions"><button class="primary-button" data-action="accept-root">道心已明 ${smallIcon('arrow')}</button><button class="secondary-button" data-action="reroll-root">${successor ? '重看命盘' : '轮回转世'}</button></div>`,
    true,
  );
  modal.querySelector('[data-action="close"]')?.remove();
  const section = modal.querySelector<HTMLElement>('.panel')!;
  section.classList.add('root-reveal-panel');
  section.scrollTop = 0;
  section.tabIndex = -1;
  section.focus({ preventScroll: true });
}
function lifeStats() {
  return {
    realm: realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).step,
    stage: save.unlocked,
    runs: save.runs,
    age: Math.round(save.age),
    root: save.spiritRoot,
    path: save.path,
  } satisfies Partial<TelemetryEvent>;
}
function trackReincarnation(result: 'lifespan' | 'tribulation' | 'epilogue' | 'manual') {
  telemetry.track({ type: 'reincarnate', result, ...lifeStats() });
  telemetry.flush();
}
function resetLifetime(
  previousLife?: string,
  revisitHometown: boolean | 'full' = false,
  inheritance: BirthInheritance | null = null,
  successor = false,
) {
  const rerolling = panel === 'root-reveal' && !revisitHometown;
  shownHumanLetters.clear();
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
  const { sound: soundEnabled, volume, prologueSeen, hometownSeen } = save;
  Object.assign(save, freshSave(root, rootElementsFor(root), 'orthodox'), {
    sound: soundEnabled,
    volume,
    prologueSeen,
    hometownSeen,
  });
  applyBirthInheritance(save, inheritance);
  if (successor)
    recordChronicle(
      save,
      '承缘启程',
      '渡口的修士已证长生，离界而去。十五岁的少年循着他的指引，接续问道之路。',
      'immortal-successor',
    );
  if (successor && revisitHometown === true) {
    save.prologueSeen = true;
    save.hometownSeen = true;
  } else if (revisitHometown === 'full') {
    save.prologueSeen = false;
    save.hometownSeen = false;
  } else if (!revisitHometown) {
    save.prologueSeen = true;
    departHometown(save);
  }
  gameAudio.sync();
  selectedStage = difficulty = treasurePage = 0;
  selectedTreasure = save.starter;
  schoolFilter = 'all';
  bookTab = 'treasures';
  persist();
  if (saveLock) return;
  if (rerolling && refreshRootReveal()) return;
  panel = '';
  modal.innerHTML = '';
  ui.inert = false;
  renderLobby();
  if (!save.prologueSeen) renderPrologue();
  if (previousLife && !successor) toast(previousLife);
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
    `<p class="pause-description">当前历练已保存。渡劫场只有一位「天劫」，看清预警、侧移避雷，在核心显露时反击。</p><p class="panel-note">携带当前搭配；无未完成历练时，本命在渡劫场临时觉醒。渡劫期间不计龄、不掉经验或回血宝物。战败可使用本次天劫的 ${MAX_REVIVES} 次广告复活；放弃后可先留存此世，再确认轮回。</p><p class="boss-reward">渡劫成功：永久气血 +3% · 法宝伤害 +2%<small>劫印按次数累加，轮回清空；胜利后返回原历练。</small></p><div class="save-actions"><button class="primary-button" data-action="tribulation-start" ${assetsReady ? '' : 'disabled'}>${pendingRun?.tribulation ? '继续迎劫' : '迎战天劫'}</button><button class="secondary-button" data-action="tribulation-forfeit">放弃渡劫 · 此世落幕</button></div>`,
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
    return;
  }
  const source = game && !settled ? game : pendingRun;
  save.tribulationReturn = source?.snapshot() ?? null;
  game = Game.createTribulation(save, source);
  frameRate.reset();
  pendingRun = null;
  settled = false;
  rewards = null;
  abandonConfirm = false;
  panel = '';
  previousState = 'playing';
  modal.innerHTML = '';
  clearInput();
  game.onEvent = gameEvent;
  telemetry.track({ type: 'run-start', ...lifeStats(), tribulation: game.tribulation });
  renderHud();
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
    `<p class="pause-description">确认轮回后，境界、物资、法宝收藏、炼器、根基、劫印和已保存的原历练都会清空，并重新随机灵根。</p><p class="panel-note">${game?.tribulation && game.revivesUsed >= MAX_REVIVES ? '本次天劫的广告复活次数已用尽。' : '可以继续迎劫；已阵亡时可看广告复活。'}确认放弃后可先留存此世，再决定轮回。</p><div class="save-actions"><button class="secondary-button" data-action="cancel-forfeit">继续迎劫</button><button class="primary-button" data-action="confirm-forfeit">确认弃劫 · 此世落幕</button></div>`,
  );
  modal.querySelector('[data-action="close"]')?.remove();
}
function finishTribulation() {
  if (!game?.tribulation || game.state !== 'won') return;
  const report = damageReport(game);
  if (!completeTribulation(save, game.tribulation)) return;
  telemetry.track({
    type: 'run-end',
    ...lifeStats(),
    result: 'won',
    tribulation: save.tribulations,
    seconds: Math.round(game.time),
  });
  telemetry.flush();
  resolveActivity(save);
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
  resetLifetime(
    `前世止于${realm}，享年 ${life.age.toFixed(1)} 年。尘缘已了，今世从十五岁再启仙途。`,
  );
}
function renderJourneyFarewell(reason: NonNullable<SaveData['pendingReincarnation']>) {
  clearInput();
  const tribulation = reason === 'tribulation';
  panel = tribulation ? 'tribulation-farewell' : 'lifespan-farewell';
  panelFrame(
    tribulation ? '止于天劫' : '此世寿终',
    tribulation ? '劫雷未息 · 一生落笔' : '寿数已尽 · 一生落笔',
    `<div class="lifespan-story"><p>${tribulation ? '劫雷落尽，这一世的问道路止于仙关之前。' : '这一世已行至尽头。'}山河仍在，旧事、故人与求道路上的每一步，也都留在身后。</p><p>可将此世修行留作一幅纪念；无论是否留存，确认轮回后都将从十五岁重新启程。</p></div><div class="save-actions"><button class="secondary-button" data-action="journey-card">留存此世</button><button class="primary-button" data-action="confirm-journey-reincarnate">轮回转世 ${smallIcon('arrow')}</button></div>`,
  );
  modal.querySelector('[data-action="close"]')?.remove();
}
function beginJourneyFarewell(reason: NonNullable<SaveData['pendingReincarnation']>) {
  const ended = structuredClone(save);
  ended.pendingReincarnation = reason;
  ended.autoplay = false;
  ended.tribulationReturn = null;
  try {
    writeSave(ended, null);
  } catch {
    if (!saveLock) toast('浏览器无法保存本世落幕，请释放存储空间后重试');
    return;
  }
  Object.assign(save, ended);
  game = pendingRun = null;
  settled = false;
  renderLobby();
  renderJourneyFarewell(reason);
}
function renderLifespanEnd() {
  clearInput();
  panel = 'lifespan-ended';
  const life = lifespanInfo(save);
  panelFrame(
    '一生将尽，山河仍远',
    '寿元已尽 · 此世未了',
    `<div class="lifespan-story"><p>灵力渐渐散去，你抬起手，才看清指间不知何时添了这样深的纹路。走过的山川一一浮现，最后停在十五岁那年的青岚渡口——那时行囊很轻，你以为前路还长。</p><p>远处似有钟声。山风拂过衣袖，你望着来时的路，久久没有言语。</p></div><p class="pause-description">此世行至${realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).name} · 年岁 ${life.age.toFixed(1)} / ${life.limit} 年。修行已暂停。</p><p class="panel-note">完整观看 ${AD_SECONDS} 秒广告可增加 ${Math.round(life.base * 0.3)} 年寿元（当前境界基础寿命的 30%），保留全部修行进度。选择不再借寿后，可先留存此世，再确认轮回。</p><div class="save-actions"><button class="primary-button" data-action="watch-lifespan-ad">向天再借五百年</button><button class="secondary-button" data-action="end-lifetime">不再借寿 · 此世落幕</button></div>`,
  );
  modal.querySelector('[data-action="close"]')?.remove();
}
function showLifespanAd() {
  const life = lifespanInfo(save);
  if (!Number.isFinite(life.base) || life.remaining > 0 || panel !== 'lifespan-ended') return;
  panel = 'lifespan-ad';
  modal.innerHTML = `<div class="modal-backdrop"><section class="result-panel" role="dialog" aria-modal="true" aria-label="借寿广告"><div class="eyebrow">向天再借五百年</div>${AD_PLACEHOLDER_HTML}<p>本次增加 ${Math.round(life.base * 0.3)} 年寿元（基础寿命的 30%）。<br>再次寿尽时可再借，年数累加；突破后保留已借寿元。</p><div class="result-actions death-actions"><button class="primary-button" data-action="claim-lifespan" disabled>${AD_SECONDS} 秒后借寿</button><button class="secondary-button" data-action="cancel-lifespan">暂不借寿</button></div></section></div>`;
  startAdWatch('claim-lifespan', '领取寿元', 'lifespan');
}
function clearInput() {
  keys.clear();
  touchInput = { x: 0, y: 0 };
  pointer = null;
  joystick.classList.remove('active');
  if (game) game.input = { x: 0, y: 0 };
}
function handleAction(action: string, id?: string) {
  if (saveLock) {
    if (action === 'save-lock-reload') location.reload();
    else if (action === 'save-lock-download')
      downloadJson(localStorage.getItem(SAVE_KEY) ?? raw ?? '', '原始存档');
    else if (action === 'save-lock-continue' && saveLock === 'unreadable') {
      saveLock = null;
      panel = '';
      modal.innerHTML = '';
      ui.inert = false;
      persist();
      renderPrologue();
    }
    return;
  }
  if (panel === 'market-ambush-recovery') {
    if (action === 'market-ambush-recover') {
      panel = '';
      modal.innerHTML = '';
      renderLobby();
    }
    return;
  }
  if (panel === 'market-ambush') {
    if (action === 'market-ambush-exit' || action === 'close' || action === 'home')
      finishMarketAmbush(ambushScene?.duel.outcome ?? 'escaped');
    return;
  }
  if (action === 'close' && panel === 'journey-card') {
    journeyCardPanel.cancel();
  }
  if (save.journeyEnded) {
    if (action === 'journey-card' && (panel === 'epilogue' || panel === 'journey-card')) {
      void renderJourneyCard();
    } else if (action === 'close' && panel === 'journey-card') {
      renderEpilogue();
    } else if (action === 'epilogue-reincarnate' && panel === 'epilogue') {
      panel = 'epilogue-reincarnate';
      panelFrame(
        '临行留缘',
        '真仙离界 · 少年接续',
        `<p class="pause-description">仙门已开，你将离开此界，继续追寻大道。青岚渡口的少年却才刚要启程，临行可赠他一物，也可只留一句指引。</p>${inheritanceContent(save)}<p class="panel-note">确认后将从这名十五岁青年开始新的修行。除所选赠物外，原修士的境界、物资、根基与履历不会带入，当前进度将替换为青年的旅程；确认前可返回终章留存此世。</p><figure class="reincarnate-support"><img src="${assetUrl(SUPPORT_CODE_IMAGE)}" alt="微信赞赏码" width="104" height="104" loading="lazy"><figcaption>若这一程让你有所触动，可请作者喝杯茶。<br>微信扫码，或截图后在「扫一扫」里从相册选取。</figcaption></figure><div class="pause-actions"><button class="secondary-button" data-action="close">留在终章</button><button class="primary-button" data-action="confirm-reincarnate">留缘离界</button></div>`,
      );
    } else if (action === 'confirm-reincarnate' && panel === 'epilogue-reincarnate') {
      ui.inert = false;
      trackReincarnation('epilogue');
      resetLifetime(
        '修士离界，少年启程。一段指路的话，一场未尽的仙缘。',
        true,
        resolveInheritance(
          save,
          modal.querySelector<HTMLSelectElement>('#reincarnate-inheritance')?.value ?? '',
        ),
        true,
      );
    } else if (action === 'close' && panel === 'epilogue-reincarnate') renderEpilogue();
    else if (action === 'epilogue-sound' && panel === 'epilogue') {
      soundSettings.toggle();
      updateStorySoundButton(
        modal.querySelector<HTMLButtonElement>('[data-action="epilogue-sound"]')!,
        save.sound,
      );
    }
    return;
  }
  // 留影只切换面板，不能解除已结束的人生状态。
  if (save.pendingReincarnation) {
    if (action === 'journey-card') void renderJourneyCard();
    else if (action === 'close' && panel === 'journey-card')
      renderJourneyFarewell(save.pendingReincarnation);
    else if (
      action === 'confirm-journey-reincarnate' &&
      (panel === 'lifespan-farewell' || panel === 'tribulation-farewell')
    ) {
      trackReincarnation(panel === 'lifespan-farewell' ? 'lifespan' : 'tribulation');
      if (panel === 'lifespan-farewell') endLifetime();
      else resetLifetime('前世止于天劫，旧缘已散。今世从十五岁，再问长生。');
    }
    return;
  }
  if (panel === 'root-reveal') {
    if (action === 'reroll-root')
      resetLifetime(undefined, false, save.birthInheritance, isImmortalSuccessor(save));
    else if (action === 'accept-root' || action === 'close') {
      ui.inert = false;
      panel = '';
      modal.innerHTML = '';
      const hadInheritance = save.birthInheritance !== null;
      save.birthInheritance = null;
      if (acceptHometownRoot(save) || hadInheritance) persist();
      renderLobby();
      ui.querySelector<HTMLButtonElement>('[data-action="start"]')?.focus({ preventScroll: true });
    }
    return;
  }
  if (panel === 'prologue') {
    if (action === 'prologue-sound') {
      soundSettings.toggle();
      updateStorySoundButton(
        modal.querySelector<HTMLButtonElement>('[data-action="prologue-sound"]')!,
        save.sound,
      );
      return;
    }
    if (
      action === 'prologue-skip' &&
      !save.prologueSeen &&
      !pendingRun &&
      save.mortal.hometown &&
      ['farewell', 'walk'].includes(save.mortal.hometown.stage)
    ) {
      finishDeparture(true);
      return;
    }
    if (action === 'prologue-enter' || action === 'prologue-skip' || action === 'close') {
      const replay = save.prologueSeen;
      if (
        action === 'prologue-enter' &&
        !replay &&
        !pendingRun &&
        save.mortal.hometown &&
        ['farewell', 'walk'].includes(save.mortal.hometown.stage)
      )
        void mobileDisplay.enter();
      save.prologueSeen = true;
      ui.inert = false;
      panel = '';
      modal.innerHTML = '';
      persist();
      renderLobby();
      if (replay)
        ui.querySelector<HTMLButtonElement>('[data-action="prologue-revisit"]')?.focus({
          preventScroll: true,
        });
    }
    return;
  }
  if (action === 'prologue-revisit') {
    renderPrologue(true);
    return;
  }
  if (
    save.mortal.hometown &&
    ['farewell', 'walk'].includes(save.mortal.hometown.stage) &&
    !save.pendingReincarnation &&
    !game &&
    !pendingRun &&
    lifespanInfo(save).remaining > 0 &&
    !tribulationDue(save)
  ) {
    if (action === 'hometown-walk' && panel === 'hometown-choice') {
      const next = structuredClone(save);
      next.hometownSeen = false;
      try {
        writeSave(next, null);
      } catch {
        if (!saveLock) toast('暂时无法保存启程选择，请重试');
        return;
      }
      Object.assign(save, next);
      void mobileDisplay.enter();
      renderDeparture();
    } else if (action === 'hometown-skip' && panel === 'hometown-choice') finishDeparture();
    else if (action === 'hometown-continue' && panel === 'hometown-farewell') {
      save.mortal.hometown.stage = 'walk';
      persist();
      ui.inert = false;
      panel = '';
      modal.innerHTML = '';
      document.getElementById('town-view')?.focus({ preventScroll: true });
      townScene?.toggleDockNavigation();
    } else if (action === 'town-retry') renderDeparture();
    else if (action === 'town-talk' && !panel) townScene?.talk();
    if (action !== 'fullscreen') return;
  }
  if (action === 'hometown-home' && panel === 'hometown-home') {
    showHometown();
    return;
  }
  if (
    action === 'hometown-parent' &&
    panel === 'hometown-home' &&
    (id === 'father' || id === 'mother')
  ) {
    showHometown(id);
    return;
  }
  if (
    action === 'hometown-letter' &&
    inMortalWorld &&
    save.mortal.hometown?.letterFoundAt != null &&
    ['hometown-home', 'human-journal', 'human-memory', ''].includes(panel)
  ) {
    if (readHometownLetter(save)) persist();
    panel = 'human-memory';
    panelFrame('故居家书', '人间缘簿 · 家中旧字', hometownLetterContent(save));
    return;
  }
  if (
    action === 'immortal-gate' &&
    !game &&
    !inMortalWorld &&
    realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).max
  ) {
    panel = 'immortal-gate';
    panelFrame(
      '叩入仙门',
      '此界修行圆满 · 走向终章',
      '<p class="pause-description">你已证得长生，此界的修行即将圆满。确认后进入终章，历练、洞府和青岚镇均不可再返回，未完成的历练也会终止；刷新仍停留在终章。</p><p class="panel-note">终章可留存此世，也可在离界时赠青岚少年一件法宝或一枚丹药，让他接续问道之路。你也可以暂留人间，待准备好再来。</p><div class="pause-actions"><button class="secondary-button" data-action="close">暂留人间</button><button class="primary-button" data-action="confirm-immortal-gate">叩门而入 · 走向终章</button></div>',
    );
    return;
  }
  if (action === 'confirm-immortal-gate' && panel === 'immortal-gate' && !game) {
    const ended = structuredClone(save);
    if (!enterImmortalGate(ended)) return;
    try {
      writeSave(ended, null);
    } catch {
      if (!saveLock) toast('浏览器无法保存终章，此世尚未结束，请释放存储空间后重试');
      return;
    }
    Object.assign(save, ended);
    pendingRun = null;
    telemetry.track({ type: 'epilogue', ...lifeStats() });
    telemetry.flush();
    renderEpilogue();
    return;
  }
  if (action === 'fullscreen' && (game || inTown || inMarket)) {
    void (mobileDisplay.active ? mobileDisplay.leave() : mobileDisplay.enter());
    return;
  }
  if (action === 'journey-map' && !game) {
    ui.querySelector<HTMLButtonElement>('.journey-node.selected')?.focus({ preventScroll: true });
    ui.querySelector('.journey-map-heading')?.scrollIntoView({
      block: 'start',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
    return;
  }
  if ((action === 'revisit' || action === 'journey-prepare') && !game) {
    ui.querySelector<HTMLButtonElement>('.journey-depart [data-action="start"]')?.focus({
      preventScroll: true,
    });
    ui.querySelector('.journey-selection')?.scrollIntoView({
      block: 'start',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
    return;
  }
  if (panel === 'tribulation-forfeit') {
    if (action === 'confirm-forfeit') {
      beginJourneyFarewell('tribulation');
    } else if (action === 'cancel-forfeit' || action === 'close') {
      if (game?.tribulation) game.state === 'lost' ? renderDeath() : renderPause();
      else renderTribulationPending();
    }
    return;
  }
  if (action === 'tribulation-start' && tribulationDue(save)) {
    if (assetsReady) void mobileDisplay.enter();
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
    beginJourneyFarewell('lifespan');
    return;
  }
  if (action === 'watch-lifespan-ad') {
    showLifespanAd();
    return;
  }
  if (panel === 'lifespan-ad' && ['close', 'cancel-lifespan', 'claim-lifespan'].includes(action)) {
    const claim = action === 'claim-lifespan';
    if (claim && !adCompleted()) return;
    const target = game ?? pendingRun;
    const years = claim ? (target ? target.borrowLife() : extendLifespan(save)) : 0;
    if (years) resolveActivity(save);
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
    action.startsWith('auction-') &&
    inMortalWorld &&
    inMarket &&
    !game &&
    panel === 'sect-auction' &&
    marketScene?.nearAuction
  ) {
    if (action === 'auction-view' && (id === 'buy' || id === 'sell' || id === 'history')) {
      auctionView = id;
      refreshAuction();
      return;
    }
    const button = modal.querySelector<HTMLButtonElement>(
      action === 'auction-buy'
        ? `[data-action="auction-buy"][data-id="${Number(id)}"]`
        : '[data-action="auction-sell"]',
    );
    if (!button || button.disabled) return;
    const visit = Number(button.dataset.visit);
    const next = structuredClone(save);
    let result;
    if (action === 'auction-buy') {
      const index = Number(id);
      const reason = auctionBuyReason(save, index, visit, !!pendingRun);
      if (reason) {
        toast(reason);
        return;
      }
      const budget = Number(
        modal.querySelector<HTMLInputElement>(`#auction-budget-${index}`)?.value,
      );
      result = buyAuction(next, index, budget, visit, !!pendingRun);
      if (!result) {
        toast('请输入扣除到期供奉后可负担、且足够起拍的整数预算（含手续费）');
        return;
      }
    } else if (action === 'auction-sell') {
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
      const reason = auctionSellReason(save, item, visit, !!pendingRun);
      if (reason) {
        toast(reason);
        return;
      }
      const reserve = Number(modal.querySelector<HTMLInputElement>('#auction-reserve')?.value);
      result = sellAuction(next, item, reserve, visit, !!pendingRun);
      if (!result) {
        toast('请输入有效的整数保留价，灵石余额不能超出上限');
        return;
      }
    } else return;
    try {
      writeSave(next, pendingRun);
    } catch {
      if (!saveLock) toast('拍卖未完成：浏览器暂时无法保存，请重试');
      return;
    }
    Object.assign(save, next);
    refreshAuction(result.id);
    const status = document.getElementById('town-status');
    if (status) status.innerHTML = townStatus(save);
    const note = modal.querySelector<HTMLElement>('#auction-result');
    if (note) {
      note.hidden = false;
      note.textContent = auctionResult(save, result);
    }
    toast(auctionResult(save, result));
    return;
  }
  if (action.startsWith('sect-market-') && inMortalWorld && !game) {
    if (
      action === 'sect-market-enter' &&
      !panel &&
      !inMarket &&
      !inTown &&
      mortalTab === 'sects' &&
      sectMarketOpen(save)
    ) {
      const next = structuredClone(save);
      next.mortal.population ??= freshTownPopulation(next.age);
      if (!beginSectMarketVisit(next)) return;
      try {
        writeSave(next, pendingRun);
      } catch {
        if (!saveLock) toast('浏览器暂时无法保存坊市进度，请重试');
        return;
      }
      Object.assign(save, next);
      inMarket = true;
      inTown = false;
      lastMortalTick = performance.now();
      void mobileDisplay.enter();
      renderMortal();
      document.getElementById('sect-market-view')?.focus({ preventScroll: true });
    } else if (action === 'sect-market-retry' && inMarket && !panel) renderMortal();
    else if (action === 'sect-market-exit' && inMarket && !panel) {
      leaveTown();
      persist();
      renderMortal();
      document.querySelector<HTMLButtonElement>('[data-action="sect-market-enter"]')?.focus();
    } else if (action === 'sect-market-talk' && inMarket && !panel) marketScene?.talk();
    else if (
      action === 'sect-market-fellow' &&
      inMarket &&
      panel === 'sect-market-event' &&
      marketNpc?.id === 'market-fellow' &&
      marketScene?.nearbyNpc?.id === 'market-fellow' &&
      (id === 'stay' || id === 'travel' || id === 'read')
    ) {
      const button = modal.querySelector<HTMLButtonElement>(
        `[data-action="sect-market-fellow"][data-id="${id}"]`,
      );
      if (!button || button.disabled) return;
      const next = structuredClone(save);
      if (!chooseMarketFellow(next, id, Number(button.dataset.visit))) return;
      try {
        writeSave(next, pendingRun);
      } catch {
        if (!saveLock) toast('这次交谈未能保存，请重试');
        return;
      }
      Object.assign(save, next);
      showMarketEvent(marketNpc);
    } else if (
      [
        'sect-market-debate',
        'sect-market-request',
        'sect-market-inspect',
        'sect-market-opportunity',
        'sect-market-decline',
      ].includes(action) &&
      inMarket &&
      panel === 'sect-market-event' &&
      isMarketCultivatorId(id) &&
      marketNpc?.id === id &&
      marketScene?.nearbyNpc?.id === id
    ) {
      const button = modal.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
      if (!button || button.disabled) return;
      const visit = Number(button.dataset.visit);
      const next = structuredClone(save);
      if (!prepareMarketSocial(next)) return;
      const result =
        action === 'sect-market-debate'
          ? debateMarket(next, id, visit)
          : action === 'sect-market-request'
            ? fulfillMarketRequest(next, id, visit, Number(button.dataset.level), !!pendingRun)
            : chooseMarketOpportunity(
                next,
                id,
                visit,
                action === 'sect-market-inspect'
                  ? 'inspect'
                  : action === 'sect-market-decline'
                    ? 'decline'
                    : 'accept',
                !!pendingRun,
              );
      if (!result) {
        toast('这桩互动已变化，请重新查看；当前物资未改动');
        return;
      }
      try {
        writeSave(next, pendingRun);
      } catch {
        if (!saveLock) toast('互动未完成：浏览器暂时无法保存，请重试');
        return;
      }
      Object.assign(save, next);
      if (next.mortal.marketSocial?.ambush) showMarketAmbush();
      else {
        refreshMarketActivities();
        refreshMarketTrade();
        toast(
          result.kind === 'debate'
            ? '论道已完成 · 本次所得已记在此处'
            : result.kind === 'exposed'
              ? '核验完成 · 可查看本次线索'
              : result.text.length > 75
                ? `${result.text.slice(0, 72)}…`
                : result.text,
        );
      }
      const status = document.getElementById('town-status');
      if (status) status.innerHTML = townStatus(save);
    } else if (
      action === 'sect-market-exchange' &&
      inMarket &&
      panel === 'sect-market-event' &&
      isMarketCultivatorId(id) &&
      marketNpc?.id === id &&
      marketScene?.nearbyNpc?.id === id
    ) {
      const give = modal.querySelector<HTMLSelectElement>('#sect-market-give')?.value ?? '';
      const visit = Number(
        modal.querySelector<HTMLButtonElement>('[data-action="sect-market-exchange"]')?.dataset
          .visit,
      );
      const reason = sectMarketExchangeReason(save, id, give, visit);
      if (reason) {
        toast(reason);
        return;
      }
      const next = structuredClone(save);
      const received = sectMarketOffer(next, id)!;
      if (!exchangeSectMedicine(next, id, give, visit)) return;
      try {
        writeSave(next, pendingRun);
      } catch {
        if (!saveLock) toast('互换未完成：浏览器暂时无法保存，请重试');
        return;
      }
      Object.assign(save, next);
      refreshMarketTrade();
      const status = document.getElementById('town-status');
      if (status) status.innerHTML = townStatus(save);
      toast(`${received.name} ×1 已收入丹囊`);
    }
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
  if (
    action === 'human-memory' &&
    inMortalWorld &&
    !game &&
    (!panel || panel === 'human-journal') &&
    id &&
    isHumanStoryId(id) &&
    save.mortal.humanStories?.[id]
  ) {
    syncHumanStories(save);
    chooseHumanStory(save, id, 'read');
    persist();
    panel = 'human-memory';
    panelFrame(HUMAN_STORIES[id].title, '人间缘簿 · 此世旧事', humanStoryContent(save, id));
    return;
  }
  if (action === 'human-story' && inMortalWorld && !game) {
    const [storyId, choice] = (id ?? '').split(':');
    if (!isHumanStoryId(storyId)) return;
    const atNpc =
      panel === 'town-event' &&
      inTown &&
      townNpc?.id === HUMAN_STORIES[storyId].npcId &&
      townScene?.nearbyNpc?.id === townNpc.id;
    if (atNpc && chooseHumanStory(save, storyId, choice)) {
      persist();
      showTownEvent(townNpc!);
    }
    return;
  }
  if (action.startsWith('town-') && inMortalWorld && !game && !panel) {
    if (action === 'town-enter' && mortalTab === 'town') {
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
      persist();
      telemetry.track({ type: 'town', ...lifeStats() });
      void mobileDisplay.enter();
      inTown = true;
      if (save.mortal.hometown) townPosition = { ...HOMETOWN_START };
      lastMortalTick = performance.now();
      renderMortal();
      document.getElementById('town-view')?.focus({ preventScroll: true });
      if (memory) townScene?.showArrival(memory);
    } else if (action === 'town-retry' && inTown) {
      const memory = document.querySelector('.town-return-note')?.textContent;
      renderMortal();
      if (memory) townScene?.showArrival(memory);
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
    (!panel ||
      panel === 'town-event' ||
      (panel === 'tea-story' && action === 'mortal-activity' && id === 'tea'))
  ) {
    if (
      panel === 'tea-story' &&
      modal.querySelector<HTMLButtonElement>('.tea-story-next')?.disabled !== false
    )
      return;
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
        const fromTown = panel === 'town-event' || panel === 'tea-story';
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
        if (
          fromTown &&
          action === 'mortal-activity' &&
          id === 'tea' &&
          !panel &&
          !save.mortal.activity
        )
          showTeaStory();
        if (fromTown && (action === 'mortal-buy' || action === 'mortal-sell') && townNpc)
          showTownEvent(townNpc);
        if (action === 'mortal-join' || action === 'mortal-leave') toast(save.mortal.events[0]);
        if (action === 'mortal-activity' && !save.mortal.activity) toast(save.mortal.events[0]);
      } else if (panel === 'tea-story') toast('暂时不能继续听书，请先处理寿元或未完成的事项。');
    }
    return;
  }
  if (action === 'export-save' && !game) {
    downloadJson(exportSave(save, pendingRun), '存档');
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
      writeSave(candidate.save, candidate.run);
    } catch {
      if (!saveLock) toast('浏览器无法写入存档，当前进度未更改');
      return;
    }
    Object.assign(save, candidate.save, { sound: save.sound });
    if (!save.journeyEnded && !save.pendingReincarnation) resolveActivity(save);
    pendingRun = candidate.run ? Game.restore(save, candidate.run.snapshot()) : null;
    storageAvailable = true;
    persist();
    pendingImport = null;
    selectedStage = save.unlocked;
    selectedTreasure = save.starter;
    treasurePage = Math.floor(catalogTreasures.findIndex((t) => t.id === save.starter) / 12);
    difficulty = 0;
    schoolFilter = 'all';
    bookTab = 'treasures';
    gameAudio.sync();
    returnLobby();
    if (save.journeyEnded) return;
    if (save.pendingReincarnation) {
      renderJourneyFarewell(save.pendingReincarnation);
      return;
    }
    if (lifespanInfo(save).remaining === 0) {
      renderLifespanEnd();
      return;
    }
    if (tribulationDue(save)) {
      renderTribulationPending();
      return;
    }
    if (!save.prologueSeen && save.mortal.hometown?.stage !== 'departed') renderPrologue();
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
    if (game || panel !== 'reward-ad' || !rewardAd || !adCompleted()) return;
    const kind = rewardAd;
    const supplies = adSupplies(save.unlocked);
    if (kind === 'root') {
      if (!attuneSpiritRoot(save, adRoot, adElements)) return;
      selectedTreasure = save.starter;
      treasurePage = Math.floor(catalogTreasures.findIndex((t) => t.id === save.starter) / 12);
    } else {
      save.stones += supplies.stones;
      save.iron += supplies.iron;
    }
    persist();
    closeRewardAd();
    toast(
      kind === 'root'
        ? `${spiritRootInfo(save.spiritRoot).name}已成 · ${treasure(save.starter).name}为本命 · 下次历练生效`
        : `仙缘补给 · 灵石 +${supplies.stones} · 玄铁 +${supplies.iron}`,
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
      `${damageReport(game)}<button class="primary-button guide-close" data-action="close">${resumeAfterDamage ? '继续修行' : '返回暂停界面'} ${smallIcon('arrow')}</button>`,
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
    if (panel !== 'revive-ad' || !adCompleted() || settled || !game?.revive()) return;
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
  if (action === 'reincarnate' && !game) {
    if (realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).max) {
      handleAction('immortal-gate');
      return;
    }
    panel = 'reincarnate';
    panelFrame(
      '轮回转世',
      '重启仙途',
      `<p class="pause-description">将清空此浏览器在当前网址的全部进度：累计年岁、境界修为、灵石玄铁、关卡、根基、法宝收藏与炼器，以及未完成的历练。</p><p class="panel-note">确认后无法撤销。从十五岁的凡人重新启程，收藏新本命五行对应的正魔入门法宝，重新随机灵根资质与五行，资质可能低于当前。</p><label class="reincarnate-opening"><input id="reincarnate-full-opening" type="checkbox"><span>重走十五岁那一程<small>重走序章、故居告别与离乡；不勾选则直接看新命盘。</small></span></label><div class="pause-actions"><button class="secondary-button" data-action="home">保留此世修行</button><button class="primary-button" data-action="confirm-reincarnate">确认轮回 · 清空进度</button></div>`,
    );
    return;
  }
  if (action === 'confirm-reincarnate' && panel === 'reincarnate' && !game) {
    trackReincarnation('manual');
    resetLifetime(
      undefined,
      modal.querySelector<HTMLInputElement>('#reincarnate-full-opening')?.checked ? 'full' : false,
      resolveInheritance(
        save,
        modal.querySelector<HTMLSelectElement>('#reincarnate-inheritance')?.value ?? '',
      ),
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
    } else {
      renderLobby();
      if (panel === 'settings') renderPanel();
    }
    toast(save.autoplay ? '自动历练已开启 · 自动走位与选技' : '已切回手动操作');
    return;
  }
  if (action === 'sound' || action === 'mute') {
    volumeOpen = action === 'sound' && !volumeOpen;
    soundSettings.setEnabled(action === 'sound', true);
    if (game) renderHud();
    else renderLobby();
    return;
  }
  if (action === 'close') {
    if (panel === 'treasure-detail' && treasureReturn) {
      const location = treasureReturn;
      treasureReturn = null;
      restorePanel(location);
      return;
    }
    if (panel === 'guide' && !game && guideReturn) {
      const location = guideReturn;
      guideReturn = null;
      restorePanel(location);
      return;
    }
    if (panel === 'journey-card') {
      if (journeyCardReturn === 'lifespan-farewell') renderJourneyFarewell('lifespan');
      else if (journeyCardReturn === 'tribulation-farewell') renderJourneyFarewell('tribulation');
      else showPanel('chronicle');
      return;
    }
    closeNpcChat();
    const wasHumanMemory = panel === 'human-memory';
    const returnToAbout = panel === 'about';
    const returnToSettings = panel === 'settings';
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
      if (inMarket) document.getElementById('sect-market-view')?.focus({ preventScroll: true });
      if (wasHumanMemory && inMortalWorld && !inTown) renderMortal();
      if (returnToAbout)
        ui.querySelector<HTMLButtonElement>('[data-action="about"]')?.focus({
          preventScroll: true,
        });
      if (returnToSettings)
        ui.querySelector<HTMLButtonElement>('[data-action="settings"]')?.focus({
          preventScroll: true,
        });
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
  if (action === 'about' && !game) {
    showPanel('about');
    return;
  }
  if (action === 'settings' && !game) {
    showPanel('settings');
    return;
  }
  if (action === 'settings-sound' && panel === 'settings') {
    soundSettings.toggle();
    renderLobby();
    renderPanel();
    return;
  }
  if (action.startsWith('offline-') && panel === 'settings') {
    void offlineAction(action);
    return;
  }
  if (action === 'telemetry-toggle' && panel === 'about') {
    telemetry.setEnabled(!telemetry.enabled());
    renderPanel();
    modal.querySelector<HTMLButtonElement>('[data-action="telemetry-toggle"]')?.focus();
    return;
  }
  if (action === 'guide') {
    if (!game || game.state === 'playing' || game.state === 'paused') {
      if (panel !== 'guide') guideReturn = game ? null : rememberPanel();
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
  if (
    medicinePanel.handle(action, id, {
      panel,
      hasGame: !!game,
      pendingRun: !!pendingRun,
      herbsShop: inTown && townNpc?.id === 'herbs',
    })
  )
    return;

  if (action === 'guide-tab') {
    guideTab = id!;
    renderPanel();
    modal.querySelector('.panel')?.scrollTo(0, 0);
    return;
  }
  if (action === 'journey-card' && (panel === 'chronicle' || panel === 'journey-card')) {
    void renderJourneyCard();
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
      const showStage = () => {
        renderLobby();
        ui.querySelector<HTMLButtonElement>(`.journey-node[data-id="${selectedStage}"]`)?.focus({
          preventScroll: true,
        });
      };
      if (ensureScene(selectedStage, showStage)) showStage();
    }
  }
  if (action === 'path' && !game && !save.mortal.member && isCultivationPath(id)) {
    save.path = id;
    if (alignStarterWithPath(save)) {
      selectedTreasure = save.starter;
      treasurePage = Math.floor(catalogTreasures.findIndex((t) => t.id === save.starter) / 12);
      schoolFilter = 'all';
    }
    persist();
    renderLobby();
  }
  if (action === 'treasure-page') {
    const treasures = catalogTreasures.filter(
      (t) => schoolFilter === 'all' || t.school === schoolFilter,
    );
    treasurePage = Math.max(
      0,
      Math.min(Math.ceil(treasures.length / 12) - 1, treasurePage + (id === 'next' ? 1 : -1)),
    );
    selectedTreasure = treasures[treasurePage * 12].id;
    renderPanel();
    modal.querySelector('.panel')?.scrollTo(0, 0);
    (
      modal.querySelector<HTMLButtonElement>(
        `.collection-pages button[data-id="${id}"]:not(:disabled)`,
      ) ?? modal.querySelector<HTMLButtonElement>('.collection-pages button:not(:disabled)')
    )?.focus({ preventScroll: true });
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
    treasureReturn = rememberPanel();
    selectedTreasure = id!;
    showPanel('treasure-detail');
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
    gameAudio.play('upgrade');
    if (tribulationDue(save)) renderTribulationPending();
  }
  if (action === 'start' || action === 'retry') {
    if (assetsReady && selectedStage <= save.unlocked && !pendingRun && !tribulationDue(save))
      void mobileDisplay.enter();
    startRun();
  }
  if (action === 'restore') {
    if (assetsReady && pendingRun) void mobileDisplay.enter();
    restoreRun();
  }
  if (action === 'new-run') {
    pendingRun = null;
    if (assetsReady && selectedStage <= save.unlocked && !tribulationDue(save))
      void mobileDisplay.enter();
    startRun();
  }
  if (action === 'next' && game) {
    selectedStage = Math.min(STAGES.length - 1, game.stage + 1);
    if (assetsReady && selectedStage <= save.unlocked && !tribulationDue(save))
      void mobileDisplay.enter();
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
    if (game.state === 'won') finishRun();
    else persist();
  }
  if (action === 'reroll' && game?.reroll()) {
    renderChoices();
    persist();
  }
}
document.addEventListener('click', (event) => {
  if (
    (event.target as Element).matches('.modal-backdrop') &&
    (modal.querySelector('[data-action="close"]') || panel === 'root-reveal')
  ) {
    handleAction('close');
    return;
  }
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
    document.getElementById('retreat-estimate')!.textContent = retreatEstimate(save, years);
    document.querySelector<HTMLButtonElement>('[data-action="retreat"]')!.disabled = !retreatPlan(
      save,
      years,
    );
    return;
  }
  const input = event.target as HTMLInputElement;
  if (!input.matches('input[data-volume]')) return;
  soundSettings.setVolume(Number(input.value) / 100);
  input.parentElement!.querySelector('output')!.textContent = `${input.value}%`;
  const settingsNote = modal.querySelector<HTMLElement>('[data-settings-sound-note]');
  if (settingsNote) settingsNote.textContent = settingsSoundNote(save);
});
document.addEventListener('change', async (event) => {
  const input = event.target as HTMLInputElement;
  if (
    (input.id === 'auction-kind' || input.id === 'auction-item') &&
    panel === 'sect-auction' &&
    inMarket
  ) {
    if (input.id === 'auction-kind')
      auctionKind = input.value === 'artifact' ? 'artifact' : 'medicine';
    refreshAuction(input.id === 'auction-item' ? input.value : '');
    modal.querySelector<HTMLElement>(`#${input.id}`)?.focus({ preventScroll: true });
    return;
  }
  if (input.id === 'sect-market-give' && panel === 'sect-market-event' && inMarket) {
    const scroll = modal.querySelector<HTMLElement>('.panel')?.scrollTop ?? 0;
    refreshMarketTrade(input.value);
    modal.querySelector<HTMLSelectElement>('#sect-market-give')?.focus({ preventScroll: true });
    const section = modal.querySelector<HTMLElement>('.panel');
    if (section) section.scrollTop = scroll;
    return;
  }
  if (
    input.id === 'reincarnate-inheritance' &&
    (panel === 'reincarnate' || panel === 'epilogue-reincarnate')
  ) {
    const preview = modal.querySelector<HTMLElement>('.inheritance-preview');
    if (preview) preview.innerHTML = inheritancePreview(save, input.value);
    return;
  }
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
      `<p class="pause-description">${realm.name} · 累计修为 ${imported.cultivation.toLocaleString('zh-CN', { useGrouping: false })}<br>${spiritRootInfo(imported.spiritRoot).name} · 年岁 ${imported.age.toFixed(1)}<br>${imported.stones} 灵石 · ${imported.iron} 玄铁<br>收藏法宝 ${imported.artifacts.length} 件 · 已通关 ${imported.completed.length} 境<br>丹囊 ${Object.values(imported.medicine.bag).reduce((total, count) => total + count, 0)} 份 · 已购药方 ${imported.medicine.recipes.length} 张 · 生效药效 ${activeMedicines(imported.medicine, imported.age).length} 种<br>人间缘簿 ${Object.keys(imported.mortal.humanStories ?? {}).length} 段 · 旧信与信物已备份<br>仙途履历 ${imported.chronicle.entries.length} 条 · ${imported.mortal.member ? '宗门身份与精研已备份' : '散修'}${imported.mortal.immortal?.claimed ? '<br>人间游历奇遇与领取记录已备份' : ''}${candidate.run ? `<br>未完成历练：${STAGES[candidate.run.stage].name} · ${formatTime(candidate.run.time)} · LV.${candidate.run.level}` : '<br>无未完成历练'}</p><p class="panel-note">导入会替换此网址的全部进度和续局。可先导出当前存档备份，取消不会更改进度。</p><div class="save-actions"><button class="secondary-button" data-action="export-save">备份当前存档</button><button class="secondary-button" data-action="cultivation">取消导入</button><button class="primary-button" data-action="confirm-import">确认覆盖并导入</button></div>`,
    );
  } catch (error) {
    if (!game && panel === 'cultivation')
      toast(error instanceof Error ? error.message : '存档读取失败，当前进度未更改');
  }
});
document.addEventListener('keydown', (event) => {
  if (
    (event.target as HTMLElement).matches('input[type="range"], input[type="number"]') &&
    !['Escape', 'Tab'].includes(event.key)
  )
    return;
  if (
    (event.target as HTMLElement).matches('input, textarea') &&
    !['Escape', 'Tab'].includes(event.key)
  )
    return;
  if (event.key === 'Tab' && modal.innerHTML) {
    const elements = [
      ...modal.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], summary, [tabindex="0"]',
      ),
    ].filter((element) => {
      if (
        element.tabIndex < 0 ||
        !element.getClientRects().length ||
        getComputedStyle(element).visibility === 'hidden'
      )
        return false;
      // 折叠 details 的子控件可能仍有布局框，但不能进入键盘焦点循环。
      for (
        let parent = element.parentElement;
        parent && parent !== modal;
        parent = parent.parentElement
      )
        if (
          parent instanceof HTMLDetailsElement &&
          !parent.open &&
          !parent.querySelector(':scope > summary')?.contains(element)
        )
          return false;
      return true;
    });
    if (!elements.length) return;
    const first = elements[0],
      last = elements[elements.length - 1];
    if (!elements.includes(document.activeElement as HTMLElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
    return;
  }
  if (saveLock) return;
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
  if (key === 'e' && !event.repeat && !save.autoplay && game?.state === 'playing') {
    event.preventDefault();
    handleAction('autoplay');
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
  renderer.restore();
});
document.addEventListener('visibilitychange', () => {
  lastMortalTick = performance.now();
  frameRate.sample(0, false);
  if (document.hidden) {
    clearInput();
    if (!save.autoplay && game?.state === 'playing') handleAction('pause');
    if ((game && !settled) || inMortalWorld) persist();
  } else renderer.restore();
});
window.addEventListener('pageshow', () => renderer.restore());
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
  if (d > 6) {
    touchHintDismissed = true;
    ui.querySelector<HTMLElement>('.touch-movement-hint')?.setAttribute('hidden', '');
  }
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
window.addEventListener('storage', (event) => {
  if (event.storageArea !== localStorage || (event.key !== SAVE_KEY && event.key !== null)) return;
  if (saveLock !== 'stale' && saveLock !== 'newer') lockStaleSave();
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
const screenAwake = new ScreenAwake();
const coarsePointer = matchMedia('(pointer: coarse)');
function syncScreenAwake() {
  screenAwake.setActive(
    coarsePointer.matches &&
      document.hasFocus() &&
      !saveLock &&
      !settled &&
      save.autoplay &&
      !!game &&
      (game.state === 'playing' || game.state === 'upgrade'),
  );
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
  syncScreenAwake();
  if (
    draw &&
    !inMortalWorld &&
    (canvasDirty ||
      renderer.needsRedraw ||
      !game ||
      game.state === 'playing' ||
      game.state !== lastRenderedState)
  ) {
    renderer.draw(
      game,
      now,
      game?.stage ?? selectedStage,
      game ? 0 : realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).index,
      save.path,
    );
    lastRenderedState = game?.state;
    canvasDirty = false;
  }
}
function frame(now: number) {
  // 先续接下一帧，避免切屏时一次临时绘图异常让整个循环永久停止。
  requestAnimationFrame(frame);
  frameRate.sample(now, !document.hidden && !inMortalWorld && game?.state === 'playing');
  syncScreenAwake();
  if (saveLock && !modal.querySelector('.save-lock')) renderSaveLock();
  if (save.journeyEnded) return;
  townScene?.update(
    now,
    townClockRunning(inTown, !!townScene?.ready, !document.hidden, document.hasFocus(), panel),
  );
  marketScene?.update(
    now,
    townClockRunning(inMarket, !!marketScene?.ready, !document.hidden, document.hasFocus(), panel),
  );
  ambushScene?.update(
    now,
    !saveLock && panel === 'market-ambush' && !document.hidden && document.hasFocus(),
  );
  tickMortal(now);
  tick(now, true);
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
initOffline();
renderLobby();
if (save.pendingReincarnation) renderJourneyFarewell(save.pendingReincarnation);
else if (lifespanInfo(save).remaining === 0) renderLifespanEnd();
else if (tribulationDue(save)) renderTribulationPending();
if (saveLock) renderSaveLock();
persist();
ensureScene(selectedStage, () => {
  if (!game && !inMortalWorld) renderLobby();
  if (saveLock) {
    renderSaveLock();
    return;
  }
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
