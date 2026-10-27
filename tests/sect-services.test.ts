import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSave, realmCost, readSave, SAVE_SCHEMA, trainingCost } from '../src/progress.ts';
import { SECTS, validMortal } from '../src/mortal-data.ts';
import { MEDICINES, medicineInfo, medicineFormula } from '../src/medicine-data.ts';
import { TREASURES } from '../src/data.ts';
import { joinSect, leaveSect, advanceMortal } from '../src/mortal.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';
import { auctionValue } from '../src/auction-items.ts';
import { seekArtifact, seekingOptions, seekingQuote } from '../src/artifact-seeking.ts';
import { venueStamp } from '../src/market-venues.ts';
import {
  sectServiceChoices,
  sectServiceQuote,
  executeSectService,
  sectServiceStamp,
} from '../src/sect-services.ts';
import { serviceDues } from '../src/service-preflight.ts';
import { SECT_SPECIALTIES, validSectServices } from '../src/sect-service-data.ts';
import { sectServiceContent } from '../src/sect-service-ui.ts';
import { seekingContent } from '../src/artifact-seeking-ui.ts';

function fixture(id = 'guard', rank = 6) {
  const s = freshSave('heaven', ['metal']);
  s.cultivation = Array.from({ length: rank * 3 }, (_, n) => realmCost(n)).reduce(
    (a, b) => a + b,
    0,
  );
  s.unlocked = 6;
  s.stones = 100000;
  s.iron = 10000;
  for (const m of MEDICINES) s.medicine.bag[m.id] = 1000;
  s.medicine.recipes = MEDICINES.filter((m) => m.years > 0 && m.tier !== '凡品').map((m) => m.id);
  for (const t of TREASURES) s.forge[t.id] = 0;
  assert.equal(joinSect(s, id), true);
  return s;
}
test('十六宗各有可真实结算的专长，原本命、境界与全局掉落不被改写', () => {
  assert.deepEqual(
    Object.keys(SECT_SPECIALTIES),
    SECTS.map((s) => s.id),
  );
  for (const sect of SECTS) {
    const s = fixture(sect.id);
    if (sect.id === 'crit') s.medicine.recipes = [];
    if (sect.id === 'bone') {
      s.artifacts.push('pagoda');
      s.forge.pagoda = 3;
    }
    if (['magnet', 'soul'].includes(sect.id)) s.training = { vitality: 10, power: 10, speed: 10 };
    const choices = sectServiceChoices(s);
    assert.ok(choices.length, sect.id);
    const choice = choices[0].id,
      q = sectServiceQuote(s, choice);
    assert.equal(q.reason, '', `${sect.id}: ${q.reason}`);
    const starter = s.starter,
      cultivation = s.cultivation,
      age = s.age,
      stones = s.stones,
      iron = s.iron;
    const training = { ...s.training },
      mastery = s.mortal.mastery[sect.id] || 0;
    const text = executeSectService(s, choice, sectServiceStamp(s));
    assert.ok(text, sect.id);
    assert.ok(Math.abs(s.age - age - q.years) < 1e-7);
    assert.equal(s.stones, stones - q.stones - q.reserve);
    assert.equal(s.iron, iron - q.iron);
    assert.equal(s.starter, starter);
    assert.equal(s.cultivation, cultivation);
    if (q.train) assert.equal(s.training[q.train], training[q.train] + (q.levels ?? 1));
    if (q.study) assert.equal(s.mortal.mastery[sect.id], mastery + (q.levels ?? 1));
    if (q.seek) {
      const found = !text.includes('未能寻得');
      assert.equal(s.artifacts.includes(q.seek), found);
      assert.equal(s.forge[q.seek], 0);
      assert.equal(s.mortal.marketVenues?.seeking?.[`artifact:${q.seek}`], 1);
    }
    if (q.recipe) assert.ok(s.medicine.recipes.includes(q.recipe));
    assert.ok(validMortal(s.mortal, s.age), sect.id);
    assert.deepEqual(importSave(exportSave(s)).save, s, sect.id);
    const before = JSON.stringify(s);
    assert.equal(executeSectService(s, choice, sectServiceStamp(s)), undefined);
    assert.equal(JSON.stringify(s), before);
    assert.ok(
      !sectServiceQuote(s, choice).reason ||
        /十年|再过|暂|请选择/.test(sectServiceQuote(s, choice).reason),
    );
  }
});
test('指名寻访取得指定零阶法宝，不改本命，共用托付冷却，已藏、未筑基、续局和旧报价不扣费', () => {
  const s = fixture();
  s.mortal.population = { seed: 12345, since: 15 };
  s.mortal.sectMarket = { visit: 1, openedAt: 15, realmIndex: 6, exchanged: [] };
  const id = seekingOptions(s).find((t) => t.id === 'pagoda')!.id;
  const q = seekingQuote(s, id),
    starter = s.starter,
    stones = s.stones;
  assert.ok(q.price < 360 && q.price > 0);
  assert.ok(q.chance >= 35 && q.chance <= 70);
  assert.equal(q.reason, '');
  assert.ok(seekArtifact(s, id, venueStamp(s)));
  assert.equal(s.stones, stones - q.price);
  assert.equal(s.forge[id], 0);
  assert.equal(s.starter, starter);
  assert.ok(seekingQuote(s, id).reason);
  const other = seekingOptions(s)[0].id;
  assert.match(seekingQuote(s, other).reason, /再过/);
  s.age += 10;
  const before = JSON.stringify(s);
  assert.equal(seekArtifact(s, other, 'stale'), undefined);
  assert.equal(seekArtifact(s, other, venueStamp(s), false, true), undefined);
  assert.equal(JSON.stringify(s), before);
  s.cultivation = 1;
  assert.match(seekingQuote(s, other).reason, /筑基/);
});
test('寻访成功清旧掉落标记、失败原样保留，满收藏不提供重复寻访', () => {
  const outcomes = new Set<boolean>();
  for (let seed = 0; seed < 32; seed++) {
    const s = fixture('power');
    s.curios.seed = seed;
    const id = seekingOptions(s, true)[0].id;
    s.artifactDrops.push(id);
    const result = executeSectService(s, id, sectServiceStamp(s));
    assert.ok(result);
    const found = s.artifacts.includes(id);
    outcomes.add(found);
    assert.equal(s.artifactDrops.includes(id), !found);
    assert.equal(result.includes('未能寻得'), !found);
    s.artifacts = TREASURES.map((t) => t.id);
    assert.equal(seekingOptions(s).length, 0);
    assert.equal(sectServiceChoices(s).length, 0);
  }
  assert.deepEqual(outcomes, new Set([false, true]));
});
test('本门配套限制、十年跨宗额度与职务优惠真实生效，不能用外门报价跨门办理', () => {
  const s = fixture('power', 1);
  const id = sectServiceChoices(s)[0].id,
    price = sectServiceQuote(s, id).stones;
  assert.ok(price > 0 && price < 315);
  s.cultivation = fixture('power', 4).cultivation;
  assert.ok(sectServiceQuote(s, id).stones < price);
  const middle = sectServiceQuote(s, id).stones;
  s.cultivation = fixture('power', 5).cultivation;
  assert.ok(sectServiceQuote(s, id).stones < middle);
  const stamp = sectServiceStamp(s);
  leaveSect(s);
  joinSect(s, 'guard');
  assert.equal(executeSectService(s, 'vitality', stamp), undefined);
  assert.ok(executeSectService(s, 'vitality', sectServiceStamp(s)));
  leaveSect(s);
  joinSect(s, 'forbidden');
  assert.match(sectServiceQuote(s, 'power').reason, /十年/);
});
test('长生代炼预留全部跨期供奉；费用不足、寿尽、天劫、待办与续局保持原状', () => {
  const s = fixture('duration', 3),
    id = 'mingqing';
  assert.ok(s.medicine.recipes.includes(id));
  s.mortal.member!.dueAt = 0.1;
  const q = sectServiceQuote(s, id);
  assert.equal(q.years, 60);
  assert.equal(q.reserve, 200);
  assert.equal(serviceDues(s, 400.1), 600);
  const beforeFormula = medicineFormula(s.medicine, id);
  const before = structuredClone(s);
  s.stones = q.stones + q.reserve - 1;
  const low = JSON.stringify(s);
  assert.equal(executeSectService(s, id, sectServiceStamp(s)), undefined);
  assert.equal(JSON.stringify(s), low);
  Object.assign(s, structuredClone(before));
  const bag = s.medicine.bag[id];
  assert.ok(executeSectService(s, id, sectServiceStamp(s)));
  assert.equal(s.medicine.bag[id], bag + 1);
  for (const i of beforeFormula)
    assert.equal(s.medicine.bag[i.id], before.medicine.bag[i.id] - i.count);
  assert.deepEqual(medicineFormula(s.medicine, id), beforeFormula);
  for (const mutate of [
    (s: typeof before) => {
      s.age = 999;
    },
    (s: typeof before) => {
      s.nextTribulationAge = s.age + 1;
    },
    (s: typeof before) => {
      s.journeyEnded = true;
    },
    (s: typeof before) => {
      s.mortal.activity = { kind: 'study', remaining: 1, total: 1, sect: 'duration' };
    },
  ]) {
    const n = structuredClone(before);
    mutate(n);
    const raw = JSON.stringify(n);
    assert.equal(executeSectService(n, id, sectServiceStamp(n)), undefined);
    assert.equal(JSON.stringify(n), raw);
  }
  const n = structuredClone(before);
  assert.ok(sectServiceQuote(n, id, true).reason);
});
test('精研五阶赐灵品丹；献器保护本命，非本命入门器的已售记录不依赖进入坊市', () => {
  const s = fixture('bone');
  const other = s.artifacts.find((id) => id !== s.starter)!;
  s.forge[other] = 1;
  s.mortal.mastery.bone = 4;
  assert.ok(!sectServiceChoices(s).some((c) => c.id === s.starter));
  const count = Object.values(s.medicine.bag).reduce((a, b) => a + b, 0);
  const q = sectServiceQuote(s, other);
  assert.equal(q.stones, 47);
  assert.ok(executeSectService(s, other, sectServiceStamp(s)));
  assert.equal(s.mortal.mastery.bone, 5);
  assert.equal(
    Object.values(s.medicine.bag).reduce((a, b) => a + b, 0),
    count + 1,
  );
  assert.ok(!s.artifacts.includes(other));
  assert.equal(s.forge[other], 0);
  assert.ok(validMortal(s.mortal, s.age));
  const restored = importSave(exportSave(s)).save;
  assert.ok(!restored.artifacts.includes(other));
  assert.deepEqual(restored, s);
});
test('换丹不生成永久丹与价值循环，炉料、境界及丹囊上限校验不能跳过', () => {
  for (const id of ['area', 'abyss', 'curse']) {
    const s = fixture(id, 3);
    for (const c of sectServiceChoices(s)) {
      const q = sectServiceQuote(s, c.id);
      assert.ok(q.give[0].quantity >= 1);
      assert.ok(medicineInfo(q.receive!)!.years > 0);
      const outputValue = auctionValue({
        kind: 'medicine',
        id: q.receive!,
        quantity: 1,
        forgeLevel: 0,
      });
      assert.ok(auctionValue(q.give[0]) * 100 <= outputValue * 135);
      assert.ok(
        auctionValue(q.give[0]) >=
          auctionValue({ kind: 'medicine', id: q.receive!, quantity: 1, forgeLevel: 0 }),
      );
    }
    const c = sectServiceChoices(s)[0].id,
      q = sectServiceQuote(s, c);
    s.medicine.bag[q.give[0].id] = 0;
    assert.ok(sectServiceQuote(s, c).reason);
  }
  const s = fixture('duration');
  const id = sectServiceChoices(s)[0].id;
  s.medicine.bag[id] = Number.MAX_SAFE_INTEGER;
  assert.match(sectServiceQuote(s, id).reason, /上限/);
  s.medicine.recipes = [];
  assert.ok(sectServiceQuote(s, id).reason);
});
test('满阶不能超修，玄铁抵费不兑换现金；存档冷却与记录往返和旧档升级', () => {
  const s = fixture('magnet');
  s.training.power = 19;
  const q = sectServiceQuote(s, 'power');
  assert.ok(q.stones + q.iron * 16 === trainingCost(19));
  assert.ok(executeSectService(s, 'power', sectServiceStamp(s)));
  s.age += 10;
  assert.match(sectServiceQuote(s, 'power').reason, /二十阶/);
  assert.deepEqual(readSave(JSON.stringify(s)).save, s);
  const old = structuredClone(s);
  old.schema = SAVE_SCHEMA - 1;
  delete old.mortal.sectServices;
  const migrated = readSave(JSON.stringify(old)).save;
  assert.equal(migrated.schema, SAVE_SCHEMA);
  assert.deepEqual(migrated.training, s.training);
  assert.equal(validSectServices({ lastAt: s.age + 1, receipts: [] }, s.age), false);
  assert.equal(
    validSectServices({ lastAt: s.age, receipts: [{ sect: 'fake', at: s.age, text: 'x' }] }, s.age),
    false,
  );
  assert.ok(sectServiceContent(s, false, 'power').includes('data-cost-stones'));
  assert.ok(seekingContent(s).includes('id="seeking-school"'));
  assert.ok(!/position:\s*(sticky|fixed)/.test(sectServiceContent(s)));
  advanceMortal(s, 60);
});

