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

test('雷麻沿用0.55秒/2.5秒保护，不在预警或护体时施加，远处不在脚下生成', () => {
  const g = arena(5),
    e = g.spawnEnemy(69, false, false, { x: -100, y: 0 });
  const fields = regionalEnemyFields(e, 'storm', 1, 0)!;
  g.addRegionalFields(e, fields);
  const z = g.zones[0];
  g.player.x = z.x;
  g.player.y = z.y;
  g.updateZones(0.05);
  assert.equal(g.slowed, 0);
  z.delay = 0;
  g.player.invincible = 1;
  g.updateZones(0.05);
  assert.equal(g.slowed, 0);
  g.player.invincible = 0;
  g.updateZones(0.05);
  assert.equal(g.slowed, 0.55);
  g.slowed = 0;
  g.player.invincible = 0;
  g.updateZones(0.05);
  assert.equal(g.slowed, 0);
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
    g.slowed = 0.55;
    drawPlayerAilments(c, g, 1, reduced);
    const fire = arena();
    fire.burning = { life: 1, damage: 1 };
    drawPlayerAilments(c, fire, 1, reduced);
    assert.equal(depth, 0);
  }
  assert.ok(labels.includes('雷麻 · 移速 −25%'));
  assert.ok(labels.includes('灼烧'));
  assert.equal(ENEMIES[e.type].name, '曜日星灵');
});
