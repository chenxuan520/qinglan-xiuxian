import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { dispatchAction } from '../src/action-controller.ts';
import { commitSaveAction } from '../src/save-action.ts';
import {
  showHometown,
  showTownEvent,
  startRun,
  beginTribulation,
  finishTribulation,
} from '../src/scene-flow.ts';
import {
  freshSave,
  readSave,
  alignStarterWithPath,
  lifespanInfo,
  tribulationDue,
  realmInfo,
  syncTribulationClock,
  completeTribulation,
  enterImmortalGate,
} from '../src/progress.ts';
import { TREASURES, FINAL_TRIAL_STAGE, isCultivationPath } from '../src/data.ts';
import { HOMETOWN_START } from '../src/town.ts';
import { chooseSmithStory, smithAt } from '../src/town-story.ts';
import { readHometownLetter, visitHometown, hometownParents } from '../src/hometown.ts';
import {
  HUMAN_STORIES,
  HUMAN_STORY_IDS,
  isHumanStoryId,
  chooseHumanStory,
  syncHumanStories,
} from '../src/human-stories.ts';
import { resolveActivity } from '../src/mortal.ts';
import { Game } from '../src/game.ts';
import { importSave } from '../src/save-transfer.ts';
import { hometownContent } from '../src/mortal-ui.ts';

function fixture(prepare = (_save: ReturnType<typeof freshSave>) => {}) {
  const save = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  save.prologueSeen = save.hometownSeen = true;
  save.mortal.hometown!.stage = 'departed';
  save.mortal.population = { seed: 12345, since: 15 };
  save.age = 18;
  save.iron = 8;
  prepare(save);
  let stored = JSON.stringify({ ...save, activeRun: null });
  let fail = true,
    writes = 0,
    renders = 0;
  const toasts: string[] = [];
  const panels: string[] = [];
  const shell: any = {
    save,
    game: null,
    pendingRun: null,
    settled: false,
    saveLock: null,
    panel: '',
    inMortalWorld: true,
    inTown: true,
    inMarket: false,
    modal: { innerHTML: 'original panel', querySelector: () => ({ remove() {} }) },
    medicinePanel: { handle: () => false },
    lifespanInfo,
    realmInfo,
    tribulationDue,
    FINAL_TRIAL_STAGE,
    isCultivationPath,
    alignStarterWithPath,
    catalogTreasures: TREASURES,
    chooseSmithStory,
    readHometownLetter,
    visitHometown,
    hometownParents,
    HUMAN_STORIES,
    isHumanStoryId,
    chooseHumanStory,
    syncHumanStories,
    HOMETOWN_START,
    townScene: { position: { ...HOMETOWN_START } },
    humanStoryContent: () => '',
    hometownLetterContent: () => '',
    hometownContent: () => '',
    closeNpcChat() {},
    mountNpcChat() {},
    toast: (text: string) => toasts.push(text),
    panelFrame: (_title: string, _subtitle: string, body: string) => {
      panels.push(body);
      renders++;
    },
    renderLobby: () => {
      renders++;
    },
    showTownEvent: () => {
      renders++;
    },
    writeSave(next: typeof save, run: Game | null) {
      if (fail) throw new DOMException('quota fixture', 'QuotaExceededError');
      stored = JSON.stringify({ ...next, activeRun: run?.snapshot() ?? null });
      writes++;
    },
    persist: () => {
      throw Error('transaction must not use mutate-then-persist');
    },
  };
  return {
    shell,
    toasts,
    panels,
    allow: () => {
      fail = false;
    },
    stored: () => JSON.parse(stored),
    counts: () => ({ writes, renders }),
  };
}

test('路线保存失败不改变路线、本命和选择，恢复后写入并可读回，重选不重复保存', () => {
  const f = fixture(),
    s = f.shell;
  Object.assign(s, { selectedTreasure: s.save.starter, treasurePage: 0, schoolFilter: 'orthodox' });
  const before = structuredClone(s.save),
    selected = s.selectedTreasure;
  dispatchAction(s, 'path', 'demonic');
  assert.deepEqual(s.save, before);
  assert.equal(s.selectedTreasure, selected);
  assert.equal(s.schoolFilter, 'orthodox');
  assert.equal(f.counts().renders, 0);
  f.allow();
  dispatchAction(s, 'path', 'demonic');
  assert.equal(s.save.path, 'demonic');
  assert.equal(s.selectedTreasure, s.save.starter);
  assert.equal(readSave(JSON.stringify(f.stored())).save.path, 'demonic');
  dispatchAction(s, 'path', 'demonic');
  assert.equal(f.counts().writes, 1);
});

