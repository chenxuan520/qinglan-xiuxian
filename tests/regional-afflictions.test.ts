import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { freshSave } from '../src/progress.ts';
import { ENEMIES, ENEMY_TACTICS } from '../src/data.ts';
import { regionalEnemyFields } from '../src/regional-combat.ts';
import { drawPlayerAilments } from '../src/regional-render.ts';
import { autoplayInput } from '../src/autoplay.ts';

function arena(stage = 1) {
  const save = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  save.unlocked = 6;
  save.cultivation = 1e6;
  const g = new Game(save, stage, 0, () => 0.5);
  g.weapons[0].timer = 9999;
  g.spawnBudget = -10000;
  g.nextElite = 99999;
  g.bossSpawned = true;
  return g;
}
function fire(g: Game, damage = 100) {
  const shot = g.hostileShot(g.player, 1, 0, 1, damage);
  shot.enemySkill = 'firebolt';
  g.updateShots(0.01);
}

test('第二关火球将两成伤害延后1.5秒烧完，总伤害不增加，不叠层或刷新持续时间', () => {
  const g = arena();
  const hp = g.player.hp,
    total = 100 * g.stats.armor;
  fire(g);
  assert.ok(Math.abs(g.player.hp - (hp - total * 0.8)) < 1e-6);
  assert.ok(Math.abs(g.burning.damage - total * 0.2) < 1e-6);
  g.update(0.05);
  g.player.invincible = 0;
  const before = { ...g.burning },
    hpBefore = g.player.hp;
  fire(g);
  assert.deepEqual(g.burning, before);
  assert.ok(Math.abs(g.player.hp - (hpBefore - total)) < 1e-6);
  const regen = g.stats.regen;
  for (let i = 0; i < 29; i++) g.update(0.05);
  assert.ok(Math.abs(g.player.hp - (hp - total * 2 + regen * 1.5)) < 1e-6);
  assert.equal(g.burning.life, 0);
  assert.equal(g.burning.damage, 0);
});

test('护体不着火，普通弹不灼烧，第七关同种火球保持原伤害', () => {
  for (const stage of [0, 1, 6]) {
    const g = arena(stage),
      hp = g.player.hp;
    g.player.invincible = 3;
    fire(g);
    assert.equal(g.player.hp, hp);
    assert.equal(g.burning.life, 0);
    g.player.invincible = 0;
    if (stage !== 1) {
      fire(g);
      assert.equal(g.burning.life, 0);
      assert.ok(Math.abs(g.player.hp - (hp - 100 * g.stats.armor)) < 1e-6);
    } else {
      g.hostileShot(g.player, 1, 0, 1, 100);
      g.updateShots(0.01);
      assert.equal(g.burning.life, 0);
    }
  }
});

test('灼烧只随战斗推进，暂停/选技冻结，续局保留剩余伤害，复活清除', () => {
  const g = arena();
  fire(g);
  g.update(0.05);
  for (const state of ['paused', 'upgrade'] as const) {
    g.state = state;
    const before = { ...g.burning },
      hp = g.player.hp;
    g.update(0.05);
    assert.deepEqual(g.burning, before);
    assert.equal(g.player.hp, hp);
  }
  g.state = 'paused';
  const restored = Game.restore(g.save, JSON.parse(JSON.stringify(g.snapshot())));
  assert.ok(restored);
  assert.deepEqual(restored.burning, g.burning);
  restored.resume();
  restored.update(0.05);
  assert.ok(restored.burning.life < g.burning.life);
  restored.state = 'lost';
  restored.player.hp = 0;
  assert.ok(restored.revive());
  assert.deepEqual(restored.burning, { life: 0, damage: 0 });
});

test('致命灼烧立即落败，不在同一帧继续施法；快照拒绝非法状态', () => {
  const g = arena();
  g.player.hp = 0.1;
  g.burning = { life: 1, damage: g.stats.regen + 100 };
  let casts = 0;
  g.onEvent = (event) => {
    if (event === 'cast') casts++;
  };
  g.weapons[0].timer = 0;
  g.update(0.05);
  assert.equal(g.state, 'lost');
  assert.equal(g.player.hp, 0);
  assert.equal(casts, 0);
  const run = arena();
  for (const burning of [
    null,
    { life: -1, damage: 1 },
    { life: 2, damage: 1 },
    { life: 0, damage: 1 },
    { life: 1, damage: -1 },
    { life: NaN, damage: 1 },
    { life: 1, damage: Infinity },
  ]) {
    assert.equal(Game.restore(run.save, { ...run.snapshot(), burning }), null);
  }
  const final = arena(6);
  assert.equal(
    Game.restore(final.save, { ...final.snapshot(), burning: { life: 1, damage: 1 } }),
    null,
  );
});

