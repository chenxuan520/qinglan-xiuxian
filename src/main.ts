import { ironMarketContent } from './iron-market-ui.ts';
import { MedicinePanel } from './medicine-panel.ts';
import { cultivationPanel } from './cultivation-ui.ts';
import { bestiaryPanel } from './bestiary-ui.ts';
import { BattleHud } from './battle-hud.ts';
import { JourneyCardPanel } from './journey-card-panel.ts';
import { PanelHost, type PanelLocation } from './panel-host.ts';
import './medicine.css';
import {
  PROLOGUE_IMAGE,
  currentRealm,
  epilogueModal,
  epilogueReincarnatePanel,
  hometownChoicePanel,
  hometownFarewellModal,
  immortalGatePanel,
  journeyFarewellPanel,
  lifespanEndPanel,
  prologueModal,
  reincarnatePanel,
  rootRevealBody,
  rootRevealPanel,
  tribulationForfeitPanel,
  tribulationPendingPanel,
  tribulationWonPanel,
} from './opening-ui.ts';
import {
  damagePanel,
  deathModal,
  guidePanel,
  importConfirmPanel,
  lobbyView,
  pausePanel,
  restartRunPanel,
  retreatResultPanel,
  rootPickerView,
  saveLockPanel,
  sectDuesModal,
  settlementModal,
  upgradeChoicesModal,
  victoryModal,
} from './lobby-ui.ts';
import {
  enterTownVisit,
  executeAuctionTrade,
  executeMarketSocial,
  executeMortalAction,
  immortalEncounterPanel,
  marketAmbushPanel,
  teaStoryPanel,
} from './town-host.ts';
import { computeManualInput, trapModalTab } from './input-controller.ts';
import { dispatchAction, type ActionShell } from './action-controller.ts';
import * as sceneFlow from './scene-flow.ts';