test('十阶满精研明确提示已满，献器与快修均不扣资源；玄铁不足仍可引导广告而执行拒绝', () => {
  for (const id of ['haste', 'spirit', 'bone']) {
    const s = fixture(id);
    s.mortal.mastery[id] = 10;
    s.forge[s.artifacts.find((t) => t !== s.starter)!] = 3;
    const choice = sectServiceChoices(s)[0].id;
    assert.equal(sectServiceQuote(s, choice).reason, '本门精研已满');
    const before = JSON.stringify(s);
    assert.equal(executeSectService(s, choice, sectServiceStamp(s)), undefined);
    assert.equal(JSON.stringify(s), before);
  }
  const s = fixture('soul');
  s.training.speed = 10;
  s.iron = 0;
  const q = sectServiceQuote(s, 'speed');
  assert.equal(q.reason, '');
  assert.ok(q.iron > 0);
  const html = sectServiceContent(s, false, 'speed');
  assert.ok(html.includes(`data-cost-iron="${q.iron}"`));
  assert.ok(!/data-action="sect-service-act"[^>]* disabled/.test(html));
  const before = JSON.stringify(s);
  assert.equal(executeSectService(s, 'speed', sectServiceStamp(s)), undefined);
  assert.equal(JSON.stringify(s), before);
});