test('第六关雷兽与错拍雷路全在自身200像素内，击杀施法者可散雷，第七关不变', () => {
  for (const type of [65, 66, 67, 69]) {
    const g = arena(5),
      tactics = g.enemyTactics(type);
    for (const elite of [false, true]) {
      const e = g.spawnEnemy(type, elite, false, { x: -100, y: 40 });
      const skill = elite ? tactics.eliteSkill : tactics.skill;
      if (!skill) continue;
      for (const angle of [0, 0.8, -1.4, Math.PI]) {
        const fields = regionalEnemyFields(e, skill, Math.cos(angle), Math.sin(angle))!;
        assert.ok(fields.length);
        for (const f of fields) {
          assert.ok(Math.hypot(f.x - e.x, f.y - e.y) + f.radius <= 200);
          assert.ok(Math.hypot(f.endX! - e.x, f.endY! - e.y) + f.radius <= 200);
          assert.ok(f.delay >= 1);
          assert.equal(f.damageScale, skill === 'storm' ? 0.65 : 0.4);
          assert.equal(f.sourceId, e.id);
        }
        g.addRegionalFields(e, fields);
      }
      e.dead = true;
    }
    g.updateZones(0.05);
    assert.equal(g.zones.length, 0);
    assert.deepEqual(arena(6).enemyTactics(type), ENEMY_TACTICS[type]);
  }
  const g = arena(5),
    e = g.spawnEnemy(66, false, false, { x: -100, y: 0 });
  const fields = regionalEnemyFields(e, 'storm', 1, 0)!;
  assert.equal(fields.length, 2);
  assert.ok(Math.abs(fields[1].delay - fields[0].delay - 0.6) < 1e-9);
  assert.ok(fields[0].delay + fields[0].life < fields[1].delay);
});

test('雷麻禁锢0.65秒/1秒保护，不在预警或护体时施加，远处不在脚下生成', () => {
  const g = arena(5),
    e = g.spawnEnemy(69, false, false, { x: -100, y: 0 });
  const fields = regionalEnemyFields(e, 'storm', 1, 0)!;
  g.addRegionalFields(e, fields);
  const z = g.zones[0];
  g.player.x = z.x;
  g.player.y = z.y;
  g.updateZones(0.05);
  assert.equal(g.immobilized, 0);
  z.delay = 0;
  g.player.invincible = 1;
  g.updateZones(0.05);
  assert.equal(g.immobilized, 0);
  g.player.invincible = 0;
  g.updateZones(0.05);
  assert.equal(g.immobilized, 0.65);
  g.immobilized = 0;
  g.player.invincible = 0;
  g.updateZones(0.05);
  assert.equal(g.immobilized, 0);
  g.zones = [];
  g.castEnemySkill(e, 1000, 1, 0);
  assert.equal(g.zones.length, 0);
  const final = arena(6),
    old = final.spawnEnemy(69, false, false, { x: -100, y: 0 });
  final.castEnemySkill(old, 100, 1, 0);
  assert.ok(final.zones.every((z) => !z.kind.includes('thunder')));
});

test('AI按可见错拍预警换位，画面在减少动态下也能区分灼烧和雷麻', () => {
  const g = arena(5),
    e = g.spawnEnemy(66, false, false, { x: -100, y: 0 });
  e.speed = 0;
  e.cooldown = 99999;
  g.addRegionalFields(e, regionalEnemyFields(e, 'storm', 1, 0)!);
  g.pickups = [{ x: 200, y: 0, kind: 'xp', value: 1, pull: false }];
  const hp = g.player.hp;
  for (let i = 0; i < 120; i++) {
    if (i % 6 === 0) g.input = autoplayInput(g);
    g.update(0.02);
  }
  assert.equal(g.player.hp, hp);
  const labels: string[] = [];
  let depth = 0;
  const c = new Proxy({} as CanvasRenderingContext2D, {
    get:
      (_, method: string) =>
      (...args: unknown[]) => {
        if (method === 'save') depth++;
        if (method === 'restore') depth--;
        if (method === 'fillText') labels.push(String(args[0]));
        for (const arg of args) if (typeof arg === 'number') assert.ok(Number.isFinite(arg));
      },
  });
  for (const reduced of [false, true]) {
    g.immobilized = 0.65;
    drawPlayerAilments(c, g, 1, reduced);
    const fire = arena();
    fire.burning = { life: 1, damage: 1 };
    drawPlayerAilments(c, fire, 1, reduced);
    assert.equal(depth, 0);
  }
  assert.ok(labels.includes('雷麻 · 禁锢'));
  assert.ok(labels.includes('灼烧'));
  assert.equal(ENEMIES[e.type].name, '曜日星灵');
});

