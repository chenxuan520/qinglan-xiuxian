import { notificationLeaves } from './helpers/notification-leaves.ts';
import * as lifeMode from '../src/life-mode.ts';
import { endExtremeLife } from '../src/progress.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, Script } from 'node:vm';
import { freshSave, parseSave, readSave, SAVE_KEY, SAVE_SCHEMA } from '../src/progress.ts';
import {
  backupUnreadableSave,
  exportSave,
  importSave,
  UNREADABLE_SAVE_PREFIX,
  restoreSavedRun,
} from '../src/save-transfer.ts';
import { Game } from '../src/game.ts';
import { saveLockPanel } from '../src/lobby-ui.ts';

const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');

test('读档区分空档、正常、新版本与无法读取，parseSave 返回值保持不变', () => {
  assert.equal(readSave(null).status, 'empty');
  const saved = { ...freshSave(), stones: 321 };
  assert.equal(saved.schema, SAVE_SCHEMA);
  const ok = readSave(JSON.stringify(saved));
  assert.equal(ok.status, 'ok');
  assert.equal(ok.save.stones, 321);
  for (const raw of ['{bad json', '[]', 'null', '{"version":2,"stones":9}'])
    assert.equal(readSave(raw).status, 'unreadable', raw);
  // 低版本档读取时升级到当前结构；无法识别 schema 的按最老档升级。
  const older = readSave(JSON.stringify({ ...saved, schema: SAVE_SCHEMA - 1 }));
  assert.equal(older.status, 'ok');
  assert.equal(older.save.schema, SAVE_SCHEMA);
  assert.equal(older.save.stones, 321);
  // 最老档没有 schema 字段，同样走升级读取。
  const oldest = readSave('{"version":1}');
  assert.equal(oldest.status, 'ok');
  assert.equal(oldest.save.schema, SAVE_SCHEMA);
  assert.equal(readSave(JSON.stringify({ ...saved, schema: 'x' })).status, 'ok');

  const newer = readSave(JSON.stringify({ ...saved, schema: SAVE_SCHEMA + 1 }));
  assert.equal(newer.status, 'newer');
  assert.equal(newer.save.stones, 321);

  // 迁移途中抛错不能被当作正常档继续写回。
  const legacy = { ...saved, rootElements: undefined };
  const broken = () => {
    throw new Error('migration');
  };
  assert.equal(readSave(JSON.stringify(legacy), broken).status, 'unreadable');
  assert.equal(
    readSave(JSON.stringify({ ...legacy, schema: SAVE_SCHEMA + 1 }), broken).status,
    'newer',
  );
});

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    get length() {
      return data.size;
    },
    key: (index: number) => [...data.keys()][index] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

test('无法读取的原始存档另存一份，相同内容不重复，写入失败返回 false', () => {
  const storage = memoryStorage({ [SAVE_KEY]: '{bad' });
  assert.equal(backupUnreadableSave(storage, '{bad', 100), true);
  assert.equal(storage.getItem(`${UNREADABLE_SAVE_PREFIX}100`), '{bad');
  assert.equal(backupUnreadableSave(storage, '{bad', 200), true);
  assert.equal(storage.data.size, 2);
  assert.equal(backupUnreadableSave(storage, '{other', 300), true);
  assert.equal(storage.getItem(`${UNREADABLE_SAVE_PREFIX}300`), '{other');
  assert.equal(storage.getItem(SAVE_KEY), '{bad');

  const full = memoryStorage();
  full.setItem = () => {
    throw new Error('QuotaExceededError');
  };
  assert.equal(backupUnreadableSave(full, '{bad', 1), false);
});

test('导出带存档版本；导入拒绝更新版本或迁移失败的存档', () => {
  const save = freshSave();
  const file = JSON.parse(exportSave(save, null));
  assert.equal(file.save.schema, SAVE_SCHEMA);
  assert.equal(importSave(JSON.stringify(file)).save.schema, SAVE_SCHEMA);
  file.save.schema = SAVE_SCHEMA + 1;
  assert.throws(() => importSave(JSON.stringify(file)), /更新的版本/);
});

