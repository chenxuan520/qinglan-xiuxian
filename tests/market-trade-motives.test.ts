import { enterNextMarketBatch } from './market-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSave, readSave } from '../src/progress.ts';
import { MEDICINES, medicineInfo } from '../src/medicine-data.ts';
import { TREASURES } from '../src/data.ts';
import {
  beginSectMarketVisit,
  sectMarketOffer,
  sectMarketDeals,
  exchangeSectMedicine,
  sectMarketExchangeReason,
} from '../src/sect-market.ts';
import {
  MARKET_CULTIVATORS,
  marketCultivatorRealm,
  marketIdentity,
  type MarketTraderId,
} from '../src/sect-market-data.ts';
import { marketTradeMotive, marketTradeMedicineAllowed } from '../src/market-trade-motives.ts';
import { rememberMarketContact } from '../src/market-relations.ts';
import { auctionValue } from '../src/auction-items.ts';

function fixture(seed = 12345) {
  const save = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  save.cultivation = 1;
  save.mortal.population = { seed, since: 15 };
  save.medicine.recipeSeed = seed;
  save.artifacts = TREASURES.map((t) => t.id);
  for (const item of TREASURES) save.forge[item.id] = 1;
  for (const medicine of MEDICINES) save.medicine.bag[medicine.id] = 100;
  enterNextMarketBatch(save);
  return save;
}
function bringBack(save: ReturnType<typeof fixture>, id: MarketTraderId, slot: MarketTraderId) {
  const contact = rememberMarketContact(save, id)!;
  contact.goodwill = 2;
  contact.tradeVisit = 1;
  save.mortal.sectMarket = {
    ...save.mortal.sectMarket!,
    visit: 3,
    exchanged: [],
    returning: [
      {
        slot,
        birthVisit: contact.birthVisit,
        birthSlot: contact.slot,
        realmIndex: contact.realmIndex,
      },
    ],
  };
  save.mortal.marketSocial!.visit = 3;
  save.mortal.auction!.visit = 3;
  return contact;
}

test('四类动机均来自本人自述，只求实际存在且符合境界用途的药物，展示纯读且不看玩家库存', () => {
  const kinds = new Set<string>();
  for (let seed = 1; seed <= 90; seed++) {
    const save = fixture(seed);
    for (const npc of MARKET_CULTIVATORS) {
      const raw = JSON.stringify(save),
        motive = marketTradeMotive(save, npc.id)!,
        realm = marketCultivatorRealm(save.mortal.population!, save.mortal.sectMarket!, npc.id),
        offered = sectMarketOffer(save, npc.id)!;
      kinds.add(motive.kind);
      assert.ok(motive.disclosure.startsWith('「'));
      assert.ok(motive.preferredMedicineIds.length);
      assert.equal(new Set(motive.preferredMedicineIds).size, motive.preferredMedicineIds.length);
      for (const medicineId of motive.preferredMedicineIds) {
        assert.ok(marketTradeMedicineAllowed(medicineInfo(medicineId)!, realm));
        assert.match(motive.disclosure, new RegExp(medicineInfo(medicineId)!.name));
        assert.notEqual(offered.id, medicineId, '不出售自己正急求的药');
      }
      if (motive.kind === 'longevity') {
        assert.ok(realm >= 6);
        assert.deepEqual(motive.preferredMedicineIds, ['huiyang']);
      }
      if (motive.kind === 'cultivation') assert.ok(realm >= 1);
      for (const weaponId of motive.preferredWeaponIds)
        assert.ok(TREASURES.some((t) => t.id === weaponId));
      assert.deepEqual(marketTradeMotive(save, npc.id), motive);
      assert.equal(JSON.stringify(save), raw);
      const empty = structuredClone(save);
      empty.medicine.bag = {};
      empty.artifacts = [empty.starter];
      assert.deepEqual(marketTradeMotive(empty, npc.id), motive);
    }
  }
  assert.deepEqual([...kinds].sort(), ['cultivation', 'journey', 'longevity', 'recovery']);
});

