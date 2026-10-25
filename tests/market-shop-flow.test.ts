import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSave, realmCost } from '../src/progress.ts';
import { beginSectMarketVisit } from '../src/sect-market.ts';
import { marketVenueAction } from '../src/market-venue-flow.ts';
import { marketShopContent } from '../src/market-shop-ui.ts';
import { type MarketShopId } from '../src/market-shop.ts';
import type { ActionShell } from '../src/action-controller.ts';

// DOM 替身仅承接模板生成的真实按钮；结算走院落控制器。真实布局和存储另经 MCP 验证。
function harness(venue: MarketShopId) {
  const save = freshSave('heaven', ['metal'], 'dual', () => 0.5);
  save.age = 30;
  save.cultivation = Array.from({ length: 9 }, (_, i) => realmCost(i)).reduce((a, b) => a + b, 0);
  save.prologueSeen = save.hometownSeen = true;
  save.mortal.hometown.stage = 'departed';
  save.stones = 100000;
  save.mortal.population = { seed: 12345, since: 15 };
  beginSectMarketVisit(save);
  save.artifacts.push('pagoda');
  save.forge.pagoda = 5;
  save.medicine.bag.heqi = 2;
  let html = marketShopContent(save, venue, false, {
    from: 'heqi',
    to: 'juyuan',
    artifact: 'pagoda',
  });
  let stored = structuredClone(save),
    fail = false,
    writes = 0;
  const result = { textContent: '' },
    section = { scrollTop: 100 };
  const decode = (s: string) =>
    s
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&');
  const buttons = () =>
    [...html.matchAll(/<button([^>]*)>/g)].map((m) => ({
      dataset: Object.fromEntries(
        [...m[1].matchAll(/data-([a-z]+)="([^"]*)"/g)].map((a) => [a[1], decode(a[2])]),
      ),
      disabled: m[1].includes('disabled'),
      focus() {},
    }));
  const shop = {
    dataset: { shop: venue },
    isConnected: true,
    get innerHTML() {
      return html;
    },
    set innerHTML(v: string) {
      html = v;
    },
    querySelectorAll() {
      return [];
    },
    querySelector(s: string): unknown {
      if (s === '[data-shop-confirm]') return html.includes('data-shop-confirm') ? {} : null;
      if (s.startsWith('#shop-')) {
        const field = s.slice(1),
          options = html.match(
            new RegExp(`<select[^>]*id="${field}"[^>]*>([\\s\\S]*?)</select>`),
          )?.[1];
        return options
          ? { value: options.match(/value="([^"]+)" selected/)?.[1] || '', focus() {} }
          : null;
      }
      return buttons().find((b) => s.includes(`"${b.dataset.action}"`));
    },
  };
  const host = {
    dataset: { venue },
    set innerHTML(_s: string) {
      shop.innerHTML = marketShopContent(save, venue);
    },
    querySelectorAll() {
      return buttons();
    },
    querySelector(s: string) {
      return s === '#market-shop-content' ? shop : s === '#market-venue-result' ? result : null;
    },
  };
  const shell = {
    save,
    inMarket: true,
    panel: 'market-venue',
    marketScene: { nearVenue: { id: venue } },
    saveLock: null,
    game: null,
    pendingRun: null,
    modal: {
      querySelector(s: string) {
        return s === '#market-shop-content'
          ? shop
          : s === '#market-venue-content'
            ? host
            : s === '.panel'
              ? section
              : null;
      },
    },
    document: {
      getElementById() {
        return null;
      },
    },
    structuredClone,
    toast() {},
    writeSave(next: typeof save) {
      if (fail) throw Error('simulated storage failure');
      stored = structuredClone(next);
      writes++;
    },
  } as unknown as ActionShell;
  return {
    save,
    shell,
    result,
    section,
    html: () => html,
    stored: () => stored,
    writes: () => writes,
    fail: (v: boolean) => {
      fail = v;
    },
    action: (a = 'market-venue-shop', c = venue === 'stalls' ? 'pagoda' : 'heqi@juyuan') =>
      marketVenueAction(shell, a, c),
  };
}

