import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, Script } from 'node:vm';
import { settlementModal, updateSettlementNextButton } from '../src/lobby-ui.ts';
import { STAGES } from '../src/data.ts';
import { isExtremeLife } from '../src/life-mode.ts';
import { freshSave } from '../src/progress.ts';
import type { Game } from '../src/game.ts';

const source = readFileSync(new URL('../src/action-controller.ts', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');

function save(extreme: boolean) {
  const value = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  value.lifeMode = extreme ? 'extreme' : 'normal';
  value.unlocked = 3;
  return value;
}

function flow(extreme: boolean) {
  const match = source.match(
    /  if \(action === 'next' && shell\.game\) \{[^]*?\n  \}\n  if \(action === 'return'\)/,
  );
  assert.ok(match, 'action-controller 必须提供 next 分支');
  let clock = 1000;
  let renders = 0;
  let starts = 0;
  const armedCalls: boolean[] = [];
  const timers: { run: () => void; delay: number }[] = [];
  const state = save(extreme);
  const shell = {
    save: state,
    game: { state: 'won', stage: 1 } as Game,
    selectedStage: 1,
    STAGES,
    assetsReady: false,
    performance: { now: () => clock },
    nextConfirmUntil: 0,
    nextConfirmArmedAt: 0,
    tribulationDue: () => false,
    mobileDisplay: { enter: () => {} },
    modal: {},
    renderResult: () => renders++,
    startRun: () => starts++,
    window: {
      setTimeout: (run: () => void, delay: number) => timers.push({ run, delay }),
    },
  };
  const context = createContext({
    action: 'next',
    shell,
    STAGES,
    isExtremeLife,
    Math,
    updateSettlementNextButton: (_modal: unknown, armed: boolean) => armedCalls.push(armed),
  });
  const body = match[0].slice(0, match[0].lastIndexOf("  if (action === 'return')"));
  new Script(`function onNext() {${body}\n}`).runInContext(context);
  return {
    shell,
    timers,
    renders: () => renders,
    armed: () => armedCalls,
    starts: () => starts,
    click(at?: number) {
      if (at !== undefined) clock = at;
      new Script('onNext()').runInContext(context);
    },
    advance(ms: number) {
      clock += ms;
    },
  };
}

test('极限模式第一次 next 只进入确认态，按钮文案与类名同步', () => {
  const run = flow(true);
  run.click();
  assert.equal(run.starts(), 0);
  assert.deepEqual(run.armed(), [true]);
  assert.equal(run.renders(), 0, '确认态只改按钮，不重建结算页');
  assert.equal(run.shell.nextConfirmUntil, 4000);
  assert.equal(run.shell.nextConfirmArmedAt, 1000);
  assert.equal(run.timers.length, 1);
  assert.equal(run.timers[0].delay, 3000);

  const extremeSave = save(true);
  const game = {
    state: 'won',
    stage: 1,
    isFinalTrial: false,
    encounterName: '青岚竹海',
    path: 'orthodox',
    difficulty: 1,
    time: 120,
    kills: 8,
    level: 4,
    loot: { curios: {}, artifacts: [], medicines: {}, complete: false },
    bossCultivation: 0,
    damageDealt: 0,
    damageBySource: { bone: 0 },
    tribulation: 0,
    elapsedYears: 1,
    weapons: [],
    save: extremeSave,
  } as unknown as Game;
  const rewards = {
    stones: 1,
    iron: 1,
    cultivation: 1,
    cultivationRemaining: 0,
    ascensionCultivation: 0,
  };
  assert.match(settlementModal(extremeSave, game, rewards, '', false), /前往下一秘境/);
  const armed = settlementModal(extremeSave, game, rewards, '', true);
  assert.match(armed, /confirm-armed/);
  assert.match(armed, /确认出发 · 此战不可退离/);
  assert.doesNotMatch(armed, />前往下一秘境/);

  const normalArmed = settlementModal(save(false), game, rewards, '', true);
  assert.match(normalArmed, /data-action="next">前往下一秘境/);
  assert.doesNotMatch(normalArmed, /确认出发/);

  const lost = settlementModal(
    extremeSave,
    { ...game, state: 'lost', stage: 1 } as unknown as Game,
    rewards,
    '',
    true,
  );
  assert.match(lost, /data-action="retry">再入仙途/);
  assert.doesNotMatch(lost, /确认出发/);

  const final = settlementModal(
    extremeSave,
    { ...game, stage: 6, isFinalTrial: true } as unknown as Game,
    rewards,
    '',
    true,
  );
  assert.doesNotMatch(final, /data-action="next"/);
  assert.doesNotMatch(final, /确认出发/);
});

test('400 毫秒内第二次 next 被忽略，400 毫秒后进入下一秘境', () => {
  const run = flow(true);
  run.click();
  run.click(1399);
  assert.equal(run.starts(), 0);
  assert.deepEqual(run.armed(), [true]);
  assert.equal(run.renders(), 0);
  run.click(1400);
  assert.equal(run.starts(), 1);
  assert.equal(run.shell.nextConfirmUntil, 0);
  assert.equal(run.shell.nextConfirmArmedAt, 0);
});

test('确认态 3 秒无操作后恢复，再点仍需两步', () => {
  const run = flow(true);
  run.click();
  run.advance(3000);
  run.timers[0].run();
  assert.equal(run.shell.nextConfirmUntil, 0);
  assert.deepEqual(run.armed(), [true, false]);
  assert.equal(run.renders(), 0);
  run.click(4000);
  assert.equal(run.starts(), 0);
  assert.equal(run.shell.nextConfirmUntil, 7000);
  assert.deepEqual(run.armed(), [true, false, true]);
});

test('普通模式一次 next 直接进入下一秘境', () => {
  const run = flow(false);
  run.click();
  assert.equal(run.starts(), 1);
  assert.equal(run.shell.nextConfirmUntil, 0);
});

test('结算关闭、新局、读档与切换存档都会清除确认态', () => {
  assert.match(
    main,
    /set game\(next\) \{\n\s+game = next;\n\s+quitTracked = false;\n\s+nextConfirmUntil = 0;\n\s+nextConfirmArmedAt = 0;\n\s+\},/,
  );
  const clears = main.match(
    /game = pendingRun = null;\n\s+nextConfirmUntil = 0;\n\s+nextConfirmArmedAt = 0;/g,
  );
  assert.equal(clears?.length, 2);
});

test('按钮局部刷新只改确认态文案与类名', () => {
  const classes = new Set<string>();
  const button = {
    classList: {
      toggle: (name: string, on: boolean) => (on ? classes.add(name) : classes.delete(name)),
    },
    innerHTML: '',
  };
  const modal = { querySelector: () => button };
  updateSettlementNextButton(modal as unknown as ParentNode, true);
  assert.equal(button.innerHTML, '确认出发 · 此战不可退离');
  assert.ok(classes.has('confirm-armed'));
  updateSettlementNextButton(modal as unknown as ParentNode, false);
  assert.match(button.innerHTML, /^前往下一秘境 /);
  assert.ok(!classes.has('confirm-armed'));
});
