import test from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, Script } from 'node:vm';
import assert from 'node:assert/strict';
import {
  freshSave,
  readSave,
  SAVE_SCHEMA,
  settleRun,
  syncTribulationClock,
  tribulationDue,
  completeTribulation,
} from '../../src/core/progress.ts';
import { resolveActivity } from '../../src/town/mortal.ts';
import { syncHumanStories } from '../../src/town/human-stories.ts';
import { Game } from '../../src/battle/game.ts';
import { importSave, exportSave, restoreSavedRun } from '../../src/core/save-transfer.ts';
import {
  difficultyAllowed,
  minimumDifficulty,
  EXTREME_AD_ACTIONS,
  EXTREME_EXIT_ACTIONS,
} from '../../src/core/life-mode.ts';
import { dispatchAction, type ActionShell } from '../../src/ui/action-controller.ts';
import {
  startRun,
  startAdWatch,
  markAdWatched,
  beginTribulation,
  finishTribulation,
} from '../../src/battle/scene-flow.ts';
import { importConfirmPanel } from '../../src/ui/lobby-ui.ts';
import { chronicleAchievements } from '../../src/content/chronicle-achievements.ts';
import { FINAL_TRIAL_STAGE } from '../../src/core/data.ts';
import { realmInfo } from '../../src/core/progress.ts';

function extreme() {
  const save = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  save.lifeMode = 'extreme';
  return save;
}

test('没有模式字段的当前档和旧档均默认普通，普通旧续局迁移不误判死亡', () => {
  for (const schema of [undefined, SAVE_SCHEMA - 1, SAVE_SCHEMA]) {
    const save: any = freshSave();
    delete save.lifeMode;
    save.schema = schema;
    save.activeRun = new Game(save, 0, 0).snapshot();
    const result = readSave(JSON.stringify(save));
    assert.equal(result.status, 'ok');
    assert.equal(result.save.lifeMode, 'normal');
    assert.equal(result.save.pendingReincarnation, null);
    const imported = importSave(JSON.stringify(save));
    assert.equal(imported.save.lifeMode, 'normal');
    assert.equal(imported.save.pendingReincarnation, null);
    assert.equal(!!imported.run, schema === SAVE_SCHEMA);
  }
  for (const bad of [null, false, 1, 'hard'])
    assert.equal(readSave(JSON.stringify({ ...freshSave(), lifeMode: bad })).status, 'unreadable');
});

test('极限未完战斗读档后等待主动继续，只有真正战败仍落幕，普通暂停仍可续局', () => {
  for (const state of ['playing', 'paused', 'upgrade'] as const) {
    const save = extreme();
    const run = new Game(save, 0, 1);
    run.state = state;
    if (state === 'upgrade') run.choices = run.makeChoices();
    const restored = restoreSavedRun(save, run.snapshot());
    assert.ok(restored, state);
    assert.equal(restored.state, state === 'upgrade' ? 'upgrade' : 'paused', state);
    assert.equal(save.pendingReincarnation, null, state);
    assert.equal(restored.time, run.time, state);
    assert.equal(restored.player.hp, run.player.hp, state);
    if (state === 'upgrade') assert.deepEqual(restored.choices, run.choices);
  }
  const lost = extreme();
  const lostRun = new Game(lost, 0, 1);
  lostRun.state = 'lost';
  lostRun.player.hp = 0;
  assert.equal(restoreSavedRun(lost, lostRun.snapshot()), null);
  assert.equal(lost.pendingReincarnation, 'extreme');
  const entries = lost.chronicle.entries.length;
  restoreSavedRun(lost, lostRun.snapshot());
  assert.equal(lost.chronicle.entries.length, entries);
  // 无法识别的快照交给读档保护处理，不判死也不覆盖原文。
  const corrupted = extreme();
  assert.throws(() => restoreSavedRun(corrupted, { damaged: true }), /历练数据无法识别/);
  assert.equal(corrupted.pendingReincarnation, null);
  const normal = freshSave();
  const run = new Game(normal, 0, 0);
  run.pause();
  assert.equal(restoreSavedRun(normal, run.snapshot())?.state, 'paused');
  assert.equal(normal.pendingReincarnation, null);
});

