import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, runInContext } from 'node:vm';
import { dispatchAction } from '../src/action-controller.ts';
import { Game } from '../src/game.ts';
import { freshSave, realmCost, realmInfo, lifespanInfo, tribulationDue } from '../src/progress.ts';
import { settleSectDues, joinSect } from '../src/mortal.ts';
import { ensureScene } from '../src/scene-flow.ts';
import { STAGES, ENEMIES, FINAL_TRIAL_STAGE } from '../src/data.ts';
import { SoundSettings } from '../src/sound-settings.ts';
import { exportSave, importSave, MAX_SAVE_FILE_BYTES } from '../src/save-transfer.ts';
import { importConfirmPanel } from '../src/lobby-ui.ts';
import { isExtremeLife } from '../src/life-mode.ts';

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const tick = () => new Promise((resolve) => setImmediate(resolve));
function base() {
  const save = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  save.prologueSeen = save.hometownSeen = true;
  save.mortal.hometown!.stage = 'departed';
  let fail = true,
    stored = JSON.stringify(save);
  const toasts: string[] = [];
  const shell: any = {
    save,
    game: null,
    pendingRun: null,
    settled: false,
    saveLock: null,
    panel: 'settings',
    structuredClone,
    performance,
    toasts,
    lifespanInfo,
    tribulationDue,
    realmInfo,
    FINAL_TRIAL_STAGE,
    STAGES,
    modal: { innerHTML: '', querySelector: () => null },
    document: { getElementById: () => null },
    ui: { querySelector: () => null },
    clearInput() {},
    closeNpcChat() {},
    renderLobby() {},
    renderPanel() {},
    renderHud() {},
    renderPause() {},
    renderChoices() {},
    refreshAutoplaySettings() {},
    syncMortalChange() {},
    toast: (text: string) => toasts.push(text),
    writeSave(next: unknown) {
      if (fail) throw Error('quota');
      stored = JSON.stringify(next);
    },
    persist: () => !fail,
    settleSectDues,
    medicinePanel: { handle: () => false },
  };
  return {
    shell,
    allow() {
      fail = false;
    },
    stored: () => JSON.parse(stored),
  };
}

for (const cancel of ['resume', 'close']) {
  test(`弃局确认后${cancel}继续，下次死亡不再被视为弃局，真正确认仍能结束`, () => {
    const { shell } = base();
    shell.panel = '';
    shell.game = new Game(shell.save, 0, 0, () => 0.5);
    shell.game.pause();
    shell.abandonConfirm = false;
    dispatchAction(shell, 'abandon');
    assert.equal(shell.abandonConfirm, true);
    dispatchAction(shell, cancel);
    assert.equal(shell.game.state, 'playing');
    assert.equal(shell.abandonConfirm, false);
    dispatchAction(shell, 'pause');
    dispatchAction(shell, 'abandon');
    dispatchAction(shell, 'abandon');
    assert.equal(shell.game.state, 'lost');
    assert.equal(shell.abandonConfirm, true);
  });
}

test('自动设置失败不更新状态，声音和音量失败不输出，其他保存不夹带失败设置', () => {
  const { shell, allow, stored } = base();
  shell.save.sound = false;
  shell.save.volume = 0.6;
  let outputs = 0;
  shell.soundSettings = new SoundSettings(
    shell.save,
    {
      sync() {
        outputs++;
      },
      play() {
        outputs++;
      },
    },
    shell.persist,
  );
  dispatchAction(shell, 'autoplay');
  assert.equal(shell.save.autoplay, false);
  assert.match(shell.toasts.at(-1), /尚未保存/);
  assert.equal(shell.soundSettings.setEnabled(true, true), false);
  assert.equal(shell.soundSettings.setVolume(0.2), false);
  assert.equal(outputs, 0);
  assert.equal(shell.save.sound, false);
  assert.equal(shell.save.volume, 0.6);
  allow();
  dispatchAction(shell, 'autoplay-build', 'survival');
  assert.equal(stored().autoplayBuild.mode, 'survival');
  assert.equal(stored().autoplay, false);
  assert.equal(stored().sound, false);
  assert.equal(stored().volume, 0.6);
  dispatchAction(shell, 'autoplay');
  assert.equal(shell.save.autoplay, true);
  assert.equal(stored().autoplay, true);
});

for (const action of ['dues-pay', 'dues-decline']) {
  test(`${action}保存失败保留账期余额和弹窗，重试只结算一次`, () => {
    const { shell, allow, stored } = base();
    shell.save.stones = 10000;
    shell.save.cultivation = realmCost(0) + realmCost(1) + realmCost(2);
    assert.equal(joinSect(shell.save, 'haste'), true);
    shell.save.stones = 50;
    shell.save.mortal.member.dueAt = shell.save.mortal.years;
    shell.save.mortal.member.dues = 50;
    shell.panel = 'sect-dues';
    shell.modal.innerHTML = 'dues dialog';
    const before = JSON.stringify(shell.save);
    dispatchAction(shell, action);
    assert.equal(JSON.stringify(shell.save), before);
    assert.equal(shell.panel, 'sect-dues');
    assert.equal(shell.modal.innerHTML, 'dues dialog');
    assert.match(shell.toasts.at(-1), /尚未保存/);
    allow();
    dispatchAction(shell, action);
    assert.equal(shell.panel, '');
    assert.equal(stored().stones, action === 'dues-pay' ? 0 : 50);
    if (action === 'dues-decline') assert.equal(stored().mortal.member, null);
    else assert.ok(stored().mortal.member.dueAt > shell.save.mortal.years);
    const once = JSON.stringify(shell.save);
    dispatchAction(shell, action);
    assert.equal(JSON.stringify(shell.save), once);
  });
}