test('调剂与拆解保存失败零改动，重试只结算一次并刷新真实选项、数量和禁用状态', () => {
  for (const venue of ['medicine', 'stalls'] as const) {
    const h = harness(venue),
      before = structuredClone(h.save);
    if (venue === 'stalls') h.action();
    const action = venue === 'stalls' ? 'market-venue-shop-confirm' : 'market-venue-shop';
    h.fail(true);
    h.action(action);
    assert.deepEqual(h.save, before);
    assert.deepEqual(h.stored(), before);
    assert.equal(h.result.textContent, '');
    h.fail(false);
    h.action(action);
    assert.equal(h.writes(), 1);
    assert.deepEqual(h.stored(), h.save);
    assert.equal(h.save.age, 30.5);
    assert.ok(h.result.textContent);
    assert.equal(h.section.scrollTop, 100);
    if (venue === 'medicine') {
      assert.match(h.html(), /value="heqi" selected/);
      assert.match(h.html(), /value="juyuan" selected/);
      assert.match(h.html(), /持有0/);
      assert.match(h.html(), /disabled>这味丹药不足两份/);
    }
    if (venue === 'stalls') {
      assert.match(h.html(), /value="pagoda" selected/);
      assert.match(h.html(), /已不在收藏/);
      assert.doesNotMatch(h.html(), /data-action="market-venue-shop-confirm"/);
    }
    const after = structuredClone(h.save);
    h.action(action);
    assert.deepEqual(h.save, after);
    assert.equal(h.writes(), 1);
  }
});
test('拆解必须经过原面板确认，取消不扣物，旧报价与离场不能继续成交', () => {
  const h = harness('stalls'),
    before = structuredClone(h.save);
  h.action('market-venue-shop-confirm');
  assert.deepEqual(h.save, before);
  h.action();
  assert.match(h.html(), /确认拆解/);
  assert.deepEqual(h.save, before);
  h.action('market-venue-shop-cancel');
  assert.deepEqual(h.save, before);
  assert.match(h.html(), /value="pagoda" selected/);
  h.action();
  h.save.forge.pagoda = 6;
  const changed = structuredClone(h.save);
  h.action('market-venue-shop-confirm');
  assert.deepEqual(h.save, changed);
  assert.equal(h.writes(), 0);
  for (const field of ['inMarket', 'panel', 'saveLock', 'nearVenue', 'game', 'pendingRun']) {
    const t = harness('stalls');
    t.action();
    const initial = structuredClone(t.save);
    if (field === 'inMarket') t.shell.inMarket = false;
    else if (field === 'panel') t.shell.panel = '';
    else if (field === 'saveLock') t.shell.saveLock = 'stale';
    else if (field === 'nearVenue')
      t.shell.marketScene = { nearVenue: { id: 'medicine' } } as ActionShell['marketScene'];
    else if (field === 'game') t.shell.game = {} as ActionShell['game'];
    else t.shell.pendingRun = {} as ActionShell['pendingRun'];
    t.action('market-venue-shop-confirm');
    assert.deepEqual(t.save, initial, field);
    assert.equal(t.writes(), 0);
  }
});

test('旧游商购货按钮即使残留也不能经院落控制器扣款或产丹', () => {
  const h = harness('medicine');
  const host = h.shell.modal.querySelector<HTMLElement>('#market-venue-content')!;
  const shop = h.shell.modal.querySelector<HTMLElement>('#market-shop-content')!;
  host.dataset.venue = shop.dataset.shop = 'caravan';
  h.shell.marketScene = { nearVenue: { id: 'caravan' } } as ActionShell['marketScene'];
  const before = structuredClone(h.save);
  h.action('market-venue-shop', 'heqi@juyuan');
  assert.deepEqual(h.save, before);
  assert.equal(h.writes(), 0);
});
