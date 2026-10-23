import { homeTownEntrance } from '../src/home-town.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, Script } from 'node:vm';
import { SoundSettings } from '../src/sound-settings.ts';
import * as data from '../src/data.ts';
import * as lifeMode from '../src/life-mode.ts';
import { lifeModeChoice } from '../src/life-mode-ui.ts';
import {
  freshSave,
  readSave,
  endExtremeLife,
  applyBirthInheritance,
  resolveInheritance,
  parseSave,
  lifespanInfo,
  realmInfo,
  tribulationDue,
  enterImmortalGate,
  SAVE_KEY,
  type SaveData,
} from '../src/progress.ts';
import {
  inheritanceContent,
  birthInheritanceNotice,
  isImmortalSuccessor,
} from '../src/inheritance-ui.ts';
import { recordChronicle } from '../src/chronicle.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';
import { spiritRootDiagram, spiritRootEffects, ROOT_IMPRESSIONS } from '../src/common-ui.ts';
import { departHometown, acceptHometownRoot } from '../src/hometown.ts';
import { syncHumanStories } from '../src/human-stories.ts';
import { sectDuesPending } from '../src/mortal.ts';
import { Game } from '../src/game.ts';
import { AD_SECONDS } from '../src/ads.ts';
import { SUPPORT_CODE_IMAGE } from '../src/setting.ts';
import { MedicinePanel } from '../src/medicine-panel.ts';
import { JourneyCardPanel } from '../src/journey-card-panel.ts';
import * as openingUi from '../src/opening-ui.ts';
import * as lobbyUi from '../src/lobby-ui.ts';
import * as townHost from '../src/town-host.ts';
import { dispatchAction } from '../src/action-controller.ts';

// 执行实际函数和调用入口，不导入 main 的游戏、音频、Worker 与页面初始化。
const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const flow = new Script(
  stripTypeScriptTypes(
    [
      'lifeStats',
      'trackReincarnation',
      'resetLifetime',
      'rootRevealContent',
      'refreshRootReveal',
      'renderRootReveal',
      'resumeHometown',
      'shellBindings',
      'handleAction',
      'renderLobby',
      'renderPrologue',
      'persist',
      'writeSave',
      'lockStaleSave',
      'renderSaveLock',
      'endLifetime',
      'beginJourneyFarewell',
      'renderJourneyFarewell',
      'renderJourneyCard',
      'renderDeath',
      'finishRun',
      'renderLifespanEnd',
      'renderTribulationForfeit',
      'renderTribulationPending',
      'finishDeparture',
    ]
      .map((name) => {
        const match = source.match(new RegExp(`^(?:async )?function ${name}\\([^]*?^\\}`, 'm'));
        assert.ok(match, `未找到 main.ts 实际函数 ${name}`);
        return match[0];
      })
      .join('\n'),
  ),
);

