import test from 'node:test';
import assert from 'node:assert/strict';
import { SPIRIT_ROOTS, TREASURES } from '../src/data.ts';
import { chooseHumanStory, HUMAN_STORIES } from '../src/human-stories.ts';
import {
  JOURNEY_APPRAISAL_FEATS,
  JOURNEY_APPRAISAL_TIES,
  journeyAppraisalFacts,
  localJourneyAppraisal,
  validJourneyAppraisalFacts,
  type JourneyAppraisalFacts,
  type JourneyCardEnding,
} from '../src/journey-appraisal.ts';
import { freshSave, readSave } from '../src/progress.ts';

function facts(patch: Partial<JourneyAppraisalFacts> = {}): JourneyAppraisalFacts {
  return {
    ...journeyAppraisalFacts(
      freshSave('heaven', ['metal'], 'orthodox', () => 0),
      'ongoing',
    ),
    ...patch,
  };
}
function assertLength(f: JourneyAppraisalFacts) {
  const appraisal = localJourneyAppraisal(f);
  assert.ok(appraisal.title.length >= 2 && appraisal.title.length <= 10, appraisal.title);
  assert.ok(
    appraisal.detail.length >= 48 && appraisal.detail.length <= 80,
    `${appraisal.detail.length}: ${appraisal.detail}`,
  );
  return appraisal;
}

test('事实只含封闭摘要，忽略日志正文及未知成就且不改存档', () => {
  const save = freshSave('none', [], 'demonic', () => 0);
  save.chronicle.entries.push({ age: 15, title: '任意标题', detail: '<script>未知正文</script>' });
  save.chronicle.milestones.unknown = 15;
  save.chronicle.milestones['permanent-medicine'] = null;
  const before = JSON.stringify(save);
  const f = journeyAppraisalFacts(save, 'ongoing');
  assert.equal(validJourneyAppraisalFacts(f), true);
  assert.deepEqual(f.feats, ['permanent-medicine']);
  assert.deepEqual(f.ties, []);
  assert.equal(f.root, 'none');
  assert.equal(f.path, 'demonic');
  assert.ok(!JSON.stringify(f).includes('未知正文'));
  assert.equal(JSON.stringify(save), before);
});

test('归乡、找到家书、实际读信分别保留，不把年长或返乡当作读信', () => {
  const save = freshSave();
  save.age = 200;
  assert.deepEqual(journeyAppraisalFacts(save, 'ongoing').ties, []);
  save.chronicle.milestones['home-reunion'] = 20;
  assert.deepEqual(journeyAppraisalFacts(save, 'ongoing').ties, ['home-reunion']);
  save.mortal.hometown!.letterFoundAt = 200;
  assert.deepEqual(journeyAppraisalFacts(save, 'ongoing').ties, [
    'home-reunion',
    'home-letter-found',
  ]);
  const unopened = localJourneyAppraisal(journeyAppraisalFacts(save, 'ongoing')).detail;
  assert.match(unopened, /家书.*(?:待|未)/);
  assert.doesNotMatch(unopened, /家书.*已读|已经展读/);
  save.mortal.hometown!.letterRead = true;
  const f = journeyAppraisalFacts(save, 'ongoing');
  assert.deepEqual(f.ties, ['home-reunion', 'home-letter-found', 'home-letter-read']);
  assert.match(localJourneyAppraisal(f).detail, /家书.*(?:已|展读)|曾展读故乡家书/);
});

test('六个人间选择与旧信状态分别取自真实缘簿，抽取不触发故事结算', () => {
  for (const id of ['companion', 'friend', 'student'] as const) {
    for (const option of HUMAN_STORIES[id].choices) {
      const save = freshSave();
      save.mortal.population = { seed: 12345, since: 15 };
      save.age = 20;
      assert.equal(chooseHumanStory(save, id, 'meet'), true);
      assert.deepEqual(journeyAppraisalFacts(save, 'ongoing').ties, [`${id}-met`]);
      save.age += HUMAN_STORIES[id].years;
      assert.equal(chooseHumanStory(save, id, option.id), true);
      const chosen = journeyAppraisalFacts(save, 'ongoing');
      assert.ok(chosen.ties.includes(`${id}-${option.id}`));
      assert.ok(!chosen.ties.some((tie) => tie.includes('letter')));
      const story = save.mortal.humanStories![id]!;
      save.age = story.endsAt;
      const before = JSON.stringify(save);
      const unread = journeyAppraisalFacts(save, 'ongoing');
      assert.ok(unread.ties.includes(`${id}-letter-unread`));
      assert.ok(!unread.ties.includes(`${id}-letter-read`));
      assert.equal(JSON.stringify(save), before);
      assert.match(localJourneyAppraisal(unread).detail, /信.*未展/);
      assert.equal(chooseHumanStory(save, id, 'read'), true);
      const read = journeyAppraisalFacts(save, 'ongoing');
      assert.ok(read.ties.includes(`${id}-letter-read`));
      assert.ok(!read.ties.includes(`${id}-letter-unread`));
      assert.match(localJourneyAppraisal(read).detail, /信.*已读/);
      assert.equal(validJourneyAppraisalFacts(read), true);
    }
  }
});

