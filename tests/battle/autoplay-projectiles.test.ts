import test from 'node:test';
import assert from 'node:assert/strict';
import { autoplayInput } from '../../src/battle/autoplay.ts';
import { BOSS_MECHANICS as R, bossShotPose } from '../../src/battle/boss-mechanics.ts';
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

test('没有妖王标记的普通小怪直线弹也会提前避让，真实推进不受伤', () => {
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const g = encounter(0, angle);
    delete g.shots[0].bossStage;
    const input = autoplayInput(g);
    assert.ok(Math.abs(input.x * Math.sin(angle) - input.y * Math.cos(angle)) > 0.2);
    assert.equal(advance(g), 0);
    assert.ok(Math.hypot(g.player.x, g.player.y) > 10);
  }
});

test('附近有敌弹但精确拾取方向安全时，实际移动保持该方向而不量化', () => {
  const g = encounter();
  g.shots = [];
  const x = Math.cos(Math.PI / 16),
    y = Math.sin(Math.PI / 16);
  g.pickups = [{ x: x * 200, y: y * 200, kind: 'xp', value: 1, pull: false }];
  g['hostileShot']({ x: 80, y: 130 }, -1, 0, 165, 10);
  const input = autoplayInput(g);
  assert.ok(Math.abs(input.x - x) < 1e-12 && Math.abs(input.y - y) < 1e-12);
  assert.equal(advance(g, 12), 0);
  assert.ok(Math.hypot(g.player.x, g.player.y) > 10);
  assert.ok(Math.abs(g.player.x * y - g.player.y * x) < 1e-9);
});

function ordinaryVolley(g: Game) {
  g.shots = [];
  for (let i = -6; i <= 6; i++) g['hostileShot']({ x: i * 12, y: 110 }, 0, -1, 165, 10);
}

test('低血量时不为躲密集普通弹转入即将生效的毒圈', () => {
  const g = encounter();
  g.player.hp = 30;
  ordinaryVolley(g);
  g['zone'](0, -60, 60, 2, 30, '#adbe73', 'poison', 0.3, true);
  // 右方沿圈边可安全离开；把同列弹风险相加会向圈内偏转并实际承伤。
  assert.equal(advance(g, 45), 0);
  assert.ok(g.player.hp >= 30);
  assert.ok(g.player.x > 60);
});

test('密集普通弹与拾取路上的接近妖物同时存在时，真实走位仍避开接触', () => {
  const g = encounter();
  ordinaryVolley(g);
  g.spawnEnemy(1, false, false, { x: 100, y: 0 });
  assert.ok(autoplayInput(g).y < -0.5);
  assert.equal(advance(g, 45), 0);
  assert.equal(g.player.hp, g.player.maxHp);
});

test('回焰折返、魂影扑出与星珠释放仍按特殊轨迹预判，真实推进不受伤', () => {
  for (const stage of [1, 4, 5]) {
    const g = encounter(stage);
    g.shots = [];
    const shot = g['hostileShot']({ x: 180, y: 0 }, -1, 0, R.memorySpeed, 10);
    shot.bossStage = stage;
    shot.radius = 10;
    if (stage === 1) {
      // 回焰正在远端停驻，即将沿原路折返；当前速度为零也不能当作静止安全弹。
      shot.origin = { x: 180 - R.nativeReturnSpeed * R.nativeReturnOut, y: 0 };
      shot.bossMotion = { kind: 'return', velocity: { x: R.nativeReturnSpeed, y: 0 } };
      shot.age = R.returnWarmup + R.nativeReturnOut + R.returnRest / 2;
      shot.life = R.nativeReturnOut + R.returnRest / 2;
    } else if (stage === 4) {
      shot.bossMotion = {
        kind: 'memory',
        path: [
          { x: 180, y: 0 },
          { x: 0, y: 0 },
          { x: -R.memoryOvershoot, y: 0 },
        ],
        warmup: R.memoryWarmup,
        locked: true,
      };
      shot.age = R.memoryWarmup;
      shot.life = (180 + R.memoryOvershoot) / R.memorySpeed;
    } else {
      shot.bossMotion = {
        kind: 'star',
        center: { x: 315, y: 0 },
        angle: Math.PI - 1.3 * R.orbitSpeed,
        launchAt: 1.3,
      };
      shot.age = 1.2;
      shot.life = 1.9;
      shot.radius = 12;
    }
    const { x, y, vx, vy } = bossShotPose(shot);
    Object.assign(shot, { x, y, vx, vy });
    assert.equal(advance(g), 0, `特殊弹所属境${stage}`);
    assert.ok(Math.hypot(g.player.x, g.player.y) > 10);
  }
});

test('近处停驻回焰折返穿过拾取路线时，提前避开真实回程', () => {
  const g = encounter(1, 3.767);
  g.shots = [];
  const velocity = {
    x: Math.cos(3.77) * R.nativeReturnSpeed,
    y: Math.sin(3.77) * R.nativeReturnSpeed,
  };
  const origin = {
    x: -50.566 - velocity.x * R.nativeReturnOut,
    y: -43.001 - velocity.y * R.nativeReturnOut,
  };
  const shot = g['hostileShot'](origin, Math.cos(3.77), Math.sin(3.77), R.nativeReturnSpeed, 10);
  shot.bossStage = 1;
  shot.bossMotion = { kind: 'return', velocity };
  shot.age = R.returnWarmup + R.nativeReturnOut + 0.224;
  shot.life = R.returnWarmup + 2 * R.nativeReturnOut + R.returnRest - shot.age;
  shot.radius = 10;
  const { x, y, vx, vy } = bossShotPose(shot);
  Object.assign(shot, { x, y, vx, vy });
  assert.equal(Math.hypot(shot.vx, shot.vy), 0, '夹具须从转向停驻期开始');
  // 仅按当前零速度外推会错过回程：隔离突变在 1/3 秒实际被回焰命中。
  assert.equal(advance(g), 0);
  assert.equal(g.player.hp, g.player.maxHp);
  assert.ok(shot.vx * velocity.x + shot.vy * velocity.y < 0, '真实推进已进入反向回程');
});

test('错拍星珠从盘旋切换径向释放时，按实际曲线避让而不沿当前切线外推', () => {
  const g = encounter(5, 1.319);
  g.shots = [];
  for (const [x, y, angle, age] of [
    [205.554, -14.778, 7.636, 1.019],
    [-176.186, 74.677, 4.527, 1.058],
  ]) {
    const center = { x, y };
    const shot = g['hostileShot'](center, 1, 0, 220, 10);
    shot.bossStage = 5;
    shot.bossMotion = { kind: 'star', center, angle, launchAt: 1.3 };
    shot.age = age;
    shot.life = shot.bossMotion.launchAt + 1.8 - age;
    shot.radius = 12;
    const pose = bossShotPose(shot);
    assert.equal(pose.active, false, '夹具须从星珠尚未释放时开始');
    Object.assign(shot, { x: pose.x, y: pose.y, vx: pose.vx, vy: pose.vy });
  }
  // 当前切线外推的隔离突变在 7/15 秒被释放后的星珠命中。
  assert.equal(advance(g), 0);
  assert.equal(g.player.hp, g.player.maxHp);
  assert.ok(Math.hypot(g.player.x, g.player.y) > 10);
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
  // 固定交叉弹位，检查跨过盘旋转直线的时刻仍无伤；此夹具不区分直线预测突变。
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
