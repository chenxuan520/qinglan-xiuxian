import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../src/battle/game.ts';
import { freshSave, readSave, attuneSpiritRoot } from '../../src/core/progress.ts';
import {
  ROOT_STARTERS,
  TREASURES,
  treasure,
  weaponDamageMultiplier,
  weaponLevelDamage,
} from '../../src/core/data.ts';
import { choiceCard } from '../../src/ui/common-ui.ts';
import { spiritPower } from '../../src/core/spirit-power.ts';
import { autoplayChoice } from '../../src/battle/autoplay.ts';
import { joinSect } from '../../src/town/mortal.ts';
import { validAuction, freeStarter } from '../../src/market/auction-data.ts';
import { exportSave, importSave } from '../../src/core/save-transfer.ts';

test('十种五行本命符合路线，各路线配套功法不重复，水系入门为沧海珠 / 判天笔', () => {
  assert.deepEqual(ROOT_STARTERS, {
    metal: ['sword', 'nail'],
    wood: ['fan', 'nest'],
    water: ['pearl', 'brush'],
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

test('水系新角色及主动重选使用沧海珠 / 判天笔并收藏两件，配套功法随路线变化', () => {
  for (const [path, id, passive] of [
    ['orthodox', 'pearl', 'magnet'],
    ['demonic', 'brush', 'forbidden'],
    ['dual', 'pearl', 'magnet'],
  ] as const) {
    const save = freshSave('heaven', ['water'], path);
    assert.equal(save.starter, id);
    assert.deepEqual(save.artifacts, ['pearl', 'brush']);
    const g = new Game(save, 0, 0);
    assert.equal(g.weapons[0].id, id);
    assert.ok(g.evolutionRequirements(id).includes(passive));
    const attuned = freshSave('heaven', ['metal'], path);
    assert.equal(attuneSpiritRoot(attuned, 'heaven', ['water']), true);
    assert.equal(attuned.starter, id);
    assert.ok(['pearl', 'brush'].every((weapon) => attuned.artifacts.includes(weapon)));
  }
});

test('旧水系玄冰镜 / 化血盏本命、收藏及炼器原样读回，续局与新历练仍能使用', () => {
  for (const [id, path] of [
    ['ice', 'orthodox'],
    ['bloodpool', 'demonic'],
    ['ice', 'dual'],
    ['bloodpool', 'dual'],
  ] as const) {
    let save = freshSave('heaven', ['water'], path);
    save.starter = id;
    save.artifacts = ['ice', 'bloodpool', 'orbit'];
    save.forge[id] = 4;
    const snapshot = new Game(save, 0, 0).snapshot();
    for (let reload = 0; reload < 3; reload++) {
      const loaded = readSave(JSON.stringify(save));
      assert.equal(loaded.status, 'ok');
      assert.equal(loaded.save.starter, id);
      assert.deepEqual(loaded.save.artifacts, ['ice', 'bloodpool', 'orbit']);
      assert.equal(loaded.save.forge[id], 4);
      assert.equal(new Game(loaded.save, 0, 0).weapons[0].id, id);
      assert.equal(Game.restore(loaded.save, structuredClone(snapshot))!.weapons[0].id, id);
      save = loaded.save;
    }
  }
});

test('木系新角色及主动重选收藏芭蕉扇 / 万蛊巢，魔道本命与配套为万蛊巢 / 拘魂', () => {
  for (const [path, id] of [
    ['orthodox', 'fan'],
    ['demonic', 'nest'],
    ['dual', 'fan'],
  ] as const) {
    const save = freshSave('heaven', ['wood'], path);
    assert.equal(save.starter, id);
    assert.deepEqual(save.artifacts, ['fan', 'nest']);
    const g = new Game(save, 0, 0);
    assert.equal(g.weapons[0].id, id);
    if (path === 'demonic') assert.deepEqual(g.evolutionRequirements(id), ['soul']);
    const attuned = freshSave('heaven', ['metal'], path);
    assert.equal(attuneSpiritRoot(attuned, 'heaven', ['wood']), true);
    assert.equal(attuned.starter, id);
    assert.ok(['fan', 'nest'].every((weapon) => attuned.artifacts.includes(weapon)));
    assert.equal(attuned.artifacts.includes('chain'), false);
  }
});

test('旧木魔缚妖索本命、收藏、炼器与续局原样保留，已售历史仍能导入', () => {
  for (const path of ['demonic', 'dual'] as const) {
    const save = freshSave('heaven', ['wood'], path);
    save.starter = 'chain';
    save.artifacts = ['fan', 'chain'];
    save.forge.chain = 4;
    const snapshot = new Game(save, 0, 0).snapshot();
    for (const loaded of [
      readSave(JSON.stringify(save)).save,
      importSave(exportSave(save, null)).save,
    ]) {
      assert.equal(loaded.starter, 'chain');
      assert.deepEqual(loaded.artifacts, ['fan', 'chain']);
      assert.equal(loaded.forge.chain, 4);
      assert.equal(new Game(loaded, 0, 0).weapons[0].id, 'chain');
      assert.equal(Game.restore(loaded, structuredClone(snapshot))!.weapons[0].id, 'chain');
    }
    save.starter = 'fan';
    save.path = 'orthodox';
    save.artifacts = ['fan'];
    save.forge.chain = 0;
    save.mortal.auction = {
      hall: 0,
      visit: 0,
      closed: [],
      releasedArtifacts: ['chain'],
      history: [],
    };
    const imported = importSave(exportSave(save, null)).save;
    assert.deepEqual(imported.artifacts, ['fan']);
    assert.deepEqual(imported.mortal.auction, save.mortal.auction);
  }
});

test('缚妖索基础伤害为29，施法命中按新基础结算且仍束缚目标', () => {
  const g = new Game(
    freshSave('none', [], 'demonic', () => 0.2),
    0,
    0,
    () => 0.99,
  );
  g.weapons = [{ id: 'chain', level: 1, evolved: false, timer: 0 }];
  const enemy = g.spawnEnemy(0, false, false, { x: 100, y: 0 });
  enemy.hp = enemy.maxHp = 1e6;
  g.cast(g.weapons[0]);
  assert.equal(treasure('chain').damage, 29);
  assert.ok(Math.abs(enemy.maxHp - enemy.hp - 29 * g.stats.damage) < 1e-8);
  assert.equal(enemy.slow, 2);
});

test('旧水系已售入门标记可读回和导入，历次合法标记不受当前入门表限制', () => {
  for (const [starter, path, released] of [
    ['ice', 'orthodox', 'bloodpool'],
    ['bloodpool', 'demonic', 'ice'],
    ['ice', 'dual', 'bloodpool'],
  ] as const) {
    const save = freshSave('heaven', ['water'], path);
    save.starter = starter;
    save.artifacts = [starter];
    save.mortal.auction = {
      hall: 0,
      visit: 0,
      closed: [],
      releasedArtifacts: [released],
      history: [],
    };
    for (const loaded of [
      readSave(JSON.stringify(save)).save,
      importSave(exportSave(save, null)).save,
    ]) {
      assert.equal(loaded.starter, starter);
      assert.deepEqual(loaded.artifacts, [starter]);
      assert.deepEqual(loaded.mortal.auction, save.mortal.auction);
    }
  }
  const save = freshSave();
  const auction = {
    hall: 0,
    visit: 0,
    closed: [],
    releasedArtifacts: [...Object.values(ROOT_STARTERS).flat(), 'ice', 'bloodpool', 'chain'],
    history: [],
  };
  assert.equal(auction.releasedArtifacts.length, 13);
  assert.equal(validAuction(auction, save.age, undefined), true);
  for (const releasedArtifacts of [['invalid'], ['ice', 'ice'], [1], Array(37).fill('ice')]) {
    assert.equal(validAuction({ ...auction, releasedArtifacts }, save.age, undefined), false);
  }
  for (const id of ['ice', 'bloodpool', 'chain']) assert.equal(freeStarter(id), false);
  for (const id of ['pearl', 'brush', 'nest']) assert.equal(freeStarter(id), true);
});

test('芭蕉扇和万蛊巢的待觉醒选项、自动选技均使用当前配方', () => {
  for (const [id, path, newPassive] of [
    ['fan', 'orthodox', 'crit'],
    ['nest', 'demonic', 'soul'],
  ] as const) {
    const save = freshSave('heaven', ['wood'], path);
    save.cultivation = 1e9;
    save.unlocked = 6;
    const g = new Game(save, 0, 0);
    g.weapons = [{ id, level: 6, evolved: false, timer: 0 }];
    g.passives = { [newPassive]: 5 };
    g.state = 'upgrade';
    g.choices = [
      { type: 'evolve', id, level: 7 },
      { type: 'weapon', id: 'sword', level: 1 },
    ];
    const restored = Game.restore(save, structuredClone(g.snapshot()))!;
    assert.ok(restored);
    assert.deepEqual(restored.evolutionRequirements(id), [newPassive]);
    assert.match(choiceCard(restored, save, restored.choices[0], 0), /仙器觉醒/);
    assert.equal(autoplayChoice(restored)!.index, 0);
    const tribulation = Game.createTribulation(save, restored);
    assert.deepEqual(tribulation.evolutionRequirements(id), [newPassive]);
    assert.equal(restored.choose(0), true);
    assert.equal(restored.weapons[0].evolved, true);
    assert.equal(Game.restore(save, restored.snapshot())!.weapons[0].evolved, true);
  }
});

test('青莲灯与七宝塔低重补强单独乘算、逐重增伤，其余法宝原曲线保留', () => {
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
      if (!['orbit', 'pagoda'].includes(id)) {
        assert.equal(weaponDamageMultiplier(id, level), weaponLevelDamage(level));
      }
    }
  }
});

test('洞府一重预览与升级卡使用实际新旧倍率，三升四不会降低伤害', () => {
  for (const id of ['orbit', 'pagoda', 'flute']) {
    const t = treasure(id);
    const save = freshSave('heaven', [t.element], t.school);
    save.starter = id;
    save.artifacts.push(id);
    const g = new Game(save, 0, 0);
    assert.equal(spiritPower(save).weaponDamage, g.weaponHitDamage(g.weapons[0]));
    assert.match(choiceCard(g, save, { type: 'weapon', id, level: 2 }, 0), /×1.20 → ×1.58/);
    assert.match(choiceCard(g, save, { type: 'weapon', id, level: 4 }, 0), /×1.80 → ×1.96/);
  }
});

test('玉清笛仅补低重，全部法宝逐重增伤，四重以上与仙器沿用原上限', () => {
  const boosted = ['orbit', 'pagoda', 'flute'];
  for (const t of TREASURES) {
    let previous = 0;
    for (let level = 1; level <= 6; level++) {
      const actual = weaponDamageMultiplier(t.id, level);
      const opening = boosted.includes(t.id) ? (level <= 2 ? 1.2 : level === 3 ? 1.1 : 1) : 1;
      assert.equal(actual, weaponLevelDamage(level) * opening);
      assert.ok(actual > previous, `${t.name} ${level}重不能降伤`);
      previous = actual;
    }
    assert.equal(weaponDamageMultiplier(t.id, 6), 2.6);
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