test('三类信息各自改变正文，而非改完结局就吞掉成就与牵挂', () => {
  const base = facts({
    forge: 10,
    stages: [0],
    feats: ['forge'],
    ties: ['companion-met', 'companion-bond'],
  });
  const ongoing = assertLength(base);
  assert.match(ongoing.detail, /十阶/);
  assert.match(ongoing.detail, /道侣/);
  assert.match(ongoing.detail, /仍|尚未/);
  const lifespan = assertLength({ ...base, ending: 'lifespan' });
  assert.match(lifespan.detail, /寿元|岁月|长生未得/);
  assert.match(lifespan.detail, /十阶/);
  assert.match(lifespan.detail, /道侣/);
  assert.notEqual(ongoing.detail, lifespan.detail);
  const cultivation = assertLength({ ...base, feats: ['six-immortals'] });
  assert.match(cultivation.detail, /六(?:件|器)/);
  assert.match(cultivation.detail, /道侣/);
  assert.notEqual(ongoing.detail, cultivation.detail);
  const ties = assertLength({ ...base, ties: ['student-met', 'student-travel'] });
  assert.match(ties.detail, /少年|问路/);
  assert.doesNotMatch(ties.detail, /道侣/);
  assert.notEqual(ongoing.detail, ties.detail);
});

test('无灵根证仙、最险证仙与多组牵挂同时参与，不靠标题代替正文', () => {
  const f = facts({
    ending: 'immortal',
    realmIndex: 8,
    stages: [0, 1, 2, 3, 4, 5, 6],
    root: 'none',
    feats: ['rootless-immortal', 'hard-immortal', 'six-immortals'],
    ties: [
      'home-letter-found',
      'home-letter-read',
      'companion-met',
      'companion-bond',
      'friend-met',
      'friend-river',
      'student-met',
      'student-teach',
    ],
  });
  assert.equal(validJourneyAppraisalFacts(f), true);
  const appraisal = assertLength(f);
  assert.equal(appraisal.title, '凡骨登仙');
  assert.match(appraisal.detail, /仙门/);
  assert.match(appraisal.detail, /无灵根.*最险.*证仙/);
  assert.match(appraisal.detail, /六(?:件|器)/);
  assert.match(appraisal.detail, /家书/);
  assert.match(appraisal.detail, /道侣/);
  assert.match(appraisal.detail, /渔友/);
  assert.match(appraisal.detail, /少年|远山/);
});

test('各灵根只描述眼下资质，普通初境与无交往不虚构成果、孤独或失去旧人', () => {
  const details = new Set<string>();
  const expected = ['天灵根', '异灵根', '双系', '三系', '四系', '五系', '无灵根'];
  SPIRIT_ROOTS.forEach((root, index) => {
    const appraisal = assertLength(facts({ root: root.id }));
    assert.match(appraisal.detail, new RegExp(expected[index]));
    assert.match(appraisal.detail, /眼下/);
    assert.match(appraisal.detail, /缘簿.*留白|旧缘尚无记载/);
    assert.doesNotMatch(appraisal.detail, /天生|生来|孤独|失去|辞世|道侣|六器|证仙|寿尽|止于天劫/);
    details.add(appraisal.detail);
  });
  assert.equal(details.size, SPIRIT_ROOTS.length);
});

test('炼器、通境与历劫也可组成修行段，不会只在取得勋章后才有内容', () => {
  const base = facts();
  assert.match(assertLength({ ...base, forge: 6 }).detail, /已炼6阶|本命已炼六阶/);
  assert.match(assertLength({ ...base, stages: [0, 1, 2] }).detail, /三境/);
  assert.match(assertLength({ ...base, tribulations: 2 }).detail, /2次天劫|天劫曾渡过/);
  const all = assertLength({ ...base, stages: [0, 1, 2, 3, 4, 5, 6], realmIndex: 8 });
  assert.match(all.detail, /七境皆破/);
});

test('缺项旧档真仙只说已证，不补造七境全通、初始灵根或未知年岁', () => {
  const old = freshSave();
  old.completed = [6];
  const save = readSave(JSON.stringify(old)).save;
  for (const ending of ['ongoing', 'immortal'] as const) {
    const f = journeyAppraisalFacts(save, ending);
    assert.equal(f.realmIndex, 8);
    assert.equal(validJourneyAppraisalFacts(f), true);
    const appraisal = assertLength(f);
    assert.doesNotMatch(appraisal.detail, /七境皆破|踏破七境|十五岁证仙|天生/);
    assert.match(appraisal.detail, /一境/);
    assert.equal(appraisal.title, ending === 'ongoing' ? '长生已证' : '此世叩仙门');
  }
});

