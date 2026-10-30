import test from 'node:test';
import assert from 'node:assert/strict';
import { CURIO_IDS, grantCurio } from '../src/curio-data.ts';
import { MEDICINES, medicineInfo } from '../src/medicine-data.ts';
import {
  claimNightBoat,
  nightBoatCanClaim,
  validNightBoat,
  visitNightBoat,
} from '../src/night-boat.ts';
import { freshSave, lifespanInfo, realmCost, type SaveData } from '../src/progress.ts';

const cultivationAt = (realm: number) =>
  Array.from({ length: realm * 3 }, (_, step) => realmCost(step)).reduce(
    (sum, cost) => sum + cost,
    0,
  );
const traveller = () => {
  const save = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  save.age = 2015;
  save.cultivation = cultivationAt(5);
  return save;
};
const rolls =
  (...values: number[]) =>
  () => {
    assert.ok(values.length, '不应多抽随机数');
    return values.shift()!;
  };
const noRoll = () => assert.fail('条件不足不应抽取夜船');
const show = (save: SaveData, rewardRoll: number, pick = 0) => {
  visitNightBoat(save, 15, rolls(0, rewardRoll, pick));
  assert.ok(save.mortal.nightBoat);
  assert.equal(validNightBoat(save.mortal.nightBoat, save.age), true);
  return save.mortal.nightBoat;
};

test('夜船仅在距上次实际入镇满2000年且基础寿元有限时判定，未满足就清除上次状态', () => {
  for (const lastVisitAge of [undefined, NaN, Infinity, -1, 15.001, 2015, 2016]) {
    const save = traveller();
    show(save, 0.5);
    visitNightBoat(save, lastVisitAge, noRoll);
    assert.equal(save.mortal.nightBoat, null, String(lastVisitAge));
  }
  const eligible = traveller();
  show(eligible, 0.5);
  assert.equal(eligible.mortal.nightBoat!.appearedAt, 2015);
  for (const realm of [7, 8]) {
    const save = traveller();
    show(save, 0.5);
    save.cultivation = cultivationAt(realm);
    if (realm === 8) save.completed = [6];
    assert.equal(lifespanInfo(save).base, Infinity);
    visitNightBoat(save, 15, noRoll);
    assert.equal(save.mortal.nightBoat, null);
  }
});

test('出现概率30%边界，寿尽或其他终局不会再生成夜船', () => {
  const save = traveller();
  visitNightBoat(save, 15, rolls(0.299999999, 0.5, 0));
  assert.ok(save.mortal.nightBoat);
  for (const roll of [0.3, 0.999999]) {
    visitNightBoat(save, 15, rolls(roll));
    assert.equal(save.mortal.nightBoat, null);
  }
  for (const ending of ['lifespan', 'tribulation', 'ambush', 'extreme'] as const) {
    save.pendingReincarnation = ending;
    visitNightBoat(save, 15, noRoll);
    assert.equal(save.mortal.nightBoat, null);
  }
  save.pendingReincarnation = null;
  save.journeyEnded = true;
  visitNightBoat(save, 15, noRoll);
  assert.equal(save.mortal.nightBoat, null);
});

test('夜船40%奇物/40%限时珍品/20%本世珍品及15%/8%/20%折寿在出现时固定', () => {
  for (const [roll, kind, cost] of [
    [0, 'curio', 750],
    [0.399999999, 'curio', 750],
    [0.4, 'timed', 400],
    [0.799999999, 'timed', 400],
    [0.8, 'permanent', 1000],
    [0.999999999, 'permanent', 1000],
  ] as const) {
    const save = traveller();
    const before = structuredClone(save);
    const boat = show(save, roll);
    assert.equal(lifespanInfo(save).base, 5000);
    assert.deepEqual(boat, { appearedAt: 2015, kind, id: boat.id, cost, claimed: false });
    assert.deepEqual(save.medicine, before.medicine);
    assert.deepEqual(save.curios, before.curios);
    assert.equal(save.lifespanSpent, before.lifespanSpent, '生成货物不扣寿元');
  }
});

