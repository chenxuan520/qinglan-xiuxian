import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { STAGES, TRIAL_BOSS_TIMES, enemyRoster } from '../src/data.ts';
import { freshSave } from '../src/progress.ts';

test('前六境为334455分钟，四批敌人和精英随时长提前，终关十分钟时序不变', () => {
  assert.deepEqual(
    STAGES.map((s) => s.minutes),
    [3, 3, 4, 4, 5, 5, 10],
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
    assert.ok(g.nextElite >= 36 && g.nextElite <= 43);
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

test('无时长标记的早期续局按原始5至10分钟换算，重复读档不再压缩', () => {
  for (let stage = 0; stage < 7; stage++) {
    const save = freshSave();
    save.unlocked = stage;
    const g = new Game(save, stage, 0, () => 0.5);
    const duration = STAGES[stage].minutes * 60;
    const oldDuration = stage === 6 ? duration : (stage + 5) * 60;
    g.time = oldDuration / 2;
    g.nextElite = oldDuration / 2 + 60;
    g.player.hp -= 15;
    g.level = 30;
    const snapshot = JSON.parse(JSON.stringify(g.snapshot()));
    delete snapshot.stageDuration;
    const restored = Game.restore(save, snapshot)!;
    assert.ok(restored);
    assert.equal(restored.time, duration / 2);
    assert.ok(Math.abs(restored.nextElite - (g.nextElite * duration) / oldDuration) < 1e-9);
    assert.equal(restored.level, 30);
    assert.equal(restored.player.maxHp - restored.player.hp, 15);
    assert.equal(Game.restore(save, restored.snapshot())!.time, restored.time);
    assert.equal(Game.restore(save, restored.snapshot())!.nextElite, restored.nextElite);
    assert.equal(Game.restore(save, { ...snapshot, stageDuration: 0 }), null);
  }
});

test('上一版续局按完成比例换算，已出场妖王、收益和消耗寿元保持不变', () => {
  for (const oldMinutes of [
    [3, 4, 5, 6, 7, 8, 10],
    [3, 3, 5, 5, 7, 7, 10],
  ]) {
    for (let stage = 0; stage < 7; stage++) {
      for (const bossSpawned of [false, true]) {
        const save = freshSave('heaven');
        save.unlocked = stage;
        const g = new Game(save, stage, 0, () => 0.5);
        const oldDuration = oldMinutes[stage] * 60;
        const duration = STAGES[stage].minutes * 60;
        g.time = oldDuration * (bossSpawned ? 1.1 : 0.6);
        g.nextElite = g.time + 20;
        g.kills = 100;
        g.creditCultivation();
        g.iron = 7;
        g.player.hp -= 12;
        if (bossSpawned) {
          g.bossSpawned = true;
          g.spawnEnemy(10, false, true, undefined, 0);
          g.boss!.hp /= 2;
          if (stage === 6) g.trialBossesSpawned = 1;
        }
        const saveBefore = JSON.stringify(save);
        const snapshot = { ...g.snapshot(), stageDuration: oldDuration };
        const restored = Game.restore(save, snapshot)!;
        assert.ok(restored);
        assert.equal(restored.time, g.time * (duration / oldDuration));
        assert.equal(restored.nextElite, g.nextElite * (duration / oldDuration));
        assert.equal(restored.remaining, Math.max(0, duration - restored.time));
        assert.equal(restored.bossSpawned, bossSpawned);
        assert.deepEqual(restored.enemies, g.enemies);
        assert.equal(restored.kills, 100);
        assert.equal(restored.iron, 7);
        assert.equal(restored.player.maxHp - restored.player.hp, 12);
        assert.equal(JSON.stringify(save), saveBefore);
        const again = Game.restore(save, restored.snapshot())!;
        assert.equal(again.time, restored.time);
        assert.equal(again.nextElite, restored.nextElite);
        if (bossSpawned) {
          again.weapons = [];
          again.resume();
          again.update(0.01);
          if (stage < 6) assert.equal(again.enemies.filter((e) => e.boss).length, 1);
        }
      }
    }
  }
});