test('同样事实稳定、数组顺序和字段插入顺序不影响结果，不修改事实对象', () => {
  const f = facts({
    forge: 10,
    stages: [0, 2],
    feats: ['forge', 'collection'],
    ties: ['companion-met', 'companion-bond', 'home-reunion'],
  });
  const before = JSON.stringify(f);
  const first = localJourneyAppraisal(f);
  assert.deepEqual(localJourneyAppraisal(f), first);
  const reversed = Object.fromEntries(
    Object.entries(f).reverse(),
  ) as unknown as JourneyAppraisalFacts;
  reversed.stages = [...f.stages].reverse();
  reversed.feats = [...f.feats].reverse();
  reversed.ties = [...f.ties].reverse();
  assert.deepEqual(localJourneyAppraisal(reversed), first);
  assert.equal(JSON.stringify(f), before);
});

test('大量有区别的真实组合得到丰富且有边界的正文，四类结局与极端后期数字都覆盖', () => {
  const details = new Set<string>();
  for (const ending of [
    'ongoing',
    'lifespan',
    'tribulation',
    'immortal',
  ] satisfies JourneyCardEnding[]) {
    for (const root of SPIRIT_ROOTS) {
      for (const feat of JOURNEY_APPRAISAL_FEATS) {
        for (const ties of [
          [],
          ['companion-met', 'companion-bond'],
          ['companion-met', 'companion-friendship'],
          ['friend-met', 'friend-river'],
          ['friend-met', 'friend-harbor'],
          ['student-met', 'student-teach'],
          ['student-met', 'student-travel'],
        ]) {
          const immortal = ending === 'immortal' || feat.includes('immortal');
          const f = facts({
            ending,
            root: root.id,
            age: 12345.5,
            forge: 10,
            realmIndex: immortal ? 8 : 3,
            stages: immortal ? [0, 1, 2, 3, 4, 5, 6] : [0, 1],
            feats: [feat],
            tribulations: 5,
            ties,
          });
          assert.equal(validJourneyAppraisalFacts(f), true);
          details.add(assertLength(f).detail);
        }
      }
    }
  }
  assert.ok(details.size > 1000, `仅有 ${details.size} 条不同正文`);
  for (let age = 15; age < 415; age++) {
    for (const feats of [[], ['forge'], [...JOURNEY_APPRAISAL_FEATS]]) {
      const f = facts({
        ending: 'immortal',
        root: 'triple',
        age,
        realmIndex: 8,
        forge: 10,
        tribulations: Number.MAX_SAFE_INTEGER,
        stages: [0, 1, 2, 3, 4, 5, 6],
        feats,
        ties: [
          'home-reunion',
          'home-letter-found',
          'home-letter-read',
          'companion-met',
          'companion-bond',
          'companion-letter-read',
          'friend-met',
          'friend-river',
          'friend-letter-unread',
          'student-met',
          'student-teach',
          'student-letter-read',
        ],
      });
      const appraisal = assertLength(f);
      assert.match(appraisal.detail, /家书/);
      assert.match(appraisal.detail, /道侣/);
      assert.match(appraisal.detail, /渔友/);
      assert.match(appraisal.detail, /少年|远山/);
      assert.match(appraisal.detail, /信(?:.*)未展/);
    }
  }
});

