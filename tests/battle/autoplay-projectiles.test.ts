import test from 'node:test';
import assert from 'node:assert/strict';
import { autoplayInput } from '../../src/battle/autoplay.ts';
import { Game } from '../../src/battle/game.ts';
import { freshSave } from '../../src/core/progress.ts';

function encounter(stage = 0, angle = 0, age = 0) {
  const save = freshSave('dual', ['metal', 'water'], 'dual', () => 0.5);
  save.unlocked = 6;
  const g = new Game(save, stage, 0, () => 0.5);
  g.spawnBudget = -1000;
  g.bossSpawned = true;
  g.nextTrialBossAt = 999;
  g.weapons[0].timer = 999;
  const boss = g.spawnEnemy(10, false, true, { x: 2000, y: 2000 }, stage);
  boss.speed = 0;
  boss.cooldown = boss.pursuitCooldown = 999;
  const nx = Math.cos(angle),
    ny = Math.sin(angle);
  g.pickups = [{ x: nx * 200, y: ny * 200, kind: 'xp', value: 1, pull: false }];
  const shot = g['hostileShot']({ x: nx * 180, y: ny * 180 }, -nx, -ny, 320, 10);
  shot.bossStage = stage;
  shot.age = age;
  return g;
}

function advance(g: Game, frames = 60) {
  let hits = 0;
  g.onEvent = (event) => {
    if (event === 'hurt') hits++;
  };
  for (let frame = 0; frame < frames; frame++) {
    assert.equal(g.state, 'playing', '每帧须真实推进战斗');
    if (frame % 4 === 0) g.input = autoplayInput(g);
    g.update(1 / 30);
  }
  assert.ok(Math.abs(g.time - frames / 30) < 1e-9);
  return hits;
}

test('普通妖王迎面弹尚在180像素外时侧移避让，保留拾取目标也不会迎弹直走', () => {
  for (const stage of [0, 1, 2, 3, 5, 6]) {
    for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const g = encounter(stage, angle);
      const input = autoplayInput(g);
      assert.ok(Math.abs(input.x * Math.sin(angle) - input.y * Math.cos(angle)) > 0.2);
      assert.equal(advance(g), 0, `境${stage}，方向${angle}`);
      assert.ok(Math.hypot(g.player.x, g.player.y) > 10, '不能用站定代替避让');
    }
  }
});

test('冥主魂弹盘旋期、转直线交界和切线飞行都按可见轨迹避让', () => {
  for (const age of [0, 0.6, 1.2]) {
    for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const g = encounter(4, angle, age);
      assert.equal(advance(g), 0, `弹龄${age}，方向${angle}`);
    }
  }
});

test('两发错开的魂弹交叉经过拾取路线，跨过盘旋转直线时刻仍不受伤', () => {
  const g = encounter(4);
  g.shots = [];
  g.pickups = [
    { x: Math.cos(2.387) * 220, y: Math.sin(2.387) * 220, kind: 'xp', value: 1, pull: false },
  ];
  // 固定可见弹位；若把盘旋段按直线预测，这个场景实际受伤一次。
  for (const [x, y, angle, speed, age] of [
    [74.287, -97.856, 8.252, 287.705, 0.455],
    [51.62, -105.276, 8.454, 232.467, 0.849],
  ]) {
    const shot = g['hostileShot']({ x, y }, Math.cos(angle), Math.sin(angle), speed, 10);
    shot.bossStage = 4;
    shot.age = age;
  }
  assert.equal(advance(g), 0);
});

test('没有地面危险区时，躲弹仍避开拾取路径上正接近的妖物', () => {
  for (const angle of [Math.PI / 2, -Math.PI / 2]) {
    const g = encounter(0, angle);
    g.pickups = [{ x: 200, y: 0, kind: 'xp', value: 1, pull: false }];
    g.spawnEnemy(1, false, false, { x: 100, y: 0 });
    assert.equal(g.zones.length, 0);
    assert.ok(Math.abs(autoplayInput(g).y) > 0.5);
    assert.equal(advance(g, 45), 0);
  }
});

test('弹道预测不消耗随机数或改写战况，续局后仍选择同一方向', () => {
  const g = encounter(4, Math.PI / 3, 0.6);
  const snapshot = g.snapshot();
  g.random = () => {
    throw Error('走位预测不能读取随机数');
  };
  const expected = autoplayInput(g);
  assert.deepEqual(g.snapshot(), snapshot);
  const restored = Game.restore(structuredClone(g.save), snapshot);
  assert.ok(restored);
  assert.deepEqual(autoplayInput(restored), expected);
});
