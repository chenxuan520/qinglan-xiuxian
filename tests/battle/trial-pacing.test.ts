import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../src/battle/game.ts';
import { freshSave } from '../../src/core/progress.ts';
import { bossEntranceCue } from '../../src/battle/boss-entrance.ts';
import { TRIAL_BOSS_TIMES } from '../../src/core/data.ts';

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

test('满两王不叠王，170秒腾出位置立即出第三王，第四王仍按195秒原表登场', () => {
  const g = trial();
  advance(g, 60);
  advance(g, 105);
  g.effects = [];
  g.time = 149.6;
  assert.equal(bossEntranceCue(g), null);
  advance(g, 170);
  assert.equal(g.trialBossesSpawned, 2);
  g.hitEnemy(g.boss!, g.boss!.maxHp);
  g.xp = 0;
  g.update(0.001);
  assert.equal(g.trialBossesSpawned, 3);
  assert.equal(g.nextTrialBossAt, 195);
  assert.equal(g.enemies.filter((e) => e.boss && !e.dead).length, 2);
  g.hitEnemy(g.boss!, g.boss!.maxHp);
  g.xp = 0;
  advance(g, 194.99);
  assert.equal(g.trialBossesSpawned, 3);
  advance(g, 195);
  assert.equal(g.trialBossesSpawned, 4);
  assert.equal(g.nextTrialBossAt, 240);
});

test('严重延误按原表补位但同帧只出一王，间隔至少3秒，暂停复活保留', () => {
  const g = trial();
  advance(g, 900);
  assert.equal(g.trialBossesSpawned, 1);
  assert.equal(g.nextTrialBossAt, 903);
  g.update(0);
  assert.equal(g.trialBossesSpawned, 1);
  g.pause();
  g.update(1);
  assert.equal(g.nextTrialBossAt, 903);
  assert.equal(g.time, 900);
  g.state = 'lost';
  g.revive();
  assert.equal(g.nextTrialBossAt, 903);
  advance(g, 902.999);
  assert.equal(g.trialBossesSpawned, 1);
  advance(g, 903);
  assert.equal(g.trialBossesSpawned, 2);
  for (const e of g.enemies.filter((e) => e.boss && !e.dead)) g.hitEnemy(e, e.maxHp);
  g.xp = 0;
  advance(g, 905.999);
  assert.equal(g.trialBossesSpawned, 2);
  advance(g, 906);
  assert.equal(g.trialBossesSpawned, 3);
});

test('续局清除旧累积顺延、原定时间已到立即补位，并保留刚登场的3秒间隔', () => {
  const current = trial();
  advance(current, 60);
  advance(current, 105);
  advance(current, 170);
  current.nextTrialBossAt = 215;
  current.trialBossBlocked = true;
  const restored = Game.restore(current.save, structuredClone(current.snapshot()))!;
  assert.ok(restored);
  assert.equal(restored.nextTrialBossAt, 150);
  restored.resume();
  restored.hitEnemy(restored.boss!, restored.boss!.maxHp);
  restored.xp = 0;
  restored.update(0.001);
  assert.equal(restored.trialBossesSpawned, 3);
  assert.equal(restored.nextTrialBossAt, 195);
  const late = trial();
  advance(late, 900);
  late.pause();
  const again = Game.restore(late.save, structuredClone(late.snapshot()))!;
  assert.ok(again);
  assert.equal(again.nextTrialBossAt, 903);
  again.resume();
  advance(again, 902.99);
  assert.equal(again.trialBossesSpawned, 1);
  advance(again, 903);
  assert.equal(again.trialBossesSpawned, 2);
  assert.equal(
    Game.restore(current.save, { ...current.snapshot(), trialBossBlocked: 'true' }),
    null,
  );
});

test('旧版严重延期快照清除四十五秒等待时，仍补齐刚登场的三秒间隔', () => {
  const g = trial();
  advance(g, 60);
  advance(g, 105);
  const first = g.enemies.find((e) => e.bossStage === 0)!;
  g.hitEnemy(first, first.maxHp);
  g.xp = 0;
  advance(g, 905.01);
  assert.equal(g.trialBossesSpawned, 3);
  const second = g.enemies.find((e) => e.bossStage === 1 && !e.dead)!;
  g.hitEnemy(second, second.maxHp);
  g.xp = 0;
  g.time = 905.51;
  g.nextTrialBossAt = 950.01; // 真实旧版：905.01 登场后再排45秒。
  const restored = Game.restore(g.save, g.snapshot())!;
  assert.ok(restored);
  assert.ok(Math.abs(restored.nextTrialBossAt - 908.01) < 1e-8);
  restored.resume();
  advance(restored, 908.009);
  assert.equal(restored.trialBossesSpawned, 3);
  advance(restored, 908.01);
  assert.equal(restored.trialBossesSpawned, 4);
});

test('只有第二、第六境妖王首招提前到1秒，独立天劫首招不变', () => {
  for (let stage = 0; stage <= 6; stage++) {
    const save = freshSave();
    save.unlocked = 6;
    const g = new Game(save, stage, 0, () => 0.5);
    assert.equal(g.spawnEnemy(10, false, true).cooldown, [1, 5].includes(stage) ? 1 : 2.5);
  }
  const g = trial();
  assert.equal(Game.createTribulation(g.save, g).boss!.cooldown, 2.5);
});
