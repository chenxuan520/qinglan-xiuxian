import test from 'node:test';
import assert from 'node:assert/strict';
import { FINAL_TRIAL_STAGE, REALMS } from '../src/data.ts';
import { freshSave, readSave, realmCost, realmInfo, SAVE_SCHEMA } from '../src/progress.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';
import { beginSectMarketVisit } from '../src/sect-market.ts';
import { marketCharacters, marketRelation } from '../src/sect-market-data.ts';
import { validMortal } from '../src/mortal-data.ts';
import { validMarketFellow } from '../src/market-fellow-data.ts';
import {
  marketFellowCharacter,
  marketFellowView,
  meetMarketFellow,
  chooseMarketFellow,
} from '../src/market-fellow.ts';

function fixture() {
  const save = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  save.prologueSeen = save.hometownSeen = true;
  save.mortal.hometown!.stage = 'departed';
  save.age = 30;
  save.cultivation = 1;
  save.mortal.population = { seed: 12345, since: 15 };
  assert.ok(beginSectMarketVisit(save));
  return save;
}

function choiceFixture(choice: 'stay' | 'travel', age = 35) {
  const save = fixture();
  assert.ok(meetMarketFellow(save));
  save.age = age;
  assert.ok(meetMarketFellow(save));
  assert.ok(chooseMarketFellow(save, choice, save.mortal.sectMarket!.visit));
  return save;
}

test('同道首逢自然记录，反复进出只换原十五位访客，不推进三段经历或重记行迹', () => {
  const save = fixture();
  const randomVisitors = marketCharacters(save.mortal.population!, save.mortal.sectMarket!);
  assert.equal(randomVisitors.length, 15);
  const fellow = marketFellowCharacter(save)!;
  assert.equal(fellow.name, '温照川');
  assert.equal(fellow.realm, '筑基');
  assert.ok(meetMarketFellow(save));
  assert.equal(save.mortal.marketFellow!.metAt, 30);
  assert.equal(meetMarketFellow(save), false);
  const entries = save.chronicle.entries.length;
  for (let i = 0; i < 10; i++) {
    assert.ok(beginSectMarketVisit(save));
    assert.equal(meetMarketFellow(save), false);
    assert.deepEqual(marketFellowCharacter(save), fellow);
    assert.deepEqual(marketFellowView(save)!.actions, []);
  }
  assert.notDeepEqual(
    marketCharacters(save.mortal.population!, save.mortal.sectMarket!),
    randomVisitors,
  );
  assert.equal(save.chronicle.entries.length, entries);
  assert.equal(save.mortal.marketFellow!.reunionAt, null);
});

test('第二逢要足五年，一次分支生效；第三逢从真正选择时起再等十年', () => {
  for (const choice of ['stay', 'travel'] as const) {
    const save = fixture();
    meetMarketFellow(save);
    save.age = 34.999;
    assert.equal(meetMarketFellow(save), false);
    assert.equal(chooseMarketFellow(save, choice, 1), false);
    save.age = 35;
    assert.ok(meetMarketFellow(save));
    assert.equal(meetMarketFellow(save), false);
    assert.equal(marketFellowView(save)!.actions.length, 2);
    save.age = 50;
    assert.ok(chooseMarketFellow(save, choice, 1));
    assert.equal(save.mortal.marketFellow!.chosenAt, 50);
    assert.equal(chooseMarketFellow(save, choice === 'stay' ? 'travel' : 'stay', 1), false);
    assert.equal(chooseMarketFellow(save, 'read', 1), false);
    assert.equal(marketFellowView(save)!.hint, null);
    save.age = 59.999;
    assert.equal(chooseMarketFellow(save, 'read', 1), false);
    save.age = 60;
    assert.deepEqual(
      marketFellowView(save)!.actions.map((a) => a.id),
      ['read'],
    );
    assert.ok(chooseMarketFellow(save, 'read', 1));
    const complete = structuredClone(save);
    assert.equal(chooseMarketFellow(save, 'read', 1), false);
    assert.equal(meetMarketFellow(save), false);
    assert.deepEqual(save, complete);
    assert.equal(marketFellowView(save)!.hintKind, choice === 'stay' ? 'trade' : 'trail');
    assert.match(marketFellowView(save)!.hint!, choice === 'stay' ? /交货凭据/ : /接应人/);
    assert.ok(validMortal(save.mortal, save.age));
  }
});

