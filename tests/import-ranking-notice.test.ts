import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchAction } from '../src/action-controller.ts';
import { importConfirmPanel } from '../src/lobby-ui.ts';
import { freshSave, lifespanInfo, realmInfo, tribulationDue } from '../src/progress.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';
import { syncHumanStories } from '../src/human-stories.ts';
import { resolveActivity } from '../src/mortal.ts';
import { Game } from '../src/game.ts';

const message = '此存档未通过完整性校验。可以导入继续游玩，但本世不可留名万魂幡。';
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
function candidate(tampered = true) {
  const save = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  save.prologueSeen = save.hometownSeen = true;
  save.mortal.hometown!.stage = 'departed';
  save.factsTampered = tampered;
  save.stones = 1234;
  return importSave(exportSave(save, null));
}
function fixture(incoming = candidate(), initialAccess = false) {
  const save = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  save.prologueSeen = save.hometownSeen = true;
  save.mortal.hometown!.stage = 'departed';
  let writes = 0,
    checks = 0,
    failWrite = false,
    renders = 0;
  let written: any;
  let button = { textContent: '确认覆盖并导入', disabled: false, isConnected: true };
  let warning = incoming.save.factsTampered && !initialAccess;
  const modal = {
    innerHTML: importConfirmPanel(incoming, initialAccess)[2],
    querySelector(selector: string) {
      if (selector === '[data-action="confirm-import"]') return button;
      if (selector === '[data-import-ranking-warning]') return warning ? {} : null;
      return null;
    },
  };
  const notices: string[] = [];
  const shell: any = {
    save,
    pendingImport: incoming,
    game: null,
    pendingRun: null,
    settled: false,
    saveLock: null,
    panel: 'import-confirm',
    modal,
    lifespanInfo,
    realmInfo,
    tribulationDue,
    Game,
    structuredClone,
    resolveActivity,
    syncHumanStories,
    getRankingTestAccess: async (refresh: boolean) => {
      assert.equal(refresh, true);
      checks++;
      return false;
    },
    panelFrame(_title: string, _subtitle: string, body: string) {
      renders++;
      button.isConnected = false;
      button = { textContent: '确认覆盖并导入', disabled: false, isConnected: true };
      warning = body.includes('data-import-ranking-warning');
      modal.innerHTML = body;
    },
    writeSave(next: unknown) {
      if (failWrite) throw Error('quota');
      writes++;
      written = structuredClone(next);
    },
    gameAudio: { sync() {} },
    returnLobby() {
      shell.panel = '';
      modal.innerHTML = '';
    },
    toast(text: string) {
      notices.push(text);
    },
  };
  return {
    shell,
    notices,
    counts: () => ({ writes, checks, renders }),
    stored: () => written,
    button: () => button,
    failWrite: () => {
      failWrite = true;
    },
    allowWrite: () => {
      failWrite = false;
    },
  };
}

test('正常封签导出再导入不提示；旧改动标记仅在服务器测试未开放时说明留名限制', () => {
  const clean = candidate(false);
  assert.equal(clean.save.factsTampered, false);
  assert.doesNotMatch(importConfirmPanel(clean)[2], /未通过完整性|不可留名/);
  const changed = candidate();
  const before = JSON.stringify(changed);
  const closed = importConfirmPanel(changed, false)[2];
  assert.ok(closed.includes(message));
  assert.match(closed, /data-import-ranking-warning/);
  assert.doesNotMatch(closed, /手工改|手改|作弊/);
  for (const action of ['export-save', 'settings', 'confirm-import'])
    assert.match(closed, new RegExp(`data-action="${action}"`));
  const opened = importConfirmPanel(changed, true)[2];
  assert.doesNotMatch(opened, /未通过完整性|不可留名|调试|测试开放/);
  assert.equal(JSON.stringify(changed), before);
});

test('正常封签导入不发起测试权限查询，保持原同步确认事务', () => {
  const f = fixture(candidate(false));
  dispatchAction(f.shell, 'confirm-import');
  assert.deepEqual(f.counts(), { writes: 1, checks: 0, renders: 0 });
  assert.equal(f.shell.pendingImport, null);
  assert.equal(f.stored().factsTampered, false);
});

test('已有提示时可明确确认继续游玩，导入保留旧标记而不洗白', async () => {
  const f = fixture();
  const before = JSON.stringify(f.shell.pendingImport.save);
  const incoming = f.shell.pendingImport;
  dispatchAction(f.shell, 'confirm-import');
  assert.equal(f.counts().writes, 0);
  await settle();
  assert.equal(f.counts().writes, 1);
  assert.equal(f.stored().factsTampered, true);
  assert.equal(JSON.stringify(incoming.save), before);
});

test('确认时服务器测试已开放则允许导入，不额外宣传或清除旧标记；连点只核对和覆盖一次', async () => {
  const f = fixture(candidate(), true);
  let finish!: (value: boolean) => void,
    checks = 0;
  f.shell.getRankingTestAccess = (refresh: boolean) => {
    assert.equal(refresh, true);
    checks++;
    return new Promise((resolve) => {
      finish = resolve;
    });
  };
  dispatchAction(f.shell, 'confirm-import');
  dispatchAction(f.shell, 'confirm-import');
  assert.equal(f.button().disabled, true);
  await Promise.resolve();
  assert.equal(checks, 1);
  assert.equal(f.counts().writes, 0);
  finish(true);
  await settle();
  assert.equal(f.counts().writes, 1);
  assert.equal(f.stored().factsTampered, true);
  assert.equal(f.shell.pendingImport, null);
});

