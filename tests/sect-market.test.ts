import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSave, readSave, realmCost, realmInfo, SAVE_SCHEMA } from '../src/progress.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';
import { MEDICINES, medicineInfo } from '../src/medicine-data.ts';
import {
  MARKET_CULTIVATORS,
  MARKET_START,
  MARKET_BUILDINGS,
  MARKET_WIDTH,
  MARKET_HEIGHT,
  marketCultivators,
  marketMedicinePool,
  marketCultivatorRealm,
  marketRelation,
  marketLocalReply,
  validSectMarket,
} from '../src/sect-market-data.ts';
import {
  sectMarketOpen,
  beginSectMarketVisit,
  sectMarketOffer,
  sectMarketExchangeReason,
  exchangeSectMedicine,
  moveInSectMarket,
  nearbyMarketCultivator,
} from '../src/sect-market.ts';
import { sectMarketEntrance, mortalTabContent } from '../src/mortal-ui.ts';
import { sectMarketEventContent, sectMarketTradeContent } from '../src/sect-market-ui.ts';
import { validDialogue, dialogueMessages } from '../workers/npc-ai/index.ts';
import { REALMS, FINAL_TRIAL_STAGE } from '../src/data.ts';
import type { MarketCultivatorId } from '../src/sect-market-data.ts';

function visitor(realm = 0, seed = 12345) {
  const save = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  save.prologueSeen = save.hometownSeen = true;
  save.mortal.hometown!.stage = 'departed';
  save.runs = 1;
  save.cultivation = Array.from({ length: realm * 3 }, (_, i) => realmCost(i)).reduce(
    (a, b) => a + b,
    0,
  );
  save.unlocked = Math.min(6, realm);
  if (realm === 8) save.completed = [0, 1, 2, 3, 4, 5, 6];
  save.medicine.recipeSeed = seed;
  save.mortal.population = { seed, since: 15 };
  assert.equal(
    realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).index,
    realm,
  );
  assert.equal(beginSectMarketVisit(save), true);
  return save;
}
const count = (bag: Record<string, number>) => Object.values(bag).reduce((a, b) => a + b, 0);

