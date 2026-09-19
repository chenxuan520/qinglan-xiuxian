import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { STAGES, TRIAL_BOSS_TIMES, enemyRoster } from '../src/data.ts';
import { freshSave } from '../src/progress.ts';

test('前六境各缩短两分钟，四批敌人和精英提前，妖王在新倒计时结束出现', () => {
  assert.deepEqual(
    STAGES.map((s) => s.minutes),
    [3, 4, 5, 6, 7, 8, 10],
  );
  assert.deepEqual(TRIAL_BOSS_TIMES, [90, 180, 270, 360, 450, 540, 600]);
  for (let stage = 0; stage < 6; stage++) {
    const g = new Game(freshSave(), stage, 0, () => 0.5);
    g.weapons = [];
    const duration = STAGES[stage].minutes * 60;
    for (let batch = 1; batch <= 3; batch++) {
      assert.equal(enemyRoster(stage, (duration * batch) / 4 - 0.01).length, batch * 3);
      assert.equal(enemyRoster(stage, (duration * batch) / 4).length, (batch + 1) * 3);
    }
    assert.ok(g.nextElite >= 36 && g.nextElite <= 48);
    const interval = g.nextElite;
    g.time = interval - 0.025;
    g.update(0.01);
    assert.equal(g.enemies.length, 0);
    g.update(0.02);
    assert.equal(g.enemies.filter((e) => e.elite).length, 1);
    assert.equal(g.nextElite, interval * 2);
    g.time = duration - 0.025;
    g.update(0.01);
    assert.equal(g.bossSpawned, false);
    g.update(0.02);
    assert.equal(g.enemies.filter((e) => e.boss).length, 1);
    g.update(0.05);
    assert.equal(g.enemies.filter((e) => e.boss).length, 1);
  }
});

test('旧续局按进度比例缩短时间且不重复压缩，等级、气血、妖王及终关时序保留', () => {
  for (let stage = 0; stage < 7; stage++) {
    const save = freshSave();
    save.unlocked = stage;
    const g = new Game(save, stage, 0, () => 0.5);
    const duration = STAGES[stage].minutes * 60;
    const oldDuration = stage === 6 ? duration : duration + 120;
    g.time = oldDuration / 2;
    g.nextElite = oldDuration / 2 + 60;
    g.player.hp -= 15;
    g.level = 30;
    const snapshot = JSON.parse(JSON.stringify(g.snapshot()));
    delete snapshot.stageDuration;
    const restored = Game.restore(save, snapshot)!;
    assert.ok(restored);
    assert.equal(restored.time, duration / 2);
    assert.equal(restored.nextElite, (g.nextElite * duration) / oldDuration);
    assert.equal(restored.level, 30);
    assert.equal(restored.player.maxHp - restored.player.hp, 15);
    assert.equal(Game.restore(save, restored.snapshot())!.time, restored.time);
    assert.equal(Game.restore(save, restored.snapshot())!.nextElite, restored.nextElite);
    assert.equal(Game.restore(save, { ...snapshot, stageDuration: 0 }), null);
  }
});
