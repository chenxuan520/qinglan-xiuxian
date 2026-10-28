import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, Script } from 'node:vm';
import ts from 'typescript';
import {
  freshSave,
  realmInfo,
  realmCost,
  readSave,
  endExtremeLife,
  tribulationDue,
  lifespanInfo,
} from '../src/progress.ts';
import { Game } from '../src/game.ts';
import { FINAL_TRIAL_STAGE, TREASURES } from '../src/data.ts';
import { grantCurio } from '../src/curio-data.ts';
import { recordChronicle, recordCurioAchievement } from '../src/chronicle.ts';
import { chronicleAchievements } from '../src/chronicle-achievements.ts';
import {
  journeyAppraisalFacts,
  localJourneyAppraisal,
  validJourneyAppraisalFacts,
} from '../src/journey-appraisal.ts';
import {
  journeyAppraisalMessages,
  validJourneyAppraisal,
} from '../src/journey-appraisal-ai-protocol.ts';
import { journeyCardData } from '../src/journey-card.ts';
import { journeyFarewellPanel } from '../src/opening-ui.ts';
import { isExtremeLife, minimumDifficulty } from '../src/life-mode.ts';
import { mountNpcChat, closeNpcChat, marketConversationIdentity } from '../src/npc-chat.ts';
import { marketCharacters, marketRealmLabel } from '../src/sect-market-data.ts';
import { beginSectMarketVisit } from '../src/sect-market.ts';
import { importSave, exportSave, restoreSavedRun } from '../src/save-transfer.ts';
import worker from '../workers/npc-ai/index.ts';
import { GAME_SITE_URL } from '../src/setting.ts';
import { syncHumanStories } from '../src/human-stories.ts';

