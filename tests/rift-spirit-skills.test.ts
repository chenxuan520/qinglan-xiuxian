import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { freshSave } from '../src/progress.ts';
import { bossSkills } from '../src/boss-skills.ts';
import { STAGES, TAU } from '../src/data.ts';
import { hazardDistance, ENEMY_CONTROL } from '../src/regional-hazards.ts';
import { autoplayInput } from '../src/autoplay.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
function encounter(arena = 5, phase = 4, random = () => 0.5) {
  const save = freshSave('heaven', ['metal'], 'dual', () => 0.5);
  save.unlocked = 6;
  save.cultivation = 119940;
  const g = new Game(save, arena, 0, random);
  g.weapons[0].timer = 99999;
  g.spawnBudget = -10000;
  g.nextElite = g.nextTrialBossAt = 99999;
  g.bossSpawned = true;
  const e = g.spawnEnemy(10, false, true, { x: -240, y: -320 }, 5);
  Object.assign(e, { speed: 0, cooldown: 99999, pursuitCooldown: 99999, skillStep: phase });
  g.castBossSkill(e, 0.6, 0.8);
  e.cooldown = 99999;
  return { g, e };
}
for (const arena of [5, 6]) {
  test(`第${arena + 1}关劫灵六招保留原三招，新招索引4/5`, () => {
    assert.deepEqual(bossSkills(5, arena === 6), [
      ...STAGES[5].skills,
      '星位轮转',
      '星轨连珠',
      '雷网横移',
    ]);
  });
  test(`第${arena + 1}关星轨五线按i→i+2连接，脚下必中、星心安全，预警后才伤人`, () => {
    for (const roll of [0, 0.23, 0.5, 0.99]) {
      const { g, e } = encounter(arena, 4, () => roll);
      assert.equal(g.zones.length, 5);
      const vertices = g.zones.map(({ x, y }) => ({ x, y }));
      const center = {
        x: vertices.reduce((s, v) => s + v.x, 0) / 5,
        y: vertices.reduce((s, v) => s + v.y, 0) / 5,
      };
      near(Math.min(...g.zones.map((z) => hazardDistance(z, g.player))), 0);
      near((vertices[0].x + vertices[2].x) / 2, g.player.x);
      near((vertices[0].y + vertices[2].y) / 2, g.player.y);
      g.zones.forEach((z, i) => {
        near(Math.hypot(z.x - center.x, z.y - center.y), 170);
        near(hazardDistance(z, center), 170 * Math.cos(TAU / 5));
        assert.equal(z.endX, vertices[(i + 2) % 5].x);
        assert.equal(z.endY, vertices[(i + 2) % 5].y);
        assert.equal(z.radius, 18);
        assert.equal(z.delay, 1);
        assert.equal(z.life, 0.5);
        assert.equal(z.damage, e.damage);
        assert.equal(z.kind, 'boss-rift');
      });
      const hp = g.player.hp;
      g.updateZones(1);
      assert.equal(g.player.hp, hp);
      g.updateZones(0.01);
      assert.ok(g.player.hp < hp);
      g.updateZones(0.5);
      assert.equal(g.zones.length, 0);
    }
    const { g } = encounter(arena);
    const center = {
      x: g.zones.reduce((s, z) => s + z.x, 0) / 5,
      y: g.zones.reduce((s, z) => s + z.y, 0) / 5,
    };
    Object.assign(g.player, center);
    const hp = g.player.hp;
    g.updateZones(1);
    g.updateZones(0.01);
    assert.equal(g.player.hp, hp);
  });
  test(`第${arena + 1}关雷网三墙各留130缺口、间距140，预警冻结、朝王移动、命中定身、到期消失`, () => {
    const { g, e } = encounter(arena, 5);
    let roll = 0;
    g.random = () => [0.1, 0.5, 0.9][roll++ % 3];
    g.zones = [];
    e.skillStep = 5;
    g.castBossSkill(e, 0.6, 0.8);
    assert.equal(g.zones.length, 6);
    const gaps: number[] = [];
    for (let i = 0; i < 3; i++) {
      const [a, b] = g.zones.slice(i * 2, i * 2 + 2);
      near(Math.hypot(b.x - a.endX!, b.y - a.endY!), 130);
      near(Math.hypot(b.endX! - a.x, b.endY! - a.y), 640);
      near(a.x * 0.6 + a.y * 0.8, 260 + i * 140);
      near(b.x * 0.6 + b.y * 0.8, 260 + i * 140);
      gaps.push((-0.8 * (b.x + a.endX!)) / 2 + (0.6 * (b.y + a.endY!)) / 2);
      for (const z of [a, b]) {
        near(z.vx!, -54);
        near(z.vy!, -72);
        near(z.damage, e.damage * 0.6);
        assert.equal(z.delay, 0.8);
        assert.equal(z.life, 4);
        assert.equal(z.kind, 'enemy-thunderpath');
      }
    }
    assert.equal(new Set(gaps.map((x) => Math.round(x))).size, 3);
    const z = g.zones[0],
      before = structuredClone(z),
      hp = g.player.hp;
    g.updateZones(0.8);
    assert.equal(z.x, before.x);
    assert.equal(z.endX, before.endX);
    assert.equal(g.player.hp, hp);
    assert.equal(g.immobilized, 0);
    g.updateZones(0.5);
    near(z.x, before.x - 27);
    near(z.endX!, before.endX! - 27);
    near(z.y, before.y - 36);
    near(z.endY!, before.endY! - 36);
    Object.assign(g.player, { x: (z.x + z.endX!) / 2, y: (z.y + z.endY!) / 2 });
    z.tick = 0;
    g.updateZones(0);
    assert.ok(g.player.hp < hp);
    assert.equal(g.immobilized, ENEMY_CONTROL.bind);
    g.updateZones(3.5);
    assert.equal(g.zones.length, 0);
  });
  test(`第${arena + 1}关五星角度均分、间隔0.35、达到十颗不再增加`, () => {
    const { g, e } = encounter(arena, 3);
    assert.equal(g.shots.length, 5);
    g.shots.forEach((b, i) => {
      assert.equal(b.bossMotion?.kind, 'star');
      if (b.bossMotion?.kind !== 'star') throw Error('star');
      near(b.bossMotion.angle, (i / 5) * TAU);
      near(b.bossMotion.launchAt, 1.3 + i * 0.35);
      near(b.damage, e.damage * 0.85);
      assert.equal(b.radius, 12);
    });
    for (let i = 0; i < 3; i++) {
      e.skillStep = 3;
      g.castBossSkill(e, 0.6, 0.8);
    }
    assert.equal(g.shots.length, 10);
  });
  for (const phase of [4, 5]) {
    test(`第${arena + 1}关新招${phase}暂停及导出导入保留端点和运动，恢复后正常推进`, () => {
      const { g } = encounter(arena, phase);
      g.updateZones(0.3);
      g.pause();
      const raw = JSON.parse(JSON.stringify(g.snapshot()));
      for (const h of [Game.restore(g.save, raw), importSave(exportSave(g.save, g)).run]) {
        assert.ok(h);
        const expected = phase === 4 ? [] : g.zones;
        assert.deepEqual(h.zones, expected);
        h.update(1);
        assert.deepEqual(h.snapshot().zones, expected);
        h.resume();
        h.updateZones(1);
        h.updateZones(0.01);
        assert.ok(h.zones.every((z) => z.delay <= 0));
      }
      if (phase === 5) {
        raw.zones[0].vx = 91;
        assert.equal(Game.restore(g.save, raw), null);
      }
    });
    test(`第${arena + 1}关自动历练规避新招${phase}的预警与移动线段，不原地卡死`, () => {
      const { g } = encounter(arena, phase);
      const start = { ...g.player },
        hp = g.player.hp;
      for (let frame = 0; frame < 260; frame++) {
        if (frame % 6 === 0) g.input = autoplayInput(g);
        assert.ok(Number.isFinite(g.input.x) && Number.isFinite(g.input.y));
        g.update(0.02);
      }
      assert.equal(g.state, 'playing');
      assert.ok(Math.hypot(g.player.x - start.x, g.player.y - start.y) > 40);
      assert.equal(g.player.hp, hp);
    });
  }
}

test('仙尊借用星珠仍保留三星与原释放间隔，不随劫灵加强', () => {
  const { g } = encounter(6);
  g.zones = [];
  g.enemies = [];
  const e = g.spawnEnemy(10, false, true, { x: -240, y: 0 }, 6);
  e.skillStep = 6;
  g.random = () => 0.99;
  g.castBossSkill(e, 1, 0);
  assert.equal(g.shots.length, 3);
  g.shots.forEach((b, i) => {
    assert.equal(b.bossMotion?.kind, 'star');
    if (b.bossMotion?.kind === 'star') near(b.bossMotion.launchAt, 1.3 + i * 0.45);
  });
});

test('五星续局发射时间仍拒绝字符串、非有限值和不在新旧节奏中的数值', () => {
  const { g } = encounter(5, 3);
  for (const launchAt of ['1.3', null, NaN, Infinity, 1.4]) {
    const raw = g.snapshot();
    Object.assign(raw.shots[0].bossMotion!, { launchAt });
    assert.equal(Game.restore(g.save, raw), null);
  }
});
