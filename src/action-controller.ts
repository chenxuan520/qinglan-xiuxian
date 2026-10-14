import type { ElementId, SpiritRootId, Treasure } from './data.ts';

export interface ActionShell {
  readonly ELEMENTS: readonly { id: string }[];
  readonly FINAL_TRIAL_STAGE: any;
  readonly Game: any;
  readonly HOMETOWN_START: any;
  readonly HUMAN_STORIES: any;
  readonly SPIRIT_ROOTS: readonly { id: string }[];
  readonly STAGES: any;
  abandonConfirm: any;
  readonly acceptHometownRoot: any;
  readonly adCompleted: any;
  adElements: ElementId[];
  adReadyAt: any;
  adRoot: SpiritRootId;
  readonly adSupplies: any;
  adTimer: any;
  aiChoiceTime: any;
  readonly alignStarterWithPath: any;
  readonly allowsSchool: any;
  ambushScene: any;
  assetsReady: any;
  readonly attuneSpiritRoot: any;
  auctionKind: any;
  readonly auctionResult: any;
  auctionView: any;
  readonly beginJourneyFarewell: any;
  readonly beginSectMarketVisit: any;
  readonly beginTribulation: any;
  bestiaryStage: any;
  bookTab: any;
  readonly catalogTreasures: Treasure[];
  readonly chooseHumanStory: any;
  readonly chooseMarketFellow: any;
  readonly chooseSmithStory: any;
  readonly clearInput: any;
  readonly clearInterval: any;
  readonly closeNpcChat: any;
  readonly closeRewardAd: any;
  readonly damagePanel: any;
  difficulty: any;
  readonly document: Document;
  readonly downloadJson: any;
  readonly endLifetime: any;
  readonly ensureScene: any;
  readonly enterImmortalGate: any;
  readonly enterTownVisit: any;
  readonly epilogueReincarnatePanel: any;
  readonly exchangeSectMedicine: any;
  readonly executeAuctionTrade: any;
  readonly executeMarketSocial: any;
  readonly executeMortalAction: any;
  readonly exportSave: any;
  readonly extendLifespan: any;
  readonly finishDeparture: any;
  readonly finishMarketAmbush: any;
  readonly finishRun: any;
  readonly forge: any;
  readonly freshTownPopulation: any;
  game: any;
  readonly gameAudio: any;
  guideReturn: any;
  guideTab: any;
  readonly handleAction: any;
  readonly hometownLetterContent: any;
  readonly humanStoryContent: any;
  readonly immortalGatePanel: any;
  inMarket: any;
  inMortalWorld: any;
  inTown: any;
  readonly isCultivationPath: any;
  readonly isHumanStoryId: any;
  readonly isImmortalSuccessor: any;
  readonly ironMarketContent: any;
  readonly isMarketCultivatorId: any;
  readonly journeyCardPanel: any;
  readonly journeyCardReturn: any;
  lastFrame: any;
  lastMortalTick: any;
  readonly leaveTown: any;
  readonly lifeStats: any;
  readonly lifespanInfo: any;
  marketNpc: any;
  marketScene: any;
  readonly medicinePanel: any;
  readonly mobileDisplay: any;
  readonly modal: HTMLDivElement;
  mortalFilter: any;
  mortalTab: any;
  readonly mortalTabContent: any;
  nextAiMove: any;
  readonly offlineAction: any;
  panel: any;
  readonly panelFrame: any;
  pendingImport: any;
  pendingRun: any;
  readonly performance: any;
  readonly persist: any;
  previousState: any;
  readonly readHometownLetter: any;
  readonly realmInfo: any;
  readonly refreshAdCountdown: any;
  readonly refreshAuction: any;
  readonly refreshMarketActivities: any;
  readonly refreshMarketTrade: any;
  readonly reincarnatePanel: any;
  readonly rememberPanel: any;
  readonly renderChoices: any;
  readonly renderDeath: any;
  readonly renderDeparture: any;
  readonly renderEpilogue: any;
  readonly renderHud: any;
  readonly renderJourneyCard: any;
  readonly renderJourneyFarewell: any;
  readonly renderLifespanEnd: any;
  readonly renderLobby: any;
  readonly renderMortal: any;
  readonly renderPanel: any;
  readonly renderPause: any;
  readonly renderPrologue: any;
  readonly renderResult: any;
  readonly renderRootPicker: any;
  readonly renderTribulationForfeit: any;
  readonly renderTribulationPending: any;
  readonly resetLifetime: any;
  readonly resolveActivity: any;
  readonly resolveInheritance: any;
  readonly restorePanel: any;
  readonly restoreRun: any;
  resumeAfterDamage: any;
  readonly retreat: any;
  readonly retreatResultPanel: any;
  readonly returnLobby: any;
  rewardAd: any;
  readonly rootElementsFor: any;
  readonly save: any;
  readonly saveLock: any;
  schoolFilter: any;
  readonly sectMarketExchangeReason: any;
  readonly sectMarketOffer: any;
  readonly sectMarketOpen: any;
  selectedStage: any;
  selectedTreasure: any;
  readonly settleSectDues: any;
  settled: any;
  readonly showHometown: any;
  readonly showLifespanAd: any;
  readonly showMarketAmbush: any;
  readonly showMarketEvent: any;
  readonly showPanel: any;
  readonly showReviveAd: any;
  readonly showRewardAd: any;
  readonly showTeaStory: any;
  readonly showTownEvent: any;
  readonly soundSettings: any;
  readonly spiritRootInfo: any;
  readonly startRun: any;
  storageAvailable: any;
  readonly structuredClone: any;
  readonly syncHumanStories: any;
  readonly syncMortalChange: any;
  readonly telemetry: any;
  readonly toast: any;
  townNpc: any;
  townPosition: any;
  townScene: any;
  readonly townStatus: any;
  readonly trackReincarnation: any;
  readonly train: any;
  readonly treasure: any;
  treasurePage: any;
  treasureReturn: any;
  readonly tribulationDue: any;
  readonly ui: HTMLDivElement;
  readonly updateHud: any;
  readonly updateStorySoundButton: any;
  volumeOpen: any;
  readonly window: Window;
  readonly writeSave: any;
  readonly AD_DURATION_MS: any;
  readonly AD_PLACEHOLDER_HTML: any;
  readonly AD_SECONDS: any;
  readonly ENEMIES: any;
  readonly GAME_SITE_URL: any;
  readonly GAME_VERSION: any;
  readonly JOURNEY_MAP_IMAGE: any;
  readonly JOURNEY_MAP_MOBILE_IMAGE: any;
  readonly MAX_REVIVES: any;
  readonly MarketAmbushScene: any;
  readonly PROLOGUE_IMAGE: any;
  readonly SUPPORT_CODE_IMAGE: any;
  readonly SectMarketScene: any;
  readonly TownScene: any;
  readonly URL: any;
  adWatched: any;
  readonly app: any;
  readonly assetUrl: any;
  readonly auctionContent: any;
  readonly battleHud: any;
  readonly bestiaryPanel: any;
  readonly catalogPanel: any;
  readonly chronicleContent: any;
  readonly completeTribulation: any;
  readonly cultivationPanel: any;
  readonly damageReport: any;
  readonly epilogueModal: any;
  readonly frameRate: any;
  readonly fullscreenButton: any;
  readonly gameEvent: any;
  readonly getAdProvider: any;
  readonly guidePanel: any;
  readonly guideSource: any;
  readonly hometownContent: any;
  readonly hometownFarewellModal: any;
  readonly hometownParents: any;
  readonly immortalEncounterPanel: any;
  readonly markAdWatched: any;
  readonly marketAmbushPanel: any;
  readonly marketCultivators: any;
  marketPosition: any;
  readonly meetTownImmortal: any;
  readonly mountNpcChat: any;
  readonly mountTownScene: any;
  oldRealm: any;
  readonly openOfflinePanel: any;
  readonly panelHost: any;
  readonly pausePanel: any;
  readonly prepareAuction: any;
  readonly releaseTownScene: any;
  readonly rememberRewardReturn: any;
  readonly renderSectDues: any;
  readonly renderer: any;
  readonly restartRunPanel: any;
  rewardReturn: any;
  rewards: any;
  readonly rootPickerView: any;
  sceneLoading: any;
  readonly settingsContent: any;
  readonly settlementModal: any;
  readonly showAuction: any;
  readonly startAdCountdown: any;
  readonly startAdWatch: any;
  readonly telemetryRow: any;
  readonly touchHintDismissed: any;
  readonly townEventContent: any;
  readonly townPage: any;
  readonly townVisit: any;
  readonly tribulationWonPanel: any;
  readonly upgradeChoicesModal: any;
  readonly victoryModal: any;
  victoryTimer: any;
  readonly visitHometown: any;
  readonly watchAdPlacement: any;
}

