import {
  isExtremeLife,
  minimumDifficulty,
  difficultyAllowed,
  EXTREME_AD_ACTIONS,
  EXTREME_EXIT_ACTIONS,
} from './life-mode.ts';
import type { executeAuctionTrade } from './auction-ui.ts';
import { showSectService, showTownArrival } from './scene-flow.ts';
import type {
  adSupplies,
  allowsSchool,
  CultivationPath,
  ElementId,
  ENEMIES,
  isCultivationPath,
  rootElementsFor,
  SpiritRootId,
  spiritRootInfo,
  STAGES,
  Treasure,
  treasure,
} from './data.ts';
import { changeAutoplayBuild } from './autoplay-build.ts';
import { sectEntryMedicinePool } from './mortal.ts';
import type { ironMarketContent } from './iron-market-ui.ts';
import type { MedicinePanel } from './medicine-panel.ts';
import type { catalogPanel, forgeTreasure } from './catalog-ui.ts';
import type { cultivationPanel } from './cultivation-ui.ts';
import type { BattleHud } from './battle-hud.ts';
import type { JourneyCardPanel } from './journey-card-panel.ts';
import type { PanelHost, PanelLocation } from './panel-host.ts';
import type {
  epilogueModal,
  epilogueReincarnatePanel,
  hometownFarewellModal,
  immortalGatePanel,
  reincarnatePanel,
  tribulationWonPanel,
} from './opening-ui.ts';
import type {
  damagePanel,
  guidePanel,
  pausePanel,
  restartRunPanel,
  retreatResultPanel,
  rootPickerView,
  settlementModal,
  upgradeChoicesModal,
  victoryModal,
} from './lobby-ui.ts';
import type {
  enterTownVisit,
  executeMortalAction,
  immortalEncounterPanel,
  marketAmbushPanel,
} from './town-host.ts';
import type { executeMarketSocial } from './market-social-actions.ts';
import type { isImmortalSuccessor } from './inheritance-ui.ts';
import type { AD_SECONDS, AdPlacement, getAdProvider, watchAdPlacement } from './ads.ts';
import type { GAME_VERSION } from './version.ts';
import type {
  damageReport,
  fullscreenButton,
  telemetryRow,
  updateStorySoundButton,
} from './common-ui.ts';
import type { ChronicleSource } from './chronicle-source.ts';
import type {
  alignStarterWithPath,
  attuneSpiritRoot,
  BirthInheritance,
  completeTribulation,
  enterImmortalGate,
  extendLifespan,
  lifespanInfo,
  realmInfo,
  resolveInheritance,
  retreat,
  SaveData,
  settleRun,
  train,
  tribulationDue,
} from './progress.ts';
import type { Game } from './game.ts';
import type { exportSave, importSave } from './save-transfer.ts';
import type { Renderer } from './render.ts';
import type { GuideSource } from './guide-source.ts';
import type { createTelemetry } from './telemetry.ts';
import type { assetUrl } from './asset-url.ts';
import type { MobileDisplay } from './mobile-display.ts';
import type { FrameRate } from './frame-rate.ts';
import type { GameAudio } from './game-audio.ts';
import type { SoundSettings } from './sound-settings.ts';
import type { TownScene } from './town-scene.ts';
import type { TownSource } from './town-source.ts';
import type { SectMarketScene } from './sect-market-scene.ts';
import type { MarketEventSource } from './market-event-source.ts';
import type { chooseMarketFellow } from './market-fellow.ts';
import type { MarketAmbushScene } from './market-ambush-scene.ts';
import type { AmbushOutcome } from './market-ambush.ts';
import type {
  isMarketCultivatorId,
  MarketCultivator,
  marketCultivators,
} from './sect-market-data.ts';
import type { prepareAuction } from './auction.ts';
import type { auctionContent, auctionResult, AuctionView } from './auction-ui.ts';
import type { AuctionKind } from './auction-data.ts';
import type {
  beginSectMarketVisit,
  exchangeSectMedicine,
  sectMarketExchangeReason,
  sectMarketOffer,
  sectMarketOpen,
} from './sect-market.ts';
import type { HOMETOWN_START } from './town.ts';
import type {
  acceptHometownRoot,
  hometownParents,
  ParentId,
  readHometownLetter,
  visitHometown,
} from './hometown.ts';
import type { freshTownPopulation, TownResident } from './town-population.ts';
import type { closeNpcChat, mountNpcChat } from './npc-chat-source.ts';
import type { offlineAction, openOfflinePanel } from './offline.ts';
import type { settingsContent } from './settings-ui.ts';
import type { townVisit } from './town-history.ts';
import type { meetTownImmortal } from './town-immortal.ts';
import type { chooseSmithStory } from './town-story.ts';
import type {
  chooseHumanStory,
  HUMAN_STORIES,
  isHumanStoryId,
  syncHumanStories,
} from './human-stories.ts';
import type { resolveActivity, settleSectDues } from './mortal.ts';
import type {
  hometownContent,
  hometownLetterContent,
  humanStoryContent,
  mortalStatus,
  mortalTabContent,
  townEventContent,
  townPage,
  townStatus,
} from './mortal-ui.ts';

