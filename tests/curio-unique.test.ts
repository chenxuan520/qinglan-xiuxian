import { enterNextMarketBatch } from './market-fixture.ts';
import { AUCTION_CURIO_LOT } from '../src/auction-data.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CURIO_IDS,
  acquiredCurio,
  bossCurio,
  curioCycle,
  curioRoll,
  grantCurio,
  prepareCurioConsignment,
  type CurioId,
} from '../src/curio-data.ts';
import {
  freshSave,
  readSave,
  SAVE_SCHEMA,
  applyBirthInheritance,
  settleRun,
} from '../src/progress.ts';
import { importSave, exportSave } from '../src/save-transfer.ts';
import { prepareAuction, releaseAuctionItem } from '../src/auction.ts';
import { auctionLots, buyAuction } from '../src/auction-trade.ts';
import { curioSeekingQuote, seekCurio } from '../src/curio-market.ts';
import { curioSeekingContent, curioCollection } from '../src/curio-ui.ts';
import { venueStamp } from '../src/market-venues.ts';
import {
  marketOpportunity,
  prepareMarketSocial,
  opportunityReason,
  chooseMarketOpportunity,
} from '../src/market-social.ts';
import { marketInvitationReward } from '../src/market-opportunities.ts';
import { debugGrant } from '../src/debug-resources.ts';
import { Game } from '../src/game.ts';

function ready() {
  const s = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  s.prologueSeen = s.hometownSeen = true;
  s.mortal.hometown.stage = 'departed';
  s.mortal.population = { seed: 12345, since: 15 };
  s.cultivation = 20000;
  s.age = 30;
  s.unlocked = 6;
  s.stones = 1000000;
  enterNextMarketBatch(s);
  prepareAuction(s);
  return s;
}
const item = (id: string) => ({ kind: 'curio' as const, id, quantity: 1, forgeLevel: 0 });
const seeds = new Map<CurioId, number>();
for (let seed = 0; seeds.size < CURIO_IDS.length && seed < 100000; seed++) {
  const s = freshSave();
  s.curios.seed = seed;
  const id = bossCurio(s, 6, 6, true);
  if (id && !seeds.has(id)) seeds.set(id, seed);
}
assert.equal(seeds.size, CURIO_IDS.length);

test('每件奇物只授予一次；出售、删除库存和存取往返不清除本世获得记录', () => {
  for (const id of CURIO_IDS) {
    let s = ready();
    assert.equal(grantCurio(s, id), true);
    assert.equal(grantCurio(s, id), false);
    assert.equal(s.curios.bag[id], 1);
    releaseAuctionItem(s, item(id));
    delete s.curios.bag[id];
    s = importSave(exportSave(s, null)).save;
    assert.equal(acquiredCurio(s, id), true);
    const before = structuredClone(s);
    assert.equal(grantCurio(s, id), false);
    assert.deepEqual(s, before);
    assert.match(curioCollection(s), /此缘已尽/);
  }
});

test('妖王排除持有、已售及同局待结奇物，不把重复奖励重抽为其他物品', () => {
  for (const id of CURIO_IDS) {
    const s = ready();
    s.runs = 0;
    s.completed = [];
    s.curios.seed = seeds.get(id)!;
    assert.equal(bossCurio(s, 6, 6, true), id);
    assert.equal(bossCurio(s, 6, 6, true, true, { [id]: 1 }), null);
    assert.equal(grantCurio(s, id), true);
    assert.equal(bossCurio(s, 6, 6, true), null);
    releaseAuctionItem(s, item(id));
    assert.equal(bossCurio(s, 6, 6, true), null);
  }
  const s = ready();
  s.runs = 0;
  s.completed = [];
  for (let seed = 0; seed < 20000; seed++) {
    s.curios.seed = seed;
    const key = 'boss:0:6:6';
    const pick = curioRoll(seed, key + ':item');
    const expected =
      curioRoll(seed, key) / 0x100000000 < 0.15
        ? CURIO_IDS[pick % 80 === 0 ? 0 : 1 + ((pick >>> 8) % 8)]
        : null;
    assert.equal(bossCurio(s, 6, 6, true), expected);
  }
});