test('漂移瘴云时长延长50%，保留预警、伤害与小怪完整漂移范围', () => {
  const g = arena(3),
    e = g.spawnEnemy(50, false, false, { x: 0, y: 0 });
  const [cloud] = regionalEnemyFields(e, 'miasma', 1, 0)!;
  assert.ok(Math.abs(cloud.life - 4.8) < 1e-9);
  assert.equal(cloud.delay, 1);
  assert.equal(cloud.damageScale, 0.65);
  assert.ok(
    Math.hypot(cloud.x - e.x + cloud.vx! * cloud.life, cloud.y - e.y + cloud.vy! * cloud.life) +
      cloud.radius <=
      200,
  );
  const boss = g.spawnEnemy(10, false, true);
  boss.skillStep = 0;
  g.castBossSkill(boss, 1, 0);
  assert.equal(g.zones.length, 3);
  assert.ok(g.zones.every((z) => z.life === 6));
});

function soulHit(g: Game) {
  const e = g.spawnEnemy(58, false, false, { x: g.player.x - 60, y: g.player.y });
  e.speed = 0;
  e.cooldown = 9999;
  e.dx = 1;
  e.dy = 0;
  e.hp = e.maxHp = 1e9;
  g.fireEnemyVolley(e, 'soul');
  const b = g.shots.find((b) => b.enemySkill === 'soul')!;
  assert.ok(b, '实际魂弹必须保存封宝标记');
  b.x = g.player.x;
  b.y = g.player.y;
  g.updateShots(0);
}

test('魂弹封宝一秒：仍可移动、已有攻击继续，恢复后立即按原冷却施法', () => {
  const g = arena(4);
  g.weapons[0].timer = 0;
  soulHit(g);
  assert.equal(g.sealed, 1);
  let casts = 0;
  g.onEvent = (e) => {
    if (e === 'cast') casts++;
  };
  g.input = { x: 1, y: 0 };
  const x = g.player.x;
  for (let i = 0; i < 19; i++) g.update(0.05);
  assert.equal(casts, 0);
  assert.ok(g.player.x > x);
  assert.equal(g.weapons[0].timer, 0, '封宝时不积攒负冷却或多轮补发');
  g.update(0.05);
  assert.ok(casts > 0);
});

test('连续魂弹在一秒内不续封，间隔满一秒的下一次真实命中可再次封宝', () => {
  const g = arena(4);
  soulHit(g);
  g.shots = [];
  for (let i = 0; i < 12; i++) g.update(0.05);
  const remaining = g.sealed;
  g.player.invincible = 0;
  soulHit(g);
  g.shots = [];
  assert.equal(g.sealed, remaining, '保护内再次受击不延长当前控制');
  for (let i = 0; i < 9; i++) g.update(0.05);
  assert.equal(g.sealed, 0);
  g.player.invincible = 0;
  soulHit(g);
  assert.equal(g.sealed, 1, '满一秒后再次真实受击恢复完整一秒封宝');
});

test('雷麻仅禁锢移动0.65秒，法宝照常施放；解除后输入继续生效', () => {
  const g = arena(5);
  const target = g.spawnEnemy(65, false, false, { x: 300, y: 0 });
  target.speed = 0;
  target.cooldown = 9999;
  target.hp = target.maxHp = 1e9;
  g.enemyBind();
  assert.equal(g.immobilized, 0.65);
  assert.equal(g.slowed, 0);
  g.input = { x: 1, y: 0 };
  g.weapons[0].timer = 0;
  let casts = 0;
  g.onEvent = (e) => {
    if (e === 'cast') casts++;
  };
  const x = g.player.x;
  for (let i = 0; i < 12; i++) g.update(0.05);
  assert.equal(g.player.x, x);
  assert.ok(casts > 0);
  g.update(0.05);
  g.update(0.001); // 浮点累计到0.65秒的边界后一帧
  assert.ok(g.player.x > x);
  assert.deepEqual(autoplayInput({ ...g, immobilized: 0.65 } as Game), { x: 0, y: 0 });
});

