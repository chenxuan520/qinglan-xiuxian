import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, type Zone } from '../src/game.ts';
import { freshSave, parseSave, SAVE_SCHEMA } from '../src/progress.ts';
import { treasure, type WeaponKind } from '../src/data.ts';
import { joinSect } from '../src/mortal.ts';
import { autoplayChoice } from '../src/autoplay.ts';
import { choiceCard } from '../src/common-ui.ts';
import {
  artifactCue,
  hasArtifactField,
  drawArtifactField,
  drawArtifactObject,
} from '../src/artifact-effects.ts';

function fixture() {
  const save = freshSave('triple', ['wood', 'water', 'fire'], 'demonic', () => 0.9);
  const g = new Game(save, 0, 0, () => 0.99);
  g.spawnBudget = -10000;
  g.nextElite = 9999;
  g.player.invincible = 9999;
  return g;
}
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);

test('白骨髅新配方、升级提示和自动选技都认白骨魔功，兼修也可金刚不坏', () => {
  for (const path of ['demonic', 'dual'] as const) {
    const g = fixture();
    g.path = path;
    g.weapons = [{ id: 'skull', level: 6, evolved: false, timer: 0 }];
    assert.deepEqual(
      g.evolutionRequirements('skull'),
      path === 'dual' ? ['guard', 'bone'] : ['bone'],
    );
    for (const partner of g.evolutionRequirements('skull')) {
      g.passives = { [partner]: 4, forbidden: 5 };
      assert.equal(g.canEvolve('skull'), false);
      g.choices = [
        { type: 'passive', id: 'forbidden', level: 5 },
        { type: 'passive', id: partner, level: 5 },
      ];
      g.state = 'upgrade';
      assert.equal(autoplayChoice(g)!.index, 1);
      assert.equal(g.choose(1), true);
      assert.equal(g.canEvolve('skull'), true);
    }
    const html = choiceCard(g, g.save, { type: 'weapon', id: 'skull', level: 6 }, 0);
    assert.ok(html.includes('白骨魔功五重'));
    assert.ok(!html.includes('逆命魔典五重'));
    g.choices = [{ type: 'evolve', id: 'skull', level: 7 }];
    g.state = 'upgrade';
    assert.equal(g.choose(0), true);
    assert.equal(g.weapons[0].evolved, true);
  }
});

test('更新前白骨续局保留逆命配方，重复恢复、已觉醒与进入天劫都不换配方', () => {
  const g = fixture();
  g.weapons = [{ id: 'skull', level: 6, evolved: false, timer: 0 }];
  g.passives = { forbidden: 4, bone: 1 };
  g.state = 'upgrade';
  g.choices = [
    { type: 'passive', id: 'forbidden', level: 5 },
    { type: 'passive', id: 'bone', level: 2 },
  ];
  const old = g.snapshot();
  delete old.artifactVersion;
  const first = Game.restore(g.save, old)!;
  assert.ok(first);
  assert.equal(first.artifactVersion, 0);
  const restored = Game.restore(g.save, first.snapshot())!;
  assert.deepEqual(restored.evolutionRequirements('skull'), ['forbidden']);
  assert.equal(autoplayChoice(restored)!.index, 0);
  assert.ok(
    choiceCard(restored, g.save, { type: 'weapon', id: 'skull', level: 6 }, 0).includes(
      '逆命魔典五重',
    ),
  );
  assert.equal(restored.choose(0), true);
  assert.equal(restored.canEvolve('skull'), true);
  restored.state = 'upgrade';
  restored.choices = [{ type: 'evolve', id: 'skull', level: 7 }];
  restored.choose(0);
  const evolved = Game.restore(g.save, restored.snapshot())!;
  assert.equal(evolved.weapons[0].evolved, true);
  assert.equal(
    evolved.effects.some((e) => e.kind === 'awaken'),
    false,
  );
  assert.equal(Game.createTribulation(g.save, evolved).artifactVersion, 0);
  assert.equal(new Game(g.save, 0, 0).artifactVersion, 1);
});

test('白骨每重给骨灵独立增伤8%，精研最高52%，不增加其他法宝伤害', () => {
  for (const evolved of [false, true]) {
    const g = fixture();
    const skull = { id: 'skull' as const, level: 6, evolved, timer: 0 };
    const axe = { ...skull, id: 'axe' as const };
    const baseline = g.weaponHitDamage(skull),
      other = g.weaponHitDamage(axe);
    for (let level = 0; level <= 5; level++) {
      g.passives = { bone: level };
      near(g.weaponHitDamage(skull), baseline * (1 + 0.08 * level));
      near(g.weaponHitDamage(axe), other);
    }
    // 限制倍率来源，不随无限增长的最大气血继续放大骨灵伤害。
    g.player.maxHp *= 100;
    near(g.weaponHitDamage(skull), baseline * 1.4);
  }
  const g = fixture();
  g.save.cultivation = 1e9;
  g.save.completed = [6];
  g.save.stones = 1000;
  joinSect(g.save, 'bone');
  g.save.mortal.mastery.bone = 10;
  const w = { id: 'skull' as const, level: 6, evolved: true, timer: 0 };
  const base = g.weaponHitDamage(w);
  g.passives.bone = 5;
  near(g.weaponHitDamage(w), base * 1.52);
});