for (const choice of ['iron', 'bellows', 'harbor', 'school', 'remember']) {
  test(`铁匠旧事${choice}失败不扣发资源或推进，重试仅保存一次`, () => {
    const f = fixture((save) => {
      if (['harbor', 'school', 'remember'].includes(choice)) {
        chooseSmithStory(save, 'iron');
        save.age = smithAt(save.mortal.population!, save.age).leavesAt;
      }
      if (choice === 'remember') {
        chooseSmithStory(save, 'harbor');
        save.age = smithAt(save.mortal.population!, save.age).leavesAt;
      }
    });
    const s = f.shell;
    Object.assign(s, { panel: 'town-event', townNpc: { id: 'smith' } });
    s.townScene.nearbyNpc = s.townNpc;
    const before = structuredClone(s.save);
    dispatchAction(s, 'smith-story', choice);
    assert.deepEqual(s.save, before);
    assert.equal(s.modal.innerHTML, 'original panel');
    assert.equal(f.counts().renders, 0);
    assert.ok(!f.toasts.some((text) => text.includes('旧钟') || text.includes('收下')));
    f.allow();
    dispatchAction(s, 'smith-story', choice);
    const expected = structuredClone(before);
    assert.equal(chooseSmithStory(expected, choice), true);
    assert.deepEqual(s.save, expected);
    assert.equal(f.stored().iron, expected.iron);
    assert.deepEqual(
      readSave(JSON.stringify(f.stored())).save.mortal.smithStory,
      expected.mortal.smithStory,
    );
    dispatchAction(s, 'smith-story', choice);
    assert.equal(f.counts().writes, 1);
  });
}

for (const id of HUMAN_STORY_IDS) {
  test(`人间旧事${id}相识、选择、读信均先保存；失败不改变原面板`, () => {
    const f = fixture(),
      s = f.shell;
    s.panel = 'town-event';
    s.townNpc = { id: HUMAN_STORIES[id].npcId };
    s.townScene.nearbyNpc = s.townNpc;
    const before = structuredClone(s.save);
    dispatchAction(s, 'human-story', `${id}:meet`);
    assert.deepEqual(s.save, before);
    assert.equal(f.counts().renders, 0);
    f.allow();
    dispatchAction(s, 'human-story', `${id}:meet`);
    s.save.age += HUMAN_STORIES[id].years;
    const choice = HUMAN_STORIES[id].choices[0].id;
    dispatchAction(s, 'human-story', `${id}:${choice}`);
    assert.equal(f.stored().mortal.humanStories[id].choice, choice);
    const read = fixture((save) => {
      chooseHumanStory(save, id, 'meet');
      save.age += HUMAN_STORIES[id].years;
      chooseHumanStory(save, id, choice);
      save.age = save.mortal.humanStories![id]!.endsAt;
      syncHumanStories(save);
    });
    read.shell.panel = 'human-journal';
    const unread = structuredClone(read.shell.save);
    dispatchAction(read.shell, 'human-memory', id);
    assert.deepEqual(read.shell.save, unread);
    assert.equal(read.shell.panel, 'human-journal');
    read.allow();
    dispatchAction(read.shell, 'human-memory', id);
    assert.equal(read.shell.panel, 'human-memory');
    assert.equal(read.stored().mortal.humanStories[id].read, true);
    assert.equal(readSave(JSON.stringify(read.stored())).save.mortal.humanStories![id]!.read, true);
  });
  test(`迟归时直接交谈${id}也先保存旧信，不留下空面板或未存已读状态`, () => {
    const f = fixture((save) => {
        chooseHumanStory(save, id, 'meet');
        save.age = save.mortal.humanStories![id]!.endsAt;
      }),
      s = f.shell;
    const npc = { id: HUMAN_STORIES[id].npcId, name: '故人之后', place: '青岚镇', role: '镇民' };
    s.townScene.nearbyNpc = npc;
    s.townEventContent = () => '';
    const before = structuredClone(s.save);
    showTownEvent(s, npc as any);
    assert.deepEqual(s.save, before);
    assert.equal(s.panel, '');
    assert.equal(s.townNpc, undefined);
    assert.equal(f.counts().renders, 0);
    f.allow();
    showTownEvent(s, npc as any);
    assert.equal(s.panel, 'town-event');
    assert.equal(f.stored().mortal.humanStories[id].read, true);
    assert.equal(f.counts().writes, 1);
  });
}

