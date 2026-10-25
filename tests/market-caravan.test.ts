import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSave, realmCost, readSave } from '../src/progress.ts';
import {
  beginSectMarketVisit,
  sectMarketOffer,
  sectMarketDeals,
  exchangeSectMedicine,
} from '../src/sect-market.ts';
import { marketRequest, fulfillMarketRequest, requestReason } from '../src/market-social.ts';
import { venueRequests, venuePeople } from '../src/market-venues.ts';
import { marketVenueContent } from '../src/market-venue-ui.ts';
import { marketVenueAction } from '../src/market-venue-flow.ts';
import { rememberMarketContact } from '../src/market-relations.ts';
import { settlementPlaces } from '../src/settlement-directory.ts';
import { auctionItemName } from '../src/auction-items.ts';
import { MEDICINES } from '../src/medicine-data.ts';
import type { ActionShell } from '../src/action-controller.ts';

function fixture(seed = 1) {
  const s = freshSave('heaven', ['metal'], 'dual', () => 0.5);
  s.cultivation = Array.from({ length: 12 }, (_, i) => realmCost(i)).reduce((a, b) => a + b, 0);
  s.age = 30;
  s.stones = 10000;
  s.prologueSeen = s.hometownSeen = true;
  s.mortal.hometown.stage = 'departed';
  s.mortal.population = { seed, since: 15 };
  beginSectMarketVisit(s);
  return s;
}
function requested(kind: 'medicine' | 'artifact') {
  for (let seed = 1; seed <= 1000; seed++) {
    const s = fixture(seed);
    const lead = venueRequests(s)[0];
    if (lead?.request.kind === kind && lead.request.id !== s.starter) return { s, ...lead };
  }
  throw Error(`未找到${kind}求购样本`);
}
const requestsSection = (html: string) =>
  html.split('<section data-caravan-requests>')[1].split('</section>')[0];

test('游商求购逐项对应本批在场当事人的实际条件、报酬，反复查看与刷新只读', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const s = fixture(seed),
      before = structuredClone(s);
    const leads = venueRequests(s);
    assert.equal(leads.length, 1, '沿用原本每批一位求购者，不新增委托');
    const html = marketVenueContent(s, 'caravan');
    const primary = requestsSection(html);
    for (const { npc, request, fulfilled } of leads) {
      assert.deepEqual(request, marketRequest(s, npc.id));
      assert.equal(fulfilled, false);
      assert.match(primary, new RegExp(npc.name));
      assert.ok(primary.includes(`${auctionItemName(request)} ×${request.quantity}`));
      assert.ok(primary.includes(`${request.price}灵石`));
      if (request.kind === 'artifact') {
        assert.ok(primary.includes(`至少炼器${request.minimumLevel}阶`));
        assert.ok(primary.includes(`现有炼器${request.forgeLevel}阶`));
      }
      assert.ok(primary.includes(`data-id="${npc.id}"`));
    }
    assert.ok(html.indexOf('坊中求购') < html.indexOf('本批余丹货讯'));
    assert.doesNotMatch(html, /data-action="market-venue-shop|游商货单|购置这份货单/);
    assert.deepEqual(venueRequests(readSave(JSON.stringify(s)).save), leads);
    assert.equal(marketVenueContent(s, 'caravan'), html);
    assert.deepEqual(s, before);
    const place = settlementPlaces(s, true).find((p) => p.name === '游商摊')!;
    assert.match(place.status!, /1条求购待交货/);
    assert.match(place.cost, /查看消息不耗年岁或灵石/);
    assert.doesNotMatch(place.use + place.cost, /购买成丹|货单|十年再买/);
  }
});

test('求购消息不依赖玩家有货或有钱，交货仍拒绝不足库存且不在游商处直接成交', () => {
  const { s, npc, request } = requested('medicine');
  s.stones = 0;
  s.medicine.bag = {};
  const before = structuredClone(s);
  assert.equal(venueRequests(s)[0].npc.id, npc.id);
  assert.ok(requestReason(s, npc.id, s.mortal.sectMarket!.visit, request.forgeLevel));
  assert.equal(
    fulfillMarketRequest(s, npc.id, s.mortal.sectMarket!.visit, request.forgeLevel),
    undefined,
  );
  assert.deepEqual(s, before);
});

