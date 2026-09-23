import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, Script } from 'node:vm';
import * as data from '../src/data.ts';
import {
  freshSave,
  parseSave,
  lifespanInfo,
  realmInfo,
  tribulationDue,
  enterImmortalGate,
  SAVE_KEY,
  type SaveData,
} from '../src/progress.ts';
import { departHometown, acceptHometownRoot } from '../src/hometown.ts';
import { syncHumanStories } from '../src/human-stories.ts';
import { sectDuesPending } from '../src/mortal.ts';

// 执行实际函数和调用入口，不导入 main 的游戏、音频、Worker 与页面初始化。
const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const flow = new Script(
  stripTypeScriptTypes(
    [
      'resetLifetime',
      'resumeHometown',
      'handleAction',
      'renderLobby',
      'renderPrologue',
      'persist',
      'endLifetime',
      'beginJourneyFarewell',
      'renderJourneyFarewell',
      'renderLifespanEnd',
      'renderTribulationForfeit',
      'renderTribulationPending',
      'finishDeparture',
    ]
      .map((name) => {
        const match = source.match(new RegExp(`^function ${name}\\([^]*?^\\}`, 'm'));
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
    style: { setProperty: noop },
    classList: { add: noop, remove: noop, toggle: noop },
  };
  const writes: string[] = [];
  const routes: string[] = [];
  const messages: string[] = [];
  const openingChoice = { checked: false };
  let rolls = 0;
  const context = createContext({
    ...data,
    save,
    freshSave: (root: data.SpiritRootId, elements: data.ElementId[], path: data.CultivationPath) =>
      freshSave(root, elements, path, () => 0),
    rollSpiritRoot: () => data.rollSpiritRoot(() => [0.1, 0.95, 0.2][rolls++ % 3]),
    rootElementsFor: (root: data.SpiritRootId) => data.rootElementsFor(root, [], () => 0),
    lifespanInfo,
    realmInfo,
    tribulationDue,
    departHometown,
    acceptHometownRoot,
    syncHumanStories,
    sectDuesPending,
    SAVE_KEY,
    structuredClone,
    localStorage: {
      setItem(key: string, value: string) {
        assert.equal(key, SAVE_KEY);
        writes.push(value);
      },
    },
    writes,
    routes,
    messages,
    openingChoice,
    document: { body: element },
    ui: { innerHTML: '', inert: false, querySelector: () => element },
    modal: {
      innerHTML: '',
      querySelector: (selector: string) =>
        selector === '#reincarnate-full-opening'
          ? context.modal.innerHTML.includes('id="reincarnate-full-opening"')
            ? openingChoice
            : null
          : element,
    },
    window: { clearTimeout: noop, matchMedia: () => ({ matches: false }) },
    clearInterval: noop,
    clearInput: noop,
    unlockAudio: noop,
    mobileDisplay: { leave: noop },
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
    panel: '',
    settled: false,
    selectedStage: 0,
    difficulty: 0,
    treasurePage: 0,
    selectedTreasure: save.starter,
    schoolFilter: 'all',
    bookTab: 'treasures',
    inTown: false,
    inMortalWorld: false,
    assetsReady: false,
    storageAvailable: true,
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
      routes.push(context.panel);
    },
    renderRootReveal() {
      context.panel = 'root-reveal';
      context.ui.inert = true;
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
  flow.runInContext(context);
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

test('命盘连续重抽均直接展示新命盘，不经过故乡选择或序章', () => {
  const save = freshSave();
  save.prologueSeen = true;
  departHometown(save);
  const context = harness(save);
  context.renderLobby();
  assert.equal(context.panel, 'root-reveal');
  context.routes.length = 0;
  for (const root of ['variant', 'none', 'dual', 'variant']) {
    context.handleAction('reroll-root');
    assertNewReveal(context);
    assert.equal(save.spiritRoot, root);
    assert.equal(save.rootElements.length, data.spiritRootInfo(root).count);
  }
  assert.deepEqual(context.routes, Array(4).fill('root-reveal'));
  assert.equal(context.writes.length, 4);
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
  context.handleAction('confirm-reincarnate');
  assertNewReveal(context);
  assert.deepEqual(context.routes, ['root-reveal']);
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
    assert.equal(save.stones, 0);
    assert.equal(save.cultivation, 0);
    assert.match(
      context.messages.at(-1),
      reason === 'lifespan' ? /前世止于.*享年/ : /前世止于天劫/,
    );
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
  assert.deepEqual(context.routes, ['root-reveal']);
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
  assert.deepEqual(context.routes, ['root-reveal']);
});