for (const target of ['father', 'letter'] as const) {
  test(`回故居${target}保存失败不记年表、不切换画面，成功才应用`, () => {
    const f = fixture((save) => {
        if (target === 'letter') save.age = 150;
      }),
      s = f.shell;
    s.hometownContent = hometownContent;
    const before = structuredClone(s.save);
    showHometown(s, target === 'father' ? 'father' : undefined);
    assert.deepEqual(s.save, before);
    assert.equal(s.panel, '');
    assert.equal(f.counts().renders, 0);
    f.allow();
    showHometown(s, target === 'father' ? 'father' : undefined);
    assert.equal(s.panel, 'hometown-home');
    assert.deepEqual(f.stored().chronicle, s.save.chronicle);
    if (target === 'letter') assert.equal(f.stored().mortal.hometown.letterFoundAt, 150);
    else {
      assert.ok(Object.hasOwn(f.stored().chronicle.milestones, 'home-reunion'));
      assert.match(f.panels.at(-1)!, /一别 3 年了/);
    }
  });
}

test('已发现家书保存失败不标已读，恢复后读取并保存；锁档不写入', () => {
  const f = fixture((save) => {
      save.age = 150;
      visitHometown(save);
    }),
    s = f.shell;
  const before = structuredClone(s.save);
  dispatchAction(s, 'hometown-letter');
  assert.deepEqual(s.save, before);
  assert.equal(s.panel, '');
  f.allow();
  dispatchAction(s, 'hometown-letter');
  assert.equal(f.stored().mortal.hometown.letterRead, true);
  assert.equal(s.panel, 'human-memory');
  s.saveLock = 'stale';
  assert.equal(
    commitSaveAction(s, (next) => {
      next.iron++;
      return true;
    }),
    false,
  );
  assert.equal(f.counts().writes, 1);
});

test('进入人间自动收尾在写入成功前不结算年岁和奖励，不切屏或替换未完对局', () => {
  const f = fixture((save) => {
      save.mortal.activity = { kind: 'herbs', remaining: 0.5, total: 0.5, sect: null };
    }),
    s = f.shell;
  s.pendingRun = new Game(s.save, 0, 0, () => 0.5);
  s.pendingRun.pause();
  const originalRun = s.pendingRun,
    before = structuredClone(s.save);
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  const source = main.slice(
    main.indexOf('function syncMortalSave(enter = false)'),
    main.indexOf('\nfunction syncMortalChange()'),
  );
  const ctx = createContext({
    ...s,
    commitSaveAction,
    syncHumanStories,
    resolveActivity,
    Game,
    releaseTownScene: () => {
      throw Error('render reached');
    },
  });
  runInContext(stripTypeScriptTypes(source), ctx);
  runInContext('renderMortal(true)', ctx);
  assert.deepEqual(s.save, before);
  assert.equal(ctx.pendingRun, originalRun);
  assert.equal(f.counts().writes, 0);
  f.allow();
  assert.throws(() => runInContext('renderMortal(true)', ctx), /render reached/);
  assert.equal(s.save.age, before.age + 0.5);
  assert.equal(s.save.stones, before.stones + 18);
  assert.equal(f.stored().mortal.activity, null);
  assert.notEqual(ctx.pendingRun, originalRun);
  assert.throws(() => runInContext('renderMortal(true)', ctx), /render reached/);
  assert.equal(f.counts().writes, 1);
});

test('启动收尾跨故人辞世时首写即包含奖励、旧信和年表，单次写入失败可原样重试', () => {
  const f = fixture((save) => {
      chooseHumanStory(save, 'friend', 'meet');
      save.age = save.mortal.humanStories!.friend!.endsAt - 0.5;
      save.mortal.activity = { kind: 'herbs', remaining: 0.5, total: 0.5, sect: null };
    }),
    s = f.shell;
  const before = structuredClone(s.save);
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  const source = main.slice(
    main.indexOf('function syncMortalSave(enter = false)'),
    main.indexOf('\nfunction renderMortal('),
  );
  const ctx = createContext({ ...s, commitSaveAction, syncHumanStories, resolveActivity, Game });
  runInContext(stripTypeScriptTypes(source), ctx);
  assert.equal(runInContext('syncMortalSave(true)', ctx), false);
  assert.deepEqual(s.save, before);
  f.allow();
  assert.equal(runInContext('syncMortalSave(true)', ctx), true);
  assert.equal(f.counts().writes, 1);
  assert.equal(f.stored().mortal.humanStories.friend.ended, true);
  assert.equal(f.stored().stones, before.stones + 18);
  assert.deepEqual(f.stored().chronicle, s.save.chronicle);
  assert.equal(runInContext('syncMortalSave(true)', ctx), true);
  assert.equal(f.counts().writes, 1);
  assert.match(main, /syncMortalSave\(true\);\ninitOffline\(\)/);
});

