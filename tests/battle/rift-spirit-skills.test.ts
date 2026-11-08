import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../src/battle/game.ts';
import { freshSave } from '../../src/core/progress.ts';
import { bossSkills } from '../../src/battle/boss-skills.ts';
import { STAGES, TAU } from '../../src/core/data.ts';
import {
  hazardDistance,
  regionalExposure,
  rotateZone,
  ENEMY_CONTROL,
} from '../../src/battle/regional-hazards.ts';
import { autoplayInput } from '../../src/battle/autoplay.ts';
import { exportSave, importSave } from '../../src/core/save-transfer.ts';

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
      '周天星轨',
      '雷网横移',
    ]);
  });
  test(`第${arena + 1}关周天星轨固定圆心，两线垂直起手，预警冻结后旋转半周`, () => {
    for (const roll of [0, 0.23, 0.5, 0.99]) {
      const { g, e } = encounter(arena, 4, () => roll);
      const center = { x: e.x, y: e.y },
        zones = [...g.zones];
      assert.equal(zones.length, 2);
      assert.equal(g.notice, '太虚劫灵 · 周天星轨 · 看箭头，随轨而行');
      const initial = structuredClone(zones);
      const toward = Math.atan2(g.player.y - e.y, g.player.x - e.x);
      near(Math.cos(zones[0].spinAngle! - toward), 0);
      near(zones[0].spinStart!, zones[0].spinAngle!);
      near(zones[1].spinAngle! - zones[0].spinAngle!, Math.PI);
      assert.ok(Math.min(...zones.map((z) => hazardDistance(z, g.player))) > 100);
      for (const z of zones) {
        assert.equal(z.kind, 'boss-sweep');
        assert.deepEqual(z.spinCenter, center);
        assert.equal(z.radius, 16);
        assert.equal(z.delay, 1);
        assert.equal(z.life, 3);
        assert.equal(z.damage, e.damage);
        assert.equal(z.color, STAGES[5].color);
        near(Math.abs(z.spinSpeed!), Math.PI / 3);
        near(Math.hypot(z.x - center.x, z.y - center.y), 75);
        near(Math.hypot(z.endX! - center.x, z.endY! - center.y), 900);
      }
      // 预警时站在线上也不受伤；圆心不跟随后续妖王移动。
      Object.assign(g.player, {
        x: (zones[0].x + zones[0].endX!) / 2,
        y: (zones[0].y + zones[0].endY!) / 2,
      });
      const hp = g.player.hp;
      e.x += 100;
      e.y -= 100;
      g.updateZones(0.5);
      g.updateZones(0.5);
      assert.deepEqual(
        zones,
        initial.map((z) => ({ ...z, delay: 0 })),
      );
      assert.equal(g.player.hp, hp);
      g.updateZones(3);
      zones.forEach((z, i) => {
        near(z.spinAngle! - initial[i].spinAngle!, z.spinSpeed! * 3);
        assert.deepEqual(z.spinCenter, center);
      });
      assert.equal(g.zones.length, 0);
    }
  });
  test(`第${arena + 1}关星轨逐帧扫中过静止玩家，绕过半秒tick且不附加控制`, () => {
    for (const roll of [0, 0.99]) {
      const { g } = encounter(arena, 4, () => roll);
      g.zones.forEach((z) => (z.tick = 999));
      let hits = 0;
      const hurt = g.hurtPlayer.bind(g);
      g.hurtPlayer = (...args) => {
        hits++;
        hurt(...args);
      };
      const hp = g.player.hp;
      for (let i = 0; i < 250; i++) g.update(1 / 60);
      assert.equal(hits, 1);
      assert.ok(g.player.hp < hp);
      assert.equal(g.immobilized, 0);
      assert.equal(g.slowed, 0);
      assert.equal(g.sealed, 0);
    }
  });
  test(`第${arena + 1}关星轨每区0.6秒命中冷却并遵守无敌帧`, () => {
    const { g } = encounter(arena);
    const z = g.zones[0];
    g.zones = [z];
    z.delay = 0;
    z.spinSpeed = 0;
    z.tick = 999;
    Object.assign(g.player, { x: (z.x + z.endX!) / 2, y: (z.y + z.endY!) / 2 });
    g.player.invincible = 1;
    const hp = g.player.hp;
    g.updateZones(0.01);
    assert.equal(g.player.hp, hp);
    g.player.invincible = 0;
    g.updateZones(0.6);
    assert.ok(g.player.hp < hp);
    const after = g.player.hp;
    for (let i = 0; i < 5; i++) {
      g.player.invincible = 0;
      g.updateZones(0.1);
    }
    g.updateZones(0.099);
    assert.equal(g.player.hp, after);
    g.updateZones(0.0011);
    assert.ok(g.player.hp < after);
  });
  test(`第${arena + 1}关星轨的75以内圆心安全区不被线段圆帽侵入，快照不含旋转字段`, () => {
    for (const radius of [0, 20, 50, 74.99]) {
      const { g, e } = encounter(arena);
      Object.assign(g.player, { x: e.x + radius, y: e.y });
      const hp = g.player.hp;
      for (let i = 0; i < 250; i++) g.updateZones(1 / 60);
      assert.equal(g.player.hp, hp);
    }
    const { g } = encounter(arena);
    assert.equal(g.snapshot().zones.length, 0);
    assert.doesNotMatch(
      JSON.stringify(g.snapshot()),
      /spinCenter|spinAngle|spinStart|spinSpeed|hitCooldown|boss-sweep/,
    );
  });
  test(`第${arena + 1}关75边界外星轨仍命中，内侧不免除劫灵接触伤害`, () => {
    const { g, e } = encounter(arena);
    const z = g.zones[0];
    z.delay = 0;
    z.spinSpeed = 0;
    Object.assign(g.player, {
      x: e.x + Math.cos(z.spinAngle!) * 75.01,
      y: e.y + Math.sin(z.spinAngle!) * 75.01,
    });
    const hp = g.player.hp;
    g.updateZones(0.01);
    assert.ok(g.player.hp < hp);
    const contact = encounter(arena);
    Object.assign(contact.g.player, { x: contact.e.x + 50, y: contact.e.y, invincible: 0 });
    const before = contact.g.player.hp;
    contact.g.updateEnemies(0.01);
    assert.ok(contact.g.player.hp < before);
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
      if (phase === 5) assert.equal(g.player.hp, hp);
      else assert.ok(g.player.hp > 0);
    });
  }
}