function extract(file: string, name: string) {
  const text = readFileSync(new URL(file, import.meta.url), 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const node = source.statements.find((n) => ts.isFunctionDeclaration(n) && n.name?.text === name);
  assert.ok(node, name);
  return stripTypeScriptTypes(node.getText(source), { mode: 'transform' });
}
function fixture() {
  const save = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  save.age = 20;
  save.cultivation = 1;
  return save;
}

test('奇珍有缘与真实成就、留痕、本地评语和AI事实一致，售出奇物后仍是已达成经历', async () => {
  const save = fixture();
  for (const id of ['soul-wood', 'thunder-bamboo', 'jade-book']) grantCurio(save, id);
  recordCurioAchievement(save);
  save.curios.bag = {};
  const before = JSON.stringify(save);
  assert.equal(chronicleAchievements(save).find((a) => a.id === 'curio-three')?.achieved, true);
  assert.ok(journeyCardData(save).memories.some((m) => m.title === '奇珍有缘'));
  const facts = journeyAppraisalFacts(save, 'ongoing');
  assert.deepEqual(facts.feats, ['curio-three']);
  assert.equal(validJourneyAppraisalFacts(facts), true);
  for (let age = 20; age < 120; age++) {
    const appraisal = localJourneyAppraisal({ ...facts, age });
    assert.match(appraisal.detail, /三件(?:不同)?奇物|奇珍有缘/);
    assert.doesNotMatch(appraisal.detail, /成果.*待亲证/);
    assert.ok(appraisal.detail.length <= 80);
    assert.equal(validJourneyAppraisal(appraisal, { ...facts, age }), true);
  }
  const payload = JSON.parse(journeyAppraisalMessages(facts)[1].content);
  assert.deepEqual(payload.feats, ['curio-three']);
  const parts = {
    title: '奇珍有缘',
    ending: '此世仍在修行，问道的路还在山海间延伸。',
    cultivation: '三件不同奇物曾入手，皆是此身亲证的机缘。',
    ties: '',
  };
  const appraisal = { title: parts.title, detail: parts.ending + parts.cultivation };
  assert.equal(validJourneyAppraisal(appraisal, facts), true);
  assert.equal(validJourneyAppraisal(appraisal, { ...facts, feats: [] }), false);
  let input: any;
  const response = await worker.fetch(
    new Request('https://npc.example/journey-appraisal', {
      method: 'POST',
      headers: {
        Origin: new URL(GAME_SITE_URL).origin,
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '192.0.2.91',
      },
      body: JSON.stringify(facts),
    }),
    {
      ALLOWED_ORIGINS: new URL(GAME_SITE_URL).origin,
      NPC_LIMITER: { limit: async () => ({ success: true }) },
      AI: {
        run: async (_model: any, options: any) => {
          input = JSON.parse(options.messages[1].content);
          return { response: JSON.stringify(parts) };
        },
      },
    } as any,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(input.feats, ['curio-three']);
  assert.deepEqual(((await response.json()) as any).appraisal, appraisal);
  assert.equal(JSON.stringify(save), before);
});

function endingHarness(blocked = false) {
  const save = fixture();
  save.lifeMode = 'extreme';
  save.age = 99.999;
  const game = new Game(save, 0, 1, () => 0.5);
  let stored = JSON.stringify({ ...save, activeRun: game.snapshot() });
  let panel: any;
  const context: any = {
    save,
    game,
    pendingRun: null,
    structuredClone,
    realmInfo,
    FINAL_TRIAL_STAGE,
    tribulationDue,
    isExtremeLife,
    endExtremeLife,
    previousState: 'playing',
    clickDestination: null,
    keys: new Set(),
    touchInput: { x: 0, y: 0 },
    computeManualInput: () => ({ x: 0, y: 0 }),
    clearInput() {},
    writeSave(next: any, active: any) {
      if (blocked) throw Error('quota');
      stored = JSON.stringify({ ...next, activeRun: active?.snapshot() ?? null });
    },
    persist() {
      if (blocked) return false;
      stored = JSON.stringify({ ...save, activeRun: context.game?.snapshot() ?? null });
      return true;
    },
    ambushScene: null,
    leaveTown() {},
    inMortalWorld: false,
    settled: false,
    saveLock: null,
    panelFrame(...parts: any[]) {
      panel = parts;
    },
    modal: { querySelector: () => null },
    toast() {},
    renderJourneyFarewell(reason: any) {
      panel = journeyFarewellPanel(reason);
    },
  };
  createContext(context);
  new Script(
    extract('../src/main.ts', 'beginJourneyFarewell') +
      '\n' +
      extract('../src/main.ts', 'simulate') +
      '\n' +
      extract('../src/main.ts', 'finishRun'),
  ).runInContext(context);
  return {
    context,
    save,
    stored: () => stored,
    panel: () => panel,
    unblock() {
      blocked = false;
    },
  };
}
function assertLifespan(save: ReturnType<typeof freshSave>) {
  assert.equal(save.pendingReincarnation, 'lifespan');
  assert.equal(save.chronicle.milestones['extreme-death'], undefined);
  assert.equal(save.chronicle.entries.filter((e) => e.title === '此世寿终').length, 1);
  assert.ok(!save.chronicle.entries.some((e) => /战败身陨|未完便离开/.test(e.detail)));
  const card = journeyCardData(save);
  assert.equal(card.ending, 'lifespan');
  assert.match(card.appraisal.detail, /寿元|岁月|长生未得/);
  assert.doesNotMatch(card.appraisal.detail, /险境|险途|战败/);
}
test('极限自然寿尽通过实际模拟和保存路由记寿终，刷新导入与落幕留影一致', () => {
  const h = endingHarness();
  h.context.simulate(0.05, 0);
  assert.equal(h.save.age, 100);
  assert.equal(h.context.game, null);
  assertLifespan(h.save);
  assert.equal(h.panel()[0], '此世寿终');
  assertLifespan(readSave(h.stored()).save);
  const restored = importSave(exportSave(h.save, null));
  assertLifespan(restored.save);
  assert.equal(restored.run, null);
});
test('极限寿尽写入失败保持未结状态，真实finishRun重试成功后仍是寿终且不重复记录', () => {
  const h = endingHarness(true),
    before = h.stored();
  h.context.simulate(0.05, 0);
  assert.equal(h.save.pendingReincarnation, null);
  assert.equal(h.stored(), before);
  assert.equal(h.context.panel, 'extreme-death-retry');
  assert.match(h.panel()[2], /重试保存/);
  h.unblock();
  h.context.finishRun();
  assertLifespan(h.save);
  const after = h.stored();
  h.context.finishRun();
  assert.equal(h.stored(), after);
  assertLifespan(readSave(after).save);
});
test('旧极限寿尽误记只在有限寿元耗尽时校正，正常战败与未完离开保持原因', () => {
  for (const reason of ['defeat', 'interrupted'] as const) {
    const old = fixture();
    old.lifeMode = 'extreme';
    old.age = 100;
    old.pendingReincarnation = 'extreme';
    recordChronicle(
      old,
      '大道无情，生死有命',
      reason === 'defeat'
        ? '极限修行中战败身陨，这一世的问道之路至此落幕。'
        : '极限战斗未完便离开，此世问道之路随之落幕。',
      'extreme-death',
    );
    const restored = readSave(JSON.stringify(old));
    assert.equal(restored.status, 'ok');
    assertLifespan(restored.save);
    assert.deepEqual(readSave(JSON.stringify(restored.save)).save, restored.save);
    assertLifespan(importSave(exportSave(old, null)).save);
    const actual = fixture();
    actual.lifeMode = 'extreme';
    endExtremeLife(actual, reason);
    const before = JSON.stringify(actual);
    assert.equal(readSave(before).save.pendingReincarnation, 'extreme');
    assert.deepEqual(readSave(before).save.chronicle, actual.chronicle);
  }
  const interrupted = fixture();
  interrupted.lifeMode = 'extreme';
  interrupted.age = 100;
  assert.equal(restoreSavedRun(interrupted, new Game(interrupted, 0, 1).snapshot()), null);
  assertLifespan(interrupted);
});

function chatHost() {
  const node = () => ({
    textContent: '',
    children: [] as any[],
    append(...children: any[]) {
      this.children.push(...children);
    },
  });
  const log = {
    ...node(),
    replaceChildren() {
      this.children = [];
    },
    setAttribute() {},
    scrollHeight: 0,
    scrollTop: 0,
  };
  const input = { value: '', disabled: false, focus() {} };
  const button = { disabled: false };
  const status = { textContent: '' };
  const form: any = {
    submit: null,
    querySelector: (s: string) => (s === 'input' ? input : button),
    addEventListener(_e: string, handler: any) {
      this.submit = handler;
    },
  };
  const host = {
    isConnected: true,
    log,
    input,
    form,
    querySelector: (s: string) => ({ '.npc-chat-log': log, form, '.npc-chat-status': status })[s],
  };
  return host;
}
const chatText = (h: ReturnType<typeof chatHost>) =>
  h.log.children.map((p) => p.children.map((n: any) => n.textContent).join('')).join('\n');
test('实际导入较早低阶存档后只剔除越界的旧回复，合法聊天保留且新请求历史不泄露', async (t) => {
  const originalDocument = globalThis.document;
  const node = () => ({
    textContent: '',
    children: [] as any[],
    append(...children: any[]) {
      this.children.push(...children);
    },
  });
  globalThis.document = {
    createElement: node,
    createTextNode: (textContent: string) => ({ textContent }),
  } as any;
  t.after(() => {
    closeNpcChat();
    if (originalDocument) globalThis.document = originalDocument;
    else delete (globalThis as any).document;
  });
  const low = fixture();
  low.mortal.population = { seed: 1, since: 15 };
  beginSectMarketVisit(low);
  const npc = marketCharacters(low.mortal.population, low.mortal.sectMarket!).find(
    (n) => n.id === 'market-alchemist',
  )!;
  assert.equal(npc.realmIndex, 1);
  const backup = exportSave(low, null);
  const high = structuredClone(low);
  high.cultivation = [0, 1, 2].reduce((n, i) => n + realmCost(i), 0);
  const calls: any[] = [];
  t.mock.method(globalThis, 'fetch', async (_url: any, options: any) => {
    const request = JSON.parse(options.body);
    calls.push(request);
    return Response.json({
      reply: request.message.includes('境界')
        ? '我如今修至筑基，你我同一大境界。'
        : '炉火正旺，道友慢行。',
    });
  });
  const first = chatHost();
  mountNpcChat(first as any, high, npc);
  await new Promise(setImmediate);
  first.input.value = '你现在是什么境界？';
  first.form.submit({ preventDefault() {} });
  await new Promise(setImmediate);
  assert.match(chatText(first), /筑基/);
  const identity = marketConversationIdentity(high, npc.id);
  closeNpcChat();
  const shell: any = {
    save: high,
    game: null,
    panel: 'import-confirm',
    pendingImport: importSave(backup),
    structuredClone,
    syncHumanStories,
    writeSave() {},
    resolveActivity() {},
    Game,
    storageAvailable: true,
    persist() {
      return true;
    },
    catalogTreasures: TREASURES,
    gameAudio: { sync() {} },
    returnLobby() {},
    lifespanInfo,
    tribulationDue,
    renderPrologue() {},
    toast() {},
  };
  const context = createContext({ minimumDifficulty });
  new Script(extract('../src/action-controller.ts', 'handleSaveTransfer')).runInContext(context);
  assert.equal((context as any).handleSaveTransfer(shell, 'confirm-import'), true);
  assert.equal(marketConversationIdentity(high, npc.id), identity);
  assert.equal(marketRealmLabel(npc, realmInfo(high.cultivation).index), '修为难测');
  const after = JSON.stringify(high),
    reopened = chatHost();
  mountNpcChat(reopened as any, high, npc);
  await new Promise(setImmediate);
  assert.match(chatText(reopened), /炉火正旺/);
  assert.doesNotMatch(chatText(reopened), /筑基|同一大境界/);
  reopened.input.value = '近况如何？';
  reopened.form.submit({ preventDefault() {} });
  await new Promise(setImmediate);
  assert.ok(calls.at(-1).history.some((m: any) => m.content === '炉火正旺，道友慢行。'));
  assert.ok(calls.at(-1).history.every((m: any) => !m.content.includes('筑基')));
  assert.equal(JSON.stringify(high), after);
});
