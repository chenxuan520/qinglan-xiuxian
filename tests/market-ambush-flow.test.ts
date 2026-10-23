import * as lifeMode from '../src/life-mode.ts';
import { endExtremeLife } from '../src/progress.ts';
import { enterNextMarketBatch } from './market-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, Script } from 'node:vm';
import { freshSave, readSave, realmInfo, SAVE_KEY, type SaveData } from '../src/progress.ts';
import { MARKET_CULTIVATORS } from '../src/sect-market-data.ts';
import {
  chooseMarketOpportunity,
  marketOpportunity,
  settleMarketAmbush,
} from '../src/market-social.ts';
import { MarketAmbushDuel } from '../src/market-ambush.ts';
import type { AmbushSnapshot } from '../src/market-ambush-data.ts';
import { dispatchAction } from '../src/action-controller.ts';
import { journeyFarewellPanel } from '../src/opening-ui.ts';
import { marketAmbushPanel } from '../src/town-host.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';
import { FINAL_TRIAL_STAGE, MAX_REVIVES } from '../src/data.ts';
import { startAdWatch } from '../src/scene-flow.ts';
import { resourceFailureContent } from '../src/resource-panel.ts';
import { ModuleSource } from '../src/module-source.ts';

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
test('遭遇冷模块失败缓存不能锁死重试，并发重试只用当前构建的新URL一次', async () => {
  const source = main.match(
    /^(?:let|const) ambushFlow[^]*?^function loadAmbushFlow\([^]*?^\}/m,
  )?.[0];
  assert.ok(source);
  // 模拟浏览器永久缓存同一URL的失败，执行真实入口工厂，重试仅替换网络边界。
  const failed = Promise.reject(Error('冷模块断网'));
  void failed.catch(() => {});
  let initialCalls = 0;
  const retries: unknown[][] = [];
  const module = { mountAmbush() {} };
  const context = createContext({
    ModuleSource,
    initialModule() {
      initialCalls++;
      return failed;
    },
    retryModule(...args: unknown[]) {
      retries.push(args);
      return Promise.resolve(module);
    },
    resourceFailed() {},
  });
  new Script(
    stripTypeScriptTypes(source).replace("import('./market-ambush-flow.ts')", 'initialModule()'),
  ).runInContext(context);
  const first = context.loadAmbushFlow();
  assert.equal(context.loadAmbushFlow(), first);
  await assert.rejects(first, /冷模块断网/);
  const retry = context.loadAmbushFlow();
  assert.equal(context.loadAmbushFlow(), retry);
  assert.equal(await retry, module);
  assert.deepEqual(retries, [['market-ambush-flow', 'ambush', 1]]);
  assert.equal(await context.loadAmbushFlow(), module);
  assert.equal(initialCalls, 1);
  assert.equal(retries.length, 1);
});
const flow = readFileSync(new URL('../src/market-ambush-flow.ts', import.meta.url), 'utf8');
const functions = (source: string, names: string[]) =>
  names
    .map((name) => {
      const match = source.match(
        new RegExp(`^(?:export )?(?:async )?function ${name}\\([^]*?^\\}`, 'm'),
      );
      assert.ok(match, name);
      return match[0].replace(/^export /, '');
    })
    .join('\n');
const script = new Script(
  stripTypeScriptTypes(
    [
      functions(flow, [
        'commit',
        'checkpoint',
        'hideClose',
        'showDefeat',
        'mountAmbush',
        'finishAmbush',
        'ambushAction',
      ]),
      functions(main, [
        'writeSave',
        'lockStaleSave',
        'beginJourneyFarewell',
        'renderJourneyFarewell',
        'renderJourneyCard',
        'renderLobby',
        'resetLifetime',
        'lifeStats',
        'trackReincarnation',
      ]),
    ].join('\n'),
  ),
);

function fixture(): SaveData {
  for (let seed = 1; seed < 1000; seed++) {
    const save = freshSave('heaven', ['metal'], 'orthodox', () => 0);
    save.age = 30;
    save.cultivation = 1;
    save.stones = 10000;
    save.prologueSeen = save.hometownSeen = true;
    save.mortal.hometown!.stage = 'departed';
    save.mortal.population = { seed, since: 15 };
    enterNextMarketBatch(save);
    const npc = MARKET_CULTIVATORS.find(({ id }) => {
      const offer = marketOpportunity(save, id);
      return offer?.kind === 'invitation' && !offer.honest;
    });
    if (npc && chooseMarketOpportunity(save, npc.id, 1, 'accept')) return save;
  }
  throw Error('未找到固定种子的真实劫修遭遇');
}