test('正常经历只修改同道与行迹，年岁、丹囊、灵石和所有战斗养成均保持', () => {
  const save = fixture();
  const before = structuredClone(save);
  meetMarketFellow(save);
  save.age += 5;
  meetMarketFellow(save);
  chooseMarketFellow(save, 'travel', 1);
  save.age += 10;
  chooseMarketFellow(save, 'read', 1);
  const after = structuredClone(save);
  delete after.mortal.marketFellow;
  after.age = before.age;
  after.chronicle = before.chronicle;
  after.mortal.events = before.mortal.events;
  assert.deepEqual(after, before);
});

test('第一次晚来按真正相识年岁起算，突破或短期重复来访不能越过等待', () => {
  const save = fixture();
  save.age = 10000;
  assert.ok(meetMarketFellow(save));
  assert.equal(save.mortal.marketFellow!.metAt, 10000);
  save.cultivation = Array.from({ length: 23 }, (_, i) => realmCost(i)).reduce((a, b) => a + b, 0);
  assert.ok(beginSectMarketVisit(save));
  assert.equal(meetMarketFellow(save), false);
  assert.match(marketFellowView(save)!.knownMemory, /10000\.0岁/);
  assert.doesNotMatch(marketFellowView(save)!.knownMemory, /30\.0岁|再逢|后人/);
});

test('初逢后跨数千年归来由后人接旧愿，选择不会复活温照川，也不能同龄完成', () => {
  const save = fixture();
  meetMarketFellow(save);
  save.age = 10030;
  assert.ok(beginSectMarketVisit(save));
  assert.ok(meetMarketFellow(save));
  const npc = marketFellowCharacter(save)!;
  assert.equal(npc.name, '温氏后人');
  assert.ok(npc.generation > 1);
  assert.equal(npc.realm, '炼气');
  const view = marketFellowView(save)!;
  assert.equal(view.alive, false);
  assert.match(view.text.join(''), /150\.0岁那年寿尽/);
  assert.match(view.text.join(''), /并非亲历/);
  assert.ok(view.actions.every((a) => a.label.includes('后人')));
  assert.ok(chooseMarketFellow(save, 'stay', 2));
  assert.equal(marketFellowCharacter(save)!.name, '温氏后人');
  assert.equal(chooseMarketFellow(save, 'read', 2), false);
  save.age += 10;
  assert.ok(chooseMarketFellow(save, 'read', 2));
  assert.match(marketFellowView(save)!.text.join(''), /后人按你重访时的建议/);
  assert.doesNotMatch(marketFellowView(save)!.text.join(''), /温照川认出了你|温照川从外地归来/);
  assert.match(marketFellowView(save)!.knownMemory, /建议温氏后人延续旧愿/);
  assert.ok(validMortal(save.mortal, save.age));
});

test('同道境界不跟玩家重抽，称谓从真正双方境界计算，后人不会冒充真仙', () => {
  const save = fixture();
  meetMarketFellow(save);
  for (let realm = 0; realm < REALMS.length; realm++) {
    save.cultivation = Math.max(
      1,
      Array.from({ length: Math.min(24, realm * 3) }, (_, i) => realmCost(i)).reduce(
        (a, b) => a + b,
        0,
      ),
    );
    save.completed = realm === 8 ? [FINAL_TRIAL_STAGE] : [];
    const npc = marketFellowCharacter(save)!;
    assert.equal(npc.realmIndex, 1);
    const rank = realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).index;
    assert.equal(
      marketRelation(npc.realmIndex, rank),
      rank < 1 ? '前辈' : rank === 1 ? '道友' : '蝼蚁',
    );
  }
  save.age = 150;
  assert.equal(marketFellowCharacter(save)!.realmIndex, 0);
  assert.notEqual(marketFellowCharacter(save)!.realm, '真仙');
});