for (const entry of ['run', 'tribulation']) {
  test(`普通模式${entry}失败不入场或清空原对局，恢复后快照可读回`, () => {
    const f = fixture((save) => {
        if (entry === 'tribulation') {
          save.cultivation = 1e9;
          save.unlocked = 6;
          syncTribulationClock(save);
          save.age = save.nextTribulationAge;
        }
      }),
      s = f.shell;
    Object.assign(s, {
      Game,
      assetsReady: true,
      selectedStage: 0,
      difficulty: 0,
      ensureScene: () => true,
      clearInput() {},
      battleHud: { reset() {} },
      frameRate: { reset() {} },
      telemetry: { track() {} },
      lifeStats: () => ({}),
      renderHud() {},
      performance,
    });
    if (entry === 'tribulation') s.pendingRun = new Game(s.save, 0, 0, () => 0.5);
    const before = structuredClone(s.save),
      pending = s.pendingRun;
    const start = entry === 'run' ? startRun : beginTribulation;
    start(s);
    assert.deepEqual(s.save, before);
    assert.equal(s.game, null);
    assert.equal(s.pendingRun, pending);
    assert.equal(s.modal.innerHTML, 'original panel');
    f.allow();
    start(s);
    assert.ok(s.game);
    assert.equal(f.counts().writes, 1);
    assert.equal(s.game.save, s.save);
    const reloaded = importSave(JSON.stringify(f.stored()));
    assert.ok(reloaded.run);
    assert.equal(!!reloaded.run.tribulation, entry === 'tribulation');
    assert.equal(s.pendingRun, null);
  });
}

test('放弃旧历练另开一局时，失败保留原快照和确认页，成功才替换', () => {
  const f = fixture(),
    s = f.shell;
  Object.assign(s, {
    Game,
    assetsReady: true,
    selectedStage: 0,
    difficulty: 0,
    ensureScene: () => true,
    clearInput() {},
    battleHud: { reset() {} },
    frameRate: { reset() {} },
    telemetry: { track() {} },
    lifeStats: () => ({}),
    renderHud() {},
    mobileDisplay: { enter() {} },
    panel: 'restart',
  });
  s.startRun = (replace: boolean) => startRun(s, replace);
  const previous = (s.pendingRun = new Game(s.save, 0, 0, () => 0.5));
  dispatchAction(s, 'new-run');
  assert.equal(s.pendingRun, previous);
  assert.equal(s.game, null);
  assert.equal(s.panel, 'restart');
  assert.equal(s.modal.innerHTML, 'original panel');
  f.allow();
  dispatchAction(s, 'new-run');
  assert.equal(s.pendingRun, null);
  assert.ok(s.game);
  assert.equal(f.counts().writes, 1);
  assert.ok(importSave(JSON.stringify(f.stored())).run);
});

test('普通渡劫结算失败不增加劫印或丢失原局，重试仅结算一次且可刷新续原局', () => {
  let original: Game;
  const f = fixture((save) => {
      save.cultivation = 1e9;
      save.unlocked = 6;
      syncTribulationClock(save);
      save.age = save.nextTribulationAge;
      original = new Game(save, 0, 0, () => 0.5);
      save.tribulationReturn = original.snapshot();
    }),
    s = f.shell;
  Object.assign(s, {
    Game,
    completeTribulation,
    resolveActivity,
    syncHumanStories,
    damageReport: () => '',
    clearInput() {},
    telemetry: { track() {}, flush() {} },
    lifeStats: () => ({}),
    tribulationWonPanel: () => ['', '', ''],
  });
  const winning = (s.game = Game.createTribulation(s.save, original!));
  winning.state = 'won';
  const before = structuredClone(s.save);
  finishTribulation(s);
  assert.deepEqual(s.save, before);
  assert.equal(s.game, winning);
  assert.equal(s.pendingRun, null);
  assert.equal(s.panel, 'settlement-retry');
  assert.equal(f.counts().writes, 0);
  f.allow();
  finishTribulation(s);
  assert.equal(s.save.tribulations, before.tribulations + 1);
  assert.equal(s.game, null);
  assert.ok(s.pendingRun);
  assert.equal(s.pendingRun.save, s.save);
  assert.equal(s.save.tribulationReturn, null);
  assert.equal(importSave(JSON.stringify(f.stored())).run?.stage, 0);
  finishTribulation(s);
  assert.equal(f.counts().writes, 1);
});