function harness(save: SaveData) {
  const noop = () => {};
  const element = {
    remove: noop,
    focus: noop,
    scrollTo: noop,
    isConnected: false, // 留影路由使用真实函数，VM 不加载图片资源。
    style: { setProperty: noop },
    classList: { add: noop, remove: noop, toggle: noop },
  };
  const writes: string[] = [];
  const routes: string[] = [];
  const titles: string[] = [];
  const messages: string[] = [];
  const tracked: Record<string, unknown>[] = [];
  const openingChoice = { checked: false };
  const inheritanceChoice = { value: '' };
  const rootFrame = { ...element, scrollTop: 0 };
  const rootLayout = { innerHTML: '' };
  let rolls = 0;
  const context = createContext({
    battleHud: { reset: noop },
    // 成就队列另有真实回归，此处隔离界面通知，不跳过实际存档写入。
    chronicleSource: { observe() {} },
    hideAchievementNotice() {},
    dispatchAction,
    ...lifeMode,
    lifeModeChoice,
    endExtremeLife,
    homeTownEntrance,
    ...data,
    ambushScene: null,
    save,
    freshSave: (root: data.SpiritRootId, elements: data.ElementId[], path: data.CultivationPath) =>
      freshSave(root, elements, path, () => 0),
    rollSpiritRoot: () => data.rollSpiritRoot(() => [0.1, 0.95, 0.2][rolls++ % 3]),
    rootElementsFor: (root: data.SpiritRootId) => data.rootElementsFor(root, [], () => 0),
    lifespanInfo,
    realmInfo,
    enterImmortalGate,
    applyBirthInheritance,
    resolveInheritance,
    inheritanceContent,
    birthInheritanceNotice,
    isImmortalSuccessor,
    recordChronicle,
    spiritRootDiagram,
    spiritRootEffects,
    ROOT_IMPRESSIONS,
    tribulationDue,
    departHometown,
    acceptHometownRoot,
    syncHumanStories,
    sectDuesPending,
    SAVE_KEY,
    AD_SECONDS,
    SUPPORT_CODE_IMAGE,
    structuredClone,
    AbortController,
    localStorage: {
      getItem: () => writes.at(-1) ?? null,
      setItem(key: string, value: string) {
        assert.equal(key, SAVE_KEY);
        writes.push(value);
      },
    },
    settlementRetryAt: 0,
    saveLock: null,
    unreadableBackedUp: false,
    lastSaveText: null,
    writes,
    routes,
    titles,
    messages,
    tracked,
    telemetry: { track: (event: Record<string, unknown>) => tracked.push(event), flush: noop },
    openingChoice,
    inheritanceChoice,
    rootFrame,
    rootLayout,
    document: { body: element },
    ui: { innerHTML: '', inert: false, querySelector: () => element },
    modal: {
      innerHTML: '',
      querySelector: (selector: string) =>
        selector === '.root-reveal-panel' ||
        (selector === '.panel' && context.panel === 'root-reveal')
          ? context.panel === 'root-reveal'
            ? rootFrame
            : null
          : selector === '.root-reveal-layout'
            ? context.panel === 'root-reveal'
              ? rootLayout
              : null
            : selector === '#reincarnate-full-opening'
              ? context.modal.innerHTML.includes('id="reincarnate-full-opening"')
                ? openingChoice
                : null
              : selector === '#reincarnate-inheritance'
                ? context.modal.innerHTML.includes('id="reincarnate-inheritance"')
                  ? inheritanceChoice
                  : null
                : element,
    },
    window: { clearTimeout: noop, matchMedia: () => ({ matches: false }) },
    clearInterval: noop,
    clearInput: noop,
    gameAudio: { sync: noop, play: noop },
    mobileDisplay: { available: false, active: false, enter: noop, leave: noop },
    toast: (text: string) => messages.push(text),
    shownHumanLetters: new Set(['previous-life']),
    game: null,
    pendingRun: null,
    rewards: null,
    pendingImport: null,
    rewardAd: null,
    adTimer: undefined,
    victoryTimer: undefined,
    adReadyAt: 0,
    adWatchEpoch: 0,
    panel: '',
    journeyCardReturn: 'chronicle',
    settled: false,
    selectedStage: 0,
    difficulty: 0,
    treasurePage: 0,
    selectedTreasure: save.starter,
    schoolFilter: 'all',
    bookTab: 'treasures',
    inTown: false,
    inMarket: false,
    inMortalWorld: false,
    assetsReady: false,
    storageAvailable: true,
    volumeOpen: false,
    PROLOGUE_IMAGE: '',
    // 只替换展示叶节点，路由判断、存档写入和模型转换均执行源码。
    ...Object.fromEntries(
      [
        'currency',
        'controls',
        'completedJourney',
        'realmVerse',
        'spriteStyle',
        'spiritRootSummary',
        'journeyMap',
        'medicineEntrance',
        'chronicleEntrance',
        'icon',
        'smallIcon',
        'assetUrl',
        'updateStorySoundButton',
        'closeNpcChat',
      ].map((name) => [name, () => '']),
    ),
  });
  Object.assign(context, {
    leaveTown() {
      context.inTown = false;
    },
    panelFrame(_title: string, _subtitle: string, content: string) {
      context.modal.innerHTML = content;
      if (content.includes('id="reincarnate-full-opening"')) openingChoice.checked = false;
      inheritanceChoice.value = '';
      titles.push(_title);
      if (context.panel === 'root-reveal') rootLayout.innerHTML = context.rootRevealContent();
      routes.push(context.panel);
    },
    renderRootReveal() {
      context.panel = 'root-reveal';
      context.ui.inert = true;
      context.rootLayout.innerHTML = context.rootRevealContent();
      routes.push(context.panel);
    },
    renderDeparture() {
      context.panel = 'hometown-loading';
      context.inTown = context.inMortalWorld = true;
      routes.push(context.panel);
    },
    renderEpilogue() {
      context.panel = 'epilogue';
      routes.push(context.panel);
    },
  });
  Object.assign(context, openingUi, lobbyUi, townHost);
  flow.runInContext(context);
  context.medicinePanel = new MedicinePanel(save, context.modal, {
    show: noop,
    render: noop,
    refresh: noop,
    commit: () => true,
    starterChanged: noop,
    toast: noop,
  });
  context.journeyCardPanel = new JourneyCardPanel(context.modal, (title, subtitle, body) =>
    context.panelFrame(title, subtitle, body),
  );
  context.soundSettings = new SoundSettings(save, context.gameAudio, () => context.persist());
  return context;
}

function previousLife() {
  const save = freshSave('heaven', ['fire'], 'demonic', () => 0.9);
  save.prologueSeen = true;
  departHometown(save);
  acceptHometownRoot(save);
  Object.assign(save, {
    age: 80,
    cultivation: 10000,
    stones: 12345,
    iron: 234,
    unlocked: 4,
    completed: [0, 1, 2, 3],
    bestKills: 999,
    runs: 12,
    sound: true,
    volume: 0.27,
    autoplay: true,
    lifespanBonus: 300,
    tribulations: 3,
    nextTribulationAge: 20000,
    tribulationReturn: { previousRun: true },
    training: { vitality: 4, power: 3, speed: 2 },
    retreatBonus: { vitality: 5, power: 6, speed: 7 },
    artifacts: data.TREASURES.map((treasure) => treasure.id),
    forge: { sword: 5 },
  });
  save.medicine.bag.huanglong = 9;
  save.mortal.years = 65;
  save.mortal.mastery.guard = 4;
  save.mortal.activity = { kind: 'herbs', remaining: 0.5, total: 1, sect: null };
  save.mortal.events.push('前世旧事');
  save.chronicle.entries.push({ age: 80, title: '前世修行', detail: '不应带入下一世' });
  return save;
}

function assertNewReveal(context: ReturnType<typeof harness>) {
  const save = context.save as SaveData;
  assert.equal(save.mortal.hometown?.stage, 'reveal');
  assert.equal(save.prologueSeen, true);
  assert.equal(save.hometownSeen, true);
  assert.equal(context.panel, 'root-reveal');
  assert.equal(context.ui.inert, true);
  assert.equal(context.game, null);
  assert.equal(context.pendingRun, null);
  assert.equal(save.age, 15);
  assert.equal(save.pendingReincarnation, null);
  assert.equal(save.journeyEnded, false);
  assert.ok(lifespanInfo(save).remaining > 0);
  assert.equal(tribulationDue(save), false);
  assert.deepEqual(JSON.parse(context.writes.at(-1)), { ...save, activeRun: null });
}