export interface ActionShell {
  readonly ELEMENTS: readonly { id: string }[];
  readonly FINAL_TRIAL_STAGE: number;
  readonly Game: typeof Game;
  readonly HOMETOWN_START: typeof HOMETOWN_START;
  readonly HUMAN_STORIES: typeof HUMAN_STORIES;
  readonly SPIRIT_ROOTS: readonly { id: string }[];
  readonly STAGES: typeof STAGES;
  abandonConfirm: boolean;
  readonly acceptHometownRoot: typeof acceptHometownRoot;
  readonly adCompleted: () => boolean;
  adElements: ElementId[];
  adReadyAt: number;
  adWatchEpoch: number;
  adRoot: SpiritRootId;
  readonly adSupplies: typeof adSupplies;
  adTimer: number | undefined;
  aiChoiceTime: number;
  readonly alignStarterWithPath: typeof alignStarterWithPath;
  readonly allowsSchool: typeof allowsSchool;
  ambushScene: MarketAmbushScene | null;
  assetsReady: boolean;
  readonly attuneSpiritRoot: typeof attuneSpiritRoot;
  auctionKind: AuctionKind;
  readonly auctionResult: typeof auctionResult;
  auctionView: AuctionView;
  readonly beginJourneyFarewell: (reason: NonNullable<SaveData['pendingReincarnation']>) => void;
  readonly beginSectMarketVisit: typeof beginSectMarketVisit;
  readonly beginTribulation: () => void;
  bestiaryStage: number;
  bestiaryDifficulty: number;
  bookTab: string;
  readonly catalogTreasures: Treasure[];
  readonly chooseHumanStory: typeof chooseHumanStory;
  readonly chooseMarketFellow: typeof chooseMarketFellow;
  readonly chooseSmithStory: typeof chooseSmithStory;
  readonly clearInput: () => void;
  readonly clearInterval: typeof clearInterval;
  readonly closeNpcChat: typeof closeNpcChat;
  readonly closeRewardAd: () => void;
  readonly damagePanel: typeof damagePanel;
  difficulty: number;
  readonly document: Document;
  readonly downloadJson: (text: string, name: string) => void;
  readonly endLifetime: () => boolean;
  readonly ensureScene: (
    stage: number,
    next: () => void,
    run?: Game | null,
    tribulation?: boolean,
    combat?: boolean,
  ) => boolean;
  readonly enterImmortalGate: typeof enterImmortalGate;
  readonly enterTownVisit: typeof enterTownVisit;
  readonly epilogueReincarnatePanel: typeof epilogueReincarnatePanel;
  readonly exchangeSectMedicine: typeof exchangeSectMedicine;
  readonly executeAuctionTrade: typeof executeAuctionTrade;
  readonly executeMarketSocial: typeof executeMarketSocial;
  readonly executeMortalAction: typeof executeMortalAction;
  readonly exportSave: typeof exportSave;
  readonly extendLifespan: typeof extendLifespan;
  readonly finishDeparture: (skipOpening?: boolean) => void;
  readonly finishMarketAmbush: (outcome: AmbushOutcome) => void;
  readonly finishRun: () => void;
  readonly forgeTreasure: typeof forgeTreasure;
  readonly freshTownPopulation: typeof freshTownPopulation;
  game: Game | null;
  readonly gameAudio: GameAudio;
  guideReturn: PanelLocation | null;
  guideTab: string;
  readonly handleAction: (action: string, id?: string) => void;
  readonly handleMarketAmbushAction: (action: string) => void;
  readonly hometownLetterContent: typeof hometownLetterContent;
  readonly humanStoryContent: typeof humanStoryContent;
  readonly immortalGatePanel: typeof immortalGatePanel;
  inMarket: boolean;
  inMortalWorld: boolean;
  inTown: boolean;
  readonly isCultivationPath: typeof isCultivationPath;
  readonly isHumanStoryId: typeof isHumanStoryId;
  readonly isImmortalSuccessor: typeof isImmortalSuccessor;
  readonly ironMarketContent: typeof ironMarketContent;
  readonly isMarketCultivatorId: typeof isMarketCultivatorId;
  readonly journeyCardPanel: JourneyCardPanel;
  readonly journeyCardReturn:
    | 'chronicle'
    | 'lifespan-farewell'
    | 'tribulation-farewell'
    | 'ambush-farewell'
    | 'extreme-farewell'
    | 'epilogue';
  journeyCardReturnLocation: PanelLocation | null;
  lastFrame: number;
  lastMortalTick: number;
  readonly leaveTown: () => void;
  readonly lifeStats: () => {
    realm: number;
    stage: number;
    runs: number;
    age: number;
    root: SpiritRootId;
    path: CultivationPath;
  };
  readonly lifespanInfo: typeof lifespanInfo;
  readonly marketEventSource: MarketEventSource;
  readonly townSource: TownSource;
  marketNpc: MarketCultivator | null;
  marketScene: SectMarketScene | null;
  readonly medicinePanel: MedicinePanel;
  readonly mobileDisplay: MobileDisplay;
  readonly modal: HTMLDivElement;
  mortalFilter: string;
  mortalTab: 'town' | 'sects';
  readonly mortalTabContent: typeof mortalTabContent;
  nextAiMove: number;
  readonly offlineAction: typeof offlineAction;
  panel: string;
  readonly panelFrame: (title: string, subtitle: string, body: string, wide?: boolean) => void;
  pendingImport: ReturnType<typeof importSave> | null;
  pendingRun: Game | null;
  readonly performance: Performance;
  readonly persist: () => void;
  previousState: string;
  readonly readHometownLetter: typeof readHometownLetter;
  readonly realmInfo: typeof realmInfo;
  readonly refreshAdCountdown: (action: string, label: string) => number;
  readonly refreshAuction: (selected?: string) => void;
  readonly refreshMarketActivities: () => void;
  readonly refreshMarketTrade: (selected?: string) => void;
  readonly reincarnatePanel: typeof reincarnatePanel;
  readonly rememberPanel: () => PanelLocation;
  readonly renderChoices: () => void;
  readonly renderDeath: () => void;
  readonly renderDeparture: () => void;
  readonly renderEpilogue: () => void;
  readonly renderHud: () => void;
  readonly renderJourneyCard: () => Promise<void>;
  readonly renderJourneyFarewell: (reason: NonNullable<SaveData['pendingReincarnation']>) => void;
  readonly renderLifespanEnd: () => void;
  readonly renderLobby: (returnYears?: number) => void;
  readonly renderMortal: (enter?: boolean) => void;
  readonly mortalStatus: typeof mortalStatus;
  readonly renderPanel: () => void;
  readonly renderPause: () => void;
  readonly renderPrologue: (replay?: boolean) => void;
  readonly renderResult: () => void;
  readonly renderRootPicker: () => void;
  readonly renderTribulationForfeit: () => void;
  readonly renderTribulationPending: () => void;
  readonly resetLifetime: (
    previousLife?: string,
    revisitHometown?: boolean | 'full',
    inheritance?: BirthInheritance | null,
    successor?: boolean,
  ) => boolean;
  readonly resolveActivity: typeof resolveActivity;
  readonly resolveInheritance: typeof resolveInheritance;
  readonly restorePanel: (location: PanelLocation) => void;
  readonly restoreRun: () => void;
  resumeAfterDamage: boolean;
  readonly retreat: typeof retreat;
  readonly retreatResultPanel: typeof retreatResultPanel;
  readonly returnLobby: () => void;
  rewardAd: 'root' | 'supplies' | null;
  readonly rootElementsFor: typeof rootElementsFor;
  readonly save: SaveData;
  readonly saveLock: 'unreadable' | 'newer' | 'stale' | null;
  schoolFilter: string;
  readonly sectMarketExchangeReason: typeof sectMarketExchangeReason;
  readonly sectMarketOffer: typeof sectMarketOffer;
  readonly sectMarketOpen: typeof sectMarketOpen;
  selectedStage: number;
  selectedTreasure: string;
  readonly settleSectDues: typeof settleSectDues;
  settled: boolean;
  readonly showHometown: (parent?: ParentId) => void;
  readonly showLifespanAd: () => void;
  readonly showMarketAmbush: () => void;
  readonly showMarketEvent: (npc: MarketCultivator) => void;
  readonly showPanel: (name: string) => void;
  readonly showReviveAd: () => void;
  readonly showRewardAd: (kind: 'root' | 'supplies') => void;
  readonly showTeaStory: () => void;
  readonly showTownEvent: (npc: TownResident) => void;
  readonly soundSettings: SoundSettings;
  readonly spiritRootInfo: typeof spiritRootInfo;
  readonly startRun: () => void;
  storageAvailable: boolean;
  readonly structuredClone: typeof structuredClone;
  readonly syncHumanStories: typeof syncHumanStories;
  readonly syncMortalChange: () => void;
  readonly telemetry: ReturnType<typeof createTelemetry>;
  readonly toast: (text: string, duration?: number) => void;
  townNpc: TownResident | null;
  townPosition: { x: number; y: number };
  townScene: TownScene | null;
  readonly townStatus: typeof townStatus;
  readonly trackReincarnation: (
    result: 'lifespan' | 'tribulation' | 'ambush' | 'extreme' | 'epilogue' | 'manual',
    previous?: ReturnType<ActionShell['lifeStats']>,
  ) => void;
  readonly train: typeof train;
  readonly treasure: typeof treasure;
  treasurePage: number;
  treasureReturn: PanelLocation | null;
  readonly tribulationDue: typeof tribulationDue;
  readonly ui: HTMLDivElement;
  readonly updateHud: () => void;
  readonly updateStorySoundButton: typeof updateStorySoundButton;
  volumeOpen: boolean;
  readonly window: Window;
  readonly writeSave: (data: SaveData, run: Game | null, reset?: boolean) => void;
  readonly AD_DURATION_MS: number;
  readonly AD_PLACEHOLDER_HTML: string;
  readonly AD_SECONDS: typeof AD_SECONDS;
  readonly ENEMIES: typeof ENEMIES;
  readonly GAME_SITE_URL: string;
  readonly GAME_VERSION: typeof GAME_VERSION;
  readonly JOURNEY_MAP_IMAGE: string;
  readonly JOURNEY_MAP_MOBILE_IMAGE: string;
  readonly MAX_REVIVES: number;
  readonly PROLOGUE_IMAGE: string;
  readonly SUPPORT_CODE_IMAGE: string;
  readonly URL: typeof URL;
  adWatched: boolean;
  readonly app: HTMLDivElement;
  readonly assetUrl: typeof assetUrl;
  readonly auctionContent: typeof auctionContent;
  readonly battleHud: BattleHud;
  readonly catalogPanel: typeof catalogPanel;
  readonly chronicleSource: ChronicleSource;
  readonly completeTribulation: typeof completeTribulation;
  readonly cultivationPanel: typeof cultivationPanel;
  readonly damageReport: typeof damageReport;
  readonly epilogueModal: typeof epilogueModal;
  readonly frameRate: FrameRate;
  readonly fullscreenButton: typeof fullscreenButton;
  readonly gameEvent: (name: string) => void;
  readonly getAdProvider: typeof getAdProvider;
  readonly guidePanel: typeof guidePanel;
  readonly guideSource: GuideSource;
  readonly hometownContent: typeof hometownContent;
  readonly hometownFarewellModal: typeof hometownFarewellModal;
  readonly hometownParents: typeof hometownParents;
  readonly immortalEncounterPanel: typeof immortalEncounterPanel;
  readonly markAdWatched: (action: string, label: string) => void;
  readonly marketAmbushPanel: typeof marketAmbushPanel;
  readonly marketCultivators: typeof marketCultivators;
  marketPosition: { x: number; y: number };
  readonly meetTownImmortal: typeof meetTownImmortal;
  readonly mountNpcChat: typeof mountNpcChat;
  readonly mountTownScene: () => void;
  oldRealm: string;
  readonly openOfflinePanel: typeof openOfflinePanel;
  readonly panelHost: PanelHost;
  readonly pausePanel: typeof pausePanel;
  readonly prepareAuction: typeof prepareAuction;
  readonly releaseTownScene: () => void;
  readonly rememberRewardReturn: () => void;
  readonly renderSectDues: () => void;
  readonly renderer: Renderer;
  readonly restartRunPanel: typeof restartRunPanel;
  rewardReturn: PanelLocation | null;
  rewards: ReturnType<typeof settleRun> | null;
  readonly rootPickerView: typeof rootPickerView;
  sceneLoading: boolean;
  readonly settingsContent: typeof settingsContent;
  readonly refreshAutoplaySettings: (focusId?: string) => void;
  readonly settlementModal: typeof settlementModal;
  readonly showAuction: () => void;
  readonly startAdCountdown: (action: string, label: string) => void;
  readonly startAdWatch: (action: string, label: string, placement: AdPlacement) => void;
  readonly telemetryRow: typeof telemetryRow;
  readonly touchHintDismissed: boolean;
  readonly townEventContent: typeof townEventContent;
  readonly townPage: typeof townPage;
  readonly townVisit: typeof townVisit;
  readonly tribulationWonPanel: typeof tribulationWonPanel;
  readonly upgradeChoicesModal: typeof upgradeChoicesModal;
  readonly victoryModal: typeof victoryModal;
  victoryTimer: number | undefined;
  readonly visitHometown: typeof visitHometown;
  readonly watchAdPlacement: typeof watchAdPlacement;
}

