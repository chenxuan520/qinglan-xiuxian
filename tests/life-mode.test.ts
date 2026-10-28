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
} from '../src/progress.ts';
import { resolveActivity } from '../src/mortal.ts';
import { syncHumanStories } from '../src/human-stories.ts';
import { Game } from '../src/game.ts';
import { importSave, exportSave, restoreSavedRun } from '../src/save-transfer.ts';
import {
  difficultyAllowed,
  minimumDifficulty,
  EXTREME_AD_ACTIONS,
  EXTREME_EXIT_ACTIONS,
} from '../src/life-mode.ts';
import { dispatchAction, type ActionShell } from '../src/action-controller.ts';
import {
  startRun,
  startAdWatch,
  markAdWatched,
  beginTribulation,
  finishTribulation,
} from '../src/scene-flow.ts';
import { importConfirmPanel } from '../src/lobby-ui.ts';
import { chronicleAchievements } from '../src/chronicle-achievements.ts';
import { FINAL_TRIAL_STAGE } from '../src/data.ts';
import { realmInfo } from '../src/progress.ts';

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

test('极限未完战斗的各状态和坏快照重开均落幕，普通暂停仍可续局', () => {
  for (const state of ['playing', 'paused', 'upgrade', 'lost'] as const) {
    const save = extreme();
    const run = new Game(save, 0, 1);
    run.state = state;
    assert.equal(restoreSavedRun(save, run.snapshot()), null);
    assert.equal(save.pendingReincarnation, 'extreme');
    const entries = save.chronicle.entries.length;
    restoreSavedRun(save, run.snapshot());
    assert.equal(save.chronicle.entries.length, entries);
    const loaded = importSave(exportSave(save, null));
    assert.equal(loaded.save.pendingReincarnation, 'extreme');
    assert.equal(loaded.run, null);
  }
  const corrupted = extreme();
  assert.equal(restoreSavedRun(corrupted, { damaged: true }), null);
  assert.equal(corrupted.pendingReincarnation, 'extreme');
  const normal = freshSave();
  const run = new Game(normal, 0, 0);
  run.pause();
  assert.equal(restoreSavedRun(normal, run.snapshot())?.state, 'paused');
  assert.equal(normal.pendingReincarnation, null);
});

test('极限战斗外读档不死，未完战斗导入不能续命，已持久化胜利不误判', () => {
  const idle = extreme();
  assert.equal(importSave(exportSave(idle, null)).save.pendingReincarnation, null);
  const active = extreme();
  const run = new Game(active, 0, 1);
  assert.equal(importSave(exportSave(active, run)).save.pendingReincarnation, 'extreme');
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
      assert.equal(importSave(JSON.stringify(stored)).save.pendingReincarnation, 'extreme');
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

test('极限周期天劫先保存入场，胜后原子保留原历练；保存失败可重试且刷新仍判中断', () => {
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
  assert.equal(importSave(JSON.stringify(stored)).save.pendingReincarnation, 'extreme');
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
  assert.equal(importSave(JSON.stringify(stored)).save.pendingReincarnation, 'extreme');
  finishTribulation(shell);
  assert.equal(save.tribulations, 1);
});

test('bfcache 保留内存胜利时继续结算，真正未完极限对局返回才死亡', () => {
  const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  const start = source.indexOf("window.addEventListener('pageshow'");
  const end = source.indexOf('const canvas = renderer.canvas;', start);
  const code = new Script(stripTypeScriptTypes(source.slice(start, end)));
  for (const example of [
    { mode: 'normal', state: 'paused', dies: false },
    { state: 'playing', dies: true },
    { state: 'paused', dies: true },
    { state: 'upgrade', dies: true },
    { state: 'lost', dies: true },
    { state: 'won', dies: false },
    { pending: true, dies: true },
    { ambush: true, dies: true },
    { ambush: true, savedOutcome: 'victory', dies: false },
    { ambush: true, memoryOutcome: 'victory', dies: false },
    { ambush: true, memoryOutcome: 'escaped', dies: false },
    { ambush: true, memoryOutcome: 'defeat', dies: true },
  ] as any[]) {
    const save = extreme();
    if (example.mode) save.lifeMode = example.mode;
    if (example.ambush)
      (save.mortal.marketSocial as any) = {
        ambush: { snapshot: { outcome: example.savedOutcome ?? null } },
      };
    let handler: (event: { persisted: boolean }) => void = () => {},
      deaths = 0;
    code.runInContext(
      createContext({
        save,
        game: example.state ? { state: example.state } : null,
        settled: false,
        pendingRun: example.pending ? {} : null,
        ambushScene: example.memoryOutcome ? { duel: { outcome: example.memoryOutcome } } : null,
        renderer: { restore() {} },
        isExtremeLife: (save: typeof save) => save.lifeMode === 'extreme',
        window: {
          addEventListener(_: string, fn: typeof handler) {
            handler = fn;
          },
        },
        beginJourneyFarewell() {
          deaths++;
        },
      }),
    );
    handler({ persisted: false });
    assert.equal(deaths, 0);
    handler({ persisted: true });
    assert.equal(deaths, example.dies ? 1 : 0, JSON.stringify(example));
  }
});

test('导入确认明确显示普通或极限及落幕状态，不把极限中断伪装成可继续', () => {
  const save = extreme();
  const candidate = importSave(exportSave(save, new Game(save, 0, 1)));
  const html = importConfirmPanel(candidate)[2];
  assert.match(html, /极限模式 · 此世已落幕/);
  assert.doesNotMatch(html, /未完成历练：/);
  assert.match(importConfirmPanel({ save: freshSave(), run: null })[2], /普通模式/);
});