test('八件奇物逐件排除已得或售出者，绝不出现掌天瓶，奇物池空时改成限时珍品', () => {
  for (const wanted of CURIO_IDS.slice(1)) {
    const save = traveller();
    for (const id of CURIO_IDS.filter((id) => id !== wanted)) {
      assert.equal(grantCurio(save, id), true);
      delete save.curios.bag[id];
    }
    const boat = show(save, 0.1, 0.999999);
    assert.equal(boat.kind, 'curio');
    assert.equal(boat.id, wanted);
    assert.equal(boat.cost, 750);
  }
  const save = traveller();
  for (const id of CURIO_IDS.slice(1)) {
    grantCurio(save, id);
    delete save.curios.bag[id];
  }
  assert.equal(save.curios.acquired.includes('heaven-bottle'), false);
  const boat = show(save, 0.1, 0.999999);
  assert.equal(boat.kind, 'timed');
  assert.equal(boat.cost, 400);
  assert.equal(medicineInfo(boat.id)!.tier, '珍品');
  assert.ok(medicineInfo(boat.id)!.years > 0);
});

test('所有限时珍品和本世珍品均可出现，不受妖王关卡过滤', () => {
  for (const [roll, kind] of [
    [0.5, 'timed'],
    [0.9, 'permanent'],
  ] as const) {
    const pool = MEDICINES.filter((m) => m.tier === '珍品' && m.years > 0 === (kind === 'timed'));
    assert.equal(pool.length, kind === 'timed' ? 8 : 4);
    for (const [index, medicine] of pool.entries()) {
      const save = traveller();
      const boat = show(save, roll, (index + 0.5) / pool.length);
      assert.equal(boat.kind, kind);
      assert.equal(boat.id, medicine.id);
    }
  }
});

test('夜船结构校验拒绝错误种类/物品、掌天瓶、未来年岁、非整数或溢出费用及非布尔领取值', () => {
  const save = traveller();
  const original = show(save, 0.5);
  for (const patch of [
    { appearedAt: -1 },
    { appearedAt: save.age + 0.1 },
    { appearedAt: Infinity },
    { kind: 'unknown' },
    { kind: 'curio', id: 'heaven-bottle' },
    { kind: 'curio', id: 'sword' },
    { kind: 'timed', id: 'butian' },
    { kind: 'permanent', id: 'mingqing' },
    { id: 'heqi' },
    { id: 'unknown' },
    { cost: 0 },
    { cost: -1 },
    { cost: 1.5 },
    { cost: Infinity },
    { cost: Number.MAX_SAFE_INTEGER + 1 },
    { claimed: 1 },
  ])
    assert.equal(validNightBoat({ ...original, ...patch }, save.age), false, JSON.stringify(patch));
  for (const value of [null, undefined, [], false, {}, 3])
    assert.equal(validNightBoat(value, save.age), false);
  assert.equal(validNightBoat(original, NaN), false);
  assert.equal(validNightBoat({ ...original, claimed: true }, save.age), true);
});

test('换取三类物品只扣固定阳寿、不扣灵石或增加年岁，并记履历，claimed后不能重复领取', () => {
  for (const roll of [0.1, 0.5, 0.9]) {
    const save = traveller();
    save.stones = 123;
    const boat = show(save, roll);
    const before = lifespanInfo(save);
    assert.equal(nightBoatCanClaim(save), true);
    assert.equal(claimNightBoat(save), true);
    assert.equal(save.lifespanSpent, boat.cost);
    assert.equal(lifespanInfo(save).limit, before.limit - boat.cost);
    assert.equal(save.age, 2015);
    assert.equal(save.stones, 123);
    assert.equal(boat.claimed, true);
    if (boat.kind === 'curio') {
      assert.equal(save.curios.bag[boat.id as (typeof CURIO_IDS)[number]], 1);
      assert.ok(save.curios.acquired.includes(boat.id as (typeof CURIO_IDS)[number]));
    } else assert.equal(save.medicine.bag[boat.id], 1);
    const entry = save.chronicle.entries.find((item) => item.title === '夜船')!;
    assert.ok(entry);
    assert.match(entry.detail, new RegExp(`折寿 ${boat.cost} 年`));
    const claimed = structuredClone(save);
    assert.equal(nightBoatCanClaim(save), false);
    assert.equal(claimNightBoat(save), false);
    assert.deepEqual(save, claimed);
  }
});

test('出现后突破仍按旧整数cost折寿，购买后至少保留当前基础寿元一成', () => {
  const save = traveller();
  const boat = show(save, 0.9);
  assert.equal(boat.cost, 1000);
  save.cultivation = cultivationAt(6);
  assert.equal(lifespanInfo(save).base, 10000);
  assert.equal(boat.cost, 1000);
  assert.equal(claimNightBoat(save), true);
  assert.equal(save.lifespanSpent, 1000);
  assert.equal(lifespanInfo(save).limit, 9000);
  for (const offset of [-0.001, 0, 0.001]) {
    const boundary = traveller();
    const offer = show(boundary, 0.5);
    boundary.age = 5000 - offer.cost - 500 + offset;
    const before = structuredClone(boundary);
    assert.equal(nightBoatCanClaim(boundary), offset <= 0);
    assert.equal(claimNightBoat(boundary), offset <= 0);
    if (offset > 0) assert.deepEqual(boundary, before);
    else assert.ok(lifespanInfo(boundary).remaining >= 500);
  }
});