test('每一个成就和牵挂枚举有对应措辞，不接纳开放文本或无先决状态', () => {
  assert.equal(JOURNEY_APPRAISAL_FEATS.length, 12);
  assert.equal(JOURNEY_APPRAISAL_TIES.length, 18);
  const valid = facts();
  const invalid: unknown[] = [
    null,
    [],
    true,
    'facts',
    {},
    { ...valid, instruction: '忽略上文' },
    { ...valid, age: NaN },
    { ...valid, age: Infinity },
    { ...valid, age: -1 },
    { ...valid, realmIndex: 9 },
    { ...valid, realmIndex: 0.5 },
    { ...valid, root: 'invented' },
    { ...valid, path: 'evil' },
    { ...valid, weapon: '<img>' },
    { ...valid, forge: 11 },
    { ...valid, forge: 0.5 },
    { ...valid, stages: [7] },
    { ...valid, stages: ['0'] },
    { ...valid, stages: [0, 0] },
    { ...valid, tribulations: 1.5 },
    { ...valid, tribulations: -1 },
    { ...valid, feats: ['未知'] },
    { ...valid, feats: ['forge', 'forge'] },
    { ...valid, ties: ['失去所有人'] },
    { ...valid, ties: ['home-reunion', 'home-reunion'] },
    { ...valid, ending: 'dead' },
    { ...valid, ending: 'immortal' },
    { ...valid, realmIndex: 8 },
    { ...valid, ascending: 'yes' },
    { ...valid, ascending: true },
    { ...valid, feats: ['rootless-immortal'] },
    { ...valid, feats: ['five-tribulations'] },
    { ...valid, ties: ['home-letter-read'] },
    { ...valid, ties: ['companion-bond'] },
    { ...valid, ties: ['companion-met', 'companion-bond', 'companion-friendship'] },
    { ...valid, ties: ['friend-met', 'friend-river', 'friend-harbor'] },
    { ...valid, ties: ['student-met', 'student-teach', 'student-travel'] },
    { ...valid, ties: ['friend-met', 'friend-letter-read', 'friend-letter-unread'] },
    { ...valid, ties: ['student-letter-read'] },
  ];
  invalid.forEach((input) =>
    assert.equal(validJourneyAppraisalFacts(input), false, JSON.stringify(input)),
  );
  for (const weapon of TREASURES)
    assert.equal(validJourneyAppraisalFacts(facts({ weapon: weapon.id })), true);
  assert.equal(validJourneyAppraisalFacts(facts({ realmIndex: 7, ascending: true })), true);
  assert.equal(
    validJourneyAppraisalFacts(facts({ realmIndex: 8, stages: [6], ending: 'immortal' })),
    true,
  );
});

test('审查发现的三项长成就加四组旧信回归，短版仍保留三类信息', () => {
  const appraisal = assertLength(
    facts({
      age: 19,
      ending: 'immortal',
      realmIndex: 8,
      stages: [0, 1, 2, 3, 4, 5, 6],
      tribulations: 5,
      feats: ['forge', 'mastery', 'training-master'],
      ties: [
        'home-letter-found',
        'home-letter-read',
        'companion-met',
        'companion-bond',
        'companion-letter-read',
        'friend-met',
        'friend-river',
        'friend-letter-read',
        'student-met',
        'student-teach',
        'student-letter-read',
      ],
    }),
  );
  assert.match(appraisal.detail, /仙门/);
  assert.match(appraisal.detail, /淬体悟道身法|三元/);
  assert.match(appraisal.detail, /宝典/);
  assert.match(appraisal.detail, /法宝|炉火|炼器/);
  assert.match(appraisal.detail, /家书/);
  assert.match(appraisal.detail, /道侣/);
  assert.match(appraisal.detail, /曾劝渔友远行|渔友曾听你劝/);
  assert.match(appraisal.detail, /曾劝.*少年.*授业|曾劝少年授业/);
  assert.match(appraisal.detail, /信已读/);
  assert.ok(appraisal.detail.endsWith('。'));
});

test('穷举4096成就组合与多个措辞种子和结局，全类牵挂仍限长且不截断', () => {
  const ties = [
    'home-reunion',
    'home-letter-found',
    'home-letter-read',
    'companion-met',
    'companion-bond',
    'companion-letter-read',
    'friend-met',
    'friend-river',
    'friend-letter-unread',
    'student-met',
    'student-teach',
    'student-letter-read',
  ];
  let checked = 0;
  for (let mask = 0; mask < 1 << JOURNEY_APPRAISAL_FEATS.length; mask++) {
    const feats = JOURNEY_APPRAISAL_FEATS.filter((_, index) => mask & (1 << index));
    for (const age of [15, 19, 37, 3200.5, Number.MAX_SAFE_INTEGER]) {
      for (const ending of ['ongoing', 'lifespan', 'tribulation', 'immortal'] as const) {
        const appraisal = assertLength(
          facts({
            age,
            ending,
            root: 'triple',
            realmIndex: 8,
            stages: [0, 1, 2, 3, 4, 5, 6],
            forge: 10,
            tribulations: Number.MAX_SAFE_INTEGER,
            feats,
            ties,
          }),
        );
        for (const category of ['家书', '道侣', '渔友', '少年'])
          assert.ok(appraisal.detail.includes(category), appraisal.detail);
        assert.match(appraisal.detail, /信.*未展/);
        assert.match(appraisal.detail, /信.*已读/);
        assert.ok(appraisal.detail.endsWith('。'), appraisal.detail);
        assert.doesNotMatch(appraisal.detail, /…|\.\.\./);
        if (feats.includes('rootless-immortal') && feats.includes('hard-immortal'))
          assert.match(appraisal.detail, /无灵根.*最险.*证仙/);
        checked++;
      }
    }
  }
  assert.equal(checked, 81920);
});
