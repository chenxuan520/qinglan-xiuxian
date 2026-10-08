import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { STAGES, enemyRoster } from '../src/data.ts';
import { freshSave, SAVE_SCHEMA } from '../src/progress.ts';
import { useMedicine } from '../src/medicine.ts';
import { autoplayInput } from '../src/autoplay.ts';
import { BOSS_FIELDS, drawBossField, drawBossShot } from '../src/boss-effects.ts';

function encounter(stage: number, arena = stage, medicine = false) {
  const save = freshSave('heaven');
  save.unlocked = 6;
  if (medicine) {
    save.medicine.bag.qingling = 1;
    assert.ok(useMedicine(save, 'qingling').ok);
  }
  const g = new Game(save, arena, 0, () => 0.5);
  g.weapons[0].timer = 9999;
  g.bossSpawned = true;
  g.spawnBudget = -10000;
  g.nextElite = 99999;
  const e = g.spawnEnemy(10, false, true, { x: -240, y: 0 }, stage);
  e.speed = 0;
  e.cooldown = e.pursuitCooldown = 999;
  return { g, e };
}

test('七王所有招式在本关和终关保留自身主题，半血加快施法且警示不缩短', () => {
  for (let stage = 0; stage < 7; stage++)
    for (const arena of new Set([stage, 6]))
      for (let phase = 0; phase < STAGES[stage].skills.length; phase++) {
        const { g, e } = encounter(stage, arena);
        e.skillStep = phase;
        g.castBossSkill(e, 1, 0);
        const first = e.cooldown;
        for (const z of g.zones) {
          assert.equal(z.kind, `boss-${BOSS_FIELDS[stage]}`);
          assert.ok(z.delay >= 1.2);
        }
        for (const s of g.shots) assert.equal(s.bossStage, stage);
        e.skillStep = phase;
        e.hp = e.maxHp * 0.4;
        e.cooldown = 0;
        g.castBossSkill(e, 1, 0);
        // 冲刺保持完整预警与运动时长，不能被半血加速截短。
        if (!((stage === 2 && phase === 0) || (stage === 6 && phase === 5)))
          assert.ok(e.cooldown < first);
        for (const z of g.zones) assert.ok(z.delay >= 1.2);
      }
});

test('狐火垂直封路、冰牙分层推进、毒池留出逃生方向、交错雷阵分批落地', () => {
  const fire = encounter(1);
  fire.e.skillStep = 1;
  fire.g.castBossSkill(fire.e, 0.6, 0.8);
  for (const z of fire.g.zones) assert.ok(Math.abs(z.x * 0.6 + z.y * 0.8) < 1e-8);
  assert.deepEqual([...new Set(fire.g.zones.map((z) => z.delay))].sort(), [1.2, 1.38, 1.56]);
  const ice = encounter(2);
  ice.e.skillStep = 1;
  ice.g.castBossSkill(ice.e, 1, 0);
  ice.g.updateShots(0.5);
  assert.deepEqual(
    [...new Set(ice.g.shots.map((s) => Math.round(Math.hypot(s.vx, s.vy))))].sort((a, b) => a - b),
    [130, 180, 240],
  );
  assert.ok(ice.g.shots.every((s) => s.age === 0.5));
  const poison = encounter(3);
  poison.g.castBossSkill(poison.e, 1, 0);
  assert.equal(poison.g.zones.filter((z) => z.x === 0 && z.y === 0).length, 1);
  assert.ok(poison.g.zones.every((z) => Math.hypot(z.x, z.y - 150) > z.radius + 12));
  const rift = encounter(5);
  rift.g.castBossSkill(rift.e, 1, 0);
  assert.ok(rift.g.zones.filter((z) => z.y === 0).every((z) => z.delay === 1.2));
  assert.ok(rift.g.zones.filter((z) => z.y !== 0).every((z) => z.delay === 1.65));
});

test('幽魂先转弯再直飞，暂停与续局保留弹幕轨迹；旧弹不追加主题', () => {
  const { g, e } = encounter(4);
  e.skillStep = 1;
  g.castBossSkill(e, 1, 0);
  g.updateShots(0.4);
  g.pause();
  const before = g.snapshot();
  g.update(0.3);
  assert.deepEqual(g.snapshot().shots, before.shots);
  const restored = Game.restore(g.save, JSON.parse(JSON.stringify(before)))!;
  assert.ok(restored);
  g.updateShots(0.4);
  restored.updateShots(0.4);
  assert.deepEqual(restored.shots, g.shots);
  const speed = Math.hypot(g.shots[0].vx, g.shots[0].vy);
  assert.ok(Math.abs(speed - 165) < 1e-8);
  g.updateShots(0.5);
  const velocity = [g.shots[0].vx, g.shots[0].vy];
  g.updateShots(0.3);
  assert.deepEqual([g.shots[0].vx, g.shots[0].vy], velocity);
  for (const s of before.shots) delete s.bossStage;
  assert.ok(Game.restore(g.save, before)!.shots.every((s) => s.bossStage === undefined));
  assert.ok(SAVE_SCHEMA >= 6);
  for (const invalid of [-1, 7, 0.5, '2', null]) {
    before.shots[0].bossStage = invalid;
    assert.equal(Game.restore(g.save, before), null);
  }
});