test('换丹不以一颗珍品硬换一颗凡品；低阶多份换珍品仍可报价', () => {
  const s = fixture('area');
  const ids = sectServiceChoices(s).map((c) => c.id);
  assert.ok(!ids.includes('lingru@huanglong'));
  assert.ok(ids.includes('huanglong@lingru'));
  const q = sectServiceQuote(s, 'huanglong@lingru');
  assert.equal(q.give[0].quantity, 81);
  assert.ok(sectServiceQuote(s, 'lingru@huanglong').reason);
});

test('空状态按本门事项说明所缺条件，不混入其他宗门的功能', () => {
  const s = fixture('bone');
  s.artifacts = [s.starter];
  const bone = sectServiceContent(s);
  assert.ok(bone.includes('暂无可献出的非本命法宝'));
  assert.ok(!bone.includes('可先收集余丹'));
  const duration = fixture('duration');
  duration.medicine.recipes = [];
  assert.ok(sectServiceContent(duration).includes('尚无已掌握且关卡已解锁'));
  const seek = fixture('power');
  seek.artifacts = TREASURES.map((t) => t.id);
  assert.ok(sectServiceContent(seek).includes('已无符合代寻条件的未藏法宝'));
});

test('献器将一次抵价完整用于最少连续精研阶数，差额补石，境界容纳不下则原物保留', () => {
  const s = fixture('bone', 2);
  s.artifacts.push('orbit');
  const q = sectServiceQuote(s, 'orbit');
  assert.equal(q.reason, '');
  assert.equal(q.levels, 3);
  assert.equal(q.stones, 6); // 30+50+70 − floor(180×0.8)
  assert.deepEqual(q.studyYears, [1.2, 1.7, 2.2]);
  assert.equal(q.years, 5.1);
  assert.match(sectServiceContent(s, false, 'orbit'), /本门精研 \+3阶 · 至3阶/);
  assert.match(executeSectService(s, 'orbit', sectServiceStamp(s))!, /提升3阶至3阶/);
  assert.equal(s.mortal.mastery.bone, 3);
  assert.ok(!s.artifacts.includes('orbit'));
  for (const rank of [1, 2]) {
    const blocked = fixture('bone', rank);
    blocked.artifacts.push('orbit');
    if (rank === 2) blocked.mortal.mastery.bone = 2;
    const before = JSON.stringify(blocked);
    assert.match(sectServiceQuote(blocked, 'orbit').reason, /不足以用完抵价/);
    assert.match(sectServiceContent(blocked, false, 'orbit'), /暂不献物 · 物品保留/);
    assert.equal(executeSectService(blocked, 'orbit', sectServiceStamp(blocked)), undefined);
    assert.equal(JSON.stringify(blocked), before);
  }
});

