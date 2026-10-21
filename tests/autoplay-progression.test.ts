import test from 'node:test';
import assert from 'node:assert/strict';
import { autoplayChoice, autoplayInput } from '../src/autoplay.ts';
import { AUTOPLAY_BUILDS } from '../src/autoplay-build.ts';
import { allowsSchool, MAX_PASSIVE_LEVEL, MAX_WEAPON_LEVEL, TREASURES } from '../src/data.ts';
import type { CultivationPath, WeaponKind } from '../src/data.ts';
import { Game } from '../src/game.ts';
import { freshSave } from '../src/progress.ts';
import { seeded } from '../scripts/balance-policy.ts';

function game(path: CultivationPath = 'dual') {
  return new Game(freshSave('heaven', ['metal'], path, seeded(41)), 0, 0, seeded(82));
}
function own(g: Game, ids: WeaponKind[], level = MAX_WEAPON_LEVEL) {
  g.weapons = ids.map((id) => ({ id, level, timer: 0, evolved: false }));
}
function pick(g: Game) {
  const choice = autoplayChoice(g)!;
  assert.equal(choice.reroll, false);
  return g.choices[choice.index];
}

test('默认路线从一至四重优先修习已学功法，六重法宝的觉醒配方仍可优先', () => {
  const g = game();
  own(g, ['sword'], 5);
  for (let known = 1; known < MAX_PASSIVE_LEVEL; known++) {
    g.passives = { duration: known };
    g.choices = [
      { type: 'weapon', id: 'sword', level: 6 },
      { type: 'passive', id: 'magnet', level: 1 },
      { type: 'passive', id: 'duration', level: known + 1 },
    ];
    assert.equal(pick(g).id, 'duration');
  }
  g.choices[1] = { type: 'passive', id: 'power', level: 1 };
  g.weapons[0].level = MAX_WEAPON_LEVEL;
  own(g, ['sword', 'fire']);
  g.weapons[1].level = 3;
  assert.equal(pick(g).id, 'power', '已可准备觉醒的配方优先');
  g.passives.power = MAX_PASSIVE_LEVEL;
  g.choices = [
    { type: 'passive', id: 'duration', level: 5 },
    { type: 'evolve', id: 'sword', level: 7 },
  ];
  assert.equal(pick(g).type, 'evolve');
});

test('已持法宝全六重时先补新法宝，不因尚未觉醒而继续空等', () => {
  for (const evolved of [false, true]) {
    const g = game();
    own(g, ['sword']);
    g.weapons[0].evolved = evolved;
    g.passives = { power: 4, haste: 4 };
    g.choices = [
      { type: 'passive', id: 'power', level: 5 },
      { type: 'weapon', id: 'fire', level: 1 },
      { type: 'heal', id: 'heal', level: 1 },
    ];
    assert.equal(pick(g).id, 'fire');
    g.weapons[0].level = 5;
    assert.equal(pick(g).id, 'power', '只要还有法宝能吃宝匣，仍优先已学功法');
  }
});

test('觉醒与危急恢复不会被补新法宝挤掉，各倾向遵守自救规则', () => {
  for (const { id: mode } of AUTOPLAY_BUILDS) {
    const g = game();
    g.save.autoplayBuild = { mode, targets: ['fire', ''] };
    own(g, ['sword']);
    g.passives = { power: MAX_PASSIVE_LEVEL };
    g.choices = [
      { type: 'weapon', id: 'fire', level: 1 },
      { type: 'evolve', id: 'sword', level: 7 },
      { type: 'heal', id: 'heal', level: 1 },
    ];
    assert.equal(pick(g).type, 'evolve', mode);
    g.player.hp = g.player.maxHp * 0.2;
    assert.equal(pick(g).type, 'heal', mode);
  }
});

test('新法宝略偏向已有配方，覆盖正道、魔道、兼修全部合法法宝', () => {
  let checked = 0;
  for (const path of ['orthodox', 'demonic', 'dual'] as const)
    for (const t of TREASURES.filter((t) => allowsSchool(path, t.school))) {
      const g = game(path);
      g.rerolls = 0;
      const other = TREASURES.find((candidate) => {
        if (
          candidate.id === t.id ||
          !allowsSchool(path, candidate.school) ||
          g
            .evolutionRequirements(candidate.id)
            .some((id) => g.evolutionRequirements(t.id).includes(id))
        )
          return false;
        // 从真实排序中找基础偏好相同的法宝，确认+2只改变同档取舍。
        g.choices = [
          { type: 'weapon', id: candidate.id, level: 1 },
          { type: 'weapon', id: t.id, level: 1 },
        ];
        if (pick(g).id !== candidate.id) return false;
        g.choices.reverse();
        return pick(g).id === t.id;
      })!;
      assert.ok(other, `${path}/${t.id}需要同档比较对象`);
      const held = TREASURES.find(
        (candidate) =>
          candidate.id !== t.id &&
          candidate.id !== other.id &&
          allowsSchool(path, candidate.school),
      )!;
      own(g, [held.id]);
      for (const recipe of g.evolutionRequirements(t.id)) {
        g.passives = { [recipe]: 1 };
        g.choices = [
          { type: 'weapon', id: other.id, level: 1 },
          { type: 'weapon', id: t.id, level: 1 },
        ];
        assert.equal(pick(g).id, t.id, `${path}/${t.id}/${recipe}`);
        checked++;
      }
    }
  assert.ok(checked >= 100);
});

