import { enterNextMarketBatch } from './market-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSave, readSave } from '../src/progress.ts';
import {
  sectMarketDeals,
  exchangeSectMedicine,
  sectMarketExchangeReason,
} from '../src/sect-market.ts';
import {
  MARKET_CULTIVATORS,
  marketCultivators,
  marketIdentity,
  marketMedicinePool,
  validSectMarket,
} from '../src/sect-market-data.ts';
import {
  marketContact,
  rememberMarketContact,
  rememberMarketTrade,
  rememberMarketAmbush,
  marketKnownMemory,
  marketFriendClue,
} from '../src/market-relations.ts';
import { validMarketRelations } from '../src/market-relations-data.ts';
import {
  chooseMarketOpportunity,
  marketOpportunity,
  settleMarketAmbush,
  marketRequest,
  fulfillMarketRequest,
} from '../src/market-social.ts';
import { validMarketSocial } from '../src/market-social-data.ts';
import { marketSocialContent } from '../src/market-social-ui.ts';

const ids = MARKET_CULTIVATORS.map((n) => n.id);
function fixture(seed = 12345) {
  const s = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  s.prologueSeen = s.hometownSeen = true;
  s.mortal.hometown!.stage = 'departed';
  s.age = 30;
  s.cultivation = 1;
  s.stones = 10000;
  s.unlocked = 6;
  s.mortal.population = { seed, since: 15 };
  enterNextMarketBatch(s);
  return s;
}
function ambush() {
  for (let seed = 1; seed < 10000; seed++) {
    const s = fixture(seed);
    const id = ids.find((id) => {
      const o = marketOpportunity(s, id);
      return o?.kind === 'invitation' && !o.honest;
    });
    if (id) {
      chooseMarketOpportunity(s, id, 1, 'accept');
      return { s, id, a: s.mortal.marketSocial!.ambush! };
    }
  }
  throw Error('缺少伏击种子');
}
function outcome(s, kind: 'victory' | 'defeat' | 'escaped') {
  const snapshot = s.mortal.marketSocial.ambush.snapshot;
  snapshot.outcome = kind;
  if (kind === 'victory') snapshot.enemy.hp = 0;
  if (kind === 'defeat') snapshot.player.hp = 0;
  if (kind === 'escaped') {
    snapshot.time = 3;
    snapshot.retreatRequested = true;
    snapshot.retreatProgress = 2;
    snapshot.player.x = 28;
    snapshot.enemy.x = 470;
  }
}
test('真实身份以出生访次及原摊位保存，每三访次只回一名旧识，槽位变化不串记忆', () => {
  for (let seed = 1; seed <= 24; seed++) {
    const s = fixture(seed),
      old = marketCultivators(s.mortal.population!, s.mortal.sectMarket!)[0];
    rememberMarketTrade(s, old.id);
    const identity = marketIdentity(s.mortal.sectMarket!, old.id);
    enterNextMarketBatch(s);
    assert.equal(s.mortal.sectMarket!.returning, undefined);
    for (const id of ids) assert.equal(marketContact(s, id), undefined);
    enterNextMarketBatch(s);
    assert.equal(s.mortal.sectMarket!.returning!.length, 1);
    const returning = s.mortal.sectMarket!.returning![0];
    const npc = marketCultivators(s.mortal.population!, s.mortal.sectMarket!).find(
      (n) => n.id === returning.slot,
    )!;
    assert.deepEqual(marketIdentity(s.mortal.sectMarket!, npc.id), identity);
    assert.equal(npc.name, old.name);
    assert.equal(npc.realmIndex, old.realmIndex);
    assert.equal(npc.path, old.path);
    assert.equal(npc.role, old.role);
    assert.equal(marketContact(s, npc.id)!.goodwill, 1);
    assert.match(marketKnownMemory(s, npc.id), /旧识重逢/);
    for (const id of ids.filter((id) => id !== npc.id))
      assert.equal(marketContact(s, id), undefined);
    assert.deepEqual(
      marketCultivators(s.mortal.population!, s.mortal.sectMarket!),
      marketCultivators(s.mortal.population!, readSave(JSON.stringify(s)).save.mortal.sectMarket!),
    );
    assert.ok(validMarketRelations(s.mortal.marketRelations, s.age, s.mortal.sectMarket));
    assert.ok(
      marketMedicinePool(s.mortal.population!, s.mortal.sectMarket!, npc.id).every(
        (m) => m.tier === (npc.realmIndex === 0 ? '凡品' : npc.realmIndex < 3 ? '灵品' : '珍品'),
      ),
    );
  }
});
test('公平换物和求购结算才加善意，同人同访次不因多项服务或重开面板刷取', () => {
  const s = fixture();
  const id = ids[0],
    deal = sectMarketDeals(s, id).find((d) => d.category === 'medicine')!;
  for (const item of deal.give) s.medicine.bag[item.id] = item.quantity + 10;
  assert.equal(marketContact(s, id), undefined);
  assert.ok(exchangeSectMedicine(s, id, deal.id, 1));
  assert.equal(marketContact(s, id)!.goodwill, 1);
  const before = structuredClone(s);
  assert.equal(exchangeSectMedicine(s, id, deal.id, 1), false);
  assert.deepEqual(s, before);
  rememberMarketTrade(s, id);
  rememberMarketContact(s, id);
  assert.equal(marketContact(s, id)!.goodwill, 1);
  for (let seed = 1; seed < 100; seed++) {
    const q = fixture(seed);
    const qid = ids.find((id) => marketRequest(q, id)?.kind === 'medicine');
    if (!qid) continue;
    const offer = marketRequest(q, qid)!;
    q.medicine.bag[offer.id] = offer.quantity;
    assert.ok(fulfillMarketRequest(q, qid, 1, 0));
    assert.equal(marketContact(q, qid)!.goodwill, 1);
    rememberMarketTrade(q, qid);
    assert.equal(marketContact(q, qid)!.goodwill, 1);
    return;
  }
  assert.fail('缺少求购种子');
});
test('联系人只保留八位且真身份不复用，旧敌死亡不再重逢；同访次拒绝与死者交易', () => {
  const s = fixture();
  const deadNpc = marketCultivators(s.mortal.population!, s.mortal.sectMarket!)[0];
  rememberMarketTrade(s, ids[0]);
  rememberMarketAmbush(s, ids[0], 'victory');
  const dead = { ...marketIdentity(s.mortal.sectMarket!, ids[0]) };
  assert.match(sectMarketExchangeReason(s, ids[0], 'unknown', 1), /身死/);
  assert.match(marketSocialContent(s, deadNpc), /不再接待/);
  for (let i = 0; i < 30; i++) {
    enterNextMarketBatch(s);
    assert.ok(
      !(s.mortal.sectMarket!.returning ?? []).some(
        (r) => r.birthVisit === dead.birthVisit && r.birthSlot === dead.slot,
      ),
    );
    for (const id of ids) rememberMarketTrade(s, id);
    assert.ok(s.mortal.marketRelations!.contacts.length <= 8);
    assert.ok(validMarketRelations(s.mortal.marketRelations, s.age, s.mortal.sectMarket));
  }
});
test('返回映射、死者和错误境界无法伪装成旧识，损坏关系会拒绝校验', () => {
  const s = fixture();
  rememberMarketTrade(s, ids[0]);
  enterNextMarketBatch(s);
  enterNextMarketBatch(s);
  assert.ok(validSectMarket(s.mortal.sectMarket, s.age));
  const c = s.mortal.marketRelations!.contacts[0],
    r = s.mortal.sectMarket!.returning![0];
  c.dead = true;
  assert.equal(validMarketRelations(s.mortal.marketRelations, s.age, s.mortal.sectMarket), false);
  c.dead = false;
  r.realmIndex = (r.realmIndex + 1) % 8;
  assert.equal(validMarketRelations(s.mortal.marketRelations, s.age, s.mortal.sectMarket), false);
  r.realmIndex = c.realmIndex;
  c.tradeVisit = 99;
  assert.equal(validMarketRelations(s.mortal.marketRelations, s.age, s.mortal.sectMarket), false);
});
test('公开风险依据真实境界宗门旧怨，信息不泄露未核验真假；核验与正常交易不主动遇袭', () => {
  const { s, id } = ambush();
  const a = s.mortal.marketSocial!.ambush!;
  outcome(s, 'escaped');
  assert.ok(settleMarketAmbush(s, 'escaped'));
  assert.equal(marketContact(s, id)!.grudge, 1);
  const during = structuredClone(s);
  during.mortal.marketSocial!.ambush = a;
  assert.match(sectMarketExchangeReason(during, id, 'x', 1), /劫修遭遇/);
  for (let seed = 1; seed < 100; seed++) {
    const q = fixture(seed),
      qid = ids.find((id) => marketOpportunity(q, id)?.kind === 'invitation');
    if (!qid) continue;
    const o = marketOpportunity(q, qid)!;
    assert.ok(o.risk.clueCodes.includes('secluded-road'));
    assert.ok(o.risk.clueCodes.includes('bloodstain'));
    const serialized = JSON.stringify(o.risk);
    assert.doesNotMatch(serialized, /honest|truth/);
    q.mortal.member = { id: 'power', dues: 0, dueAt: 0 };
    const protectedRisk = marketOpportunity(q, qid)!.risk;
    assert.ok(protectedRisk.sectProtection);
    assert.ok(protectedRisk.clueCodes.includes('sect-backing'));
    assert.ok(chooseMarketOpportunity(q, qid, 1, 'inspect'));
    assert.equal(q.mortal.marketSocial!.ambush, null);
    break;
  }
});
test('快照未终局拒绝任意结算；胜利自动战利品只一次，炼器取更高值，死亡保留遭遇', () => {
  for (const kind of ['victory', 'escaped', 'defeat'] as const) {
    const { s, id, a } = ambush(),
      before = structuredClone(s);
    assert.equal(settleMarketAmbush(s, kind), undefined);
    assert.deepEqual(s, before);
    const loot = a.loot;
    for (const item of loot)
      if (item.kind === 'artifact') {
        s.artifacts.push(item.id);
        s.forge[item.id] = 10;
      }
    outcome(s, kind);
    assert.ok(validMarketSocial(s.mortal.marketSocial, s.age, s.mortal.sectMarket));
    const result = settleMarketAmbush(s, kind)!;
    assert.equal(result.kind, kind);
    if (kind === 'defeat') {
      assert.ok(s.mortal.marketSocial!.ambush);
      const ended = structuredClone(s);
      assert.ok(settleMarketAmbush(s, kind));
      assert.deepEqual(s, ended);
    } else {
      assert.equal(s.mortal.marketSocial!.ambush, null);
      const ended = structuredClone(s);
      assert.equal(settleMarketAmbush(s, kind), undefined);
      assert.deepEqual(s, ended);
      assert.equal(marketContact(s, id)!.dead, kind === 'victory');
    }
    if (kind === 'victory')
      for (const item of loot) {
        if (item.kind === 'medicine') assert.equal(s.medicine.bag[item.id], item.quantity);
        else assert.equal(s.forge[item.id], 10);
      }
  }
});
test('掉落数量溢出只留超额丹药，胜利与其他收益正常结算；全境界掉落符合携带资格', () => {
  const { s, a } = ambush();
  const item = a.loot.find((l) => l.kind === 'medicine')!;
  s.medicine.bag[item.id] = Number.MAX_SAFE_INTEGER;
  outcome(s, 'victory');
  const stones = s.stones;
  const result = settleMarketAmbush(s, 'victory');
  assert.ok(result);
  assert.match(result.text, /未能收取，留在战场/);
  assert.equal(s.stones, stones + a.held);
  assert.equal(s.medicine.bag[item.id], Number.MAX_SAFE_INTEGER);
  assert.equal(s.mortal.marketSocial!.ambush, null);
  assert.deepEqual(readSave(JSON.stringify(s)).save.medicine, s.medicine);
  assert.equal(settleMarketAmbush(s, 'victory'), undefined);
  assert.equal(s.stones, stones + a.held);
  let artifact = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const q = fixture(seed),
      id = ids.find((id) => {
        const o = marketOpportunity(q, id);
        return o?.kind === 'invitation' && !o.honest;
      });
    if (!id) continue;
    chooseMarketOpportunity(q, id, 1, 'accept');
    const fight = q.mortal.marketSocial!.ambush!;
    assert.ok(validMarketSocial(q.mortal.marketSocial, q.age, q.mortal.sectMarket));
    assert.deepEqual(readSave(JSON.stringify(q)).save.mortal.marketSocial!.ambush, fight);
    artifact += fight.loot.filter((l) => l.kind === 'artifact').length;
    assert.deepEqual(
      fight.npc,
      marketCultivators(q.mortal.population!, q.mortal.sectMarket!).find((n) => n.id === id),
    );
  }
  assert.ok(artifact > 0);
});

