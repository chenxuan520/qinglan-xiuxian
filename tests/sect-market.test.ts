import { enterNextMarketBatch } from './market-fixture.ts';
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
  marketRealmLabel,
  marketLocalReply,
  validSectMarket,
} from '../src/sect-market-data.ts';
import {
  sectMarketOpen,
  sectMarketOffer,
  sectMarketDeals,
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
import { SECT_MARKET_SETTINGS } from '../src/setting.ts';

function visitor(realm = 0, seed = 12345) {
  const save = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  save.prologueSeen = save.hometownSeen = true;
  save.mortal.hometown!.stage = 'departed';
  save.runs = 1;
  save.cultivation = Math.max(
    1,
    Array.from({ length: realm * 3 }, (_, i) => realmCost(i)).reduce((a, b) => a + b, 0),
  );
  save.unlocked = Math.min(6, realm);
  if (realm === 8) save.completed = [0, 1, 2, 3, 4, 5, 6];
  save.medicine.recipeSeed = seed;
  save.mortal.population = { seed, since: 15 };
  assert.equal(
    realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).index,
    realm,
  );
  assert.equal(enterNextMarketBatch(save), true);
  return save;
}
const count = (bag: Record<string, number>) => Object.values(bag).reduce((a, b) => a + b, 0);

function visitWithNpcRealm(rank: number, id: MarketCultivatorId) {
  const save = visitor();
  for (let visit = 1; visit <= 20_000; visit++) {
    save.mortal.sectMarket!.visit = visit;
    if (marketCultivatorRealm(save.mortal.population!, save.mortal.sectMarket!, id) === rank)
      return save;
  }
  assert.fail(`没有找到${REALMS[rank]}来访者`);
}

