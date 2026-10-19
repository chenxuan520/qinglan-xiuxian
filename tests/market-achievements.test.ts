import test from 'node:test';
import assert from 'node:assert/strict';
import {
  freshSave,
  parseSave,
  realmCost,
  settleRun,
  applyBirthInheritance,
} from '../src/progress.ts';
import {
  chronicleAchievements,
  recordChronicle,
  recordCurioAchievement,
} from '../src/chronicle.ts';
import { CURIO_IDS, freshCurios, grantCurio, curioCycle, type CurioId } from '../src/curio-data.ts';
import { debugGrant } from '../src/debug-resources.ts';
import { joinSect } from '../src/mortal.ts';
import { curioSeekingQuote, seekCurio } from '../src/curio-market.ts';
import { venueStamp } from '../src/market-venues.ts';
import { beginSectMarketVisit, sectMarketDeals, exchangeSectMedicine } from '../src/sect-market.ts';
import { prepareAuction, auctionFee, releaseAuctionItem } from '../src/auction.ts';
import { auctionLots, buyAuction, sellAuction } from '../src/auction-trade.ts';
import { AUCTION_CURIO_LOT } from '../src/auction-data.ts';
import {
  prepareMarketSocial,
  marketOpportunity,
  chooseMarketOpportunity,
} from '../src/market-social.ts';
import { MARKET_CULTIVATORS } from '../src/sect-market-data.ts';
import { enterNextMarketBatch } from './market-fixture.ts';
import { MEDICINES } from '../src/medicine-data.ts';
import { TREASURES } from '../src/data.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';

function ready(seed = 12345) {
  const save = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  save.prologueSeen = save.hometownSeen = true;
  save.mortal.hometown!.stage = 'departed';
  save.cultivation = Array.from({ length: 18 }, (_, i) => realmCost(i)).reduce((a, b) => a + b, 0);
  save.unlocked = 6;
  save.age = 30;
  save.stones = 1000000;
  save.mortal.population = { seed, since: 15 };
  save.medicine.recipeSeed = seed;
  beginSectMarketVisit(save);
  prepareAuction(save);
  return save;
}
const has = (save: ReturnType<typeof freshSave>, id: string) =>
  Object.hasOwn(save.chronicle.milestones, id);
const curioItem = (id: string) => ({ kind: 'curio' as const, id, quantity: 1, forgeLevel: 0 });
function twoCurios(save: ReturnType<typeof freshSave>, except?: string) {
  for (const id of CURIO_IDS.filter((id) => id !== except).slice(0, 2)) {
    assert.equal(grantCurio(save, id), true);
    releaseAuctionItem(save, curioItem(id));
  }
}

test('奇珍有缘按本世曾获去重计数，售出仍计，调试发放只改副本且成就仅记一次', () => {
  const original = ready();
  twoCurios(original, 'wind-wings');
  assert.equal(has(original, 'curio-three'), false);
  const before = structuredClone(original);
  const granted = debugGrant(original, { kind: 'curio', id: 'wind-wings', quantity: 1, forge: 0 });
  assert.ok(granted.next);
  assert.deepEqual(original, before);
  assert.equal(granted.next.chronicle.milestones['curio-three'], 30);
  assert.equal(
    Object.keys(granted.next.curios.bag).filter((id) => granted.next.curios.bag[id as CurioId])
      .length,
    1,
  );
  const fourth = debugGrant(granted.next, {
    kind: 'curio',
    id: 'jade-book',
    quantity: 1,
    forge: 0,
  });
  assert.ok(fourth.next);
  assert.equal(
    fourth.next.chronicle.entries.filter((entry) => entry.title === '奇珍有缘').length,
    1,
  );
  assert.equal(
    debugGrant(fourth.next, { kind: 'curio', id: 'wind-wings', quantity: 1, forge: 0 }).next,
    undefined,
  );
  assert.equal(importSave(exportSave(fourth.next)).save.chronicle.milestones['curio-three'], 30);
  const nextLife = freshSave();
  assert.equal(applyBirthInheritance(nextLife, { kind: 'curio', id: 'wind-wings' }), true);
  assert.equal(has(nextLife, 'curio-three'), false);
  assert.deepEqual(nextLife.curios.acquired, ['wind-wings']);
  const lightweight = { curios: freshCurios() };
  assert.equal(grantCurio(lightweight, 'wind-wings'), true, '仅有curios的底层调用不依赖履历或年岁');
  const duplicate = ready();
  duplicate.curios.acquired = ['wind-wings', 'wind-wings', 'wind-wings'];
  recordCurioAchievement(duplicate);
  assert.equal(has(duplicate, 'curio-three'), false);
});