test('八人淘汰保护本访次重逢者及进行中遭遇，九次换批仍可完整读取', () => {
  const s = fixture(1);
  for (let visit = 1; visit <= 9; visit++) {
    if (visit > 1) enterNextMarketBatch(s);
    for (const id of ids) {
      rememberMarketTrade(s, id);
      assert.ok(validMarketRelations(s.mortal.marketRelations, s.age, s.mortal.sectMarket));
      assert.deepEqual(
        readSave(JSON.stringify(s)).save.mortal.marketRelations,
        s.mortal.marketRelations,
      );
    }
  }
});

test('本批核验真伪不因随后交易、突破或宗门身份变化翻转，纯展示不写存档', () => {
  const s = fixture(11),
    id = 'market-disciple';
  const offer = marketOpportunity(s, id)!;
  assert.equal(offer.kind, 'invitation');
  assert.equal(offer.honest, false);
  assert.ok(chooseMarketOpportunity(s, id, 1, 'inspect'));
  const deal = sectMarketDeals(s, id).find((d) => d.category === 'medicine')!;
  for (const item of deal.give) s.medicine.bag[item.id] = item.quantity + 10;
  assert.ok(exchangeSectMedicine(s, id, deal.id, 1));
  s.cultivation = 1e8;
  s.completed = [6];
  s.mortal.member = { id: 'power', dues: 0, dueAt: 0 };
  const before = JSON.stringify(s);
  assert.equal(marketOpportunity(s, id)!.honest, false);
  assert.match(
    marketSocialContent(
      s,
      marketCultivators(s.mortal.population!, s.mortal.sectMarket!).find((n) => n.id === id)!,
    ),
    /已查出骗局/,
  );
  assert.equal(JSON.stringify(s), before);
  assert.equal(marketOpportunity(readSave(before).save, id)!.honest, false);
});

