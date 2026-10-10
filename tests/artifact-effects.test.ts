import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, type Effect, type Zone } from '../src/game.ts';
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
  drawArtifactBurst,
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

function pagodaFixture(level: number, evolved = false) {
  const g = new Game(freshSave('heaven', ['earth'], 'orthodox'), 0, 0, () => 0.99);
  g.weapons = [{ id: 'pagoda', level, evolved, timer: 999 }];
  g.spawnEnemy(0, false, false, { x: g.player.x + 100, y: g.player.y });
  g.cast(g.weapons[0]);
  g.enemies = [];
  const z = g.zones[0];
  const enemies = [20, 40, 60, 80, z.radius + 0.01].map((offset) => {
    const e = g.spawnEnemy(0, false, false, { x: z.x + offset, y: z.y });
    e.hp = e.maxHp = 10000;
    return e;
  });
  return { g, z, enemies };
}

test('七宝塔低重每轮镇压两只，三重及仙器三只，副目标两成且不越出圆形范围', () => {
  for (const [level, evolved] of [
    [1, false],
    [2, false],
    [3, false],
    [6, false],
    [6, true],
  ] as const) {
    const { g, z, enemies } = pagodaFixture(level, evolved);
    const count = level >= 3 || evolved ? 3 : 2;
    near(z.radius, (210 + level * 15) * g.stats.area);
    near(z.maxLife, 4.5 * g.stats.duration);
    g.updateZones(0.01);
    enemies.forEach((e, i) => near(e.maxHp - e.hp, i < count ? z.damage * (i ? 0.2 : 1) : 0));
    near(g.damageBySource.pagoda, z.damage * (1 + (count - 1) * 0.2));
    assert.equal(g.effects.filter((e) => e.kind === 'tower-ray').length, count);
    const hp = enemies.map((e) => e.hp);
    g.updateZones(0.2);
    assert.deepEqual(
      enemies.map((e) => e.hp),
      hp,
    );
    g.updateZones(0.3);
    enemies.forEach((e, i) => near(e.maxHp - e.hp, i < count ? z.damage * (i ? 0.4 : 2) : 0));
  }
});

test('七宝塔跳过已死目标，主目标死亡后也不会重复命中或把余力叠给单只妖王', () => {
  const { g, z, enemies } = pagodaFixture(3);
  enemies[0].dead = true;
  enemies[1].hp = z.damage / 2;
  g.updateZones(0.01);
  assert.equal(enemies[0].hp, enemies[0].maxHp);
  assert.equal(enemies[1].dead, true);
  near(enemies[2].maxHp - enemies[2].hp, z.damage * 0.2);
  near(enemies[3].maxHp - enemies[3].hp, z.damage * 0.2);
  assert.equal(enemies[4].hp, enemies[4].maxHp);
  const solo = pagodaFixture(6, true);
  solo.g.enemies = [];
  const boss = solo.g.spawnEnemy(0, false, true, { x: solo.z.x + 20, y: solo.z.y });
  boss.hp = boss.maxHp = 100000;
  solo.g.updateZones(0.01);
  near(boss.maxHp - boss.hp, solo.z.damage);
  assert.equal(solo.g.effects.filter((e) => e.kind === 'tower-ray').length, 1);
});

test('七宝塔活动领域续局恢复后仍按同样的多目标、间隔与伤害结算', () => {
  for (const level of [1, 3, 6]) {
    const { g, enemies } = pagodaFixture(level, level === 6);
    g.updateZones(0.01);
    const restored = Game.restore(g.save, g.snapshot());
    assert.ok(restored);
    g.updateZones(0.5);
    restored.updateZones(0.5);
    assert.deepEqual(
      restored.enemies.map((e) => e.hp),
      enemies.map((e) => e.hp),
    );
    near(restored.damageBySource.pagoda, g.damageBySource.pagoda);
    assert.deepEqual(restored.zones, g.zones);
  }
});

test('七宝塔有空余目标名额时也不命中圆形边界或范围外的妖物', () => {
  const { g, z, enemies } = pagodaFixture(3);
  enemies.slice(1).forEach((e, i) => {
    e.x = z.x + z.radius + i * 20;
    e.y = z.y;
  });
  g.updateZones(0.01);
  near(enemies[0].maxHp - enemies[0].hp, z.damage);
  enemies.slice(1).forEach((e) => assert.equal(e.hp, e.maxHp));
  assert.equal(g.effects.filter((e) => e.kind === 'tower-ray').length, 1);
});

