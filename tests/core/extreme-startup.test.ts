import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, Script } from 'node:vm';
import { Game } from '../../src/battle/game.ts';
import { FINAL_TRIAL_STAGE } from '../../src/core/data.ts';
import { freshSave, lifespanInfo, realmInfo, tribulationDue } from '../../src/core/progress.ts';
import { EXTREME_EXIT_ACTIONS, isExtremeLife } from '../../src/core/life-mode.ts';
import { dispatchAction, type ActionShell } from '../../src/ui/action-controller.ts';
import { restoreSavedRun } from '../../src/core/save-transfer.ts';
import { restoreRun } from '../../src/battle/scene-flow.ts';
import { startsWithPrologue } from '../../src/battle/new-player-load.ts';

const source = readFileSync(new URL('../../src/main.ts', import.meta.url), 'utf8');
const begin = source.indexOf('syncMortalSave(true);\ninitOffline();');
const end = source.indexOf('requestAnimationFrame(frame);', begin);
assert.ok(begin >= 0 && end > begin);
const startup = new Script(stripTypeScriptTypes(source.slice(begin, end)));

function boot(
  mode: 'normal' | 'extreme',
  state: Game['state'] | null = 'playing',
  lock = '',
  readyAtStart = false,
) {
  const save = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  Object.assign(save, { lifeMode: mode, prologueSeen: true, hometownSeen: true, unlocked: 5 });
  save.mortal.hometown.stage = 'departed';
  const original = new Game(save, 2, mode === 'extreme' ? 1 : 0);
  original.time = 37;
  if (state === 'upgrade') {
    original.state = 'upgrade';
    original.choices = original.makeChoices();
  } else if (state) original.state = state;
  if (state === 'lost') original.player.hp = 0;
  const pendingRun = state ? restoreSavedRun(save, original.snapshot()) : null;
  const calls = { lobby: 0, battle: 0, pause: 0, choices: 0, farewell: 0, locked: 0 };
  const loads: { stage: number; next: () => void; run?: Game }[] = [];
  let ready = readyAtStart;
  const shell: any = {
    save,
    pendingRun,
    game: null,
    saveLock: lock,
    selectedStage: save.unlocked,
    difficulty: 1,
    panel: '',
    inMortalWorld: false,
    assetsReady: false,
    FINAL_TRIAL_STAGE,
    realmInfo,
    lifespanInfo,
    tribulationDue,
    isExtremeLife,
    startsWithPrologue,
    syncMortalSave() {},
    initOffline() {},
    persist: () => true,
    renderLobby: () => calls.lobby++,
    renderHud: () => calls.battle++,
    renderPause: () => calls.pause++,
    renderChoices: () => calls.choices++,
    renderJourneyFarewell: () => calls.farewell++,
    renderSaveLock: () => calls.locked++,
    renderLifespanEnd() {},
    renderTribulationPending() {},
    renderPrologue() {},
    ensureScene(stage: number, next: () => void, run?: Game) {
      if (ready) return true;
      loads.push({ stage, next, run });
      return false;
    },
    restoreRun: () => restoreRun(shell),
    frameRate: { reset() {} },
    clearInput() {},
    gameEvent() {},
    gameAudio: { sync() {} },
  };
  startup.runInContext(createContext(shell));
  return {
    shell,
    calls,
    loads,
    pendingRun,
    loaded() {
      ready = shell.assetsReady = true;
      // ensureScene 的正式回调在跨窗口锁定后不会执行。
      if (!shell.saveLock) loads[0].next();
    },
  };
}

test('极限刷新直接加载保存的关卡，不显示首页；资源就绪才恢复原战斗并暂停', () => {
  for (const state of ['playing', 'paused'] as const) {
    const entry = boot('extreme', state);
    assert.equal(entry.calls.lobby, 0);
    assert.equal(entry.shell.game, null);
    assert.equal(entry.loads.length, 1);
    assert.equal(entry.loads[0].stage, 2, '不能先加载已解锁的第六境');
    assert.equal(entry.loads[0].run, entry.pendingRun);
    entry.loaded();
    assert.equal(entry.shell.game, entry.pendingRun);
    assert.equal(entry.shell.pendingRun, null);
    assert.equal(entry.calls.battle, 1);
    assert.equal(entry.calls.pause, 1);
    assert.equal(entry.calls.lobby, 0);
    assert.equal(entry.shell.game.state, 'paused');
    assert.equal(entry.shell.game.time, 37);
    entry.shell.game.update(1);
    assert.equal(entry.shell.game.time, 37, '等待主动继续期间不推进战斗');
  }
});

test('极限选技续局直接回战斗并保留原选项，不改为首页或重抽', () => {
  const entry = boot('extreme', 'upgrade');
  const choices = structuredClone(entry.pendingRun!.choices);
  entry.loaded();
  assert.equal(entry.calls.lobby, 0);
  assert.equal(entry.calls.choices, 1);
  assert.equal(entry.shell.game.state, 'upgrade');
  assert.deepEqual(entry.shell.game.choices, choices);
});

test('极限续局所需资源已经就绪时也立即进入战斗，不等待不会发生的加载回调', () => {
  const entry = boot('extreme', 'playing', '', true);
  assert.equal(entry.loads.length, 0);
  assert.equal(entry.calls.lobby, 0);
  assert.equal(entry.shell.game, entry.pendingRun);
  assert.equal(entry.shell.game.state, 'paused');
  assert.equal(entry.calls.pause, 1);
});

test('普通刷新仍从首页手动续局，极限没有未完战斗时也正常进入首页', () => {
  for (const [mode, state] of [
    ['normal', 'playing'],
    ['extreme', null],
  ] as const) {
    const entry = boot(mode, state);
    assert.equal(entry.calls.lobby, 1);
    assert.equal(entry.loads[0].stage, 5);
    entry.loaded();
    assert.equal(entry.shell.game, null);
    assert.equal(entry.calls.battle, 0);
  }
});

test('极限真正战败仍落幕，只读存档及加载中跨窗口锁定不自动入战', () => {
  const lost = boot('extreme', 'lost');
  assert.equal(lost.shell.save.pendingReincarnation, 'extreme');
  assert.equal(lost.calls.farewell, 1);
  assert.equal(lost.calls.battle, 0);
  const locked = boot('extreme', 'playing', 'newer');
  assert.equal(locked.calls.locked, 1);
  assert.equal(locked.calls.battle, 0);
  const lateLock = boot('extreme');
  lateLock.shell.saveLock = 'stale';
  lateLock.loaded();
  assert.equal(lateLock.shell.game, null);
  assert.equal(lateLock.calls.battle, 0);
});

test('极限续局加载前及恢复后，首页、退场、重开、导入和轮回动作均不能绕出未完战斗', () => {
  for (const loaded of [false, true]) {
    const entry = boot('extreme');
    if (loaded) entry.loaded();
    let blocked = 0;
    entry.shell.toast = () => blocked++;
    const run = entry.shell.game ?? entry.shell.pendingRun;
    for (const action of EXTREME_EXIT_ACTIONS) {
      dispatchAction(entry.shell as ActionShell, action);
      assert.equal(entry.shell.game ?? entry.shell.pendingRun, run, action);
      assert.equal(entry.calls.lobby, 0, action);
    }
    assert.equal(blocked, EXTREME_EXIT_ACTIONS.size);
  }
});