test('极限战斗外读档不死，未完战斗导入可继续，已持久化胜利不误判', () => {
  const idle = extreme();
  assert.equal(importSave(exportSave(idle, null)).save.pendingReincarnation, null);
  const active = extreme();
  const run = new Game(active, 0, 1);
  const imported = importSave(exportSave(active, run));
  assert.equal(imported.save.pendingReincarnation, null);
  assert.equal(imported.run?.state, 'paused');
  assert.equal(imported.run?.time, run.time);
  // 胜局以完整结算后的永久存档为准，不写入原本就不支持恢复的 won 快照。
  settleRun(active, {
    stage: 0,
    difficulty: 1,
    victory: true,
    kills: 1,
    time: 1,
    iron: 0,
    level: 1,
  });
  const settled = importSave(exportSave(active, null));
  assert.equal(settled.save.pendingReincarnation, null);
  assert.deepEqual(settled.save.completed, [0]);
  assert.equal(settled.run, null);
});

test('极限从第二档选择，拒绝初入及非法下标，不改周期天劫内部难度', () => {
  const save = extreme();
  assert.equal(minimumDifficulty(save), 1);
  for (const d of [-1, 0, 3, NaN, Infinity, 1.5]) assert.equal(difficultyAllowed(save, d), false);
  for (const d of [1, 2]) assert.equal(difficultyAllowed(save, d), true);
  assert.equal(difficultyAllowed(freshSave(), 0), true);
  assert.equal(Game.createTribulation(save).difficulty, 0);
});

test('禁用按钮之外实际广告动作与迟到奖励回调也拒绝极限模式', () => {
  for (const action of EXTREME_AD_ACTIONS) {
    const shell = { save: extreme() } as unknown as ActionShell;
    assert.doesNotThrow(() => dispatchAction(shell, action));
  }
  const shell: any = {
    save: extreme(),
    adWatched: false,
    getAdProvider() {
      throw Error('不得请求广告');
    },
    refreshAdCountdown() {
      throw Error('不得解锁奖励');
    },
  };
  startAdWatch(shell, 'claim-ad-reward', '领取奖励', 'reward-supplies');
  markAdWatched(shell, 'claim-ad-reward', '领取奖励');
  assert.equal(shell.adWatched, false);
});

test('极限必须先写入初始快照再开战，存储失败或素材未就绪都不入场', () => {
  for (const failure of ['storage', 'assets', 'none']) {
    const save = extreme(),
      before = structuredClone(save);
    let writes = 0,
      rendered = 0,
      stored: any;
    const shell: any = {
      save,
      assetsReady: true,
      selectedStage: 0,
      difficulty: 1,
      game: null,
      pendingRun: null,
      Game,
      FINAL_TRIAL_STAGE,
      realmInfo,
      tribulationDue: () => false,
      ensureScene: () => failure !== 'assets',
      writeSave(next: typeof save, run: Game) {
        writes++;
        if (failure === 'storage') throw Error('quota');
        stored = JSON.parse(JSON.stringify({ ...next, activeRun: run.snapshot() }));
      },
      toast() {},
      clearInput() {},
      modal: { innerHTML: '' },
      battleHud: { reset() {} },
      frameRate: { reset() {} },
      telemetry: { track() {} },
      lifeStats: () => ({}),
      renderHud() {
        assert.equal(writes, 1);
        rendered++;
      },
      persist: () => true,
    };
    startRun(shell);
    assert.deepEqual(save, before);
    assert.equal(rendered, failure === 'none' ? 1 : 0);
    assert.equal(!!shell.game, failure === 'none');
    if (stored) {
      assert.equal(stored.lifeMode, 'extreme');
      assert.equal(stored.activeRun.difficulty, 1);
      assert.equal(importSave(JSON.stringify(stored)).save.pendingReincarnation, null);
      assert.equal(importSave(JSON.stringify(stored)).run?.state, 'paused');
    }
  }
});

test('生死证道只在极限真实七境胜利结算达成，普通、落败和只打终关不发', () => {
  const run = (stage: number, victory = true) => ({
    stage,
    difficulty: 1,
    victory,
    kills: 1,
    time: 1,
    iron: 0,
    level: 1,
  });
  for (const kind of ['normal', 'loss', 'skip', 'extreme']) {
    const save = kind === 'normal' ? freshSave() : extreme();
    for (let stage = kind === 'skip' ? FINAL_TRIAL_STAGE : 0; stage <= FINAL_TRIAL_STAGE; stage++)
      settleRun(save, run(stage, kind !== 'loss' || stage !== FINAL_TRIAL_STAGE));
    assert.equal(Object.hasOwn(save.chronicle.milestones, 'one-life-clear'), kind === 'extreme');
    const achievements = chronicleAchievements(save);
    assert.equal(
      achievements.some((a) => a.id === 'mixed-exchange'),
      false,
    );
    assert.deepEqual(
      achievements.map((a) => a.difficulty),
      achievements.map((a) => a.difficulty).sort((a, b) => a - b),
    );
    if (kind === 'extreme') {
      const before = save.chronicle.entries.filter((e) => e.title === '生死证道').length;
      settleRun(save, run(FINAL_TRIAL_STAGE));
      assert.equal(save.chronicle.entries.filter((e) => e.title === '生死证道').length, before);
      assert.equal(
        importSave(exportSave(save, null)).save.chronicle.milestones['one-life-clear'],
        save.age,
      );
    }
  }
});