test('多个七宝塔圈独立镇压，重叠圈续局后不漏伤或在单圈重复命中', () => {
  const { g, z, enemies } = pagodaFixture(3);
  g.cast(g.weapons[0]);
  assert.equal(g.zones.length, 2);
  g.updateZones(0.01);
  enemies.forEach((e, i) => near(e.maxHp - e.hp, i < 3 ? z.damage * (i ? 0.4 : 2) : 0));
  const restored = Game.restore(g.save, g.snapshot());
  assert.ok(restored);
  g.updateZones(0.5);
  restored.updateZones(0.5);
  assert.deepEqual(
    restored.enemies.map((e) => e.hp),
    enemies.map((e) => e.hp),
  );
  near(restored.damageBySource.pagoda, g.damageBySource.pagoda);
  assert.deepEqual(restored.zones, g.zones);
});

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
  assert.equal(new Game(g.save, 0, 0).artifactVersion, 2);
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
  assert.equal(Game.restore(g.save, { ...snapshot, artifactVersion: 3 }), null);
  delete snapshot.artifactVersion;
  for (const z of snapshot.zones) {
    delete z.castDelay;
    delete z.castAngle;
    delete z.castEvolved;
  }
  assert.ok(Game.restore(g.save, snapshot));
  assert.equal(parseSave(JSON.stringify({ ...g.save, schema: 4 })).schema, SAVE_SCHEMA);
  assert.ok(SAVE_SCHEMA >= 5);
});

test('钟声和冰镜绘制不修改效果时钟，减少动态效果仍保留完整命中边界', () => {
  for (const id of ['pulse', 'ice'] as const) {
    const g = fixture();
    g.weapons = [{ id, level: 6, evolved: true, timer: 999 }];
    g.cast(g.weapons[0]);
    const e = g.effects.find((e) => e.kind === (id === 'pulse' ? 'bell' : 'ice'))!;
    assert.ok(e);
    const radii: number[] = [],
      stack: number[] = [];
    const ctx = new Proxy({ globalAlpha: 1 } as CanvasRenderingContext2D, {
      get(target, key) {
        if (key === 'globalAlpha') return target.globalAlpha;
        return (...args: unknown[]) => {
          if (key === 'save') stack.push(target.globalAlpha);
          if (key === 'restore') target.globalAlpha = stack.pop()!;
          if (key === 'arc') radii.push(args[2] as number);
          for (const value of args)
            if (typeof value === 'number') assert.ok(Number.isFinite(value));
        };
      },
    });
    for (const fraction of [1, 0.5, 0.001])
      for (const reduced of [false, true]) {
        e.life = e.maxLife * fraction;
        const before = structuredClone(e) as Effect;
        const snapshot = g.snapshot();
        radii.length = 0;
        drawArtifactBurst(ctx, e, reduced);
        assert.deepEqual(e, before);
        assert.deepEqual(g.snapshot(), snapshot);
        assert.equal(stack.length, 0);
        assert.ok(radii.includes(e.radius));
        assert.ok(radii.every((r) => r <= e.radius));
      }
  }
});