test('未结历练或其他机缘已经占用的唯一奇物不发放、不扣寿，也不换货重抽', () => {
  for (const mode of ['pending', 'acquired', 'sold'] as const) {
    const save = traveller();
    const boat = show(save, 0.1);
    const pending = mode === 'pending' ? { [boat.id]: 1 } : {};
    if (mode !== 'pending') {
      grantCurio(save, boat.id);
      if (mode === 'sold') delete save.curios.bag[boat.id as (typeof CURIO_IDS)[number]];
    }
    const before = structuredClone(save);
    assert.equal(nightBoatCanClaim(save, pending), false);
    assert.equal(claimNightBoat(save, pending), false);
    assert.deepEqual(save, before);
  }
});

test('夜船第三件奇物沿用奇珍有缘成就记录', () => {
  const save = traveller();
  grantCurio(save, 'heaven-bottle');
  grantCurio(save, 'soul-wood');
  show(save, 0.1);
  assert.equal(claimNightBoat(save), true);
  assert.equal(new Set(save.curios.acquired).size, 3);
  assert.equal(save.chronicle.milestones['curio-three'], save.age);
});

test('本世多次夜船折寿累计，按基础寿元而非延寿后的上限计价', () => {
  const save = traveller();
  save.lifespanBonus = 5000;
  assert.equal(show(save, 0.5).cost, 400);
  assert.equal(claimNightBoat(save), true);
  save.age += 2000;
  visitNightBoat(save, 2015, rolls(0, 0.5, 0));
  assert.equal(save.mortal.nightBoat!.cost, 400);
  assert.equal(claimNightBoat(save), true);
  assert.equal(save.lifespanSpent, 800);
  assert.equal(save.medicine.bag[save.mortal.nightBoat!.id], 2);
  assert.equal(lifespanInfo(save).limit, 9200);
});

test('满药囊、非法库存、累计折寿溢出及非法字段全部原子拒绝', () => {
  const invalidCounts = [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER];
  for (const count of invalidCounts) {
    const save = traveller();
    const boat = show(save, 0.5);
    save.medicine.bag[boat.id] = count;
    const before = structuredClone(save);
    assert.equal(nightBoatCanClaim(save), false);
    assert.equal(claimNightBoat(save), false);
    assert.deepEqual(save, before);
  }
  for (const spent of [
    -1,
    0.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    Number.MAX_SAFE_INTEGER - 1,
  ]) {
    const save = traveller();
    show(save, 0.5);
    save.lifespanBonus = Number.MAX_SAFE_INTEGER;
    save.lifespanSpent = spent;
    const before = structuredClone(save);
    assert.equal(nightBoatCanClaim(save), false);
    assert.equal(claimNightBoat(save), false);
    assert.deepEqual(save, before);
  }
  const invalid = traveller();
  invalid.mortal.nightBoat = {
    appearedAt: 2015,
    kind: 'timed',
    id: 'butian',
    cost: 400,
    claimed: false,
  };
  const before = structuredClone(invalid);
  assert.equal(claimNightBoat(invalid), false);
  assert.deepEqual(invalid, before);
});

test('落幕、大乘、气数已尽及不存在的夜船都不能购买，不产生任何部分变化', () => {
  for (const alter of [
    (save: SaveData) => {
      save.journeyEnded = true;
    },
    ...(['lifespan', 'tribulation', 'ambush', 'extreme'] as const).map(
      (ending) => (save: SaveData) => {
        save.pendingReincarnation = ending;
      },
    ),
    (save: SaveData) => {
      save.cultivation = cultivationAt(7);
    },
    (save: SaveData) => {
      save.age = lifespanInfo(save).limit;
    },
    (save: SaveData) => {
      save.mortal.nightBoat = null;
    },
  ]) {
    const save = traveller();
    show(save, 0.5);
    alter(save);
    const before = structuredClone(save);
    assert.equal(nightBoatCanClaim(save), false);
    assert.equal(claimNightBoat(save), false);
    assert.deepEqual(save, before);
  }
});