test('测试权限在确认前关闭或查询失败时，先重新展示限制，用户再确认才覆盖', async () => {
  for (const failure of [false, true]) {
    const f = fixture(candidate(), true);
    f.shell.getRankingTestAccess = async () => {
      if (failure) throw Error('network');
      return false;
    };
    const before = JSON.stringify(f.shell.save),
      incoming = f.shell.pendingImport;
    dispatchAction(f.shell, 'confirm-import');
    await settle();
    assert.equal(f.counts().writes, 0);
    assert.equal(JSON.stringify(f.shell.save), before);
    assert.equal(f.shell.pendingImport, incoming);
    assert.equal(f.shell.panel, 'import-confirm');
    assert.ok(f.shell.modal.innerHTML.includes(message));
    assert.equal(f.button().disabled, false);
    dispatchAction(f.shell, 'confirm-import');
    await settle();
    assert.equal(f.counts().writes, 1);
    assert.equal(f.stored().factsTampered, true);
  }
});

test('等待测试权限时取消、换候选、开战或锁档，迟到结果不能覆盖或重开面板', async () => {
  for (const change of [
    (s: any) => {
      dispatchAction(s, 'settings');
      s.panel = 'settings';
    },
    (s: any) => {
      s.pendingImport = candidate(false);
    },
    (s: any) => {
      s.game = { state: 'playing' };
    },
    (s: any) => {
      s.saveLock = 'stale';
    },
  ]) {
    const f = fixture(candidate(), true);
    let finish!: (value: boolean) => void;
    f.shell.getRankingTestAccess = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    f.shell.showPanel = (name: string) => {
      f.shell.panel = name;
    };
    const before = JSON.stringify(f.shell.save);
    dispatchAction(f.shell, 'confirm-import');
    await Promise.resolve();
    change(f.shell);
    const panel = f.shell.panel;
    finish(true);
    await settle();
    assert.equal(f.counts().writes, 0);
    assert.equal(f.counts().renders, 0);
    assert.equal(JSON.stringify(f.shell.save), before);
    assert.equal(f.shell.panel, panel);
  }
});

test('异步核对成功后的写档失败仍保留候选和原档，可原位重试', async () => {
  const f = fixture(candidate(), true);
  f.shell.getRankingTestAccess = async () => true;
  f.failWrite();
  const before = JSON.stringify(f.shell.save),
    incoming = f.shell.pendingImport;
  dispatchAction(f.shell, 'confirm-import');
  await settle();
  assert.equal(f.counts().writes, 0);
  assert.equal(JSON.stringify(f.shell.save), before);
  assert.equal(f.shell.pendingImport, incoming);
  assert.equal(f.button().disabled, false);
  assert.ok(f.notices.some((n) => n.includes('当前进度未更改')));
  f.allowWrite();
  dispatchAction(f.shell, 'confirm-import');
  await settle();
  assert.equal(f.counts().writes, 1);
  assert.equal(f.stored().factsTampered, true);
});

test('落幕和终章存档导出可越过结束状态锁，真实序列化完整保留结局、标记和进度', () => {
  for (const ending of ['extreme', 'tribulation', 'lifespan', 'ambush', 'immortal'] as const) {
    const f = fixture(candidate());
    const s = f.shell;
    s.save.factsTampered = true;
    if (ending === 'immortal') {
      s.save.completed = [0, 1, 2, 3, 4, 5, 6];
      s.save.cultivation = 1e9;
      s.save.journeyEnded = true;
      s.panel = 'epilogue-reincarnate';
    } else {
      s.save.lifeMode = ending === 'extreme' ? 'extreme' : 'normal';
      s.save.pendingReincarnation = ending;
      s.panel = `${ending}-farewell`;
    }
    const before = JSON.stringify(s.save);
    let output = '',
      fileName = '';
    s.exportSave = exportSave;
    s.downloadJson = (text: string, name: string) => {
      output = text;
      fileName = name;
    };
    dispatchAction(s, 'export-save');
    const file = JSON.parse(output);
    assert.equal(file.format, 'qinglan-save');
    assert.equal(fileName, '存档');
    assert.equal(file.save.activeRun, null);
    assert.equal(file.save.pendingReincarnation, s.save.pendingReincarnation);
    assert.equal(file.save.journeyEnded, s.save.journeyEnded);
    assert.equal(file.save.factsTampered, true);
    assert.deepEqual(file.save.training, s.save.training);
    assert.equal(JSON.stringify(s.save), before);
    assert.equal(f.counts().writes, 0);
    assert.equal(s.panel, ending === 'immortal' ? 'epilogue-reincarnate' : `${ending}-farewell`);
  }
});

test('结束状态仍不放行导入、资源或普通修行操作', () => {
  const f = fixture();
  const s = f.shell;
  s.save.lifeMode = 'extreme';
  s.save.pendingReincarnation = 'extreme';
  s.panel = 'extreme-farewell';
  const before = JSON.stringify(s.save);
  let downloads = 0;
  s.exportSave = exportSave;
  s.downloadJson = () => downloads++;
  for (const action of [
    'confirm-import',
    'import-save',
    'train',
    'forge',
    'claim-ad-reward',
    'start',
  ])
    dispatchAction(s, action);
  assert.equal(JSON.stringify(s.save), before);
  assert.equal(f.counts().writes, 0);
  assert.equal(downloads, 0);
  assert.equal(s.panel, 'extreme-farewell');
});
