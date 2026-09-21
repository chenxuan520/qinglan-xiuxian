import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ELEMENTS,
  SPIRIT_ROOTS,
  TREASURES,
  rootElementsFor,
  ROOT_STARTERS,
  rootStarter,
  treasure,
  type SpiritRootId,
  type ElementId,
  type Treasure,
} from '../src/data.ts';
import { freshSave, parseSave, attuneSpiritRoot, alignStarterWithPath } from '../src/progress.ts';
import { Game } from '../src/game.ts';

test('灵根五行数量、去重与迁移正确，持久化后不重抽，旧资质和进度保留', () => {
  for (const root of SPIRIT_ROOTS) {
    for (const value of [0, 0.2, 0.5, 0.99]) {
      const elements = rootElementsFor(root.id, [], () => value);
      assert.equal(elements.length, root.count);
      assert.equal(new Set(elements).size, root.count);
      const legacy = { ...freshSave(root.id), rootElements: undefined, cultivation: 12345 };
      const migrated = parseSave(JSON.stringify(legacy), () => value);
      assert.equal(migrated.spiritRoot, root.id);
      assert.equal(migrated.cultivation, 12345);
      assert.deepEqual(migrated.rootElements, elements);
      const saved = parseSave(JSON.stringify(migrated), () => {
        throw new Error('已有五行不得重抽');
      });
      assert.deepEqual(saved.rootElements, elements);
    }
  }
  const malformed = parseSave(
    JSON.stringify({ ...freshSave('triple'), rootElements: ['fire', 'fire', 'invalid'] }),
    () => 0,
  );
  assert.deepEqual(malformed.rootElements, ['fire', 'metal', 'wood']);
  assert.equal(new Set(TREASURES.map((t) => t.element)).size, 5);
  assert.ok(TREASURES.every((t) => ELEMENTS.some((e) => e.id === t.element)));
});

function battle(item: Treasure, root: SpiritRootId, elements: ElementId[], evolved: boolean) {
  const save = freshSave(root, elements);
  save.artifacts.push(item.id);
  save.starter = item.id;
  save.forge[item.id] = 10;
  save.training.power = 5;
  const g = new Game(save, 0, 0, () => 0.5);
  g.viewport = { width: 1e6, height: 1e6 };
  g.player.invincible = 999;
  g.weapons[0].level = 6;
  g.weapons[0].evolved = evolved;
  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2;
    const e = g.spawnEnemy(0, false, false, {
      x: Math.cos(angle) * 115,
      y: Math.sin(angle) * 115,
    });
    e.hp = e.maxHp = 1e8;
    e.speed = 0;
    e.cooldown = 999;
  }
  for (let i = 0; i < 160; i++) g.update(0.05);
  return g.damageBySource[item.id];
}

test('36 件法宝未觉醒与觉醒的实际伤害按灵根百分比加持，非对应五行不加伤', () => {
  for (const item of TREASURES) {
    for (const evolved of [false, true]) {
      const baseline = battle(item, 'none', [], evolved);
      assert.ok(baseline > 0, item.id);
      for (const root of SPIRIT_ROOTS) {
        const elements = rootElementsFor(root.id, [item.element], () => 0);
        const damage = battle(item, root.id, elements, evolved);
        assert.ok(
          Math.abs(
            damage / baseline -
              ((1 + root.damageBonus / 100) * (1 + (5 * root.powerPerLevel) / 100)) /
                (1 + 5 * 0.012),
          ) < 1e-8,
          `${item.id} ${root.id} ${evolved}: ${damage / baseline}`,
        );
      }
      const other = ELEMENTS.find((e) => e.id !== item.element)!.id;
      assert.ok(
        Math.abs(battle(item, 'heaven', [other], evolved) / baseline - 1.1 / 1.06) < 1e-8,
        item.id,
      );
    }
  }
});

test('广告自选资质与五行，无灵根可获单系，本局资质不随洗练变化且续局不重复放大弹道', () => {
  const save = freshSave('dual', ['fire', 'metal']);
  save.starter = 'sword';
  const g = new Game(save, 0, 0, () => 0.5);
  g.spawnEnemy(0, false, false, { x: 300, y: 0 });
  g.update(0.01);
  assert.ok(g.shots.length);
  const snapshot = JSON.parse(JSON.stringify(g.snapshot()));
  assert.equal(attuneSpiritRoot(save, 'heaven', ['fire']), true);
  assert.equal(save.spiritRoot, 'heaven');
  assert.deepEqual(save.rootElements, ['fire']);
  assert.deepEqual(g.rootElements, ['fire', 'metal']);
  const resumed = Game.restore(save, snapshot)!;
  assert.equal(resumed.spiritRoot, 'dual');
  assert.deepEqual(resumed.rootElements, ['fire', 'metal']);
  assert.equal(resumed.shots[0].damage, snapshot.shots[0].damage);
  assert.equal(Game.restore(save, resumed.snapshot())!.shots[0].damage, snapshot.shots[0].damage);
  assert.deepEqual(new Game(save, 0, 0).rootElements, ['fire']);
  const none = freshSave('none');
  assert.equal(attuneSpiritRoot(none, 'heaven', ['earth']), true);
  assert.equal(none.spiritRoot, 'heaven');
  assert.deepEqual(none.rootElements, ['earth']);
  delete snapshot.rootElements;
  const legacy = Game.restore(save, snapshot)!;
  assert.deepEqual(legacy.rootElements, ['fire', 'metal']);
  assert.deepEqual(Game.restore(save, legacy.snapshot())!.rootElements, ['fire', 'metal']);
  for (const bad of [['fire'], ['fire', 'fire'], ['fire', 'invalid'], 'fire'])
    assert.equal(Game.restore(save, { ...snapshot, rootElements: bad }), null);
});