function fundDeal(save: ReturnType<typeof visitor>, id: MarketCultivatorId) {
  const deal = sectMarketDeals(save, id)[0];
  assert.ok(deal);
  for (const item of deal.give)
    if (item.kind === 'medicine')
      save.medicine.bag[item.id] = (save.medicine.bag[item.id] || 0) + item.quantity;
    else {
      if (!save.artifacts.includes(item.id)) save.artifacts.push(item.id);
      save.forge[item.id] = item.forgeLevel;
    }
  return deal;
}
test('修为为零不开放，首次获得修为即开放，无需结算、通关或入宗；结束的一世不开放', () => {
  const save = freshSave();
  assert.equal(sectMarketOpen(save), false);
  assert.match(sectMarketEntrance(save), /disabled/);
  for (const path of ['orthodox', 'demonic', 'dual'] as const) {
    save.runs = 0;
    save.cultivation = 1;
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
test('本批来访者不随玩家突破而重抽，所有玩家境界均不会遇到真仙', () => {
  for (let rank = 0; rank < REALMS.length; rank++) {
    const save = visitor(rank);
    const state = save.mortal.sectMarket!;
    const npcs = marketCultivators(save.mortal.population!, state);
    for (const npc of npcs) {
      assert.ok(npc.realmIndex >= 0 && npc.realmIndex < REALMS.indexOf('真仙'));
      assert.equal(npc.realm, REALMS[npc.realmIndex]);
      assert.equal(
        marketRelation(npc.realmIndex, rank),
        npc.realmIndex > rank ? '前辈' : npc.realmIndex === rank ? '道友' : '蝼蚁',
      );
    }
    if (rank < 8) {
      save.cultivation += realmCost(rank * 3) + realmCost(rank * 3 + 1);
      assert.equal(realmInfo(save.cultivation, false).index, rank);
      assert.deepEqual(marketCultivators(save.mortal.population!, state), npcs);
      if (rank < 7) {
        save.cultivation += realmCost(rank * 3 + 2);
        assert.equal(realmInfo(save.cultivation, false).index, rank + 1);
        assert.deepEqual(marketCultivators(save.mortal.population!, state), npcs);
      }
    }
  }
});
test('三种身份独立按低多高少抽取，长序列符合比例且没有固定凑齐三类称谓', () => {
  const population = { seed: 12345, since: 15 };
  const counts = MARKET_CULTIVATORS.map(() => Array<number>(8).fill(0));
  let allSameRealm = 0;
  for (let visit = 1; visit <= 30_000; visit++) {
    const ranks = MARKET_CULTIVATORS.map((npc, index) => {
      const rank = marketCultivatorRealm(population, { visit, realmIndex: 0 }, npc.id);
      assert.ok(rank >= 0 && rank <= 7);
      counts[index][rank]++;
      return rank;
    });
    if (new Set(ranks).size === 1) allSameRealm++;
  }
  assert.ok(allSameRealm > 0, '可以遇到同境界的三位修士，不强行凑三类称谓');
  const expected = [28, 22, 18, 12, 8, 6, 4, 2];
  assert.deepEqual(SECT_MARKET_SETTINGS.realmWeights, expected);
  for (const npcCounts of counts)
    for (let rank = 0; rank < expected.length; rank++) {
      const rate = (npcCounts[rank] / 30_000) * 100;
      assert.ok(Math.abs(rate - expected[rank]) < 1, `${REALMS[rank]}实测 ${rate}%`);
      if (rank > 0) assert.ok(npcCounts[rank] < npcCounts[rank - 1]);
    }
});
test('高境界显著减少过低阶来访者，珍品供应有意义而更高阶仍稀少', () => {
  const population = { seed: 12345, since: 15 };
  for (const playerRealm of [6, 7, 8]) {
    const counts = Array<number>(9).fill(0);
    for (let visit = 1; visit <= 10_000; visit++)
      for (const npc of MARKET_CULTIVATORS)
        counts[marketCultivatorRealm(population, { visit, realmIndex: playerRealm }, npc.id)]++;
    assert.equal(counts[8], 0);
    assert.ok((counts[0] + counts[1]) / 30_000 < 0.2, '后期炼气、筑基合计不足两成');
    assert.ok(
      counts.slice(3).reduce((sum, n) => sum + n, 0) / 30_000 > 0.75,
      '后期携带珍品的元婴及以上修士超过七成五',
    );
    assert.ok((counts[6] + counts[7]) / 30_000 > 0.2, '合体及大乘来访者仍有实际出现机会');
    for (let rank = 6; rank <= 7; rank++) assert.ok(counts[rank] < counts[rank - 1]);
  }
});
test('每个实际来访境界的丹药池和可换材料都非空，品级符合 NPC 而非玩家境界', () => {
  let permanent = 0;
  for (let rank = 0; rank < 8; rank++)
    for (const npc of MARKET_CULTIVATORS) {
      const save = visitWithNpcRealm(rank, npc.id);
      const npcRealm = marketCultivatorRealm(
        save.mortal.population!,
        save.mortal.sectMarket!,
        npc.id,
      );
      assert.equal(npcRealm, rank);
      const pool = marketMedicinePool(save.mortal.population!, save.mortal.sectMarket!, npc.id);
      assert.ok(pool.length > 1, `NPC ${npc.id} at realm ${rank}`);
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
  assert.ok(permanent > 0, '高境界可以携带本世珍品');
});
test('高阶修士可换本世珍品，实际数量结算，保留服用次数与药效', () => {
  for (const rank of [6, 7])
    for (const npc of MARKET_CULTIVATORS) {
      const save = visitWithNpcRealm(rank, npc.id);
      for (let seed = 1; seed <= 100; seed++) {
        save.medicine.recipeSeed = seed;
        if (!sectMarketOffer(save, npc.id)!.years) break;
      }
      assert.equal(sectMarketOffer(save, npc.id)!.years, 0);
      const deal = fundDeal(save, npc.id);
      save.medicine.used.peiying = 1;
      const before = structuredClone(save.medicine);
      assert.equal(
        exchangeSectMedicine(save, npc.id, deal.id, save.mortal.sectMarket!.visit),
        true,
      );
      assert.equal(save.medicine.bag[deal.receive.id], deal.receive.quantity);
      assert.deepEqual(save.medicine.active, before.active);
      assert.deepEqual(save.medicine.used, before.used);
      assert.deepEqual(importSave(exportSave(save)).save.medicine, save.medicine);
    }
});

test('组合互换每批每人一次，刷新与文件往返保留额度且不改药效年岁', () => {
  for (let rank = 0; rank < 9; rank++)
    for (const npc of MARKET_CULTIVATORS) {
      const save = visitor(rank),
        deal = fundDeal(save, npc.id),
        before = structuredClone(save);
      assert.equal(
        exchangeSectMedicine(save, npc.id, deal.id, save.mortal.sectMarket!.visit),
        true,
      );
      for (const item of deal.give)
        if (item.kind === 'medicine')
          assert.equal(save.medicine.bag[item.id], before.medicine.bag[item.id] - item.quantity);
      assert.equal(save.medicine.bag[deal.receive.id], deal.receive.quantity);
      assert.equal(save.age, before.age);
      assert.equal(save.stones, before.stones);
      assert.equal(save.cultivation, before.cultivation);
      for (const key of ['active', 'used', 'recipes', 'recipeSeed'] as const)
        assert.deepEqual(save.medicine[key], before.medicine[key]);
      const text = JSON.stringify(save);
      assert.equal(
        exchangeSectMedicine(save, npc.id, deal.id, save.mortal.sectMarket!.visit),
        false,
      );
      assert.equal(JSON.stringify(save), text);
      assert.deepEqual(readSave(text).save.mortal.sectMarket, save.mortal.sectMarket);
      assert.deepEqual(importSave(exportSave(save)).save.mortal.sectMarket, save.mortal.sectMarket);
    }
});

test('拒绝未知报价、过期访次、库存不足和丹囊溢出，失败不改任何字段', () => {
  for (const npc of MARKET_CULTIVATORS) {
    const save = visitor(7),
      deal = sectMarketDeals(save, npc.id)[0];
    for (const [key, visit] of [
      [deal.id, save.mortal.sectMarket!.visit],
      ['forged', save.mortal.sectMarket!.visit],
      [deal.id, save.mortal.sectMarket!.visit - 1],
    ] as const) {
      const text = JSON.stringify(save);
      assert.equal(exchangeSectMedicine(save, npc.id, key, visit), false);
      assert.equal(JSON.stringify(save), text);
    }
    fundDeal(save, npc.id);
    save.medicine.bag[deal.receive.id] = Number.MAX_SAFE_INTEGER;
    const text = JSON.stringify(save);
    assert.equal(exchangeSectMedicine(save, npc.id, deal.id, save.mortal.sectMarket!.visit), false);
    assert.equal(JSON.stringify(save), text);
  }
});

test('满一年后实际进场更换来访者；旧批次按钮拒绝且只查看不重抽', () => {
  const save = visitor(2);
  const original = structuredClone(save.mortal.sectMarket!);
  const npcs = marketCultivators(save.mortal.population!, original);
  const snapshot = JSON.stringify(save);
  for (let i = 0; i < 10; i++) {
    marketCultivators(save.mortal.population!, save.mortal.sectMarket!);
    sectMarketOffer(save, 'market-alchemist');
  }
  assert.equal(JSON.stringify(save), snapshot);
  assert.equal(enterNextMarketBatch(save), true);
  assert.equal(save.age, original.openedAt + 1);
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
    const give = marketMedicinePool(save.mortal.population!, save.mortal.sectMarket!, id).find(
      (m) => m.id !== offer.id,
    )!;
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
test('缺失坊市字段正常读取、保留药方与宗门，损坏坊市字段不会丢其余人间数据；导入损坏字段拒绝', () => {
  const save = visitor(2);
  delete save.mortal.sectMarket;
  delete save.mortal.auction;
  delete save.mortal.marketSocial;
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
  const older = { ...save, schema: SAVE_SCHEMA - 1 };
  assert.equal(readSave(JSON.stringify(older)).status, 'ok');
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
    assert.ok(
      prompt.includes(
        npc.realmIndex > 4 ? '具体境界、小阶段与高出几境都不对外说明' : `你目前修至${npc.realm}。`,
      ),
    );
    assert.ok(prompt.includes(`玩家将你归为「${marketRelation(npc.realmIndex, 4)}」`));
    assert.match(prompt, /不能替玩家进行交易/);
    assert.match(prompt, /不承诺免费赠药/);
    const realmReply = marketLocalReply(npc, '你修到什么境界？', 4);
    if (npc.realmIndex > 4) assert.doesNotMatch(realmReply, new RegExp(npc.realm));
    else assert.match(realmReply, new RegExp(npc.realm));
    assert.match(marketLocalReply(npc, '换药怎么弄？', 4), /按相近估值互换/);
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
  enterNextMarketBatch(save);
  const next = marketCultivators(save.mortal.population!, save.mortal.sectMarket!);
  assert.equal(new Set(next.map((n) => n.name)).size, next.length);
  next.forEach((npc, i) => assert.notEqual(npc.name, original[i].name));
});
test('低境界修士不能从系统提示获知前辈的具体境界或精进，同阶与高阶只能知道当前境界', () => {
  const save = visitor();
  const visit = save.mortal.sectMarket!;
  for (const npc of marketCultivators(save.mortal.population!, visit)) {
    for (let rank = 0; rank < REALMS.length; rank++) {
      const body = {
        population: save.mortal.population!,
        age: save.age,
        npcId: npc.id,
        realm: `${REALMS[rank]}初期`,
        message: '你看得出我近来怎么精进的吗？',
        history: [],
        marketVisit: { visit: visit.visit, realmIndex: visit.realmIndex },
      };
      assert.equal(validDialogue(body), true);
      const prompt = dialogueMessages(body)[0].content;
      assert.match(prompt, /没有对方明确讲述的前后变化，不评价其精进快慢/);
      assert.match(prompt, /助手未经证实的判断不是事实/);
      if (rank > npc.realmIndex) {
        assert.ok(!prompt.includes(body.realm), `${npc.realm}不应得知${body.realm}`);
        assert.match(prompt, /看不透对方的具体境界、小阶段和修为深浅/);
        assert.match(prompt, /可称「前辈」/);
      } else {
        assert.ok(prompt.includes(body.realm));
        assert.match(prompt, /不知道对方此前的境界、修炼经历或精进速度/);
      }
    }
  }
});
test('前辈未自述时，实际境界及小阶段的变化不会给低阶修士额外的 AI 信息', () => {
  const save = visitWithNpcRealm(0, 'market-alchemist');
  const body = {
    population: save.mortal.population!,
    age: save.age,
    npcId: 'market-alchemist' as const,
    realm: '筑基初期',
    message: '近来如何？',
    history: [],
    marketVisit: save.mortal.sectMarket!,
  };
  const messages = dialogueMessages(body);
  for (const realm of ['筑基中期', '化神后期', '大乘初期', '渡劫', '真仙'])
    assert.deepEqual(dialogueMessages({ ...body, realm }), messages, realm);
  const history = [
    { role: 'assistant' as const, content: '前辈刚突破化神，精进得真快。' },
    { role: 'user' as const, content: '我并没有告诉你这些。' },
  ];
  const reported = dialogueMessages({ ...body, history });
  assert.deepEqual(reported.slice(1), [
    { role: 'assistant', content: '前辈修为难测，具体境界未曾辨明。' },
    history[1],
    { role: 'user', content: body.message },
  ]);
  assert.equal(history[0].content, '前辈刚突破化神，精进得真快。');
  assert.match(reported[0].content, /玩家自述只能作为自述转述/);
  assert.match(reported[0].content, /不能接着编造/);
});
test('离线闲聊同样不看穿前辈，也不凭当前境界推断同阶或小友的精进经历', () => {
  const save = visitWithNpcRealm(1, 'market-alchemist');
  const npc = marketCultivators(save.mortal.population!, save.mortal.sectMarket!).find(
    (n) => n.id === 'market-alchemist',
  )!;
  assert.match(marketLocalReply(npc, '我怎么精进了？', 4), /看不透，也不敢妄评/);
  assert.match(marketLocalReply(npc, '我的修为怎样？', 4), /看不透/);
  for (const rank of [0, 1])
    assert.match(marketLocalReply(npc, '你看得出我的突破和进展吗？', rank), /只凭一面，难知/);
  assert.match(marketLocalReply(npc, '你的境界呢？', 4), /我如今修至筑基/);
  assert.doesNotMatch(marketLocalReply(npc, '你自己近来如何精进？', 4), /前辈的修为/);
  assert.match(marketLocalReply(npc, '换丹药怎么弄？', 4), /按相近估值互换/);
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
test('界面列明完整报价与不足状态，成功后隐藏结算按钮', () => {
  for (const rank of [0, 3, 7]) {
    const save = visitor(rank);
    const emptyBag = structuredClone(save.medicine.bag);
    for (const npc of marketCultivators(save.mortal.population!, save.mortal.sectMarket!)) {
      save.medicine.bag = structuredClone(emptyBag);
      const offer = sectMarketOffer(save, npc.id)!,
        html = sectMarketEventContent(save, npc);
      assert.ok(html.includes(marketRealmLabel(npc, rank)) && html.includes(offer.name));
      assert.match(html, /丹囊现有 0/);
      assert.match(html, /所需物品不足/);
      assert.match(html, /disabled/);
      assert.ok(html.indexOf('id="sect-market-trade"') < html.indexOf('id="market-social"'));
      assert.ok(html.indexOf('id="sect-market-trade"') < html.indexOf('class="npc-dialogue"'));
      const deal = fundDeal(save, npc.id);
      assert.equal(
        exchangeSectMedicine(save, npc.id, deal.id, save.mortal.sectMarket!.visit),
        true,
      );
      assert.match(sectMarketTradeContent(save, npc), /本批已互换/);
      const completedOffer = sectMarketTradeContent(save, npc).match(
        /<div class="sect-market-offer">[\s\S]*?<strong>([^<]*)<\/strong>/,
      )?.[1];
      assert.equal(completedOffer, offer.name, '完成后不显示剩余报价的数量');
      assert.doesNotMatch(sectMarketTradeContent(save, npc), /data-action="sect-market-exchange"/);
      assert.equal(medicineInfo(offer.id), offer);
    }
  }
});
