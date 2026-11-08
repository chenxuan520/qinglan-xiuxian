import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../src/battle/game.ts';
import { BOSS_MECHANICS, bossShotPose } from '../../src/battle/boss-mechanics.ts';
import { freshSave } from '../../src/core/progress.ts';
import type { Enemy } from '../../src/battle/game.ts';

function encounter(arena = 4) {
  const save = freshSave('heaven', ['metal'], 'dual', () => 0.5);
  save.unlocked = 6;
  save.completed = [0, 1, 2, 3, 4, 5];
  save.cultivation = 119940;
  const g = new Game(save, arena, 0, () => 0.4);
  g.time = 10;
  g.spawnBudget = -10000;
  g.nextElite = g.nextTrialBossAt = 99999;
  g.weapons[0].timer = 99999;
  const e = g.spawnEnemy(10, false, true, { x: -180, y: 0 }, 4);
  e.speed = 0;
  e.cooldown = e.pursuitCooldown = 99999;
  return { g, e };
}
function castMemory(c: ReturnType<typeof encounter>) {
  c.e.skillStep = 3;
  c.e.bossSkillQueue = [0, 1, 2, 4];
  c.g.castBossSkill(c.e, 1, 0);
  return c.g.shots.filter((b) => b.bossMotion?.kind === 'memory');
}
function lineTrail(length = 21) {
  return Array.from({ length }, (_, i) => ({ x: i * 10, y: 0, time: i * 0.15 }));
}
function advanceShots(g: Game, seconds: number) {
  for (let t = 0; t < seconds - 1e-9; t += 0.01) g.updateShots(Math.min(0.01, seconds - t));
}

test('五道魂影自最旧足迹起均匀浮现，蓄力0.8秒起每0.2秒错拍', () => {
  const c = encounter();
  c.g.playerTrail = lineTrail();
  Object.assign(c.g.player, { x: 300, y: 0 });
  const shots = castMemory(c);
  assert.equal(shots.length, 5);
  assert.deepEqual(
    shots.map((b) => b.bossMotion!.kind === 'memory' && b.bossMotion!.path[0].x),
    [0, 40, 80, 120, 160],
  );
  shots.forEach((b, i) => {
    if (b.bossMotion?.kind !== 'memory') throw Error('memory');
    assert.ok(Math.abs(b.bossMotion.warmup - (0.8 + i * 0.2)) < 1e-9);
  });
});

test('蓄力期间原地不动、不伤人；扑出瞬间锁定当时位置，之后不再追踪', () => {
  const c = encounter();
  c.g.playerTrail = lineTrail();
  Object.assign(c.g.player, { x: 300, y: 0, invincible: 0 });
  const [first] = castMemory(c);
  c.g.shots = [first];
  const hp = c.g.player.hp;
  advanceShots(c.g, 0.5);
  assert.equal(first.x, 0);
  assert.equal(first.y, 0);
  assert.equal(c.g.player.hp, hp);
  advanceShots(c.g, 0.31);
  if (first.bossMotion?.kind !== 'memory') throw Error('memory');
  assert.equal(first.bossMotion.locked, true);
  assert.deepEqual(first.bossMotion.path[1], { x: 300, y: 0 });
  assert.deepEqual(first.bossMotion.path[2], { x: 460, y: 0 });
  const locked = structuredClone(first.bossMotion.path);
  Object.assign(c.g.player, { x: 300, y: 200 });
  advanceShots(c.g, 0.2);
  assert.deepEqual(first.bossMotion.path, locked);
  const pose = bossShotPose(first, first.age);
  assert.ok(Math.abs(Math.hypot(pose.vx, pose.vy) - 320) < 1e-6);
});