test('生前留坊十年结丹，访药八十年结婴，寿数随真实突破延长且到期由后人接话', () => {
  for (const choice of ['stay', 'travel'] as const) {
    const save = choiceFixture(choice);
    save.age = 44.999;
    assert.equal(marketFellowCharacter(save)!.realm, '筑基');
    save.age = 45;
    assert.equal(marketFellowCharacter(save)!.realm, '金丹');
    assert.doesNotMatch(marketFellowView(save)!.text.join(''), /金丹|元婴/);
    assert.match(marketFellowView(save)!.text.join(''), /岁月又在药册上添了新页/);
    chooseMarketFellow(save, 'read', 1);
    save.age = 114.999;
    assert.equal(marketFellowCharacter(save)!.realm, '金丹');
    save.age = 115;
    assert.equal(marketFellowCharacter(save)!.realm, choice === 'stay' ? '金丹' : '元婴');
    if (choice === 'travel')
      assert.doesNotMatch(marketFellowView(save)!.text.join(''), /金丹|元婴/);
    const deathAge = choice === 'stay' ? 450 : 950;
    save.age = deathAge - 0.001;
    assert.equal(marketFellowCharacter(save)!.name, '温照川');
    save.age = deathAge;
    assert.equal(marketFellowCharacter(save)!.name, '温氏后人');
    assert.equal(marketFellowCharacter(save)!.generation, 1);
    assert.equal(marketFellowCharacter(save)!.realm, '炼气');
    assert.match(marketFellowView(save)!.knownMemory, new RegExp(`${deathAge}\\.0岁那年寿尽`));
    save.age += 80;
    assert.equal(marketFellowCharacter(save)!.generation, 2);
    assert.equal(marketFellowView(save)!.complete, true);
    assert.equal(marketFellowView(save)!.hintKind, choice === 'stay' ? 'trade' : 'trail');
    assert.ok(validMortal(save.mortal, save.age));
  }
});

test('十年突破必须严格早于原寿尽；最后十年才选的人不会先死后复活', () => {
  for (const choice of ['stay', 'travel'] as const) {
    const timely = choiceFixture(choice, 139.999);
    timely.age = 149.999;
    assert.equal(marketFellowCharacter(timely)!.realm, '金丹');
    timely.age = 150;
    assert.equal(marketFellowCharacter(timely)!.name, '温照川');
    for (const age of [140, 149.999]) {
      const late = choiceFixture(choice, age);
      late.age = 149.999;
      assert.equal(marketFellowCharacter(late)!.name, '温照川');
      assert.equal(marketFellowCharacter(late)!.realm, '筑基');
      late.age = 150;
      assert.equal(marketFellowCharacter(late)!.name, '温氏后人');
      late.age = age + 10;
      assert.ok(chooseMarketFellow(late, 'read', 1));
      assert.equal(marketFellowCharacter(late)!.realm, '炼气');
      assert.match(marketFellowView(late)!.text.join(''), /未及圆愿.*未能走成的十年之约.*后人/);
      assert.doesNotMatch(marketFellowView(late)!.text.join(''), /结成金丹|已修至元婴/);
      late.age = 1100;
      assert.equal(marketFellowCharacter(late)!.name, '温氏后人');
      assert.ok(validMortal(late.mortal, late.age));
    }
    const posthumous = choiceFixture(choice, 150);
    posthumous.age = 250;
    assert.equal(marketFellowCharacter(posthumous)!.name, '温氏后人');
    assert.match(marketFellowView(posthumous)!.text.join(''), /后人按你重访时的建议/);
  }
});