test('五行对应不同正魔入门本命，自选可切换且不扣除已有收藏与炼器', () => {
  for (const element of ELEMENTS) {
    assert.equal(treasure(ROOT_STARTERS[element.id][0]).school, 'orthodox');
    assert.equal(treasure(ROOT_STARTERS[element.id][1]).school, 'demonic');
    for (const path of ['orthodox', 'demonic', 'dual'] as const) {
      const save = freshSave('heaven', [element.id]);
      save.path = path;
      save.forge.sword = 10;
      save.artifacts.push('sand');
      assert.equal(attuneSpiritRoot(save, 'heaven', [element.id]), true);
      assert.equal(save.starter, rootStarter([element.id], path));
      assert.equal(new Game(save, 0, 0).weapons[0].id, save.starter);
      assert.ok(ROOT_STARTERS[element.id].every((id) => save.artifacts.includes(id)));
      assert.ok(save.artifacts.includes('sand'));
      assert.equal(save.forge.sword, 10);
      const reloaded = parseSave(JSON.stringify(save));
      assert.equal(reloaded.starter, save.starter);
      assert.deepEqual(reloaded.rootElements, [element.id]);
    }
  }
  const save = freshSave();
  assert.equal(attuneSpiritRoot(save, 'dual', ['water', 'fire']), true);
  assert.equal(save.starter, 'ice');
  const before = JSON.stringify(save);
  assert.equal(attuneSpiritRoot(save, 'triple', ['water', 'fire']), false);
  assert.equal(attuneSpiritRoot(save, 'dual', ['water', 'water']), false);
  assert.equal(JSON.stringify(save), before);
  assert.equal(
    attuneSpiritRoot(save, 'none', [], () => 0.99),
    true,
  );
  assert.equal(save.starter, 'vortex');
  assert.ok(save.artifacts.includes('pagoda'));
  assert.ok(save.artifacts.includes('vortex'));
});

test('无灵根从当前路线的五行入门法宝中随机本命', () => {
  const initial = parseSave(null, () => 0.99);
  assert.equal(initial.path, 'orthodox');
  assert.equal(initial.starter, 'pagoda');
  assert.equal(freshSave('none', [], 'dual', () => 0).starter, 'sword');
  assert.equal(freshSave('none', [], 'dual', () => 0.99).starter, 'vortex');
  const save = freshSave('none', [], 'dual', () => 0.2);
  assert.equal(save.starter, 'orbit');
  assert.ok(save.artifacts.includes('orbit'));
  assert.ok(save.artifacts.includes('poison'));
  save.path = 'demonic';
  assert.equal(
    attuneSpiritRoot(save, 'none', [], () => 0.99),
    true,
  );
  assert.equal(save.starter, 'vortex');
  assert.equal(
    freshSave('five', ['water', 'earth', 'fire', 'wood', 'metal'], 'dual', () => 0.99).starter,
    'ice',
  );
});

test('无灵根跨路线时解锁并使用原本命五行的配对法宝', () => {
  const save = freshSave('none', [], 'dual', () => 0);
  save.artifacts = ['sword', 'nail', 'ice'];
  save.starter = 'ice';
  save.path = 'demonic';
  assert.equal(alignStarterWithPath(save), true);
  assert.equal(save.starter, 'bloodpool');
  assert.ok(save.artifacts.includes('bloodpool'));
  assert.equal(new Game(save, 0, 0).weapons[0].id, 'bloodpool');
  const restored = parseSave(JSON.stringify(save));
  assert.equal(restored.starter, 'bloodpool');
  assert.equal(new Game(restored, 0, 0).weapons[0].id, 'bloodpool');

  const almostComplete = freshSave('none', [], 'dual', () => 0);
  almostComplete.artifacts = TREASURES.filter((item) => item.id !== 'bloodpool').map(
    (item) => item.id,
  );
  almostComplete.starter = 'ice';
  almostComplete.path = 'demonic';
  assert.equal(alignStarterWithPath(almostComplete), true);
  assert.equal(almostComplete.artifacts.length, TREASURES.length);
  assert.ok(Object.hasOwn(almostComplete.chronicle.milestones, 'collection'));
});

test('旧魔道番天印校正为阴阳盘并保留炼器阶数', () => {
  const save = freshSave('heaven', ['earth']);
  save.path = 'demonic';
  save.starter = 'meteor';
  save.forge.meteor = 7;
  const restored = parseSave(JSON.stringify(save));
  assert.equal(restored.starter, 'vortex');
  assert.equal(restored.forge.meteor, 7);
  assert.equal(restored.forge.vortex, 7);
  assert.equal(new Game(restored, 0, 0).weapons[0].id, 'vortex');

  const current = freshSave('heaven', ['earth']);
  current.path = 'demonic';
  current.starter = 'meteor';
  current.forge.meteor = 7;
  assert.equal(alignStarterWithPath(current), true);
  assert.equal(current.starter, 'vortex');
  assert.equal(current.forge.vortex || 0, 0);
});
