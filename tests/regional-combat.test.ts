import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, type Zone } from '../src/game.ts';
import { freshSave, parseSave, SAVE_SCHEMA } from '../src/progress.ts';
import { autoplayInput, autoplayChoice } from '../src/autoplay.ts';
import { hazardDistance, hazardCrossing } from '../src/regional-hazards.ts';
import { regionalBossFields, regionalEnemyFields } from '../src/regional-combat.ts';
import { drawRegionalField } from '../src/regional-render.ts';
import { bestiaryPanel } from '../src/bestiary-ui.ts';
import { ENEMY_TACTICS, STAGES } from '../src/data.ts';

function encounter(stage: number) {
  const save = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  save.unlocked = 6;
  save.cultivation = 1e6;
  const g = new Game(save, stage, 0, () => 0.5);
  g.weapons[0].timer = 9999;
  g.spawnBudget = -10000;
  g.nextElite = g.nextTrialBossAt = 99999;
  g.bossSpawned = true;
  const boss = g.spawnEnemy(10, false, true, { x: -220, y: 0 }, stage);
  boss.speed = 0;
  boss.cooldown = boss.pursuitCooldown = 99999;
  return { g, boss };
}

function capsule(): Zone {
  return {
    x: -160,
    y: 0,
    endX: 160,
    endY: 0,
    radius: 22,
    delay: 1.2,
    life: 1.5,
    maxLife: 1.5,
    damage: 20,
    tick: 0,
    kind: 'boss-flame',
    color: '#ffad63',
    hostile: true,
    castDelay: 1.2,
  };
}

test('条带命中包括两端圆帽，横移离开短边；旋转与平移不改变判定', () => {
  const z = capsule();
  assert.equal(hazardDistance(z, { x: 0, y: 30 }), 30);
  assert.equal(hazardDistance(z, { x: 170, y: 0 }), 10);
  assert.equal(hazardDistance(z, { x: 170, y: 24 }), 26);
  assert.deepEqual(hazardCrossing(z, { x: 0, y: 0 }, 0, 100, 8), [0, 0.3]);
  const rotated = { ...z, x: 20, y: -140, endX: 20, endY: 180 };
  assert.equal(hazardDistance(rotated, { x: 50, y: 20 }), 30);
  assert.equal(hazardCrossing(z, { x: 0, y: 50 }, 100, 0), null);
  assert.deepEqual(hazardCrossing(z, { x: 0, y: 0 }, 0, 0), [0, Infinity]);
});

test('移动云和条带警示期间无伤，激活后按真实边界命中且不追踪玩家', () => {
  for (const shape of ['lane', 'cloud']) {
    const { g } = encounter(3);
    const z = capsule();
    if (shape === 'cloud') {
      delete z.endX;
      delete z.endY;
      z.x = 0;
      z.vx = 20;
      z.vy = 0;
    }
    g.zones = [z];
    const hp = g.player.hp;
    g.updateZones(0.5);
    assert.equal(g.player.hp, hp);
    assert.equal(z.x, shape === 'lane' ? -160 : 0);
    z.delay = 0;
    g.updateZones(0.01);
    assert.ok(g.player.hp < hp);
    if (shape === 'cloud') assert.equal(z.x, 0.2);
    const before = z.x;
    g.player.x = 900;
    g.updateZones(0.1);
    assert.equal(z.x, before + (shape === 'cloud' ? 2 : 0));
  }
});

test('所有小怪新危险区及全部漂移路径均在施法者200像素内，boss另有完整预警', () => {
  for (const skill of ['roots', 'firecharge', 'firepath', 'frost', 'miasma', 'storm'] as const)
    for (const elite of [false, true])
      for (const angle of [0, 0.7, Math.PI, -1.2]) {
        const { g } = encounter(0);
        const e = g.spawnEnemy(10, elite, false, { x: 750, y: -630 });
        for (const f of regionalEnemyFields(e, skill, Math.cos(angle), Math.sin(angle))!) {
          assert.ok(f.delay >= 0.85);
          for (const end of [0, f.life]) {
            const dx = (f.vx || 0) * end,
              dy = (f.vy || 0) * end;
            assert.ok(Math.hypot(f.x + dx - e.x, f.y + dy - e.y) + f.radius <= 200);
            if (f.endX !== undefined)
              assert.ok(Math.hypot(f.endX + dx - e.x, f.endY! + dy - e.y) + f.radius <= 200);
          }
        }
      }
  for (let stage = 0; stage < 6; stage++) {
    const { g, boss } = encounter(stage);
    for (let phase = 0; phase < 3; phase++)
      for (const f of regionalBossFields(stage, phase, boss, g.player, 1, 0) ?? [])
        assert.ok(f.delay >= 1.2);
  }
});

test('六关首批特色小怪有实际技能差异，终关兵种保持原行为', () => {
  const cases = [
    [0, 2, 'roots'],
    [1, 30, 'firebolt'],
    [2, 42, 'frostbolt'],
    [3, 50, 'miasma'],
    [4, 58, 'soul'],
    [5, 66, 'storm'],
  ] as const;
  for (const [stage, type, expected] of cases) {
    const { g } = encounter(stage);
    assert.equal(g.enemyTactics(type).skill, expected);
    assert.deepEqual(encounter(6).g.enemyTactics(type), ENEMY_TACTICS[type]);
  }
});