test('骨灵实际弹丸命中及觉醒一击使用白骨增益，新旧续局均可受益', () => {
  for (const artifactVersion of [0, 1]) {
    const g = fixture();
    g.artifactVersion = artifactVersion;
    const w = { id: 'skull' as const, level: 1, evolved: false, timer: 999 };
    g.weapons = [w];
    g.passives = { bone: 5 };
    const e = g.spawnEnemy(0, false, false, { x: 250, y: 0 });
    e.hp = e.maxHp = 1e7;
    g.cast(w);
    assert.ok(g.shots.length > 0);
    const shot = g.shots[0];
    near(shot.damage, treasure('skull').damage * g.stats.damage * 1.4);
    g.shots = [shot];
    e.x = shot.x + shot.vx * 0.01;
    e.y = shot.y + shot.vy * 0.01;
    g.updateShots(0.01);
    near(e.maxHp - e.hp, shot.damage);
    near(g.damageBySource.skull, shot.damage);
    g.awaken(w);
    near(e.maxHp - e.hp, shot.damage * 9);
  }
});

test('斧、印、棺的落地反馈与既有伤害时机、半径保持一致', () => {
  for (const id of ['axe', 'meteor', 'coffin'] as const) {
    const g = fixture();
    const w = { id, level: 1, evolved: false, timer: 999 };
    g.weapons = [w];
    const e = g.spawnEnemy(0, false, false, { x: 110, y: 0 });
    e.hp = e.maxHp = 1e7;
    g.cast(w);
    const z = g.zones.find((z) => z.kind === id)!;
    near(z.delay, id === 'axe' ? 0.35 : id === 'meteor' ? 0.55 : 0.85);
    near(z.radius, id === 'axe' ? 102 * 1.35 : id === 'meteor' ? 75 : 85);
    const outside = g.spawnEnemy(0, false, false, { x: z.x + z.radius + e.radius + 0.01, y: z.y });
    outside.hp = outside.maxHp = 1e7;
    assert.equal(artifactCue(z).charging, true);
    g.updateZones(z.delay);
    assert.equal(z.delay, 0);
    assert.equal(e.hp, e.maxHp);
    assert.equal(artifactCue(z).charging, true);
    g.updateZones(0.01);
    assert.equal(artifactCue(z).charging, false);
    near(e.maxHp - e.hp, z.damage);
    assert.equal(outside.hp, outside.maxHp);
  }
});

test('所有领域的动画快照保留相位，暂停、绘制与减少动态效果不修改战斗或随机数', () => {
  let operations = 0,
    depth = 0;
  const ctx = new Proxy({ globalAlpha: 1 } as CanvasRenderingContext2D, {
    get(target, key) {
      if (key === 'globalAlpha') return target.globalAlpha;
      if (key === 'createLinearGradient') return () => ({ addColorStop() {} });
      return (...args: unknown[]) => {
        if (key === 'save') depth++;
        if (key === 'restore') depth--;
        for (const arg of args) if (typeof arg === 'number') assert.ok(Number.isFinite(arg));
        operations++;
      };
    },
  });
  for (const id of [
    'axe',
    'meteor',
    'coffin',
    'brush',
    'pagoda',
    'banner',
    'cauldron',
    'bloodpool',
    'nest',
    'sand',
    'poison',
    'vortex',
  ] as WeaponKind[]) {
    const g = fixture();
    g.weapons = [{ id, level: 6, evolved: true, timer: 999 }];
    g.spawnEnemy(0, false, false, { x: 110, y: 0 });
    g.cast(g.weapons[0]);
    assert.ok(g.zones.length);
    for (const z of g.zones) {
      assert.equal(z.castEvolved, true);
      for (const progress of [0, 0.5, 1]) {
        z.delay = z.castDelay! * (1 - progress);
        if (progress === 1) z.life -= 0.01;
        const restored = Game.restore(g.save, g.snapshot())!;
        assert.ok(restored);
        const copy = restored.zones.find(
          (other) => other.kind === z.kind && other.x === z.x && other.y === z.y,
        )!;
        assert.deepEqual(artifactCue(copy), artifactCue(z));
        const before = structuredClone(z);
        for (const reduced of [false, true]) {
          drawArtifactField(ctx, z, 31.7, reduced);
          drawArtifactObject(ctx, z, 31.7, reduced);
          assert.equal(depth, 0);
          assert.deepEqual(z, before);
        }
      }
    }
    g.pause();
    const snapshot = g.snapshot();
    g.random = () => {
      throw Error('绘制不得消耗随机数');
    };
    g.update(1);
    assert.deepEqual(g.snapshot(), snapshot);
  }
  assert.ok(operations > 1000);
  const hostile = { kind: 'poison', hostile: true } as Zone;
  assert.equal(hasArtifactField(hostile), false);
});

test('新存档字段校验与旧字段缺省兼容，不接受损坏动画数据', () => {
  const g = fixture();
  g.zone(10, 20, 80, 0.3, 20, '#abcdef', 'axe', 0.35);
  const snapshot = g.snapshot();
  for (const [key, value] of [
    ['castDelay', -1],
    ['castDelay', Infinity],
    ['castAngle', NaN],
    ['castAngle', 9],
    ['castEvolved', 'true'],
  ]) {
    const broken = structuredClone(snapshot);
    broken.zones[0][key] = value;
    assert.equal(Game.restore(g.save, broken), null, String(key));
  }
  assert.equal(Game.restore(g.save, { ...snapshot, artifactVersion: 2 }), null);
  delete snapshot.artifactVersion;
  for (const z of snapshot.zones) {
    delete z.castDelay;
    delete z.castAngle;
    delete z.castEvolved;
  }
  assert.ok(Game.restore(g.save, snapshot));
  assert.equal(parseSave(JSON.stringify({ ...g.save, schema: 4 })).schema, SAVE_SCHEMA);
  assert.equal(SAVE_SCHEMA, 5);
});