test('重击实体、己方光束和觉醒装饰都不能盖住地面圈、普通冲刺和妖王路线', async () => {
  const { readFileSync } = await import('node:fs');
  const { registerHooks, stripTypeScriptTypes } = await import('node:module');
  const renderUrl = new URL('../src/render.ts', import.meta.url);
  const hook = registerHooks({
    load(url, context, nextLoad) {
      if (url !== renderUrl.href) return nextLoad(url, context);
      return {
        format: 'module',
        shortCircuit: true,
        source: stripTypeScriptTypes(readFileSync(renderUrl, 'utf8'), { mode: 'transform' }),
      };
    },
  });
  const { Renderer } = await import('../src/render.ts').finally(() => hook.deregister());
  for (const id of ['axe', 'coffin', 'pagoda'] as const)
    for (const charging of [false, true]) {
      const g = fixture();
      g.path = 'dual';
      g.weapons = [{ id, level: 6, evolved: true, timer: 99 }];
      const dash = g.spawnEnemy(0, false, false, { x: 60, y: 0 });
      dash.charge = 0.9;
      dash.dx = 1;
      dash.dy = 0;
      const ranged = g.spawnEnemy(1, false, false, { x: 100, y: 40 });
      ranged.windup = 0.5;
      ranged.pendingSkill = 'ranged';
      g.cast(g.weapons[0]);
      for (const z of g.zones) {
        z.delay = charging ? 0.3 : 0;
        z.castDelay = 0.6;
        if (!charging) z.life -= 0.01;
      }
      g.zone(60, 0, 90, 0.5, 20, '#dc937b', 'enemy-firepath', 0.8, true);
      // 故意先放敌方路线、后放己方光束，不能依赖 effects 的创建顺序。
      g.effects = [
        {
          x: 0,
          y: 0,
          x2: 200,
          y2: 0,
          radius: 45,
          life: 0.8,
          maxLife: 0.8,
          color: '#e2957c',
          kind: 'line',
        },
        {
          x: 0,
          y: 0,
          x2: 200,
          y2: 0,
          radius: 42,
          life: 0.4,
          maxLife: 0.4,
          color: '#00cafe',
          kind: 'whip',
        },
        {
          x: 0,
          y: 0,
          radius: 210,
          life: 0.5,
          maxLife: 0.75,
          color: '#9fdcfa',
          kind: 'ice',
        },
        {
          x: 0,
          y: 0,
          radius: 210,
          life: 0.5,
          maxLife: 0.75,
          color: '#edc77f',
          kind: 'bell',
        },
        {
          x: 0,
          y: 0,
          radius: 420,
          life: 1,
          maxLife: 1.6,
          color: '#76efcd',
          kind: 'awaken',
          element: 'earth',
        },
      ];
      const calls: { method: string; args: unknown[]; strokeStyle: unknown; alpha: number }[] = [];
      const stack: object[] = [];
      const context = {
        globalAlpha: 1,
        strokeStyle: '#000',
        fillStyle: '#000',
        globalCompositeOperation: 'source-over',
      } as CanvasRenderingContext2D;
      const ctx = new Proxy(context, {
        get(target, key: string) {
          if (key in target) return target[key];
          if (key === 'createLinearGradient') return () => ({ addColorStop() {} });
          return (...args: unknown[]) => {
            if (key === 'save') stack.push({ ...target });
            else if (key === 'restore') Object.assign(target, stack.pop());
            else
              calls.push({
                method: key,
                args,
                strokeStyle: target.strokeStyle,
                alpha: target.globalAlpha,
              });
          };
        },
      });
      const r = Object.assign(Object.create(Renderer.prototype), {
        ctx,
        width: 1280,
        height: 800,
        scale: 1,
        reducedMotion: { matches: false },
        sprite() {},
        formation() {},
        cachedFormation() {},
      });
      const before = g.snapshot();
      r.drawGame(g, 0);
      assert.deepEqual(g.snapshot(), before);
      const lastObject = calls.findLastIndex(
        (c) =>
          ['fill', 'fillRect', 'stroke'].includes(c.method) &&
          Math.abs(c.alpha - (charging ? 0.63 : 0.9)) < 1e-8,
      );
      const lastBeam = calls.findLastIndex(
        (c) => c.method === 'stroke' && c.strokeStyle === '#00cafe',
      );
      const lastAwaken = calls.findLastIndex(
        (c) => c.method === 'stroke' && c.strokeStyle === '#76efcd',
      );
      const lastBurst = calls.findLastIndex(
        (c) => c.method === 'stroke' && ['#d4efeb', '#d6b66f'].includes(String(c.strokeStyle)),
      );
      assert.ok(lastObject >= 0 && lastBeam >= 0 && lastAwaken >= 0);
      assert.ok(lastBurst >= 0);
      const floor = calls.findIndex((c) => c.method === 'stroke' && c.strokeStyle === '#ff9b80');
      const charge = calls.findIndex((c) => c.method === 'strokeRect' && c.args[2] === 209);
      const windup = calls.findIndex(
        (c) => c.method === 'arc' && c.args[0] === ranged.x && c.args[2] === ranged.radius + 8,
      );
      const boss = calls.findIndex((c) => c.method === 'stroke' && c.strokeStyle === '#e2957c');
      for (const index of [floor, charge, windup, boss])
        assert.ok(
          index > Math.max(lastObject, lastBeam, lastAwaken, lastBurst),
          `${id}/${charging}: 警示 ${index} 被实体 ${lastObject} 或光束 ${lastBeam} 覆盖`,
        );
      assert.equal(stack.length, 0);
    }
});