test('真实战斗待结奇物不重复，保存恢复延续去重；畸形重复与已得奖励快照拒绝', () => {
  const s = ready();
  s.runs = 0;
  s.completed = [];
  while (!bossCurio(s, 0, 0, true)) s.curios.seed++;
  const id = bossCurio(s, 0, 0, true)!;
  const g = new Game(s, 0, 0, () => 0.5);
  g.loot.curios[id] = 1;
  const e = g.spawnEnemy(0, false, true, { x: 100, y: 0 });
  g.hitEnemy(e, 1e9);
  assert.deepEqual(g.loot.curios, { [id]: 1 });
  g.state = 'paused';
  const snapshot = g.snapshot();
  assert.ok(Game.restore(s, snapshot));
  const bad = structuredClone(snapshot);
  bad.loot.curios[id] = 2;
  assert.equal(Game.restore(s, bad), null);
  grantCurio(s, id);
  assert.equal(Game.restore(s, snapshot), null);
});

test('取得奇物立即撤掉原寄拍，不收取旧按钮费用；跨十年和出售后不再出现', () => {
  for (const id of CURIO_IDS.slice(1)) {
    const s = ready(),
      cycle = curioCycle(s.age),
      visit = s.mortal.sectMarket!.visit;
    s.curios.consignment = { cycle, id, closed: false };
    delete s.mortal.auction!.curioSlot;
    prepareAuction(s);
    assert.equal(auctionLots(s).at(-1)!.id, id);
    grantCurio(s, id);
    assert.equal(
      auctionLots(s).some((l) => l.kind === 'curio' && l.id === id),
      false,
    );
    const before = structuredClone(s);
    assert.equal(buyAuction(s, AUCTION_CURIO_LOT, s.stones, visit, false, cycle), undefined);
    assert.deepEqual(s, before);
    releaseAuctionItem(s, item(id));
    for (let n = 0; n < 100; n++) {
      s.age += 10;
      prepareCurioConsignment(s);
      assert.notEqual(s.curios.consignment!.id, id);
      assert.equal(
        auctionLots(s).some((l) => l.kind === 'curio' && l.id === id),
        false,
      );
    }
  }
});

test('其他来源取得后，宗门和坊市都撤掉同物寻访；已付两次线索也不能再交费', () => {
  for (const id of CURIO_IDS.slice(1)) {
    const s = ready();
    s.curios.seeking[id] = 2;
    grantCurio(s, id);
    for (const sect of [false, true]) {
      assert.match(curioSeekingQuote(s, id, sect).reason, /本世已寻得/);
      assert.ok(!curioSeekingContent(s, sect).includes(`data-id="${id}"`));
      const before = structuredClone(s);
      assert.equal(seekCurio(s, id, venueStamp(s), sect), undefined);
      assert.deepEqual(s, before);
    }
    releaseAuctionItem(s, item(id));
    assert.match(curioSeekingQuote(s, id).reason, /本世已寻得/);
  }
});