test('极限天劫后待续原局仍禁止退场、导入、主动轮回；普通结算后可开始下一局', () => {
  for (const action of EXTREME_EXIT_ACTIONS) {
    let notices = 0;
    const shell = {
      save: extreme(),
      pendingRun: {},
      toast() {
        notices++;
      },
    } as unknown as ActionShell;
    dispatchAction(shell, action);
    assert.equal(notices, 1, action);
    assert.ok(shell.pendingRun, action);
  }
  const save = freshSave();
  let rendered = 0,
    writes = 0;
  const shell: any = {
    save,
    assetsReady: true,
    selectedStage: 0,
    difficulty: 0,
    game: { state: 'won' },
    settled: true,
    pendingRun: null,
    Game,
    FINAL_TRIAL_STAGE,
    realmInfo,
    tribulationDue: () => false,
    ensureScene: () => true,
    clearInput() {},
    modal: { innerHTML: '' },
    battleHud: { reset() {} },
    frameRate: { reset() {} },
    telemetry: { track() {} },
    lifeStats: () => ({}),
    writeSave(_next: unknown, run: Game) {
      assert.ok(run instanceof Game);
      writes++;
    },
    renderHud() {
      rendered++;
    },
    persist: () => true,
  };
  startRun(shell);
  assert.ok(shell.game instanceof Game);
  assert.equal(shell.game.state, 'playing');
  assert.equal(shell.settled, false);
  assert.equal(rendered, 1);
  assert.equal(writes, 1);
});

test('极限周期天劫先保存入场，胜后原子保留原历练；保存失败可重试且刷新后等待继续', () => {
  const save = extreme();
  save.cultivation = 1e9;
  save.unlocked = 6;
  syncTribulationClock(save);
  save.age = save.nextTribulationAge;
  const original = new Game(save, 0, 1);
  original.pause();
  let blocked = true,
    stored: any,
    notices = 0;
  const shell: any = {
    save,
    game: original,
    pendingRun: null,
    settled: false,
    assetsReady: true,
    Game,
    tribulationDue,
    completeTribulation,
    resolveActivity,
    syncHumanStories,
    ensureScene: () => true,
    writeSave(next: typeof save, run: Game | null) {
      if (blocked) throw Error('quota');
      stored = JSON.parse(JSON.stringify({ ...next, activeRun: run?.snapshot() ?? null }));
    },
    toast() {
      notices++;
    },
    clearInput() {},
    modal: { innerHTML: '', querySelector: () => null },
    frameRate: { reset() {} },
    telemetry: { track() {}, flush() {} },
    lifeStats: () => ({}),
    renderHud() {},
    renderLobby() {},
    persist() {
      return true;
    },
    performance: { now: () => 10 },
    damageReport: () => '',
    panelFrame() {},
    tribulationWonPanel: () => ['', '', ''],
  };
  beginTribulation(shell);
  assert.equal(shell.game, original);
  assert.equal(save.tribulationReturn, null);
  assert.equal(notices, 1);
  blocked = false;
  beginTribulation(shell);
  assert.equal(shell.game.tribulation, 1);
  assert.equal(shell.game.difficulty, 0);
  assert.equal(stored.activeRun.tribulation, 1);
  assert.equal(stored.tribulationReturn.difficulty, 1);
  const duringTribulation = importSave(JSON.stringify(stored));
  assert.equal(duringTribulation.save.pendingReincarnation, null);
  assert.equal(duringTribulation.run?.tribulation, 1);
  assert.equal(duringTribulation.run?.state, 'paused');
  shell.game.state = 'won';
  blocked = true;
  const prior = structuredClone(save);
  finishTribulation(shell);
  assert.deepEqual(save, prior);
  assert.equal(shell.game.state, 'won');
  assert.equal(shell.panel, 'settlement-retry');
  blocked = false;
  finishTribulation(shell);
  assert.equal(save.tribulations, 1);
  assert.equal(save.tribulationReturn, null);
  assert.equal(shell.game, null);
  assert.equal(shell.pendingRun.state, 'paused');
  assert.equal(stored.activeRun.difficulty, 1);
  const afterTribulation = importSave(JSON.stringify(stored));
  assert.equal(afterTribulation.save.pendingReincarnation, null);
  assert.equal(afterTribulation.run?.state, 'paused');
  assert.equal(afterTribulation.save.tribulationReturn, null);
  finishTribulation(shell);
  assert.equal(save.tribulations, 1);
});

