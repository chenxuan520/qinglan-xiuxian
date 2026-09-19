import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { DIFFICULTIES, ENEMIES, STAGES, STAGE_ENEMIES } from '../src/data.ts';
import { freshSave } from '../src/progress.ts';

test('前六境各阶段刷新量增加25%，妖王阶段比例与同屏上限保留', () => {
  for (let stage = 0; stage < 6; stage++) {
    for (const progress of [0, 0.5, 1]) {
      for (const bossSpawned of [false, true]) {
        const g = new Game(freshSave(), stage, 0, () => 0.5);
        g.weapons = [];
        g.nextElite = 9999;
        g.time = STAGES[stage].minutes * 60 * progress;
        g.bossSpawned = bossSpawned;
        g.update(0.01);
        const actualProgress = Math.min(1, g.time / (STAGES[stage].minutes * 60));
        const oldRate =
          0.85 +
          stage * 0.12 +
          (STAGES[stage].minutes * 60 * 0.017 + stage * 0.18 + 0.45) * actualProgress ** 1.3;
        assert.ok(
          Math.abs(g.spawnBudget / 0.01 - oldRate * 0.9 * (bossSpawned ? 0.32 : 1) * 1.25) < 1e-8,
        );
      }
    }
    const full = new Game(freshSave(), stage, 0, () => 0.5);
    full.weapons = [];
    for (let i = 0; i < 240; i++)
      full.spawnEnemy(STAGE_ENEMIES[stage][0], false, false, { x: 400, y: 0 });
    full.spawnBudget = 10;
    full.update(0.01);
    assert.equal(full.enemies.length, 240);
  }
});

test('前六境普通怪伤害增加30%，精英为旧版2.2倍，碰撞按减伤后实际扣血', () => {
  for (let stage = 0; stage < 6; stage++) {
    for (let difficulty = 0; difficulty < 3; difficulty++) {
      for (const elite of [false, true]) {
        const g = new Game(freshSave(), stage, difficulty, () => 0.5);
        g.weapons = [];
        g.time = STAGES[stage].minutes * 30;
        g.nextElite = 9999;
        g.passives.guard = 3;
        const type = STAGE_ENEMIES[stage][0];
        const e = g.spawnEnemy(type, elite, false, { x: 0, y: 0 });
        const expected =
          ENEMIES[type].damage *
          (1 + stage * 0.12) *
          1.175 *
          DIFFICULTIES[difficulty].damage *
          (elite ? 2.2 : 1.3);
        assert.ok(Math.abs(e.damage - expected) < 1e-8);
        const before = g.player.hp;
        g.update(0.01);
        assert.ok(Math.abs(before - g.player.hp - expected * g.stats.armor) < 1e-8);
      }
    }
  }
});

test('前六妖王伤害随关卡递增，弹幕和预警落地技能均继承强化', () => {
  const damage = [52, 68, 84, 100, 116, 132];
  for (let stage = 0; stage < 6; stage++) {
    for (let difficulty = 0; difficulty < 3; difficulty++) {
      const save = freshSave();
      save.training.vitality = 20;
      const g = new Game(save, stage, difficulty, () => 0.5);
      g.weapons = [];
      const boss = g.spawnEnemy(10, false, true, { x: 300, y: 0 });
      const expected = damage[stage] * DIFFICULTIES[difficulty].damage;
      assert.equal(boss.damage, expected);
      boss.skillStep = stage === 1 ? 0 : 1;
      boss.cooldown = 0;
      g.update(0.01);
      assert.ok(g.shots.length > 0);
      assert.ok(g.shots.every((shot) => shot.damage === expected * 0.75));
      g.shots = [g.shots[0]];
      Object.assign(g.shots[0], { x: 0, y: 0, vx: 0, vy: 0 });
      const before = g.player.hp;
      g.update(0.01);
      assert.ok(Math.abs(before - g.player.hp - expected * 0.75) < 1e-8);
      g.shots = [];
      boss.skillStep = stage === 1 ? 1 : stage === 2 || stage === 4 ? 2 : 0;
      boss.cooldown = 0;
      g.update(0.01);
      assert.ok(g.zones.length > 0);
      assert.ok(g.zones.every((zone) => zone.damage === expected));
    }
  }
});

test('第七境精英与七位妖王保持原伤害，续局不会再乘前六境倍率', () => {
  for (let difficulty = 0; difficulty < 3; difficulty++) {
    for (const progress of [0, 0.5, 1]) {
      const save = freshSave();
      save.unlocked = 6;
      const g = new Game(save, 6, difficulty, () => 0.5);
      g.time = progress * 600;
      for (const type of STAGE_ENEMIES[6]) {
        const e = g.spawnEnemy(type);
        const expected =
          ENEMIES[type].damage * 1.72 * (1.1 + progress * 0.9) * DIFFICULTIES[difficulty].damage;
        assert.ok(e.elite);
        assert.ok(Math.abs(e.damage - expected) < 1e-8);
      }
      for (let stage = 0; stage < 7; stage++) {
        const boss = g.spawnEnemy(10, false, true, undefined, stage);
        assert.equal(
          boss.damage,
          (stage === 6 ? 220 : 85 + stage * 10) * DIFFICULTIES[difficulty].damage,
        );
      }
      const restored = Game.restore(g.save, g.snapshot())!;
      assert.deepEqual(
        restored.enemies.map((e) => e.damage),
        g.enemies.map((e) => e.damage),
      );
    }
  }
});
