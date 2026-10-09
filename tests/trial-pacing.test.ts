import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { freshSave } from '../src/progress.ts';
import { bossEntranceCue } from '../src/boss-entrance.ts';
import { TRIAL_BOSS_TIMES, LEGACY_TRIAL_BOSS_TIMES } from '../src/data.ts';

function trial() {
  const save = freshSave();
  save.cultivation = 1e9;
  save.unlocked = 6;
  const g = new Game(save, 6, 0, () => 0.5);
  g.weapons[0].timer = 99999;
  g.player.invincible = 99999;
  g.spawnBudget = -99999;
  return g;
}
function advance(g: Game, time: number) {
  g.time = time - 0.001;
  g.update(0.001);
}

test('新终关首分钟完整、正常出王间隔45秒，全部七王清完才胜利', () => {
  const g = trial();
  advance(g, 59.99);
  assert.equal(g.trialBossesSpawned, 0);
  for (let wave = 0; wave < 7; wave++) {
    const at = g.nextTrialBossAt;
    assert.ok(Math.abs(at - TRIAL_BOSS_TIMES[wave]) < 1e-8);
    advance(g, at);
    assert.equal(g.trialBossesSpawned, wave + 1);
    assert.equal(g.boss!.bossStage, wave);
    g.hitEnemy(g.boss!, g.boss!.maxHp);
    g.xp = 0;
    assert.equal(g.state, wave === 6 ? 'won' : 'playing');
  }
});

test('满两王不预告或叠王，释放名额留5秒，延期后仍隔45秒而不密集追赶', () => {
  const g = trial();
  advance(g, 60);
  advance(g, 105);
  g.effects = [];
  g.time = 149.6;
  assert.equal(bossEntranceCue(g), null);
  advance(g, 200);
  assert.equal(g.trialBossesSpawned, 2);
  assert.equal(g.trialBossBlocked, true);
  const restored = Game.restore(g.save, structuredClone(g.snapshot()))!;
  restored.resume();
  const beforeKills = restored.kills;
  restored.hitEnemy(restored.boss!, restored.boss!.maxHp);
  restored.xp = 0;
  restored.update(0.01);
  const due = restored.nextTrialBossAt;
  assert.ok(due >= 205);
  assert.equal(restored.kills, beforeKills + 1);
  const twice = Game.restore(restored.save, structuredClone(restored.snapshot()))!;
  twice.resume();
  assert.equal(twice.nextTrialBossAt, due);
  advance(twice, due - 0.01);
  assert.equal(twice.trialBossesSpawned, 2);
  assert.equal(bossEntranceCue(twice)!.arriving, false);
  advance(twice, due);
  assert.equal(twice.trialBossesSpawned, 3);
  assert.ok(Math.abs(twice.nextTrialBossAt - due - 45) < 1e-8);
  assert.equal(twice.enemies.filter((e) => e.boss && !e.dead).length, 2);
});

test('时间已过很久也不在同帧补出多王，暂停、复活不重置顺延时间', () => {
  const g = trial();
  advance(g, 900);
  assert.equal(g.trialBossesSpawned, 1);
  assert.equal(g.nextTrialBossAt, 945);
  g.pause();
  g.update(1);
  assert.equal(g.nextTrialBossAt, 945);
  assert.equal(g.time, 900);
  g.state = 'lost';
  g.revive();
  assert.equal(g.nextTrialBossAt, 945);
  assert.equal(g.trialBossesSpawned, 1);
});

test('旧七分钟续局继续旧排程及并场规则，新局刷新不缩时且保存延期状态', () => {
  const g = trial();
  g.trialBossSchedule = 4;
  for (const at of LEGACY_TRIAL_BOSS_TIMES) advance(g, at);
  const old = Game.restore(g.save, structuredClone(g.snapshot()))!;
  assert.equal(old.stageDuration, 420);
  assert.equal(old.time, 420);
  assert.equal(old.trialBossesSpawned, 7);
  assert.equal(old.enemies.filter((e) => e.boss && !e.dead).length, 7);
  const current = trial();
  current.time = 310;
  current.nextTrialBossAt = 380;
  current.trialBossBlocked = true;
  const restored = Game.restore(current.save, structuredClone(current.snapshot()))!;
  assert.equal(restored.stageDuration, 330);
  assert.equal(restored.time, 310);
  assert.equal(restored.nextTrialBossAt, 380);
  assert.equal(restored.trialBossBlocked, true);
  assert.equal(
    Game.restore(current.save, { ...current.snapshot(), trialBossBlocked: 'true' }),
    null,
  );
  assert.equal(Game.restore(current.save, { ...current.snapshot(), trialBossSchedule: 6 }), null);
});

test('新终关缩短妖王等待但小怪压力保持420秒曲线，不提前拉到峰值', () => {
  for (const time of [0, 60, 150, 330, 420, 900]) {
    const current = trial();
    const legacy = trial();
    legacy.trialBossSchedule = 4;
    current.time = legacy.time = time;
    for (const type of [0, 3, 7]) {
      const a = current.spawnEnemy(type, false, false, { x: 400, y: 0 });
      const b = legacy.spawnEnemy(type, false, false, { x: 400, y: 0 });
      assert.deepEqual([a.maxHp, a.speed, a.damage], [b.maxHp, b.speed, b.damage]);
    }
    current.update(0.01);
    legacy.update(0.01);
    assert.equal(current.spawnBudget, legacy.spawnBudget);
  }
});

test('只有新局第二、第六境首招提前到1秒，旧局与独立天劫首招不变', () => {
  for (let stage = 0; stage <= 6; stage++) {
    const save = freshSave();
    save.unlocked = 6;
    const g = new Game(save, stage, 0, () => 0.5);
    assert.equal(g.spawnEnemy(10, false, true).cooldown, [1, 5].includes(stage) ? 1 : 2.5);
    g.bossOpeningVersion = 0;
    const old = Game.restore(save, structuredClone(g.snapshot()))!;
    assert.equal(old.spawnEnemy(10, false, true).cooldown, 2.5);
  }
  const g = trial();
  assert.equal(Game.createTribulation(g.save, g).boss!.cooldown, 2.5);
});