test('一器连修跨过五阶和十阶各赐丹一次，法宝及炼器只转出一次并可读档', () => {
  const s = fixture('bone', 8);
  s.completed = [0, 1, 2, 3, 4, 5, 6];
  s.mortal.mastery.bone = 4;
  const item = s.artifacts.find((id) => id !== s.starter)!;
  s.forge[item] = 4;
  const q = sectServiceQuote(s, item);
  assert.equal(q.reason, '');
  assert.equal(q.levels, 6);
  assert.equal(q.stones, 154);
  const bagBefore = structuredClone(s.medicine.bag);
  const count = Object.values(s.medicine.bag).reduce((a, b) => a + b, 0);
  assert.ok(executeSectService(s, item, sectServiceStamp(s)));
  assert.equal(s.mortal.mastery.bone, 10);
  assert.equal(
    Object.values(s.medicine.bag).reduce((a, b) => a + b, 0),
    count + 2,
  );
  const gifts = MEDICINES.filter((m) => (s.medicine.bag[m.id] || 0) > (bagBefore[m.id] || 0));
  assert.deepEqual(gifts.map((m) => m.tier).sort(), ['灵品', '珍品']);
  assert.ok(gifts.every((m) => m.years > 0));
  assert.ok(!s.artifacts.includes(item));
  assert.equal(s.forge[item], 0);
  assert.deepEqual(importSave(exportSave(s)).save, s);
  const before = JSON.stringify(s);
  assert.equal(executeSectService(s, item, sectServiceStamp(s)), undefined);
  assert.equal(JSON.stringify(s), before);
});