test('扑出后冲过锁定点160像素即消失，站定会命中、锁定时侧移可避开', () => {
  const hit = encounter();
  hit.g.playerTrail = [{ x: 0, y: 0, time: 0 }];
  Object.assign(hit.g.player, { x: 300, y: 0, invincible: 0 });
  const [shot] = castMemory(hit);
  hit.g.shots = [shot];
  advanceShots(hit.g, 0.81);
  const hp = hit.g.player.hp;
  advanceShots(hit.g, 10);
  assert.equal(hit.g.player.hp < hp, true);
  assert.equal(hit.g.shots.length, 0);

  const dodge = encounter();
  dodge.g.playerTrail = [{ x: 0, y: 0, time: 0 }];
  Object.assign(dodge.g.player, { x: 300, y: 0, invincible: 0 });
  const [avoid] = castMemory(dodge);
  dodge.g.shots = [avoid];
  advanceShots(dodge.g, 0.81);
  Object.assign(dodge.g.player, { x: 300, y: 80 });
  const safeHp = dodge.g.player.hp;
  advanceShots(dodge.g, 3);
  assert.equal(dodge.g.player.hp, safeHp);
});

test('足迹不足两点时改用冥主到修士的连线，快照保留锁定状态与路径', () => {
  const c = encounter();
  c.g.playerTrail = [];
  Object.assign(c.g.player, { x: 300, y: 0 });
  const shots = castMemory(c);
  assert.equal(shots.length, 5);
  for (const b of shots) {
    if (b.bossMotion?.kind !== 'memory') throw Error('memory');
    assert.equal(b.bossMotion.path.length, 2);
    assert.ok(Number.isFinite(b.bossMotion.path[0].x));
  }
  c.g.shots = [shots[1]];
  advanceShots(c.g, shots[1].bossMotion!.kind === 'memory' ? shots[1].bossMotion!.warmup : 1);
  const raw = JSON.parse(JSON.stringify(c.g.snapshot()));
  const restored = Game.restore(c.g.save, raw);
  assert.ok(restored);
  const restoredShot = restored.shots.find((b) => b.bossMotion?.kind === 'memory')!;
  assert.equal(restoredShot.bossMotion!.kind === 'memory' && restoredShot.bossMotion!.locked, true);
  assert.deepEqual(restoredShot.bossMotion, c.g.shots[0].bossMotion);
});

test('旧格式逆行魂影在续局时被丢弃，坏坐标仍拒绝整份存档', () => {
  const c = encounter();
  c.g.playerTrail = lineTrail();
  Object.assign(c.g.player, { x: 300, y: 0 });
  const [shot] = castMemory(c);
  c.g.shots = [shot];
  const raw = JSON.parse(JSON.stringify(c.g.snapshot()));
  for (const warmup of [1, 1.35, 1.7, 2.05, 2.4]) {
    const legacy = structuredClone(raw);
    legacy.shots[0].bossMotion = {
      kind: 'memory',
      path: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 200, y: 0 },
      ],
      warmup,
    };
    const restored = Game.restore(c.g.save, legacy);
    assert.ok(restored, `旧蓄力 ${warmup}`);
    assert.equal(restored.shots.filter((b) => b.bossMotion?.kind === 'memory').length, 0);
  }
  const bad = structuredClone(raw);
  bad.shots[0].bossMotion.path[0].x = Number.NaN;
  assert.equal(Game.restore(c.g.save, bad), null);
});

test('幽影换形幻影气血为冥主最大气血的3%，至少1点', () => {
  const c = encounter();
  c.e.skillStep = 4;
  c.e.bossSkillQueue = [0, 1, 2, 3];
  c.g.castBossSkill(c.e, 1, 0);
  const illusions = c.g.enemies.filter((e) => e.illusionOf === c.e.id);
  assert.equal(illusions.length, 3);
  const expected = Math.max(1, Math.round(c.e.maxHp * 0.03));
  for (const illusion of illusions as Enemy[]) {
    assert.equal(illusion.maxHp, expected);
    assert.equal(illusion.hp, expected);
  }
  assert.ok(expected > 1);
  assert.equal(BOSS_MECHANICS.memoryWarmup, 0.8);
  const [first] = illusions as Enemy[];
  const totals = [c.g.kills, c.g.xp, c.g.combatCultivation, c.g.iron, c.g.pickups.length];
  c.g.hitEnemy(first, first.hp / 2);
  assert.equal(first.dead, false);
  assert.ok(Math.abs(first.hp - expected / 2) < 1);
  c.g.hitEnemy(first, first.hp);
  assert.equal(first.dead, true);
  assert.deepEqual(
    [c.g.kills, c.g.xp, c.g.combatCultivation, c.g.iron, c.g.pickups.length],
    totals,
  );
});
