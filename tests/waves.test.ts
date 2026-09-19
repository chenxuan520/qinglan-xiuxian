import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { STAGES, STAGE_ENEMIES, ENEMIES, DIFFICULTIES, enemyRoster } from '../src/data.ts';
import { freshSave } from '../src/progress.ts';

function seeded(seed = 81) {
  return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
}

test('前六境四批渐进，终关四十五秒、九十秒、两分半解锁后续三批', () => {
  for (let stage = 0; stage < STAGES.length; stage++) {
    const duration = STAGES[stage].minutes * 60;
    for (let batch = 1; batch <= 3; batch++) {
      const boundary = stage === 6 ? [0, 45, 90, 150][batch] : (duration * batch) / 4;
      assert.equal(enemyRoster(stage, boundary - 0.01).length, batch * 3);
      assert.equal(enemyRoster(stage, boundary).length, (batch + 1) * 3);
    }
    assert.deepEqual(enemyRoster(stage, duration * 3), STAGE_ENEMIES[stage]);
    const meanXp = (start: number) =>
      STAGE_ENEMIES[stage].slice(start, start + 3).reduce((sum, id) => sum + ENEMIES[id].xp, 0) / 3;
    for (let batch = 1; batch < 4; batch++) assert.ok(meanXp(batch * 3) > meanXp((batch - 1) * 3));
  }
});

test('新一批强敌成为刷怪主体，早期兵种保留少量且没有提前刷出', () => {
  for (let stage = 0; stage < STAGES.length; stage++) {
    const g = new Game(freshSave(), stage, 0, seeded());
    for (let batch = 0; batch < 4; batch++) {
      g.time =
        stage === 6 ? [5, 50, 95, 155][batch] : (STAGES[stage].minutes * 60 * (batch + 0.1)) / 4;
      const unlocked = enemyRoster(stage, g.time);
      const latest = unlocked.slice(-3);
      let recent = 0;
      for (let i = 0; i < 1000; i++) {
        const enemy = g.spawnEnemy();
        assert.ok(unlocked.includes(enemy.type));
        if (latest.includes(enemy.type)) recent++;
      }
      if (batch)
        assert.ok(recent > 550 && recent < 750, `stage ${stage}, batch ${batch}: ${recent}`);
    }
  }
});

test('终关先给构筑空间，后期密度、移动、伤害与施法压力逐步提高', () => {
  const samples = [0, 300, 590].map((time) => {
    const g = new Game(freshSave(), 6, 0, () => 0.5);
    g.weapons = [];
    g.time = time;
    g.nextTrialBossAt = 1000;
    const e = g.spawnEnemy(66, false, false, { x: 300, y: 0 });
    e.cooldown = 0;
    g.update(0.01);
    return {
      speed: e.speed,
      damage: e.damage,
      cooldown: e.cooldown,
      rate: g.spawnBudget / 0.01,
      projectileSpeed: Math.hypot(g.shots[0].vx, g.shots[0].vy),
      elite: e.elite,
    };
  });
  for (let i = 1; i < samples.length; i++) {
    assert.ok(samples[i].speed > samples[i - 1].speed);
    assert.ok(samples[i].damage > samples[i - 1].damage);
    assert.ok(samples[i].cooldown < samples[i - 1].cooldown);
    assert.ok(samples[i].rate > samples[i - 1].rate);
    assert.ok(samples[i].projectileSpeed > samples[i - 1].projectileSpeed);
  }
  assert.ok(samples.every((s) => s.elite));
  assert.ok(samples[0].rate < 1.1);
  assert.ok(samples[2].rate > 8.5 * DIFFICULTIES[0].amount);
});

test('定时精英遵守当前兵种批次，后半程精英增多', () => {
  for (let stage = 0; stage < 6; stage++) {
    for (const late of [false, true]) {
      const g = new Game(freshSave(), stage, 0, () => 0.5);
      g.weapons = [];
      g.time = late ? STAGES[stage].minutes * 45 : 60;
      g.nextElite = g.time;
      g.update(0.01);
      assert.ok(g.enemies.every((e) => enemyRoster(stage, g.time).includes(e.type)));
      assert.equal(g.enemies.filter((e) => e.elite).length, late ? 2 : 1);
    }
  }
});

test('终关十分钟后数量和属性不再增长，自然刷新与召唤遵守同屏上限', () => {
  const samples = [600, 1200, 3600].map((time) => {
    const g = new Game(freshSave(), 6, 0, () => 0.5);
    g.time = time;
    g.nextTrialBossAt = 10000;
    g.weapons = [];
    const e = g.spawnEnemy(66, false, false, { x: 300, y: 0 });
    e.cooldown = 0;
    g.update(0.01);
    return {
      hp: e.maxHp,
      speed: e.speed,
      damage: e.damage,
      cooldown: e.cooldown,
      rate: g.spawnBudget / 0.01,
    };
  });
  assert.deepEqual(samples[0], samples[1]);
  assert.deepEqual(samples[1], samples[2]);
  const g = new Game(freshSave(), 6, 0, () => 0.5);
  g.time = 600;
  g.nextTrialBossAt = 10000;
  g.weapons = [];
  for (let i = 0; i < 210; i++) g.spawnEnemy(i === 0 ? 71 : 65, false, false, { x: 500, y: 0 });
  g.enemies[0].cooldown = 0;
  g.spawnBudget = 10;
  g.update(0.01);
  assert.equal(g.enemies.length, 210);
});
