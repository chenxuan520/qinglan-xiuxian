import test from 'node:test';
import assert from 'node:assert/strict';
import {
  freshHometown,
  validHometown,
  hometownParents,
  departHometown,
  visitHometown,
  readHometownLetter,
  hometownLetter,
} from '../src/hometown.ts';
import { freshMortal, validMortal, SECTS } from '../src/mortal-data.ts';
import { freshSave, parseSave } from '../src/progress.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';

const traveller = () => {
  const save = freshSave('heaven', ['fire'], 'orthodox', () => 0);
  save.mortal.hometown!.stage = 'farewell';
  assert.equal(departHometown(save), true);
  return save;
};

test('故乡固定随机、新档年龄寿数上下界与初始状态', () => {
  for (const [roll, mother, father, diesAt] of [
    [0, 34, 37, 75],
    [0.999999, 39, 43, 90],
  ]) {
    const home = freshHometown(() => roll);
    assert.deepEqual(home, {
      stage: 'root',
      parents: {
        mother: { ageAtStart: mother, diesAt },
        father: { ageAtStart: father, diesAt },
      },
      lastVisitAge: null,
      letterFoundAt: null,
      letterRead: false,
    });
    assert.ok(validHometown(home, 15));
    assert.deepEqual(freshSave('heaven', ['fire'], 'orthodox', () => roll).mortal.hometown, home);
    assert.deepEqual(parseSave(null, () => roll).mortal.hometown, home);
  }
  const rolls = [0, 0.999999, 0.999999, 0];
  assert.deepEqual(freshHometown(() => rolls.shift()!).parents, {
    mother: { ageAtStart: 34, diesAt: 90 },
    father: { ageAtStart: 43, diesAt: 75 },
  });
  assert.equal(rolls.length, 0);
});

test('离乡31年后即使最短寿数双亲仍在，年岁只由玩家年龄推导', () => {
  const save = traveller();
  save.mortal.hometown!.parents.mother.ageAtStart = 39;
  save.mortal.hometown!.parents.father.ageAtStart = 43;
  save.age = 46;
  save.mortal.years = 10000;
  assert.deepEqual(hometownParents(save.mortal.hometown!, save.age), [
    { id: 'father', name: '年迈的父亲', alive: true, old: true, age: 74 },
    { id: 'mother', name: '年迈的母亲', alive: true, old: true, age: 70 },
  ]);
  assert.equal(visitHometown(save, 'mother'), true);
  assert.equal(save.mortal.hometown!.letterFoundAt, null);
  assert.equal(save.chronicle.milestones['home-father'], undefined);
});

test('父母六十岁称谓、寿数临界与数百年跳跃不把死者年龄继续增长', () => {
  const home = freshHometown(() => 0);
  assert.deepEqual(
    hometownParents(home, 15).map((p) => p.name),
    ['父亲', '母亲'],
  );
  assert.equal(hometownParents(home, 38 - 0.001)[0].old, false);
  assert.equal(hometownParents(home, 38)[0].old, true);
  assert.equal(hometownParents(home, 41)[1].old, true);
  assert.equal(hometownParents(home, 53 - 0.001)[0].alive, true);
  assert.equal(hometownParents(home, 53)[0].alive, false);
  assert.equal(hometownParents(home, 53)[1].alive, true);
  assert.equal(hometownParents(home, 56)[1].alive, false);
  assert.deepEqual(hometownParents(home, 515), hometownParents(home, 56));
});