test('前六关远距招式按地域变化，冥主换位留安全距离，狼王保留直线扑击', () => {
  for (let stage = 0; stage < 6; stage++) {
    const { g, boss } = encounter(stage);
    boss.x = -500;
    boss.pursuitCooldown = 0;
    g.update(0.01);
    if (stage === 2) assert.ok(boss.charge > 0.7);
    else {
      assert.equal(boss.charge, 0);
      if (stage === 4) assert.equal(Math.hypot(boss.x - g.player.x, boss.y - g.player.y), 260);
      else assert.ok(g.zones.every((z) => z.delay >= 1.19));
    }
    assert.ok(Game.restore(g.save, JSON.parse(JSON.stringify(g.snapshot()))));
  }
});

test('藤枝随施法者死亡散去，幽冥主魂及嵌套护卫一起消散且不追加收益', () => {
  const wood = encounter(0);
  wood.boss.skillStep = 0;
  wood.g.castBossSkill(wood.boss, 1, 0);
  assert.equal(wood.g.zones.length, 3);
  wood.boss.dead = true;
  wood.g.updateZones(0.01);
  assert.equal(wood.g.zones.length, 0);
  const { g, boss } = encounter(4);
  boss.skillStep = 0;
  g.castBossSkill(boss, 1, 0);
  const caster = g.spawnEnemy(63, false, false, { x: 80, y: 0 });
  caster.summonedBy = boss.id;
  const child = g.spawnEnemy(56, false, false, { x: 100, y: 0 });
  child.summonedBy = caster.id;
  g.hitEnemy(boss, boss.hp);
  assert.ok(g.enemies.every((e) => e.dead));
  assert.equal(g.kills, 1);
});

test('幻影可辨认、没有碰撞伤害及经验掉落，三秒后或本体倒下时消散', () => {
  const { g, boss } = encounter(4);
  boss.skillStep = 1;
  g.castBossSkill(boss, 1, 0);
  const shadows = g.enemies.filter((e) => e.illusionOf === boss.id);
  assert.equal(shadows.length, 3);
  const before = {
    kills: g.kills,
    damage: g.damageDealt,
    xp: g.xp,
    cultivation: g.combatCultivation,
    pickups: g.pickups.length,
  };
  g.hitEnemy(shadows[0], 1000);
  assert.deepEqual(
    {
      kills: g.kills,
      damage: g.damageDealt,
      xp: g.xp,
      cultivation: g.combatCultivation,
      pickups: g.pickups.length,
    },
    before,
  );
  Object.assign(g.player, { x: shadows[1].x, y: shadows[1].y });
  boss.x = 900;
  const hp = g.player.hp;
  g.updateEnemies(0.1);
  assert.equal(g.player.hp, hp);
  g.updateEnemies(3);
  assert.ok(shadows.every((e) => e.dead));
});

test('条带、移动瘴云、幻影和狼王二段扑击暂停/导入导出后保留，损坏字段拒绝续局', () => {
  for (const stage of [0, 1, 2, 3, 4, 5]) {
    const { g, boss } = encounter(stage);
    boss.skillStep = stage === 1 || stage === 4 ? 1 : 0;
    g.castBossSkill(boss, 1, 0);
    g.pause();
    const snapshot = g.snapshot();
    const restored = Game.restore(g.save, JSON.parse(JSON.stringify(snapshot)))!;
    assert.ok(restored, `关卡${stage}`);
    assert.deepEqual(restored.zones, JSON.parse(JSON.stringify(g.zones)));
    assert.deepEqual(restored.enemies, JSON.parse(JSON.stringify(g.enemies)));
    restored.update(0.5);
    assert.deepEqual(restored.zones, JSON.parse(JSON.stringify(g.zones)));
    for (const field of ['endX', 'vx', 'sourceId']) {
      const broken = structuredClone(snapshot);
      if (!broken.zones.length) broken.zones.push(capsule());
      broken.zones[0][field] = Infinity;
      assert.equal(Game.restore(g.save, broken), null, field);
    }
  }
  const save = freshSave();
  save.schema = SAVE_SCHEMA - 1;
  save.stones = 321;
  save.activeRun = encounter(0).g.snapshot();
  const read = parseSave(JSON.stringify(save));
  assert.equal(read!.stones, 321);
  assert.equal(read!.schema, SAVE_SCHEMA);
  assert.equal(read!.activeRun, undefined);
});