test('献丹按整份折价连续淬体，不服药、不退现金、不重复抵价或超二十阶', () => {
  const s = fixture('devour', 2);
  const id = MEDICINES.find(
    (m) =>
      m.years > 0 &&
      auctionValue({ kind: 'medicine', id: m.id, quantity: 1, forgeLevel: 0 }) === 1600,
  )!.id;
  const q = sectServiceQuote(s, id);
  assert.equal(q.reason, '');
  assert.equal(q.levels, 8);
  assert.equal(q.stones, 351);
  assert.equal(q.years, 12);
  const before = structuredClone(s);
  assert.match(executeSectService(s, id, sectServiceStamp(s))!, /提升8阶至8阶/);
  assert.equal(s.training.vitality, 8);
  assert.equal(s.medicine.bag[id], before.medicine.bag[id] - 1);
  assert.deepEqual(s.medicine.active, before.medicine.active);
  assert.equal(s.stones, before.stones - q.stones - q.reserve);
  assert.deepEqual(importSave(exportSave(s)).save, s);
  const late = fixture('devour');
  late.training.vitality = 19;
  const valuable = MEDICINES.find(
    (m) =>
      m.years > 0 &&
      auctionValue({ kind: 'medicine', id: m.id, quantity: 1, forgeLevel: 0 }) * 0.85 >
        trainingCost(19),
  )!.id;
  const raw = JSON.stringify(late);
  assert.match(sectServiceQuote(late, valuable).reason, /不足以用完抵价/);
  assert.equal(executeSectService(late, valuable, sectServiceStamp(late)), undefined);
  assert.equal(JSON.stringify(late), raw);
});

