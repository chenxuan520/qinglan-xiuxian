import { enterNextMarketBatch } from './market-fixture.ts';
import * as marketEventUi from '../src/market-event-ui.ts';
import { homeTownEntrance } from '../src/home-town.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, Script } from 'node:vm';
import { freshSave, SAVE_KEY, lifespanInfo, tribulationDue } from '../src/progress.ts';
import {
  debateMarket,
  marketRequest,
  fulfillMarketRequest,
  marketOpportunity,
  chooseMarketOpportunity,
  settleMarketAmbush,
  prepareMarketSocial,
} from '../src/market-social.ts';
import {
  marketCultivators,
  isMarketCultivatorId,
  MARKET_CULTIVATORS,
} from '../src/sect-market-data.ts';
import { debateRecipeOffer } from '../src/market-debate.ts';
import { MEDICINES } from '../src/medicine-data.ts';
import { marketSocialContent } from '../src/market-social-ui.ts';
import { townStatus } from '../src/mortal-ui.ts';
import {
  executeMarketSocial,
  marketAmbushRecoveryPanel,
  marketAmbushPanel,
} from '../src/town-host.ts';
import { dispatchAction } from '../src/action-controller.ts';
import { Game } from '../src/game.ts';
import { FINAL_TRIAL_STAGE, MAX_REVIVES } from '../src/data.ts';
import { MarketAmbushDuel } from '../src/market-ambush.ts';
const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const ambushSource = readFileSync(new URL('../src/market-ambush-flow.ts', import.meta.url), 'utf8');
const script = new Script(
  stripTypeScriptTypes(
    [
      ...[
        'shellBindings',
        'handleAction',
        'writeSave',
        'lockStaleSave',
        'refreshMarketActivities',
        'renderLobby',
      ].map((name) => {
        const match = source.match(new RegExp(`^function ${name}\\([^]*?^\\}`, 'm'));
        assert.ok(match);
        return match[0];
      }),
      ...[
        'commit',
        'checkpoint',
        'hideClose',
        'showDefeat',
        'mountAmbush',
        'finishAmbush',
        'ambushAction',
      ].map((name) => {
        const match = ambushSource.match(
          new RegExp(`^(?:export )?function ${name}\\([^]*?^\\}`, 'm'),
        );
        assert.ok(match);
        return match[0].replace(/^export /, '');
      }),
    ].join('\n'),
  ),
);
function harness(
  kind:
    | 'debate'
    | 'debate-pay'
    | 'debate-swap'
    | 'request'
    | 'fraud'
    | 'ambush'
    | 'gift-medicine'
    | 'gift-artifact' = 'debate',
  pending = false,
) {
  let save = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  save.runs = 1;
  save.cultivation = 1;
  save.age = 30;
  save.stones = 10000;
  save.prologueSeen = save.hometownSeen = true;
  save.mortal.hometown!.stage = 'departed';
  save.unlocked = 6;
  let chosen = MARKET_CULTIVATORS[0].id;
  for (let seed = 1; seed < 10000; seed++) {
    save.mortal.population = { seed, since: 15 };
    save.mortal.sectMarket = undefined;
    save.mortal.marketSocial = undefined;
    save.mortal.auction = undefined;
    enterNextMarketBatch(save);
    const ids = MARKET_CULTIVATORS.map((n) => n.id);
    if (kind === 'debate-pay' || kind === 'debate-swap') {
      save.medicine.recipes =
        kind === 'debate-swap'
          ? MEDICINES.filter((m) => m.years > 0 && m.tier !== '凡品')
              .filter((_, i) => i % 2 === 0)
              .map((m) => m.id)
          : [];
      const id = ids.find((id) => {
        const q = debateRecipeOffer(save, id);
        return q && (kind !== 'debate-swap' || q.exchange);
      });
      if (id) {
        chosen = id;
        break;
      }
    } else if (kind === 'request') {
      const id = ids.find((id) => marketRequest(save, id)?.kind === 'medicine');
      if (id) {
        chosen = id;
        break;
      }
    } else if (kind === 'fraud' || kind === 'ambush' || kind.startsWith('gift-')) {
      const id = ids.find((id) => {
        const o = marketOpportunity(save, id);
        if (kind.startsWith('gift-'))
          return o?.kind === 'invitation' && o.honest && `gift-${o.item.kind}` === kind;
        return o?.kind === (kind === 'fraud' ? 'goods' : 'invitation') && !o.honest;
      });
      if (id) {
        chosen = id;
        break;
      }
    } else break;
  }
  const npc = marketCultivators(save.mortal.population!, save.mortal.sectMarket!).find(
    (n) => n.id === chosen,
  )!;
  const offer = marketRequest(save, chosen);
  if (offer?.kind === 'medicine') save.medicine.bag[offer.id] = offer.quantity + 2;
  const run = pending ? new Game(save, 0, 0, () => 0.5) : null;
  run?.pause();
  let stored = JSON.stringify({ ...save, activeRun: run?.snapshot() ?? null }),
    fail = false;
  let html = marketSocialContent(save, npc, pending);
  const section = { scrollTop: 77 };
  const logs: string[] = [];
  let entered = 0,
    destroyed = 0;
  let scene: any;
  class TestScene {
    duel: MarketAmbushDuel;
    finish: any;
    saveCheckpoint: any;
    constructor(_host, data, _npc, finish, saveCheckpoint) {
      this.finish = finish;
      this.saveCheckpoint = saveCheckpoint;
      this.duel = new MarketAmbushDuel(
        data.mortal.marketSocial.ambush.stats,
        data.mortal.marketSocial.ambush.snapshot,
      );
      scene = this;
    }
    requestRetreat() {
      this.duel.requestRetreat();
      return this.saveCheckpoint(this.duel.snapshot());
    }
    destroy() {
      destroyed++;
    }
  }
  const context = createContext({
    marketEventSource: { current: marketEventUi },
    dispatchAction,
    homeTownEntrance,
    save,
    SAVE_KEY,
    structuredClone,
    performance,
    FINAL_TRIAL_STAGE,
    MAX_REVIVES,
    MarketAmbushDuel,
    MarketAmbushScene: TestScene,
    lifespanInfo,
    tribulationDue,
    inMortalWorld: true,
    inMarket: true,
    inTown: false,
    game: null,
    pendingRun: run,
    marketNpc: npc,
    marketScene: { nearbyNpc: npc },
    panel: 'sect-market-event',
    ambushScene: null,
    saveLock: null,
    lastSaveText: stored,
    prepareMarketSocial,
    debateMarket,
    fulfillMarketRequest,
    chooseMarketOpportunity,
    settleMarketAmbush,
    isMarketCultivatorId,
    marketSocialContent,
    townStatus,
    executeMarketSocial,
    marketAmbushRecoveryPanel,
    marketAmbushPanel,
    closeNpcChat: () => {},
    clearInput: () => {},
    renderSaveLock: () => {},
    refreshMarketTrade: () => {},
    resumeHometown: () => true,
    panelFrame: (_title, _subtitle, content) => {
      context.modal.innerHTML = content;
    },
    renderEpilogue: () => {},
    showMarketAmbush: () => {
      entered++;
      context.mountAmbush(context.shellBindings());
    },
    handleMarketAmbushAction: (action) => context.ambushAction(context.shellBindings(), action),
    showMarketEvent: () => {
      context.panel = 'sect-market-event';
    },
    toast: (s: string) => logs.push(s),
    document: { getElementById: () => ({ innerHTML: '' }) },
    modal: {
      innerHTML: '',
      querySelector(selector: string) {
        if (selector === '#market-social')
          return {
            querySelectorAll: () => [],
            set innerHTML(v: string) {
              html = v;
            },
            get innerHTML() {
              return html;
            },
          };
        if (selector === '.panel') return section;
        if (selector === '#market-ambush') return {};
        if (selector === '[data-action="close"]') return { remove() {} };
        if (selector === '.ambush-result') return { hidden: true, textContent: '' };
        if (selector === '[data-action="market-ambush-exit"]') return { textContent: '' };
        if (selector.startsWith('[data-action=')) {
          const action = selector.match(/data-action="([^"]+)"/)?.[1];
          const attrs = html.match(new RegExp(`<button[^>]*data-action="${action}"[^>]*>`))?.[0];
          return attrs
            ? {
                dataset: {
                  visit: attrs.match(/data-visit="(\d+)"/)?.[1],
                  level: attrs.match(/data-level="(\d+)"/)?.[1],
                  debateChoice: attrs.match(/data-debate-choice="([^"]+)"/)?.[1],
                },
                disabled: attrs.includes('disabled'),
              }
            : null;
        }
        return null;
      },
    },
    localStorage: {
      getItem: () => stored,
      setItem(_key: string, v: string) {
        if (fail) throw Error('storage fail');
        stored = v;
      },
    },
  });
  script.runInContext(context);
  return {
    save,
    context,
    npc,
    run,
    get scene() {
      return scene;
    },
    logs,
    section,
    entered: () => entered,
    destroyed: () => destroyed,
    stored: () => JSON.parse(stored),
    fail: (value = true) => {
      fail = value;
    },
    stale: () => {
      stored = JSON.stringify({ ...save, stones: 5 });
    },
    action: (a: string) => context.handleAction(a, chosen),
  };
}
test('真实论道按钮一年/冷却/收获原子写档；保存失败和其他窗口更改无扣龄或领奖', () => {
  for (const kind of ['success', 'failure', 'stale'] as const) {
    const h = harness();
    const before = JSON.stringify(h.save);
    if (kind === 'failure') h.fail();
    if (kind === 'stale') h.stale();
    h.action('sect-market-debate');
    if (kind === 'success') {
      assert.equal(h.save.age, 31);
      assert.equal(h.stored().mortal.marketSocial.lastDebateAt, 31);
      assert.equal(h.section.scrollTop, 77);
      const current = JSON.stringify(h.save);
      h.action('sect-market-debate');
      assert.equal(JSON.stringify(h.save), current);
    } else assert.equal(JSON.stringify(h.save), before);
  }
});
test('真实求购和诈骗路由同存物资/时间/额度，保存失败不显示成功或改物资', () => {
  for (const kind of ['request', 'fraud'] as const) {
    const h = harness(kind);
    const before = JSON.stringify(h.save);
    h.fail();
    h.action(kind === 'request' ? 'sect-market-request' : 'sect-market-opportunity');
    assert.equal(JSON.stringify(h.save), before);
    assert.equal(h.entered(), 0);
    h.fail(false);
    h.action(kind === 'request' ? 'sect-market-request' : 'sect-market-opportunity');
    assert.equal(h.save.age, 30.5);
    assert.deepEqual(h.stored().mortal.marketSocial, h.save.mortal.marketSocial);
  }
});
test('真实赴约按钮的法宝与丹药承诺同存；保存失败和旧窗口拒绝后没有扣龄、赠物或冷却', () => {
  for (const kind of ['gift-medicine', 'gift-artifact'] as const) {
    for (const failure of ['write', 'stale'] as const) {
      const h = harness(kind);
      const before = JSON.stringify(h.save);
      if (failure === 'write') h.fail();
      else h.stale();
      h.action('sect-market-opportunity');
      assert.equal(JSON.stringify(h.save), before);
      assert.equal(h.entered(), 0);
      if (failure === 'stale') continue;
      h.fail(false);
      const promise = marketOpportunity(h.save, h.npc.id)!;
      const owned = h.save.medicine.bag[promise.item.id] || 0;
      h.action('sect-market-opportunity');
      assert.equal(h.save.age, 31);
      assert.equal(h.save.mortal.marketSocial!.lastOpportunityAt, 31);
      assert.equal(h.save.mortal.marketSocial!.ambush, null);
      if (promise.item.kind === 'medicine')
        assert.equal(h.save.medicine.bag[promise.item.id], owned + promise.item.quantity);
      else {
        assert.ok(h.save.artifacts.includes(promise.item.id));
        assert.equal(h.save.forge[promise.item.id], promise.item.forgeLevel);
      }
      assert.deepEqual(h.stored().medicine, h.save.medicine);
      assert.deepEqual(h.stored().artifacts, h.save.artifacts);
      assert.deepEqual(h.stored().forge, h.save.forge);
      const current = JSON.stringify(h.save);
      h.action('sect-market-opportunity');
      assert.equal(JSON.stringify(h.save), current);
    }
  }
});
test('伏击写成功才挂战斗；胜利快照持久化后结算失败可重试，退款与战利品仅一次', () => {
  const h = harness('ambush');
  const before = h.save.stones;
  h.fail();
  h.action('sect-market-opportunity');
  assert.equal(h.entered(), 0);
  assert.equal(h.save.stones, before);
  h.fail(false);
  h.action('sect-market-opportunity');
  assert.equal(h.entered(), 1);
  const held = h.save.mortal.marketSocial!.ambush!.held;
  assert.equal(h.save.stones, before - held);
  assert.ok(h.stored().mortal.marketSocial.ambush);
  const won = h.scene.duel.snapshot();
  won.enemy.hp = 0;
  won.outcome = 'victory';
  assert.equal(h.context.checkpoint(h.context.shellBindings(), won), true);
  const inventory = JSON.stringify(h.save.medicine.bag);
  h.fail();
  h.context.finishAmbush(h.context.shellBindings(), 'victory');
  assert.equal(h.context.panel, 'market-ambush-recovery');
  assert.ok(h.save.mortal.marketSocial!.ambush);
  assert.equal(h.save.stones, before - held);
  assert.equal(JSON.stringify(h.save.medicine.bag), inventory);
  h.fail(false);
  h.action('market-ambush-recover');
  assert.equal(h.save.stones, before);
  assert.equal(h.save.mortal.marketSocial!.ambush, null);
  const settled = JSON.stringify(h.save);
  h.context.finishAmbush(h.context.shellBindings(), 'victory');
  assert.equal(JSON.stringify(h.save), settled);
});
test('关闭只请求真实撤离；冷启动恢复同战况、不自动逃生或重复扣款', () => {
  const h = harness('ambush');
  h.action('sect-market-opportunity');
  const paid = h.save.stones;
  h.action('close');
  assert.equal(h.save.stones, paid);
  assert.ok(h.save.mortal.marketSocial!.ambush);
  assert.equal(h.save.mortal.marketSocial!.ambush!.snapshot.retreatRequested, true);
  assert.equal(h.save.mortal.marketSocial!.ambush!.snapshot.outcome, null);
  const snapshot = structuredClone(h.save.mortal.marketSocial!.ambush!.snapshot);
  h.context.ambushScene = null;
  h.context.panel = '';
  h.context.renderLobby();
  assert.equal(h.context.panel, 'market-ambush');
  assert.equal(h.save.stones, paid);
  assert.deepEqual(h.scene.duel.snapshot(), snapshot);
  assert.ok(h.stored().mortal.marketSocial.ambush);
  h.context.finishAmbush(h.context.shellBindings(), 'escaped');
  assert.ok(h.save.mortal.marketSocial!.ambush, '无真实脱身快照不能伪造结算');
});
test('真实未完历练论道后保留原快照，可以恢复；赴约按钮禁用', () => {
  const h = harness('debate', true);
  const snapshot = h.run!.snapshot();
  h.action('sect-market-debate');
  assert.equal(h.save.age, 31);
  assert.deepEqual(h.stored().activeRun, JSON.parse(JSON.stringify(snapshot)));
  assert.ok(Game.restore(h.save, snapshot));
  const trap = harness('ambush', true);
  trap.action('sect-market-opportunity');
  assert.equal(trap.entered(), 0);
  assert.equal(trap.save.age, 30);
});