test('第三件奇物经妖王结算、寻访、竞拍均即时记入履历，年龄对应真实完成时刻', () => {
  const battle = ready();
  twoCurios(battle, 'jade-book');
  settleRun(battle, {
    stage: 0,
    difficulty: 0,
    kills: 0,
    time: 1,
    iron: 0,
    victory: false,
    loot: { curios: { 'jade-book': 1 } },
  });
  assert.equal(battle.chronicle.milestones['curio-three'], battle.age);
  for (const sect of [false, true]) {
    const seeking = ready();
    twoCurios(seeking, 'jade-book');
    if (sect) assert.equal(joinSect(seeking, 'power'), true);
    seeking.curios.seeking['jade-book'] = 2;
    assert.equal(curioSeekingQuote(seeking, 'jade-book', sect).reason, '');
    assert.ok(seekCurio(seeking, 'jade-book', venueStamp(seeking), sect));
    assert.equal(seeking.chronicle.milestones['curio-three'], 33);
  }
  const auction = ready();
  twoCurios(auction, 'jade-book');
  const cycle = curioCycle(auction.age);
  auction.curios.consignment = { cycle, id: 'jade-book', closed: false };
  auction.mortal.auction!.curioSlot = { cycle, id: 'jade-book' };
  const receipt = buyAuction(auction, AUCTION_CURIO_LOT, auction.stones, 1, false, cycle);
  assert.equal(receipt?.outcome, 'won');
  assert.equal(auction.chronicle.milestones['curio-three'], 30.5);
  assert.equal(auction.chronicle.milestones['curio-three'], receipt!.age);
});

test('真实诚实私邀交付第三件奇物才达成，不因看见邀约提前获得', () => {
  let found = false;
  const save = ready();
  for (let n = 0; n < 2000 && !found; n++) {
    enterNextMarketBatch(save);
    prepareMarketSocial(save);
    for (const npc of MARKET_CULTIVATORS) {
      const offer = marketOpportunity(save, npc.id);
      if (offer?.kind !== 'invitation' || !offer.honest || offer.item.kind !== 'curio') continue;
      twoCurios(save, offer.item.id);
      assert.equal(has(save, 'curio-three'), false);
      assert.ok(chooseMarketOpportunity(save, npc.id, save.mortal.sectMarket!.visit, 'accept'));
      assert.equal(save.curios.bag[offer.item.id as CurioId], 1);
      assert.equal(save.chronicle.milestones['curio-three'], save.age);
      found = true;
      break;
    }
  }
  assert.equal(found, true);
});

test('慧眼识珍仅真实竞得五阶以上法宝触发，四阶、落拍和出售不计', () => {
  for (const level of [4, 5, 6]) {
    let found = false;
    for (let seed = 1; seed <= 100 && !found; seed++) {
      const save = ready(seed);
      const lot = auctionLots(save).find(
        (item) =>
          item.kind === 'artifact' &&
          item.forgeLevel === level &&
          !save.artifacts.includes(item.id),
      );
      if (!lot) continue;
      const lost = structuredClone(save);
      const lostReceipt = buyAuction(lost, lot.index, lot.start + auctionFee(lot.start), 1)!;
      if (lostReceipt.outcome === 'lost') assert.equal(has(lost, 'auction-treasure'), false);
      const receipt = buyAuction(save, lot.index, save.stones, 1)!;
      assert.equal(receipt.outcome, 'won');
      assert.equal(has(save, 'auction-treasure'), level >= 5);
      if (level >= 5) assert.equal(save.chronicle.milestones['auction-treasure'], receipt.age);
      const before = structuredClone(save.chronicle);
      assert.equal(buyAuction(save, lot.index, save.stones, 1), undefined);
      assert.deepEqual(save.chronicle, before);
      const selling = ready(seed);
      selling.artifacts.push(lot.id);
      selling.forge[lot.id] = level;
      assert.equal(sellAuction(selling, lot, 1, 1)?.outcome, 'sold');
      assert.equal(has(selling, 'auction-treasure'), false);
      found = true;
    }
    assert.equal(found, true, `应实际覆盖炼器${level}阶`);
  }
});

test('以物结缘只在法宝搭配丹药真实换出时取得，失败和其他组合不计', () => {
  const seen = new Set<string>();
  for (let seed = 1; seed <= 30 && seen.size < 4; seed++) {
    const source = ready(seed);
    source.artifacts = TREASURES.map((t) => t.id);
    for (const t of TREASURES) source.forge[t.id] = 1;
    for (const m of MEDICINES) source.medicine.bag[m.id] = 100;
    for (const npc of MARKET_CULTIVATORS) {
      for (const deal of sectMarketDeals(source, npc.id)) {
        if (seen.has(deal.category)) continue;
        const save = structuredClone(source);
        if (deal.category === 'mixed') {
          const insufficient = structuredClone(source);
          insufficient.medicine.bag[deal.give.find((item) => item.kind === 'medicine')!.id] = 0;
          const before = structuredClone(insufficient);
          assert.equal(exchangeSectMedicine(insufficient, npc.id, deal.id, 1), false);
          assert.deepEqual(insufficient, before);
          assert.equal(exchangeSectMedicine(save, npc.id, deal.id, 1, true), false);
          assert.equal(has(save, 'mixed-exchange'), false);
        }
        assert.equal(exchangeSectMedicine(save, npc.id, deal.id, 1), true);
        assert.equal(has(save, 'mixed-exchange'), deal.category === 'mixed');
        if (deal.category === 'mixed') {
          assert.equal(save.chronicle.milestones['mixed-exchange'], save.age);
          const before = structuredClone(save);
          assert.equal(exchangeSectMedicine(save, npc.id, deal.id, 1), false);
          assert.deepEqual(save, before);
          assert.equal(
            importSave(exportSave(save)).save.chronicle.milestones['mixed-exchange'],
            save.age,
          );
        }
        seen.add(deal.category);
      }
    }
  }
  assert.deepEqual([...seen].sort(), ['artifact', 'medicine', 'medicines', 'mixed']);
});