test('离乡只在告别或行走阶段生效，预填departure不算完成且启程不重复', () => {
  for (const stage of ['farewell', 'walk'] as const) {
    const save = freshSave();
    assert.equal(save.hometownSeen, false);
    assert.equal(save.chronicle.milestones.departure, 15);
    assert.equal(departHometown(save), false);
    assert.equal(visitHometown(save), false);
    assert.equal(readHometownLetter(save), false);
    save.mortal.hometown!.stage = stage;
    assert.equal(departHometown(save), true);
    assert.equal(save.mortal.hometown!.stage, 'departed');
    assert.equal(save.hometownSeen, true);
    assert.equal(save.chronicle.milestones['home-departure'], 15);
    assert.equal(save.chronicle.milestones.departure, 15);
    assert.equal(save.chronicle.entries.length, 1);
    assert.match(save.chronicle.entries[0].detail, /辞别父母/);
    const before = JSON.stringify(save);
    assert.equal(departHometown(save), false);
    assert.equal(JSON.stringify(save), before);
  }
  const save = freshSave();
  save.mortal.hometown!.stage = 'farewell';
  save.chronicle.entries = [];
  assert.equal(departHometown(save), true);
  assert.equal(save.chronicle.entries.length, 1);
});

test('查看故居不虚构重逢，交谈只记录实际相见的父母且同岁重复幂等', () => {
  const save = traveller();
  save.age = 46;
  assert.equal(visitHometown(save), true);
  assert.equal(save.chronicle.milestones['home-reunion'], undefined);
  assert.equal(visitHometown(save), false);
  assert.equal(visitHometown(save, 'father'), true);
  const reunion = save.chronicle.entries.find((e) => e.title === '故乡重逢')!;
  assert.match(reunion.detail, /父亲/);
  assert.doesNotMatch(reunion.detail, /母亲|双亲/);
  assert.equal(visitHometown(save, 'father'), false);
  assert.equal(visitHometown(save, 'mother'), false);
  save.age++;
  assert.equal(visitHometown(save, 'mother'), true);
  assert.equal(save.mortal.hometown!.lastVisitAge, 47);
  assert.equal(save.chronicle.entries.filter((e) => e.title === '故乡重逢').length, 1);
});

test('一亲亡故时仅与尚在者重逢，闻讯分别记实际去世年岁和获知年岁', () => {
  const save = traveller();
  save.age = 54.5;
  assert.equal(visitHometown(save, 'mother'), true);
  const news = save.chronicle.entries.find((e) => e.title === '归乡闻讯')!;
  assert.equal(news.age, 54.5);
  assert.match(news.detail, /54\.5岁归乡.*父亲.*你53岁.*享年75岁/);
  assert.equal(save.chronicle.milestones['home-father'], 54.5);
  assert.equal(save.chronicle.milestones['home-mother'], undefined);
  const reunion = save.chronicle.entries.find((e) => e.title === '故乡重逢')!;
  assert.match(reunion.detail, /母亲/);
  assert.doesNotMatch(reunion.detail, /父亲|双亲/);
  assert.equal(save.mortal.hometown!.letterFoundAt, null);
});

test('同时去世分别闻讯，数百年跳跃不自动发现家书，查看后只发现不拆读', () => {
  const save = traveller();
  save.mortal.hometown!.parents.father.diesAt = 78;
  save.age = 515;
  let restored = parseSave(JSON.stringify(save));
  assert.equal(restored.mortal.hometown!.letterFoundAt, null);
  assert.equal(readHometownLetter(restored), false);
  assert.equal(visitHometown(restored, 'father'), true);
  assert.equal(restored.mortal.hometown!.letterFoundAt, null);
  assert.equal(restored.chronicle.milestones['home-reunion'], undefined);
  const news = restored.chronicle.entries.filter((e) => e.title === '归乡闻讯');
  assert.equal(news.length, 2);
  assert.ok(news.every((e) => e.age === 515 && e.detail.includes('你56岁')));
  assert.equal(visitHometown(restored), true);
  assert.equal(restored.mortal.hometown!.letterFoundAt, 515);
  assert.equal(restored.mortal.hometown!.letterRead, false);
  assert.equal(restored.chronicle.milestones['home-letter-found'], 515);
  assert.equal(restored.chronicle.milestones['home-letter-read'], undefined);
  restored = importSave(exportSave(restored, null)).save;
  assert.equal(visitHometown(restored), false);
  assert.equal(readHometownLetter(restored), true);
  assert.equal(restored.chronicle.milestones['home-letter-read'], 515);
  restored = parseSave(JSON.stringify(restored));
  const before = JSON.stringify(restored);
  assert.equal(readHometownLetter(restored), false);
  assert.equal(visitHometown(restored), false);
  assert.equal(JSON.stringify(restored), before);
});

