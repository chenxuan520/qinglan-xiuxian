import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSave, readSave, SAVE_SCHEMA } from '../src/progress.ts';
import { Game } from '../src/game.ts';
import { importSave, exportSave } from '../src/save-transfer.ts';
import { beginSectMarketVisit } from '../src/sect-market.ts';
import {
  debateMarket,
  debateReason,
  debateReward,
  marketRequest,
  fulfillMarketRequest,
  marketOpportunity,
  opportunityReason,
  chooseMarketOpportunity,
  settleMarketAmbush,
} from '../src/market-social.ts';
import { marketCultivators, MARKET_CULTIVATORS } from '../src/sect-market-data.ts';
import { MEDICINES } from '../src/medicine-data.ts';
import { auctionValue } from '../src/auction.ts';
import { validMarketSocial } from '../src/market-social-data.ts';
import { marketSocialContent } from '../src/market-social-ui.ts';
const ids = MARKET_CULTIVATORS.map((n) => n.id);
function fixture(seed = 12345) {
  const s = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  s.prologueSeen = s.hometownSeen = true;
  s.mortal.hometown!.stage = 'departed';
  s.age = 30;
  s.runs = 1;
  s.cultivation = 1;
  s.stones = 10000;
  s.unlocked = 6;
  s.mortal.population = { seed, since: 15 };
  beginSectMarketVisit(s);
  return s;
}
function chance(kind: 'goods' | 'deposit' | 'haggle' | 'invitation', honest: boolean) {
  for (let seed = 1; seed < 10000; seed++) {
    const s = fixture(seed);
    for (const id of ids) {
      const o = marketOpportunity(s, id);
      if (o?.kind === kind && o.honest === honest) return { s, id, o };
    }
  }
  throw Error('missing fixture');
}
test('论道奖励与灵根、路线和本命文案相符，未知可用丹方或凡品入囊；不改药效配方和永久数值', () => {
  for (let seed = 1; seed < 20; seed++) {
    const s = fixture(seed);
    const id = ids[seed % 3];
    const reward = debateReward(s, id);
    const before = structuredClone(s);
    const r = debateMarket(s, id, 1)!;
    assert.ok(r);
    assert.equal(s.age, 31);
    assert.equal(s.mortal.years, 1);
    assert.equal(s.mortal.marketSocial!.lastDebateAt, 31);
    assert.match(r.text, /天灵根.*正道.*青霄剑/);
    assert.deepEqual(s.medicine.active, before.medicine.active);
    assert.deepEqual(s.medicine.used, before.medicine.used);
    assert.equal(s.medicine.recipeSeed, before.medicine.recipeSeed);
    assert.equal(s.cultivation, before.cultivation);
    if (reward.kind === 'recipe') {
      assert.ok(s.medicine.recipes.includes(reward.id));
      const m = MEDICINES.find((m) => m.id === reward.id)!;
      assert.ok(m.years > 0 && m.tier !== '凡品' && m.stage <= s.unlocked);
    } else assert.equal(s.medicine.bag[reward.id], 1);
  }
});
test('论道十年冷却跨NPC/访次/刷新/导入保持，全部丹方已知时只赠凡品，首关不提前送高阶方', () => {
  const s = fixture();
  s.unlocked = 0;
  const id = ids[0];
  assert.equal(debateReward(s, id).kind, 'medicine');
  debateMarket(s, id, 1);
  const at = s.age;
  beginSectMarketVisit(s);
  assert.match(debateReason(s, ids[1], 2), /再历/);
  assert.equal(debateMarket(s, ids[1], 2), undefined);
  const loaded = importSave(exportSave(s, null)).save;
  assert.equal(loaded.mortal.marketSocial!.lastDebateAt, at);
  loaded.age += 10;
  loaded.medicine.recipes = MEDICINES.filter((m) => m.years && m.tier !== '凡品').map((m) => m.id);
  assert.equal(debateReward(loaded, ids[1]).kind, 'medicine');
  assert.ok(debateMarket(loaded, ids[1], 2));
});
test('论道一年的寿元、天劫、供奉预检；不能使用未来报酬，半年旧拍卖规则不变', () => {
  for (const type of ['age', 'tribulation', 'dues', 'activity'] as const) {
    const s = fixture();
    if (type === 'age') s.age = 99;
    if (type === 'tribulation') s.nextTribulationAge = 31;
    if (type === 'dues') {
      s.mortal.member = { id: 'power', dues: 50, dueAt: 0.75 };
      s.stones = 49;
    }
    if (type === 'activity')
      s.mortal.activity = { kind: 'tea', remaining: 1, total: 1, sect: null };
    const old = JSON.stringify(s);
    assert.equal(debateMarket(s, ids[0], 1), undefined);
    assert.equal(JSON.stringify(s), old);
  }
  const s = fixture();
  s.mortal.member = { id: 'power', dues: 50, dueAt: 0.75 };
  s.stones = 50;
  assert.ok(debateMarket(s, ids[0], 1));
  assert.equal(s.stones, 0);
  assert.equal(s.age, 31);
  assert.ok(s.mortal.member.dueAt > 1);
});
test('求购单批稳定，物品/数量/品级符合修士，价格低于买入，半岁交货一次保存；药只扣bag', () => {
  let medicines = 0,
    artifacts = 0;
  for (let seed = 1; seed < 80; seed++) {
    const s = fixture(seed);
    const id = ids.find((id) => marketRequest(s, id))!;
    const offer = marketRequest(s, id)!;
    assert.ok(offer.price <= auctionValue(offer) * 0.95);
    assert.deepEqual(marketRequest(readSave(JSON.stringify(s)).save, id), offer);
    if (offer.kind === 'medicine') {
      medicines++;
      s.medicine.bag[offer.id] = offer.quantity + 1;
    } else {
      artifacts++;
      s.artifacts.push(offer.id);
      s.forge[offer.id] = offer.forgeLevel;
    }
    const active = structuredClone(s.medicine.active);
    assert.ok(fulfillMarketRequest(s, id, 1, offer.forgeLevel));
    assert.equal(s.age, 30.5);
    assert.ok(s.mortal.marketSocial!.fulfilled.includes(id));
    assert.deepEqual(s.medicine.active, active);
    assert.equal(fulfillMarketRequest(s, id, 1, offer.forgeLevel), undefined);
    if (offer.kind === 'medicine') assert.equal(s.medicine.bag[offer.id], 1);
    else {
      assert.ok(!s.artifacts.includes(offer.id));
      assert.equal(s.forge[offer.id], 0);
    }
  }
  assert.ok(medicines && artifacts);
});
test('求购本命、续局、过期visit、错误forge与物资不足均原子拒绝，丹药续局仍能交付', () => {
  let s = fixture();
  let id = ids.find((id) => marketRequest(s, id)?.kind === 'medicine')!;
  if (id) {
    const o = marketRequest(s, id)!;
    s.medicine.bag[o.id] = o.quantity;
    assert.ok(fulfillMarketRequest(s, id, 1, 0, true));
  }
  for (let seed = 1; seed < 100; seed++) {
    s = fixture(seed);
    id = ids.find((id) => marketRequest(s, id)?.kind === 'artifact')!;
    if (!id) continue;
    const o = marketRequest(s, id)!;
    s.artifacts.push(o.id);
    s.forge[o.id] = o.forgeLevel;
    s.starter = o.id;
    const old = JSON.stringify(s);
    assert.equal(fulfillMarketRequest(s, id, 1, o.forgeLevel), undefined);
    assert.equal(JSON.stringify(s), old);
    s.starter = 'sword';
    assert.equal(fulfillMarketRequest(s, id, 1, o.forgeLevel, true), undefined);
    assert.equal(fulfillMarketRequest(s, id, 2, o.forgeLevel), undefined);
    assert.equal(fulfillMarketRequest(s, id, 1, o.forgeLevel + 1), undefined);
    break;
  }
});
test('假货及垫款骗局损失有上限，不产生伪药/改永久效果，不可重复；重进仍有十年限次', () => {
  for (const kind of ['goods', 'deposit'] as const) {
    const { s, id, o } = chance(kind, false);
    const before = structuredClone(s);
    const result = chooseMarketOpportunity(s, id, 1, 'accept')!;
    assert.equal(result.kind, 'fraud');
    assert.equal(s.stones, before.stones - (kind === 'goods' ? o.deposit : o.cost));
    assert.ok(o.deposit <= 80);
    assert.deepEqual(s.medicine, before.medicine);
    assert.equal(s.age, 30.5);
    assert.equal(chooseMarketOpportunity(s, id, 1, 'accept'), undefined);
    assert.ok(validMarketSocial(s.mortal.marketSocial, s.age, s.mortal.sectMarket));
    beginSectMarketVisit(s);
    const next = ids.find((id) => marketOpportunity(s, id))!;
    assert.equal(chooseMarketOpportunity(s, next, 2, 'accept'), undefined);
  }
});
test('核验能揭露假货、骗款、伏击；婉拒不扣钱，真机缘赠药/垫款退还，虚高报价明示价差', () => {
  for (const kind of ['goods', 'deposit', 'invitation'] as const) {
    const { s, id } = chance(kind, false);
    const before = s.stones;
    const r = chooseMarketOpportunity(s, id, 1, 'inspect')!;
    assert.equal(r.kind, 'exposed');
    assert.equal(s.age, 30.5);
    assert.equal(s.stones, before);
    assert.equal(chooseMarketOpportunity(s, id, 1, 'accept'), undefined);
    assert.ok(chooseMarketOpportunity(s, id, 1, 'decline'));
    assert.equal(s.stones, before);
  }
  for (const kind of ['goods', 'deposit', 'invitation', 'haggle'] as const) {
    const { s, id, o } = chance(kind, true);
    s.medicine.bag[o.item.id] = 2;
    const before = s.stones;
    const r = chooseMarketOpportunity(s, id, 1, 'accept')!;
    assert.ok(r);
    if (kind === 'deposit') {
      assert.equal(s.stones, before + o.price);
      assert.equal(s.medicine.bag[o.item.id], 1);
    } else {
      assert.equal(s.medicine.bag[o.item.id], 3);
      if (kind === 'invitation') assert.equal(s.stones, before);
    }
  }
});
test('伏击开始预扣+一年+ongoing+限次同存；胜利退款仅一次，败退损失封顶；import按脱身', () => {
  for (const outcome of ['victory', 'defeat', 'escaped'] as const) {
    const { s, id, o } = chance('invitation', false);
    const before = s.stones;
    chooseMarketOpportunity(s, id, 1, 'accept');
    assert.equal(s.age, 31);
    assert.equal(s.stones, before - o.cost);
    assert.ok(s.mortal.marketSocial!.ambush);
    assert.equal(beginSectMarketVisit(s), false);
    assert.equal(debateMarket(s, id, 1), undefined);
    const r = settleMarketAmbush(s, outcome)!;
    assert.equal(r.kind, outcome);
    assert.equal(s.stones, outcome === 'victory' ? before : before - o.cost);
    assert.equal(settleMarketAmbush(s, 'victory'), undefined);
    assert.equal(s.mortal.marketSocial!.ambush, null);
  }
  const { s, id, o } = chance('invitation', false);
  chooseMarketOpportunity(s, id, 1, 'accept');
  const raw = JSON.stringify(s);
  assert.ok(readSave(raw).save.mortal.marketSocial!.ambush);
  const imported = importSave(exportSave(s, null)).save;
  assert.equal(imported.mortal.marketSocial!.ambush, null);
  assert.equal(imported.stones, 10000 - o.cost);
  assert.equal(imported.mortal.marketSocial!.logs[0].kind, 'escaped');
});
test('不允许未完成历练赴约，冷却及物资上限不溢出，原快照/其他永久进度保持', () => {
  const { s, id } = chance('invitation', false);
  const old = JSON.stringify(s);
  assert.equal(chooseMarketOpportunity(s, id, 1, 'accept', true), undefined);
  assert.equal(JSON.stringify(s), old);
  const normal = fixture();
  const game = new Game(normal, 0, 0, () => 0.5);
  game.pause();
  const snapshot = game.snapshot();
  debateMarket(normal, ids[0], 1);
  assert.deepEqual(game.snapshot(), snapshot);
  assert.ok(Game.restore(normal, snapshot));
  assert.equal(normal.schema, SAVE_SCHEMA);
  const full = fixture();
  const reward = debateReward(full, ids[0]);
  if (reward.kind === 'medicine') {
    full.medicine.bag[reward.id] = Number.MAX_SAFE_INTEGER;
    assert.equal(debateMarket(full, ids[0], 1), undefined);
  }
});
test('损坏社交字段正常读档保留其余进度，导入拒绝；日志HTML被转义，细节默认折叠', () => {
  const s = fixture();
  s.mortal.marketSocial!.fulfilled = [ids[0], ids[0]];
  assert.ok(!validMarketSocial(s.mortal.marketSocial, s.age, s.mortal.sectMarket));
  assert.equal(readSave(JSON.stringify(s)).save.mortal.marketSocial, undefined);
  assert.throws(() => importSave(exportSave(s, null)), /损坏/);
  const safe = fixture();
  safe.mortal.marketSocial!.logs = [
    { visit: 1, npcId: ids[0], at: 30, kind: 'debate', text: '<img src=x onerror="alert(1)">' },
  ];
  const html = marketSocialContent(
    safe,
    marketCultivators(safe.mortal.population!, safe.mortal.sectMarket!)[0],
  );
  assert.ok(html.includes('&lt;img'));
  assert.doesNotMatch(html, /<details[^>]*open/);
  assert.doesNotMatch(html, /<img src=x/);
});

