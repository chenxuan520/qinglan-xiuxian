import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, Script } from 'node:vm';
import { freshSave, lifespanInfo, tribulationDue } from '../src/progress.ts';
import { LETTER_REMINDER_TEXT, LetterReminder } from '../src/letter-reminder.ts';

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const script = new Script(
  stripTypeScriptTypes(
    ['toast', 'showLetterReminder', 'hideLetterReminder', 'panelFrame', 'frame']
      .map((name) => {
        const source = main.match(new RegExp(`^function ${name}\\([^]*?^\\}`, 'm'));
        assert.ok(source, name);
        return source[0];
      })
      .join('\n'),
  ),
);

function harness() {
  const save = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  save.age = 20;
  save.prologueSeen = save.hometownSeen = true;
  const home = save.mortal.hometown!;
  home.stage = 'departed';
  for (const parent of Object.values(home.parents)) parent.diesAt = parent.ageAtStart + 1;
  const attributes = new Set<string>();
  const classes = new Set<string>();
  let nextTimer = 0;
  const cancelled: number[] = [];
  const element = {
    hidden: false,
    textContent: '',
    hasAttribute: (name: string) => attributes.has(name),
    setAttribute: (name: string) => attributes.add(name),
    removeAttribute: (name: string) => attributes.delete(name),
    toggleAttribute(name: string, value: boolean) {
      if (value) attributes.add(name);
      else attributes.delete(name);
    },
    classList: {
      add: (name: string) => classes.add(name),
      remove: (name: string) => classes.delete(name),
      contains: (name: string) => classes.has(name),
    },
  };
  const context = createContext({
    save,
    lifespanInfo,
    tribulationDue,
    toastElement: element,
    toastTimer: 0,
    window: { setTimeout: () => ++nextTimer, clearTimeout: (id: number) => cancelled.push(id) },
    syncChronicleIndicators() {},
    requestAnimationFrame() {},
    hideAchievementNotice() {},
    game: null,
    panel: '',
    ambushScene: null,
    saveLock: null,
    marketEventSource: { current: null },
    guideSource: { current: null },
    chronicleSource: { flush() {} },
    letterReminder: new LetterReminder(),
    inMortalWorld: false,
    sceneLoading: false,
    assetsReady: true,
    homeVisible: true,
    focused: true,
    dues: false,
    document: { hidden: false, hasFocus: () => context.focused },
    ui: { querySelector: () => (context.homeVisible ? {} : null) },
    sectDuesPending: () => context.dues,
    rankingOffer: null,
    rankingReady: () => false,
    showRankingOffer() {},
    rankingPanel: null,
    sceneFlow: { panelFrame() {} },
    shellBindings: () => context,
    frameRate: { sample() {} },
    syncScreenAwake() {},
    modal: { querySelector: () => null },
    renderSaveLock() {},
    townScene: null,
    marketScene: null,
    tickMortal() {},
    tick() {},
  });
  script.runInContext(context);
  context.letterReminder.queue();
  context.frame(1);
  assert.equal(element.textContent, LETTER_REMINDER_TEXT);
  assert.equal(attributes.has('data-letter-reminder'), true);
  assert.equal(classes.has('visible'), true);
  return { context, element, attributes, classes, cancelled };
}

test('实际首页先显示捎话，进入战斗、暂停、面板或非首页后只移除这条提醒', () => {
  const cases = [
    (c: any) => {
      c.game = { state: 'playing' };
    },
    (c: any) => {
      c.game = { state: 'paused' };
    },
    (c: any) => {
      c.panel = 'settings';
    },
    (c: any) => {
      c.inMortalWorld = true;
    },
    (c: any) => {
      c.homeVisible = false;
    },
    (c: any) => {
      c.focused = false;
    },
    (c: any) => {
      c.document.hidden = true;
    },
    (c: any) => {
      c.sceneLoading = true;
    },
    (c: any) => {
      c.assetsReady = false;
    },
    (c: any) => {
      c.dues = true;
    },
    (c: any) => {
      c.guideSource.current = { tourActive: true };
    },
    (c: any) => {
      c.saveLock = 'stale';
    },
  ];
  for (const enter of cases) {
    const h = harness();
    enter(h.context);
    h.context.frame(2);
    assert.equal(h.classes.has('visible'), false);
    assert.equal(h.element.hidden, true);
    assert.equal(h.attributes.has('data-letter-reminder'), false);
    assert.equal(h.cancelled.at(-1), 1, '清除这条提醒的原计时器');
  }
});

test('实际打开面板同步清除捎话；其他普通toast替换后不受捎话隐藏逻辑影响', () => {
  const h = harness();
  h.context.panel = 'settings';
  h.context.panelFrame('设置', '游戏选项', 'body');
  assert.equal(h.classes.has('visible'), false);
  const other = harness();
  other.context.toast('山中一程，人间已过 3 年。', 3000);
  assert.equal(other.attributes.has('data-letter-reminder'), false);
  const cancelledBefore = other.cancelled.length;
  other.context.game = { state: 'paused' };
  other.context.frame(2);
  assert.equal(other.element.textContent, '山中一程，人间已过 3 年。');
  assert.equal(other.classes.has('visible'), true);
  assert.equal(other.element.hidden, false);
  assert.equal(other.cancelled.length, cancelledBefore);
});