test('按消息找到当事人交药仅扣所需库存、增加报价灵石；成交状态读回且不再引导交货', () => {
  const { s, npc, request } = requested('medicine');
  s.medicine.bag[request.id] = request.quantity + 2;
  const before = structuredClone(s);
  assert.ok(fulfillMarketRequest(s, npc.id, s.mortal.sectMarket!.visit, request.forgeLevel));
  assert.equal(s.medicine.bag[request.id], 2);
  assert.equal(s.stones, before.stones + request.price);
  assert.equal(s.age, before.age + 0.5);
  assert.deepEqual(s.medicine.active, before.medicine.active);
  const restored = readSave(JSON.stringify(s)).save;
  assert.equal(venueRequests(restored)[0].fulfilled, true);
  const primary = requestsSection(marketVenueContent(restored, 'caravan'));
  assert.match(primary, /本批求购已成交，不再收货/);
  assert.doesNotMatch(primary, /data-action="market-venue-guide"|交货实收/);
  assert.match(
    settlementPlaces(restored, true).find((p) => p.name === '游商摊')!.status!,
    /暂无未完成求购/,
  );
  const after = structuredClone(restored);
  assert.equal(
    fulfillMarketRequest(restored, npc.id, restored.mortal.sectMarket!.visit, request.forgeLevel),
    undefined,
  );
  assert.deepEqual(restored, after);
});

test('法宝求购消息按实际炼器阶数估价，报价变化拒绝旧交货，本命保护保留', () => {
  const { s, npc, request } = requested('artifact');
  s.artifacts.push(request.id);
  s.forge[request.id] = request.minimumLevel + 2;
  const actual = venueRequests(s)[0].request;
  const html = requestsSection(marketVenueContent(s, 'caravan'));
  assert.ok(html.includes(`至少炼器${actual.minimumLevel}阶`));
  assert.ok(html.includes(`现有炼器${actual.forgeLevel}阶`));
  assert.ok(html.includes(`${actual.price}灵石`));
  const before = structuredClone(s);
  assert.equal(
    fulfillMarketRequest(s, npc.id, s.mortal.sectMarket!.visit, request.forgeLevel),
    undefined,
  );
  assert.deepEqual(s, before);
  s.starter = request.id;
  assert.ok(requestReason(s, npc.id, s.mortal.sectMarket!.visit, actual.forgeLevel));
});

test('已离场、身死与批次不符的求购不列出，不编造替代买家或库存', () => {
  for (const mode of ['absent', 'dead', 'stale'] as const) {
    const { s, npc } = requested('medicine');
    if (mode === 'absent') s.mortal.sectMarket!.absent = [npc.id as never];
    else if (mode === 'dead') rememberMarketContact(s, npc.id)!.dead = true;
    else s.mortal.marketSocial!.visit++;
    const before = structuredClone(s);
    assert.deepEqual(venueRequests(s), []);
    const primary = requestsSection(marketVenueContent(s, 'caravan'));
    assert.match(primary, /本批暂无公开求购/);
    assert.doesNotMatch(primary, /data-action="market-venue-guide"/);
    assert.deepEqual(s, before);
  }
});

test('余丹货讯沿用真实互换库存与额度，成交后注明且不再为已用货讯指路', () => {
  const s = fixture();
  for (const m of MEDICINES) s.medicine.bag[m.id] = 100;
  const npc = venuePeople(s).find((n) => sectMarketOffer(s, n.id))!;
  const deal = sectMarketDeals(s, npc.id).find((d) => d.give.every((i) => i.kind === 'medicine'))!;
  assert.ok(deal);
  assert.ok(exchangeSectMedicine(s, npc.id, deal.id, s.mortal.sectMarket!.visit));
  const before = structuredClone(s);
  const html = marketVenueContent(s, 'caravan');
  const stock = html.split('data-caravan-stock')[1];
  const card = stock.split(`<h3>${npc.name}</h3>`)[1].split('</article>')[0];
  assert.ok(card.includes(`本批已互换：${sectMarketOffer(s, npc.id)!.name}`));
  assert.doesNotMatch(card, /data-action="market-venue-guide"/);
  assert.deepEqual(s, before);
});

test('游商指路只标记真实目标、关闭面板，角色位置和存档不变；无效目标不跳转', () => {
  for (const found of [true, false]) {
    const { s, npc } = requested('medicine');
    const before = structuredClone(s);
    let guided = '',
      modalHtml = 'open';
    const button = { dataset: { action: 'market-venue-guide', id: npc.id }, disabled: false };
    const host = { dataset: { venue: 'caravan' }, querySelectorAll: () => [button] };
    const scene = {
      nearVenue: { id: 'caravan' },
      position: { x: 1760, y: 1080 },
      guideTo(id: string) {
        guided = id;
        return found;
      },
    };
    const shell = {
      save: s,
      inMarket: true,
      panel: 'market-venue',
      marketScene: scene,
      saveLock: null,
      game: null,
      modal: {
        querySelector: () => host,
        set innerHTML(v: string) {
          modalHtml = v;
        },
      },
      document: { getElementById: () => ({ focus() {} }) },
      writeSave() {
        throw Error('查看消息不应写档');
      },
    } as unknown as ActionShell;
    marketVenueAction(shell, 'market-venue-guide', npc.id);
    assert.equal(guided, npc.id);
    assert.equal(shell.panel, found ? '' : 'market-venue');
    assert.equal(modalHtml, found ? '' : 'open');
    assert.deepEqual(scene.position, { x: 1760, y: 1080 });
    assert.deepEqual(s, before);
  }
});