test('动机和所留丹药绑定实际旧识，换摊位及再次来访不换人，不因聊天增加照应', () => {
  const save = fixture(825),
    firstId = 'market-alchemist',
    currentId = 'market-wanderer',
    oldMotive = marketTradeMotive(save, firstId)!,
    oldMedicine = sectMarketOffer(save, firstId)!;
  const contact = bringBack(save, firstId, currentId);
  const returned = marketTradeMotive(save, currentId)!;
  assert.equal(returned.kind, oldMotive.kind);
  assert.deepEqual(returned.preferredMedicineIds, oldMotive.preferredMedicineIds);
  assert.deepEqual(returned.preferredWeaponIds, oldMotive.preferredWeaponIds);
  assert.equal(sectMarketOffer(save, currentId), oldMedicine);
  assert.equal(returned.friend, true);
  assert.match(returned.friendText, /留着同样的余丹/);
  assert.notDeepEqual(
    marketIdentity(save.mortal.sectMarket!, firstId),
    marketIdentity(save.mortal.sectMarket!, currentId),
  );
  assert.equal(marketTradeMotive(save, firstId)!.friend, false);
  const before = JSON.stringify(save);
  for (let i = 0; i < 30; i++) marketTradeMotive(save, currentId);
  assert.equal(JSON.stringify(save), before);
  contact.goodwill = 1;
  assert.equal(marketTradeMotive(save, currentId)!.friend, false);
  contact.goodwill = 2;
  contact.grudge = 1;
  assert.equal(marketTradeMotive(save, currentId)!.friend, false);
  contact.grudge = 0;
  const loaded = readSave(JSON.stringify(save));
  assert.equal(loaded.status, 'ok');
  assert.equal(marketTradeMotive(loaded.save, currentId)!.friend, true);
  assert.equal(sectMarketOffer(loaded.save, currentId), oldMedicine);
});

test('合用之物与故交报价实际减少补差且允许低阶添头，普通组合不增值、少量急需让利受限且不碰当前本命', () => {
  let ordinaryMatches = 0,
    friendMatches = 0,
    extraCombination = 0;
  for (let seed = 1; seed <= 45; seed++) {
    for (const npc of MARKET_CULTIVATORS) {
      const save = fixture(seed),
        original = sectMarketDeals(save, npc.id);
      const contact = bringBack(save, npc.id, npc.id);
      contact.goodwill = 1;
      const withoutFriend = sectMarketDeals(save, npc.id),
        unassistedIds = new Set(withoutFriend.map((d) => d.id));
      contact.goodwill = 2;
      const withFriend = sectMarketDeals(save, npc.id);
      assert.ok(withFriend.length > 0 && withFriend.length <= 9);
      for (const [deals, limit] of [
        [original, 108],
        [withFriend, 105],
      ] as const) {
        for (const deal of deals) {
          assert.equal(
            deal.giveValue,
            deal.give.reduce((n, item) => n + auctionValue(item), 0),
          );
          if (deal.receiveValue > deal.giveValue) {
            assert.ok(deal.receiveValue * 100 <= deal.giveValue * 108);
            assert.ok(deal.motiveMatched);
            assert.match(deal.benefitText, /急需让利/);
          }
          assert.ok(deal.giveValue * 100 <= deal.receiveValue * 115);
          assert.ok(
            deal.give.every((item) => item.id !== save.starter || item.kind !== 'artifact'),
          );
          assert.ok(deal.give.every((item) => item.quantity >= 1 && item.quantity <= 12));
          assert.ok(deal.receive.quantity >= 1 && deal.receive.quantity <= 6);
          if (deal.motiveMatched) {
            assert.ok(deal.giveValue * 100 <= deal.receiveValue * limit);
            if (deal.receiveValue <= deal.giveValue)
              assert.match(deal.benefitText, limit === 105 ? /5%/ : /8%/);
            if (limit === 105) friendMatches++;
            else ordinaryMatches++;
          }
        }
      }
      if (
        withFriend.some(
          (d) =>
            d.category === 'medicines' &&
            d.receive.quantity > 1 &&
            d.motiveMatched &&
            !unassistedIds.has(d.id),
        )
      )
        extraCombination++;
      assert.deepEqual(sectMarketDeals(save, npc.id), withFriend);
    }
  }
  assert.ok(ordinaryMatches > 10);
  assert.ok(friendMatches > 10);
  assert.ok(extraCombination > 0, '故交需要实际提供拆分大份和余丹补差，而不只是文案');
});