test('配方加分有限，不为配方强选原本低排序法宝，也不奖励现有法宝升重', () => {
  const g = game();
  own(g, ['sword'], 2);
  g.passives = { duration: 1 };
  g.choices = [
    { type: 'weapon', id: 'poison', level: 1 },
    { type: 'weapon', id: 'lightning', level: 1 },
  ];
  assert.equal(pick(g).id, 'lightning');
  own(g, ['sword', 'lightning'], 2);
  g.passives = { haste: 1 };
  g.choices = [
    { type: 'weapon', id: 'sword', level: 3 },
    { type: 'weapon', id: 'lightning', level: 3 },
  ];
  assert.equal(pick(g).id, 'sword', '同分保留候选顺序，不额外加分');
});

test('指定十一件优选法宝优于同级普通法宝，领悟与升重不依赖排列顺序', () => {
  const favored: WeaponKind[] = [
    'sword',
    'lightning',
    'dragon',
    'fire',
    'skull',
    'pagoda',
    'cauldron',
    'umbrella',
    'scythe',
    'compass',
    'nail',
  ];
  const g = game();
  g.rerolls = 0;
  for (const preferred of favored)
    for (const ordinary of TREASURES.filter((t) => !favored.includes(t.id)))
      for (const level of [1, 3]) {
        const held = TREASURES.find((t) => t.id !== preferred && t.id !== ordinary.id)!;
        own(g, level === 1 ? [held.id] : [preferred, ordinary.id], level - 1 || 1);
        g.choices = [
          { type: 'weapon', id: ordinary.id, level },
          { type: 'weapon', id: preferred, level },
        ];
        assert.equal(pick(g).id, preferred, `${preferred}/${ordinary.id}/${level}`);
        g.choices.reverse();
        assert.equal(pick(g).id, preferred, '调换候选顺序仍选优选法宝');
      }
});

test('青莲灯按普通法宝排序，配方、本命与指定目标仍遵守原规则', () => {
  const g = game();
  g.rerolls = 0;
  own(g, ['sword'], 2);
  g.passives = { area: 1 };
  g.choices = [
    { type: 'weapon', id: 'orbit', level: 1 },
    { type: 'weapon', id: 'lightning', level: 1 },
  ];
  assert.equal(pick(g).id, 'lightning', '已有青莲配方也先选优选法宝');
  g.choices[1].id = 'arrow';
  assert.equal(pick(g).id, 'orbit', '普通档之间仍略偏向已有配方');
  g.passives = {};
  g.choices.reverse();
  assert.equal(pick(g).id, 'arrow', '没有配方时同分保留候选原顺序');
  g.choices.reverse();
  assert.equal(pick(g).id, 'orbit', '青莲灯同样保留正常选取机会');
  own(g, ['sword', 'orbit', 'fire'], 2);
  g.choices = [
    { type: 'weapon', id: 'orbit', level: 3 },
    { type: 'weapon', id: 'fire', level: 3 },
  ];
  assert.equal(pick(g).id, 'fire', '非本命已有青莲升重也按普通档处理');
  own(g, ['sword'], 2);
  g.save.autoplayBuild = { mode: 'custom', targets: ['orbit', ''] };
  g.choices = [
    { type: 'weapon', id: 'lightning', level: 1 },
    { type: 'weapon', id: 'orbit', level: 1 },
  ];
  assert.equal(pick(g).id, 'orbit', '明确指定青莲时仍优先培养');
});

test('全满补新仍遵守指定目标与前半程预留末格，后半程不空等', () => {
  const g = game();
  g.save.autoplayBuild = { mode: 'custom', targets: ['arrow', ''] };
  own(g, ['sword']);
  g.weapons[0].evolved = true;
  g.passives = { haste: 1 };
  g.choices = [
    { type: 'weapon', id: 'lightning', level: 1 },
    { type: 'weapon', id: 'arrow', level: 1 },
  ];
  assert.equal(pick(g).id, 'arrow', '已学配方与较高基础排序不能覆盖明确目标');
  g.save.autoplayBuild.targets = ['poison', ''];
  own(g, ['sword', 'orbit', 'fire', 'lightning', 'ice']);
  for (const w of g.weapons) w.evolved = true;
  g.passives = { magnet: 1 };
  g.choices = [
    { type: 'weapon', id: 'pulse', level: 1 },
    { type: 'passive', id: 'magnet', level: 2 },
  ];
  assert.equal(pick(g).id, 'magnet', '为未出现的指定法宝留末格');
  g.time = 125;
  assert.equal(pick(g).id, 'pulse', '后半程允许补新，不无限空等');
});