// 执行 main.ts 中实际的写入、锁定与动作入口，不加载页面初始化。
const flow = new Script(
  stripTypeScriptTypes(
    [
      'writeSave',
      'persist',
      'lockStaleSave',
      'renderSaveLock',
      'handleAction',
      'showRuntimeErrorNotice',
    ]
      .map((name) => {
        const match = source.match(new RegExp(`^function ${name}\\([^]*?^\\}`, 'm'));
        assert.ok(match, `未找到 main.ts 实际函数 ${name}`);
        return match[0];
      })
      .join('\n'),
  ),
);

function harness(options: {
  stored: string | null;
  saveLock?: 'unreadable' | 'newer' | null;
  unreadableBackedUp?: boolean;
}) {
  const storage = memoryStorage(options.stored === null ? {} : { [SAVE_KEY]: options.stored });
  const writes: string[] = [];
  const setItem = storage.setItem;
  storage.setItem = (key: string, value: string) => {
    writes.push(value);
    setItem(key, value);
  };
  const context = createContext({
    ...notificationLeaves(),
    // 成就队列另有真实回归，此处隔离界面通知，不跳过实际存档写入。
    chronicleSource: { observe() {} },
    hideAchievementNotice() {},
    ...lifeMode,
    save: freshSave(),
    game: null as null | { paused: number; pause(): void; snapshot(): unknown },
    settled: false,
    settlementRetryAt: 0,
    pendingRun: null,
    syncHumanStories: () => {},
    localStorage: storage,
    SAVE_KEY,
    raw: options.stored,
    lastSaveText: options.stored,
    saveLock: options.saveLock ?? null,
    unreadableBackedUp: options.unreadableBackedUp ?? false,
    storageAvailable: true,
    panel: '',
    ui: { inert: false },
    modal: { innerHTML: '', querySelector: () => null },
    panelFrame: (title: string, subtitle: string, body: string) => {
      context.modal.innerHTML = `${title}${subtitle}${body}`;
    },
    clearInput: () => {},
    toasts: [] as string[],
    toast: (text: string) => context.toasts.push(text),
    reloads: 0,
    location: { reload: () => context.reloads++ },
    downloads: [] as string[],
    downloadJson: (text: string) => context.downloads.push(text),
    prologues: 0,
    renderPrologue: () => context.prologues++,
    saveLockPanel,
  });
  flow.runInContext(context);
  return { context, storage, writes };
}

test('其他窗口写入后本页停止保存、暂停战斗并只允许载入最新进度', () => {
  const { context, storage, writes } = harness({ stored: null });
  context.persist();
  assert.equal(writes.length, 1);
  assert.equal(context.lastSaveText, writes[0]);
  assert.equal(JSON.parse(writes[0]).schema, SAVE_SCHEMA);

  context.game = {
    paused: 0,
    pause() {
      this.paused++;
    },
    snapshot: () => ({ stage: 0 }),
  };
  storage.data.set(SAVE_KEY, '{"version":1,"from":"other-tab"}');
  context.persist();
  assert.equal(writes.length, 1);
  assert.equal(storage.getItem(SAVE_KEY), '{"version":1,"from":"other-tab"}');
  assert.equal(context.saveLock, 'stale');
  assert.equal(context.game.paused, 1);
  assert.equal(context.panel, 'save-lock');
  assert.equal(context.ui.inert, true);
  assert.match(context.modal.innerHTML, /此页已停止保存/);
  assert.deepEqual(context.toasts, []);

  context.persist();
  context.handleAction('train', 'power');
  context.handleAction('save-lock-continue');
  assert.equal(writes.length, 1);
  assert.equal(context.saveLock, 'stale');
  context.handleAction('save-lock-reload');
  assert.equal(context.reloads, 1);
});

test('无法读取的存档在确认前不写入，可下载原文，确认后才开始新的一世', () => {
  const { context, storage, writes } = harness({
    stored: '{bad',
    saveLock: 'unreadable',
    unreadableBackedUp: true,
  });
  context.persist();
  assert.equal(writes.length, 0);
  context.renderSaveLock();
  assert.match(context.modal.innerHTML, /原存档已备份/);
  context.handleAction('save-lock-download');
  assert.deepEqual(context.downloads, ['{bad']);
  assert.equal(storage.getItem(SAVE_KEY), '{bad');

  context.handleAction('save-lock-continue');
  assert.equal(context.saveLock, null);
  assert.equal(context.ui.inert, false);
  assert.equal(writes.length, 1);
  assert.equal(readSave(storage.getItem(SAVE_KEY)).status, 'ok');
  assert.equal(context.prologues, 1);
});