test('献物全程预检余额、供奉、寿元、天劫、续局、旧报价与赐丹溢出，拒绝零消耗', () => {
  for (const id of ['bone', 'devour']) {
    const base = fixture(id, 2);
    base.artifacts.push('orbit');
    const choice = id === 'bone' ? 'orbit' : 'huanglong';
    for (const kind of [
      'cash',
      'dues',
      'life',
      'tribulation',
      'unfinished',
      'stale',
      'activity',
      'ended',
    ]) {
      const s = structuredClone(base);
      if (kind === 'dues') s.mortal.member!.dueAt = 0.1;
      const q = sectServiceQuote(s, choice);
      if (kind === 'cash' || kind === 'dues') s.stones = q.stones + q.reserve - 1;
      if (kind === 'life') s.age = 499.9;
      if (kind === 'tribulation') s.nextTribulationAge = s.age + 0.1;
      if (kind === 'activity')
        s.mortal.activity = { kind: 'herbs', remaining: 1, total: 1, sect: null };
      if (kind === 'ended') s.journeyEnded = true;
      const raw = JSON.stringify(s);
      assert.equal(
        executeSectService(
          s,
          choice,
          kind === 'stale' ? 'stale' : sectServiceStamp(s),
          kind === 'unfinished',
        ),
        undefined,
        `${id}/${kind}`,
      );
      assert.equal(JSON.stringify(s), raw, `${id}/${kind}`);
    }
  }
  const s = fixture('bone', 8);
  s.completed = [6];
  s.mortal.mastery.bone = 4;
  const item = s.artifacts.find((id) => id !== s.starter)!;
  s.forge[item] = 4;
  for (const medicine of MEDICINES) {
    const capped = structuredClone(s);
    capped.medicine.bag[medicine.id] = Number.MAX_SAFE_INTEGER;
    const quote = sectServiceQuote(capped, item);
    if (medicine.years > 0 && medicine.tier !== '凡品') {
      assert.equal(quote.reason, '丹囊数量已达上限，请先腾出赐丹空间', medicine.name);
      const raw = JSON.stringify(capped);
      assert.equal(executeSectService(capped, item, sectServiceStamp(capped)), undefined);
      assert.equal(JSON.stringify(capped), raw);
    } else {
      assert.equal(quote.reason, '', `${medicine.name}不在赐丹池，不应阻止精研`);
      assert.ok(executeSectService(capped, item, sectServiceStamp(capped)));
      assert.equal(capped.mortal.mastery.bone, 10);
    }
  }
});

test('代炼同步10/100年基准与三档待遇，筑基珍品代炼仍预留并结清多期供奉', () => {
  for (const [rank, factor] of [
    [1, 0.6],
    [4, 0.5],
    [5, 0.4],
  ]) {
    for (const [id, years] of [
      ['heqi', 10],
      ['mingqing', 100],
    ] as const) {
      const s = fixture('duration', rank);
      const q = sectServiceQuote(s, id);
      assert.equal(q.years, years * factor);
      assert.equal(q.stones, id === 'heqi' ? 60 : 150);
      assert.ok(executeSectService(s, id, sectServiceStamp(s)));
      assert.equal(s.age, 15 + years * factor);
    }
  }
  const s = fixture('duration', 1);
  s.mortal.member!.dueAt = 0.1;
  const q = sectServiceQuote(s, 'mingqing');
  assert.equal(q.reserve, 200);
  const before = structuredClone(s);
  assert.ok(executeSectService(s, 'mingqing', sectServiceStamp(s)));
  assert.equal(before.stones - s.stones, q.stones + 200);
  assert.equal(s.mortal.member!.dueAt, 100.1);
});
