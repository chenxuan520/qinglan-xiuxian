import { resourceFailureContent } from '../src/resource-panel.ts';
import { enterNextMarketBatch } from './market-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, Script } from 'node:vm';
import { MarketEventSource } from '../src/market-event-source.ts';
import * as marketEventUi from '../src/market-event-ui.ts';
import { freshSave } from '../src/progress.ts';
import { marketCultivators } from '../src/sect-market-data.ts';

test('坊市事件首次并发载入合并，失败重试递增模块身份，成功后复用', async () => {
  const attempts: number[] = [];
  const source = new MarketEventSource((attempt) => {
    attempts.push(attempt);
    if (!attempt) throw Error('网络断开');
    return Promise.resolve(marketEventUi);
  });
  assert.deepEqual(attempts, []);
  const first = source.load();
  assert.equal(first, source.load());
  await assert.rejects(first, /网络断开/);
  assert.equal(source.current, null);
  assert.equal(await source.load(), marketEventUi);
  assert.equal(await source.load(), marketEventUi);
  assert.deepEqual(attempts, [0, 1]);
});

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const script = new Script(
  stripTypeScriptTypes(
    ['showMarketEvent', 'refreshMarketTrade', 'refreshMarketActivities']
      .map((name) => {
        const match = main.match(new RegExp(`^function ${name}\\([^]*?^\\}`, 'm'));
        assert.ok(match, name);
        return match[0];
      })
      .join('\n'),
  ),
);
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

function harness() {
  const save = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  save.cultivation = 1;
  save.prologueSeen = save.hometownSeen = true;
  save.mortal.hometown!.stage = 'departed';
  save.mortal.population = { seed: 12345, since: 15 };
  enterNextMarketBatch(save);
  const npcs = marketCultivators(save.mortal.population, save.mortal.sectMarket!);
  const loads: { resolve: (ui: typeof marketEventUi) => void; reject: (e: Error) => void }[] = [];
  const source = new MarketEventSource(
    () => new Promise((resolve, reject) => loads.push({ resolve, reject })),
  );
  const section = { scrollTop: 173 };
  const chat = { isConnected: true, draft: '道友近来可好', messages: ['一路珍重'] };
  let html = '',
    frames = 0,
    mounts = 0,
    socialHtml = '',
    tradeHtml = '';
  let opened = [{ open: true }, { open: false }];
  let host: {
    isConnected: boolean;
    innerHTML: string;
    button: { onclick: null | (() => void) };
    querySelector: () => { onclick: null | (() => void) };
  } | null = null;
  const social = {
    querySelectorAll: () => opened,
    set innerHTML(value: string) {
      socialHtml = value;
      opened = [{ open: false }, { open: false }];
      section.scrollTop = 0;
    },
  };
  const context = createContext({
    resourceFailureContent,
    save,
    inMarket: true,
    marketScene: { nearbyNpc: npcs[0] },
    marketNpc: null,
    panel: '',
    pendingRun: null,
    saveLock: null,
    marketEventSource: source,
    panelFrame(_name: string, _subtitle: string, content: string) {
      frames++;
      html = content;
      if (host) host.isConnected = false;
      if (content.includes('id="market-event-loading"')) {
        const button = { onclick: null as null | (() => void) };
        host = {
          isConnected: true,
          innerHTML: content,
          button,
          querySelector: () => button,
        };
      }
    },
    mountNpcChat(target: typeof chat) {
      assert.equal(target, chat);
      mounts++;
    },
    modal: {
      querySelector(selector: string) {
        if (selector === '#market-event-loading') return host;
        if (selector === '.npc-dialogue') return chat;
        if (selector === '.panel') return section;
        if (selector === '#market-social') return social;
        if (selector === '#sect-market-trade')
          return {
            set innerHTML(value: string) {
              tradeHtml = value;
              section.scrollTop = 0;
            },
          };
        return null;
      },
    },
  });
  script.runInContext(context);
  return {
    context,
    save,
    source,
    npcs,
    loads,
    section,
    chat,
    open(index = 0) {
      context.marketScene.nearbyNpc = npcs[index];
      context.showMarketEvent(npcs[index]);
    },
    get host() {
      return host!;
    },
    get frames() {
      return frames;
    },
    get mounts() {
      return mounts;
    },
    get html() {
      return html;
    },
    get tradeHtml() {
      return tradeHtml;
    },
    get socialHtml() {
      return socialHtml;
    },
    get opened() {
      return opened;
    },
  };
}

test('真实坊市开窗载入期间关闭、离场、换批、旧存档锁定均不被迟到回调重开', async () => {
  for (const state of ['close', 'leave', 'visit', 'locked', 'detached'] as const) {
    const h = harness();
    h.open();
    assert.match(h.html, /正在展开/);
    await flush();
    if (state === 'close') h.context.panel = '';
    if (state === 'leave') h.context.inMarket = false;
    if (state === 'visit') enterNextMarketBatch(h.save);
    if (state === 'locked') h.context.saveLock = 'stale';
    if (state === 'detached') h.host.isConnected = false;
    h.loads[0].resolve(marketEventUi);
    await flush();
    assert.equal(h.frames, 1, state);
    assert.equal(h.mounts, 0, state);
  }
});

test('真实坊市加载时换人只挂新人物；同一个人关闭后重开只挂新的壳', async () => {
  for (const newPerson of [true, false]) {
    const h = harness();
    h.open();
    const oldHost = h.host;
    h.open(newPerson ? 1 : 0);
    assert.equal(oldHost.isConnected, false);
    await flush();
    assert.equal(h.loads.length, 1);
    h.loads[0].resolve(marketEventUi);
    await flush();
    assert.equal(h.frames, 3);
    assert.equal(h.mounts, 1);
    assert.equal(h.context.marketNpc, h.npcs[newPerson ? 1 : 0]);
    assert.equal(h.html, marketEventUi.sectMarketEventContent(h.save, h.context.marketNpc, false));
  }
});

test('真实失败重试用最新存档生成交易，旧重试按钮在离场后无效', async () => {
  const h = harness();
  h.open();
  await flush();
  h.loads[0].reject(Error('暂时断网'));
  await flush();
  assert.match(h.host.innerHTML, /重新展开/);
  h.save.mortal.sectMarket!.exchanged.push(h.npcs[0].id);
  const retry = h.host.button.onclick!;
  retry();
  await flush();
  assert.equal(h.loads.length, 2);
  h.loads[1].resolve(marketEventUi);
  await flush();
  assert.equal(h.mounts, 1);
  assert.match(h.html, /本批已互换/);
  const frames = h.frames;
  h.context.inMarket = false;
  retry();
  await flush();
  assert.equal(h.frames, frames);
  assert.equal(h.loads.length, 2);
});

test('真实交易与社交刷新只替换子区，保留聊天草稿/消息、滚动和详情展开', () => {
  const h = harness();
  h.source.current = marketEventUi;
  h.open();
  assert.equal(h.mounts, 1);
  const chatBefore = structuredClone(h.chat);
  h.save.mortal.sectMarket!.exchanged.push(h.npcs[0].id);
  h.context.refreshMarketTrade();
  assert.match(h.tradeHtml, /本批已互换/);
  assert.equal(h.section.scrollTop, 173);
  h.context.refreshMarketActivities();
  assert.ok(h.socialHtml.length);
  assert.equal(h.section.scrollTop, 173);
  assert.deepEqual(
    h.opened.map((d) => d.open),
    [true, false],
  );
  assert.deepEqual(h.chat, chatBefore);
  assert.equal(h.mounts, 1);
  assert.equal(h.frames, 1);
});
