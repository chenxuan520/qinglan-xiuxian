import * as marketEventUi from '../src/market-event-ui.ts';
import test from 'node:test';
import { MedicinePanel } from '../src/medicine-panel.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, Script } from 'node:vm';
import { freshSave, SAVE_KEY, lifespanInfo, tribulationDue } from '../src/progress.ts';
import { beginSectMarketVisit } from '../src/sect-market.ts';
import { marketCultivators } from '../src/sect-market-data.ts';
import { marketFellowContent } from '../src/market-fellow-ui.ts';
import {
  marketFellowCharacter,
  meetMarketFellow,
  chooseMarketFellow,
} from '../src/market-fellow.ts';
import { Game } from '../src/game.ts';
import { dispatchAction } from '../src/action-controller.ts';

// 执行实际主界面路由及写档函数，仅替换浏览器叶节点；不复制交谈的保存逻辑。
const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const script = new Script(
  stripTypeScriptTypes(
    ['shellBindings', 'handleAction', 'showMarketEvent', 'writeSave', 'lockStaleSave']
      .map((name) => {
        const match = source.match(new RegExp(`^function ${name}\\([^]*?^\\}`, 'm'));
        assert.ok(match, name);
        return match[0];
      })
      .join('\n'),
  ),
);

function harness(phase: 'first' | 'reunion' | 'choice' | 'read' = 'first', pending = false) {
  const save = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  save.cultivation = 1;
  save.age = 30;
  save.prologueSeen = save.hometownSeen = true;
  save.mortal.hometown!.stage = 'departed';
  save.mortal.population = { seed: 12345, since: 15 };
  assert.ok(beginSectMarketVisit(save));
  if (phase !== 'first') {
    assert.ok(meetMarketFellow(save));
    save.age = 35;
  }
  if (phase === 'choice' || phase === 'read') assert.ok(meetMarketFellow(save));
  if (phase === 'read') {
    assert.ok(chooseMarketFellow(save, 'stay', save.mortal.sectMarket!.visit));
    save.age = 45;
  }
  const npc = marketFellowCharacter(save)!;
  const run = pending ? new Game(save, 0, 0, () => 0.5) : null;
  run?.pause();
  let stored = JSON.stringify({ ...save, activeRun: run?.snapshot() ?? null });
  let html = '',
    fail = false,
    disabled = false,
    omitButton = false;
  let writes = 0,
    panels = 0,
    aiMounts = 0,
    locks = 0;
  const logs: string[] = [];
  const context = createContext({
    marketEventSource: { current: marketEventUi },
    dispatchAction,
    save,
    SAVE_KEY,
    structuredClone,
    lifespanInfo,
    tribulationDue,
    inMortalWorld: true,
    inMarket: true,
    inTown: false,
    game: null,
    pendingRun: run,
    marketNpc: null,
    marketScene: { nearbyNpc: npc },
    panel: '',
    saveLock: null,
    lastSaveText: stored,
    meetMarketFellow,
    chooseMarketFellow,
    marketFellowCharacter,
    marketFellowContent,
    clearInput: () => {},
    renderSaveLock: () => {
      locks++;
      context.panel = 'save-lock';
    },
    panelFrame: (_name: string, _subtitle: string, content: string) => {
      panels++;
      html = content;
    },
    sectMarketEventContent: () => '<div class="npc-dialogue"></div>',
    mountNpcChat: () => {
      aiMounts++;
    },
    toast: (message: string) => logs.push(message),
    modal: {
      querySelector(selector: string) {
        if (selector === '.npc-dialogue') return {};
        if (omitButton) return null;
        const action = selector.match(/data-action="([^"]+)"/)?.[1];
        const id = selector.match(/data-id="([^"]+)"/)?.[1];
        const attrs = [...html.matchAll(/<button\b[^>]*>/g)].find(
          ([button]) =>
            button.includes(`data-action="${action}"`) && button.includes(`data-id="${id}"`),
        )?.[0];
        return attrs
          ? {
              dataset: { visit: attrs.match(/data-visit="(\d+)"/)?.[1] },
              disabled: disabled || attrs.includes('disabled'),
            }
          : null;
      },
    },
    localStorage: {
      getItem: () => stored,
      setItem(_key: string, value: string) {
        if (fail) throw Error('storage fail');
        writes++;
        stored = value;
      },
    },
  });
  script.runInContext(context);
  context.medicinePanel = new MedicinePanel(save, context.modal, {
    show: () => {},
    render: () => {},
    refresh: () => {},
    commit: () => true,
    starterChanged: () => {},
    toast: () => {},
  });
  return {
    save,
    context,
    npc,
    run,
    logs,
    stored: () => JSON.parse(stored),
    writes: () => writes,
    panels: () => panels,
    aiMounts: () => aiMounts,
    locks: () => locks,
    html: () => html,
    open: () => context.showMarketEvent(npc),
    choose: (choice: string) => context.handleAction('sect-market-fellow', choice),
    fail: (value = true) => {
      fail = value;
    },
    disabled: () => {
      disabled = true;
    },
    omitButton: () => {
      omitButton = true;
    },
    stale: () => {
      stored = JSON.stringify({ ...save, stones: 5 });
    },
    syncFixture: () => {
      stored = JSON.stringify({ ...save, activeRun: run?.snapshot() ?? null });
      context.lastSaveText = stored;
    },
  };
}