test('新版本存档只读：不写入、不能跳过锁定，提示刷新并可下载留底', () => {
  const stored = JSON.stringify({ ...freshSave(), schema: SAVE_SCHEMA + 1 });
  const { context, writes } = harness({ stored, saveLock: 'newer' });
  context.persist();
  context.renderSaveLock();
  assert.match(context.modal.innerHTML, /存档来自新版本/);
  context.handleAction('save-lock-continue');
  context.handleAction('cultivation');
  assert.equal(context.saveLock, 'newer');
  assert.equal(writes.length, 0);
  context.handleAction('save-lock-download');
  assert.deepEqual(context.downloads, [stored]);
});

function noticeHarness() {
  const h = harness({ stored: null });
  const handlers = new Map<string, () => void>();
  const paragraph = { textContent: '' };
  const box = {
    className: '',
    innerHTML: '',
    setAttribute: () => {},
    querySelector: (selector: string) =>
      selector === 'p'
        ? paragraph
        : {
            addEventListener: (_event: string, listener: () => void) =>
              handlers.set(selector, listener),
          },
    remove: () => {},
  };
  Object.assign(h.context, {
    document: {
      querySelector: () => null,
      createElement: () => box,
      body: { appendChild: () => {} },
    },
    ERROR_NOTICE_TITLE: '',
    ERROR_NOTICE_TEXT: '',
    ERROR_NOTICE_ACTIONS: '',
  });
  h.context.showRuntimeErrorNotice(true);
  return { ...h, paragraph, refresh: () => handlers.get('[data-error-action="refresh"]')!() };
}

test('更新提示刷新先保存真实续局，写入失败不离场，重试成功才刷新', () => {
  const { context, storage, refresh, paragraph } = noticeHarness();
  const save = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  const game = new Game(save, 0, 0, () => 0.5);
  game.time = 45;
  game.pause();
  context.game = game;
  context.save = save;
  const nativeSet = storage.setItem;
  storage.setItem = () => {
    throw new Error('QuotaExceededError');
  };
  refresh();
  assert.equal(context.reloads, 0);
  assert.equal(storage.getItem(SAVE_KEY), null);
  assert.match(paragraph.textContent, /尚未保存/);
  storage.setItem = nativeSet;
  refresh();
  assert.equal(context.reloads, 1);
  const saved = readSave(storage.getItem(SAVE_KEY));
  assert.equal(saved.status, 'ok');
  const restored = restoreSavedRun(saved.save, JSON.parse(storage.getItem(SAVE_KEY)!).activeRun);
  assert.ok(restored);
  assert.equal(restored.time, 45);
  assert.equal(restored.state, 'paused');
});

test('更新刷新不绕过结算与存档锁定，原故障刷新仍可使用', () => {
  for (const setup of [
    { settlementRetryAt: 10 },
    { game: { state: 'won' }, settled: false },
    { saveLock: 'newer' },
    { saveLock: 'unreadable' },
    { saveLock: 'stale' },
  ]) {
    const { context, writes, refresh } = noticeHarness();
    Object.assign(context, setup);
    refresh();
    assert.equal(context.reloads, 0);
    assert.equal(writes.length, 0);
  }
  const { context, writes, refresh } = noticeHarness();
  context.showRuntimeErrorNotice(false);
  refresh();
  assert.equal(context.reloads, 1);
  assert.equal(writes.length, 0);
});

function inlineRefreshHarness() {
  const h = harness({ stored: null });
  const note = { textContent: '' };
  const button = {};
  h.context.document = {
    querySelector: (selector: string) =>
      selector === '[data-action=refresh-game]'
        ? button
        : selector === '[data-resource-message]'
          ? note
          : null,
  };
  return { ...h, note, refresh: () => h.context.handleAction('refresh-game') };
}

