import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSave, realmCost, readSave } from '../src/progress.ts';
import { MEDICINES, validMedicine } from '../src/medicine-data.ts';
import {
  joinSect,
  masteryRewardPool,
  studyPlan,
  startActivity,
  resolveActivity,
} from '../src/mortal.ts';
import { craftMedicine, medicineCraftReason, medicineCraftStones } from '../src/medicine.ts';
import { serviceDues } from '../src/service-preflight.ts';
import { sectServiceQuote, executeSectService, sectServiceStamp } from '../src/sect-services.ts';
import { sectServiceContent } from '../src/sect-service-ui.ts';
import { grantCurio } from '../src/curio-data.ts';
import { Game } from '../src/game.ts';
import { gameEvent } from '../src/scene-flow.ts';
import { MARKET_CULTIVATORS } from '../src/sect-market-data.ts';
import { enterNextMarketBatch } from './market-fixture.ts';
import {
  marketOpportunity,
  chooseMarketOpportunity,
  settleMarketAmbush,
} from '../src/market-social.ts';

function fixture(step = 12, sect = 'haste') {
  const save = freshSave('heaven', ['metal'], 'dual', () => 0.5);
  save.unlocked = 6;
  save.stones = 100000;
  save.iron = 10000;
  save.cultivation = Array.from({ length: step }, (_, i) => realmCost(i)).reduce(
    (a, b) => a + b,
    0,
  );
  for (const m of MEDICINES) save.medicine.bag[m.id] = 1000;
  save.medicine.recipes = MEDICINES.filter((m) => m.years > 0 && m.tier !== '凡品').map(
    (m) => m.id,
  );
  assert.equal(joinSect(save, sect), true);
  return save;
}

for (const level of [5, 10]) {
  test(`普通精研${level}阶先检查赐丹容量，旧待结保留且腾出后只赠一次`, () => {
    const save = fixture(level === 5 ? 12 : 24);
    if (level === 10) {
      save.completed = [0, 1, 2, 3, 4, 5, 6];
      save.nextTribulationAge = 0;
    }
    save.mortal.mastery.haste = level - 1;
    const id = masteryRewardPool(level)[0].id;
    save.medicine.bag[id] = Number.MAX_SAFE_INTEGER;
    const before = JSON.stringify(save);
    assert.equal(
      startActivity(save, 'study', () => 0),
      false,
    );
    assert.equal(JSON.stringify(save), before, '不得先扣费、计龄或写入非法药袋');
    save.mortal.activity = {
      kind: 'study',
      remaining: 0,
      total: studyPlan(save).years,
      sect: 'haste',
    };
    assert.equal(
      resolveActivity(save, () => 0),
      false,
    );
    assert.ok(save.mortal.activity);
    assert.equal(save.mortal.mastery.haste, level - 1);
    save.medicine.bag[id]--;
    assert.equal(
      resolveActivity(save, () => 0),
      true,
    );
    assert.equal(save.mortal.activity, null);
    assert.equal(save.mortal.mastery.haste, level);
    assert.equal(save.medicine.bag[id], Number.MAX_SAFE_INTEGER);
    assert.equal(validMedicine(save.medicine), true);
    assert.deepEqual(readSave(JSON.stringify(save)).save.medicine, save.medicine);
    assert.equal(
      resolveActivity(save, () => 0),
      false,
    );
  });
}

test('炼丹与实际账期使用同一容差，边界供奉不足时零变动，补足后一次结清', () => {
  for (const delta of [-5e-10, 0, 5e-10]) {
    const save = fixture(3);
    const medicine = MEDICINES.find((m) => m.years > 0 && m.tier === '灵品')!;
    const fee = medicineCraftStones(medicine.id);
    save.mortal.years = 0.1;
    save.mortal.member!.dueAt = save.mortal.years + medicine.craftYears + delta;
    save.stones = fee;
    assert.match(medicineCraftReason(save, medicine.id), /供奉/);
    const before = JSON.stringify(save);
    assert.equal(craftMedicine(save, medicine.id).ok, false);
    assert.equal(JSON.stringify(save), before);
    save.stones += serviceDues(save, medicine.craftYears);
    const count = save.medicine.bag[medicine.id],
      age = save.age;
    assert.equal(craftMedicine(save, medicine.id).ok, true);
    assert.equal(save.medicine.bag[medicine.id], count + 1);
    assert.equal(save.stones, 0);
    assert.ok(Math.abs(save.age - age - medicine.craftYears) < 1e-8);
    assert.ok(save.mortal.member!.dueAt > save.mortal.years);
  }
});