function harness(data = fixture()) {
  let stored = JSON.stringify({ ...data, activeRun: null });
  let failing = false,
    destroys = 0,
    lobby = 0;
  const messages: string[] = [],
    ads: { alive: () => boolean }[] = [];
  const tracked: Record<string, unknown>[] = [];
  let scene: any;
  class TestScene {
    duel: MarketAmbushDuel;
    saveCheckpoint: (snapshot: AmbushSnapshot) => boolean;
    constructor(
      _host: unknown,
      save: SaveData,
      _npc: unknown,
      _finish: unknown,
      saveCheckpoint: (snapshot: AmbushSnapshot) => boolean,
    ) {
      const encounter = save.mortal.marketSocial!.ambush!;
      this.duel = new MarketAmbushDuel(encounter.stats, encounter.snapshot);
      this.saveCheckpoint = saveCheckpoint;
      scene = this;
    }
    requestRetreat() {
      this.duel.requestRetreat();
      return this.saveCheckpoint(this.duel.snapshot());
    }
    destroy() {
      destroys++;
    }
  }
  const noop = () => {};
  const context = createContext({
    battleHud: { reset: noop },
    // 成就队列另有真实回归，此处隔离界面通知，不跳过实际存档写入。
    chronicleSource: { observe() {} },
    hideAchievementNotice() {},
    resourceFailureContent,
    save: data,
    saveLock: null,
    lastSaveText: stored,
    pendingRun: null,
    game: null,
    settled: false,
    ambushScene: null,
    panel: '',
    modal: { innerHTML: '', querySelector: () => ({ remove: noop }) },
    MarketAmbushDuel,
    MarketAmbushScene: TestScene,
    MAX_REVIVES,
    FINAL_TRIAL_STAGE,
    realmInfo,
    SAVE_KEY,
    structuredClone,
    ...lifeMode,
    endExtremeLife,
    settleMarketAmbush,
    marketAmbushPanel,
    journeyFarewellPanel,
    closeNpcChat: noop,
    clearInput: noop,
    renderSaveLock: noop,
    panelFrame(_title: string, _subtitle: string, body: string) {
      context.modal.innerHTML = body;
    },
    toast: (text: string) => messages.push(text),
    localStorage: {
      getItem: () => stored,
      setItem(_key: string, text: string) {
        if (failing) throw Error('QuotaExceeded');
        stored = text;
      },
    },
    showMarketAmbush: () => context.mountAmbush(shell),
    handleMarketAmbushAction: (action: string) => context.ambushAction(shell, action),
    resumeHometown: () => {
      lobby++;
      return true;
    },
    leaveTown: () => {
      context.inTown = context.inMarket = false;
    },
    inMortalWorld: true,
    inTown: false,
    inMarket: true,
    adTimer: 1,
    adReadyAt: 0,
    adWatched: false,
    adWatchEpoch: 0,
    AD_PLACEHOLDER_HTML: '<div>广告位</div>',
    AD_SECONDS: 5,
    clearInterval: noop,
    adCompleted: () =>
      context.adWatched || (context.adReadyAt !== 0 && Date.now() >= context.adReadyAt),
    getAdProvider: () => ({ name: 'test' }),
    watchAdPlacement: (options: { alive: () => boolean }) => ads.push(options),
    markAdWatched: () => {
      context.adWatched = true;
    },
    refreshAdCountdown: noop,
    startAdCountdown: noop,
    startAdWatch: (...args) => startAdWatch(shell, ...args),
    journeyCardReturn: 'chronicle',
    journeyCardPanel: { show: async () => {}, cancel: noop },
    telemetry: { track: (event: Record<string, unknown>) => tracked.push(event), flush: noop },
    freshSave,
    rollSpiritRoot: () => 'heaven',
    rootElementsFor: () => ['metal'],
    applyBirthInheritance: noop,
    departHometown: (save: SaveData) => {
      save.mortal.hometown!.stage = 'departed';
    },
    recordChronicle: noop,
    shownHumanLetters: new Set(['old-life']),
    window: { clearTimeout: noop },
    victoryTimer: undefined,
    rewardAd: null,
    pendingImport: null,
    rewards: null,
    gameAudio: { sync: noop },
    selectedStage: 0,
    difficulty: 0,
    treasurePage: 0,
    selectedTreasure: data.starter,
    schoolFilter: 'all',
    bookTab: 'treasures',
    ui: { inert: false },
    renderPrologue: noop,
    refreshRootReveal: () => false,
  });
  const shell = new Proxy(
    {},
    {
      get: (_target, key) => context[key],
      set: (_target, key, value) => {
        context[key] = value;
        return true;
      },
    },
  );
  script.runInContext(context);
  return {
    save: data,
    context,
    shell,
    ads,
    tracked,
    messages,
    get scene() {
      return scene;
    },
    stored: () => JSON.parse(stored),
    fail: (value = true) => {
      failing = value;
    },
    stale: () => {
      stored = JSON.stringify({ ...data, stones: 0 });
    },
    destroys: () => destroys,
    lobby: () => lobby,
    action: (action: string) => dispatchAction(shell as never, action),
    checkpoint: (snapshot: AmbushSnapshot) => context.checkpoint(shell, snapshot),
    mount: () => context.mountAmbush(shell),
    finish: (outcome: string) => context.finishAmbush(shell, outcome),
  };
}
function ended(h: ReturnType<typeof harness>, outcome: 'victory' | 'defeat') {
  const snapshot = structuredClone(h.save.mortal.marketSocial!.ambush!.snapshot);
  snapshot[outcome === 'defeat' ? 'player' : 'enemy'].hp = 0;
  snapshot.outcome = outcome;
  assert.equal(h.checkpoint(snapshot), true);
  return snapshot;
}