export function dispatchAction(shell: ActionShell, action: string, id?: string) {
  if (shell.panel === 'market-ambush-recovery') {
    if (action === 'market-ambush-recover') {
      shell.panel = '';
      shell.modal.innerHTML = '';
      shell.renderLobby();
    }
    return;
  }
  if (shell.panel === 'market-ambush') {
    if (action === 'market-ambush-exit' || action === 'close' || action === 'home')
      shell.finishMarketAmbush(shell.ambushScene?.duel.outcome ?? 'escaped');
    return;
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
      shell.ui.inert = false;
      shell.trackReincarnation('epilogue');
      shell.resetLifetime(
        '修士离界，少年启程。一段指路的话，一场未尽的仙缘。',
        true,
        shell.resolveInheritance(
          shell.save,
          shell.modal.querySelector<HTMLSelectElement>('#reincarnate-inheritance')?.value ?? '',
        ),
        true,
      );
    } else if (action === 'close' && shell.panel === 'epilogue-reincarnate') shell.renderEpilogue();
    else if (action === 'epilogue-sound' && shell.panel === 'epilogue') {
      shell.soundSettings.toggle();
      shell.updateStorySoundButton(
        shell.modal.querySelector<HTMLButtonElement>('[data-action="epilogue-sound"]')!,
        shell.save.sound,
      );
    }
    return;
  }
  // 留影只切换面板，不能解除已结束的人生状态。
  if (shell.save.pendingReincarnation) {
    if (action === 'journey-card') void shell.renderJourneyCard();
    else if (action === 'close' && shell.panel === 'journey-card')
      shell.renderJourneyFarewell(shell.save.pendingReincarnation);
    else if (
      action === 'confirm-journey-reincarnate' &&
      (shell.panel === 'lifespan-farewell' || shell.panel === 'tribulation-farewell')
    ) {
      shell.trackReincarnation(shell.panel === 'lifespan-farewell' ? 'lifespan' : 'tribulation');
      if (shell.panel === 'lifespan-farewell') shell.endLifetime();
      else shell.resetLifetime('前世止于天劫，旧缘已散。今世从十五岁，再问长生。');
    }
    return;
  }
  if (shell.panel === 'root-reveal') {
    if (action === 'reroll-root')
      shell.resetLifetime(
        undefined,
        false,
        shell.save.birthInheritance,
        shell.isImmortalSuccessor(shell.save),
      );
    else if (action === 'accept-root' || action === 'close') {
      shell.ui.inert = false;
      shell.panel = '';
      shell.modal.innerHTML = '';
      const hadInheritance = shell.save.birthInheritance !== null;
      shell.save.birthInheritance = null;
      if (shell.acceptHometownRoot(shell.save) || hadInheritance) shell.persist();
      shell.renderLobby();
      shell.ui
        .querySelector<HTMLButtonElement>('[data-action="start"]')
        ?.focus({ preventScroll: true });
    }
    return;
  }
  if (shell.panel === 'prologue') {
    if (action === 'prologue-sound') {
      shell.soundSettings.toggle();
      shell.updateStorySoundButton(
        shell.modal.querySelector<HTMLButtonElement>('[data-action="prologue-sound"]')!,
        shell.save.sound,
      );
      return;
    }
    if (
      action === 'prologue-skip' &&
      !shell.save.prologueSeen &&
      !shell.pendingRun &&
      shell.save.mortal.hometown &&
      ['farewell', 'walk'].includes(shell.save.mortal.hometown.stage)
    ) {
      shell.finishDeparture(true);
      return;
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
    return;
  }
  if (action === 'prologue-revisit') {
    shell.renderPrologue(true);
    return;
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
        return;
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
    if (action !== 'fullscreen') return;
  }
  if (action === 'hometown-home' && shell.panel === 'hometown-home') {
    shell.showHometown();
    return;
  }
  if (
    action === 'hometown-parent' &&
    shell.panel === 'hometown-home' &&
    (id === 'father' || id === 'mother')
  ) {
    shell.showHometown(id);
    return;
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
    return;
  }
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
    return;
  }
  if (action === 'confirm-immortal-gate' && shell.panel === 'immortal-gate' && !shell.game) {
    const ended = shell.structuredClone(shell.save);
    if (!shell.enterImmortalGate(ended)) return;
    try {
      shell.writeSave(ended, null);
    } catch {
      if (!shell.saveLock) shell.toast('浏览器无法保存终章，此世尚未结束，请释放存储空间后重试');
      return;
    }
    Object.assign(shell.save, ended);
    shell.pendingRun = null;
    shell.telemetry.track({ type: 'epilogue', ...shell.lifeStats() });
    shell.telemetry.flush();
    shell.renderEpilogue();
    return;
  }
  if (action === 'fullscreen' && (shell.game || shell.inTown || shell.inMarket)) {
    void (shell.mobileDisplay.active ? shell.mobileDisplay.leave() : shell.mobileDisplay.enter());
    return;
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
    return;
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
    return;
  }
  if (shell.panel === 'tribulation-forfeit') {
    if (action === 'confirm-forfeit') {
      shell.beginJourneyFarewell('tribulation');
    } else if (action === 'cancel-forfeit' || action === 'close') {
      if (shell.game?.tribulation)
        shell.game.state === 'lost' ? shell.renderDeath() : shell.renderPause();
      else shell.renderTribulationPending();
    }
    return;
  }
  if (action === 'tribulation-start' && shell.tribulationDue(shell.save)) {
    if (shell.assetsReady) void shell.mobileDisplay.enter();
    shell.beginTribulation();
    return;
  }
  if (action === 'tribulation-forfeit' && shell.tribulationDue(shell.save)) {
    shell.renderTribulationForfeit();
    return;
  }
  if (shell.tribulationDue(shell.save) && !shell.game?.tribulation) {
    shell.renderTribulationPending();
    return;
  }

  if (shell.panel === 'lifespan-ended' && !['watch-lifespan-ad', 'end-lifetime'].includes(action))
    return;
  if (
    action === 'end-lifetime' &&
    shell.panel === 'lifespan-ended' &&
    shell.lifespanInfo(shell.save).remaining === 0
  ) {
    shell.beginJourneyFarewell('lifespan');
    return;
  }
  if (action === 'watch-lifespan-ad') {
    shell.showLifespanAd();
    return;
  }
  if (
    shell.panel === 'lifespan-ad' &&
    ['close', 'cancel-lifespan', 'claim-lifespan'].includes(action)
  ) {
    const claim = action === 'claim-lifespan';
    if (claim && !shell.adCompleted()) return;
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
    return;
  }
  if (shell.panel === 'sect-dues') {
    if (action === 'dues-ad') shell.showRewardAd('supplies');
    else if (action === 'dues-pay' || action === 'dues-decline') {
      if (!shell.settleSectDues(shell.save, action === 'dues-decline')) return;
      shell.panel = '';
      shell.modal.innerHTML = '';
      shell.persist();
      if (shell.inMortalWorld) shell.syncMortalChange();
      else shell.renderLobby();
      shell.toast(action === 'dues-pay' ? '供奉已补缴，继续游历' : '已离宗，精研成果仍保留');
    }
    return;
  }
  if (action === 'mortal-enter' && !shell.game) {
    if (shell.lifespanInfo(shell.save).remaining === 0) {
      shell.renderLifespanEnd();
      return;
    }
    shell.renderMortal(true);
    shell.persist();
    return;
  }
  if (
    action.startsWith('auction-') &&
    shell.inMortalWorld &&
    shell.inMarket &&
    !shell.game &&
    shell.panel === 'sect-auction' &&
    shell.marketScene?.nearAuction
  ) {
    if (action === 'auction-view' && (id === 'buy' || id === 'sell' || id === 'history')) {
      shell.auctionView = id;
      shell.refreshAuction();
      return;
    }
    const button = shell.modal.querySelector<HTMLButtonElement>(
      action === 'auction-buy'
        ? `[data-action="auction-buy"][data-id="${Number(id)}"]`
        : '[data-action="auction-sell"]',
    );
    if (!button || button.disabled) return;
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
    if (!traded) return;
    if (!traded.ok) {
      shell.toast(traded.error);
      return;
    }
    const result = traded.result;
    try {
      shell.writeSave(next, shell.pendingRun);
    } catch {
      if (!shell.saveLock) shell.toast('拍卖未完成：浏览器暂时无法保存，请重试');
      return;
    }
    Object.assign(shell.save, next);
    shell.refreshAuction(result.id);
    const status = shell.document.getElementById('town-status');
    if (status) status.innerHTML = shell.townStatus(shell.save);
    const note = shell.modal.querySelector<HTMLElement>('#auction-result');
    if (note) {
      note.hidden = false;
      note.textContent = shell.auctionResult(shell.save, result);
    }
    shell.toast(shell.auctionResult(shell.save, result));
    return;
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
      if (!shell.beginSectMarketVisit(next)) return;
      try {
        shell.writeSave(next, shell.pendingRun);
      } catch {
        if (!shell.saveLock) shell.toast('浏览器暂时无法保存坊市进度，请重试');
        return;
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
      if (!button || button.disabled) return;
      const next = shell.structuredClone(shell.save);
      if (!shell.chooseMarketFellow(next, id, Number(button.dataset.visit))) return;
      try {
        shell.writeSave(next, shell.pendingRun);
      } catch {
        if (!shell.saveLock) shell.toast('这次交谈未能保存，请重试');
        return;
      }
      Object.assign(shell.save, next);
      shell.showMarketEvent(shell.marketNpc);
    } else if (
      [
        'sect-market-debate',
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
      if (!button || button.disabled) return;
      const visit = Number(button.dataset.visit);
      const next = shell.structuredClone(shell.save);
      const social = shell.executeMarketSocial(
        next,
        action,
        id,
        visit,
        Number(button.dataset.level),
        !!shell.pendingRun,
      );
      if (!social.ok) {
        if (social.stale) shell.toast('这桩互动已变化，请重新查看；当前物资未改动');
        return;
      }
      try {
        shell.writeSave(next, shell.pendingRun);
      } catch {
        if (!shell.saveLock) shell.toast('互动未完成：浏览器暂时无法保存，请重试');
        return;
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
        return;
      }
      const next = shell.structuredClone(shell.save);
      if (!shell.exchangeSectMedicine(next, id, give, visit, !!shell.pendingRun)) return;
      try {
        shell.writeSave(next, shell.pendingRun);
      } catch {
        if (!shell.saveLock) shell.toast('互换未完成：浏览器暂时无法保存，请重试');
        return;
      }
      Object.assign(shell.save, next);
      shell.refreshMarketTrade();
      const status = shell.document.getElementById('town-status');
      if (status) status.innerHTML = shell.townStatus(shell.save);
      shell.toast(
        next.mortal.events[0]?.split(' · ').slice(1).join(' · ') || '互换完成，丹药已收入丹囊',
      );
    }
    return;
  }
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
    return;
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
    return;
  }
  if (action === 'human-story' && shell.inMortalWorld && !shell.game) {
    const [storyId, choice] = (id ?? '').split(':');
    if (!shell.isHumanStoryId(storyId)) return;
    const atNpc =
      shell.panel === 'town-event' &&
      shell.inTown &&
      shell.townNpc?.id === shell.HUMAN_STORIES[storyId].npcId &&
      shell.townScene?.nearbyNpc?.id === shell.townNpc.id;
    if (atNpc && shell.chooseHumanStory(shell.save, storyId, choice)) {
      shell.persist();
      shell.showTownEvent(shell.townNpc!);
    }
    return;
  }
  if (action.startsWith('town-') && shell.inMortalWorld && !shell.game && !shell.panel) {
    if (action === 'town-enter' && shell.mortalTab === 'town') {
      const memory = shell.enterTownVisit(shell.save);
      shell.persist();
      shell.telemetry.track({ type: 'town', ...shell.lifeStats() });
      void shell.mobileDisplay.enter();
      shell.inTown = true;
      if (shell.save.mortal.hometown) shell.townPosition = { ...shell.HOMETOWN_START };
      shell.lastMortalTick = shell.performance.now();
      shell.renderMortal();
      shell.document.getElementById('town-view')?.focus({ preventScroll: true });
      if (memory) shell.townScene?.showArrival(memory);
    } else if (action === 'town-retry' && shell.inTown) {
      const memory = shell.document.querySelector('.town-return-note')?.textContent;
      shell.renderMortal();
      if (memory) shell.townScene?.showArrival(memory);
    } else if (action === 'town-exit') {
      shell.leaveTown();
      shell.persist();
      shell.renderMortal();
      shell.document.querySelector<HTMLButtonElement>('[data-action="town-enter"]')?.focus();
    } else if (action === 'town-talk') shell.townScene?.talk();
    return;
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
      return;
    }
    try {
      shell.writeSave(next, shell.pendingRun);
    } catch {
      if (!shell.saveLock) shell.toast('交易未完成：浏览器暂时无法保存，请重试');
      return;
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
    return;
  }
  if (action === 'mortal-buy' || action === 'mortal-sell') return;
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
      return;
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
    } else {
      const changed = shell.executeMortalAction(shell.save, action, id, shell.pendingRun?.path);
      if (changed) {
        const fromTown = shell.panel === 'town-event' || shell.panel === 'tea-story';
        if (fromTown) {
          shell.closeNpcChat();
          shell.panel = '';
          shell.modal.innerHTML = '';
        }
        if (action === 'mortal-join') {
          shell.selectedTreasure = shell.save.starter;
          shell.treasurePage = Math.floor(
            shell.catalogTreasures.findIndex((t) => t.id === shell.save.starter) / 12,
          );
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
        if (action === 'mortal-join' || action === 'mortal-leave')
          shell.toast(shell.save.mortal.events[0]);
        if (action === 'mortal-activity' && !shell.save.mortal.activity)
          shell.toast(shell.save.mortal.events[0]);
      } else if (shell.panel === 'tea-story')
        shell.toast('暂时不能继续听书，请先处理寿元或未完成的事项。');
    }
    return;
  }
  if (action === 'export-save' && !shell.game) {
    shell.downloadJson(shell.exportSave(shell.save, shell.pendingRun), '存档');
    shell.toast('已导出存档，请保留下载的 JSON 文件');
    return;
  }
  if (action === 'import-save' && !shell.game && shell.panel === 'cultivation') {
    shell.document.querySelector<HTMLInputElement>('#save-import')?.click();
    return;
  }
  if (
    action === 'confirm-import' &&
    !shell.game &&
    shell.panel === 'import-confirm' &&
    shell.pendingImport
  ) {
    const candidate = shell.pendingImport;
    try {
      shell.writeSave(candidate.save, candidate.run);
    } catch {
      if (!shell.saveLock) shell.toast('浏览器无法写入存档，当前进度未更改');
      return;
    }
    Object.assign(shell.save, candidate.save, { sound: shell.save.sound });
    if (!shell.save.journeyEnded && !shell.save.pendingReincarnation)
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
    shell.difficulty = 0;
    shell.schoolFilter = 'all';
    shell.bookTab = 'treasures';
    shell.gameAudio.sync();
    shell.returnLobby();
    if (shell.save.journeyEnded) return;
    if (shell.save.pendingReincarnation) {
      shell.renderJourneyFarewell(shell.save.pendingReincarnation);
      return;
    }
    if (shell.lifespanInfo(shell.save).remaining === 0) {
      shell.renderLifespanEnd();
      return;
    }
    if (shell.tribulationDue(shell.save)) {
      shell.renderTribulationPending();
      return;
    }
    if (!shell.save.prologueSeen && shell.save.mortal.hometown?.stage !== 'departed')
      shell.renderPrologue();
    shell.toast('存档已导入，修行进度已恢复');
    return;
  }
  if (shell.panel === 'import-confirm' && ['close', 'cultivation', 'home'].includes(action))
    shell.pendingImport = null;
  if (shell.panel === 'reward-ad' && shell.rewardAd === 'root') {
    if (action === 'ad-root-quality' && shell.SPIRIT_ROOTS.some((r) => r.id === id)) {
      shell.adRoot = id as SpiritRootId;
      shell.adElements = shell.rootElementsFor(shell.adRoot, shell.adElements);
      shell.renderRootPicker();
      shell.refreshAdCountdown('claim-ad-reward', '领取奖励');
      return;
    }
    if (action === 'ad-root-element' && shell.ELEMENTS.some((e) => e.id === id)) {
      const element = id as ElementId;
      const count = shell.spiritRootInfo(shell.adRoot).count;
      if (!count) return;
      if (shell.adElements.includes(element))
        shell.adElements = shell.adElements.filter((e) => e !== element);
      else {
        if (shell.adElements.length === count) shell.adElements.pop();
        shell.adElements.push(element);
      }
      shell.renderRootPicker();
      shell.refreshAdCountdown('claim-ad-reward', '领取奖励');
      return;
    }
  }
  if (shell.panel === 'supplies-shortage' && ['close', 'cancel-supplies'].includes(action)) {
    shell.closeRewardAd();
    return;
  }
  if (
    action === 'watch-root-ad' ||
    (action === 'watch-supplies-ad' && shell.panel === 'supplies-shortage')
  ) {
    shell.showRewardAd(action === 'watch-root-ad' ? 'root' : 'supplies');
    return;
  }
  if (shell.panel === 'reward-ad' && (action === 'close' || action === 'cancel-reward-ad')) {
    shell.closeRewardAd();
    return;
  }
  if (action === 'claim-ad-reward') {
    if (shell.game || shell.panel !== 'reward-ad' || !shell.rewardAd || !shell.adCompleted())
      return;
    const kind = shell.rewardAd;
    const supplies = shell.adSupplies(shell.save.unlocked);
    if (kind === 'root') {
      if (!shell.attuneSpiritRoot(shell.save, shell.adRoot, shell.adElements)) return;
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
    return;
  }
  if (action === 'root-guide') {
    shell.guideTab = 'roots';
    shell.handleAction('guide');
    return;
  }
  if (shell.panel === 'victory' && (action === 'victory-result' || action === 'close')) {
    shell.renderResult();
    return;
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
    return;
  }
  if (action === 'watch-ad') {
    shell.showReviveAd();
    return;
  }
  if (action === 'finish-run' && shell.game?.state === 'lost') {
    shell.finishRun();
    return;
  }
  if (action === 'ad-revive') {
    if (
      shell.panel !== 'revive-ad' ||
      !shell.adCompleted() ||
      shell.settled ||
      !shell.game?.revive()
    )
      return;
    shell.clearInterval(shell.adTimer);
    shell.adReadyAt = 0;
    shell.clearInput();
    shell.panel = '';
    shell.modal.innerHTML = '';
    shell.previousState = 'playing';
    if (shell.game.state === 'won') {
      shell.finishRun();
      return;
    }
    shell.lastFrame = shell.performance.now();
    shell.updateHud();
    shell.persist();
    return;
  }
  if (action === 'reincarnate' && !shell.game) {
    if (
      shell.realmInfo(
        shell.save.cultivation,
        shell.save.completed.includes(shell.FINAL_TRIAL_STAGE),
      ).max
    ) {
      shell.handleAction('immortal-gate');
      return;
    }
    shell.panel = 'reincarnate';

    shell.panelFrame(...shell.reincarnatePanel());
    return;
  }
  if (action === 'confirm-reincarnate' && shell.panel === 'reincarnate' && !shell.game) {
    shell.trackReincarnation('manual');
    shell.resetLifetime(
      undefined,
      shell.modal.querySelector<HTMLInputElement>('#reincarnate-full-opening')?.checked
        ? 'full'
        : false,
      shell.resolveInheritance(
        shell.save,
        shell.modal.querySelector<HTMLSelectElement>('#reincarnate-inheritance')?.value ?? '',
      ),
    );
    return;
  }
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
    return;
  }
  if (action === 'sound' || action === 'mute') {
    shell.volumeOpen = action === 'sound' && !shell.volumeOpen;
    shell.soundSettings.setEnabled(action === 'sound', true);
    if (shell.game) shell.renderHud();
    else shell.renderLobby();
    return;
  }
  if (action === 'close') {
    if (shell.panel === 'treasure-detail' && shell.treasureReturn) {
      const location = shell.treasureReturn;
      shell.treasureReturn = null;
      shell.restorePanel(location);
      return;
    }
    if (shell.panel === 'guide' && !shell.game && shell.guideReturn) {
      const location = shell.guideReturn;
      shell.guideReturn = null;
      shell.restorePanel(location);
      return;
    }
    if (shell.panel === 'journey-card') {
      if (shell.journeyCardReturn === 'lifespan-farewell') shell.renderJourneyFarewell('lifespan');
      else if (shell.journeyCardReturn === 'tribulation-farewell')
        shell.renderJourneyFarewell('tribulation');
      else shell.showPanel('chronicle');
      return;
    }
    shell.closeNpcChat();
    const wasHumanMemory = shell.panel === 'human-memory';
    const returnToAbout = shell.panel === 'about';
    const returnToSettings = shell.panel === 'settings';
    if (shell.game?.state === 'lost' && !shell.settled) return;
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
    return;
  }
  if (action === 'home') {
    if (!shell.game) {
      shell.panel = '';
      shell.modal.innerHTML = '';
      shell.renderLobby();
    }
    return;
  }
  if (action === 'about' && !shell.game) {
    shell.showPanel('about');
    return;
  }
  if (action === 'settings' && !shell.game) {
    shell.showPanel('settings');
    return;
  }
  if (action === 'settings-sound' && shell.panel === 'settings') {
    shell.soundSettings.toggle();
    shell.renderLobby();
    shell.renderPanel();
    return;
  }
  if (action.startsWith('offline-') && shell.panel === 'settings') {
    void shell.offlineAction(action);
    return;
  }
  if (action === 'telemetry-toggle' && shell.panel === 'about') {
    shell.telemetry.setEnabled(!shell.telemetry.enabled());
    shell.renderPanel();
    shell.modal.querySelector<HTMLButtonElement>('[data-action="telemetry-toggle"]')?.focus();
    return;
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
    return;
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
    return;

  if (action === 'guide-tab') {
    shell.guideTab = id!;
    shell.renderPanel();
    shell.modal.querySelector('.panel')?.scrollTo(0, 0);
    return;
  }
  if (
    action === 'journey-card' &&
    (shell.panel === 'chronicle' || shell.panel === 'journey-card')
  ) {
    void shell.renderJourneyCard();
    return;
  }
  if (
    action === 'cultivation' ||
    action === 'arsenal' ||
    action === 'bestiary' ||
    action === 'chronicle'
  ) {
    if (!shell.game) shell.showPanel(action);
    return;
  }
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
  if (action === 'forge' && shell.forge(shell.save, shell.selectedTreasure)) {
    shell.persist();
    shell.renderLobby();
    shell.renderPanel();
    shell.toast(`${shell.treasure(shell.selectedTreasure).name}炼器成功 · 伤害永久提升`);
  }
  if (action === 'retreat' && !shell.game && shell.panel === 'cultivation') {
    const input = shell.document.querySelector<HTMLInputElement>('#retreat-years');
    if (!input || !input.reportValidity()) return;
    const result = shell.retreat(shell.save, Number(input.value));
    if (!result) return;
    if (shell.pendingRun)
      shell.pendingRun = shell.Game.restore(shell.save, shell.pendingRun.snapshot());
    shell.persist();
    shell.renderLobby();
    if (shell.tribulationDue(shell.save)) {
      shell.renderTribulationPending();
      return;
    }
    shell.panel = 'retreat-result';

    shell.panelFrame(...shell.retreatResultPanel(shell.save, result));
    return;
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
      return;
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
}
