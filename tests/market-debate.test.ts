import { sealSaveSnapshot } from '../src/leaderboard-integrity.ts';
import { enterNextMarketBatch } from './market-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSave, realmCost, readSave, retreat, SAVE_SCHEMA } from '../src/progress.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';
import { TREASURES } from '../src/data.ts';
import { MEDICINES, medicineInfo } from '../src/medicine-data.ts';
import {
  marketCultivators,
  MARKET_CULTIVATORS,
  type MarketTraderId,
} from '../src/sect-market-data.ts';
import { debateMarket, debateReason } from '../src/market-social.ts';
import { debateQuote, debateRecipeOffer, debateThanks } from '../src/market-debate.ts';
import {
  marketContact,
  rememberMarketAid,
  rememberMarketContact,
  rememberMarketTrade,
} from '../src/market-relations.ts';
import { validMarketRelations } from '../src/market-relations-data.ts';
import { executeVenue, venueStamp } from '../src/market-venues.ts';
import { executeMarketSocial } from '../src/market-social-actions.ts';
import { marketVenueContent } from '../src/market-venue-ui.ts';
import { marketSocialContent } from '../src/market-social-ui.ts';
const ids = MARKET_CULTIVATORS.map((n) => n.id);
function fixture(rank = 4, seed = 12345) {
  const s = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  s.prologueSeen = s.hometownSeen = true;
  s.mortal.hometown!.stage = 'departed';
  s.cultivation = Math.max(
    1,
    Array.from({ length: rank * 3 }, (_, i) => realmCost(i)).reduce((a, b) => a + b, 0),
  );
  s.unlocked = 6;
  s.completed = [0, 1, 2, 3];
  s.age = 30;
  s.stones = 10000;
  for (const t of TREASURES) s.forge[t.id] = 0;
  s.mortal.population = { seed, since: 15 };
  assert.ok(enterNextMarketBatch(s));
  return s;
}
function offered(tier: '灵品' | '珍品', swap = false) {
  for (let seed = 1; seed < 200; seed++) {
    const s = fixture(tier === '灵品' ? 1 : 3, seed);
    if (swap)
      s.medicine.recipes = MEDICINES.filter((m) => m.years && m.tier === tier)
        .filter((_, i) => i % 2 === 0)
        .map((m) => m.id);
    for (const id of ids) {
      const offer = debateRecipeOffer(s, id);
      if (offer && medicineInfo(offer.id)!.tier === tier && (!swap || offer.exchange))
        return { s, id, offer };
    }
  }
  throw Error('未找到合法丹方样本');
}
function reunion() {
  const s = fixture();
  const id = ids[0];
  rememberMarketAid(s, id);
  assert.equal(debateThanks(s, id), undefined, '当场相助不立即赠药');
  assert.ok(enterNextMarketBatch(s));
  assert.ok(enterNextMarketBatch(s));
  const current = ids.find((slot) => marketContact(s, slot)?.aidAt !== undefined)!;
  assert.ok(current);
  return { s, id: current };
}
test('复现旧闭关刷药路线：100次普通论道零丹药、零新丹方，期间冷却仍有效', () => {
  const s = fixture();
  s.stones = 0;
  s.medicine.recipes = MEDICINES.filter((m) => m.years && m.tier !== '凡品').map((m) => m.id);
  const before = structuredClone(s.medicine);
  for (let i = 0; i < 100; i++) {
    const id = ids[i % 3];
    assert.ok(executeVenue(s, `debate@${id}@talk`, venueStamp(s)));
    assert.ok(debateReason(s, id, s.mortal.sectMarket!.visit, 'talk'));
    assert.deepEqual(s.medicine, before);
    assert.equal(readSave(JSON.stringify(s)).status, 'ok');
    if (i < 99) {
      assert.ok(retreat(s, 10, () => 0.5));
      assert.ok(enterNextMarketBatch(s));
    }
  }
  assert.equal(s.stones, 0);
  assert.equal(s.age, 1120);
});
test('灵品80/珍品200明码抄录：只学方、不送药、不改本世配方种子；两入口共用冷却', () => {
  for (const tier of ['灵品', '珍品'] as const) {
    const { s, id, offer } = offered(tier);
    const before = structuredClone(s);
    const choice = `pay:${offer.id}`;
    assert.equal(debateReason(s, id, 1, choice), '');
    assert.ok(executeVenue(s, `debate@${id}@${choice}`, venueStamp(s)));
    assert.equal(s.stones, before.stones - (tier === '灵品' ? 80 : 200));
    assert.equal(s.age, before.age + 1);
    assert.ok(s.medicine.recipes.includes(offer.id));
    assert.deepEqual(s.medicine.bag, before.medicine.bag);
    assert.equal(s.medicine.recipeSeed, before.medicine.recipeSeed);
    assert.match(debateReason(s, ids[1], 1, 'talk'), /再历/);
    assert.deepEqual(importSave(exportSave(s, null)).save, sealSaveSnapshot(s));
  }
});
test('付费抄录不要求先解锁丹方对应秘境', () => {
  for (const tier of ['灵品', '珍品'] as const) {
    const { s, id, offer } = offered(tier);
    s.unlocked = 0;
    s.completed = [];
    s.cultivation = 1;
    assert.ok(medicineInfo(offer.id)!.stage > s.unlocked);
    assert.deepEqual(debateRecipeOffer(s, id), offer);
    const before = structuredClone(s);
    assert.ok(debateMarket(s, id, s.mortal.sectMarket!.visit, `pay:${offer.id}`));
    assert.equal(s.stones, before.stones - offer.price);
    assert.ok(s.medicine.recipes.includes(offer.id));
    assert.equal(s.unlocked, 0);
    assert.deepEqual(s.medicine.bag, before.medicine.bag);
  }
});
test('互授只能用实际已知、对方未知且同品级的丹方；讲过的内容随身份记住，重逢不重抽', () => {
  const { s, id, offer } = offered('灵品', true);
  const before = structuredClone(s);
  const choice = `swap:${offer.id}:${offer.exchange}`;
  assert.ok(debateMarket(s, id, 1, choice));
  assert.equal(s.stones, before.stones);
  assert.equal(s.age, before.age + 1);
  assert.ok(s.medicine.recipes.includes(offer.id));
  assert.ok(s.medicine.recipes.includes(offer.exchange!));
  assert.deepEqual(s.medicine.bag, before.medicine.bag);
  const c = marketContact(s, id)!;
  assert.deepEqual(c.taughtRecipes, [offer.exchange]);
  const loaded = importSave(exportSave(s, null)).save;
  assert.deepEqual(marketContact(loaded, id), c);
  loaded.age += 10;
  enterNextMarketBatch(loaded);
  enterNextMarketBatch(loaded);
  const slot = ids.find(
    (x) =>
      marketContact(loaded, x)?.birthVisit === c.birthVisit &&
      marketContact(loaded, x)?.slot === c.slot,
  )!;
  assert.ok(slot);
  const next = debateRecipeOffer(loaded, slot);
  assert.notEqual(next?.exchange, offer.exchange);
});
test('假丹方、越级、过期报价、未知或异品级互授全部原子拒绝', () => {
  const { s, id, offer } = offered('灵品', true);
  for (const choice of [
    'free',
    `pay:${offer.id}:extra`,
    `pay:butian`,
    `swap:${offer.id}:butian`,
    `swap:${offer.id}:xuling`,
    `swap:${offer.id}:${offer.id}`,
    'talk:extra',
  ]) {
    const old = JSON.stringify(s);
    assert.equal(debateMarket(s, id, 1, choice), undefined, choice);
    assert.equal(JSON.stringify(s), old);
  }
  const old = JSON.stringify(s);
  assert.equal(debateMarket(s, id, 2, `pay:${offer.id}`), undefined);
  assert.equal(JSON.stringify(s), old);
  s.medicine.recipes.push(offer.id);
  assert.equal(debateMarket(s, id, 1, `pay:${offer.id}`), undefined);
});
test('抄录预留全部跨期供奉，钱不足、寿尽、天劫和待办拒绝时没有部分扣费', () => {
  for (const failure of ['money', 'dues', 'age', 'tribulation', 'activity'] as const) {
    const { s, id, offer } = offered('灵品');
    s.stones = offer.price;
    if (failure === 'money') s.stones--;
    if (failure === 'dues')
      s.mortal.member = { id: 'power', dues: 50, dueAt: s.mortal.years + 0.5 };
    if (failure === 'age') s.age = 249.5;
    if (failure === 'tribulation') s.nextTribulationAge = s.age + 0.5;
    if (failure === 'activity')
      s.mortal.activity = { kind: 'tea', remaining: 1, total: 1, sect: null };
    const old = JSON.stringify(s);
    assert.equal(debateMarket(s, id, 1, `pay:${offer.id}`), undefined, failure);
    assert.equal(JSON.stringify(s), old);
  }
  const { s, id, offer } = offered('灵品');
  s.mortal.member = { id: 'power', dues: 50, dueAt: s.mortal.years + 0.5 };
  s.stones = offer.price + 50;
  assert.ok(debateMarket(s, id, 1, `pay:${offer.id}`));
  assert.equal(s.stones, 0);
});
test('普通买卖、聊天、仇怨及非本人不触发回礼；真实相助旧识一世仅一颗凡品', () => {
  const a = fixture();
  rememberMarketContact(a, ids[0]);
  rememberMarketTrade(a, ids[0]);
  enterNextMarketBatch(a);
  enterNextMarketBatch(a);
  assert.ok(ids.every((id) => debateThanks(a, id) === undefined));
  const { s, id } = reunion();
  const gift = debateThanks(s, id)!;
  assert.ok(gift);
  assert.equal(medicineInfo(gift)!.tier, '凡品');
  const old = structuredClone(s);
  const c = marketContact(s, id)!;
  c.grudge = 1;
  assert.equal(debateThanks(s, id), undefined);
  c.grudge = 0;
  assert.ok(debateMarket(s, id, s.mortal.sectMarket!.visit));
  assert.equal(s.medicine.bag[gift], 1);
  assert.equal(c.debateGiftAt, s.age);
  assert.ok(validMarketRelations(s.mortal.marketRelations, s.age, s.mortal.sectMarket));
  const loaded = importSave(exportSave(s, null)).save;
  loaded.age += 10;
  assert.equal(debateThanks(loaded, id), undefined);
  assert.ok(debateMarket(loaded, id, loaded.mortal.sectMarket!.visit));
  assert.equal(loaded.medicine.bag[gift], 1);
  assert.equal(old.medicine.bag[gift] || 0, 0);
  assert.equal(loaded.schema, SAVE_SCHEMA);
});
test('回礼溢出拒绝、赠药记录和讲方记录损坏导入拒绝，旧永久档可升级', () => {
  const { s, id } = reunion();
  const gift = debateThanks(s, id)!;
  s.medicine.bag[gift] = Number.MAX_SAFE_INTEGER;
  const old = JSON.stringify(s);
  assert.equal(debateMarket(s, id, s.mortal.sectMarket!.visit), undefined);
  assert.equal(JSON.stringify(s), old);
  s.medicine.bag[gift] = 0;
  for (const data of [
    { debateGiftAt: Infinity },
    { debateGiftAt: 14 },
    { taughtRecipes: ['butian'] },
    { taughtRecipes: ['heqi', 'heqi'] },
    { taughtRecipes: 'heqi' },
  ]) {
    const a = structuredClone(s);
    Object.assign(marketContact(a, id)!, data);
    assert.ok(!validMarketRelations(a.mortal.marketRelations, a.age, a.mortal.sectMarket));
    assert.throws(() => importSave(exportSave(a, null)));
  }
  const prior = structuredClone(s);
  prior.schema = SAVE_SCHEMA - 1;
  assert.equal(readSave(JSON.stringify(prior)).status, 'ok');
});
test('两端界面统一显示收费与互授，普通论道文字不再承诺保底赠药', () => {
  const { s, id, offer } = offered('灵品', true);
  const n = marketCultivators(s.mortal.population!, s.mortal.sectMarket!).find((n) => n.id === id)!;
  for (const html of [marketVenueContent(s, 'forum'), marketSocialContent(s, n)]) {
    assert.match(html, /80灵石/);
    assert.match(html, /互授丹方/);
    assert.match(html, /普通论道不发放丹药/);
    assert.match(html, /普通交流、抄录丹方、互授与讲法共用十年一次机会/);
    assert.doesNotMatch(html, /无合适丹方时赠/);
    assert.ok(html.includes(`pay:${offer.id}`));
    assert.ok(html.includes(`swap:${offer.id}:${offer.exchange}`));
  }
});
test('修士路由校验所点收费方式，普通论道不能暗换成付费或互授', () => {
  const { s, id, offer } = offered('灵品');
  const old = JSON.stringify(s);
  assert.equal(
    executeMarketSocial(s, 'sect-market-debate', id, 1, 0, false, `pay:${offer.id}`).ok,
    false,
  );
  assert.equal(JSON.stringify(s), old);
  assert.ok(
    executeMarketSocial(s, 'sect-market-debate-pay', id, 1, 0, false, `pay:${offer.id}`).ok,
  );
  assert.ok(s.medicine.recipes.includes(offer.id));
});