for (const pending of [false, true]) {
  test(`导入未完活动含续局${pending}时首写即含收尾、旧信和当前静音，失败不动候选档`, () => {
    const incoming = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
    incoming.prologueSeen = incoming.hometownSeen = true;
    incoming.mortal.hometown!.stage = 'departed';
    incoming.mortal.population = { seed: 12345, since: 15 };
    incoming.age = 18;
    incoming.sound = true;
    chooseHumanStory(incoming, 'friend', 'meet');
    incoming.age = incoming.mortal.humanStories!.friend!.endsAt - 0.5;
    incoming.mortal.activity = { kind: 'herbs', remaining: 0.5, total: 0.5, sect: null };
    const run = pending ? new Game(incoming, 0, 0, () => 0.5) : null;
    const candidate = importSave(
      JSON.stringify({ ...incoming, activeRun: run?.snapshot() ?? null }),
    );
    const f = fixture(),
      s = f.shell;
    s.panel = 'import-confirm';
    s.pendingImport = candidate;
    Object.assign(s, {
      Game,
      resolveActivity,
      structuredClone,
      gameAudio: { sync() {} },
      returnLobby() {},
    });
    const before = structuredClone(s.save),
      candidateBefore = structuredClone(candidate.save);
    dispatchAction(s, 'confirm-import');
    assert.deepEqual(s.save, before);
    assert.deepEqual(candidate.save, candidateBefore);
    assert.equal(s.pendingImport, candidate);
    assert.equal(s.panel, 'import-confirm');
    assert.equal(s.modal.innerHTML, 'original panel');
    f.allow();
    dispatchAction(s, 'confirm-import');
    assert.equal(f.counts().writes, 1);
    assert.equal(f.stored().age, incoming.age + 0.5);
    assert.equal(f.stored().stones, incoming.stones + 18);
    assert.equal(f.stored().mortal.humanStories.friend.ended, true);
    assert.equal(f.stored().mortal.activity, null);
    assert.equal(f.stored().sound, before.sound);
    assert.equal(s.pendingImport, null);
    assert.equal(!!importSave(JSON.stringify(f.stored())).run, pending);
    assert.deepEqual(candidate.save, candidateBefore);
  });
}

for (const ended of ['epilogue', 'lifespan'] as const) {
  test(`导入${ended}封存档不补写旧事年表或任务奖励`, () => {
    const incoming = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
    incoming.prologueSeen = incoming.hometownSeen = true;
    incoming.mortal.hometown!.stage = 'departed';
    incoming.mortal.population = { seed: 12345, since: 15 };
    incoming.age = 18;
    chooseHumanStory(incoming, 'friend', 'meet');
    incoming.age = 100;
    if (ended === 'epilogue') {
      incoming.cultivation = 1e9;
      incoming.completed = [0, 1, 2, 3, 4, 5, 6];
      assert.equal(enterImmortalGate(incoming), true);
    } else incoming.pendingReincarnation = 'lifespan';
    const candidate = importSave(JSON.stringify({ ...incoming, activeRun: null }));
    const archived = structuredClone(candidate.save);
    const f = fixture(),
      s = f.shell;
    Object.assign(s, {
      panel: 'import-confirm',
      pendingImport: candidate,
      Game,
      resolveActivity,
      structuredClone,
      gameAudio: { sync() {} },
      returnLobby() {},
      renderJourneyFarewell() {},
    });
    f.allow();
    dispatchAction(s, 'confirm-import');
    assert.deepEqual(f.stored().chronicle, archived.chronicle);
    assert.deepEqual(f.stored().mortal.humanStories, archived.mortal.humanStories);
    assert.equal(f.stored().stones, archived.stones);
    assert.equal(f.counts().writes, 1);
    const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
    const source = main.slice(
      main.indexOf('function persist()'),
      main.indexOf('\nfunction refreshAutoplaySettings('),
    );
    let written: unknown;
    const ctx = createContext({
      save: s.save,
      saveLock: null,
      settlementRetryAt: 0,
      panel: '',
      game: null,
      pendingRun: null,
      storageAvailable: true,
      syncHumanStories,
      writeSave: (next: unknown) => {
        written = structuredClone(next);
      },
      toast() {},
    });
    runInContext(stripTypeScriptTypes(source), ctx);
    assert.equal(runInContext('persist()', ctx), true);
    assert.deepEqual((written as any).chronicle, archived.chronicle);
    assert.deepEqual((written as any).mortal.humanStories, archived.mortal.humanStories);
  });
}