test('重逢劫修战死后离开本批摊位，保存可读取且后续不复活、不串为新摊主', () => {
  let found = false;
  for (let seed = 1; seed < 500; seed++) {
    const s = fixture(seed);
    for (const id of ids) rememberMarketTrade(s, id);
    enterNextMarketBatch(s);
    enterNextMarketBatch(s);
    const r = s.mortal.sectMarket!.returning![0],
      offer = marketOpportunity(s, r.slot);
    if (offer?.kind !== 'invitation' || offer.honest) continue;
    assert.ok(chooseMarketOpportunity(s, r.slot, 3, 'accept'));
    outcome(s, 'victory');
    assert.ok(settleMarketAmbush(s, 'victory'));
    assert.ok(s.mortal.sectMarket!.absent!.includes(r.slot));
    assert.equal(
      marketCultivators(s.mortal.population!, s.mortal.sectMarket!).find((n) => n.id === r.slot),
      undefined,
    );
    assert.ok(validMarketRelations(s.mortal.marketRelations, s.age, s.mortal.sectMarket));
    const loaded = readSave(JSON.stringify(s)).save;
    assert.deepEqual(loaded.mortal.marketRelations, s.mortal.marketRelations);
    assert.deepEqual(loaded.mortal.sectMarket, s.mortal.sectMarket);
    assert.match(sectMarketExchangeReason(loaded, r.slot, 'x', 3), /身死/);
    found = true;
    break;
  }
  assert.ok(found);
});

test('旧识提醒重建历史姓名不受当前死者离场影响，提示只谈具体凭据不泄露真伪', () => {
  const s = fixture(1);
  rememberMarketTrade(s, ids[0]);
  enterNextMarketBatch(s);
  enterNextMarketBatch(s);
  const returning = s.mortal.sectMarket!.returning![0];
  rememberMarketTrade(s, returning.slot);
  s.mortal.sectMarket!.absent = [ids[0]];
  const before = JSON.stringify(s),
    clue = marketFriendClue(s, 'invitation');
  assert.match(clue, /旧识.*接应人.*凭据/);
  assert.doesNotMatch(clue, /这是一场伏击|已查出骗局/);
  assert.equal(JSON.stringify(s), before);
});