test('实际首逢和第二逢先写档后打开；保存失败可以重试，跨窗口更新停止写入', () => {
  for (const phase of ['first', 'reunion'] as const) {
    for (const result of ['success', 'failure', 'stale'] as const) {
      const h = harness(phase);
      const before = JSON.stringify(h.save);
      if (result === 'failure') h.fail();
      if (result === 'stale') h.stale();
      h.open();
      if (result === 'success') {
        assert.equal(h.writes(), 1);
        assert.equal(h.panels(), 1);
        assert.deepEqual(h.stored().mortal.marketFellow, h.save.mortal.marketFellow);
        assert.deepEqual(h.stored().chronicle, h.save.chronicle);
        assert.equal(h.save.mortal.marketFellow!.metAt, 30);
        assert.equal(h.save.mortal.marketFellow!.reunionAt, phase === 'first' ? null : 35);
        h.open();
        assert.equal(h.writes(), 1, '反复交谈不能重复记下相逢');
      } else {
        assert.equal(JSON.stringify(h.save), before);
        assert.equal(h.writes(), 0);
        assert.equal(h.panels(), 0, '未存下相逢时不能显示已经推进的剧情');
        if (result === 'failure') {
          assert.ok(h.logs.some((line) => line.includes('保存')));
          h.fail(false);
          h.open();
          assert.equal(h.writes(), 1);
          assert.equal(h.panels(), 1);
        } else {
          assert.equal(h.context.saveLock, 'stale');
          assert.equal(h.locks(), 1);
          assert.equal(h.stored().stones, 5, '不得覆盖另一窗口的存档');
        }
      }
      assert.equal(h.aiMounts(), 0, '固定同道使用自己的经历，不能挂随机访客的 AI 身份');
    }
  }
});

test('真实选择与读信按钮原子保存；失败不应用或换页，重试只提交一次', () => {
  for (const choice of ['stay', 'travel', 'read'] as const) {
    for (const result of ['success', 'failure', 'stale'] as const) {
      const h = harness(choice === 'read' ? 'read' : 'choice');
      h.open();
      const before = JSON.stringify(h.save);
      const html = h.html();
      if (result === 'failure') h.fail();
      if (result === 'stale') h.stale();
      h.choose(choice);
      if (result !== 'success') {
        assert.equal(JSON.stringify(h.save), before);
        assert.equal(h.writes(), 0);
        assert.equal(h.panels(), 1);
        assert.equal(h.html(), html);
        if (result === 'stale') {
          assert.equal(h.context.saveLock, 'stale');
          h.choose(choice);
          assert.equal(h.writes(), 0);
          assert.equal(h.stored().stones, 5);
          continue;
        }
        assert.ok(h.logs.some((line) => line.includes('保存')));
        h.fail(false);
        h.choose(choice);
      }
      assert.equal(h.writes(), 1);
      assert.equal(h.panels(), 2);
      const state = h.save.mortal.marketFellow!;
      assert.equal(state.choice, choice === 'read' ? 'stay' : choice);
      assert.equal(state.chosenAt, 35);
      assert.equal(state.completedAt, choice === 'read' ? 45 : null);
      assert.equal(h.save.age, choice === 'read' ? 45 : 35, '交谈不能额外扣龄');
      assert.deepEqual(h.stored().mortal.marketFellow, state);
      assert.deepEqual(h.stored().chronicle, h.save.chronicle);
      const committed = JSON.stringify(h.save);
      h.choose(choice);
      h.choose(choice === 'stay' ? 'travel' : 'stay');
      assert.equal(JSON.stringify(h.save), committed, '双击和旧分支不能再改已选结果');
      assert.equal(h.writes(), 1);
      assert.equal(h.aiMounts(), 0);
    }
  }
});

test('实际主路由拒绝过期场次、远离人物、错误面板及缺失或禁用的按钮', () => {
  for (const reason of [
    'visit',
    'distance',
    'otherNpc',
    'panel',
    'world',
    'market',
    'missing',
    'disabled',
    'invalid',
  ] as const) {
    const h = harness('choice');
    h.open();
    if (reason === 'visit') {
      assert.ok(beginSectMarketVisit(h.save));
      h.syncFixture();
    } else if (reason === 'distance') h.context.marketScene.nearbyNpc = null;
    else if (reason === 'otherNpc') h.context.marketNpc = { id: 'market-alchemist' };
    else if (reason === 'panel') h.context.panel = 'sect-auction';
    else if (reason === 'world') h.context.inMortalWorld = false;
    else if (reason === 'market') h.context.inMarket = false;
    else if (reason === 'missing') h.omitButton();
    else if (reason === 'disabled') h.disabled();
    const before = JSON.stringify(h.save);
    h.choose(reason === 'invalid' ? 'unknown' : 'stay');
    assert.equal(JSON.stringify(h.save), before, reason);
    assert.equal(h.writes(), 0, reason);
    assert.equal(h.panels(), 1, reason);
  }
  const absent = harness();
  absent.context.marketScene.nearbyNpc = null;
  absent.open();
  assert.equal(absent.writes(), 0);
  assert.equal(absent.panels(), 0);
});

test('未完历练在首逢、选择和读信后保留同一份可恢复快照；普通来客仍挂原对话', () => {
  for (const phase of ['first', 'choice', 'read'] as const) {
    const h = harness(phase, true);
    const snapshot = h.run!.snapshot();
    h.open();
    if (phase !== 'first') h.choose(phase === 'read' ? 'read' : 'travel');
    assert.equal(h.writes(), 1);
    assert.deepEqual(h.stored().activeRun, JSON.parse(JSON.stringify(snapshot)));
    assert.deepEqual(h.run!.snapshot(), snapshot);
    assert.ok(Game.restore(h.save, snapshot));
    const normal = marketCultivators(h.save.mortal.population!, h.save.mortal.sectMarket!)[0];
    h.context.marketScene.nearbyNpc = normal;
    h.context.showMarketEvent(normal);
    assert.equal(h.aiMounts(), 1);
    assert.equal(h.writes(), 1);
  }
});