test('取消弃劫退出确认状态，继续修行、指南返回、再次弃劫与落败复活入口仍可操作', () => {
  for (const cancel of ['cancel-forfeit', 'close']) {
    const save = previousLife();
    save.cultivation = 1e9;
    save.age = save.nextTribulationAge;
    const context = harness(save);
    const battle = Game.createTribulation(save, null);
    battle.pause();
    context.game = battle;
    context.renderPause = () => context.panelFrame(...lobbyUi.pausePanel(battle, save, 60, false));
    context.showPanel = (name: string) => {
      context.panel = name;
      context.modal.innerHTML = '指南正文';
    };

    context.handleAction('abandon');
    assert.equal(context.panel, 'tribulation-forfeit');
    context.handleAction(cancel);
    assert.equal(context.panel, '');
    assert.match(context.modal.innerHTML, /data-action="resume"/);
    context.handleAction('resume');
    assert.equal(battle.state, 'playing');
    assert.equal(context.modal.innerHTML, '');
    context.handleAction('pause');
    context.handleAction('guide');
    assert.equal(context.panel, 'guide');
    assert.equal(battle.state, 'paused');
    context.handleAction('close');
    assert.equal(context.panel, '');
    assert.match(context.modal.innerHTML, /data-action="resume"/);
    context.handleAction('abandon');
    assert.equal(context.panel, 'tribulation-forfeit');
    context.handleAction(cancel);
    assert.equal(context.panel, '');

    battle.state = 'lost';
    battle.player.hp = 0;
    context.renderDeath();
    context.handleAction('finish-run');
    assert.equal(context.panel, 'tribulation-forfeit');
    context.handleAction(cancel);
    assert.equal(context.panel, 'death');
    assert.match(context.modal.innerHTML, /data-action="watch-ad"/);
    let revives = 0;
    context.showReviveAd = () => {
      revives++;
    };
    context.handleAction('watch-ad');
    assert.equal(revives, 1);
    assert.equal(save.pendingReincarnation, null);
    assert.equal(context.game, battle);
  }
});

test('命盘连续重抽只更新结果，保留弹窗与滚动，不经过故乡或序章', () => {
  const save = freshSave();
  save.prologueSeen = true;
  departHometown(save);
  const context = harness(save);
  context.renderLobby();
  assert.equal(context.panel, 'root-reveal');
  context.routes.length = 0;
  const frame = context.rootFrame;
  const layout = context.rootLayout;
  context.modal.innerHTML = '保留命盘外框、说明、遗物与按钮';
  context.ui.innerHTML = '保留背景首页';
  frame.scrollTop = 160;
  for (const root of ['variant', 'none', 'dual', 'variant']) {
    context.handleAction('reroll-root');
    assertNewReveal(context);
    assert.equal(save.spiritRoot, root);
    assert.equal(save.rootElements.length, data.spiritRootInfo(root).count);
    assert.equal(context.rootFrame, frame);
    assert.equal(context.rootLayout, layout);
    assert.equal(frame.scrollTop, 160);
    assert.equal(context.modal.innerHTML, '保留命盘外框、说明、遗物与按钮');
    assert.equal(context.ui.innerHTML, '保留背景首页');
    assert.match(layout.innerHTML, new RegExp(data.spiritRootInfo(root).name));
  }
  assert.deepEqual(context.routes, []);
  assert.equal(context.writes.length, 4);
  assert.deepEqual(context.tracked, []);
});

test('重抽或确认轮回时发现另一窗口更新存档，保留存档锁提示且不覆盖存档', () => {
  for (const action of ['reroll-root', 'confirm-reincarnate']) {
    const context = harness(previousLife());
    if (action === 'reroll-root') context.renderRootReveal();
    else context.handleAction('reincarnate');
    context.routes.length = 0;
    context.ui.innerHTML = '原背景';
    const layout = context.rootLayout.innerHTML;
    const otherSave = JSON.stringify(freshSave('none'));
    context.localStorage.getItem = () => otherSave;
    context.handleAction(action);
    assert.equal(context.saveLock, 'stale');
    assert.equal(context.panel, 'save-lock');
    assert.equal(context.ui.inert, true);
    assert.match(context.modal.innerHTML, /另一窗口已有更新的进度/);
    assert.equal(context.ui.innerHTML, '原背景');
    assert.equal(context.rootLayout.innerHTML, layout);
    assert.deepEqual(context.routes, ['save-lock']);
    assert.deepEqual(context.writes, []);
    assert.equal(context.localStorage.getItem(), otherSave);
  }
});