test('遭遇检查点原子保存，失败或其他窗口更新不覆盖；首页与伪造按钮不脱身', () => {
  const h = harness();
  h.mount();
  const before = JSON.stringify(h.save),
    snapshot = h.scene.duel.snapshot();
  snapshot.player.hp -= 1;
  h.fail();
  assert.equal(h.checkpoint(snapshot), false);
  assert.equal(JSON.stringify(h.save), before);
  h.fail(false);
  assert.equal(h.checkpoint(snapshot), true);
  assert.equal(h.stored().mortal.marketSocial.ambush.snapshot.player.hp, snapshot.player.hp);
  h.context.panel = 'cultivation';
  for (const action of [
    'confirm-import',
    'reincarnate',
    'start',
    'watch-lifespan-ad',
    'home',
    'close',
  ])
    h.action(action);
  assert.ok(h.save.mortal.marketSocial!.ambush);
  assert.equal(h.save.mortal.marketSocial!.ambush!.snapshot.outcome, null);
  const saved = JSON.stringify(h.save);
  h.stale();
  assert.equal(h.checkpoint(snapshot), false);
  assert.equal(h.context.saveLock, 'stale');
  assert.equal(JSON.stringify(h.save), saved);
});

test('死亡先保存后展示，冷加载与同版本导入仍死亡，损坏快照不得变成活人', () => {
  const h = harness();
  ended(h, 'defeat');
  h.finish('defeat');
  assert.equal(h.context.panel, 'market-ambush-defeat');
  assert.equal(h.save.mortal.marketSocial!.ambush!.snapshot.player.hp, 0);
  for (const restored of [
    readSave(JSON.stringify(h.save)).save,
    importSave(exportSave(h.save, null)).save,
  ]) {
    assert.equal(restored.mortal.marketSocial!.ambush!.snapshot.outcome, 'defeat');
    const cold = harness(restored);
    cold.context.renderLobby();
    assert.equal(cold.context.panel, 'market-ambush-defeat');
    assert.equal(cold.lobby(), 0);
    for (const action of ['home', 'close', 'start', 'restore', 'reincarnate']) cold.action(action);
    assert.equal(cold.context.panel, 'market-ambush-defeat');
  }
  const broken = structuredClone(h.save);
  broken.mortal.marketSocial!.ambush!.snapshot.player.hp = NaN;
  assert.equal(readSave(JSON.stringify(broken)).status, 'unreadable');
  assert.throws(() => importSave(exportSave(broken, null)), /损坏|无效/);
});