test('神农鼎和化血盏命中幻影不吸取气血，命中真实妖物仍正常回血', () => {
  for (const kind of ['cauldron', 'bloodpool']) {
    const { g, boss } = encounter(4);
    boss.skillStep = 1;
    g.castBossSkill(boss, 1, 0);
    const shadow = g.enemies.find((e) => e.illusionOf !== undefined)!;
    boss.x = 900;
    g.player.hp = g.player.maxHp / 2;
    const hp = g.player.hp;
    const before = { kills: g.kills, damage: g.damageDealt, xp: g.xp };
    const zone: Zone = {
      x: shadow.x,
      y: shadow.y,
      radius: 20,
      life: 2,
      maxLife: 2,
      delay: 0,
      damage: 1,
      tick: 0,
      kind,
      color: '#fff',
      hostile: false,
    };
    g.zones = [zone];
    g.updateZones(0.02);
    assert.ok(shadow.dead);
    assert.equal(g.player.hp, hp, kind);
    assert.deepEqual({ kills: g.kills, damage: g.damageDealt, xp: g.xp }, before);
    const real = g.spawnEnemy(58, false, false, { x: zone.x, y: zone.y });
    zone.tick = 0;
    g.updateZones(0.02);
    assert.ok(g.player.hp > hp, kind);
    assert.ok(real.hp < real.maxHp, kind);
  }
});

test('移动魂障在旋转线段的预警和激活期都显示实际世界方向的箭头', () => {
  for (const angle of [0, 0.7, -1.2]) {
    const { boss } = encounter(4);
    const fields = regionalBossFields(
      4,
      2,
      boss,
      { x: 0, y: 0 },
      Math.cos(angle),
      Math.sin(angle),
    )!;
    assert.equal(fields.length, 2);
    for (const field of fields)
      for (const delay of [field.delay, 0]) {
        const rotations: number[] = [];
        const c = new Proxy({} as CanvasRenderingContext2D, {
          get:
            (_, method: string) =>
            (...args: number[]) => {
              if (method === 'rotate') rotations.push(args[0]);
            },
        });
        const z = { ...field, delay, damage: 1, tick: 0, maxLife: field.life };
        assert.ok(drawRegionalField(c, z, 0, true, true));
        assert.equal(rotations.length, 2);
        const worldAngle = rotations.reduce((a, b) => a + b, 0);
        const magnitude = Math.hypot(z.vx!, z.vy!);
        assert.ok(
          (Math.cos(worldAngle) * z.vx! + Math.sin(worldAngle) * z.vy!) / magnitude > 0.999,
        );
      }
  }
});

test('AI按120ms决策避开条带和移动云，拾取不会压过躲避优先级', () => {
  for (const shape of ['lane', 'cloud']) {
    const { g } = encounter(3);
    g.enemies = [];
    g.pickups = [{ x: 500, y: 0, kind: 'xp', value: 1, pull: false }];
    g.zones = [
      shape === 'lane'
        ? capsule()
        : {
            ...capsule(),
            x: 125,
            endX: undefined,
            endY: undefined,
            radius: 52,
            vx: -25,
            vy: 0,
            life: 4,
            maxLife: 4,
          },
    ];
    const hp = g.player.hp;
    for (let frame = 0; frame < 200; frame++) {
      if (frame % 6 === 0) g.input = autoplayInput(g);
      g.update(0.02);
    }
    assert.equal(g.player.hp, hp, shape);
  }
});

test('AI不提前读取下轮技能，仙器觉醒与配套选技优先级保留', () => {
  const { g, boss } = encounter(4);
  g.zones = [capsule()];
  const input = autoplayInput(g);
  boss.skillStep = 2;
  boss.bossSkillQueue = [0, 1];
  assert.deepEqual(autoplayInput(g), input);
  g.choices = [
    { type: 'weapon', id: 'fire', level: 2 },
    { type: 'evolve', id: 'sword', level: 6 },
    { type: 'heal', id: 'heal', level: 0 },
  ];
  assert.equal(autoplayChoice(g)!.index, 1);
});

test('条带/游瘴在预警、激活、减少动态下保持画布状态与有限坐标，妖物志区分普通与终关技能', () => {
  let depth = 0;
  const c = new Proxy({} as CanvasRenderingContext2D, {
    get:
      (_, method: string) =>
      (...args: unknown[]) => {
        assert.ok(
          args.every((a) => typeof a !== 'number' || Number.isFinite(a)),
          method,
        );
        if (method === 'save') depth++;
        if (method === 'restore') depth--;
        assert.ok(depth >= 0);
      },
  });
  for (let stage = 0; stage < 6; stage++) {
    const { g, boss } = encounter(stage);
    for (let phase = 0; phase < STAGES[stage].skills.length; phase++) {
      boss.skillStep = phase;
      g.castBossSkill(boss, 1, 0);
    }
    for (const z of g.zones)
      if (z.endX !== undefined || z.vx !== undefined)
        for (const reduced of [false, true])
          for (const warning of [false, true]) {
            assert.ok(drawRegionalField(c, z, 12, reduced, warning));
            assert.ok(drawRegionalField(c, { ...z, delay: 0 }, 12, reduced, warning));
            assert.equal(depth, 0);
          }
  }
  assert.match(bestiaryPanel(0).body, /青藤横生/);
  assert.match(bestiaryPanel(3).body, /五毒游瘴/);
  assert.match(bestiaryPanel(4).body, /幽影换形/);
  assert.match(bestiaryPanel(6).body, /摄魂灵轮/);
  assert.ok(!bestiaryPanel(6).body.includes('幽影换形'));
});
