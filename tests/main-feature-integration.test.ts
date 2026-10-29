import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, Script } from 'node:vm';
import { freshSave, lifespanInfo, tribulationDue } from '../src/progress.ts';
import { dispatchAction } from '../src/action-controller.ts';
import {
  LeaderboardPreference,
  LEADERBOARD_PREFERENCE_KEY,
} from '../src/leaderboard-preference.ts';

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const script = new Script(
  stripTypeScriptTypes(
    [
      'rankingEnabled',
      'clearRanking',
      'queueRanking',
      'closeRanking',
      'renderRanking',
      'handleAction',
    ]
      .map((name) => {
        const source = main.match(new RegExp(`^function ${name}\\([^]*?^\\}`, 'm'));
        assert.ok(source, name);
        return source[0];
      })
      .join('\n'),
  ),
);
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

function harness() {
  const saved = new Map<string, string>();
  let fail = false;
  const storage = {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem(key: string, value: string) {
      if (fail) throw Error('quota');
      saved.set(key, value);
    },
  };
  const save = freshSave();
  save.prologueSeen = save.hometownSeen = true;
  save.mortal.hometown!.stage = 'departed';
  const calls = {
    clears: 0,
    destroys: 0,
    removed: 0,
    renders: 0,
    restores: [] as unknown[],
    messages: [] as string[],
    frames: [] as string[][],
    loads: 0,
  };
  const inheritance = { value: 'pagoda' };
  const preview = { innerHTML: '' };
  const section = { scrollTop: 0 };
  const host = { isConnected: true, innerHTML: '', querySelector: () => null };
  const context = createContext({
    dispatchAction,
    lifespanInfo,
    tribulationDue,
    shellBindings: () => context,
    medicinePanel: { handle: () => false },
    save,
    saveLock: null,
    game: null,
    pendingRun: null,
    panel: 'settings',
    FINAL_TRIAL_STAGE: 6,
    rankingPreference: new LeaderboardPreference(() => storage),
    leaderboardAvailable: () => true,
    rankingOffer: {
      clear() {
        calls.clears++;
      },
    },
    rankingPanel: {
      destroy() {
        calls.destroys++;
      },
    },
    rankingQueuedSeed: null,
    rankingEpoch: 0,
    rankingReturn: null,
    rankingInheritance: null,
    document: {
      querySelectorAll: () => [
        {
          remove() {
            calls.removed++;
          },
        },
      ],
    },
    toastElement: { hasAttribute: () => true, classList: { remove() {} }, removeAttribute() {} },
    modal: {
      set innerHTML(value: string) {
        if (!value) host.isConnected = false;
      },
      querySelector(selector: string) {
        if (selector === '[data-ranking-host]') return host;
        if (selector === '#reincarnate-inheritance') return inheritance;
        if (selector === '.inheritance-preview') return preview;
        if (selector === '.panel') return section;
        return null;
      },
    },
    toast: (message: string) => calls.messages.push(message),
    renderPanel() {
      calls.renders++;
    },
    rememberPanel: () => ({ name: context.panel, scroll: 91, openDetails: ['score'] }),
    restorePanel: (location: unknown) => calls.restores.push(location),
    panelFrame: (...parts: string[]) => calls.frames.push(parts),
    rankingSource: {
      load() {
        calls.loads++;
        return Promise.reject(Error('offline'));
      },
    },
    epilogueReincarnatePanel: () => ['传缘', '选择遗物', 'body'],
    inheritancePreview: (_save: unknown, id: string) => `preview:${id}`,
    renderJourneyFarewell() {},
  });
  script.runInContext(context);
  return {
    context,
    save,
    saved,
    calls,
    host,
    inheritance,
    preview,
    section,
    fail(value: boolean) {
      fail = value;
    },
  };
}

test('实际设置路由先保存开关，失败保留画面与选择；关闭清除通知并终止旧面板', () => {
  const h = harness();
  const gameSave = JSON.stringify(h.save);
  h.fail(true);
  h.context.handleAction('leaderboard-toggle');
  assert.equal(h.context.rankingPreference.enabled, true);
  assert.equal(h.saved.has(LEADERBOARD_PREFERENCE_KEY), false);
  assert.equal(h.calls.destroys, 0);
  assert.equal(h.calls.renders, 0);
  assert.match(h.calls.messages[0], /尚未保存/);
  h.fail(false);
  h.context.handleAction('leaderboard-toggle');
  assert.equal(h.context.rankingPreference.enabled, false);
  assert.equal(h.saved.get(LEADERBOARD_PREFERENCE_KEY), '0');
  assert.equal(h.calls.clears, 1);
  assert.equal(h.calls.destroys, 1);
  assert.equal(h.calls.removed, 1);
  assert.equal(h.calls.renders, 1);
  assert.equal(h.calls.loads, 0);
  assert.equal(JSON.stringify(h.save), gameSave);
  h.context.handleAction('leaderboard');
  assert.equal(h.context.panel, 'settings');
});

test('实际候选装载一世仅一次，关闭或替换存档后迟到模块不创建通知控制器', async () => {
  const h = harness();
  h.context.rankingOffer = null;
  h.save.pendingReincarnation = 'lifespan';
  let finish!: (module: unknown) => void;
  let constructed = 0;
  h.context.rankingSource.load = () => {
    h.calls.loads++;
    return new Promise((resolve) => {
      finish = resolve;
    });
  };
  for (let i = 0; i < 20; i++) h.context.queueRanking();
  assert.equal(h.calls.loads, 1);
  h.context.clearRanking();
  finish({
    LeaderboardOffer: class {
      constructor() {
        constructed++;
      }
    },
  });
  await settle();
  assert.equal(constructed, 0);
  assert.equal(h.context.rankingOffer, null);
});

test('实际榜单入口关闭后迟到模块不重开，返回终章保留传承选择与滚动位置', async () => {
  const h = harness();
  let finish!: (module: unknown) => void;
  let constructed = 0;
  h.context.rankingSource.load = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  h.context.panel = 'epilogue-reincarnate';
  h.context.handleAction('leaderboard');
  assert.equal(h.context.panel, 'leaderboard');
  assert.equal(h.context.rankingInheritance, 'pagoda');
  h.inheritance.value = '';
  h.context.handleAction('close');
  assert.equal(h.context.panel, 'epilogue-reincarnate');
  assert.equal(h.inheritance.value, 'pagoda');
  assert.equal(h.preview.innerHTML, 'preview:pagoda');
  assert.equal(h.section.scrollTop, 91);
  finish({
    LeaderboardPanel: class {
      constructor() {
        constructed++;
      }
    },
  });
  await settle();
  assert.equal(constructed, 0);
});