test('首次历练结算即开放，不要求通关、路线或入宗；结束的一世不开放', () => {
  const save = freshSave();
  assert.equal(sectMarketOpen(save), false);
  assert.match(sectMarketEntrance(save), /disabled/);
  for (const path of ['orthodox', 'demonic', 'dual'] as const) {
    save.runs = 1;
    save.path = path;
    assert.equal(sectMarketOpen(save), true);
    assert.match(mortalTabContent(save, 'sects', 'all'), /宗门坊市/);
    assert.doesNotMatch(mortalTabContent(save, 'town', 'all'), /sect-market-enter/);
  }
  save.pendingReincarnation = 'lifespan';
  assert.equal(sectMarketOpen(save), false);
  save.pendingReincarnation = null;
  save.journeyEnded = true;
  assert.equal(sectMarketOpen(save), false);
});
test('称谓按大境界比较，初中后期不改变本批 NPC；境界两端不编造额外境界', () => {
  for (let rank = 0; rank < REALMS.length; rank++) {
    const save = visitor(rank);
    const state = save.mortal.sectMarket!;
    const npcs = marketCultivators(save.mortal.population!, state);
    for (let i = 0; i < npcs.length; i++) {
      const expected = Math.max(0, Math.min(8, rank + [1, 0, -1][i]));
      assert.equal(npcs[i].realmIndex, expected);
      assert.equal(npcs[i].realm, REALMS[expected]);
      assert.equal(
        marketRelation(expected, rank),
        expected > rank ? '前辈' : expected === rank ? '道友' : '蝼蚁',
      );
    }
    if (rank < 8) {
      save.cultivation += realmCost(rank * 3) + realmCost(rank * 3 + 1);
      assert.equal(realmInfo(save.cultivation, false).index, rank);
      assert.deepEqual(marketCultivators(save.mortal.population!, state), npcs);
    }
  }
});
test('每个大境界每位修士的丹药池和可换材料都非空，品级符合 NPC 境界', () => {
  let permanent = 0;
  for (let rank = 0; rank < 9; rank++)
    for (const seed of [0, 1, 13, 999, 0xffffffff]) {
      const save = visitor(rank, seed);
      for (const npc of MARKET_CULTIVATORS) {
        const npcRealm = marketCultivatorRealm(save.mortal.sectMarket!, npc.id);
        const pool = marketMedicinePool(save.mortal.sectMarket!, npc.id);
        assert.ok(pool.length > 1, `NPC ${npc.id} at player realm ${rank}`);
        for (const m of pool) {
          assert.equal(m.tier, npcRealm === 0 ? '凡品' : npcRealm < 3 ? '灵品' : '珍品');
          if (!m.years) {
            assert.ok(npcRealm >= 6);
            permanent++;
          }
        }
        const offer = sectMarketOffer(save, npc.id)!;
        assert.ok(pool.includes(offer));
        assert.ok(pool.some((m) => m.id !== offer.id && !!m.years === !!offer.years));
      }
    }
  assert.ok(permanent > 0, '高境界可以携带本世珍品');
});
test('互换只扣两份同品同类药得一份，每批每人一次，刷新读档和文件往返不补额度', () => {
  for (let rank = 0; rank < 9; rank++)
    for (const npc of MARKET_CULTIVATORS) {
      const save = visitor(rank);
      const offered = sectMarketOffer(save, npc.id)!;
      const given = marketMedicinePool(save.mortal.sectMarket!, npc.id).find(
        (m) => m.id !== offered.id && !!m.years === !!offered.years,
      )!;
      save.medicine.bag[given.id] = 4;
      const before = structuredClone(save);
      assert.equal(
        exchangeSectMedicine(save, npc.id, given.id, save.mortal.sectMarket!.visit),
        true,
      );
      assert.equal(save.medicine.bag[given.id], 2);
      assert.equal(save.medicine.bag[offered.id], 1);
      assert.equal(count(save.medicine.bag), count(before.medicine.bag) - 1);
      assert.equal(save.age, before.age);
      assert.equal(save.stones, before.stones);
      assert.equal(save.cultivation, before.cultivation);
      assert.deepEqual(save.medicine.active, before.medicine.active);
      assert.deepEqual(save.medicine.used, before.medicine.used);
      assert.deepEqual(save.medicine.recipes, before.medicine.recipes);
      assert.equal(save.medicine.recipeSeed, before.medicine.recipeSeed);
      const text = JSON.stringify(save);
      assert.equal(
        exchangeSectMedicine(save, npc.id, given.id, save.mortal.sectMarket!.visit),
        false,
      );
      assert.equal(JSON.stringify(save), text);
      const loaded = readSave(text);
      assert.equal(loaded.status, 'ok');
      assert.deepEqual(loaded.save.mortal.sectMarket, save.mortal.sectMarket);
      const imported = importSave(exportSave(save, null)).save;
      assert.deepEqual(imported.mortal.sectMarket, save.mortal.sectMarket);
      assert.deepEqual(imported.medicine, save.medicine);
    }
});
test('拒绝库存不足、相同药、跨品/跨限时永久、过期批次、非法 NPC，失败不改任何字段', () => {
  const save = visitor(7);
  for (const m of MEDICINES) save.medicine.bag[m.id] = 20;
  for (const npc of MARKET_CULTIVATORS) {
    const offer = sectMarketOffer(save, npc.id)!;
    const allowed = marketMedicinePool(save.mortal.sectMarket!, npc.id).filter(
      (m) => m.id !== offer.id && !!m.years === !!offer.years,
    );
    const invalid = MEDICINES.filter((m) => !allowed.some((g) => g.id === m.id));
    for (const m of invalid) {
      const text = JSON.stringify(save);
      assert.equal(exchangeSectMedicine(save, npc.id, m.id, save.mortal.sectMarket!.visit), false);
      assert.equal(JSON.stringify(save), text);
    }
    assert.equal(
      exchangeSectMedicine(save, npc.id, allowed[0].id, save.mortal.sectMarket!.visit - 1),
      false,
    );
    save.medicine.bag[allowed[0].id] = 1;
    const text = JSON.stringify(save);
    assert.equal(
      exchangeSectMedicine(save, npc.id, allowed[0].id, save.mortal.sectMarket!.visit),
      false,
    );
    assert.equal(JSON.stringify(save), text);
  }
  assert.equal(
    exchangeSectMedicine(
      save,
      'market' as MarketCultivatorId,
      'huanglong',
      save.mortal.sectMarket!.visit,
    ),
    false,
  );
});
test('每次实际进场更换来访者，同年重进也换人；旧批次按钮拒绝且只查看不重抽', () => {
  const save = visitor(2);
  const original = structuredClone(save.mortal.sectMarket!);
  const npcs = marketCultivators(save.mortal.population!, original);
  const snapshot = JSON.stringify(save);
  for (let i = 0; i < 10; i++) {
    marketCultivators(save.mortal.population!, save.mortal.sectMarket!);
    sectMarketOffer(save, 'market-alchemist');
  }
  assert.equal(JSON.stringify(save), snapshot);
  assert.equal(beginSectMarketVisit(save), true);
  assert.equal(save.age, original.openedAt);
  assert.equal(save.mortal.sectMarket!.visit, original.visit + 1);
  assert.deepEqual(save.mortal.sectMarket!.exchanged, []);
  const next = marketCultivators(save.mortal.population!, save.mortal.sectMarket!);
  next.forEach((npc, i) => assert.notEqual(npc.name, npcs[i].name));
  assert.match(
    sectMarketExchangeReason(save, 'market-alchemist', 'heqi', original.visit),
    /已更换/,
  );
});
test('寿尽、天劫及供奉边界禁止互换，不能借 NPC 操作越过原流程', () => {
  for (const kind of ['lifespan', 'tribulation', 'dues'] as const) {
    const save = visitor(0);
    const id = 'market-disciple';
    const offer = sectMarketOffer(save, id)!;
    const give = marketMedicinePool(save.mortal.sectMarket!, id).find((m) => m.id !== offer.id)!;
    save.medicine.bag[give.id] = 2;
    if (kind === 'lifespan') save.age = 100;
    if (kind === 'tribulation') {
      save.age = 90;
      save.nextTribulationAge = 90;
    }
    if (kind === 'dues') save.mortal.member = { id: 'power', dues: 50, dueAt: save.mortal.years };
    const text = JSON.stringify(save);
    assert.equal(exchangeSectMedicine(save, id, give.id, save.mortal.sectMarket!.visit), false);
    assert.equal(JSON.stringify(save), text);
  }
});
test('旧档正常升级 schema、保留药方与宗门，损坏坊市字段不会丢其余人间数据；导入损坏字段拒绝', () => {
  const save = visitor(2);
  save.schema = 12;
  delete save.mortal.sectMarket;
  save.mortal.member = { id: 'power', dues: 150, dueAt: 100 };
  save.mortal.mastery.power = 2;
  save.medicine.recipes = ['heqi'];
  const read = readSave(JSON.stringify(save));
  assert.equal(read.status, 'ok');
  assert.equal(read.save.schema, SAVE_SCHEMA);
  assert.deepEqual(read.save.mortal, save.mortal);
  assert.deepEqual(read.save.medicine, save.medicine);
  const bad = {
    ...save,
    mortal: {
      ...save.mortal,
      sectMarket: { openedAt: save.age + 1, visit: 1, realmIndex: 0, exchanged: [] },
    },
  };
  const restored = readSave(JSON.stringify(bad));
  assert.equal(restored.status, 'ok');
  assert.deepEqual(restored.save.mortal, save.mortal);
  assert.throws(() => importSave(JSON.stringify(bad)));
  const future = { ...save, schema: SAVE_SCHEMA + 1 };
  assert.equal(readSave(JSON.stringify(future)).status, 'newer');
  assert.equal(
    validSectMarket({ openedAt: 15, visit: 1, realmIndex: 9, exchanged: [] }, 15),
    false,
  );
});
test('NPC 请求与界面用同一身份/境界；拒绝缺失和越界身份，AI 不承诺物资或自建任务', () => {
  const save = visitor(4);
  const visit = {
    visit: save.mortal.sectMarket!.visit,
    realmIndex: save.mortal.sectMarket!.realmIndex,
  };
  for (const npc of marketCultivators(save.mortal.population!, visit)) {
    const request = {
      population: save.mortal.population!,
      age: save.age,
      npcId: npc.id,
      realm: '化神初期',
      message: '你修到什么境界？',
      history: [],
      marketVisit: visit,
    };
    assert.equal(validDialogue(request), true);
    const prompt = dialogueMessages(request)[0].content;
    assert.ok(prompt.includes(npc.name));
    assert.ok(prompt.includes(npc.realm));
    assert.ok(prompt.includes(`玩家将你归为「${marketRelation(npc.realmIndex, 4)}」`));
    assert.match(prompt, /不能替玩家进行交易/);
    assert.match(prompt, /不承诺免费赠药/);
    assert.match(marketLocalReply(npc, '你修到什么境界？', 4), new RegExp(npc.realm));
    assert.match(marketLocalReply(npc, '换药怎么弄？', 4), /两份同品级、同类/);
    assert.equal(validDialogue({ ...request, marketVisit: undefined }), false);
    assert.equal(validDialogue({ ...request, marketVisit: { visit: 0, realmIndex: 4 } }), false);
    assert.equal(validDialogue({ ...request, marketVisit: { visit: 1, realmIndex: 9 } }), false);
    assert.equal(validDialogue({ ...request, npcId: 'market-unknown' }), false);
  }
});
test('渡劫仍属大乘，AI 与界面的前辈/道友/蝼蚁分类严格一致；重进场姓名变化', () => {
  const save = visitor(7);
  const original = marketCultivators(save.mortal.population!, save.mortal.sectMarket!);
  for (const npc of original) {
    const request = {
      population: save.mortal.population!,
      age: save.age,
      npcId: npc.id,
      realm: '渡劫',
      message: '你我境界如何？',
      history: [],
      marketVisit: { visit: save.mortal.sectMarket!.visit, realmIndex: 7 },
    };
    assert.equal(validDialogue(request), true);
    assert.ok(
      dialogueMessages(request)[0].content.includes(
        `玩家将你归为「${marketRelation(npc.realmIndex, 7)}」`,
      ),
    );
  }
  beginSectMarketVisit(save);
  const next = marketCultivators(save.mortal.population!, save.mortal.sectMarket!);
  assert.equal(new Set(next.map((n) => n.name)).size, next.length);
  next.forEach((npc, i) => assert.notEqual(npc.name, original[i].name));
});
test('场地可达三位修士、保持距离才可交谈；边界与两处建筑挡住脚点，移动速度不随帧间隔爆跳', () => {
  for (const npc of MARKET_CULTIVATORS) {
    let pos = { ...MARKET_START };
    for (let i = 0; i < 300; i++) {
      const dx = npc.x - pos.x,
        dy = npc.y - pos.y;
      if (Math.hypot(dx, dy) < 5) break;
      pos = moveInSectMarket(pos, { x: dx / 9, y: dy / 9 }, 0.05);
    }
    assert.equal(nearbyMarketCultivator(pos), npc.id);
  }
  assert.equal(nearbyMarketCultivator({ x: 30, y: 1050 }), undefined);
  for (const b of MARKET_BUILDINGS) {
    let pos = { x: b.x, y: b.y + 20 };
    for (let i = 0; i < 100; i++) pos = moveInSectMarket(pos, { x: 0, y: -1 }, 0.05);
    assert.ok(pos.y >= b.y);
  }
  const next = moveInSectMarket(MARKET_START, { x: 1, y: 1 }, 1000);
  assert.ok(Math.hypot(next.x - MARKET_START.x, next.y - MARKET_START.y) <= 9.001);
  const edge = moveInSectMarket(
    { x: MARKET_WIDTH - 24, y: MARKET_HEIGHT - 24 },
    { x: 1, y: 1 },
    0.05,
  );
  assert.deepEqual(edge, { x: MARKET_WIDTH - 24, y: MARKET_HEIGHT - 24 });
});
test('界面显示真实品级、持有量和互换状态，未持有丹药可看见但不能免费换得', () => {
  for (const rank of [0, 3, 7]) {
    const save = visitor(rank);
    for (const npc of marketCultivators(save.mortal.population!, save.mortal.sectMarket!)) {
      const offer = sectMarketOffer(save, npc.id)!;
      const html = sectMarketEventContent(save, npc);
      assert.ok(html.includes(npc.realm));
      assert.ok(html.includes(marketRelation(npc.realmIndex, rank)));
      assert.ok(html.includes(offer.name));
      assert.match(html, /持有 0/);
      assert.match(html, /所选丹药不足两份/);
      assert.match(html, /disabled/);
      const give = marketMedicinePool(save.mortal.sectMarket!, npc.id).find(
        (m) => m.id !== offer.id && !!m.years === !!offer.years,
      )!;
      save.medicine.bag[give.id] = 2;
      assert.equal(
        exchangeSectMedicine(save, npc.id, give.id, save.mortal.sectMarket!.visit),
        true,
      );
      assert.match(sectMarketTradeContent(save, npc), /本批已互换/);
      assert.doesNotMatch(sectMarketTradeContent(save, npc), /data-action="sect-market-exchange"/);
      assert.equal(medicineInfo(offer.id), offer);
    }
  }
});