test('旧识照应仍每人每批一次，过期/缺货/死亡/历练/身陨边界不能绕过或部分扣款', () => {
  const save = fixture(825),
    id = 'market-alchemist';
  bringBack(save, id, id);
  const deal = sectMarketDeals(save, id).find((d) => d.motiveMatched)!;
  assert.ok(deal);
  const raw = JSON.stringify(save);
  assert.equal(exchangeSectMedicine(save, id, deal.id, 2), false);
  assert.equal(JSON.stringify(save), raw);
  const lacking = structuredClone(save);
  lacking.medicine.bag = {};
  lacking.artifacts = [lacking.starter];
  assert.equal(exchangeSectMedicine(lacking, id, deal.id, 3), false);
  assert.ok(sectMarketExchangeReason(lacking, id, deal.id, 3));
  const dead = structuredClone(save);
  dead.mortal.marketRelations!.contacts[0].dead = true;
  assert.equal(marketTradeMotive(dead, id), undefined);
  assert.equal(exchangeSectMedicine(dead, id, deal.id, 3), false);
  for (const ended of ['lifespan', 'ambush'] as const) {
    const terminal = structuredClone(save);
    terminal.pendingReincarnation = ended;
    assert.equal(marketTradeMotive(terminal, id), undefined);
    assert.equal(exchangeSectMedicine(terminal, id, deal.id, 3), false);
  }
  const artifact = sectMarketDeals(save, id).find((d) =>
    d.give.some((item) => item.kind === 'artifact'),
  );
  if (artifact) assert.equal(exchangeSectMedicine(save, id, artifact.id, 3, true), false);
  const before = structuredClone(save);
  assert.equal(exchangeSectMedicine(save, id, deal.id, 3), true);
  assert.equal(
    save.medicine.bag[deal.receive.id],
    before.medicine.bag[deal.receive.id] + deal.receive.quantity,
  );
  assert.equal(save.stones, before.stones);
  assert.equal(save.age, before.age);
  const done = JSON.stringify(save);
  assert.equal(exchangeSectMedicine(save, id, deal.id, 3), false);
  assert.equal(JSON.stringify(save), done);
  assert.equal(readSave(JSON.stringify(save)).status, 'ok');
});

test('持续与新来客交易十二批，已培养故交仍能自然重逢使用留货报价', () => {
  const save = fixture(1);
  let establishedReturns = 0;
  for (let visit = 1; visit <= 12; visit++) {
    if (visit > 1) assert.equal(enterNextMarketBatch(save), true);
    for (const { id } of MARKET_CULTIVATORS) {
      if (marketTradeMotive(save, id)?.friend) {
        establishedReturns++;
        assert.ok(sectMarketDeals(save, id).some((deal) => deal.motiveMatched));
      }
      const deal = sectMarketDeals(save, id).find((deal) =>
        deal.give.every(
          (item) => item.kind === 'medicine' && (save.medicine.bag[item.id] || 0) >= item.quantity,
        ),
      );
      assert.ok(deal, '库存充足时应有正常换物报价');
      assert.equal(exchangeSectMedicine(save, id, deal.id, visit), true);
      assert.ok(save.mortal.marketRelations!.contacts.length <= 8);
    }
    const restored = readSave(JSON.stringify(save));
    assert.equal(restored.status, 'ok');
    assert.deepEqual(restored.save.mortal.marketRelations, save.mortal.marketRelations);
  }
  assert.ok(establishedReturns >= 1, '不能只在交换完成后短暂达成交情，再在下一次重逢前遗忘');
});