for (const bottle of [false, true]) {
  test(`药庐代炼标题、说明、真实库存一致，掌天瓶=${bottle}`, () => {
    const save = fixture(3, 'duration');
    if (bottle) grantCurio(save, 'heaven-bottle');
    const id = save.medicine.recipes[0],
      quote = sectServiceQuote(save, id);
    assert.equal(quote.reason, '');
    assert.equal(quote.receiveCount, bottle ? 3 : 1);
    assert.ok(
      sectServiceContent(save, false, id).includes(
        `${MEDICINES.find((m) => m.id === id)!.name} ×${quote.receiveCount}`,
      ),
    );
    const before = save.medicine.bag[id];
    assert.ok(executeSectService(save, id, sectServiceStamp(save)));
    assert.equal(save.medicine.bag[id], before + quote.receiveCount!);
  });
}

test('真实帧内木心寿尽后cache事件存档可自读，活体超龄仍拒绝', () => {
  const save = fixture(9),
    game = new Game(save, 0, 0, () => 0.5);
  game.time = 100;
  game.weapons[0].timer = 99999;
  game.spawnBudget = -10000;
  game.nextElite = 99999;
  game.bossSpawned = true;
  const boss = game.spawnEnemy(10, false, true, { x: -180, y: 0 }, 0);
  Object.assign(boss, { speed: 0, cooldown: 99999, pursuitCooldown: 99999, skillStep: 3 });
  game.castBossSkill(boss, 1, 0);
  game.enemies.find((e) => e.bossSummon?.kind === 'heart')!.bossSummon!.age = 8;
  game.cacheChallenge = { x: 0, y: 0, phase: 'offered', deadline: 100.005, guardians: [] };
  let saved = 0;
  game.onEvent = (name) =>
    gameEvent(
      {
        gameAudio: { play() {} },
        persist() {
          const snapshot = game.snapshot();
          assert.ok(Game.restore(structuredClone(save), snapshot));
          assert.equal(
            readSave(JSON.stringify({ ...save, activeRun: snapshot })).save.cultivation,
            save.cultivation,
          );
          assert.ok(snapshot.enemies.every((e) => !e.bossSummon || !e.dead));
          saved++;
          return true;
        },
      } as any,
      name,
    );
  game.update(0.01);
  assert.equal(saved, 1, '必须经过真实帧内cache事件，而非仅帧尾取快照');
  const invalid = game.snapshot();
  invalid.enemies.find((e) => e.bossSummon)!.bossSummon!.age = 8.01;
  assert.equal(Game.restore(structuredClone(save), invalid), null);
});

function ambushFixture() {
  for (let seed = 1; seed < 1000; seed++) {
    const save = freshSave('heaven', ['metal'], 'orthodox', () => 0);
    save.age = 30;
    save.cultivation = 1;
    save.stones = 10000;
    save.prologueSeen = save.hometownSeen = true;
    save.mortal.hometown!.stage = 'departed';
    save.mortal.population = { seed, since: 15 };
    enterNextMarketBatch(save);
    const npc = MARKET_CULTIVATORS.find(({ id }) => {
      const o = marketOpportunity(save, id);
      return o?.kind === 'invitation' && !o.honest;
    });
    if (npc && chooseMarketOpportunity(save, npc.id, 1, 'accept')) return save;
  }
  throw Error('找不到真实固定遭遇');
}

for (const room of [0, 1, 2]) {
  test(`劫修胜利丹药容量剩${room}时准确结算、不重复领取、不破坏原药袋`, () => {
    const save = ambushFixture(),
      encounter = save.mortal.marketSocial!.ambush!;
    const medicine = encounter.loot.find((item) => item.kind === 'medicine')!;
    assert.ok(medicine);
    save.medicine.bag[medicine.id] = Number.MAX_SAFE_INTEGER - room;
    encounter.snapshot.outcome = 'victory';
    encounter.snapshot.enemy.hp = 0;
    const held = encounter.held,
      stones = save.stones,
      count = medicine.quantity;
    const result = settleMarketAmbush(save, 'victory');
    assert.ok(result);
    assert.equal(save.stones, stones + held);
    assert.equal(
      save.medicine.bag[medicine.id],
      Number.MAX_SAFE_INTEGER - room + Math.min(room, count),
    );
    assert.equal(save.mortal.marketSocial!.ambush, null);
    assert.ok(save.mortal.sectMarket!.absent?.includes(encounter.npcId as any));
    if (room < count) assert.ok(result.text.includes(`×${count - room}未能收取`));
    else assert.ok(!result.text.includes('未能收取'));
    assert.equal(validMedicine(save.medicine), true);
    assert.deepEqual(readSave(JSON.stringify(save)).save.medicine, save.medicine);
    assert.equal(settleMarketAmbush(save, 'victory'), undefined);
    assert.equal(save.stones, stones + held);
  });
}