test('原面板刷新保存真实待续对局，写入失败原地显示，恢复后才离场', () => {
  const { context, storage, note, refresh } = inlineRefreshHarness();
  const game = new Game(context.save, 0, 0, () => 0.5);
  game.time = 42;
  game.pause();
  context.pendingRun = game;
  context.save.stones = 4321;
  const setItem = storage.setItem;
  storage.setItem = () => {
    throw Error('QuotaExceededError');
  };
  refresh();
  assert.equal(context.reloads, 0);
  assert.equal(storage.getItem(SAVE_KEY), null);
  assert.match(note.textContent, /尚未保存/);
  storage.setItem = setItem;
  refresh();
  assert.equal(context.reloads, 1);
  const saved = readSave(storage.getItem(SAVE_KEY));
  assert.equal(saved.save.stones, 4321);
  const activeRun = JSON.parse(storage.getItem(SAVE_KEY)!).activeRun;
  const restored = restoreSavedRun(saved.save, activeRun);
  assert.ok(restored);
  assert.equal(restored.time, 42);
});

test('原面板刷新不能绕过存档锁、结算重试或未结胜局；陈旧页面不覆盖新档', () => {
  for (const setup of [
    { saveLock: 'newer' },
    { saveLock: 'unreadable' },
    { saveLock: 'stale' },
    { settlementRetryAt: 10 },
    { game: { state: 'won' }, settled: false },
  ]) {
    const { context, writes, refresh } = inlineRefreshHarness();
    Object.assign(context, setup);
    refresh();
    assert.equal(context.reloads, 0);
    assert.equal(writes.length, 0);
  }
  const { context, storage, writes, refresh } = inlineRefreshHarness();
  const other = JSON.stringify({ ...freshSave(), stones: 99 });
  storage.data.set(SAVE_KEY, other);
  refresh();
  assert.equal(context.reloads, 0);
  assert.equal(context.saveLock, 'stale');
  assert.equal(writes.length, 0);
  assert.equal(storage.getItem(SAVE_KEY), other);
});

test('失败面板关闭后残留的刷新动作不能保存或刷新', () => {
  const { context, writes, refresh } = inlineRefreshHarness();
  context.document.querySelector = () => null;
  refresh();
  assert.equal(context.reloads, 0);
  assert.equal(writes.length, 0);
});

test('main.ts 所有存档写入都经过 writeSave，启动与多窗口入口接入锁定', () => {
  assert.equal(source.match(/localStorage\.setItem\(/g)?.length, 1);
  assert.match(
    source.match(/^function writeSave\([^]*?^\}/m)![0],
    /localStorage\.setItem\(SAVE_KEY, text\)/,
  );
  assert.match(source, /const save = saveRead\.status === 'unreadable' \? parseSave\(null\)/);
  assert.match(source, /backupUnreadableSave\(localStorage, raw\)/);
  assert.match(
    source,
    /saveRead\.status !== 'unreadable' &&[^]*?stored\.schema === SAVE_SCHEMA \|\| isExtremeLife\(save\)[^]*?pendingRun = restoreSavedRun/,
  );
  assert.match(
    source,
    /window\.addEventListener\('storage'[^]*?event\.key !== SAVE_KEY[^]*?lockStaleSave\(\)/,
  );
  assert.match(source, /if \(saveLock\) renderSaveLock\(\);\npersist\(\);/);
  assert.match(source, /function handleAction\([^)]*\) \{\n {2}if \(saveLock\) \{/);
});

test('实际启动恢复代码只续同结构对局，旧档和高版本保留永久进度而不续局', () => {
  const startup = source.slice(
    source.indexOf('let pendingRun: Game | null = null;'),
    source.indexOf('let selectedStage = save.unlocked'),
  );
  const code = stripTypeScriptTypes(startup + '\npendingRun;');
  const original = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  original.stones = 321;
  const run = new Game(original, 0, 0, () => 0.5);
  run.time = 35;
  run.pause();
  original.activeRun = run.snapshot();
  for (const schema of [SAVE_SCHEMA - 1, undefined, SAVE_SCHEMA, SAVE_SCHEMA + 1]) {
    const raw = JSON.stringify({ ...original, schema });
    const saveRead = readSave(raw);
    const save = saveRead.save;
    const restored = new Script(code).runInContext(
      createContext({
        raw,
        saveRead,
        save,
        SAVE_SCHEMA,
        restoreSavedRun,
        ...lifeMode,
        endExtremeLife,
      }),
    );
    assert.equal(save.stones, 321);
    assert.equal(!!restored, schema === SAVE_SCHEMA, `结构${schema}`);
    if (restored) {
      assert.equal(restored.state, 'paused');
      assert.equal(restored.time, 35);
    }
  }
});
