import { homeTownEntrance } from '../src/home-town.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, Script } from 'node:vm';
import { freshSave, SAVE_KEY, lifespanInfo, tribulationDue } from '../src/progress.ts';
import { beginSectMarketVisit } from '../src/sect-market.ts';
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
import { marketSocialContent } from '../src/market-social-ui.ts';
import { townStatus } from '../src/mortal-ui.ts';
import { Game } from '../src/game.ts';
import { FINAL_TRIAL_STAGE } from '../src/data.ts';
const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const script = new Script(
  stripTypeScriptTypes(
    [
      'handleAction',
      'writeSave',
      'lockStaleSave',
      'refreshMarketActivities',
      'finishMarketAmbush',
      'renderLobby',
    ]
      .map((name) => {
        const match = source.match(new RegExp(`^function ${name}\\([^]*?^\\}`, 'm'));
        assert.ok(match);
        return match[0];
      })
      .join('\n'),
  ),
);
function harness(kind: 'debate' | 'request' | 'fraud' | 'ambush' = 'debate', pending = false) {
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
    beginSectMarketVisit(save);
    const ids = MARKET_CULTIVATORS.map((n) => n.id);
    if (kind === 'request') {
      const id = ids.find((id) => marketRequest(save, id)?.kind === 'medicine');
      if (id) {
        chosen = id;
        break;
      }
    } else if (kind === 'fraud' || kind === 'ambush') {
      const id = ids.find((id) => {
        const o = marketOpportunity(save, id);
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
  if (offer) save.medicine.bag[offer.id] = offer.quantity + 2;
  const run = pending ? new Game(save, 0, 0, () => 0.5) : null;
  run?.pause();
  let stored = JSON.stringify({ ...save, activeRun: run?.snapshot() ?? null }),
    fail = false;
  let html = marketSocialContent(save, npc, pending);
  const section = { scrollTop: 77 };
  const logs: string[] = [];
  let entered = 0,
    destroyed = 0;
  const scene = {
    duel: { outcome: null as 'victory' | 'defeat' | 'escaped' | null },
    lockOutcome(o: 'victory' | 'defeat' | 'escaped') {
      this.duel.outcome ??= o;
    },
    destroy() {
      destroyed++;
    },
  };
  const context = createContext({
    homeTownEntrance,
    save,
    SAVE_KEY,
    structuredClone,
    performance,
    FINAL_TRIAL_STAGE,
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
    clearInput: () => {},
    renderSaveLock: () => {},
    refreshMarketTrade: () => {},
    resumeHometown: () => true,
    panelFrame: () => {},
    renderEpilogue: () => {},
    showMarketAmbush: () => {
      entered++;
      context.panel = 'market-ambush';
      context.ambushScene = scene;
    },
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
    scene,
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
test('伏击写成功才挂战斗；胜利结算失败锁定胜负并保留ongoing，重试一次退款', () => {
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
  h.fail();
  h.context.finishMarketAmbush('victory');
  assert.equal(h.scene.duel.outcome, 'victory');
  assert.equal(h.destroyed(), 0);
  assert.ok(h.save.mortal.marketSocial!.ambush);
  assert.equal(h.save.stones, before - held);
  h.fail(false);
  h.action('market-ambush-exit');
  assert.equal(h.save.stones, before);
  assert.equal(h.save.mortal.marketSocial!.ambush, null);
  assert.equal(h.destroyed(), 1);
  h.context.finishMarketAmbush('victory');
  assert.equal(h.save.stones, before);
});
test('主动关闭伏击按脱身；冷启动恢复失败保留原始记录，成功不重复扣款', () => {
  const h = harness('ambush');
  h.action('sect-market-opportunity');
  const old = h.save.stones;
  h.action('close');
  assert.equal(h.save.stones, old);
  assert.equal(h.save.mortal.marketSocial!.ambush, null);
  const cold = harness('ambush');
  cold.action('sect-market-opportunity');
  cold.context.ambushScene = null;
  cold.context.panel = '';
  const paid = cold.save.stones;
  const record = JSON.stringify(cold.save);
  cold.fail();
  cold.context.renderLobby();
  assert.equal(cold.context.panel, 'market-ambush-recovery');
  assert.equal(JSON.stringify(cold.save), record);
  cold.fail(false);
  cold.action('market-ambush-recover');
  assert.equal(cold.save.stones, paid);
  assert.equal(cold.save.mortal.marketSocial!.ambush, null);
  assert.equal(cold.stored().mortal.marketSocial.ambush, null);
  cold.context.renderLobby();
  assert.equal(cold.save.stones, paid);
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