test('主动轮回保留清档确认与取消，确认后清旧进度并直接展示新命盘', () => {
  const save = previousLife();
  const context = harness(save);
  context.pendingRun = {
    snapshot: () => ({ previousRun: true }),
    encounterName: '旧历练',
    time: 60,
    path: 'demonic',
    level: 8,
  };
  const oldRun = context.pendingRun;
  const before = JSON.stringify(save);
  context.handleAction('confirm-reincarnate');
  assert.equal(JSON.stringify(save), before);
  assert.equal(context.panel, '');
  context.handleAction('reincarnate');
  assert.equal(context.panel, 'reincarnate');
  assert.match(context.modal.innerHTML, /确认轮回 · 清空进度/);
  assert.equal(JSON.stringify(save), before);
  assert.equal(context.pendingRun, oldRun);
  assert.equal(context.writes.length, 0);
  context.handleAction('home');
  assert.equal(context.panel, '');
  assert.equal(JSON.stringify(save), before);
  assert.equal(context.pendingRun, oldRun);
  context.handleAction('reincarnate');
  context.routes.length = 0;
  assert.deepEqual(context.tracked, []);
  const runs = save.runs;
  context.handleAction('confirm-reincarnate');
  assertNewReveal(context);
  assert.deepEqual(context.routes, ['root-reveal']);
  assert.equal(context.tracked.length, 1);
  assert.equal(context.tracked[0].type, 'reincarnate');
  assert.equal(context.tracked[0].result, 'manual');
  assert.equal(context.tracked[0].runs, runs);
  const expected = freshSave('variant', ['metal'], 'orthodox', () => 0);
  Object.assign(expected, { sound: true, volume: 0.27, prologueSeen: true });
  departHometown(expected);
  // 药方种子独立随机；比较清档结果，不要求两次 freshSave 抽到同一种子。
  expected.medicine.recipeSeed = save.medicine.recipeSeed;
  assert.deepEqual(save, expected);
  assert.equal(context.shownHumanLetters.size, 0);
});

test('未看序章的旧档轮回也直接到命盘，持久化重载和接受命盘后不补序章', () => {
  const save = previousLife();
  save.prologueSeen = false;
  save.hometownSeen = false;
  delete save.mortal.hometown;
  const context = harness(save);
  context.handleAction('reincarnate');
  context.routes.length = 0;
  context.handleAction('confirm-reincarnate');
  assertNewReveal(context);
  assert.deepEqual(context.routes, ['root-reveal']);
  const restored = harness(parseSave(context.writes.at(-1)));
  restored.renderLobby();
  restored.renderPrologue();
  assert.equal(restored.panel, 'root-reveal');
  assert.equal(restored.save.mortal.hometown.stage, 'reveal');
  assert.equal(restored.save.prologueSeen, true);
  restored.handleAction('accept-root');
  restored.renderPrologue();
  assert.equal(restored.panel, '');
  assert.equal(restored.ui.inert, false);
  assert.equal(restored.save.mortal.hometown.stage, 'departed');
  assert.match(restored.ui.innerHTML, /lobby-header/);
  const accepted = harness(parseSave(restored.writes.at(-1)));
  accepted.renderLobby();
  accepted.renderPrologue();
  assert.equal(accepted.panel, '');
  assert.equal(accepted.save.prologueSeen, true);
  assert.equal(accepted.resumeHometown(), false);
});

for (const reason of ['lifespan', 'tribulation'] as const) {
  test(`${reason === 'lifespan' ? '寿终' : '弃劫'}保留本世落幕确认，轮回默认直接展示命盘`, () => {
    const save = previousLife();
    if (reason === 'lifespan') save.age = lifespanInfo(save).limit;
    else {
      save.cultivation = 1e9;
      save.age = save.nextTribulationAge;
    }
    const context = harness(save);
    if (reason === 'lifespan') {
      assert.equal(lifespanInfo(save).remaining, 0);
      context.renderLifespanEnd();
      context.handleAction('end-lifetime');
    } else {
      assert.equal(tribulationDue(save), true);
      context.handleAction('tribulation-forfeit');
      assert.equal(context.panel, 'tribulation-forfeit');
      context.handleAction('confirm-forfeit');
    }
    assert.equal(context.panel, `${reason}-farewell`);
    assert.equal(save.pendingReincarnation, reason);
    assert.equal(save.stones, 12345);
    assert.equal(parseSave(context.writes.at(-1)).pendingReincarnation, reason);
    context.routes.length = 0;
    context.handleAction('confirm-journey-reincarnate');
    assertNewReveal(context);
    assert.deepEqual(context.routes, ['root-reveal']);
    assert.deepEqual(
      context.tracked.map((event) => [event.type, event.result]),
      [['reincarnate', reason]],
    );
    assert.equal(save.stones, 0);
    assert.equal(save.cultivation, 0);
    assert.match(
      context.messages.at(-1),
      reason === 'lifespan' ? /前世止于.*享年/ : /前世止于天劫/,
    );
  });

  test(`${reason === 'lifespan' ? '寿终' : '天劫殒命'}留影关闭与重试不重新开放游戏，读档后仍只能轮回`, () => {
    const save = previousLife();
    const context = harness(save);
    if (reason === 'tribulation') {
      save.cultivation = 1e9;
      save.age = save.nextTribulationAge;
      const battle = Game.createTribulation(save, null);
      battle.revivesUsed = data.MAX_REVIVES;
      battle.hurtPlayer(battle.player.maxHp * 2);
      battle.update(0.01);
      assert.equal(battle.state, 'lost');
      context.game = battle;
      context.renderDeath();
      assert.equal(context.panel, 'tribulation-forfeit');
      context.handleAction('cancel-forfeit');
      assert.equal(context.game, battle);
      assert.equal(battle.revivesUsed, data.MAX_REVIVES);
      assert.equal(battle.state, 'lost');
      context.handleAction('confirm-forfeit');
    } else {
      save.age = lifespanInfo(save).limit;
      context.renderLifespanEnd();
      context.handleAction('end-lifetime');
    }
    assert.equal(save.pendingReincarnation, reason);
    assert.equal(context.game, null);
    assert.equal(context.pendingRun, null);
    const persisted = context.writes.at(-1);
    assert.equal(JSON.parse(persisted).activeRun, null);
    for (const state of [context, harness(parseSave(persisted))]) {
      state.renderJourneyFarewell(reason);
      const ended = JSON.stringify(state.save);
      for (let attempt = 0; attempt < 3; attempt++) {
        state.handleAction('journey-card');
        assert.equal(state.panel, 'journey-card');
        assert.equal(state.journeyCardReturn, `${reason}-farewell`);
        state.handleAction('close');
        assert.equal(state.panel, `${reason}-farewell`);
        assert.doesNotMatch(state.modal.innerHTML, /迎战天劫|继续迎劫/);
        state.handleAction('journey-card');
        state.handleAction('journey-card');
        assert.equal(state.panel, 'journey-card');
        for (const action of [
          'tribulation-start',
          'home',
          'resume',
          'confirm-journey-reincarnate',
        ]) {
          state.handleAction(action);
          assert.equal(state.panel, 'journey-card');
          assert.equal(state.game, null);
          assert.equal(state.pendingRun, null);
          assert.equal(JSON.stringify(state.save), ended);
        }
        state.handleAction('close');
      }
      state.handleAction('confirm-journey-reincarnate');
      assertNewReveal(state);
    }
  });
}