test('短信由最后去世者留下而非单看享年，同时去世固定母亲，两句短笺', () => {
  const home = freshHometown(() => 0);
  home.parents.father.diesAt = 77;
  assert.deepEqual(hometownLetter(home), {
    name: '母亲',
    lines: ['山里若冷，记得添衣。', '家中无事，莫要挂念。'],
  });
  home.parents.father.diesAt = 78;
  assert.equal(hometownLetter(home).name, '母亲');
  home.parents.father.diesAt = 79;
  assert.equal(hometownLetter(home).name, '父亲');
  assert.equal(hometownLetter(home).lines.length, 2);
});

test('读信必须已离乡、发现且双亲俱逝', () => {
  for (const patch of [
    { stage: 'walk', letterFoundAt: 56, age: 100 },
    { stage: 'departed', letterFoundAt: null, age: 100 },
    { stage: 'departed', letterFoundAt: 53, age: 53 },
  ] as const) {
    const save = traveller();
    Object.assign(save.mortal.hometown!, {
      stage: patch.stage,
      letterFoundAt: patch.letterFoundAt,
    });
    save.age = patch.age;
    assert.equal(readHometownLetter(save), false);
    assert.equal(save.mortal.hometown!.letterRead, false);
  }
});

test('故乡所有动作不改变年岁、经济、宗门、物品及奖励字段', () => {
  const save = freshSave('heaven', ['fire'], 'orthodox', () => 0);
  save.stones = 321;
  save.iron = 19;
  save.cultivation = 456;
  save.mortal.mastery[SECTS[0].id] = 2;
  const before = structuredClone(save);
  save.mortal.hometown!.stage = 'walk';
  departHometown(save);
  visitHometown(save, 'mother');
  assert.equal(save.age, 15);
  save.age = 100;
  visitHometown(save);
  readHometownLetter(save);
  assert.equal(save.age, 100);
  const after = structuredClone(save);
  after.age = before.age;
  after.hometownSeen = before.hometownSeen;
  after.chronicle = before.chronicle;
  after.mortal.hometown = before.mortal.hometown;
  assert.deepEqual(after, before);
});

test('各阶段支持JSON及导出往返，不因直接修改玩家年岁而丢人间进度', () => {
  for (const stage of ['root', 'farewell', 'walk', 'departed'] as const) {
    const save = freshSave();
    save.age = 1015;
    save.mortal.hometown!.stage = stage;
    save.mortal.mastery[SECTS[0].id] = 2;
    assert.ok(validHometown(save.mortal.hometown, save.age));
    assert.deepEqual(parseSave(JSON.stringify(save)).mortal, save.mortal);
    assert.deepEqual(importSave(exportSave(save, null)).save.mortal, save.mortal);
  }
});

test('旧档缺故乡或缺整个人间字段不补本世父母，下轮新档仍有', () => {
  const save = freshSave();
  for (const mortal of [undefined, freshMortal()]) {
    const old = { ...save, mortal, hometownSeen: undefined, age: 515, cultivation: 12345 };
    const raw = JSON.stringify(old);
    for (const restored of [parseSave(raw), importSave(raw).save]) {
      assert.equal(restored.mortal.hometown, undefined);
      assert.equal(restored.hometownSeen, true);
      assert.equal(restored.cultivation, 12345);
      assert.equal(departHometown(restored), false);
      assert.equal(visitHometown(restored), false);
      assert.equal(readHometownLetter(restored), false);
    }
  }
  for (const mortal of [null, [], {}, { ...freshMortal(), years: -1 }]) {
    const raw = JSON.stringify({ ...save, mortal });
    assert.equal(parseSave(raw).mortal.hometown, undefined);
    assert.throws(() => importSave(raw), /损坏/);
  }
  assert.ok(freshSave().mortal.hometown);
  assert.equal(freshSave().hometownSeen, false);
  assert.ok(validMortal(freshMortal(), 515));
});

