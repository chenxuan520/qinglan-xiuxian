import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../src/battle/game.ts';
import { freshSave, realmDamageMultiplier } from '../../src/core/progress.ts';
import {
  BOSS_COMBAT,
  DIFFICULTIES,
  STAGE_COMBAT_SCALING,
  STAGE_REALM_STEPS,
  TAU,
  type Enemy,
} from '../../src/core/data.ts';
import { bossSkills } from '../../src/battle/boss-skills.ts';
import { BOSS_MECHANICS as R, SOVEREIGN_GOLD } from '../../src/battle/boss-mechanics.ts';
import { drawBossSummon } from '../../src/battle/boss-mechanics-render.ts';

const near = (actual: number, expected: number, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

function trial(arena = 6) {
  const save = freshSave('heaven', ['metal'], 'dual', () => 0.5);
  Object.assign(save, {
    unlocked: 6,
    completed: [0, 1, 2, 3, 4, 5],
    cultivation: 119940,
  });
  const g = new Game(save, arena, 0, () => 0.5);
  g.time = 400;
  g.trialBossesSpawned = 7;
  g.trialBossesDefeated = 6;
  g.nextTrialBossAt = g.nextElite = 99999;
  g.bossSpawned = true;
  g.spawnBudget = -10000;
  g.weapons[0].timer = 99999;
  g.player.invincible = 99999;
  const e = g.spawnEnemy(10, false, true, { x: -300, y: 0 }, arena === 6 ? 6 : 2);
  e.speed = 0;
  e.cooldown = e.pursuitCooldown = 99999;
  return { g, e };
}
function cast(c: ReturnType<typeof trial>, phase: number) {
  const { g, e } = c;
  e.skillStep = phase;
  e.bossSkillQueue = bossSkills(e.bossStage!, g.isFinalTrial)
    .map((_, i) => i)
    .filter((i) => i !== phase);
  g.castBossSkill(e, 1, 0);
  e.cooldown = e.pursuitCooldown = 99999;
}
function advance(g: Game, seconds: number) {
  for (let t = 0; t < seconds - 1e-9; t += 0.01) g.update(Math.min(0.01, seconds - t));
}
const soldiers = (g: Game) => g.enemies.filter((e) => !e.dead && e.bossSummon?.slot !== undefined);

test('终关仙尊气血为原值的 1.5 倍，其他旧王与倍率表前六项不变', () => {
  assert.deepEqual(BOSS_COMBAT.trialKingHp, [1, 1, 1.3, 1.4, 1.25, 1.25, 1.5]);
  assert.equal(R.soldierHp, 0.02);
  const { e } = trial();
  const base =
    560000 *
    DIFFICULTIES[0].hp *
    BOSS_COMBAT.trialHp *
    STAGE_COMBAT_SCALING[6].hp *
    realmDamageMultiplier(STAGE_REALM_STEPS[6]);
  near(e.maxHp, base * 1.5, 1e-3);
});

test('金阙天兵召出六名阵位天兵，属性与颜色按仙尊换算', () => {
  const c = trial();
  cast(c, 4);
  const list = soldiers(c.g);
  assert.equal(list.length, R.soldierCount);
  assert.deepEqual(
    list.map((e) => e.bossSummon!.slot).sort((a, b) => a! - b!),
    [0, 1, 2, 3, 4, 5],
  );
  for (const soldier of list) {
    assert.equal(soldier.bossSummon!.kind, 'wolf');
    assert.equal(soldier.bossSummon!.color, SOVEREIGN_GOLD);
    near(soldier.maxHp, c.e.maxHp * R.soldierHp, 1e-6);
    assert.equal(soldier.hp, soldier.maxHp);
    near(soldier.damage, c.e.damage * R.soldierDamage, 1e-6);
    assert.ok(soldier.speed >= 210);
    assert.equal(soldier.elite, true);
  }
  assert.equal(c.g.notice, '九天执劫仙尊 · 金阙天兵');
});

test('六名天兵在修士周围 190 像素等分站位，同一帧开始扑击', () => {
  const c = trial();
  cast(c, 4);
  advance(c.g, R.wolfFlank - 0.01);
  const list = soldiers(c.g);
  const angles = list
    .map((e) => {
      const distance = Math.hypot(e.x - c.g.player.x, e.y - c.g.player.y);
      assert.ok(Math.abs(distance - R.soldierRing) <= 10, `${distance}`);
      return Math.atan2(e.y - c.g.player.y, e.x - c.g.player.x);
    })
    .sort((a, b) => a - b);
  for (let i = 1; i < angles.length; i++) {
    let gap = angles[i] - angles[i - 1];
    if (gap > Math.PI) gap = TAU - gap;
    near(gap, TAU / R.soldierCount, 0.12);
  }
  advance(c.g, 0.03);
  const charging = soldiers(c.g).map((e) => e.charge);
  assert.equal(charging.length, R.soldierCount);
  assert.ok(charging.every((charge) => charge > 0));
  assert.ok(Math.max(...charging) - Math.min(...charging) < 1e-9);
});

test('已有存活天兵时只补空缺阵位，总数不超过六名', () => {
  const c = trial();
  cast(c, 4);
  const first = soldiers(c.g);
  first[1].dead = true;
  first[4].dead = true;
  cast(c, 4);
  const list = soldiers(c.g);
  assert.equal(list.length, R.soldierCount);
  assert.deepEqual(
    list.map((e) => e.bossSummon!.slot).sort((a, b) => a! - b!),
    [0, 1, 2, 3, 4, 5],
  );
});

test('仙尊倒下后天兵消失，超过六秒仍常驻并继续冲杀', () => {
  const owner = trial();
  cast(owner, 4);
  owner.e.dead = true;
  owner.g.update(0.01);
  assert.equal(soldiers(owner.g).length, 0);

  const enduring = trial();
  cast(enduring, 4);
  advance(enduring.g, R.wolfLife + 0.5);
  assert.equal(soldiers(enduring.g).length, R.soldierCount);
  const before = soldiers(enduring.g).map((e) => e.bossSummon!.age);
  advance(enduring.g, 2);
  assert.equal(soldiers(enduring.g).length, R.soldierCount);
  assert.ok(soldiers(enduring.g).every((e) => e.bossSummon!.age > 0));
  assert.ok(soldiers(enduring.g).every((e, i) => e.bossSummon!.age > before[i]));
});

test('天兵阵位、round 与颜色可续局；非法 slot 被存档校验拒绝', () => {
  const c = trial();
  cast(c, 4);
  advance(c.g, 0.6);
  const raw = JSON.parse(JSON.stringify(c.g.snapshot()));
  const restored = Game.restore(c.g.save, raw)!;
  assert.ok(restored);
  restored.resume();
  restored.player.invincible = 99999;
  assert.deepEqual(
    restored.enemies
      .filter((e) => e.bossSummon?.slot !== undefined)
      .map((e) => e.bossSummon!.slot)
      .sort((a, b) => a! - b!),
    [0, 1, 2, 3, 4, 5],
  );
  for (const soldier of restored.enemies.filter((e) => e.bossSummon?.slot !== undefined))
    assert.equal(soldier.bossSummon!.color, SOVEREIGN_GOLD);

  for (const slot of [6, -1, 0.5]) {
    const bad = JSON.parse(JSON.stringify(raw));
    const target = bad.enemies.find(
      (e: { bossSummon?: { slot?: number } }) => e.bossSummon?.slot === 0,
    );
    target.bossSummon.slot = slot;
    assert.equal(Game.restore(c.g.save, bad), null, `slot ${slot}`);
  }
  const heart = JSON.parse(JSON.stringify(raw));
  const target = heart.enemies.find(
    (e: { bossSummon?: { slot?: number } }) => e.bossSummon?.slot === 0,
  );
  target.bossSummon.kind = 'heart';
  delete target.bossSummon.round;
  assert.equal(Game.restore(c.g.save, heart), null, 'heart 带 slot');
});

test('天兵进入蓄力首帧锁定方向，蓄力期间修士移动也不改；双狼仍逐帧追瞄', () => {
  const c = trial();
  cast(c, 4);
  advance(c.g, R.wolfFlank - 0.01);
  c.g.player.x = 100;
  c.g.player.y = 50;
  advance(c.g, 0.02);
  const first = soldiers(c.g)[0];
  const locked = { x: first.dx, y: first.dy };
  const aim = Math.atan2(50 - first.y, 100 - first.x);
  near(Math.atan2(locked.y, locked.x), aim, 1e-6);
  c.g.player.x = -900;
  c.g.player.y = -400;
  advance(c.g, 0.2);
  assert.deepEqual({ x: first.dx, y: first.dy }, locked);

  const wolves = trial(2);
  cast(wolves, 3);
  advance(wolves.g, R.wolfFlank + 0.05);
  const wolf = wolves.g.enemies.find(
    (e) => e.bossSummon?.kind === 'wolf' && e.bossSummon.slot === undefined,
  )!;
  const before = { x: wolf.dx, y: wolf.dy };
  wolves.g.player.x = 900;
  wolves.g.player.y = 300;
  advance(wolves.g, 0.15);
  assert.notDeepEqual({ x: wolf.dx, y: wolf.dy }, before);
  const desired = Math.atan2(wolves.g.player.y - wolf.y, wolves.g.player.x - wolf.x);
  near(Math.atan2(wolf.dy, wolf.dx), desired, 0.2);
});

test('修士沿相邻天兵中缝以 160 移速跑出，整轮不被扑中', () => {
  const c = trial();
  cast(c, 4);
  advance(c.g, R.wolfFlank - 0.01);
  c.g.player.invincible = 0;
  c.g.player.hp = c.g.player.maxHp = 1e9;
  const angle = Math.PI / 6;
  c.g.input = { x: Math.cos(angle), y: Math.sin(angle) };
  advance(c.g, R.wolfWindup + R.wolfDash + 0.1);
  assert.equal(c.g.player.hp, 1e9);
});

test('天兵 age 超过六秒仍可续局，蓄力中途恢复后方向不变', () => {
  const c = trial();
  cast(c, 4);
  advance(c.g, R.wolfLife + 0.5);
  c.g.player.invincible = 99999;
  const raw = JSON.parse(JSON.stringify(c.g.snapshot()));
  const restored = Game.restore(c.g.save, raw)!;
  assert.ok(restored);
  assert.equal(soldiers(restored).length, R.soldierCount);
  const aged = JSON.parse(JSON.stringify(raw));
  const target = aged.enemies.find(
    (e: { bossSummon?: { slot?: number } }) => e.bossSummon?.slot === 0,
  );
  target.bossSummon.age = 7.5;
  assert.ok(Game.restore(c.g.save, aged));

  const charging = trial();
  cast(charging, 4);
  advance(charging.g, R.wolfFlank + 0.1);
  const soldier = soldiers(charging.g)[0];
  const locked = { x: soldier.dx, y: soldier.dy };
  const resume = Game.restore(charging.g.save, JSON.parse(JSON.stringify(charging.g.snapshot())))!;
  resume.resume();
  resume.player.invincible = 99999;
  resume.player.x = 800;
  const again = soldiers(resume).find((e) => e.bossSummon!.slot === 0)!;
  advance(resume, 0.1);
  assert.deepEqual({ x: again.dx, y: again.dy }, locked);
});

test('天兵蓄力时画金色冲程虚线与天兵标签，双狼仍是猎', () => {
  const calls: string[] = [];
  const context = {
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    fill() {},
    closePath() {},
    arc() {},
    fillText(text: string) {
      calls.push(`text:${text}`);
    },
    strokeText(text: string) {
      calls.push(`stroke:${text}`);
    },
    setLineDash(dash: number[]) {
      calls.push(`dash:${dash.join(',')}`);
    },
    set fillStyle(_v: string) {},
    set strokeStyle(_v: string) {},
    set lineWidth(_v: number) {},
    set globalAlpha(_v: number) {},
    set font(_v: string) {},
    set textAlign(_v: string) {},
  } as unknown as CanvasRenderingContext2D;
  const c = trial();
  cast(c, 4);
  advance(c.g, R.wolfFlank + 0.05);
  drawBossSummon(context, soldiers(c.g)[0]);
  assert.ok(calls.includes('text:天兵'));
  assert.ok(calls.includes('stroke:天兵'));
  assert.ok(calls.includes('dash:10,8'));
  calls.length = 0;
  const wolves = trial(2);
  cast(wolves, 3);
  drawBossSummon(context, wolves.g.enemies.find((e) => e.bossSummon?.kind === 'wolf')!);
  assert.ok(calls.includes('text:猎'));
  assert.ok(!calls.includes('dash:10,8'));
});

test('天兵存活时万劫归一借双狼仍生成两只狼，不占狼的数量上限', () => {
  const c = trial();
  cast(c, 4);
  assert.equal(soldiers(c.g).length, R.soldierCount);
  cast(c, 6);
  c.g.random = () => (2 + 0.5) / 6;
  c.e.hp = c.e.maxHp;
  c.e.skillStep = 6;
  c.e.bossSkillQueue = bossSkills(6, true)
    .map((_, i) => i)
    .filter((i) => i !== 6);
  c.g.castBossSkill(c.e, 1, 0);
  const wolves = c.g.enemies.filter(
    (e) => !e.dead && e.bossSummon?.kind === 'wolf' && e.bossSummon.slot === undefined,
  );
  assert.equal(wolves.length, 2);
  assert.equal(soldiers(c.g).length, R.soldierCount);
});

test('双狼合猎未设置阵位，仍按原左右绕位目标行动', () => {
  const c = trial(2);
  cast(c, 3);
  const wolves = (c.g.enemies as Enemy[]).filter((e) => e.bossSummon?.kind === 'wolf');
  assert.equal(wolves.length, 2);
  assert.ok(wolves.every((e) => e.bossSummon!.slot === undefined));
  advance(c.g, R.wolfFlank - 0.01);
  for (const wolf of wolves) {
    assert.ok(Math.abs(wolf.x - c.g.player.x) <= 220);
    assert.ok(Math.abs(wolf.y - c.g.player.y) <= 220);
  }
});
