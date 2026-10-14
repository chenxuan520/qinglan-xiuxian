import { MedicinePanel } from './medicine-panel.ts';
import { catalogPanel } from './catalog-ui.ts';
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
  marketAmbushRecoveryPanel,
  teaStoryPanel,
} from './town-host.ts';
import { computeManualInput, trapModalTab } from './input-controller.ts';

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
import { chronicleContent } from './chronicle-ui.ts';
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
import { SectMarketScene } from './sect-market-scene.ts';
import { settleMarketAmbush } from './market-social.ts';
import { marketSocialContent } from './market-social-ui.ts';
import { marketFellowCharacter, meetMarketFellow, chooseMarketFellow } from './market-fellow.ts';
import { marketFellowContent } from './market-fellow-ui.ts';
import { MarketAmbushScene } from './market-ambush-scene.ts';
import type { AmbushOutcome } from './market-ambush.ts';
import { marketCultivators } from './sect-market-data.ts';
import { prepareAuction } from './auction.ts';
import { auctionContent, auctionResult, type AuctionView } from './auction-ui.ts';
import type { AuctionKind } from './auction-data.ts';
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

        panelFrame(...marketAmbushRecoveryPanel());
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
  leaveTown();
  inMortalWorld = false;
  game = pendingRun = null;
  clearInput();
  void mobileDisplay.leave();
  document.body.classList.remove('in-game', 'in-mortal', 'journey-complete', 'immortal-home');
  ui.innerHTML = '';
  ui.inert = true;
  panel = 'epilogue';
  modal.innerHTML = epilogueModal(save);
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
              modal.innerHTML = hometownFarewellModal();
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

    panelFrame(...hometownChoicePanel(save));
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

    panelFrame(...immortalEncounterPanel(save, npc, granted));
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
  const ambush = marketAmbushPanel(a.held);
  panelFrame(...ambush);
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
    panelFrame(...guidePanel(guideTab, !!game));
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
  modal.innerHTML = upgradeChoicesModal(game, save);
  modal.querySelector<HTMLButtonElement>('.choice-card')?.focus();
}
function renderPause() {
  if (!game) return;

  panelFrame(...pausePanel(game, save, frameRate.value, abandonConfirm));
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
  modal.innerHTML = victoryModal(game);
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
  modal.innerHTML = deathModal(game);
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
  container.innerHTML = rootPickerView(save, adRoot, adElements);
}
function rememberRewardReturn() {
  rewardReturn = rememberPanel();
}
function renderSectDues() {
  if (!sectDuesPending(save)) return;
  panel = 'sect-dues';
  modal.innerHTML = sectDuesModal(save);
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
  modal.innerHTML = settlementModal(save, game, rewards, oldRealm);
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

    panelFrame(...restartRunPanel());
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

  panelFrame(...tribulationPendingPanel(save, assetsReady, !!pendingRun?.tribulation));
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

  panelFrame(...tribulationForfeitPanel(game));
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

  panelFrame(...tribulationWonPanel(save, report, !!pendingRun));
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
  panel = reason === 'tribulation' ? 'tribulation-farewell' : 'lifespan-farewell';

  panelFrame(...journeyFarewellPanel(reason));
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

  panelFrame(...lifespanEndPanel(save));
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

      panelFrame(...epilogueReincarnatePanel(save));
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
    const gate = immortalGatePanel();
    panelFrame(...gate);
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
    const traded = executeAuctionTrade(
      save,
      next,
      action,
      id,
      visit,
      auctionKind,
      !!pendingRun,
      modal,
    );
    if (!traded) return;
    if (!traded.ok) {
      toast(traded.error);
      return;
    }
    const result = traded.result;
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
      const social = executeMarketSocial(
        next,
        action,
        id,
        visit,
        Number(button.dataset.level),
        !!pendingRun,
      );
      if (!social.ok) {
        if (social.stale) toast('这桩互动已变化，请重新查看；当前物资未改动');
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
        toast(social.message);
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
      const memory = enterTownVisit(save);
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
      const changed = executeMortalAction(save, action, id, pendingRun?.path);
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

    panelFrame(...damagePanel(game, resumeAfterDamage));
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

    panelFrame(...reincarnatePanel());
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
    panel = 'retreat-result';

    panelFrame(...retreatResultPanel(save, result));
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