test('只有圆满终章入口保留故乡 farewell 和选择，之后命盘重抽仍走默认路径', () => {
  const save = previousLife();
  save.cultivation = 1e9;
  save.completed = [data.FINAL_TRIAL_STAGE];
  assert.equal(enterImmortalGate(save), true);
  const context = harness(save);
  context.renderLobby();
  context.handleAction('epilogue-reincarnate');
  assert.equal(context.panel, 'epilogue-reincarnate');
  assert.equal(save.journeyEnded, true);
  context.routes.length = 0;
  context.handleAction('confirm-reincarnate');
  assert.equal(save.journeyEnded, false);
  assert.equal(save.age, 15);
  assert.equal(save.stones, 0);
  assert.equal(save.mortal.hometown?.stage, 'farewell');
  assert.equal(context.panel, 'hometown-choice');
  assert.deepEqual(context.routes, ['hometown-choice']);
  assert.match(context.modal.innerHTML, /data-action="hometown-skip"/);
  assert.match(context.modal.innerHTML, /data-action="hometown-walk"/);
  const restored = harness(parseSave(context.writes.at(-1)));
  restored.renderLobby();
  assert.equal(restored.panel, 'hometown-choice');
  restored.handleAction('hometown-walk');
  assert.equal(restored.panel, 'hometown-loading');
  assert.equal(restored.save.mortal.hometown.stage, 'farewell');
  context.handleAction('hometown-skip');
  assertNewReveal(context);
  context.routes.length = 0;
  context.handleAction('reroll-root');
  assertNewReveal(context);
  assert.deepEqual(context.routes, []);
});

test('首次 freshSave 仍从序章和 farewell 离乡开始，不提前显示命盘或故乡选择', () => {
  const save = freshSave();
  assert.equal(save.prologueSeen, false);
  assert.equal(save.hometownSeen, false);
  assert.equal(save.mortal.hometown?.stage, 'farewell');
  const context = harness(save);
  context.renderLobby();
  context.renderPrologue();
  assert.equal(context.panel, 'prologue');
  assert.equal(save.prologueSeen, false);
  assert.equal(save.mortal.hometown?.stage, 'farewell');
  context.handleAction('prologue-enter');
  assert.equal(save.prologueSeen, true);
  assert.equal(save.hometownSeen, false);
  assert.equal(save.mortal.hometown?.stage, 'farewell');
  assert.equal(context.panel, 'hometown-loading');
  assert.deepEqual(context.routes, ['hometown-loading']);
});

test('序章上下按钮语义不同，跳过开场直接命盘且不重抽灵根或父母', () => {
  const save = freshSave('triple', ['wood', 'water', 'earth'], 'orthodox', () => 0.2);
  const before = structuredClone(save);
  const context = harness(save);
  context.renderLobby();
  context.renderPrologue();
  assert.match(
    context.modal.innerHTML,
    /class="prologue-skip" data-action="prologue-skip">跳过开场/,
  );
  assert.match(
    context.modal.innerHTML,
    /class="primary-button" data-action="prologue-enter">入此山河/,
  );
  context.handleAction('prologue-skip');
  assertNewReveal(context);
  assert.deepEqual(context.routes, ['root-reveal']);
  for (const key of [
    'spiritRoot',
    'rootElements',
    'starter',
    'artifacts',
    'medicine',
    'stones',
    'iron',
    'cultivation',
  ] as const)
    assert.deepEqual(save[key], before[key]);
  assert.deepEqual(save.mortal.hometown!.parents, before.mortal.hometown!.parents);
  assert.equal(save.chronicle.milestones['home-reunion'], undefined);
  const after = JSON.stringify(save);
  context.handleAction('prologue-skip');
  assert.equal(JSON.stringify(save), after);
  assert.equal(context.writes.length, 1);
  const restored = harness(parseSave(context.writes[0]));
  restored.renderLobby();
  restored.renderPrologue();
  assert.equal(restored.panel, 'root-reveal');
  assert.equal(restored.save.spiritRoot, before.spiritRoot);
});

test('跳过开场保存失败时停在序章，重试仍使用同一灵根和父母', () => {
  const save = freshSave();
  const context = harness(save);
  context.renderLobby();
  context.renderPrologue();
  const before = JSON.stringify(save);
  const write = context.localStorage.setItem;
  context.localStorage.setItem = () => {
    throw new Error('quota');
  };
  context.handleAction('prologue-skip');
  assert.equal(context.panel, 'prologue');
  assert.equal(context.ui.inert, true);
  assert.equal(JSON.stringify(save), before);
  assert.equal(context.writes.length, 0);
  assert.match(context.messages.at(-1), /无法保存离乡进度/);
  context.localStorage.setItem = write;
  context.handleAction('prologue-skip');
  assertNewReveal(context);
});