export function dispatchAction(shell: ActionShell, action: string, id?: string) {
  if (isExtremeLife(shell.save) && EXTREME_AD_ACTIONS.has(action)) return;
  if (
    isExtremeLife(shell.save) &&
    ((shell.game && !shell.settled) ||
      shell.pendingRun ||
      shell.save.mortal.marketSocial?.ambush) &&
    EXTREME_EXIT_ACTIONS.has(action)
  ) {
    shell.toast('极限模式入境无退，请继续战斗');
    return;
  }
  // 按原顺序逐组处理；分组返回 true 表示本次动作已处理完，不再交给后续分组。
  if (handleLockedState(shell, action)) return;
  if (
    shell.panel === 'settlement-retry' &&
    !shell.settled &&
    (shell.game?.state === 'won' || shell.game?.state === 'lost')
  ) {
    if (action === 'finish-run') shell.finishRun();
    return;
  }
  if (handleOpening(shell, action, id)) return;
  if (handleImmortalGate(shell, action)) return;
  if (handleNavigation(shell, action)) return;
  if (handleLifeLimit(shell, action)) return;
  if (handleMortalEntry(shell, action)) return;
  if (handleSectAndMarket(shell, action, id)) return;
  if (handleTown(shell, action, id)) return;
  if (handleSaveTransfer(shell, action)) return;
  if (handleRewardAd(shell, action, id)) return;
  if (handleRunOutcome(shell, action)) return;
  if (handleReincarnate(shell, action)) return;
  if (handleToggles(shell, action)) return;
  if (handlePanels(shell, action, id)) return;
  if (handlePreparation(shell, action, id)) return;
  handleRun(shell, action, id);
}

// 伏击未了、终章与待轮回时只处理对应动作；关闭留影时先取消生成。
function handleLockedState(shell: ActionShell, action: string): boolean {
  // 以持久遭遇为准，不能通过改面板、返回首页或导入存档绕过生死。
  if (shell.save.mortal.marketSocial?.ambush && !shell.save.pendingReincarnation) {
    shell.handleMarketAmbushAction(action);
    return true;
  }
  if (action === 'close' && shell.panel === 'journey-card') {
    shell.journeyCardPanel.cancel();
  }
  if (shell.save.journeyEnded) {
    if (
      action === 'journey-card' &&
      (shell.panel === 'epilogue' || shell.panel === 'journey-card')
    ) {
      void shell.renderJourneyCard();
    } else if (action === 'close' && shell.panel === 'journey-card') {
      shell.renderEpilogue();
    } else if (action === 'epilogue-reincarnate' && shell.panel === 'epilogue') {
      shell.panel = 'epilogue-reincarnate';

      shell.panelFrame(...shell.epilogueReincarnatePanel(shell.save));
    } else if (action === 'confirm-reincarnate' && shell.panel === 'epilogue-reincarnate') {
      const previous = shell.lifeStats();
      const reset = shell.resetLifetime(
        '修士离界，少年启程。一段指路的话，一场未尽的仙缘。',
        true,
        shell.resolveInheritance(
          shell.save,
          shell.modal.querySelector<HTMLSelectElement>('#reincarnate-inheritance')?.value ?? '',
        ),
        true,
      );
      if (reset) shell.trackReincarnation('epilogue', previous);
    } else if (action === 'close' && shell.panel === 'epilogue-reincarnate') shell.renderEpilogue();
    else if (action === 'epilogue-sound' && shell.panel === 'epilogue') {
      shell.soundSettings.toggle();
      shell.updateStorySoundButton(
        shell.modal.querySelector<HTMLButtonElement>('[data-action="epilogue-sound"]')!,
        shell.save.sound,
      );
    }
    return true;
  }
  // 留影只切换面板，不能解除已结束的人生状态。
  if (shell.save.pendingReincarnation) {
    if (action === 'journey-card') void shell.renderJourneyCard();
    else if (action === 'close' && shell.panel === 'journey-card')
      shell.renderJourneyFarewell(shell.save.pendingReincarnation);
    else if (
      action === 'confirm-journey-reincarnate' &&
      (shell.panel === 'lifespan-farewell' ||
        shell.panel === 'tribulation-farewell' ||
        shell.panel === 'ambush-farewell' ||
        shell.panel === 'extreme-farewell')
    ) {
      const reason = shell.save.pendingReincarnation;
      const previous = shell.lifeStats();
      const reset =
        reason === 'lifespan'
          ? shell.endLifetime()
          : shell.resetLifetime(
              reason === 'extreme'
                ? '前世问道止于险境，今世从十五岁再启仙途。'
                : reason === 'ambush'
                  ? '前世殒身于山路，未竟之志留待来生。今世从十五岁，再问长生。'
                  : '前世止于天劫，旧缘已散。今世从十五岁，再问长生。',
            );
      if (reset) shell.trackReincarnation(reason, previous);
    }
    return true;
  }
  return false;
}

// 命盘揭示、序章与离乡，以及故居和家书。
function handleOpening(shell: ActionShell, action: string, id?: string): boolean {
  if (shell.panel === 'root-reveal') {
    if (action === 'reroll-root')
      shell.resetLifetime(
        undefined,
        false,
        shell.save.birthInheritance,
        shell.isImmortalSuccessor(shell.save),
      );
    else if (action === 'accept-root' || action === 'close') {
      if (action === 'close' && isExtremeLife(shell.save)) return true;
      const next = structuredClone(shell.save);
      const hadInheritance = next.birthInheritance !== null;
      next.birthInheritance = null;
      if (!shell.acceptHometownRoot(next) && !hadInheritance) return true;
      try {
        shell.writeSave(next, null);
      } catch {
        if (!shell.saveLock) shell.toast('未能保存启程，请重试');
        return true;
      }
      Object.assign(shell.save, next);
      shell.difficulty = minimumDifficulty(shell.save);
      shell.ui.inert = false;
      shell.panel = '';
      shell.modal.innerHTML = '';
      shell.renderLobby();
      shell.ui
        .querySelector<HTMLButtonElement>('[data-action="start"]')
        ?.focus({ preventScroll: true });
    }
    return true;
  }
  if (shell.panel === 'prologue') {
    if (action === 'prologue-sound') {
      shell.soundSettings.toggle();
      shell.updateStorySoundButton(
        shell.modal.querySelector<HTMLButtonElement>('[data-action="prologue-sound"]')!,
        shell.save.sound,
      );
      return true;
    }
    if (
      action === 'prologue-skip' &&
      !shell.save.prologueSeen &&
      !shell.pendingRun &&
      shell.save.mortal.hometown &&
      ['farewell', 'walk'].includes(shell.save.mortal.hometown.stage)
    ) {
      shell.finishDeparture(true);
      return true;
    }
    if (action === 'prologue-enter' || action === 'prologue-skip' || action === 'close') {
      const replay = shell.save.prologueSeen;
      if (
        action === 'prologue-enter' &&
        !replay &&
        !shell.pendingRun &&
        shell.save.mortal.hometown &&
        ['farewell', 'walk'].includes(shell.save.mortal.hometown.stage)
      )
        void shell.mobileDisplay.enter();
      shell.save.prologueSeen = true;
      shell.ui.inert = false;
      shell.panel = '';
      shell.modal.innerHTML = '';
      shell.persist();
      shell.renderLobby();
      if (replay)
        shell.ui.querySelector<HTMLButtonElement>('[data-action="prologue-revisit"]')?.focus({
          preventScroll: true,
        });
    }
    return true;
  }
  if (action === 'prologue-revisit') {
    shell.renderPrologue(true);
    return true;
  }
  if (
    shell.save.mortal.hometown &&
    ['farewell', 'walk'].includes(shell.save.mortal.hometown.stage) &&
    !shell.save.pendingReincarnation &&
    !shell.game &&
    !shell.pendingRun &&
    shell.lifespanInfo(shell.save).remaining > 0 &&
    !shell.tribulationDue(shell.save)
  ) {
    if (action === 'hometown-walk' && shell.panel === 'hometown-choice') {
      const next = shell.structuredClone(shell.save);
      next.hometownSeen = false;
      try {
        shell.writeSave(next, null);
      } catch {
        if (!shell.saveLock) shell.toast('暂时无法保存启程选择，请重试');
        return true;
      }
      Object.assign(shell.save, next);
      void shell.mobileDisplay.enter();
      shell.renderDeparture();
    } else if (action === 'hometown-skip' && shell.panel === 'hometown-choice')
      shell.finishDeparture();
    else if (action === 'hometown-continue' && shell.panel === 'hometown-farewell') {
      shell.save.mortal.hometown.stage = 'walk';
      shell.persist();
      shell.ui.inert = false;
      shell.panel = '';
      shell.modal.innerHTML = '';
      shell.document.getElementById('town-view')?.focus({ preventScroll: true });
      shell.townScene?.toggleDockNavigation();
    } else if (action === 'town-retry') shell.renderDeparture();
    else if (action === 'town-talk' && !shell.panel) shell.townScene?.talk();
    if (action !== 'fullscreen') return true;
  }
  if (action === 'hometown-home' && shell.panel === 'hometown-home') {
    shell.showHometown();
    return true;
  }
  if (
    action === 'hometown-parent' &&
    shell.panel === 'hometown-home' &&
    (id === 'father' || id === 'mother')
  ) {
    shell.showHometown(id);
    return true;
  }
  if (
    action === 'hometown-letter' &&
    shell.inMortalWorld &&
    shell.save.mortal.hometown?.letterFoundAt != null &&
    ['hometown-home', 'human-journal', 'human-memory', ''].includes(shell.panel)
  ) {
    if (shell.readHometownLetter(shell.save)) shell.persist();
    shell.panel = 'human-memory';
    shell.panelFrame('故居家书', '人间缘簿 · 家中旧字', shell.hometownLetterContent(shell.save));
    return true;
  }
  return false;
}