test('补新与指定目标不挤掉保命倾向低血护体和目标培养的恢复', () => {
  const g = game();
  own(g, ['sword']);
  g.weapons[0].evolved = true;
  g.passives = { haste: 1 };
  g.player.hp = g.player.maxHp * 0.32;
  for (const mode of ['survival', 'custom'] as const) {
    g.save.autoplayBuild = { mode, targets: ['lightning', ''] };
    g.choices = [
      { type: 'weapon', id: 'lightning', level: 1 },
      { type: 'passive', id: 'guard', level: 1 },
    ];
    assert.equal(pick(g).id, 'guard', mode);
    g.choices[1] = { type: 'heal', id: 'heal', level: 1 };
    assert.equal(pick(g).type, 'heal', mode);
  }
});

test('满槽、满级、真实选择和宝匣升级衔接不产生非法选项', () => {
  const g = game();
  own(g, ['sword']);
  g.passives = { power: 4, haste: 4 };
  g.state = 'upgrade';
  g.choices = [
    { type: 'passive', id: 'power', level: 5 },
    { type: 'weapon', id: 'fire', level: 1 },
  ];
  assert.ok(g.choose(autoplayChoice(g)!.index));
  assert.equal(g.weapons.find((w) => w.id === 'fire')!.level, 1);
  g.pickups = [{ ...g.player, kind: 'chest', value: 1, pull: true }];
  g.update(1 / 60);
  assert.equal(g.weapons.find((w) => w.id === 'fire')!.level, 2);
  assert.equal(g.passives.power, 4, '宝匣不升级功法');
  own(g, ['sword', 'fire', 'lightning', 'orbit', 'ice', 'pulse']);
  g.passives = { power: 5, haste: 5, area: 5, guard: 5 };
  for (const w of g.weapons) w.evolved = true;
  g.state = 'upgrade';
  g.choices = g.makeChoices();
  assert.ok(g.choices.every((c) => c.type === 'heal'));
  const result = autoplayChoice(g)!;
  assert.ok(result.reroll ? g.reroll() : g.choose(result.index));
});

test('排序不改变候选、随机数、快照、属性、走位，恢复对局后选择一致', () => {
  const g = game('dual');
  own(g, ['sword']);
  g.passives = { blood: 3 };
  g.state = 'upgrade';
  g.choices = [
    { type: 'passive', id: 'blood', level: 4 },
    { type: 'weapon', id: 'fire', level: 1 },
  ];
  const before = g.snapshot();
  const stats = { ...g.stats };
  const input = autoplayInput(g);
  g.random = () => {
    throw Error('排序不能消耗随机数');
  };
  const actual = autoplayChoice(g);
  assert.deepEqual(g.snapshot(), before);
  assert.deepEqual(g.stats, stats);
  assert.deepEqual(autoplayInput(g), input);
  const restored = Game.restore(structuredClone(g.save), before);
  assert.ok(restored);
  assert.deepEqual(autoplayChoice(restored), actual);
});

test('已持一至五重法宝的未学配套优先于法宝升重，各倾向和纯修路线均可真实修习', () => {
  for (const path of ['orthodox', 'demonic', 'dual'] as const)
    for (const t of TREASURES.filter((t) => allowsSchool(path, t.school)))
      for (const level of [1, 3, 5])
        for (const { id: mode } of AUTOPLAY_BUILDS) {
          const g = game(path);
          own(g, [t.id], level);
          g.save.autoplayBuild = { mode, targets: [t.id, ''] };
          const recipe = g.evolutionRequirements(t.id)[0];
          g.choices = [
            { type: 'weapon', id: t.id, level: level + 1 },
            { type: 'passive', id: recipe, level: 1 },
          ];
          assert.equal(pick(g).id, recipe, `${path}/${t.id}/${level}/${mode}`);
          g.state = 'upgrade';
          assert.ok(g.choose(autoplayChoice(g)!.index));
          assert.equal(g.passives[recipe], 1);
          assert.equal(g.weapons[0].level, level);
        }
});

test('未学配套不抢已学替代配方的槽位，已觉醒或已有满级配方不会继续强补第二套', () => {
  for (const mode of ['default', 'native', 'custom'] as const) {
    const g = game();
    own(g, ['sword'], 3);
    g.save.autoplayBuild = { mode, targets: ['sword', ''] };
    g.passives = { power: 2 };
    g.choices = [
      { type: 'passive', id: 'blood', level: 1 },
      { type: 'passive', id: 'power', level: 3 },
      { type: 'weapon', id: 'sword', level: 4 },
    ];
    assert.equal(pick(g).id, 'power', mode);
    g.passives.power = 5;
    g.choices.splice(1, 1);
    assert.equal(pick(g).id, 'sword', mode);
    g.passives = {};
    g.weapons[0].evolved = true;
    assert.equal(pick(g).id, 'sword', mode);
    g.weapons[0].evolved = false;
    g.player.hp = g.player.maxHp * 0.2;
    g.choices.push({ type: 'passive', id: 'guard', level: 1 });
    assert.equal(pick(g).id, 'guard', `${mode}濒死时护体优先`);
    g.choices.push({ type: 'heal', id: 'heal', level: 1 });
    assert.equal(pick(g).type, 'heal', mode);
  }
});