test('仙尊万劫归一改借最新周天星轨，保留双线、75内侧与原生参数', () => {
  const { g } = encounter(6);
  g.zones = [];
  g.enemies = [];
  const e = g.spawnEnemy(10, false, true, { x: -240, y: 0 }, 6);
  e.skillStep = 6;
  g.random = () => 0.99;
  g.castBossSkill(e, 1, 0);
  assert.equal(g.shots.length, 0);
  assert.equal(g.zones.length, 2);
  assert.equal(g.notice, '九天执劫仙尊 · 万劫归一 · 周天星轨');
  for (const z of g.zones) {
    assert.equal(z.kind, 'boss-sweep');
    assert.equal(z.spinInner, 75);
    assert.equal(z.spinOuter, 900);
    assert.equal(z.radius, 16);
    assert.equal(z.delay, 1);
    assert.equal(z.life, 3);
    assert.equal(z.damage, e.damage);
    near(Math.abs(z.spinSpeed!), Math.PI / 3);
  }
});

test('五星续局发射时间仍拒绝字符串、非有限值和不在新旧节奏中的数值', () => {
  const { g } = encounter(5, 3);
  for (const launchAt of ['1.3', null, NaN, Infinity, 1.4]) {
    const raw = g.snapshot();
    Object.assign(raw.shots[0].bossMotion!, { launchAt });
    assert.equal(Game.restore(g.save, raw), null);
  }
});

test('周天星轨按未来旋转逐帧预测，预警冻结与贴身安全区均按真实规则处理', () => {
  const { g } = encounter(5, 4, () => 0.99);
  const z = g.zones[0];
  const c = z.spinCenter!;
  const p = { x: c.x + 150, y: c.y };
  z.spinAngle = Math.PI / 2;
  z.delay = 0;
  rotateZone(z);
  assert.ok(hazardDistance(z, p) > 150 - 1e-7);
  assert.ok(regionalExposure(z, p, 0, 0, 180) > 0);
  assert.equal(regionalExposure(z, c, 0, 0, 180), 0);
  z.delay = 2;
  assert.equal(regionalExposure(z, p, 0, 0, 180), 0);
});

test('自动历练预警即靠近，旋转两向均动态避让，不被远处拾取拉回星轨或原地卡住', () => {
  for (const roll of [0, 0.99])
    for (const radius of [90, 180, 300, 450, 700]) {
      const { g } = encounter(5, 4, () => roll);
      const center = g.zones[0].spinCenter!;
      g.enemies = [];
      g.pickups = [{ x: center.x + 2000, y: center.y, kind: 'xp', value: 1, pull: false }];
      Object.assign(g.player, {
        x: center.x + radius,
        y: center.y,
        hp: 10000,
        maxHp: 10000,
        invincible: 0,
      });
      // 将实际施放的两条星轨旋至与当前落脚点垂直，保留真实的警示、旋向和伤害。
      for (const z of g.zones) {
        z.spinAngle = Math.PI / 2 + (z === g.zones[0] ? 0 : Math.PI);
        z.spinStart = z.spinAngle;
        z.x = center.x;
        z.y = center.y + Math.sin(z.spinAngle) * z.spinInner!;
        z.endX = center.x;
        z.endY = center.y + Math.sin(z.spinAngle) * 900;
      }
      assert.ok(
        autoplayInput(g).x * (radius > 500 ? 1 : -1) > 0,
        '预警时朝更近的安全路线移动，不被掉落拉偏',
      );
      let travelled = 0;
      const hp = g.player.hp;
      for (let t = 0; t < 4.05; t += 0.01) {
        if (Math.round(t * 100) % 12 === 0) g.input = autoplayInput(g);
        assert.ok(Number.isFinite(g.input.x + g.input.y));
        const step = g.stats.speed * 0.01;
        g.player.x += g.input.x * step;
        g.player.y += g.input.y * step;
        travelled += Math.hypot(g.input.x, g.input.y) * step;
        g.player.invincible = Math.max(0, g.player.invincible - 0.01);
        g.updateZones(0.01);
      }
      assert.ok(travelled > 50, '危险期间实际移动');
      assert.equal(g.player.hp, hp, `半径${radius}、旋向${roll}应能避开独立星轨`);
      assert.equal(g.zones.length, 0);
      assert.ok(Math.hypot(autoplayInput(g).x, autoplayInput(g).y) > 0.99, '星轨结束恢复正常拾取');
    }
});