test('旧档只据已得记录与真实成交证据补录，不从当前库存、炼器或交情猜测', () => {
  const old = ready();
  for (const id of CURIO_IDS.slice(0, 3)) {
    grantCurio(old, id);
    releaseAuctionItem(old, curioItem(id));
  }
  const restored = parseSave(JSON.stringify(old));
  assert.equal(restored.chronicle.milestones['curio-three'], null);
  const copy = structuredClone(old);
  copy.chronicle.milestones['curio-three'] = 22;
  assert.equal(parseSave(JSON.stringify(copy)).chronicle.milestones['curio-three'], 22);
  const evidence = ready();
  const item = { kind: 'artifact' as const, id: 'nail', quantity: 1, forgeLevel: 5 };
  evidence.mortal.auction!.history = [
    {
      ...item,
      hall: 2,
      visit: 1,
      realmIndex: 6,
      age: 28.5,
      outcome: 'won',
      price: 5000,
      fee: 250,
      bidder: 'player',
    },
  ];
  evidence.chronicle.entries.push({
    age: 25,
    title: '同道互通',
    detail: '宗门坊市：以追魂钉（炼器1阶） ×1 ＋ 黄龙丹 ×2换得聚灵丹 ×1，已收入丹囊。',
  });
  const loaded = parseSave(JSON.stringify(evidence));
  assert.equal(loaded.chronicle.milestones['auction-treasure'], 28.5);
  assert.equal(loaded.chronicle.milestones['mixed-exchange'], 25);
  const known = structuredClone(evidence);
  known.chronicle.milestones['auction-treasure'] = 20;
  known.chronicle.milestones['mixed-exchange'] = null;
  const knownLoaded = parseSave(JSON.stringify(known));
  assert.equal(knownLoaded.chronicle.milestones['auction-treasure'], 20);
  assert.equal(knownLoaded.chronicle.milestones['mixed-exchange'], null);
  const noProof = ready();
  noProof.artifacts = TREASURES.map((t) => t.id);
  noProof.forge.nail = 10;
  noProof.mortal.sectMarket!.exchanged.push('market-disciple');
  const unproven = parseSave(JSON.stringify(noProof));
  assert.equal(has(unproven, 'auction-treasure'), false);
  assert.equal(has(unproven, 'mixed-exchange'), false);
  assert.equal(chronicleAchievements(unproven).length, 15);
});

test('旧换物补录拒绝非成交文案、未知物品、单类报价和不可能的物品组合', () => {
  const details = [
    '宗门坊市：以追魂钉（炼器1阶） ×1换得聚灵丹 ×1，已收入丹囊。',
    '宗门坊市：以黄龙丹 ×1 ＋ 金髓丸 ×2换得聚灵丹 ×1，已收入丹囊。',
    '宗门坊市：以不存在（炼器1阶） ×1 ＋ 黄龙丹 ×2换得聚灵丹 ×1，已收入丹囊。',
    '宗门坊市：以追魂钉（炼器11阶） ×1 ＋ 黄龙丹 ×2换得聚灵丹 ×1，已收入丹囊。',
    '宗门坊市：以追魂钉（炼器01阶） ×1 ＋ 黄龙丹 ×2换得聚灵丹 ×1，已收入丹囊。',
    '宗门坊市：以追魂钉（炼器1阶） ×1 ＋ 黄龙丹 ×13换得聚灵丹 ×1，已收入丹囊。',
    '宗门坊市：以追魂钉（炼器1阶） ×1 ＋ 黄龙丹 ×2换得未知丹 ×1，已收入丹囊。',
    '宗门坊市：以追魂钉（炼器1阶） ×1 ＋ 黄龙丹 ×2换得聚灵丹 ×7，已收入丹囊。',
    '宗门坊市：以追魂钉（炼器1阶） ×1 ＋ 黄龙丹 ×2 ＋ 金髓丸 ×1换得聚灵丹 ×1，已收入丹囊。',
    '宗门坊市：以黄龙丹 ×2 ＋ 追魂钉（炼器1阶） ×1换得聚灵丹 ×1，已收入丹囊。',
    '考虑宗门坊市：以追魂钉（炼器1阶） ×1 ＋ 黄龙丹 ×2换得聚灵丹 ×1，已收入丹囊。',
  ];
  for (const detail of details) {
    const save = ready();
    recordChronicle(save, '同道互通', detail);
    assert.equal(has(parseSave(JSON.stringify(save)), 'mixed-exchange'), false, detail);
  }
});