test('弱肉强食见闻不额外计龄，高于玩家的强横求购按70%明示；真仙玩家不被低阶压价', () => {
  let found = false;
  for (let seed = 1; seed < 500; seed++) {
    const s = fixture(seed);
    const id = ids.find((id) => marketRequest(s, id));
    if (!id) continue;
    const n = marketCultivators(s.mortal.population!, s.mortal.sectMarket!).find(
      (n) => n.id === id,
    )!;
    const o = marketRequest(s, id)!;
    if (n.realmIndex > 0 && o.price === Math.floor(auctionValue(o) * 0.7)) {
      found = true;
      assert.ok(o.price < auctionValue(o) * 0.85);
      const old = s.age;
      assert.ok(marketSocialContent(s, n).includes(`${o.price.toLocaleString('zh-CN')} 灵石`));
      assert.equal(s.age, old);
      s.cultivation = 1e9;
      s.completed = [6];
      assert.ok(marketRequest(s, id)!.price >= Math.floor(auctionValue(o) * 0.85));
      break;
    }
  }
  assert.ok(found);
});

test('非整数年岁刚获收获时显示十年冷却，不因浮点误差额外显示0.1年', () => {
  const s = fixture();
  s.age = 31.17082666666666;
  s.mortal.marketSocial!.lastDebateAt = s.age;
  assert.match(debateReason(s, ids[0], 1), /再历 10 年/);
  const c = chance('goods', true);
  c.s.age = s.age;
  c.s.mortal.marketSocial!.lastOpportunityAt = s.age;
  assert.match(opportunityReason(c.s, c.id, 1, 'accept'), /尚需 10 年/);
});

test('法宝交货清除炼器后，界面展示已结算，不把零阶库存写成下一次交付', () => {
  for (let seed = 1; seed < 200; seed++) {
    const s = fixture(seed);
    const n = marketCultivators(s.mortal.population!, s.mortal.sectMarket!).find(
      (n) => marketRequest(s, n.id)?.kind === 'artifact',
    );
    if (!n) continue;
    const offer = marketRequest(s, n.id)!;
    s.artifacts.push(offer.id);
    s.forge[offer.id] = Math.max(offer.minimumLevel, 3);
    assert.ok(fulfillMarketRequest(s, n.id, 1, s.forge[offer.id]));
    assert.equal(s.forge[offer.id], 0);
    const html = marketSocialContent(s, n);
    assert.match(html, /本批委托已完成/);
    assert.doesNotMatch(html, /实际将交出炼器 0 阶/);
    assert.ok(validMarketSocial(s.mortal.marketSocial, s.age, s.mortal.sectMarket));
    return;
  }
  assert.fail('缺少法宝求购样本');
});
