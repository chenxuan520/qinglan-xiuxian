import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import {
  freshSave,
  parseSave,
  syncTribulationClock,
  completeTribulation,
} from '../src/progress.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';

// 从真实后期战斗复现中提取统计值，不修改战斗伤害计算。
const lateDamage = {
  pagoda: 10171132529.479473,
  compass: 14825747920.132565,
  orbit: 19887453238.401775,
  pulse: 13371084884.652262,
  umbrella: 14009081779.923046,
  cauldron: 34128066546.293205,
};
const lateTotal = 106392566898.84149;

function lateRun() {
  const save = freshSave('triple', ['earth', 'wood', 'water']);
  save.cultivation = 212019;
  save.unlocked = 6;
  const game = new Game(save, 6, 0);
  game.damageDealt = lateTotal;
  game.damageBySource = { ...lateDamage };
  game.pause();
  return game;
}

test('后期伤害舍入误差允许刷新续局，保留统计与永久修为且再次读档不重复入账', () => {
  const game = lateRun();
  const difference = Object.values(lateDamage).reduce((sum, n) => sum + n, 0) - lateTotal;
  assert.ok(difference > 0.01 && difference < 0.05);
  const stored = JSON.stringify({ ...game.save, activeRun: game.snapshot() });
  const save = parseSave(stored);
  const cultivation = save.cultivation;
  const restored = Game.restore(save, JSON.parse(stored).activeRun);
  assert.ok(restored);
  assert.equal(restored.state, 'paused');
  assert.equal(restored.damageDealt, lateTotal);
  assert.deepEqual(restored.damageBySource, lateDamage);
  assert.equal(save.cultivation, cultivation);
  assert.ok(Game.restore(save, JSON.parse(JSON.stringify(restored.snapshot()))));
  assert.equal(save.cultivation, cultivation);
  restored.resume();
  restored.update(0.01);
  assert.equal(restored.state, 'playing');
  assert.equal(restored.time, 0.01);
});

test('同一后期战局可以导出导入，并在完成自然天劫后恢复原历练', () => {
  const game = lateRun();
  const imported = importSave(exportSave(game.save, game));
  assert.ok(imported.run);
  assert.equal(imported.run.damageDealt, lateTotal);
  assert.deepEqual(imported.run.damageBySource, lateDamage);
  const save = imported.save;
  syncTribulationClock(save);
  save.age = save.nextTribulationAge;
  const original = imported.run.snapshot();
  assert.ok(completeTribulation(save, 1));
  const cultivation = save.cultivation;
  const returned = Game.restore(save, original);
  assert.ok(returned);
  assert.equal(returned.tribulation, 0);
  assert.equal(returned.stage, 6);
  assert.equal(returned.time, original.time);
  assert.deepEqual(returned.damageBySource, lateDamage);
  assert.equal(save.cultivation, cultivation);
});

test('伤害统计仍拒绝明显超额、非法分项和有限分项求和溢出，保留旧档兼容', () => {
  const game = lateRun();
  const raw = game.snapshot();
  assert.equal(
    Game.restore(game.save, { ...raw, damageBySource: { ...lateDamage, sword: 1e6 } }),
    null,
  );
  for (const invalid of [
    { sword: -1 },
    { sword: Infinity },
    { sword: NaN },
    { nonexistent: 1 },
    { sword: Number.MAX_VALUE, nail: Number.MAX_VALUE },
  ])
    assert.equal(Game.restore(game.save, { ...raw, damageBySource: invalid }), null);
  const small = new Game(freshSave(), 0, 0);
  const smallRaw = { ...small.snapshot(), damageDealt: 100 };
  assert.ok(Game.restore(small.save, { ...smallRaw, damageBySource: { sword: 100.005 } }));
  assert.equal(Game.restore(small.save, { ...smallRaw, damageBySource: { sword: 100.02 } }), null);
  const legacy = { ...raw, damageBySource: undefined };
  assert.ok(Game.restore(game.save, legacy));
});
