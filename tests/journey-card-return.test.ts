import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, Script } from 'node:vm';
import { dispatchAction, type ActionShell } from '../src/action-controller.ts';
import type { PanelLocation } from '../src/panel-host.ts';
import { freshSave, lifespanInfo, tribulationDue, enterImmortalGate } from '../src/progress.ts';

// 与现有流程测试相同，执行 main 的实际函数，隔离游戏、音频与 Worker 初始化。
const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const match = source.match(/^async function renderJourneyCard\([^]*?^\}/m);
assert.ok(match);
const render = new Script(stripTypeScriptTypes(match[0]));

function harness() {
  const save = freshSave();
  save.prologueSeen = true;
  save.mortal.hometown!.stage = 'departed';
  const restored: PanelLocation[] = [];
  const location: PanelLocation = {
    name: 'chronicle',
    scroll: 1437,
    action: 'journey-card',
    openDetails: ['power-details', 'power-origin-realm'],
  };
  const context = createContext({
    save,
    panel: 'chronicle',
    journeyCardReturn: 'chronicle',
    journeyCardReturnLocation: null,
    game: null,
    pendingRun: null,
    inMortalWorld: false,
    lifespanInfo,
    tribulationDue,
    rememberPanel: () => structuredClone(location),
    journeyCardPanel: { show: async () => {}, cancel() {} },
    medicinePanel: { handle: () => false },
    restorePanel(value: PanelLocation) {
      restored.push(value);
      context.panel = value.name;
    },
    showPanel(name: string) {
      context.panel = name;
    },
    renderEpilogue() {
      context.panel = 'epilogue';
    },
    renderJourneyFarewell(reason: string) {
      context.panel = `${reason}-farewell`;
    },
  });
  render.runInContext(context);
  return {
    context,
    location,
    restored,
    close: () => dispatchAction(context as ActionShell, 'close'),
  };
}

test('履历留影返回恢复完整位置，重新生成保留原位置，重开履历按新位置返回', async () => {
  const { context, location, restored, close } = harness();
  const before = JSON.stringify(context.save);
  await context.renderJourneyCard();
  assert.equal(context.panel, 'journey-card');
  location.scroll = 0;
  await context.renderJourneyCard();
  close();
  assert.equal(context.panel, 'chronicle');
  assert.deepEqual(restored[0], { ...location, scroll: 1437 });
  assert.equal(context.journeyCardReturnLocation, null);
  assert.equal(JSON.stringify(context.save), before);

  location.scroll = 2379;
  location.openDetails = [];
  await context.renderJourneyCard();
  close();
  assert.deepEqual(restored[1], location);
  assert.equal(context.journeyCardReturnLocation, null);
  assert.equal(JSON.stringify(context.save), before);
});

test('留影无历史位置时返回履历，告别与终章不复用旧履历位置', async () => {
  const { context, location, restored, close } = harness();
  context.panel = 'journey-card';
  close();
  assert.equal(context.panel, 'chronicle');
  assert.equal(restored.length, 0);

  for (const reason of ['lifespan', 'tribulation', 'ambush', 'extreme'] as const) {
    context.save.pendingReincarnation = reason;
    context.panel = `${reason}-farewell`;
    context.journeyCardReturnLocation = location;
    await context.renderJourneyCard();
    assert.equal(context.journeyCardReturnLocation, null);
    close();
    assert.equal(context.panel, `${reason}-farewell`);
    assert.equal(restored.length, 0);
  }
  context.save.pendingReincarnation = null;
  context.save.cultivation = 1e9;
  context.save.completed = [0, 1, 2, 3, 4, 5, 6];
  assert.equal(enterImmortalGate(context.save), true);
  context.panel = 'epilogue';
  context.journeyCardReturnLocation = location;
  await context.renderJourneyCard();
  assert.equal(context.journeyCardReturnLocation, null);
  close();
  assert.equal(context.panel, 'epilogue');
  assert.equal(restored.length, 0);
});