const changeSource = stripTypeScriptTypes(
  main.slice(
    main.indexOf("document.addEventListener('change'"),
    main.indexOf("document.addEventListener('keydown'"),
  ),
);
function importHarness() {
  let handler: (event: any) => Promise<void>;
  const context: any = createContext({
    save: freshSave(),
    game: null,
    pendingRun: null,
    saveLock: null,
    panel: 'settings',
    pendingImport: null,
    importReadEpoch: 0,
    isExtremeLife,
    importSave,
    importConfirmPanel,
    MAX_SAVE_FILE_BYTES,
    document: {
      addEventListener(_name: string, fn: any) {
        handler = fn;
      },
    },
    panelFrame() {},
    toasts: [],
    toast(message: string) {
      context.toasts.push(message);
    },
  });
  runInContext(changeSource, context);
  function input(stones: number) {
    const save = freshSave();
    save.stones = stones;
    let release!: (value: string) => void, reject!: (error: Error) => void;
    const pending = new Promise<string>((resolve, fail) => {
      release = resolve;
      reject = fail;
    });
    const node = {
      id: 'save-import',
      value: '',
      isConnected: true,
      files: [{ size: 1000, text: () => pending }],
    };
    return {
      node,
      run: () => handler({ target: node }),
      release: () => release(exportSave(save, null)),
      reject,
    };
  }
  return { context, input };
}

test('导入A后改选B，A先返回也不能成为确认对象；迟到失败不覆盖新状态', async () => {
  for (const failFirst of [false, true]) {
    const h = importHarness(),
      a = h.input(111),
      b = h.input(222);
    const first = a.run(),
      second = b.run();
    if (failFirst) a.reject(Error('old file failed'));
    else a.release();
    await first;
    assert.equal(h.context.panel, 'settings');
    assert.equal(h.context.pendingImport, null);
    b.release();
    await second;
    assert.equal(h.context.panel, 'import-confirm');
    assert.equal(h.context.pendingImport.save.stones, 222);
    assert.equal(h.context.toasts.length, 0);
  }
});

test('关闭重开导入后，旧节点迟到读取和存档锁定均不能恢复确认框', async () => {
  for (const lock of [false, true]) {
    const h = importHarness(),
      old = h.input(111);
    const pending = old.run();
    if (lock) h.context.saveLock = 'stale';
    else old.node.isConnected = false;
    old.release();
    await pending;
    assert.equal(h.context.pendingImport, null);
    assert.equal(h.context.panel, 'settings');
    if (!lock) {
      const fresh = h.input(222),
        next = fresh.run();
      fresh.release();
      await next;
      assert.equal(h.context.pendingImport.save.stones, 222);
    }
  }
});

test('场景成功/失败响应迟到时，存档锁定后不启动或覆盖锁定画面', async () => {
  for (const failure of [false, true]) {
    let resolve!: () => void,
      reject!: (error: Error) => void,
      next = 0,
      removed = 0,
      prepares = 0;
    const pending = new Promise<void>((ok, bad) => {
      resolve = ok;
      reject = bad;
    });
    const loading = {
      innerHTML: '',
      setAttribute() {},
      remove() {
        removed++;
      },
      querySelector: () => null,
    };
    const shell: any = {
      save: freshSave(),
      saveLock: null,
      STAGES,
      ENEMIES,
      FINAL_TRIAL_STAGE,
      realmInfo,
      renderer: {
        hasScene: () => false,
        prepareScene() {
          prepares++;
          return pending;
        },
      },
      window: { matchMedia: () => ({ matches: false }) },
      document: { createElement: () => loading },
      app: { append() {} },
      sceneLoading: false,
    };
    assert.equal(
      ensureScene(shell, 0, () => next++),
      false,
    );
    shell.saveLock = 'stale';
    if (failure) reject(Error('late network'));
    else resolve();
    await tick();
    assert.equal(next, 0);
    assert.equal(removed, 1);
    assert.equal(shell.sceneLoading, false);
    assert.equal(
      ensureScene(shell, 0, () => next++),
      false,
    );
    assert.equal(prepares, 1);
  }
});

test('茶馆明确朗读也尊重保存失败，主控制器回传失败且不启动声音', () => {
  const save = freshSave();
  save.sound = false;
  save.volume = 0.6;
  const soundSettings = new SoundSettings(
    save,
    {
      sync() {
        assert.fail('不得输出');
      },
      play() {
        assert.fail('不得播放');
      },
    },
    () => false,
  );
  const context: any = createContext({
    save,
    soundSettings,
    panel: '',
    modal: { querySelector: () => ({}) },
    townSource: { current: { teaStoryPanel: () => [] } },
    panelFrame() {},
    mountTeaStory(_host: unknown, _save: unknown, callback: () => boolean) {
      context.enableSound = callback;
    },
  });
  const body = main.match(/^function showTeaStory\([^]*?^\}/m)![0];
  runInContext(stripTypeScriptTypes(body) + ';showTeaStory();', context);
  assert.equal(context.enableSound(), false);
  const npc = readFileSync(new URL('../src/npc-chat.ts', import.meta.url), 'utf8');
  const event = npc.slice(npc.indexOf('  play.onclick ='), npc.indexOf('  stop.onclick ='));
  context.play = { textContent: '开启声音并朗读' };
  context.displayedReply = '一回故事';
  context.reader = {
    play() {
      assert.fail('失败时不启动朗读');
    },
  };
  runInContext(event + ';play.onclick();', context);
  assert.equal(context.play.textContent, '开启声音并朗读');
  assert.equal(save.sound, false);
});
