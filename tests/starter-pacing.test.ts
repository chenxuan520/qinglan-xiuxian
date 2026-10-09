import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { freshSave, parseSave } from '../src/progress.ts';
import { ROOT_STARTERS, treasure, weaponDamageMultiplier, weaponLevelDamage } from '../src/data.ts';
import { choiceCard } from '../src/common-ui.ts';
import { spiritPower } from '../src/spirit-power.ts';
import { autoplayChoice } from '../src/autoplay.ts';
import { joinSect } from '../src/mortal.ts';

test('十种五行本命符合路线，各路线配套功法不重复，水魔保留化血盏', () => {
  assert.deepEqual(ROOT_STARTERS, {
    metal: ['sword', 'nail'],
    wood: ['fan', 'chain'],
    water: ['ice', 'bloodpool'],
    fire: ['lightning', 'fire'],
    earth: ['pagoda', 'skull'],
  });
  for (const path of ['orthodox', 'demonic'] as const) {
    const recipes: string[] = [];
    for (const element of Object.keys(ROOT_STARTERS) as (keyof typeof ROOT_STARTERS)[]) {
      const save = freshSave('heaven', [element], path);
      const g = new Game(save, 0, 0);
      assert.equal(g.weapons[0].id, ROOT_STARTERS[element][path === 'demonic' ? 1 : 0]);
      assert.equal(treasure(g.weapons[0].id).school, path);
      assert.ok(save.artifacts.includes(save.starter));
      recipes.push(...g.evolutionRequirements(save.starter));
    }
    assert.equal(recipes.length, 5);
    assert.equal(new Set(recipes).size, 5);
  }
});

test('旧木土本命、收藏及炼器保留，不用新默认本命覆盖玩家选择', () => {
  for (const [id, element, path] of [
    ['orbit', 'wood', 'orthodox'],
    ['poison', 'wood', 'demonic'],
    ['vortex', 'earth', 'demonic'],
  ] as const) {
    const save = freshSave('heaven', [element], path);
    save.schema = 9;
    save.starter = id;
    save.artifacts = ['sword', 'nail', id];
    save.forge[id] = 7;
    const restored = parseSave(JSON.stringify(save));
    assert.equal(restored.starter, id);
    assert.equal(restored.forge[id], 7);
    assert.ok(restored.artifacts.includes(id));
    assert.equal(new Game(restored, 0, 0).weapons[0].id, id);
  }
});

test('旧芭蕉扇和缚妖索的待觉醒选项、自动选技、天劫均沿用原配方', () => {
  for (const [id, path, oldPassive, newPassive] of [
    ['fan', 'orthodox', 'haste', 'crit'],
    ['chain', 'demonic', 'devour', 'abyss'],
  ] as const) {
    for (const version of [0, 1]) {
      const save = freshSave('heaven', ['wood'], path);
      save.cultivation = 1e9;
      save.unlocked = 6;
      const g = new Game(save, 0, 0);
      g.artifactVersion = version;
      g.weapons = [{ id, level: 6, evolved: false, timer: 0 }];
      g.passives = { [oldPassive]: 5 };
      g.state = 'upgrade';
      g.choices = [
        { type: 'evolve', id, level: 7 },
        { type: 'weapon', id: 'sword', level: 1 },
      ];
      const restored = Game.restore(save, structuredClone(g.snapshot()))!;
      assert.ok(restored);
      assert.deepEqual(restored.evolutionRequirements(id), [oldPassive]);
      assert.match(choiceCard(restored, save, restored.choices[0], 0), /仙器觉醒/);
      assert.equal(autoplayChoice(restored)!.index, 0);
      const tribulation = Game.createTribulation(save, restored);
      assert.equal(tribulation.artifactVersion, version);
      assert.deepEqual(tribulation.evolutionRequirements(id), [oldPassive]);
      assert.equal(restored.choose(0), true);
      assert.equal(restored.weapons[0].evolved, true);
      assert.equal(Game.restore(save, restored.snapshot())!.weapons[0].evolved, true);
    }
    const current = new Game(freshSave('heaven', ['wood'], path), 0, 0);
    assert.deepEqual(current.evolutionRequirements(id), [newPassive]);
  }
});

test('青莲灯与七宝塔低重补强单独乘算、逐重增伤，旧局及魔道原曲线保留', () => {
  for (const id of [
    'orbit',
    'pagoda',
    'ice',
    'fan',
    'chain',
    'bloodpool',
    'skull',
    'nail',
    'fire',
  ]) {
    const t = treasure(id);
    const g = new Game(freshSave('heaven', [t.element], t.school), 0, 0);
    let previous = 0;
    for (let level = 1; level <= 6; level++) {
      const w = { id, level, evolved: false, timer: 0 };
      const baseline = g.weaponHitDamage({ ...w, level: 1 }) / weaponDamageMultiplier(id, 1);
      const actual = g.weaponHitDamage(w);
      assert.ok(Math.abs(actual / baseline - weaponDamageMultiplier(id, level)) < 1e-10);
      assert.ok(actual > previous);
      previous = actual;
      for (const version of [0, 1]) {
        assert.equal(weaponDamageMultiplier(id, level, version), weaponLevelDamage(level));
      }
      if (!['orbit', 'pagoda'].includes(id)) {
        assert.equal(weaponDamageMultiplier(id, level), weaponLevelDamage(level));
      }
    }
    g.artifactVersion = 1;
    const oldAwakened = g.weaponHitDamage({ id, level: 6, evolved: true, timer: 0 });
    g.artifactVersion = 2;
    assert.equal(g.weaponHitDamage({ id, level: 6, evolved: true, timer: 0 }), oldAwakened);
  }
});

test('洞府一重预览与升级卡使用实际新旧倍率，三升四不会降低伤害', () => {
  for (const id of ['orbit', 'pagoda']) {
    const t = treasure(id);
    const save = freshSave('heaven', [t.element], t.school);
    save.starter = id;
    save.artifacts.push(id);
    const g = new Game(save, 0, 0);
    assert.equal(spiritPower(save).weaponDamage, g.weaponHitDamage(g.weapons[0]));
    assert.match(choiceCard(g, save, { type: 'weapon', id, level: 2 }, 0), /×1.20 → ×1.58/);
    assert.match(choiceCard(g, save, { type: 'weapon', id, level: 4 }, 0), /×1.80 → ×1.96/);
    g.artifactVersion = 1;
    assert.match(choiceCard(g, save, { type: 'weapon', id, level: 2 }, 0), /×1.00 → ×1.32/);
  }
});

test('土魔本命携带本门白骨功法时，洞府预览也包含骨灵专属伤害', () => {
  const save = freshSave('heaven', ['earth'], 'demonic');
  save.stones = 1000;
  assert.equal(joinSect(save, 'bone'), true);
  const g = new Game(save, 0, 0);
  assert.equal(g.weapons[0].id, 'skull');
  assert.equal(g.passives.bone, 1);
  assert.equal(spiritPower(save).weaponDamage, g.weaponHitDamage(g.weapons[0]));
});