test('少量急需互换真正让利，同批最多一席且价值提升封顶，不能重进或读档连换', () => {
  let profitableBatches = 0;
  for (let seed = 1; seed <= 120; seed++) {
    const save = fixture(seed);
    const quotes = MARKET_CULTIVATORS.map((npc) => ({
      id: npc.id,
      deals: sectMarketDeals(save, npc.id),
    }));
    const favorable = quotes.filter((q) => q.deals.some((d) => d.receiveValue > d.giveValue));
    assert.ok(favorable.length <= 1, '同批不能串起多个让利摊位');
    for (const q of quotes)
      for (const d of q.deals) {
        if (d.receiveValue > d.giveValue) {
          assert.ok(d.motiveMatched);
          assert.ok(d.receiveValue * 100 <= d.giveValue * 108);
          assert.match(
            d.benefitText,
            new RegExp(`多换得${d.receiveValue - d.giveValue}灵石参考价值`),
          );
          // 单次最多多8%价值，按新拍卖最高九成净回收也低于交出的原估值。
          assert.ok(Math.floor(d.receiveValue * 0.9) < d.giveValue);
        } else assert.ok(d.giveValue * 100 <= d.receiveValue * 115);
      }
    if (!favorable.length) continue;
    profitableBatches++;
    const { id, deals } = favorable[0];
    const deal = deals.find((d) => d.receiveValue > d.giveValue)!;
    const before = structuredClone(save.medicine.bag);
    const age = save.age,
      stones = save.stones;
    const rawQuotes = sectMarketDeals(save, id);
    const empty = structuredClone(save);
    empty.medicine.bag = {};
    // 展示顺序可优先已持有物品，但库存不能改变哪位修士提供让利。
    assert.deepEqual(
      MARKET_CULTIVATORS.filter((npc) =>
        sectMarketDeals(empty, npc.id).some((d) => d.receiveValue > d.giveValue),
      ).map((npc) => npc.id),
      [id],
    );
    assert.deepEqual(sectMarketDeals(readSave(JSON.stringify(save)).save, id), rawQuotes);
    assert.equal(exchangeSectMedicine(save, id, deal.id, save.mortal.sectMarket!.visit), true);
    assert.equal(save.age, age, '让利互换本身不消耗年岁');
    assert.equal(save.stones, stones, '参考估值差不直接发灵石');
    for (const item of deal.give)
      assert.equal(save.medicine.bag[item.id], before[item.id] - item.quantity);
    assert.equal(
      save.medicine.bag[deal.receive.id],
      before[deal.receive.id] + deal.receive.quantity,
    );
    const visit = save.mortal.sectMarket!.visit;
    assert.equal(beginSectMarketVisit(save), true);
    assert.equal(save.mortal.sectMarket!.visit, visit);
    for (const restored of [save, readSave(JSON.stringify(save)).save]) {
      const old = JSON.stringify(restored);
      assert.match(
        sectMarketExchangeReason(restored, id, deal.id, restored.mortal.sectMarket!.visit),
        /本批已互换/,
      );
      assert.equal(
        exchangeSectMedicine(restored, id, deal.id, restored.mortal.sectMarket!.visit),
        false,
      );
      assert.equal(JSON.stringify(restored), old);
    }
  }
  assert.ok(profitableBatches > 0, '必须实际存在玩家小赚的报价');
  assert.ok(profitableBatches < 40, '不能把少数急需做成普遍让利');
});

test('旧识换摊与好感改变不能多出第二位让利者，贫富与死亡也不转移席位', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const save = fixture(seed);
    const contact = bringBack(save, 'market-alchemist', 'market-disciple');
    const favorableIds = (s: typeof save) =>
      MARKET_CULTIVATORS.filter((npc) =>
        sectMarketDeals(s, npc.id).some((d) => d.receiveValue > d.giveValue),
      ).map((npc) => npc.id);
    const ids = favorableIds(save);
    assert.ok(ids.length <= 1);
    contact.goodwill = 3;
    assert.deepEqual(favorableIds(save), ids);
    const empty = structuredClone(save);
    empty.stones = 0;
    empty.medicine.bag = {};
    assert.deepEqual(favorableIds(empty), ids);
    if (ids.length) {
      save.mortal.sectMarket!.absent = [ids[0]];
      assert.deepEqual(favorableIds(save), [], '让利者离场后不能转给另一位修士');
    }
  }
});