test('重温序章两个按钮只返回原人生，旧档跳过文字不清除续局', () => {
  const save = previousLife();
  const context = harness(save);
  context.renderLobby();
  context.handleAction('prologue-revisit');
  assert.equal(context.panel, 'prologue');
  assert.doesNotMatch(context.modal.innerHTML, /data-action="prologue-skip"/);
  assert.equal(context.modal.innerHTML.match(/>返回仙途 /g)?.length, 2);
  const before = JSON.stringify(save);
  context.handleAction('prologue-enter');
  assert.equal(JSON.stringify(save), before);
  assert.equal(context.panel, '');

  save.prologueSeen = false;
  delete save.mortal.hometown;
  const legacy = harness(save);
  const pending = {
    snapshot: () => ({ previousRun: true }),
    encounterName: '旧历练',
    time: 60,
    path: 'demonic',
    level: 8,
  };
  legacy.pendingRun = pending;
  legacy.renderPrologue();
  legacy.handleAction('prologue-skip');
  assert.equal(legacy.pendingRun, pending);
  assert.equal(save.stones, 12345);
  assert.equal(save.mortal.hometown, undefined);
  assert.equal(save.prologueSeen, true);
  assert.equal(JSON.parse(legacy.writes.at(-1)).activeRun.previousRun, true);
});

test('完整重开选项默认不勾选，选择后取消不改存档，再次打开仍默认快捷轮回', () => {
  const save = previousLife();
  const context = harness(save);
  const before = JSON.stringify(save);
  context.handleAction('reincarnate');
  assert.match(context.modal.innerHTML, /id="reincarnate-full-opening" type="checkbox"/);
  assert.match(context.modal.innerHTML, /重走十五岁那一程/);
  assert.doesNotMatch(context.modal.innerHTML, /type="checkbox"[^>]*checked/);
  assert.equal(context.openingChoice.checked, false);
  context.openingChoice.checked = true;
  context.handleAction('home');
  assert.equal(JSON.stringify(save), before);
  assert.equal(context.writes.length, 0);
  context.handleAction('reincarnate');
  assert.equal(context.openingChoice.checked, false);
  context.handleAction('confirm-reincarnate');
  assertNewReveal(context);
});

test('勾选完整开始后从序章重开，刷新后入此山河直接告别而非再次选故乡', () => {
  const save = previousLife();
  const context = harness(save);
  context.handleAction('reincarnate');
  context.openingChoice.checked = true;
  context.handleAction('confirm-reincarnate');
  assert.equal(context.panel, 'prologue');
  assert.equal(save.age, 15);
  assert.equal(save.stones, 0);
  assert.equal(save.cultivation, 0);
  assert.equal(save.prologueSeen, false);
  assert.equal(save.hometownSeen, false);
  assert.equal(save.mortal.hometown?.stage, 'farewell');
  assert.equal(context.pendingRun, null);
  assert.ok(!context.routes.includes('hometown-choice'));
  assert.ok(!context.routes.includes('root-reveal'));
  assert.equal(context.ui.inert, true);
  const restored = harness(parseSave(context.writes.at(-1)));
  restored.renderLobby();
  restored.renderPrologue();
  assert.equal(restored.panel, 'prologue');
  const root = restored.save.spiritRoot;
  restored.handleAction('prologue-enter');
  assert.equal(restored.panel, 'hometown-loading');
  assert.equal(restored.save.hometownSeen, false);
  assert.ok(!restored.routes.includes('hometown-choice'));
  restored.save.mortal.hometown.stage = 'walk';
  restored.finishDeparture();
  assertNewReveal(restored);
  assert.equal(restored.save.spiritRoot, root);
});

test('完整重开仍可主动跳过开场，此后命盘重抽不继承完整重开选择', () => {
  const context = harness(previousLife());
  context.handleAction('reincarnate');
  context.openingChoice.checked = true;
  context.handleAction('confirm-reincarnate');
  const before = structuredClone(context.save);
  context.handleAction('prologue-skip');
  assertNewReveal(context);
  assert.equal(context.save.spiritRoot, before.spiritRoot);
  assert.deepEqual(context.save.mortal.hometown.parents, before.mortal.hometown.parents);
  context.routes.length = 0;
  context.handleAction('reroll-root');
  assertNewReveal(context);
  assert.deepEqual(context.routes, []);
});