test('bfcache 返回：未完极限战斗暂停等待继续，不判死也不重复结算', () => {
  const source = readFileSync(new URL('../../src/main.ts', import.meta.url), 'utf8');
  const start = source.indexOf("window.addEventListener('pageshow'");
  const end = source.indexOf('const canvas = renderer.canvas;', start);
  const code = new Script(stripTypeScriptTypes(source.slice(start, end)));
  const cases = [
    { mode: 'normal', state: 'playing', pauses: 0 },
    { state: 'playing', pauses: 1 },
    { state: 'paused', pauses: 0 },
    { state: 'upgrade', pauses: 0 },
    { state: 'lost', pauses: 0 },
    { state: 'won', pauses: 0 },
    { pendingReincarnation: 'extreme', state: 'playing', pauses: 0 },
    { journeyEnded: true, state: 'playing', pauses: 0 },
    { ambushScene: true, holds: 1 },
    { savedAmbush: true, shows: 1 },
    { savedAmbush: true, outcome: 'defeat', shows: 0 },
  ] as any[];
  for (const example of cases) {
    const save = extreme();
    if (example.mode) save.lifeMode = example.mode;
    if (example.pendingReincarnation) save.pendingReincarnation = example.pendingReincarnation;
    if (example.journeyEnded) save.journeyEnded = true;
    if (example.savedAmbush)
      (save.mortal.marketSocial as any) = {
        ambush: { snapshot: { outcome: example.outcome ?? null } },
      };
    let handler: (event: { persisted: boolean }) => void = () => {},
      pauses = 0,
      holds = 0,
      shows = 0,
      deaths = 0;
    const context: any = {
      save,
      game: example.state ? { state: example.state } : null,
      settled: false,
      ambushScene: example.ambushScene ? { hold: () => holds++ } : null,
      ambushAwaitingContinue: false,
      renderer: { restore() {} },
      isExtremeLife: (s: typeof save) => s.lifeMode === 'extreme',
      handleAction(action: string) {
        assert.equal(action, 'pause');
        pauses++;
      },
      showMarketAmbush() {
        shows++;
      },
      beginJourneyFarewell() {
        deaths++;
      },
      window: {
        addEventListener(_: string, fn: typeof handler) {
          handler = fn;
        },
      },
    };
    code.runInContext(createContext(context));
    handler({ persisted: false });
    assert.equal(pauses + holds + shows + deaths, 0, JSON.stringify(example));
    handler({ persisted: true });
    assert.equal(deaths, 0, JSON.stringify(example));
    assert.equal(pauses, example.pauses ?? 0, JSON.stringify(example));
    assert.equal(holds, example.holds ?? 0, JSON.stringify(example));
    assert.equal(shows, example.shows ?? 0, JSON.stringify(example));
    if ((example.holds ?? 0) + (example.shows ?? 0) > 0)
      assert.equal(context.ambushAwaitingContinue, true, JSON.stringify(example));
  }
});