test('缺钱的抄录按钮可走原补给入口且包含供奉，冷却与寿尽仍禁用', () => {
  const { s, id } = offered('灵品');
  s.stones = 0;
  const npc = marketCultivators(s.mortal.population!, s.mortal.sectMarket!).find(
    (n) => n.id === id,
  )!;
  for (const html of [marketVenueContent(s, 'forum'), marketSocialContent(s, npc)]) {
    const buttons = [...html.matchAll(/<button[^>]+>/g)]
      .map((m) => m[0])
      .filter((b) => b.includes('pay:'));
    assert.ok(buttons.length);
    for (const b of buttons) {
      assert.doesNotMatch(b, /disabled/);
      assert.match(b, /data-cost-stones="(?:80|200)"/);
    }
  }
  s.mortal.marketSocial!.lastDebateAt = s.age;
  const button = marketSocialContent(s, npc).match(
    /<button[^>]+data-action="sect-market-debate-pay"[^>]+>/,
  )![0];
  assert.match(button, /disabled/);
});

test('八人名录满额时保留本批修士的已教丹方，不能删掉眼前人物的知识后再次交换同一方', () => {
  const s = fixture(1, 1);
  s.mortal.sectMarket!.visit = 30;
  s.mortal.sectMarket!.returning = undefined;
  s.mortal.marketSocial!.visit = 30;
  s.mortal.auction!.visit = 30;
  s.mortal.marketRelations = {
    contacts: [1, 2].flatMap((birthVisit) =>
      ids.map((slot) => ({
        birthVisit,
        slot,
        realmIndex: 1,
        metAt: 15,
        seenAt: 16,
        lastVisit: birthVisit,
        goodwill: 2,
        grudge: 0,
        dead: false,
        tradeVisit: birthVisit,
      })),
    ),
  };
  const id = ids[0];
  const pool = MEDICINES.filter((m) => m.years > 0 && m.tier === '珍品');
  s.medicine.recipes = pool
    .filter((m) => !['jiangyun', 'mingqing'].includes(m.id))
    .map((m) => m.id);
  const offer = debateRecipeOffer(s, id)!;
  assert.ok(offer?.exchange);
  assert.ok(debateMarket(s, id, 30, `swap:${offer.id}:${offer.exchange}`));
  const taught = structuredClone(marketContact(s, id)!.taughtRecipes);
  for (const other of ids.filter((o) => o !== id)) {
    assert.ok(retreat(s, 10, () => 0.5));
    assert.ok(debateMarket(s, other, 30));
  }
  assert.ok(validMarketRelations(s.mortal.marketRelations, s.age, s.mortal.sectMarket));
  assert.equal(s.mortal.marketRelations!.contacts.length, 8);
  assert.deepEqual(marketContact(s, id)?.taughtRecipes, taught);
  assert.notEqual(debateRecipeOffer(s, id)?.exchange, offer.exchange);
});