test('木阵冰牢只在落地后减速，毒君的池与毒矢受解毒丹减伤，残圈不再伤人', () => {
  for (const stage of [0, 2, 3]) {
    const { g, e } = encounter(stage, stage, stage === 3);
    e.skillStep = stage === 2 ? 2 : 0;
    g.castBossSkill(e, 1, 0);
    const z = g.zones[0];
    Object.assign(g.player, { x: z.x, y: z.y, hp: 1e6, maxHp: 1e6 });
    const hp = g.player.hp;
    g.updateZones(0.5);
    assert.equal(g.player.hp, hp);
    assert.equal(g.slowed, 0);
    z.delay = 0;
    g.updateZones(0.01);
    if (stage === 3) assert.ok(Math.abs(hp - g.player.hp - e.damage * 0.8) < 1e-8);
    else assert.equal(g.slowed, 0.55);
    g.player.invincible = 0;
    z.life = 0.001;
    z.tick = 0;
    const after = g.player.hp;
    g.zones = [z];
    g.updateZones(0.01);
    assert.equal(g.player.hp, after);
    if (stage === 3) {
      e.skillStep = 1;
      g.castBossSkill(e, 1, 0);
      const s = g.shots[0];
      Object.assign(g.player, { x: s.x, y: s.y });
      s.vx = s.vy = 0;
      g.shots = [s];
      g.updateShots(0.01);
      assert.ok(Math.abs(after - g.player.hp - s.damage * 0.8) < 1e-8);
    }
  }
});

test('自动走位能逃出三种脚下地面招式，站着不动会受到伤害', () => {
  for (const [stage, phase] of [
    [1, 1],
    [3, 0],
    [5, 0],
  ])
    for (const moving of [false, true]) {
      const { g, e } = encounter(stage);
      e.x = -1000;
      e.skillStep = phase;
      g.castBossSkill(e, 1, 0);
      e.cooldown = 999;
      const hp = g.player.hp;
      for (let frame = 0; frame < 110; frame++) {
        if (moving && frame % 4 === 0) g.input = autoplayInput(g);
        g.update(0.02);
      }
      assert.equal(g.player.hp < hp, !moving, `stage=${stage}, moving=${moving}`);
    }
});

test('终关返回妖王召唤各自地域妖物，数量受同屏上限约束', () => {
  for (const [stage, phase, count] of [
    [0, 2, 3],
    [3, 2, 4],
    [4, 0, 4],
  ]) {
    const { g, e } = encounter(stage, 6);
    e.skillStep = phase;
    g.castBossSkill(e, 1, 0);
    const summons = g.enemies.filter((e) => !e.boss);
    assert.equal(summons.length, count);
    assert.ok(
      summons.every((e) => enemyRoster(stage, STAGES[stage].minutes * 60).includes(e.type)),
    );
    while (g.enemies.length < 210) g.spawnEnemy(0, false, false, { x: 900, y: 0 });
    e.skillStep = phase;
    g.castBossSkill(e, 1, 0);
    assert.equal(g.enemies.length, 210);
  }
});

test('七种妖王特效在预警、激活、减少动态和读档数据下均绘制有限坐标并平衡画布状态', () => {
  for (let stage = 0; stage < 7; stage++) {
    const calls: string[] = [];
    let saves = 0;
    const ctx = new Proxy({} as CanvasRenderingContext2D, {
      get:
        (_, method: string) =>
        (...args: unknown[]) => {
          assert.ok(
            args.every((a) => typeof a !== 'number' || Number.isFinite(a)),
            method,
          );
          if (method === 'save') saves++;
          if (method === 'restore') saves--;
          assert.ok(saves >= 0);
          calls.push(method);
        },
    });
    const { g, e } = encounter(stage);
    for (let phase = 0; phase < STAGES[stage].skills.length; phase++) {
      e.skillStep = phase;
      g.castBossSkill(e, 1, 0);
    }
    for (const reduced of [false, true])
      for (const z of g.zones) {
        assert.ok(drawBossField(ctx, z, 100, reduced));
        assert.ok(drawBossField(ctx, { ...z, delay: 0 }, 100, reduced));
        assert.equal(saves, 0);
      }
    for (const s of g.shots) drawBossShot(ctx, s);
    assert.ok(calls.includes('fill') && calls.includes('stroke'));
    assert.equal(saves, 0);
  }
});