test('真实付费抄录与互授按钮写档成功才扣款/学方/记忆，写入失败或旧窗口完全回滚', () => {
  for (const mode of ['pay', 'swap'] as const)
    for (const state of ['success', 'failure', 'stale'] as const) {
      const h = harness(`debate-${mode}`);
      const q = debateRecipeOffer(h.save, h.npc.id)!;
      const before = structuredClone(h.save);
      if (state === 'failure') h.fail();
      if (state === 'stale') h.stale();
      h.action(`sect-market-debate-${mode}`);
      if (state !== 'success') {
        assert.deepEqual(h.save, before);
        continue;
      }
      assert.equal(h.save.stones, before.stones - (mode === 'pay' ? q.price : 0));
      assert.equal(h.save.age, before.age + 1);
      assert.ok(h.save.medicine.recipes.includes(q.id));
      assert.deepEqual(h.save.medicine.bag, before.medicine.bag);
      assert.deepEqual(h.stored().medicine, h.save.medicine);
      if (mode === 'swap')
        assert.ok(
          h.save.mortal.marketRelations!.contacts.some((c) =>
            c.taughtRecipes?.includes(q.exchange!),
          ),
        );
      const completed = JSON.stringify(h.save);
      h.action(`sect-market-debate-${mode}`);
      assert.equal(JSON.stringify(h.save), completed);
    }
});