test('私邀承诺保持原抽取，取得同物后撤掉整桩邀约，旧操作不扣费也不重抽真假', () => {
  const s = ready();
  let found = false;
  for (let n = 0; n < 2000 && !found; n++) {
    enterNextMarketBatch(s);
    prepareMarketSocial(s);
    for (const npc of ['market-swordsman', 'market-alchemist', 'market-wanderer'] as const) {
      const offer = marketOpportunity(s, npc);
      if (offer?.kind !== 'invitation' || offer.item.kind !== 'curio') continue;
      const promised = marketInvitationReward(
        s.mortal.population!,
        s.mortal.sectMarket!,
        npc,
        true,
      );
      const id = offer.item.id as CurioId;
      grantCurio(s, id);
      assert.equal(marketOpportunity(s, npc), undefined);
      assert.deepEqual(
        marketInvitationReward(s.mortal.population!, s.mortal.sectMarket!, npc, true),
        promised,
      );
      const before = structuredClone(s);
      assert.ok(opportunityReason(s, npc, s.mortal.sectMarket!.visit, 'accept'));
      assert.equal(
        chooseMarketOpportunity(s, npc, s.mortal.sectMarket!.visit, 'accept'),
        undefined,
      );
      assert.deepEqual(s, before);
      releaseAuctionItem(s, item(id));
      assert.equal(marketOpportunity(s, npc), undefined);
      found = true;
      break;
    }
  }
  assert.equal(found, true);
});

test('旧档多件收束为一件，已售与已寻记录补入本世唯一记录，同版损坏不静默重置', () => {
  const old: any = ready();
  old.schema = SAVE_SCHEMA - 1;
  old.curios.bag = { 'soul-wood': 3, 'wind-wings': 0 };
  delete old.curios.acquired;
  old.curios.seeking['jade-book'] = 3;
  old.curios.consignment = { cycle: curioCycle(old.age), id: 'soul-wood', closed: false };
  const loaded = readSave(JSON.stringify(old));
  assert.equal(loaded.status, 'ok');
  assert.deepEqual(loaded.save.curios.bag, { 'soul-wood': 1, 'wind-wings': 0 });
  for (const id of ['soul-wood', 'wind-wings', 'jade-book'] as const)
    assert.ok(acquiredCurio(loaded.save, id));
  assert.equal(loaded.save.curios.consignment!.id, null);
  assert.deepEqual(importSave(JSON.stringify(old)).save.curios, loaded.save.curios);
  for (const bad of [undefined, ['unknown'], ['soul-wood', 'soul-wood']]) {
    const s = ready();
    Object.assign(s.curios, { acquired: bad });
    assert.equal(readSave(JSON.stringify(s)).status, 'unreadable');
    assert.throws(() => importSave(JSON.stringify(s)));
  }
  old.curios.bag = { 'soul-wood': -1 };
  assert.equal(readSave(JSON.stringify(old)).status, 'unreadable');
});

test('传承奇物从新世起便唯一，其他奇物仍可新世获得；调试不能绕过唯一性', () => {
  for (const id of CURIO_IDS) {
    const s = freshSave();
    applyBirthInheritance(s, { kind: 'curio', id });
    assert.equal(s.curios.bag[id], 1);
    assert.ok(acquiredCurio(s, id));
    assert.equal(grantCurio(s, id), false);
    const other = CURIO_IDS.find((other) => other !== id)!;
    assert.equal(grantCurio(s, other), true);
    for (const quantity of [1, 2, 99])
      assert.ok('error' in debugGrant(s, { kind: 'curio', id, quantity, forge: 0 }));
    const fresh = freshSave();
    assert.ok('error' in debugGrant(fresh, { kind: 'curio', id, quantity: 2, forge: 0 }));
    assert.deepEqual(fresh.curios.acquired, []);
  }
});

test('结算只授予尚未获得的一件，重复或畸形待结收获不追加库存', () => {
  const s = ready();
  grantCurio(s, 'soul-wood');
  settleRun(s, {
    stage: 0,
    difficulty: 0,
    kills: 0,
    time: 1,
    iron: 0,
    victory: false,
    loot: { curios: { 'soul-wood': 1, 'jade-book': 1, 'wind-wings': 2 } },
  });
  assert.equal(s.curios.bag['soul-wood'], 1);
  assert.equal(s.curios.bag['jade-book'], 1);
  assert.equal(s.curios.bag['wind-wings'], undefined);
  assert.equal(s.curios.acquired.filter((id) => id === 'soul-wood').length, 1);
});