test('复活需当前完整广告，失败不耗次数，满血/护身/次数同存且敌血不重置', () => {
  const h = harness();
  h.save.mortal.marketSocial!.ambush!.snapshot.enemy.hp *= 0.5;
  ended(h, 'defeat');
  h.mount();
  h.action('market-ambush-watch-ad');
  assert.equal(h.context.panel, 'market-ambush-ad');
  const before = JSON.stringify(h.save),
    enemyHp = h.save.mortal.marketSocial!.ambush!.snapshot.enemy.hp;
  h.action('market-ambush-revive');
  assert.equal(JSON.stringify(h.save), before);
  h.context.adWatched = true;
  h.fail();
  h.action('market-ambush-revive');
  assert.equal(JSON.stringify(h.save), before);
  assert.equal(h.context.panel, 'market-ambush-ad');
  h.fail(false);
  h.action('market-ambush-revive');
  const active = h.save.mortal.marketSocial!.ambush!;
  assert.equal(active.revivesUsed, 1);
  assert.equal(active.snapshot.player.hp, active.stats.hp);
  assert.equal(active.snapshot.enemy.hp, enemyHp);
  assert.equal(active.snapshot.invincible, 3);
  assert.equal(active.snapshot.outcome, null);
  assert.equal(h.context.panel, 'market-ambush');
  const after = JSON.stringify(h.save);
  h.action('market-ambush-revive');
  assert.equal(JSON.stringify(h.save), after);
  ended(h, 'defeat');
  h.mount();
  assert.equal(active.revivesUsed, MAX_REVIVES);
  assert.doesNotMatch(h.context.modal.innerHTML, /data-action="market-ambush-watch-ad"/);
  const cold = harness(importSave(exportSave(h.save, null)).save);
  cold.mount();
  assert.equal(cold.save.mortal.marketSocial!.ambush!.revivesUsed, MAX_REVIVES);
  assert.doesNotMatch(cold.context.modal.innerHTML, /data-action="market-ambush-watch-ad"/);
});

test('返回或重进同名广告使旧回调失效，刷新未领取广告需重新观看', () => {
  const h = harness();
  ended(h, 'defeat');
  h.mount();
  h.action('market-ambush-watch-ad');
  const old = h.ads.at(-1)!;
  assert.equal(old.alive(), true);
  h.action('market-ambush-ad-back');
  assert.equal(old.alive(), false);
  h.action('market-ambush-watch-ad');
  assert.equal(h.ads.length, 2);
  assert.equal(old.alive(), false);
  assert.equal(h.ads.at(-1)!.alive(), true);
  const cold = harness(importSave(exportSave(h.save, null)).save);
  cold.mount();
  assert.equal(cold.context.panel, 'market-ambush-defeat');
  assert.equal(cold.context.adCompleted(), false);
  assert.equal(cold.save.mortal.marketSocial!.ambush!.revivesUsed, 0);
});

test('死亡落幕、留影和轮回事务写失败不复生，成功后清原对局与恩怨', async () => {
  const h = harness();
  h.save.cultivation = 10000;
  h.save.spiritRoot = 'triple';
  h.save.rootElements = ['metal', 'wood', 'water'];
  ended(h, 'defeat');
  h.mount();
  const before = JSON.stringify(h.save);
  h.fail();
  h.action('market-ambush-end');
  assert.equal(JSON.stringify(h.save), before);
  assert.equal(h.context.panel, 'market-ambush-defeat');
  h.fail(false);
  h.action('market-ambush-end');
  assert.equal(h.save.pendingReincarnation, 'ambush');
  assert.equal(h.context.panel, 'ambush-farewell');
  assert.equal(h.stored().activeRun, null);
  assert.equal(h.save.tribulationReturn, null);
  const endedSave = JSON.stringify(h.save);
  await h.context.renderJourneyCard();
  assert.equal(h.context.panel, 'journey-card');
  assert.equal(h.context.journeyCardReturn, 'ambush-farewell');
  for (const action of ['home', 'start', 'reincarnate', 'confirm-journey-reincarnate'])
    h.action(action);
  assert.equal(JSON.stringify(h.save), endedSave);
  assert.equal(h.context.panel, 'journey-card');
  h.action('close');
  assert.equal(h.context.panel, 'ambush-farewell');
  const previous = h.context.lifeStats();
  h.fail();
  h.action('confirm-journey-reincarnate');
  assert.equal(JSON.stringify(h.save), endedSave);
  assert.equal(h.context.panel, 'ambush-farewell');
  assert.equal(h.tracked.length, 0);
  h.fail(false);
  h.action('confirm-journey-reincarnate');
  assert.equal(h.save.pendingReincarnation, null);
  assert.equal(h.save.age, 15);
  assert.equal(h.save.stones, 0);
  assert.equal(h.save.cultivation, 0);
  assert.equal(h.save.mortal.marketSocial, undefined);
  assert.equal(h.save.mortal.marketRelations, undefined);
  assert.equal(h.stored().activeRun, null);
  assert.deepEqual(JSON.parse(JSON.stringify(h.tracked)), [
    { type: 'reincarnate', result: 'ambush', ...previous },
  ]);
  assert.equal(h.tracked[0].root, 'triple');
  assert.equal(h.tracked[0].realm, previous.realm);
});