test('两入口在办理前明确显示额外到期供奉，不把抄录费冒充全部支出', () => {
  const { s, id } = offered('灵品');
  const npc = marketCultivators(s.mortal.population!, s.mortal.sectMarket!).find(
    (n) => n.id === id,
  )!;
  s.mortal.member = { id: 'power', dues: 50, dueAt: s.mortal.years + 0.5 };
  for (const html of [marketVenueContent(s, 'forum'), marketSocialContent(s, npc)]) {
    assert.match(html, /本次一年内到期供奉另计50灵石/);
    const paid = [...html.matchAll(/<button[^>]+>/g)]
      .map((m) => m[0])
      .filter((b) => b.includes('pay:'));
    assert.ok(paid.some((b) => b.includes('data-cost-stones="130"')));
  }
  s.mortal.member.dueAt = s.mortal.years + 2;
  assert.doesNotMatch(marketSocialContent(s, npc), /本次一年内到期供奉另计/);
});

test('纯交流后的冷却只说明可再交流，不再承诺未必存在的奖励', () => {
  const { s, id } = offered('灵品');
  assert.ok(debateMarket(s, id, s.mortal.sectMarket!.visit));
  assert.match(debateReason(s, id, s.mortal.sectMarket!.visit), /10 年可再交流/);
  assert.doesNotMatch(debateReason(s, id, s.mortal.sectMarket!.visit), /有所获/);
});