test('故乡校验拒绝损坏形状、随机范围、非法年岁顺序及无来源已读状态', () => {
  const home = freshHometown(() => 0);
  const departed = { ...home, stage: 'departed' as const, lastVisitAge: 100 };
  const bad: unknown[] = [null, [], {}, { ...home, stage: 'unknown' }];
  for (const parents of [
    null,
    [],
    {},
    { father: home.parents.father },
    { ...home.parents, other: {} },
  ])
    bad.push({ ...home, parents });
  for (const ageAtStart of [33, 40, 34.5, '34', NaN, Infinity])
    bad.push({ ...home, parents: { ...home.parents, mother: { ageAtStart, diesAt: 75 } } });
  for (const ageAtStart of [36, 44])
    bad.push({ ...home, parents: { ...home.parents, father: { ageAtStart, diesAt: 75 } } });
  for (const diesAt of [74, 91, 75.5, '75', null, NaN, Infinity])
    bad.push({ ...home, parents: { ...home.parents, father: { ageAtStart: 37, diesAt } } });
  for (const parent of [null, [], 'father'])
    bad.push({ ...home, parents: { ...home.parents, father: parent } });
  for (const key of ['lastVisitAge', 'letterFoundAt'])
    for (const value of [undefined, -1, 14, 101, '20', NaN, Infinity])
      bad.push({ ...departed, [key]: value });
  bad.push(
    { ...home, lastVisitAge: 20 },
    { ...home, letterFoundAt: 100 },
    { ...home, letterRead: true },
    { ...departed, letterFoundAt: 55 },
    { ...departed, lastVisitAge: 56, letterFoundAt: 57 },
    { ...departed, lastVisitAge: null, letterFoundAt: 56 },
    { ...departed, letterRead: true },
    { ...departed, letterRead: 1 },
  );
  for (const value of bad) assert.equal(validHometown(value, 100), false, JSON.stringify(value));
  assert.equal(validHometown(home, NaN), false);
  assert.equal(validHometown(home, Infinity), false);
  assert.equal(validHometown(home, 14), false);
  for (const letterRead of [false, true])
    assert.ok(validHometown({ ...departed, letterFoundAt: 56, letterRead }, 100));
});

test('损坏故乡导入拒绝，本地仅剥离故乡并保留宗门等原有合法进度', () => {
  const save = traveller();
  save.age = 30;
  save.mortal.member = { id: SECTS[0].id, dueAt: 20, dues: 50 };
  save.mortal.years = 5;
  save.mortal.mastery[SECTS[0].id] = 3;
  save.mortal.activity = { kind: 'study', remaining: 1, total: 2, sect: SECTS[0].id };
  save.mortal.events = ['保留宗门进度'];
  const expected = structuredClone(save.mortal);
  delete expected.hometown;
  for (const hometown of [null, [], {}, { ...save.mortal.hometown, letterRead: true }]) {
    const raw = JSON.stringify({ ...save, mortal: { ...save.mortal, hometown } });
    assert.throws(() => importSave(raw), /损坏/);
    assert.deepEqual(parseSave(raw).mortal, expected);
  }
});

test('hometownSeen新档为false，布尔值往返保留，导入拒绝非布尔字段', () => {
  const save = freshSave();
  for (const hometownSeen of [false, true]) {
    const raw = JSON.stringify({ ...save, hometownSeen });
    assert.equal(parseSave(raw).hometownSeen, hometownSeen);
    assert.equal(importSave(raw).save.hometownSeen, hometownSeen);
  }
  for (const hometownSeen of [null, 0, 1, 'true', [], {}]) {
    const raw = JSON.stringify({ ...save, hometownSeen });
    assert.throws(() => importSave(raw), /损坏/);
    assert.equal(typeof parseSave(raw).hometownSeen, 'boolean');
  }
  assert.equal(parseSave(JSON.stringify({ ...save, hometownSeen: undefined })).hometownSeen, false);
});