test('小数相识年岁在后人换代的精确节点归属新一代', () => {
  const save = fixture();
  save.age = 56.001;
  meetMarketFellow(save);
  const boundary = save.age + 120 + 80;
  save.age = boundary - 1e-8;
  assert.equal(marketFellowCharacter(save)!.generation, 1);
  save.age = boundary;
  assert.equal(marketFellowCharacter(save)!.generation, 2);
});

test('陈旧访次、非法选择、寿尽待轮回和劫修未结均不能写入同道进度', () => {
  const save = fixture();
  meetMarketFellow(save);
  save.age += 5;
  meetMarketFellow(save);
  beginSectMarketVisit(save);
  const before = structuredClone(save);
  assert.equal(chooseMarketFellow(save, 'stay', 1), false);
  assert.equal(chooseMarketFellow(save, 'gift', 2), false);
  assert.deepEqual(save, before);
  for (const blocked of ['journeyEnded', 'pendingReincarnation', 'ambush'] as const) {
    const next = structuredClone(save);
    if (blocked === 'journeyEnded') next.journeyEnded = true;
    if (blocked === 'pendingReincarnation') next.pendingReincarnation = 'lifespan';
    if (blocked === 'ambush')
      next.mortal.marketSocial!.ambush = {
        visit: 2,
        npcId: 'market-alchemist',
        at: next.age,
        held: 1,
      };
    const frozen = structuredClone(next);
    assert.equal(chooseMarketFellow(next, 'stay', 2), false);
    assert.equal(meetMarketFellow(next), false);
    assert.deepEqual(next, frozen);
  }
});

test('各段状态同版本存档导入导出保持，坏字段单独清理不抹掉宗门与原坊市', () => {
  const save = fixture();
  const roundTrip = () => {
    const imported = importSave(exportSave(save, null)).save;
    assert.deepEqual(imported.mortal.marketFellow, save.mortal.marketFellow);
    assert.equal(imported.schema, SAVE_SCHEMA);
    assert.ok(validMortal(imported.mortal, imported.age));
  };
  roundTrip();
  meetMarketFellow(save);
  roundTrip();
  save.age += 5;
  meetMarketFellow(save);
  roundTrip();
  chooseMarketFellow(save, 'stay', 1);
  roundTrip();
  save.age += 10;
  chooseMarketFellow(save, 'read', 1);
  roundTrip();
  save.mortal.member = { id: 'power', dueAt: 20, dues: 50 };
  save.mortal.mastery.power = 1;
  const damaged = structuredClone(save);
  damaged.mortal.marketFellow!.metAt = save.age + 1;
  const read = readSave(JSON.stringify(damaged));
  assert.equal(read.status, 'ok');
  assert.equal(read.save.mortal.marketFellow, undefined);
  assert.deepEqual(read.save.mortal.member, save.mortal.member);
  assert.deepEqual(read.save.mortal.mastery, save.mortal.mastery);
  assert.deepEqual(read.save.mortal.sectMarket, save.mortal.sectMarket);
});

test('严格拒绝未来日期、倒序日期、不足年距、未知分支及跳过前段的同道存档', () => {
  const save = choiceFixture('travel');
  save.age += 10;
  chooseMarketFellow(save, 'read', 1);
  const state = save.mortal.marketFellow!;
  const invalid: unknown[] = [
    null,
    [],
    {},
    { ...state, metAt: Infinity },
    { ...state, metAt: save.age + 1 },
    { ...state, metAt: 14 },
    { ...state, reunionAt: null },
    { ...state, reunionAt: state.metAt + 4.9 },
    { ...state, choice: null },
    { ...state, choice: 'trade' },
    { ...state, chosenAt: 34 },
    { ...state, chosenAt: null },
    { ...state, completedAt: 44.9 },
    { ...state, completedAt: save.age + 1 },
    { ...state, claimed: true },
  ];
  for (const value of invalid)
    assert.equal(validMarketFellow(value, save.age, save.mortal.population), false);
  assert.equal(validMarketFellow(state, save.age, undefined), false);
  assert.equal(validMarketFellow(state, save.age, save.mortal.population), true);
});
