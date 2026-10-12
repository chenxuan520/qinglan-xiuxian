import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { STAGES, TRIAL_BOSS_TIMES, enemyRoster } from '../src/data.ts';
import { freshSave, syncTribulationClock } from '../src/progress.ts';

test('前六境按三分钟、三分半、四分钟两两分档，四批敌人和精英随时长提前，终关首王一分钟，之后每45秒一王', () => {
  assert.deepEqual(
    STAGES.map((s) => s.minutes),
    [3, 3, 3.5, 3.5, 4, 4, 5.5],
  );
  assert.deepEqual(TRIAL_BOSS_TIMES, [60, 105, 150, 195, 240, 285, 330]);
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

test('续局恢复保留技能、丹药和减速保护的剩余秒数与年岁', () => {
  for (const stage of [2, 3, 4, 5]) {
    const save = freshSave();
    save.unlocked = 6;
    const g = new Game(save, stage, 0, () => 0.5);
    g.time = 200;
    g.nextEnemySkillAt = g.time + 0.18;
    g.nextEnemySlowAt = g.time + 2.5;
    g.nextMedicinePulse = g.time + 6;
    g.zone(100, 100, 60, 0.8, 20, '#fff', 'blast', 1.2, true);
    const before = g.snapshot();
    const restored = Game.restore(save, structuredClone(before))!;
    assert.ok(restored);
    for (const [key, remaining] of [
      ['nextEnemySkillAt', 0.18],
      ['nextEnemySlowAt', 2.5],
      ['nextMedicinePulse', 6],
    ] as const) {
      assert.ok(Math.abs(restored[key] - restored.time - remaining) < 1e-9);
      assert.equal(Game.restore(save, restored.snapshot())![key], restored[key]);
    }
    assert.deepEqual(restored.zones, g.zones);
    assert.equal(restored.elapsedYears, g.elapsedYears);
  }
});

test('旧守匣剩余窗口保留但避开妖王出场，已完成或过期不会重开', () => {
  for (const phase of ['offered', 'active', 'cleared', 'expired'] as const) {
    for (const time of [150, 235]) {
      const save = freshSave();
      save.unlocked = 6;
      const g = new Game(save, 4, 0, () => 0.5);
      g.time = time;
      g.cacheChallenge = {
        x: 280,
        y: 0,
        phase,
        deadline: time + 25,
        guardians: phase === 'active' || phase === 'cleared' ? [999, 1000] : [],
      };
      const restored = Game.restore(save, structuredClone(g.snapshot()))!;
      assert.ok(restored);
      const expected = time + 25;
      assert.equal(restored.cacheChallenge!.deadline, expected);
      assert.equal(restored.cacheChallenge!.phase, phase);
      const again = Game.restore(save, restored.snapshot())!;
      assert.deepEqual(again.cacheChallenge, restored.cacheChallenge);
      if (phase === 'cleared' || phase === 'expired') {
        again.resume();
        again.update(0.01);
        assert.equal(again.cacheChallenge!.phase, phase);
        assert.equal(again.pickups.filter((p) => p.kind === 'chest').length, 0);
      }
    }
  }
});

test('独立天劫时间轴不随秘境缩时', () => {
  const save = freshSave();
  save.cultivation = 1e9;
  save.unlocked = 6;
  syncTribulationClock(save);
  save.age = save.nextTribulationAge;
  const g = Game.createTribulation(save, null);
  g.time = 75;
  g.nextMedicinePulse = 80;
  g.nextEnemySkillAt = 75.18;
  g.tribulationNextAt = 76.2;
  const restored = Game.restore(save, structuredClone(g.snapshot()))!;
  assert.ok(restored);
  assert.equal(restored.time, 75);
  assert.equal(restored.nextMedicinePulse, 80);
  assert.equal(restored.nextEnemySkillAt, 75.18);
  assert.equal(restored.tribulationNextAt, 76.2);
});