test('真仙主动重启进入同一离界终章：取消保留修行，赠魔道法宝仅入青年收藏', () => {
  const save = previousLife();
  save.completed = [data.FINAL_TRIAL_STAGE];
  save.cultivation = 1e9;
  save.forge.skull = 10;
  const old = JSON.stringify(save);
  const context = harness(save);
  context.handleAction('reincarnate');
  assert.equal(context.panel, 'immortal-gate');
  assert.doesNotMatch(context.modal.innerHTML, /只能轮回|确认轮回/);
  context.handleAction('close');
  assert.equal(JSON.stringify(save), old);
  context.handleAction('reincarnate');
  context.handleAction('confirm-immortal-gate');
  assert.equal(context.panel, 'epilogue');
  assert.equal(save.journeyEnded, true);
  const ended = JSON.stringify(save);
  context.handleAction('epilogue-reincarnate');
  assert.match(context.modal.innerHTML, /真仙传承/);
  context.inheritanceChoice.value = 'artifact:skull';
  context.handleAction('close');
  assert.equal(JSON.stringify(save), ended);
  context.handleAction('epilogue-reincarnate');
  assert.equal(context.inheritanceChoice.value, '');
  context.inheritanceChoice.value = 'artifact:skull';
  context.handleAction('confirm-reincarnate');
  context.handleAction('hometown-skip');
  assertNewReveal(context);
  assert.equal(isImmortalSuccessor(save), true);
  assert.equal(context.titles.at(-1), '少年承缘，始问长生');
  assert.match(context.modal.innerHTML, /重看命盘/);
  assert.doesNotMatch(context.modal.innerHTML, /轮回转世/);
  assert.equal(save.path, 'orthodox');
  assert.notEqual(save.starter, 'skull');
  assert.equal(save.forge.skull, 10);
  assert.deepEqual(save.artifacts, [
    ...new Set([...data.ROOT_STARTERS[data.treasure(save.starter).element], 'skull']),
  ]);
  assert.equal(save.medicine.bag.huanglong, undefined);
  assert.equal(save.stones, 0);
  assert.equal(save.iron, 0);
  assert.deepEqual(save.training, { vitality: 0, power: 0, speed: 0 });
  assert.equal(save.chronicle.entries.filter((e) => e.title === '薪火相传').length, 1);
  let restored = harness(parseSave(context.writes.at(-1)));
  for (let i = 0; i < 4; i++) {
    restored.renderLobby();
    restored.handleAction('reroll-root');
    assert.equal(isImmortalSuccessor(restored.save), true);
    assert.equal(restored.save.forge.skull, 10);
    assert.deepEqual(Array.from(restored.save.artifacts), [
      ...new Set([...data.ROOT_STARTERS[data.treasure(restored.save.starter).element], 'skull']),
    ]);
    assert.equal(
      restored.save.chronicle.entries.filter((e: { title: string }) => e.title === '薪火相传')
        .length,
      1,
    );
    assert.equal(
      restored.save.chronicle.entries.filter((e: { title: string }) => e.title === '承缘启程')
        .length,
      1,
    );
    restored = harness(parseSave(restored.writes.at(-1)));
  }
  restored.renderLobby();
  restored.handleAction('accept-root');
  assert.equal(restored.save.birthInheritance, null);
  assert.equal(restored.save.forge.skull, 10);
  const imported = importSave(exportSave(restored.save, null)).save;
  assert.equal(imported.birthInheritance, null);
  assert.equal(isImmortalSuccessor(imported), true);
});

test('离界赠一枚丹药：仅在少年将行选择故乡路线，刷新和重抽均不增加库存', () => {
  for (const route of ['skip', 'walk'] as const) {
    const save = previousLife();
    save.cultivation = 1e9;
    save.completed = [data.FINAL_TRIAL_STAGE];
    const context = harness(save);
    assert.equal(enterImmortalGate(save), true);
    context.renderLobby();
    context.handleAction('epilogue-reincarnate');
    assert.doesNotMatch(context.modal.innerHTML, /reincarnate-full-opening|从少年离乡看起/);
    context.inheritanceChoice.value = 'medicine:huanglong';
    context.handleAction('confirm-reincarnate');
    let restored = harness(parseSave(context.writes.at(-1)));
    restored.renderLobby();
    assert.equal(restored.titles.at(-1), '少年将行');
    if (route === 'walk') {
      restored.handleAction('hometown-walk');
      restored.finishDeparture();
    } else restored.handleAction('hometown-skip');
    assertNewReveal(restored);
    assert.equal(isImmortalSuccessor(restored.save), true);
    assert.equal(restored.titles.at(-1), '少年承缘，始问长生');
    assert.deepEqual(restored.save.medicine.bag, { huanglong: 1 });
    assert.deepEqual(restored.save.medicine.active, {});
    restored = harness(parseSave(restored.writes.at(-1)));
    restored.renderLobby();
    for (let i = 0; i < 3; i++) restored.handleAction('reroll-root');
    assert.deepEqual(restored.save.medicine.bag, { huanglong: 1 });
    restored.handleAction('accept-root');
    assert.equal(restored.save.birthInheritance, null);
    assert.deepEqual(restored.save.medicine.bag, { huanglong: 1 });
  }
});

test('终章不赠物也由青年接续，接受、导出导入与重抽均保留来历', () => {
  const save = previousLife();
  save.cultivation = 1e9;
  save.completed = [data.FINAL_TRIAL_STAGE];
  enterImmortalGate(save);
  const context = harness(save);
  context.renderLobby();
  context.handleAction('epilogue-reincarnate');
  assert.equal(context.openingChoice.checked, false);
  assert.equal(context.inheritanceChoice.value, '');
  context.handleAction('confirm-reincarnate');
  assert.equal(context.save.birthInheritance, null);
  assert.equal(isImmortalSuccessor(context.save), true);
  const restored = harness(importSave(exportSave(context.save, null)).save);
  restored.renderLobby();
  assert.equal(restored.titles.at(-1), '少年将行');
  restored.handleAction('hometown-skip');
  assertNewReveal(restored);
  assert.equal(restored.titles.at(-1), '少年承缘，始问长生');
  assert.match(restored.modal.innerHTML, /你是渡口那个十五岁的少年/);
  for (let i = 0; i < 3; i++) restored.handleAction('reroll-root');
  assert.equal(isImmortalSuccessor(restored.save), true);
  assert.equal(restored.save.birthInheritance, null);
  assert.deepEqual(restored.save.forge, {});
  assert.deepEqual(restored.save.medicine.bag, {});
  assert.equal(
    restored.save.chronicle.entries.filter((e: { title: string }) => e.title === '承缘启程').length,
    1,
  );
  restored.handleAction('accept-root');
  assert.equal(isImmortalSuccessor(parseSave(restored.writes.at(-1))), true);
});