import './styles.ts';
import './battle-hud.css';
import { inheritancePreview, isImmortalSuccessor } from './inheritance-ui.ts';
import { recordChronicle } from './chronicle.ts';
import './mortal.css';
import './home-town.css';
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
  fullscreenButton,
  retreatEstimate,
  damageReport,
  updateStorySoundButton,
  telemetryRow,
  ERROR_NOTICE_ACTIONS,
  ERROR_NOTICE_TEXT,
  ERROR_NOTICE_TITLE,
} from './common-ui.ts';
import { JOURNEY_MAP_IMAGE, JOURNEY_MAP_MOBILE_IMAGE } from './journey-map.ts';
import { ChronicleSource } from './chronicle-source.ts';
import {
  TREASURES,
  isCultivationPath,
  allowsSchool,
  STAGES,
  FINAL_TRIAL_STAGE,
  ENEMIES,
  treasure,
  MAX_REVIVES,
  spiritRootInfo,
  rollSpiritRoot,
  rootElementsFor,
  ELEMENTS,
  SPIRIT_ROOTS,
  type SpiritRootId,
  type ElementId,
  adSupplies,
} from './data.ts';
import {
  parseSave,
  readSave,
  freshSave,
  applyBirthInheritance,
  resolveInheritance,
  enterImmortalGate,
  SAVE_KEY,
  SAVE_SCHEMA,
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
import { GuideSource } from './guide-source.ts';
import { GAME_SITE_URL, SUPPORT_CODE_IMAGE, TELEMETRY_SETTINGS } from './setting.ts';
import { createTelemetry, type TelemetryEvent } from './telemetry.ts';
import { createErrorWatch } from './error-report.ts';
import { assetUrl } from './asset-url.ts';
import { MobileDisplay } from './mobile-display.ts';

import { ScreenAwake } from './screen-awake.ts';
import { FrameRate } from './frame-rate.ts';
import { GameAudio } from './game-audio.ts';
import { SoundSettings } from './sound-settings.ts';
import { TownScene } from './town-scene.ts';
import type { SectMarketScene } from './sect-market-scene.ts';
import { MarketEventSource } from './market-event-source.ts';
import { marketFellowCharacter, meetMarketFellow, chooseMarketFellow } from './market-fellow.ts';
import type { MarketAmbushScene } from './market-ambush-scene.ts';
import type { AmbushOutcome } from './market-ambush.ts';
import { marketCultivators } from './sect-market-data.ts';
import { prepareAuction } from './auction.ts';
import type { AuctionView } from './auction-ui.ts';
import type { AuctionKind } from './auction-data.ts';
import { MARKET_START, isMarketCultivatorId, type MarketCultivator } from './sect-market-data.ts';
import {
  sectMarketOpen,
  beginSectMarketVisit,
  exchangeSectMedicine,
  sectMarketExchangeReason,
  sectMarketOffer,
} from './sect-market.ts';
import { sectMarketPage } from './sect-market-page.ts';
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
import { closeNpcChat, mountNpcChat, mountTeaStory, NPC_AI_BASE } from './npc-chat-source.ts';
import { openOfflinePanel, offlineAction, initOffline } from './offline.ts';
import { settingsContent, settingsSoundNote, autoplayBuildContent } from './settings-ui.ts';
import { townVisit } from './town-history.ts';
import { meetTownImmortal } from './town-immortal.ts';
import { chooseSmithStory } from './town-story.ts';
import {
  HUMAN_STORIES,
  chooseHumanStory,
  syncHumanStories,
  isHumanStoryId,
  unreadHumanLetterKeys,
} from './human-stories.ts';

import { advanceMortal, resolveActivity, sectDuesPending, settleSectDues } from './mortal.ts';
import {
  mortalPage,
  mortalStatus,
  townPage,
  mortalTabContent,
  townEventContent,
  humanStoryContent,
  humanStoryJournal,
  hometownContent,
  hometownLetterContent,
  townStatus,
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
if (!save.journeyEnded && !save.pendingReincarnation && !save.mortal.marketSocial?.ambush)
  resolveActivity(save);
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
  const stored = JSON.parse(raw || '{}');
  if (saveRead.status !== 'unreadable' && stored.schema === SAVE_SCHEMA)
    pendingRun = restoreSavedRun(save, stored.activeRun);
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
let journeyCardReturn:
  | 'chronicle'
  | 'lifespan-farewell'
  | 'tribulation-farewell'
  | 'ambush-farewell'
  | 'epilogue' = 'chronicle';

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
const guideSource = new GuideSource();
const chronicleSource = new ChronicleSource();
const marketEventSource = new MarketEventSource();
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
let adWatchEpoch = 0;
let adTimer: number | undefined;
// 真实广告 SDK 看完回调置位；占位路径（倒计时走完）仍按 adReadyAt 判定。
let adWatched = false;
let victoryTimer: number | undefined;
let rewardAd: 'root' | 'supplies' | null = null;
let rewardReturn: PanelLocation | null = null;

let adRoot: SpiritRootId = 'heaven';
let adElements: ElementId[] = [];
let pendingImport: ReturnType<typeof importSave> | null = null;
let settlementRetryAt = 0;
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
  if (saveLock || settlementRetryAt || (game?.state === 'won' && !settled)) return;
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
function refreshAutoplaySettings(focusId?: string) {
  if (panel !== 'settings') return;
  const host = modal.querySelector<HTMLElement>('#settings-autoplay-build');
  if (!host) return;
  const section = modal.querySelector<HTMLElement>('.panel');
  const scroll = section?.scrollTop ?? 0;
  host.innerHTML = autoplayBuildContent(save);
  if (section) section.scrollTop = scroll;
  if (focusId) modal.querySelector<HTMLElement>(`#${focusId}`)?.focus({ preventScroll: true });
}
function lockStaleSave() {
  saveLock = 'stale';
  clearInput();
  game?.pause();
  renderSaveLock();
}
function renderSaveLock() {
  if (!saveLock) return;
  const view = saveLockPanel(saveLock, unreadableBackedUp);
  panel = 'save-lock';
  ui.inert = true;
  panelFrame(...view);
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
  commit: (next) => {
    try {
      syncHumanStories(next);
      writeSave(next, game && !settled ? game : pendingRun);
      storageAvailable = true;
      return true;
    } catch {
      if (!saveLock) {
        toast('暂时无法保存，本次操作未生效，请重试');
        storageAvailable = false;
      }
      return false;
    }
  },
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
  if (save.pendingReincarnation) {
    renderJourneyFarewell(save.pendingReincarnation);
    return;
  }
  if (save.mortal.marketSocial?.ambush && !saveLock) {
    if (!ambushScene && !panel.startsWith('market-ambush')) showMarketAmbush();
    return;
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
  const realm = currentRealm(save);
  const completed = save.completed.includes(FINAL_TRIAL_STAGE);
  document.body.classList.remove('in-game');
  document.body.classList.toggle('journey-complete', completed);
  document.body.classList.toggle('immortal-home', realm.max);
  ui.innerHTML = lobbyView(
    save,
    selectedStage,
    difficulty,
    volumeOpen,
    mobileDisplay,
    pendingRun,
    assetsReady,
    storageAvailable,
    window.matchMedia('(max-width: 640px)').matches,
  );
  ui.querySelector('.journey-actions [data-action="arsenal"]')?.remove();
  if (sectDuesPending(save)) renderSectDues();
  else if (returnYears !== undefined && returnYears > 0)
    toast(
      `山中一程，人间已过 ${returnYears < 0.1 ? '不足 0.1' : Number(returnYears.toFixed(1))} 年。`,
      3000,
    );
}

function renderEpilogue() {
  return sceneFlow.renderEpilogue(shellBindings());
}
function renderPrologue(replay = false) {
  if (save.journeyEnded) return;
  if ((!replay && save.prologueSeen) || game || inMortalWorld || panel) return;
  panel = 'prologue';
  ui.inert = true;
  modal.innerHTML = prologueModal(save, replay);
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
  return sceneFlow.releaseTownScene(shellBindings());
}
function leaveTown() {
  return sceneFlow.leaveTown(shellBindings());
}
function mountTownScene() {
  return sceneFlow.mountTownScene(shellBindings());
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

    panelFrame(...hometownChoicePanel(save));
    modal.querySelector('[data-action="close"]')?.remove();
  } else renderDeparture();
  return true;
}
function renderDeparture() {
  return sceneFlow.renderDeparture(shellBindings());
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
  return sceneFlow.showHometown(shellBindings(), parent);
}
function showTownEvent(npc: TownResident) {
  return sceneFlow.showTownEvent(shellBindings(), npc);
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
    npc = fellow;
  }
  marketNpc = npc;
  panel = 'sect-market-event';
  const render = () => {
    panelFrame(
      npc.name,
      npc.id === 'market-fellow' ? '宗门坊市 · 炉边故人' : '宗门坊市 · 同道往来',
      npc.id === 'market-fellow'
        ? marketEventSource.current!.marketFellowContent(save)
        : marketEventSource.current!.sectMarketEventContent(save, npc, !!pendingRun),
    );
    const chat = modal.querySelector<HTMLElement>('.npc-dialogue');
    if (npc.id !== 'market-fellow' && chat) mountNpcChat(chat, save, npc);
  };
  if (marketEventSource.current) {
    render();
    return;
  }
  panelFrame(
    npc.name,
    '宗门坊市 · 同道往来',
    '<div id="market-event-loading" role="status"><p class="panel-note">正在展开坊间见闻…</p></div>',
  );
  const host = modal.querySelector<HTMLElement>('#market-event-loading')!;
  const visit = save.mortal.sectMarket?.visit;
  const current = () =>
    host.isConnected &&
    !saveLock &&
    inMarket &&
    panel === 'sect-market-event' &&
    marketNpc === npc &&
    marketScene?.nearbyNpc?.id === npc.id &&
    save.mortal.sectMarket?.visit === visit;
  const load = () => {
    if (!current()) return;
    host.innerHTML = '<p class="panel-note">正在展开坊间见闻…</p>';
    void marketEventSource.load().then(
      () => {
        if (current()) render();
      },
      () => {
        if (!current()) return;
        host.innerHTML =
          '<p class="panel-note">坊间见闻暂时无法载入，请重试。</p><button class="secondary-button">重新展开</button>';
        host.querySelector<HTMLButtonElement>('button')!.onclick = load;
      },
    );
  };
  load();
}
function refreshMarketTrade(selected?: string) {
  if (!marketNpc || panel !== 'sect-market-event' || !marketEventSource.current) return;
  const host = modal.querySelector<HTMLElement>('#sect-market-trade');
  const section = modal.querySelector<HTMLElement>('.panel');
  const scroll = section?.scrollTop ?? 0;
  if (host)
    host.innerHTML = marketEventSource.current.sectMarketTradeContent(
      save,
      marketNpc,
      selected,
      !!pendingRun,
    );
  if (section) section.scrollTop = scroll;
}
function refreshMarketActivities() {
  if (!marketNpc || panel !== 'sect-market-event' || !marketEventSource.current) return;
  const host = modal.querySelector<HTMLElement>('#market-social');
  const section = modal.querySelector<HTMLElement>('.panel');
  const scroll = section?.scrollTop ?? 0;
  const opened = host
    ? [...host.querySelectorAll<HTMLDetailsElement>('details')].map((d) => d.open)
    : [];
  if (host) {
    host.innerHTML = marketEventSource.current.marketSocialContent(save, marketNpc, !!pendingRun);
    host
      .querySelectorAll<HTMLDetailsElement>('details')
      .forEach((d, index) => (d.open = opened[index] ?? false));
  }
  if (section) section.scrollTop = scroll;
}
let ambushFlow: Promise<typeof import('./market-ambush-flow.ts')> | undefined;
function loadAmbushFlow() {
  return (ambushFlow ??= import('./market-ambush-flow.ts').catch((error) => {
    ambushFlow = undefined;
    throw error;
  }));
}
function showMarketAmbush() {
  if (!save.mortal.marketSocial?.ambush || saveLock) return;
  panel = 'market-ambush-loading';
  closeNpcChat();
  panelFrame('山路逢劫', '坊市之外 · 退路未断', '<p>辨清来路，护住行囊…</p>');
  modal.querySelector('[data-action="close"]')?.remove();
  void loadAmbushFlow()
    .then((flow) => {
      if (!saveLock && save.mortal.marketSocial?.ambush && panel === 'market-ambush-loading')
        flow.mountAmbush(shellBindings());
    })
    .catch(() => {
      if (saveLock || panel !== 'market-ambush-loading') return;
      panel = 'market-ambush-recovery';
      panelFrame(
        '山路逢劫',
        '战斗暂歇',
        '<p>遭遇暂时无法载入，战斗保持暂停。</p><button class="primary-button" data-action="market-ambush-recover">重试载入</button>',
      );
      modal.querySelector('[data-action="close"]')?.remove();
    });
}
function handleMarketAmbushAction(action: string) {
  if (saveLock || !save.mortal.marketSocial?.ambush) return;
  if (action === 'market-ambush-recover') {
    showMarketAmbush();
    return;
  }
  void loadAmbushFlow()
    .then((flow) => {
      if (!saveLock && save.mortal.marketSocial?.ambush && !save.pendingReincarnation)
        flow.ambushAction(shellBindings(), action);
    })
    .catch(() => toast('遭遇暂时无法载入，请重试；战况仍然保留'));
}
function finishMarketAmbush(outcome: AmbushOutcome) {
  void loadAmbushFlow().then((flow) => {
    if (!saveLock && save.mortal.marketSocial?.ambush && !save.pendingReincarnation)
      flow.finishAmbush(shellBindings(), outcome);
  });
}
function showAuction() {
  return sceneFlow.showAuction(shellBindings());
}
function refreshAuction(selected = '') {
  const host = modal.querySelector<HTMLElement>('#auction-content');
  if (!host || panel !== 'sect-auction') return;
  const section = modal.querySelector<HTMLElement>('.panel');
  const scroll = section?.scrollTop ?? 0;
  host.innerHTML = marketEventSource.current!.auctionContent(
    save,
    auctionView,
    !!pendingRun,
    auctionKind,
    selected,
  );
  if (section) section.scrollTop = scroll;
}
function showTeaStory() {
  panel = 'tea-story';
  const story = teaStoryPanel();
  panelFrame(...story);
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
  return sceneFlow.showPanel(shellBindings(), name);
}
function rememberPanel(): PanelLocation {
  return sceneFlow.rememberPanel(shellBindings());
}
function restorePanel(location: PanelLocation) {
  return sceneFlow.restorePanel(shellBindings(), location);
}
function panelFrame(title: string, subtitle: string, body: string, wide = false) {
  return sceneFlow.panelFrame(shellBindings(), title, subtitle, body, wide);
}
async function renderJourneyCard() {
  if (
    panel === 'chronicle' ||
    panel === 'lifespan-farewell' ||
    panel === 'tribulation-farewell' ||
    panel === 'ambush-farewell' ||
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
        : journeyCardReturn === 'ambush-farewell'
          ? 'ambush'
          : undefined,
  );
}
function renderPanel() {
  return sceneFlow.renderPanel(shellBindings());
}
function renderHud() {
  return sceneFlow.renderHud(shellBindings());
}

function updateHud() {
  return sceneFlow.updateHud(shellBindings());
}

function renderChoices() {
  return sceneFlow.renderChoices(shellBindings());
}
function renderPause() {
  return sceneFlow.renderPause(shellBindings());
}
function gameEvent(name: string) {
  return sceneFlow.gameEvent(shellBindings(), name);
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
  const next = structuredClone(save);
  const result = settleRun(next, {
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
    loot: game.loot,
  });
  syncHumanStories(next);
  try {
    writeSave(next, null);
  } catch {
    if (!saveLock) {
      settlementRetryAt = performance.now() + 1500;
      panel = 'settlement-retry';
      panelFrame(
        '此行未结',
        '收拢行囊',
        '<p>此行收获暂时未能保存，正在重试。请暂留此页。</p><button class="primary-button" data-action="finish-run">重试保存收获</button>',
      );
      modal.querySelector('.panel-close')?.remove();
    }
    return;
  }
  settlementRetryAt = 0;
  panel = '';
  Object.assign(save, next);
  settled = true;
  rewards = result;
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
  return sceneFlow.renderVictory(shellBindings());
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
  modal.innerHTML = deathModal(game);
  modal.querySelector<HTMLButtonElement>('button')?.focus();
}
function showReviveAd() {
  return sceneFlow.showReviveAd(shellBindings());
}
// 广告是否已完整播放：真实 SDK 由观看回调置位，占位模式按倒计时完成判定。
function adCompleted() {
  return adWatched || (adReadyAt !== 0 && Date.now() >= adReadyAt);
}

// 真实 SDK 看过广告后的统一入口：解锁当前进程中的奖励按钮。
function markAdWatched(action: string, label: string) {
  return sceneFlow.markAdWatched(shellBindings(), action, label);
}

// 三个广告位的公共启动：能用 provider 就由 provider 播放，任何原因不可用（装死沉默也算）都回退占位倒计时。
function startAdWatch(action: string, label: string, placement: AdPlacement) {
  return sceneFlow.startAdWatch(shellBindings(), action, label, placement);
}

function startAdCountdown(action: string, label: string) {
  return sceneFlow.startAdCountdown(shellBindings(), action, label);
}
function refreshAdCountdown(action: string, label: string) {
  return sceneFlow.refreshAdCountdown(shellBindings(), action, label);
}
function renderRootPicker() {
  return sceneFlow.renderRootPicker(shellBindings());
}
function rememberRewardReturn() {
  return sceneFlow.rememberRewardReturn(shellBindings());
}
function renderSectDues() {
  if (!sectDuesPending(save)) return;
  panel = 'sect-dues';
  modal.innerHTML = sectDuesModal(save);
  modal.querySelector<HTMLButtonElement>('button')?.focus();
}
function showSuppliesShortage(stones: number, iron: number) {
  return sceneFlow.showSuppliesShortage(shellBindings(), stones, iron);
}
function showRewardAd(kind: 'root' | 'supplies') {
  return sceneFlow.showRewardAd(shellBindings(), kind);
}
function closeRewardAd() {
  return sceneFlow.closeRewardAd(shellBindings());
}
function renderResult() {
  return sceneFlow.renderResult(shellBindings());
}
function ensureScene(stage: number, next: () => void, run?: Game | null, tribulation = false) {
  return sceneFlow.ensureScene(shellBindings(), stage, next, run, tribulation);
}
function startRun() {
  return sceneFlow.startRun(shellBindings());
}
function restoreRun() {
  return sceneFlow.restoreRun(shellBindings());
}
function returnLobby() {
  return sceneFlow.returnLobby(shellBindings());
}
function rootRevealContent() {
  return rootRevealBody(save);
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
  panel = 'root-reveal';
  ui.inert = true;

  panelFrame(...rootRevealPanel(save, previousLife, firstLife, rootRevealContent()));
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
function trackReincarnation(
  result: 'lifespan' | 'tribulation' | 'ambush' | 'epilogue' | 'manual',
  previous = lifeStats(),
) {
  telemetry.track({ type: 'reincarnate', result, ...previous });
  telemetry.flush();
}
function resetLifetime(
  previousLife?: string,
  revisitHometown: boolean | 'full' = false,
  inheritance: BirthInheritance | null = null,
  successor = false,
) {
  const rerolling = panel === 'root-reveal' && !revisitHometown;
  const root = rollSpiritRoot();
  const { sound: soundEnabled, volume, prologueSeen, hometownSeen, autoplayBuild } = save;
  const next = Object.assign(freshSave(root, rootElementsFor(root), 'orthodox'), {
    sound: soundEnabled,
    volume,
    prologueSeen,
    hometownSeen,
    autoplayBuild: structuredClone(autoplayBuild),
  });
  applyBirthInheritance(next, inheritance);
  if (successor)
    recordChronicle(
      next,
      '承缘启程',
      '渡口的修士已证长生，离界而去。十五岁的少年循着他的指引，接续问道之路。',
      'immortal-successor',
    );
  if (successor && revisitHometown === true) {
    next.prologueSeen = true;
    next.hometownSeen = true;
  } else if (revisitHometown === 'full') {
    next.prologueSeen = false;
    next.hometownSeen = false;
  } else if (!revisitHometown) {
    next.prologueSeen = true;
    departHometown(next);
  }
  try {
    writeSave(next, null);
  } catch {
    if (!saveLock) toast('轮回尚未保存，旧世进度保留，请重试');
    return false;
  }
  Object.assign(save, next);
  shownHumanLetters.clear();
  clearInterval(adTimer);
  window.clearTimeout(victoryTimer);
  adReadyAt = 0;
  adWatchEpoch++;
  rewardAd = null;
  pendingImport = null;
  clearInput();
  ambushScene?.destroy();
  ambushScene = null;
  game = pendingRun = null;
  rewards = null;
  gameAudio.sync();
  selectedStage = difficulty = treasurePage = 0;
  selectedTreasure = save.starter;
  schoolFilter = 'all';
  bookTab = 'treasures';
  if (saveLock) return true;
  if (rerolling && refreshRootReveal()) return true;
  panel = '';
  modal.innerHTML = '';
  ui.inert = false;
  renderLobby();
  if (!save.prologueSeen) renderPrologue();
  if (previousLife && !successor) toast(previousLife);
  return true;
}
function renderTribulationPending() {
  if (game) {
    game.pause();
    previousState = game.state;
  }
  clearInput();
  panel = 'tribulation-pending';

  panelFrame(...tribulationPendingPanel(save, assetsReady, !!pendingRun?.tribulation));
  modal.querySelector('[data-action="close"]')?.remove();
}
function beginTribulation() {
  return sceneFlow.beginTribulation(shellBindings());
}
function renderTribulationForfeit() {
  if (game) {
    game.pause();
    previousState = game.state;
  }
  clearInput();
  panel = 'tribulation-forfeit';

  panelFrame(...tribulationForfeitPanel(game));
  modal.querySelector('[data-action="close"]')?.remove();
}
function finishTribulation() {
  return sceneFlow.finishTribulation(shellBindings());
}
function endLifetime() {
  const life = lifespanInfo(save);
  const realm = realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).name;
  return resetLifetime(
    `前世止于${realm}，享年 ${life.age.toFixed(1)} 年。尘缘已了，今世从十五岁再启仙途。`,
  );
}
function renderJourneyFarewell(reason: NonNullable<SaveData['pendingReincarnation']>) {
  clearInput();
  panel = `${reason}-farewell`;

  panelFrame(...journeyFarewellPanel(reason));
  modal.querySelector('[data-action="close"]')?.remove();
}
function beginJourneyFarewell(reason: NonNullable<SaveData['pendingReincarnation']>) {
  if (reason === 'ambush' && save.mortal.marketSocial?.ambush?.snapshot.outcome !== 'defeat')
    return;
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
  ambushScene?.destroy();
  ambushScene = null;
  leaveTown();
  inMortalWorld = false;
  settled = false;
  renderJourneyFarewell(reason);
}
function renderLifespanEnd() {
  clearInput();
  panel = 'lifespan-ended';

  panelFrame(...lifespanEndPanel(save));
  modal.querySelector('[data-action="close"]')?.remove();
}
function showLifespanAd() {
  return sceneFlow.showLifespanAd(shellBindings());
}
function clearInput() {
  keys.clear();
  touchInput = { x: 0, y: 0 };
  pointer = null;
  joystick.classList.remove('active');
  if (game) game.input = { x: 0, y: 0 };
}
function shellBindings(): ActionShell {
  // 同一组实时绑定供事件、HUD 和场景共用，避免高频重建 getter 闭包。
  const bindings = shellBindings as typeof shellBindings & { cached?: ActionShell };
  // prettier-ignore
  return (bindings.cached ??= {
    get ELEMENTS() { return ELEMENTS; },
    get FINAL_TRIAL_STAGE() { return FINAL_TRIAL_STAGE; },
    get Game() { return Game; },
    get HOMETOWN_START() { return HOMETOWN_START; },
    get HUMAN_STORIES() { return HUMAN_STORIES; },
    get SPIRIT_ROOTS() { return SPIRIT_ROOTS; },
    get STAGES() { return STAGES; },
    get abandonConfirm() { return abandonConfirm; },
    set abandonConfirm(next) { abandonConfirm = next; },
    get acceptHometownRoot() { return acceptHometownRoot; },
    get adCompleted() { return adCompleted; },
    get adElements() { return adElements; },
    set adElements(next) { adElements = next; },
    get adWatchEpoch() { return adWatchEpoch; },
    set adWatchEpoch(next) { adWatchEpoch = next; },
    get adReadyAt() { return adReadyAt; },
    set adReadyAt(next) { adReadyAt = next; },
    get adRoot() { return adRoot; },
    set adRoot(next) { adRoot = next; },
    get adSupplies() { return adSupplies; },
    get adTimer() { return adTimer; },
    set adTimer(next) { adTimer = next; },
    get aiChoiceTime() { return aiChoiceTime; },
    set aiChoiceTime(next) { aiChoiceTime = next; },
    get alignStarterWithPath() { return alignStarterWithPath; },
    get allowsSchool() { return allowsSchool; },
    get ambushScene() { return ambushScene; },
    set ambushScene(next) { ambushScene = next; },
    get assetsReady() { return assetsReady; },
    set assetsReady(next) { assetsReady = next; },
    get attuneSpiritRoot() { return attuneSpiritRoot; },
    get auctionKind() { return auctionKind; },
    set auctionKind(next) { auctionKind = next; },
    get auctionResult() { return marketEventSource.current!.auctionResult; },
    get auctionView() { return auctionView; },
    set auctionView(next) { auctionView = next; },
    get beginJourneyFarewell() { return beginJourneyFarewell; },
    get beginSectMarketVisit() { return beginSectMarketVisit; },
    get beginTribulation() { return beginTribulation; },
    get bestiaryStage() { return bestiaryStage; },
    set bestiaryStage(next) { bestiaryStage = next; },
    get bookTab() { return bookTab; },
    set bookTab(next) { bookTab = next; },
    get catalogTreasures() { return catalogTreasures; },
    get chooseHumanStory() { return chooseHumanStory; },
    get chooseMarketFellow() { return chooseMarketFellow; },
    get chooseSmithStory() { return chooseSmithStory; },
    get clearInput() { return clearInput; },
    get clearInterval() { return clearInterval.bind(globalThis); },
    get closeNpcChat() { return closeNpcChat; },
    get closeRewardAd() { return closeRewardAd; },
    get damagePanel() { return damagePanel; },
    get difficulty() { return difficulty; },
    set difficulty(next) { difficulty = next; },
    get document() { return document; },
    get downloadJson() { return downloadJson; },
    get endLifetime() { return endLifetime; },
    get ensureScene() { return ensureScene; },
    get enterImmortalGate() { return enterImmortalGate; },
    get enterTownVisit() { return enterTownVisit; },
    get epilogueReincarnatePanel() { return epilogueReincarnatePanel; },
    get exchangeSectMedicine() { return exchangeSectMedicine; },
    get executeAuctionTrade() { return executeAuctionTrade; },
    get executeMarketSocial() { return executeMarketSocial; },
    get executeMortalAction() { return executeMortalAction; },
    get exportSave() { return exportSave; },
    get extendLifespan() { return extendLifespan; },
    get finishDeparture() { return finishDeparture; },
    get finishMarketAmbush() { return finishMarketAmbush; },
    get finishRun() { return finishRun; },
    get forge() { return forge; },
    get freshTownPopulation() { return freshTownPopulation; },
    get game() { return game; },
    set game(next) { game = next; },
    get gameAudio() { return gameAudio; },
    get guideReturn() { return guideReturn; },
    set guideReturn(next) { guideReturn = next; },
    get guideTab() { return guideTab; },
    set guideTab(next) { guideTab = next; },
    get handleAction() { return handleAction; },
    get handleMarketAmbushAction() { return handleMarketAmbushAction; },
    get hometownLetterContent() { return hometownLetterContent; },
    get humanStoryContent() { return humanStoryContent; },
    get immortalGatePanel() { return immortalGatePanel; },
    get inMarket() { return inMarket; },
    set inMarket(next) { inMarket = next; },
    get inMortalWorld() { return inMortalWorld; },
    set inMortalWorld(next) { inMortalWorld = next; },
    get inTown() { return inTown; },
    set inTown(next) { inTown = next; },
    get isCultivationPath() { return isCultivationPath; },
    get isHumanStoryId() { return isHumanStoryId; },
    get isImmortalSuccessor() { return isImmortalSuccessor; },
    get ironMarketContent() { return ironMarketContent; },
    get isMarketCultivatorId() { return isMarketCultivatorId; },
    get journeyCardPanel() { return journeyCardPanel; },
    get journeyCardReturn() { return journeyCardReturn; },
    get lastFrame() { return lastFrame; },
    set lastFrame(next) { lastFrame = next; },
    get lastMortalTick() { return lastMortalTick; },
    set lastMortalTick(next) { lastMortalTick = next; },
    get leaveTown() { return leaveTown; },
    get lifeStats() { return lifeStats; },
    get lifespanInfo() { return lifespanInfo; },
    get marketEventSource() { return marketEventSource; },
    get marketNpc() { return marketNpc; },
    set marketNpc(next) { marketNpc = next; },
    get marketScene() { return marketScene; },
    set marketScene(next) { marketScene = next; },
    get medicinePanel() { return medicinePanel; },
    get mobileDisplay() { return mobileDisplay; },
    get modal() { return modal; },
    get mortalFilter() { return mortalFilter; },
    set mortalFilter(next) { mortalFilter = next; },
    get mortalTab() { return mortalTab; },
    set mortalTab(next) { mortalTab = next; },
    get mortalTabContent() { return mortalTabContent; },
    get nextAiMove() { return nextAiMove; },
    set nextAiMove(next) { nextAiMove = next; },
    get offlineAction() { return offlineAction; },
    get panel() { return panel; },
    set panel(next) { panel = next; },
    get panelFrame() { return panelFrame; },
    get pendingImport() { return pendingImport; },
    set pendingImport(next) { pendingImport = next; },
    get pendingRun() { return pendingRun; },
    set pendingRun(next) { pendingRun = next; },
    get performance() { return performance; },
    get persist() { return persist; },
    get previousState() { return previousState; },
    set previousState(next) { previousState = next; },
    get readHometownLetter() { return readHometownLetter; },
    get realmInfo() { return realmInfo; },
    get refreshAdCountdown() { return refreshAdCountdown; },
    get refreshAuction() { return refreshAuction; },
    get refreshMarketActivities() { return refreshMarketActivities; },
    get refreshMarketTrade() { return refreshMarketTrade; },
    get reincarnatePanel() { return reincarnatePanel; },
    get rememberPanel() { return rememberPanel; },
    get renderChoices() { return renderChoices; },
    get renderDeath() { return renderDeath; },
    get renderDeparture() { return renderDeparture; },
    get renderEpilogue() { return renderEpilogue; },
    get renderHud() { return renderHud; },
    get renderJourneyCard() { return renderJourneyCard; },
    get renderJourneyFarewell() { return renderJourneyFarewell; },
    get renderLifespanEnd() { return renderLifespanEnd; },
    get renderLobby() { return renderLobby; },
    get mortalStatus() { return mortalStatus; },
    get renderMortal() { return renderMortal; },
    get renderPanel() { return renderPanel; },
    get renderPause() { return renderPause; },
    get renderPrologue() { return renderPrologue; },
    get renderResult() { return renderResult; },
    get renderRootPicker() { return renderRootPicker; },
    get renderTribulationForfeit() { return renderTribulationForfeit; },
    get renderTribulationPending() { return renderTribulationPending; },
    get resetLifetime() { return resetLifetime; },
    get resolveActivity() { return resolveActivity; },
    get resolveInheritance() { return resolveInheritance; },
    get restorePanel() { return restorePanel; },
    get restoreRun() { return restoreRun; },
    get resumeAfterDamage() { return resumeAfterDamage; },
    set resumeAfterDamage(next) { resumeAfterDamage = next; },
    get retreat() { return retreat; },
    get retreatResultPanel() { return retreatResultPanel; },
    get returnLobby() { return returnLobby; },
    get rewardAd() { return rewardAd; },
    set rewardAd(next) { rewardAd = next; },
    get rootElementsFor() { return rootElementsFor; },
    get save() { return save; },
    get saveLock() { return saveLock; },
    get schoolFilter() { return schoolFilter; },
    set schoolFilter(next) { schoolFilter = next; },
    get sectMarketExchangeReason() { return sectMarketExchangeReason; },
    get sectMarketOffer() { return sectMarketOffer; },
    get sectMarketOpen() { return sectMarketOpen; },
    get selectedStage() { return selectedStage; },
    set selectedStage(next) { selectedStage = next; },
    get selectedTreasure() { return selectedTreasure; },
    set selectedTreasure(next) { selectedTreasure = next; },
    get settleSectDues() { return settleSectDues; },
    get settled() { return settled; },
    set settled(next) { settled = next; },
    get showHometown() { return showHometown; },
    get showLifespanAd() { return showLifespanAd; },
    get showMarketAmbush() { return showMarketAmbush; },
    get showMarketEvent() { return showMarketEvent; },
    get showPanel() { return showPanel; },
    get showReviveAd() { return showReviveAd; },
    get showRewardAd() { return showRewardAd; },
    get showTeaStory() { return showTeaStory; },
    get showTownEvent() { return showTownEvent; },
    get soundSettings() { return soundSettings; },
    get spiritRootInfo() { return spiritRootInfo; },
    get startRun() { return startRun; },
    get storageAvailable() { return storageAvailable; },
    set storageAvailable(next) { storageAvailable = next; },
    get structuredClone() { return structuredClone.bind(globalThis); },
    get syncHumanStories() { return syncHumanStories; },
    get syncMortalChange() { return syncMortalChange; },
    get telemetry() { return telemetry; },
    get toast() { return toast; },
    get townNpc() { return townNpc; },
    set townNpc(next) { townNpc = next; },
    get townPosition() { return townPosition; },
    set townPosition(next) { townPosition = next; },
    get townScene() { return townScene; },
    set townScene(next) { townScene = next; },
    get townStatus() { return townStatus; },
    get trackReincarnation() { return trackReincarnation; },
    get train() { return train; },
    get treasure() { return treasure; },
    get treasurePage() { return treasurePage; },
    set treasurePage(next) { treasurePage = next; },
    get treasureReturn() { return treasureReturn; },
    set treasureReturn(next) { treasureReturn = next; },
    get tribulationDue() { return tribulationDue; },
    get ui() { return ui; },
    get updateHud() { return updateHud; },
    get updateStorySoundButton() { return updateStorySoundButton; },
    get volumeOpen() { return volumeOpen; },
    set volumeOpen(next) { volumeOpen = next; },
    get window() { return window; },
    get writeSave() { return writeSave; },
    get AD_DURATION_MS() { return AD_DURATION_MS; },
    get AD_PLACEHOLDER_HTML() { return AD_PLACEHOLDER_HTML; },
    get AD_SECONDS() { return AD_SECONDS; },
    get ENEMIES() { return ENEMIES; },
    get GAME_SITE_URL() { return GAME_SITE_URL; },
    get GAME_VERSION() { return GAME_VERSION; },
    get JOURNEY_MAP_IMAGE() { return JOURNEY_MAP_IMAGE; },
    get JOURNEY_MAP_MOBILE_IMAGE() { return JOURNEY_MAP_MOBILE_IMAGE; },
    get MAX_REVIVES() { return MAX_REVIVES; },
    get PROLOGUE_IMAGE() { return PROLOGUE_IMAGE; },
    get SUPPORT_CODE_IMAGE() { return SUPPORT_CODE_IMAGE; },
    get TownScene() { return TownScene; },
    get URL() { return URL; },
    get adWatched() { return adWatched; },
    set adWatched(next) { adWatched = next; },
    get app() { return app; },
    get assetUrl() { return assetUrl; },
    get auctionContent() { return marketEventSource.current!.auctionContent; },
    get battleHud() { return battleHud; },
    get bestiaryPanel() { return bestiaryPanel; },
    get catalogPanel() { return marketEventSource.current!.catalogPanel; },
    get chronicleSource() { return chronicleSource; },
    get completeTribulation() { return completeTribulation; },
    get cultivationPanel() { return cultivationPanel; },
    get damageReport() { return damageReport; },
    get epilogueModal() { return epilogueModal; },
    get frameRate() { return frameRate; },
    get fullscreenButton() { return fullscreenButton; },
    get gameEvent() { return gameEvent; },
    get getAdProvider() { return getAdProvider; },
    get guidePanel() { return guidePanel; },
    get guideSource() { return guideSource; },
    get hometownContent() { return hometownContent; },
    get hometownFarewellModal() { return hometownFarewellModal; },
    get hometownParents() { return hometownParents; },
    get immortalEncounterPanel() { return immortalEncounterPanel; },
    get markAdWatched() { return markAdWatched; },
    get marketAmbushPanel() { return marketAmbushPanel; },
    get marketCultivators() { return marketCultivators; },
    get marketPosition() { return marketPosition; },
    set marketPosition(next) { marketPosition = next; },
    get meetTownImmortal() { return meetTownImmortal; },
    get mountNpcChat() { return mountNpcChat; },
    get mountTownScene() { return mountTownScene; },
    get oldRealm() { return oldRealm; },
    set oldRealm(next) { oldRealm = next; },
    get openOfflinePanel() { return openOfflinePanel; },
    get panelHost() { return panelHost; },
    get pausePanel() { return pausePanel; },
    get prepareAuction() { return prepareAuction; },
    get releaseTownScene() { return releaseTownScene; },
    get rememberRewardReturn() { return rememberRewardReturn; },
    get renderSectDues() { return renderSectDues; },
    get renderer() { return renderer; },
    get restartRunPanel() { return restartRunPanel; },
    get rewardReturn() { return rewardReturn; },
    set rewardReturn(next) { rewardReturn = next; },
    get rewards() { return rewards; },
    set rewards(next) { rewards = next; },
    get rootPickerView() { return rootPickerView; },
    get sceneLoading() { return sceneLoading; },
    set sceneLoading(next) { sceneLoading = next; },
    get settingsContent() { return settingsContent; },
    get refreshAutoplaySettings() { return refreshAutoplaySettings; },
    get settlementModal() { return settlementModal; },
    get showAuction() { return showAuction; },
    get startAdCountdown() { return startAdCountdown; },
    get startAdWatch() { return startAdWatch; },
    get telemetryRow() { return telemetryRow; },
    get touchHintDismissed() { return touchHintDismissed; },
    get townEventContent() { return townEventContent; },
    get townPage() { return townPage; },
    get townVisit() { return townVisit; },
    get tribulationWonPanel() { return tribulationWonPanel; },
    get upgradeChoicesModal() { return upgradeChoicesModal; },
    get victoryModal() { return victoryModal; },
    get victoryTimer() { return victoryTimer; },
    set victoryTimer(next) { victoryTimer = next; },
    get visitHometown() { return visitHometown; },
    get watchAdPlacement() { return watchAdPlacement; },
  });
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
  if (action === 'guide-tour' && panel === 'guide') {
    if (!assetsReady || sceneLoading) {
      toast('场景仍在准备，请稍后再试');
      return;
    }
    clearInput();
    guideSource.current?.startInterfaceTour(ui, modal);
    return;
  }
  dispatchAction(shellBindings(), action, id);
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
  if (panel === 'settings' && input.id === 'autoplay-build-mode') {
    handleAction('autoplay-build', input.value);
    return;
  }
  if (panel === 'settings' && /^autoplay-build-target-[01]$/.test(input.id)) {
    handleAction('autoplay-target', `${input.id.at(-1)}:${input.value}`);
    return;
  }
  if (
    (input.id === 'auction-kind' || input.id === 'auction-item') &&
    panel === 'sect-auction' &&
    inMarket
  ) {
    if (input.id === 'auction-kind')
      auctionKind =
        input.value === 'curio' ? 'curio' : input.value === 'artifact' ? 'artifact' : 'medicine';
    refreshAuction(input.id === 'auction-item' ? input.value : '');
    modal.querySelector<HTMLElement>(`#${input.id}`)?.focus({ preventScroll: true });
    return;
  }
  if (
    input.id === 'iron-quantity' &&
    panel === 'town-event' &&
    townNpc?.id === 'market' &&
    inTown
  ) {
    const scroll = modal.querySelector<HTMLElement>('.panel')?.scrollTop ?? 0;
    const host = modal.querySelector<HTMLElement>('#iron-market-trade');
    if (host) host.outerHTML = ironMarketContent(save, Number(input.value));
    modal.querySelector<HTMLElement>('#iron-quantity')?.focus({ preventScroll: true });
    const section = modal.querySelector<HTMLElement>('.panel');
    if (section) section.scrollTop = scroll;
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
    panel = 'import-confirm';

    panelFrame(...importConfirmPanel(candidate));
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
  if (trapModalTab(event, modal)) return;
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
    } else game.input = computeManualInput(keys, touchInput);
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
    if (settlementRetryAt && now >= settlementRetryAt && !saveLock && !settled) finishRun();
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
  if (guideSource.current?.tourActive) {
    lastFrame = lastMortalTick = now;
    return;
  }
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
  if (saveLock) guideSource.current?.stopInterfaceTour();
  if (guideSource.current?.tourActive) {
    lastFrame = lastMortalTick = now;
    return;
  }
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
else if (!save.mortal.marketSocial?.ambush && lifespanInfo(save).remaining === 0)
  renderLifespanEnd();
else if (!save.mortal.marketSocial?.ambush && tribulationDue(save)) renderTribulationPending();
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