test('禁锢与封宝各有1秒保护，护体不施加，暂停冻结、续局保留、复活和借寿清除', () => {
  for (const [key, method, duration, next] of [
    ['immobilized', 'enemyBind', 0.65, 'nextEnemyBindAt'],
    ['sealed', 'enemySeal', 1, 'nextEnemySealAt'],
  ] as const) {
    const g = arena(4);
    g.player.invincible = 1;
    g[method]();
    assert.equal(g[key], 0);
    g.player.invincible = 0;
    g[method]();
    assert.equal(g[key], duration);
    assert.equal(g[next], 1);
    g.time = 0.999;
    g[key] = 0;
    g[method]();
    assert.equal(g[key], 0);
    g.time = 1;
    g[method]();
    assert.equal(g[key], duration);
    for (const state of ['paused', 'upgrade'] as const) {
      g.state = state;
      g.update(0.05);
      assert.equal(g[key], duration);
    }
    g.state = 'paused';
    const restored = Game.restore(g.save, JSON.parse(JSON.stringify(g.snapshot())))!;
    assert.ok(restored);
    assert.equal(restored[key], duration);
    assert.equal(restored[next], 2);
    restored.resume();
    restored.update(0.05);
    assert.ok(restored[key] < duration);
    restored.state = 'lost';
    restored.player.hp = 0;
    assert.ok(restored.revive());
    assert.equal(restored[key], 0);
    const borrowed = arena(4);
    borrowed.save.cultivation = 0;
    borrowed.realm = 0;
    borrowed.save.age = borrowed.lifespan;
    borrowed.state = 'lost';
    borrowed.player.hp = 0;
    borrowed[key] = duration;
    assert.ok(borrowed.borrowLife());
    assert.equal(borrowed[key], 0);
    for (const bad of [-1, duration + 0.01, NaN, Infinity, null]) {
      assert.equal(Game.restore(g.save, { ...g.snapshot(), [key]: bad }), null);
    }
    for (const bad of [-1, NaN, Infinity, null]) {
      assert.equal(Game.restore(g.save, { ...g.snapshot(), [next]: bad }), null);
    }
  }
});

test('封宝不抹除已经发出的弹丸和法阵，终关魂弹共用封宝，旧雷印不新增禁锢', () => {
  for (const id of ['sword', 'cauldron'] as const) {
    const g = arena(4),
      e = g.spawnEnemy(58, false, false, { x: 70, y: 0 });
    e.hp = e.maxHp = 1e9;
    e.speed = 0;
    e.cooldown = 9999;
    g.weapons[0].id = id;
    g.cast(g.weapons[0]);
    assert.ok(id === 'sword' ? g.shots.length > 0 : g.zones.length > 0);
    g.enemySeal();
    const hp = e.hp;
    for (let i = 0; i < 12; i++) g.update(0.05);
    assert.ok(g.sealed > 0);
    assert.ok(e.hp < hp, '封宝期间已有攻击仍造成伤害');
  }
  const g = arena(6);
  const b = g.hostileShot(g.player, 1, 0, 1, 1);
  b.bossStage = 4;
  g.updateShots(0);
  assert.equal(g.sealed, 1);
  g.player.invincible = 0;
  const e = g.spawnEnemy(69, false, false, { x: -100, y: 0 });
  g.castEnemySkill(e, 100, 1, 0);
  const z = g.zones.find((z) => z.kind === 'enemy-storm')!;
  assert.ok(z);
  z.delay = 0;
  g.player.x = z.x;
  g.player.y = z.y;
  g.updateZones(0.05);
  assert.equal(g.immobilized, 0);
});

test('旧快照缺省控制状态为零，当前快照的控制时钟往返一致', () => {
  const g = arena(4),
    legacy = g.snapshot();
  for (const key of ['immobilized', 'sealed', 'nextEnemyBindAt', 'nextEnemySealAt'])
    delete legacy[key];
  const restored = Game.restore(g.save, legacy)!;
  assert.ok(restored);
  assert.deepEqual(
    [restored.immobilized, restored.sealed, restored.nextEnemyBindAt, restored.nextEnemySealAt],
    [0, 0, 0, 0],
  );
  restored.enemyBind();
  restored.enemySeal();
  restored.state = 'paused';
  const again = Game.restore(g.save, JSON.parse(JSON.stringify(restored.snapshot())))!;
  assert.ok(again);
  assert.equal(again.immobilized, 0.65);
  assert.equal(again.sealed, 1);
});