// 修为圆满后叩入仙门。
function handleImmortalGate(shell: ActionShell, action: string): boolean {
  if (
    action === 'immortal-gate' &&
    !shell.game &&
    !shell.inMortalWorld &&
    shell.realmInfo(shell.save.cultivation, shell.save.completed.includes(shell.FINAL_TRIAL_STAGE))
      .max
  ) {
    shell.panel = 'immortal-gate';
    const gate = shell.immortalGatePanel();
    shell.panelFrame(...gate);
    return true;
  }
  if (action === 'confirm-immortal-gate' && shell.panel === 'immortal-gate' && !shell.game) {
    const ended = shell.structuredClone(shell.save);
    if (!shell.enterImmortalGate(ended)) return true;
    try {
      shell.writeSave(ended, null);
    } catch {
      if (!shell.saveLock) shell.toast('浏览器无法保存终章，此世尚未结束，请释放存储空间后重试');
      return true;
    }
    Object.assign(shell.save, ended);
    shell.pendingRun = null;
    shell.telemetry.track({ type: 'epilogue', ...shell.lifeStats() });
    shell.telemetry.flush();
    shell.renderEpilogue();
    return true;
  }
  return false;
}

// 全屏切换，以及首页山河图与行前准备的定位。
function handleNavigation(shell: ActionShell, action: string): boolean {
  if (action === 'fullscreen' && (shell.game || shell.inTown || shell.inMarket)) {
    void (shell.mobileDisplay.active ? shell.mobileDisplay.leave() : shell.mobileDisplay.enter());
    return true;
  }
  if (action === 'journey-map' && !shell.game) {
    shell.ui
      .querySelector<HTMLButtonElement>('.journey-node.selected')
      ?.focus({ preventScroll: true });
    shell.ui.querySelector('.journey-map-heading')?.scrollIntoView({
      block: 'start',
      behavior: shell.window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
    return true;
  }
  if ((action === 'revisit' || action === 'journey-prepare') && !shell.game) {
    shell.ui.querySelector<HTMLButtonElement>('.journey-depart [data-action="start"]')?.focus({
      preventScroll: true,
    });
    shell.ui.querySelector('.journey-selection')?.scrollIntoView({
      block: 'start',
      behavior: shell.window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
    return true;
  }
  return false;
}

// 天劫与寿尽：迎劫或放弃、寿尽落幕与借寿。
function handleLifeLimit(shell: ActionShell, action: string): boolean {
  if (shell.panel === 'tribulation-forfeit') {
    if (action === 'confirm-forfeit') {
      shell.beginJourneyFarewell('tribulation');
    } else if (action === 'cancel-forfeit' || action === 'close') {
      if (shell.game?.tribulation) {
        shell.panel = '';
        shell.game.state === 'lost' ? shell.renderDeath() : shell.renderPause();
      } else shell.renderTribulationPending();
    }
    return true;
  }
  if (action === 'tribulation-start' && shell.tribulationDue(shell.save)) {
    if (shell.assetsReady) void shell.mobileDisplay.enter();
    shell.beginTribulation();
    return true;
  }
  if (action === 'tribulation-forfeit' && shell.tribulationDue(shell.save)) {
    shell.renderTribulationForfeit();
    return true;
  }
  if (shell.tribulationDue(shell.save) && !shell.game?.tribulation) {
    shell.renderTribulationPending();
    return true;
  }

  if (shell.panel === 'lifespan-ended' && !['watch-lifespan-ad', 'end-lifetime'].includes(action))
    return true;
  if (
    action === 'end-lifetime' &&
    shell.panel === 'lifespan-ended' &&
    shell.lifespanInfo(shell.save).remaining === 0
  ) {
    shell.beginJourneyFarewell('lifespan');
    return true;
  }
  if (action === 'watch-lifespan-ad') {
    shell.showLifespanAd();
    return true;
  }
  if (
    shell.panel === 'lifespan-ad' &&
    ['close', 'cancel-lifespan', 'claim-lifespan'].includes(action)
  ) {
    const claim = action === 'claim-lifespan';
    if (claim && !shell.adCompleted()) return true;
    const target = shell.game ?? shell.pendingRun;
    const years = claim ? (target ? target.borrowLife() : shell.extendLifespan(shell.save)) : 0;
    if (years) shell.resolveActivity(shell.save);
    shell.clearInterval(shell.adTimer);
    shell.adReadyAt = 0;
    shell.persist();
    if (shell.lifespanInfo(shell.save).remaining === 0) shell.renderLifespanEnd();
    else if (shell.game) {
      shell.panel = '';
      shell.previousState = shell.game.state;
      shell.renderPause();
      shell.updateHud();
    } else {
      shell.panel = '';
      shell.modal.innerHTML = '';
      shell.renderLobby();
    }
    if (years) shell.toast(`向天借寿 · 寿元 +${years} 年`);
    return true;
  }
  return false;
}

// 宗门供奉补缴与进入人间。
function handleMortalEntry(shell: ActionShell, action: string): boolean {
  if (shell.panel === 'sect-dues') {
    if (action === 'dues-ad') shell.showRewardAd('supplies');
    else if (action === 'dues-pay' || action === 'dues-decline') {
      if (!shell.settleSectDues(shell.save, action === 'dues-decline')) return true;
      shell.panel = '';
      shell.modal.innerHTML = '';
      shell.persist();
      if (shell.inMortalWorld) shell.syncMortalChange();
      else shell.renderLobby();
      shell.toast(action === 'dues-pay' ? '供奉已补缴，继续游历' : '已离宗，精研成果仍保留');
    }
    return true;
  }
  if (action === 'mortal-enter' && !shell.game) {
    if (shell.lifespanInfo(shell.save).remaining === 0) {
      shell.renderLifespanEnd();
      return true;
    }
    shell.renderMortal(true);
    shell.persist();
    return true;
  }
  return false;
}

// 本门传习，以及坊市拍卖、场馆办事与修士往来。
function handleSectAndMarket(shell: ActionShell, action: string, id?: string): boolean {
  if (
    action.startsWith('auction-') &&
    shell.inMortalWorld &&
    shell.inMarket &&
    !shell.game &&
    shell.panel === 'sect-auction' &&
    shell.marketScene?.nearAuction
  ) {
    if (['auction-hall', 'auction-hall-confirm', 'auction-hall-cancel'].includes(action)) {
      shell.marketEventSource.current?.auctionHallAction(shell, id, action);
      return true;
    }
    if (action === 'auction-view' && (id === 'buy' || id === 'sell' || id === 'history')) {
      shell.auctionView = id;
      shell.refreshAuction();
      return true;
    }
    const button = shell.modal.querySelector<HTMLButtonElement>(
      action === 'auction-buy'
        ? `[data-action="auction-buy"][data-id="${Number(id)}"]`
        : '[data-action="auction-sell"]',
    );
    if (!button || button.disabled) return true;
    const visit = Number(button.dataset.visit);
    const next = shell.structuredClone(shell.save);
    const traded = shell.executeAuctionTrade(
      shell.save,
      next,
      action,
      id,
      visit,
      shell.auctionKind,
      !!shell.pendingRun,
      shell.modal,
    );
    if (!traded) return true;
    if (!traded.ok) {
      shell.toast(traded.error);
      return true;
    }
    const result = traded.result;
    const message = traded.message || shell.auctionResult(shell.save, result);
    try {
      shell.writeSave(next, shell.pendingRun);
    } catch {
      if (!shell.saveLock) shell.toast('拍卖未完成：浏览器暂时无法保存，请重试');
      return true;
    }
    Object.assign(shell.save, next);
    shell.refreshAuction(result.id);
    const status = shell.document.getElementById('town-status');
    if (status) status.innerHTML = shell.townStatus(shell.save);
    const note = shell.modal.querySelector<HTMLElement>('#auction-result');
    if (note) {
      note.hidden = false;
      note.textContent = message;
    }
    shell.toast(message);
    return true;
  }
  if (action === 'sect-service-open') {
    showSectService(shell);
    return true;
  }
  if (action.startsWith('sect-service-')) {
    shell.marketEventSource.current?.sectServiceAction(shell, action, id);
    return true;
  }
  if (action.startsWith('market-venue-')) {
    shell.marketEventSource.current?.marketVenueAction(shell, action, id);
    return true;
  }
  if (action.startsWith('sect-market-') && shell.inMortalWorld && !shell.game) {
    if (
      action === 'sect-market-enter' &&
      !shell.panel &&
      !shell.inMarket &&
      !shell.inTown &&
      shell.mortalTab === 'sects' &&
      shell.sectMarketOpen(shell.save)
    ) {
      const next = shell.structuredClone(shell.save);
      next.mortal.population ??= shell.freshTownPopulation(next.age);
      if (!shell.beginSectMarketVisit(next)) return true;
      try {
        shell.writeSave(next, shell.pendingRun);
      } catch {
        if (!shell.saveLock) shell.toast('浏览器暂时无法保存坊市进度，请重试');
        return true;
      }
      Object.assign(shell.save, next);
      shell.inMarket = true;
      shell.inTown = false;
      shell.lastMortalTick = shell.performance.now();
      void shell.mobileDisplay.enter();
      shell.renderMortal();
      shell.document.getElementById('sect-market-view')?.focus({ preventScroll: true });
    } else if (action === 'sect-market-retry' && shell.inMarket && !shell.panel)
      shell.renderMortal();
    else if (action === 'sect-market-exit' && shell.inMarket && !shell.panel) {
      shell.leaveTown();
      shell.persist();
      shell.renderMortal();
      shell.document.querySelector<HTMLButtonElement>('[data-action="sect-market-enter"]')?.focus();
    } else if (action === 'sect-market-talk' && shell.inMarket && !shell.panel)
      shell.marketScene?.talk();
    else if (
      action === 'sect-market-fellow' &&
      shell.inMarket &&
      shell.panel === 'sect-market-event' &&
      shell.marketNpc?.id === 'market-fellow' &&
      shell.marketScene?.nearbyNpc?.id === 'market-fellow' &&
      (id === 'stay' || id === 'travel' || id === 'read')
    ) {
      const button = shell.modal.querySelector<HTMLButtonElement>(
        `[data-action="sect-market-fellow"][data-id="${id}"]`,
      );
      if (!button || button.disabled) return true;
      const next = shell.structuredClone(shell.save);
      if (!shell.chooseMarketFellow(next, id, Number(button.dataset.visit))) return true;
      try {
        shell.writeSave(next, shell.pendingRun);
      } catch {
        if (!shell.saveLock) shell.toast('这次交谈未能保存，请重试');
        return true;
      }
      Object.assign(shell.save, next);
      shell.showMarketEvent(shell.marketNpc);
    } else if (
      [
        'sect-market-debate',
        'sect-market-debate-pay',
        'sect-market-debate-swap',
        'sect-market-request',
        'sect-market-inspect',
        'sect-market-opportunity',
        'sect-market-decline',
      ].includes(action) &&
      shell.inMarket &&
      shell.panel === 'sect-market-event' &&
      shell.isMarketCultivatorId(id) &&
      shell.marketNpc?.id === id &&
      shell.marketScene?.nearbyNpc?.id === id
    ) {
      const button = shell.modal.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
      if (!button || button.disabled) return true;
      const visit = Number(button.dataset.visit);
      const next = shell.structuredClone(shell.save);
      const social = shell.executeMarketSocial(
        next,
        action,
        id,
        visit,
        Number(button.dataset.level),
        !!shell.pendingRun,
        button.dataset.debateChoice ?? 'talk',
      );
      if (!social.ok) {
        if (social.stale) shell.toast('这桩互动已变化，请重新查看；当前物资未改动');
        return true;
      }
      try {
        shell.writeSave(next, shell.pendingRun);
      } catch {
        if (!shell.saveLock) shell.toast('互动未完成：浏览器暂时无法保存，请重试');
        return true;
      }
      Object.assign(shell.save, next);
      if (next.mortal.marketSocial?.ambush) shell.showMarketAmbush();
      else {
        shell.refreshMarketActivities();
        shell.refreshMarketTrade();
        shell.toast(social.message);
      }
      const status = shell.document.getElementById('town-status');
      if (status) status.innerHTML = shell.townStatus(shell.save);
    } else if (
      action === 'sect-market-exchange' &&
      shell.inMarket &&
      shell.panel === 'sect-market-event' &&
      shell.isMarketCultivatorId(id) &&
      shell.marketNpc?.id === id &&
      shell.marketScene?.nearbyNpc?.id === id
    ) {
      const give = shell.modal.querySelector<HTMLSelectElement>('#sect-market-give')?.value ?? '';
      const visit = Number(
        shell.modal.querySelector<HTMLButtonElement>('[data-action="sect-market-exchange"]')
          ?.dataset.visit,
      );
      const reason = shell.sectMarketExchangeReason(
        shell.save,
        id,
        give,
        visit,
        !!shell.pendingRun,
      );
      if (reason) {
        shell.toast(reason);
        return true;
      }
      const next = shell.structuredClone(shell.save);
      if (!shell.exchangeSectMedicine(next, id, give, visit, !!shell.pendingRun)) return true;
      try {
        shell.writeSave(next, shell.pendingRun);
      } catch {
        if (!shell.saveLock) shell.toast('互换未完成：浏览器暂时无法保存，请重试');
        return true;
      }
      Object.assign(shell.save, next);
      shell.refreshMarketTrade();
      shell.refreshMarketActivities();
      const status = shell.document.getElementById('town-status');
      if (status) status.innerHTML = shell.townStatus(shell.save);
      shell.toast(
        next.mortal.events[0]?.split(' · ').slice(1).join(' · ') || '互换完成，丹药已收入丹囊',
      );
    }
    return true;
  }
  return false;
}

// 青岚镇与人间：入镇、镇民旧事、市集买卖、宗门与研习委托。
function handleTown(shell: ActionShell, action: string, id?: string): boolean {
  if (
    action === 'smith-story' &&
    shell.panel === 'town-event' &&
    shell.inTown &&
    !shell.game &&
    shell.townNpc?.id === 'smith'
  ) {
    if (
      shell.townScene?.nearbyNpc?.id === 'smith' &&
      shell.chooseSmithStory(shell.save, id ?? '')
    ) {
      shell.persist();
      shell.showTownEvent(shell.townNpc);
      shell.toast(shell.save.mortal.events[0]);
    }
    return true;
  }
  if (
    action === 'human-memory' &&
    shell.inMortalWorld &&
    !shell.game &&
    (!shell.panel || shell.panel === 'human-journal') &&
    id &&
    shell.isHumanStoryId(id) &&
    shell.save.mortal.humanStories?.[id]
  ) {
    shell.syncHumanStories(shell.save);
    shell.chooseHumanStory(shell.save, id, 'read');
    shell.persist();
    shell.panel = 'human-memory';
    shell.panelFrame(
      shell.HUMAN_STORIES[id].title,
      '人间缘簿 · 此世旧事',
      shell.humanStoryContent(shell.save, id),
    );
    return true;
  }
  if (action === 'human-story' && shell.inMortalWorld && !shell.game) {
    const [storyId, choice] = (id ?? '').split(':');
    if (!shell.isHumanStoryId(storyId)) return true;
    const atNpc =
      shell.panel === 'town-event' &&
      shell.inTown &&
      shell.townNpc?.id === shell.HUMAN_STORIES[storyId].npcId &&
      shell.townScene?.nearbyNpc?.id === shell.townNpc.id;
    if (atNpc && shell.chooseHumanStory(shell.save, storyId, choice)) {
      shell.persist();
      shell.showTownEvent(shell.townNpc!);
    }
    return true;
  }
  if (action.startsWith('town-') && shell.inMortalWorld && !shell.game && !shell.panel) {
    if (action === 'town-enter' && !shell.inTown && !shell.inMarket && shell.mortalTab === 'town') {
      const next = shell.structuredClone(shell.save);
      const memory = shell.enterTownVisit(next);
      try {
        shell.writeSave(next, shell.pendingRun);
      } catch {
        if (!shell.saveLock) shell.toast('浏览器暂时无法保存入镇行程，请重试');
        return true;
      }
      Object.assign(shell.save, next);
      shell.telemetry.track({ type: 'town', ...shell.lifeStats() });
      void shell.mobileDisplay.enter();
      shell.inTown = true;
      if (shell.save.mortal.hometown) shell.townPosition = { ...shell.HOMETOWN_START };
      shell.lastMortalTick = shell.performance.now();
      shell.renderMortal();
      shell.document.getElementById('town-view')?.focus({ preventScroll: true });
      if (memory) showTownArrival(shell, memory);
    } else if (action === 'town-retry' && shell.inTown) {
      const memory =
        shell.document.querySelector('.town-return-note')?.textContent ||
        shell.document.getElementById('town-view')?.dataset.arrival;
      shell.renderMortal();
      if (memory) showTownArrival(shell, memory);
    } else if (action === 'town-exit') {
      shell.leaveTown();
      shell.persist();
      shell.renderMortal();
      shell.document.querySelector<HTMLButtonElement>('[data-action="town-enter"]')?.focus();
    } else if (action === 'town-talk') shell.townScene?.talk();
    return true;
  }
  if (
    (action === 'mortal-buy' || action === 'mortal-sell') &&
    shell.inTown &&
    shell.inMortalWorld &&
    !shell.game &&
    shell.panel === 'town-event' &&
    shell.townNpc?.id === 'market' &&
    shell.townScene?.nearbyNpc?.id === 'market'
  ) {
    const next = shell.structuredClone(shell.save);
    if (!shell.executeMortalAction(next, action, id, shell.pendingRun?.path)) {
      shell.toast('交易未完成，请检查数量、额度、灵石及当前行情');
      return true;
    }
    try {
      shell.writeSave(next, shell.pendingRun);
    } catch {
      if (!shell.saveLock) shell.toast('交易未完成：浏览器暂时无法保存，请重试');
      return true;
    }
    Object.assign(shell.save, next);
    const host = shell.modal.querySelector<HTMLElement>('#iron-market-trade');
    if (host) host.outerHTML = shell.ironMarketContent(shell.save, Number(id?.split(':')[1]));
    const status = shell.modal.querySelector<HTMLElement>('#iron-trade-status');
    if (status)
      status.textContent =
        action === 'mortal-buy'
          ? '玄铁已收入行囊，灵石与本期额度已扣除。'
          : '玄铁已售出，灵石已到账。';
    const town = shell.document.getElementById('town-status');
    if (town) town.innerHTML = shell.townStatus(shell.save);
    return true;
  }
  if (action === 'mortal-buy' || action === 'mortal-sell') return true;
  if (
    action.startsWith('mortal-') &&
    shell.inMortalWorld &&
    !shell.game &&
    (!shell.panel ||
      shell.panel === 'town-event' ||
      (shell.panel === 'tea-story' && action === 'mortal-activity' && id === 'tea'))
  ) {
    if (
      shell.panel === 'tea-story' &&
      shell.modal.querySelector<HTMLButtonElement>('.tea-story-next')?.disabled !== false
    )
      return true;
    if (action === 'mortal-tab' && (id === 'town' || id === 'sects')) {
      shell.leaveTown();
      shell.mortalTab = id;
      shell.document.getElementById('mortal-content')!.innerHTML = shell.mortalTabContent(
        shell.save,
        shell.mortalTab,
        shell.mortalFilter,
        shell.pendingRun?.path,
      );
      shell.ui
        .querySelectorAll<HTMLButtonElement>('[data-action="mortal-tab"]')
        .forEach((button) => {
          const active = button.dataset.id === shell.mortalTab;
          button.classList.toggle('active', active);
          button.setAttribute('aria-pressed', String(active));
        });
    } else if (action === 'mortal-filter' && ['all', 'orthodox', 'demonic'].includes(id ?? '')) {
      shell.mortalFilter = id!;
      shell.renderMortal();
    } else if (action === 'mortal-join') {
      const next = shell.structuredClone(shell.save);
      if (!shell.executeMortalAction(next, action, id, shell.pendingRun?.path)) {
        shell.toast(
          !next.mortal.member && !sectEntryMedicinePool(next).length
            ? '丹囊中的凡品数量已达上限，请先腾出容量再拜入宗门。'
            : '暂时不能拜入，请检查宗门身份、入门费及未结束历练的路线。',
        );
        return true;
      }
      const message = next.mortal.events[0];
      shell.resolveActivity(next);
      try {
        shell.writeSave(next, shell.pendingRun);
      } catch {
        if (!shell.saveLock) shell.toast('拜入尚未保存，入门费与赠药均未结算，请重试。');
        return true;
      }
      Object.assign(shell.save, next);
      if (shell.panel === 'town-event') {
        shell.closeNpcChat();
        shell.panel = '';
        shell.modal.innerHTML = '';
      }
      if (shell.pendingRun)
        shell.pendingRun = shell.Game.restore(shell.save, shell.pendingRun.snapshot());
      shell.selectedTreasure = shell.save.starter;
      shell.treasurePage = Math.floor(
        shell.catalogTreasures.findIndex((t) => t.id === shell.save.starter) / 12,
      );
      shell.renderMortal();
      shell.toast(message);
    } else {
      const changed = shell.executeMortalAction(shell.save, action, id, shell.pendingRun?.path);
      if (changed) {
        const fromTown = shell.panel === 'town-event' || shell.panel === 'tea-story';
        if (fromTown) {
          shell.closeNpcChat();
          shell.panel = '';
          shell.modal.innerHTML = '';
        }
        shell.syncMortalChange();
        if (
          fromTown &&
          action === 'mortal-activity' &&
          id === 'tea' &&
          !shell.panel &&
          !shell.save.mortal.activity
        )
          shell.showTeaStory();
        if (fromTown && (action === 'mortal-buy' || action === 'mortal-sell') && shell.townNpc)
          shell.showTownEvent(shell.townNpc);
        if (action === 'mortal-leave') shell.toast(shell.save.mortal.events[0]);
        if (action === 'mortal-activity' && !shell.save.mortal.activity)
          shell.toast(shell.save.mortal.events[0]);
      } else if (shell.panel === 'tea-story')
        shell.toast('暂时不能继续听书，请先处理寿元或未完成的事项。');
    }
    return true;
  }
  return false;
}

// 存档导出与导入。
function handleSaveTransfer(shell: ActionShell, action: string): boolean {
  if (action === 'export-save' && !shell.game) {
    shell.downloadJson(shell.exportSave(shell.save, shell.pendingRun), '存档');
    shell.toast('已导出存档，请妥善保留下载的存档文件');
    return true;
  }
  if (action === 'import-save' && !shell.game && shell.panel === 'cultivation') {
    shell.document.querySelector<HTMLInputElement>('#save-import')?.click();
    return true;
  }
  if (
    action === 'confirm-import' &&
    !shell.game &&
    shell.panel === 'import-confirm' &&
    shell.pendingImport
  ) {
    const candidate = shell.pendingImport;
    try {
      shell.writeSave(candidate.save, candidate.run, true);
    } catch {
      if (!shell.saveLock) shell.toast('浏览器无法写入存档，当前进度未更改');
      return true;
    }
    Object.assign(shell.save, candidate.save, { sound: shell.save.sound });
    if (
      !shell.save.journeyEnded &&
      !shell.save.pendingReincarnation &&
      !shell.save.mortal.marketSocial?.ambush
    )
      shell.resolveActivity(shell.save);
    shell.pendingRun = candidate.run
      ? shell.Game.restore(shell.save, candidate.run.snapshot())
      : null;
    shell.storageAvailable = true;
    shell.persist();
    shell.pendingImport = null;
    shell.selectedStage = shell.save.unlocked;
    shell.selectedTreasure = shell.save.starter;
    shell.treasurePage = Math.floor(
      shell.catalogTreasures.findIndex((t) => t.id === shell.save.starter) / 12,
    );
    shell.difficulty = minimumDifficulty(shell.save);
    shell.schoolFilter = 'all';
    shell.bookTab = 'treasures';
    shell.gameAudio.sync();
    shell.returnLobby();
    if (shell.save.journeyEnded) return true;
    if (shell.save.pendingReincarnation) {
      shell.renderJourneyFarewell(shell.save.pendingReincarnation);
      return true;
    }
    if (shell.lifespanInfo(shell.save).remaining === 0) {
      shell.renderLifespanEnd();
      return true;
    }
    if (shell.tribulationDue(shell.save)) {
      shell.renderTribulationPending();
      return true;
    }
    if (!shell.save.prologueSeen && shell.save.mortal.hometown?.stage !== 'departed')
      shell.renderPrologue();
    shell.toast('存档已导入，修行进度已恢复');
    return true;
  }
  if (shell.panel === 'import-confirm' && ['close', 'cultivation', 'home'].includes(action))
    shell.pendingImport = null;
  return false;
}

// 自选灵根与物资补给广告，以及资质说明。
function handleRewardAd(shell: ActionShell, action: string, id?: string): boolean {
  if (shell.panel === 'reward-ad' && shell.rewardAd === 'root') {
    if (action === 'ad-root-quality' && shell.SPIRIT_ROOTS.some((r) => r.id === id)) {
      shell.adRoot = id as SpiritRootId;
      shell.adElements = shell.rootElementsFor(shell.adRoot, shell.adElements);
      shell.renderRootPicker();
      shell.refreshAdCountdown('claim-ad-reward', '领取奖励');
      return true;
    }
    if (action === 'ad-root-element' && shell.ELEMENTS.some((e) => e.id === id)) {
      const element = id as ElementId;
      const count = shell.spiritRootInfo(shell.adRoot).count;
      if (!count) return true;
      if (shell.adElements.includes(element))
        shell.adElements = shell.adElements.filter((e) => e !== element);
      else {
        if (shell.adElements.length === count) shell.adElements.pop();
        shell.adElements.push(element);
      }
      shell.renderRootPicker();
      shell.refreshAdCountdown('claim-ad-reward', '领取奖励');
      return true;
    }
  }
  if (shell.panel === 'supplies-shortage' && ['close', 'cancel-supplies'].includes(action)) {
    shell.closeRewardAd();
    return true;
  }
  if (
    action === 'watch-root-ad' ||
    (action === 'watch-supplies-ad' && shell.panel === 'supplies-shortage')
  ) {
    shell.showRewardAd(action === 'watch-root-ad' ? 'root' : 'supplies');
    return true;
  }
  if (shell.panel === 'reward-ad' && (action === 'close' || action === 'cancel-reward-ad')) {
    shell.closeRewardAd();
    return true;
  }
  if (action === 'claim-ad-reward') {
    if (shell.game || shell.panel !== 'reward-ad' || !shell.rewardAd || !shell.adCompleted())
      return true;
    const kind = shell.rewardAd;
    const supplies = shell.adSupplies(shell.save.unlocked);
    if (kind === 'root') {
      if (!shell.attuneSpiritRoot(shell.save, shell.adRoot, shell.adElements)) return true;
      shell.selectedTreasure = shell.save.starter;
      shell.treasurePage = Math.floor(
        shell.catalogTreasures.findIndex((t) => t.id === shell.save.starter) / 12,
      );
    } else {
      shell.save.stones += supplies.stones;
      shell.save.iron += supplies.iron;
    }
    shell.persist();
    shell.closeRewardAd();
    shell.toast(
      kind === 'root'
        ? `${shell.spiritRootInfo(shell.save.spiritRoot).name}已成 · ${shell.treasure(shell.save.starter).name}为本命 · 下次历练生效`
        : `仙缘补给 · 灵石 +${supplies.stones} · 玄铁 +${supplies.iron}`,
    );
    return true;
  }
  if (action === 'root-guide') {
    shell.guideTab = 'roots';
    shell.handleAction('guide');
    return true;
  }
  return false;
}

// 胜负结算、伤害统计与看广告复活。
function handleRunOutcome(shell: ActionShell, action: string): boolean {
  if (shell.panel === 'victory' && (action === 'victory-result' || action === 'close')) {
    shell.renderResult();
    return true;
  }
  if (
    action === 'damage' &&
    shell.game &&
    (shell.game.state === 'playing' || shell.game.state === 'paused')
  ) {
    shell.resumeAfterDamage = shell.game.state === 'playing';
    shell.clearInput();
    shell.game.pause();
    shell.previousState = shell.game.state;
    shell.panel = 'damage';

    shell.panelFrame(...shell.damagePanel(shell.game, shell.resumeAfterDamage));
    shell.persist();
    return true;
  }
  if (action === 'watch-ad') {
    shell.showReviveAd();
    return true;
  }
  if (
    action === 'finish-run' &&
    (shell.game?.state === 'lost' ||
      (shell.game?.state === 'won' && shell.panel === 'settlement-retry'))
  ) {
    shell.finishRun();
    return true;
  }
  if (action === 'ad-revive') {
    if (
      shell.panel !== 'revive-ad' ||
      !shell.adCompleted() ||
      shell.settled ||
      !shell.game?.revive()
    )
      return true;
    shell.clearInterval(shell.adTimer);
    shell.adReadyAt = 0;
    shell.clearInput();
    shell.panel = '';
    shell.modal.innerHTML = '';
    shell.previousState = 'playing';
    if (shell.game.state === 'won') {
      shell.finishRun();
      return true;
    }
    shell.lastFrame = shell.performance.now();
    shell.updateHud();
    shell.persist();
    return true;
  }
  return false;
}

// 主动轮回。
function handleReincarnate(shell: ActionShell, action: string): boolean {
  if (action === 'reincarnate' && !shell.game) {
    if (
      shell.realmInfo(
        shell.save.cultivation,
        shell.save.completed.includes(shell.FINAL_TRIAL_STAGE),
      ).max
    ) {
      shell.handleAction('immortal-gate');
      return true;
    }
    shell.panel = 'reincarnate';

    shell.panelFrame(...shell.reincarnatePanel());
    return true;
  }
  if (action === 'confirm-reincarnate' && shell.panel === 'reincarnate' && !shell.game) {
    const previous = shell.lifeStats();
    const reset = shell.resetLifetime(
      undefined,
      shell.modal.querySelector<HTMLInputElement>('#reincarnate-full-opening')?.checked
        ? 'full'
        : false,
      shell.resolveInheritance(
        shell.save,
        shell.modal.querySelector<HTMLSelectElement>('#reincarnate-inheritance')?.value ?? '',
      ),
    );
    if (reset) shell.trackReincarnation('manual', previous);
    return true;
  }
  return false;
}

// 自动历练与声音开关。
function handleToggles(shell: ActionShell, action: string): boolean {
  if (action === 'autoplay') {
    shell.save.autoplay = !shell.save.autoplay;
    shell.clearInput();
    shell.aiChoiceTime = 0;
    shell.nextAiMove = 0;
    shell.persist();
    if (shell.game) {
      shell.renderHud();
      if (shell.game.state === 'upgrade') shell.renderChoices();
      else if (shell.game.state === 'paused' && shell.panel !== 'guide') shell.renderPause();
    } else {
      shell.renderLobby();
      if (shell.panel === 'settings') shell.renderPanel();
    }
    shell.toast(shell.save.autoplay ? '自动历练已开启 · 自动走位与选技' : '已切回手动操作');
    return true;
  }
  if (action === 'sound' || action === 'mute') {
    shell.volumeOpen = action === 'sound' && !shell.volumeOpen;
    shell.soundSettings.setEnabled(action === 'sound', true);
    if (shell.game) shell.renderHud();
    else shell.renderLobby();
    return true;
  }
  return false;
}

// 关闭与返回首页，以及设置、关于、指南、丹药和各修行面板。
function handlePanels(shell: ActionShell, action: string, id?: string): boolean {
  if (action === 'close') {
    if (shell.panel === 'treasure-detail' && shell.treasureReturn) {
      const location = shell.treasureReturn;
      shell.treasureReturn = null;
      shell.restorePanel(location);
      return true;
    }
    if (shell.panel === 'guide' && !shell.game && shell.guideReturn) {
      const location = shell.guideReturn;
      shell.guideReturn = null;
      shell.restorePanel(location);
      return true;
    }
    if (shell.panel === 'journey-card') {
      if (shell.journeyCardReturn === 'ambush-farewell') shell.renderJourneyFarewell('ambush');
      else if (shell.journeyCardReturn === 'lifespan-farewell')
        shell.renderJourneyFarewell('lifespan');
      else if (shell.journeyCardReturn === 'tribulation-farewell')
        shell.renderJourneyFarewell('tribulation');
      else {
        const location = shell.journeyCardReturnLocation;
        shell.journeyCardReturnLocation = null;
        if (location) shell.restorePanel(location);
        else shell.showPanel('chronicle');
      }
      return true;
    }
    shell.closeNpcChat();
    const wasHumanMemory = shell.panel === 'human-memory' || shell.panel === 'sect-service';
    const returnToAbout = shell.panel === 'about';
    const returnToSettings = shell.panel === 'settings';
    if (shell.game?.state === 'lost' && !shell.settled) return true;
    if (shell.game?.state === 'paused' && shell.panel === 'damage') {
      shell.panel = '';
      if (shell.resumeAfterDamage) {
        shell.game.resume();
        shell.modal.innerHTML = '';
      } else shell.renderPause();
      shell.resumeAfterDamage = false;
    } else if (shell.game?.state === 'paused' && shell.panel === 'guide') {
      shell.panel = '';
      shell.renderPause();
    } else if (shell.game?.state === 'paused') {
      shell.game.resume();
      shell.modal.innerHTML = '';
    } else {
      shell.panel = '';
      shell.modal.innerHTML = '';
      if (shell.inMarket)
        shell.document.getElementById('sect-market-view')?.focus({ preventScroll: true });
      if (wasHumanMemory && shell.inMortalWorld && !shell.inTown) shell.renderMortal();
      if (returnToAbout)
        shell.ui.querySelector<HTMLButtonElement>('[data-action="about"]')?.focus({
          preventScroll: true,
        });
      if (returnToSettings)
        shell.ui.querySelector<HTMLButtonElement>('[data-action="settings"]')?.focus({
          preventScroll: true,
        });
    }
    return true;
  }
  if (action === 'home') {
    if (!shell.game) {
      shell.panel = '';
      shell.modal.innerHTML = '';
      shell.renderLobby();
    }
    return true;
  }
  if (action === 'about' && !shell.game) {
    shell.showPanel('about');
    return true;
  }
  if (action === 'settings' && !shell.game) {
    shell.showPanel('settings');
    return true;
  }
  if (action === 'settings-sound' && shell.panel === 'settings') {
    shell.soundSettings.toggle();
    shell.renderLobby();
    shell.renderPanel();
    return true;
  }
  if (action === 'autoplay-build' || action === 'autoplay-target') {
    if (shell.panel !== 'settings' || shell.game) return true;
    const [field, value] = action === 'autoplay-build' ? ['mode', id ?? ''] : (id ?? '').split(':');
    const build = changeAutoplayBuild(shell.save.autoplayBuild, field, value ?? '');
    if (!build) return true;
    const next = shell.structuredClone(shell.save);
    next.autoplayBuild = build;
    try {
      shell.writeSave(next, shell.pendingRun);
    } catch {
      if (!shell.saveLock) {
        shell.refreshAutoplaySettings();
        shell.toast('培养倾向尚未保存，请重试');
      }
      return true;
    }
    shell.save.autoplayBuild = build;
    shell.refreshAutoplaySettings(
      action === 'autoplay-build' ? 'autoplay-build-mode' : `autoplay-build-target-${field}`,
    );
    return true;
  }
  if (action.startsWith('offline-') && shell.panel === 'settings') {
    void shell.offlineAction(action);
    return true;
  }
  if (action === 'telemetry-toggle' && shell.panel === 'about') {
    shell.telemetry.setEnabled(!shell.telemetry.enabled());
    shell.renderPanel();
    shell.modal.querySelector<HTMLButtonElement>('[data-action="telemetry-toggle"]')?.focus();
    return true;
  }
  if (action === 'guide') {
    if (!shell.game || shell.game.state === 'playing' || shell.game.state === 'paused') {
      if (shell.panel !== 'guide') shell.guideReturn = shell.game ? null : shell.rememberPanel();
      if (shell.game) {
        shell.clearInput();
        shell.game.pause();
        shell.previousState = 'paused';
        shell.persist();
      }
      shell.showPanel('guide');
    }
    return true;
  }
  if (action === 'bestiary-difficulty' && shell.panel === 'bestiary') {
    const next = Number(id);
    if (Number.isInteger(next) && next >= 0 && next < 3) {
      shell.bestiaryDifficulty = next;
      shell.renderPanel();
    }
    return true;
  }
  if (action === 'bestiary-stage') {
    shell.bestiaryStage = Number(id);
    shell.renderPanel();
    shell.modal.querySelector('.panel')?.scrollTo(0, 0);
  }
  if (
    shell.medicinePanel.handle(action, id, {
      panel: shell.panel,
      hasGame: !!shell.game,
      pendingRun: !!shell.pendingRun,
      herbsShop: shell.inTown && shell.townNpc?.id === 'herbs',
    })
  )
    return true;

  if (action === 'guide-tab') {
    shell.guideTab = id!;
    shell.renderPanel();
    shell.modal.querySelector('.panel')?.scrollTo(0, 0);
    return true;
  }
  if (
    action === 'journey-card' &&
    (shell.panel === 'chronicle' || shell.panel === 'journey-card')
  ) {
    void shell.renderJourneyCard();
    return true;
  }
  if (
    action === 'cultivation' ||
    action === 'arsenal' ||
    action === 'bestiary' ||
    action === 'chronicle'
  ) {
    if (!shell.game) {
      if (action === 'bestiary') shell.bestiaryDifficulty = shell.difficulty;
      shell.showPanel(action);
    }
    return true;
  }
  return false;
}

// 行前准备：选关、路线与难度，藏器阁与洞府修炼。
function handlePreparation(shell: ActionShell, action: string, id?: string): boolean {
  if (action === 'stage') {
    if (Number(id) <= shell.save.unlocked) {
      shell.selectedStage = Number(id);
      const showStage = () => {
        shell.renderLobby();
        shell.ui
          .querySelector<HTMLButtonElement>(`.journey-node[data-id="${shell.selectedStage}"]`)
          ?.focus({
            preventScroll: true,
          });
      };
      if (shell.ensureScene(shell.selectedStage, showStage)) showStage();
    }
  }
  if (
    action === 'path' &&
    !shell.game &&
    !shell.save.mortal.member &&
    shell.isCultivationPath(id)
  ) {
    shell.save.path = id;
    if (shell.alignStarterWithPath(shell.save)) {
      shell.selectedTreasure = shell.save.starter;
      shell.treasurePage = Math.floor(
        shell.catalogTreasures.findIndex((t) => t.id === shell.save.starter) / 12,
      );
      shell.schoolFilter = 'all';
    }
    shell.persist();
    shell.renderLobby();
  }
  if (action === 'treasure-page') {
    const treasures = shell.catalogTreasures.filter(
      (t) => shell.schoolFilter === 'all' || t.school === shell.schoolFilter,
    );
    shell.treasurePage = Math.max(
      0,
      Math.min(Math.ceil(treasures.length / 12) - 1, shell.treasurePage + (id === 'next' ? 1 : -1)),
    );
    shell.selectedTreasure = treasures[shell.treasurePage * 12].id;
    shell.renderPanel();
    shell.modal.querySelector('.panel')?.scrollTo(0, 0);
    (
      shell.modal.querySelector<HTMLButtonElement>(
        `.collection-pages button[data-id="${id}"]:not(:disabled)`,
      ) ?? shell.modal.querySelector<HTMLButtonElement>('.collection-pages button:not(:disabled)')
    )?.focus({ preventScroll: true });
  }
  if (action === 'school-filter') {
    shell.schoolFilter = id!;
    shell.treasurePage = 0;
    shell.selectedTreasure = shell.catalogTreasures.find(
      (t) => shell.schoolFilter === 'all' || t.school === shell.schoolFilter,
    )!.id;
    shell.renderPanel();
    shell.modal.querySelector('.panel')?.scrollTo(0, 0);
  }
  if (action === 'difficulty') {
    if (!difficultyAllowed(shell.save, Number(id))) return true;
    shell.difficulty = Number(id);
    shell.renderLobby();
  }
  if (action === 'treasure') {
    shell.treasureReturn = shell.rememberPanel();
    shell.selectedTreasure = id!;
    shell.showPanel('treasure-detail');
  }
  if (action === 'book-tab') {
    shell.bookTab = id!;
    shell.renderPanel();
    shell.modal.querySelector('.panel')?.scrollTo(0, 0);
  }
  if (
    action === 'equip' &&
    shell.save.artifacts.includes(shell.selectedTreasure) &&
    shell.allowsSchool(shell.save.path, shell.treasure(shell.selectedTreasure).school)
  ) {
    shell.save.starter = shell.selectedTreasure;
    shell.persist();
    shell.renderLobby();
    shell.renderPanel();
    shell.toast(`已将${shell.treasure(shell.selectedTreasure).name}设为本命法宝`);
  }
  if (action === 'forge') {
    shell.forgeTreasure(shell);
  }
  if (action === 'retreat' && !shell.game && shell.panel === 'cultivation') {
    const input = shell.document.querySelector<HTMLInputElement>('#retreat-years');
    if (!input || !input.reportValidity()) return true;
    const result = shell.retreat(shell.save, Number(input.value));
    if (!result) return true;
    if (shell.pendingRun)
      shell.pendingRun = shell.Game.restore(shell.save, shell.pendingRun.snapshot());
    shell.persist();
    shell.renderLobby();
    if (shell.tribulationDue(shell.save)) {
      shell.renderTribulationPending();
      return true;
    }
    shell.panel = 'retreat-result';

    shell.panelFrame(...shell.retreatResultPanel(shell.save, result));
    return true;
  }
  if (
    action === 'train' &&
    !shell.game &&
    shell.panel === 'cultivation' &&
    shell.train(shell.save, id as 'vitality' | 'power' | 'speed')
  ) {
    if (shell.pendingRun)
      shell.pendingRun = shell.Game.restore(shell.save, shell.pendingRun.snapshot());
    shell.persist();
    shell.renderLobby();
    shell.renderPanel();
    shell.gameAudio.play('upgrade');
    if (shell.tribulationDue(shell.save)) shell.renderTribulationPending();
  }
  return false;
}

// 开局、续局，以及对局中的暂停、放弃与选技。
function handleRun(shell: ActionShell, action: string, id?: string) {
  if (action === 'start' || action === 'retry') {
    if (
      shell.assetsReady &&
      shell.selectedStage <= shell.save.unlocked &&
      !shell.pendingRun &&
      !shell.tribulationDue(shell.save)
    )
      void shell.mobileDisplay.enter();
    shell.startRun();
  }
  if (action === 'restore') {
    if (shell.assetsReady && shell.pendingRun) void shell.mobileDisplay.enter();
    shell.restoreRun();
  }
  if (action === 'new-run') {
    shell.pendingRun = null;
    if (
      shell.assetsReady &&
      shell.selectedStage <= shell.save.unlocked &&
      !shell.tribulationDue(shell.save)
    )
      void shell.mobileDisplay.enter();
    shell.startRun();
  }
  if (action === 'next' && shell.game) {
    shell.selectedStage = Math.min(shell.STAGES.length - 1, shell.game.stage + 1);
    if (
      shell.assetsReady &&
      shell.selectedStage <= shell.save.unlocked &&
      !shell.tribulationDue(shell.save)
    )
      void shell.mobileDisplay.enter();
    shell.startRun();
  }
  if (action === 'return') shell.returnLobby();
  if (action === 'pause' && shell.game) {
    shell.clearInput();
    shell.panel = '';
    shell.game.pause();
    shell.renderPause();
    shell.persist();
  }
  if (action === 'resume' && shell.game) {
    shell.clearInput();
    shell.panel = '';
    shell.game.resume();
    shell.modal.innerHTML = '';
  }
  if (action === 'abandon' && shell.game) {
    if (shell.game.tribulation) {
      shell.renderTribulationForfeit();
      return true;
    }
    if (!shell.abandonConfirm) {
      shell.abandonConfirm = true;
      shell.renderPause();
    } else {
      shell.game.state = 'lost';
    }
  }
  if (action === 'choose' && shell.game?.choose(Number(id))) {
    // 经验可跨多级：下帧再次进入 upgrade 时也必须显示新选项。
    shell.previousState = shell.game.state;
    shell.clearInput();
    shell.modal.innerHTML = '';
    shell.updateHud();
    if (shell.game.state === 'won') shell.finishRun();
    else shell.persist();
  }
  if (action === 'reroll' && shell.game?.reroll()) {
    shell.renderChoices();
    shell.persist();
  }
  return false;
}