test('承缘少年普通主动轮回、寿尽与弃劫均重启人生，不携带前人的身份或赠物', () => {
  for (const route of ['manual', 'lifespan', 'tribulation'] as const) {
    const save = previousLife();
    recordChronicle(save, '承缘启程', '此前接续了一名修士的问道之路。', 'immortal-successor');
    const context = harness(save);
    if (route === 'manual') {
      context.handleAction('reincarnate');
      context.handleAction('confirm-reincarnate');
    } else {
      if (route === 'lifespan') save.age = lifespanInfo(save).limit;
      else {
        save.cultivation = 1e9;
        save.age = save.nextTribulationAge;
      }
      context.beginJourneyFarewell(route);
      context.handleAction('confirm-journey-reincarnate');
    }
    assertNewReveal(context);
    assert.equal(isImmortalSuccessor(save), false);
    assert.equal(save.birthInheritance, null);
    assert.doesNotMatch(context.modal.innerHTML, /少年承缘|前人所赠|重看命盘/);
  }
});

test('终章未看过开场的存档也只在少年将行选择一次，旧勾选不能另开一条路线', () => {
  const save = previousLife();
  save.cultivation = 1e9;
  save.completed = [data.FINAL_TRIAL_STAGE];
  enterImmortalGate(save);
  save.prologueSeen = false;
  save.hometownSeen = false;
  const context = harness(save);
  context.renderLobby();
  context.handleAction('epilogue-reincarnate');
  assert.doesNotMatch(context.modal.innerHTML, /reincarnate-full-opening|从少年离乡看起/);
  context.openingChoice.checked = true;
  context.handleAction('confirm-reincarnate');
  assert.equal(context.panel, 'hometown-choice');
  assert.equal(context.titles.at(-1), '少年将行');
  assert.equal(save.prologueSeen, true);
  assert.equal(save.hometownSeen, true);
  const restored = harness(parseSave(context.writes.at(-1)));
  restored.renderLobby();
  assert.equal(restored.panel, 'hometown-choice');
  restored.handleAction('hometown-walk');
  assert.equal(restored.panel, 'hometown-loading');
  restored.finishDeparture();
  assertNewReveal(restored);
});

test('少年已选故乡后，中途刷新和导入只恢复告别，不再次选择路线', () => {
  const save = previousLife();
  save.cultivation = 1e9;
  save.completed = [data.FINAL_TRIAL_STAGE];
  enterImmortalGate(save);
  const context = harness(save);
  context.renderLobby();
  context.handleAction('epilogue-reincarnate');
  context.handleAction('confirm-reincarnate');
  context.handleAction('hometown-walk');
  assert.equal(context.save.hometownSeen, false);
  assert.equal(context.save.mortal.hometown?.stage, 'farewell');
  for (const save of [
    parseSave(context.writes.at(-1)),
    importSave(exportSave(context.save, null)).save,
  ]) {
    const restored = harness(save);
    restored.renderLobby();
    assert.equal(restored.panel, 'hometown-loading');
    assert.ok(!restored.routes.includes('hometown-choice'));
    restored.finishDeparture();
    assertNewReveal(restored);
  }
});

test('极限命盘选择先保存再应用，启程后不能改回普通，轮回恢复普通并可重选', () => {
  const save = freshSave();
  save.prologueSeen = true;
  departHometown(save);
  const h = harness(save);
  h.panel = 'root-reveal';
  h.handleAction('life-mode', 'extreme');
  assert.equal(save.lifeMode, 'extreme');
  assert.equal(h.difficulty, 1);
  h.handleAction('close');
  assert.equal(h.panel, 'root-reveal');
  h.handleAction('accept-root');
  assert.equal(save.mortal.hometown!.stage, 'departed');
  h.handleAction('life-mode', 'normal');
  assert.equal(save.lifeMode, 'extreme');
  assert.equal(readSave(h.writes.at(-1)!).save.lifeMode, 'extreme');
  h.resetLifetime();
  assert.equal(save.lifeMode, 'normal');
  assert.equal(save.mortal.hometown!.stage, 'reveal');
});

test('极限选择/启程保存失败不假成功，极限战败保存重试不发收益或丢死亡', () => {
  const save = freshSave();
  save.prologueSeen = true;
  departHometown(save);
  const h = harness(save);
  h.panel = 'root-reveal';
  const write = h.localStorage.setItem;
  h.localStorage.setItem = () => {
    throw Error('quota');
  };
  h.handleAction('life-mode', 'extreme');
  assert.equal(save.lifeMode, 'normal');
  assert.equal(h.panel, 'root-reveal');
  h.localStorage.setItem = write;
  h.handleAction('life-mode', 'extreme');
  h.localStorage.setItem = () => {
    throw Error('quota');
  };
  h.handleAction('accept-root');
  assert.equal(save.mortal.hometown!.stage, 'reveal');
  assert.equal(h.panel, 'root-reveal');
  h.localStorage.setItem = write;
  h.handleAction('accept-root');
  const before = { stones: save.stones, iron: save.iron, runs: save.runs };
  h.game = new Game(save, 0, 1);
  h.game.state = 'lost';
  h.game.player.hp = 0;
  h.localStorage.setItem = () => {
    throw Error('quota');
  };
  h.finishRun();
  assert.equal(h.panel, 'extreme-death-retry');
  assert.equal(save.pendingReincarnation, null);
  h.handleAction('home');
  assert.equal(h.panel, 'extreme-death-retry');
  h.localStorage.setItem = write;
  h.handleAction('finish-run');
  assert.equal(save.pendingReincarnation, 'extreme');
  assert.equal(h.game, null);
  assert.deepEqual({ stones: save.stones, iron: save.iron, runs: save.runs }, before);
  assert.equal(readSave(h.writes.at(-1)!).save.pendingReincarnation, 'extreme');
});