test('普通和极限自动历练切后台均继续，手动暂停，主动暂停不被后台心跳恢复', () => {
  const source = readFileSync(new URL('../../src/main.ts', import.meta.url), 'utf8');
  const lifecycle = source.slice(
    source.indexOf("window.addEventListener('blur'"),
    source.indexOf('const canvas = renderer.canvas;'),
  );
  const heartbeat = source.slice(
    source.indexOf('const backgroundClock = new Worker('),
    source.indexOf('syncMortalSave(true);', source.indexOf('const backgroundClock = new Worker(')),
  );
  const code = new Script(
    stripTypeScriptTypes(
      (lifecycle + heartbeat).replaceAll(
        'import.meta.url',
        JSON.stringify(new URL('../../src/main.ts', import.meta.url).href),
      ),
    ),
  );
  for (const lifeMode of ['normal', 'extreme'] as const)
    for (const autoplay of [false, true])
      for (const initialState of ['playing', 'paused'] as const) {
        const save = freshSave();
        save.lifeMode = lifeMode;
        save.autoplay = autoplay;
        const game = new Game(save, 0, lifeMode === 'extreme' ? 1 : 0, () => 0.99);
        game.state = initialState;
        const handlers = new Map<string, () => void>();
        let clock: { onmessage?: () => void } = {},
          pauses = 0,
          ticks = 0,
          writes = 0;
        const document = {
          hidden: true,
          addEventListener(name: string, handler: () => void) {
            handlers.set(name, handler);
          },
        };
        code.runInContext(
          createContext({
            save,
            game,
            document,
            settled: false,
            inMortalWorld: false,
            lastMortalTick: 0,
            lastBackgroundSave: 0,
            performance: { now: () => 6000 },
            window: {
              addEventListener(name: string, handler: () => void) {
                handlers.set(name, handler);
              },
            },
            Worker: class {
              constructor() {
                clock = this;
              }
            },
            URL,
            frameRate: { sample() {} },
            renderer: { restore() {} },
            clearInput() {},
            isExtremeLife: (s: typeof save) => s.lifeMode === 'extreme',
            handleAction(action: string) {
              assert.equal(action, 'pause');
              pauses++;
              game.pause();
            },
            persist() {
              writes++;
            },
            tick() {
              ticks++;
              game.update(0.1);
            },
          }),
        );
        handlers.get('blur')!();
        handlers.get('visibilitychange')!();
        assert.equal(
          game.state,
          autoplay ? initialState : 'paused',
          `${lifeMode}/${autoplay}/${initialState}`,
        );
        assert.equal(pauses, !autoplay && initialState === 'playing' ? 1 : 0);
        const before = game.time;
        clock.onmessage!();
        assert.equal(ticks, autoplay ? 1 : 0);
        assert.equal(game.time > before, autoplay && initialState === 'playing');
        assert.equal(save.autoplay, autoplay);
        assert.ok(writes >= 1, '切后台保存实际状态');
        document.hidden = false;
        handlers.get('visibilitychange')!();
        clock.onmessage!();
        assert.equal(ticks, autoplay ? 1 : 0, '前台不重复消费后台心跳');
        assert.equal(game.state, autoplay ? initialState : 'paused', '切回前台不擅自恢复暂停');
      }
});

test('续局快照损坏时备份原文并进入只读保护，不判死也不开新局', () => {
  const source = readFileSync(new URL('../../src/main.ts', import.meta.url), 'utf8');
  const start = source.indexOf('let pendingRun: Game | null = null;');
  const end = source.indexOf('let selectedStage = save.unlocked', start);
  assert.ok(start >= 0 && end > start);
  const block = source.slice(start, end);
  assert.match(block, /backupUnreadableSave\(localStorage, raw\)/);
  assert.match(block, /saveLock = 'unreadable'/);
  assert.doesNotMatch(block, /endExtremeLife/);
});

test('极限旧档含无法识别的未完快照时保留永久进度并放弃该局，不判死', () => {
  const save = extreme();
  save.stones = 777;
  const corrupted = JSON.parse(exportSave(save, new Game(save, 0, 1)));
  corrupted.save.activeRun.weapons[0].id = 'bad';
  const imported = importSave(JSON.stringify(corrupted));
  assert.equal(imported.save.pendingReincarnation, null);
  assert.equal(imported.save.stones, 777, '永久进度保留');
  assert.equal(imported.run, null, '无法识别的未完对局被放弃');
  assert.equal(imported.save.tribulationReturn, null);
  const legacy = JSON.parse(exportSave(save, new Game(save, 0, 1)));
  legacy.save.schema = SAVE_SCHEMA - 1;
  const upgraded = importSave(JSON.stringify(legacy));
  assert.equal(upgraded.save.pendingReincarnation, null, '旧版极限档不判死');
  assert.equal(upgraded.save.stones, 777);
  assert.equal(upgraded.run?.state, 'paused');
});

test('导入确认明确显示普通或极限及落幕状态，未完极限历练标注为可继续', () => {
  const save = extreme();
  const candidate = importSave(exportSave(save, new Game(save, 0, 1)));
  const html = importConfirmPanel(candidate)[2];
  assert.match(html, /极限模式/);
  assert.doesNotMatch(html, /此世已落幕/);
  assert.match(html, /未完成历练：/);
  const ended = extreme();
  ended.pendingReincarnation = 'extreme';
  assert.match(importConfirmPanel(importSave(exportSave(ended, null)))[2], /极限模式 · 此世已落幕/);
  assert.match(importConfirmPanel({ save: freshSave(), run: null })[2], /普通模式/);
});