test('胜利只接受持久化真实终态，失败重试不会退款或战利品重复入账', () => {
  const h = harness();
  const before = JSON.stringify(h.save);
  h.finish('victory');
  h.finish('escaped');
  assert.equal(JSON.stringify(h.save), before);
  ended(h, 'victory');
  const unpaid = JSON.stringify(h.save);
  h.fail();
  h.finish('victory');
  assert.equal(JSON.stringify(h.save), unpaid);
  assert.equal(h.context.panel, 'market-ambush-recovery');
  h.fail(false);
  h.action('market-ambush-recover');
  assert.equal(h.save.mortal.marketSocial!.ambush, null);
  const settled = JSON.stringify(h.save);
  h.finish('victory');
  assert.equal(JSON.stringify(h.save), settled);
});

test('异步遭遇载入失败可重试，迟到回调不覆盖已落幕或锁定的页面', async () => {
  const lazy = new Script(
    stripTypeScriptTypes(functions(main, ['showMarketAmbush', 'handleMarketAmbushAction'])),
  );
  const settlePromises = () => new Promise((resolve) => setImmediate(resolve));
  for (const transition of ['ended', 'stale', 'removed'] as const) {
    const h = harness();
    const pending = Promise.withResolvers();
    let mounts = 0,
      actions = 0;
    h.context.loadAmbushFlow = () => pending.promise;
    h.context.shellBindings = () => h.shell;
    lazy.runInContext(h.context);
    h.context.showMarketAmbush();
    assert.equal(h.context.panel, 'market-ambush-loading');
    h.context.handleMarketAmbushAction('market-ambush-exit');
    if (transition === 'ended') {
      h.save.pendingReincarnation = 'ambush';
      h.context.panel = 'ambush-farewell';
    } else if (transition === 'stale') {
      h.context.saveLock = 'stale';
      h.context.panel = 'save-lock';
    } else h.save.mortal.marketSocial!.ambush = null;
    pending.resolve({
      mountAmbush: () => {
        mounts++;
      },
      ambushAction: () => {
        actions++;
      },
    });
    await settlePromises();
    assert.equal(mounts, 0);
    assert.equal(actions, 0);
    if (transition === 'ended') assert.equal(h.context.panel, 'ambush-farewell');
    if (transition === 'stale') assert.equal(h.context.panel, 'save-lock');
  }
  const h = harness();
  h.context.shellBindings = () => h.shell;
  h.context.loadAmbushFlow = async () => {
    throw Error('network unavailable');
  };
  lazy.runInContext(h.context);
  const before = JSON.stringify(h.save);
  h.context.showMarketAmbush();
  await settlePromises();
  assert.equal(h.context.panel, 'market-ambush-recovery');
  assert.equal(JSON.stringify(h.save), before);
  let mounts = 0;
  h.context.loadAmbushFlow = async () => ({
    mountAmbush: () => {
      mounts++;
      h.context.panel = 'market-ambush';
    },
  });
  h.context.handleMarketAmbushAction('market-ambush-recover');
  await settlePromises();
  assert.equal(mounts, 1);
  assert.equal(h.context.panel, 'market-ambush');
  assert.equal(JSON.stringify(h.save), before);
});
