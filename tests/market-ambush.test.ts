import test from 'node:test';
import assert from 'node:assert/strict';
import { MarketAmbushDuel } from '../src/market-ambush.ts';
const make = () =>
  new MarketAmbushDuel({ hp: 100, damage: 15, enemyHp: 90, enemyDamage: 20, speed: 175 });
test('短战斗真实自动发射、近身预警与伤害，无移动可胜；低输出可败或超时脱身', () => {
  const d = make();
  for (let i = 0; i < 1000 && !d.outcome; i++) d.update(1 / 60, { x: 0, y: 0 });
  assert.equal(d.outcome, 'victory');
  assert.ok(d.time > 1 && d.time <= 15);
  assert.equal(d.enemy.hp, 0);
  const weak = new MarketAmbushDuel({
    hp: 25,
    damage: 1,
    enemyHp: 200,
    enemyDamage: 20,
    speed: 150,
  });
  for (let i = 0; i < 1000 && !weak.outcome; i++) weak.update(1 / 60, { x: 0, y: 0 });
  assert.equal(weak.outcome, 'defeat');
});
test('每次攻击从劫修附近产生，预警足够、冲刺逐帧移动，远距离不会主角脚下落招', () => {
  const d = make();
  let saw = false;
  for (let i = 0; i < 1000 && !d.outcome; i++) {
    const before = { x: d.enemy.x, y: d.enemy.y };
    d.update(1 / 60, { x: -1, y: 0 });
    if (d.warning) {
      saw = true;
      assert.ok(
        Math.hypot(d.warning.x - d.warning.origin.x, d.warning.y - d.warning.origin.y) <= 160.0001,
      );
      assert.ok(d.warning.remaining <= 0.8);
    }
    assert.ok(Math.hypot(d.enemy.x - before.x, d.enemy.y - before.y) < 11);
  }
  assert.ok(saw);
});
test('隐藏/失焦暂停时间、位置和伤害；大间隔不补算；角色与输入都限制在场地', () => {
  const d = make();
  const before = JSON.stringify(d);
  d.update(500, { x: 1, y: 1 }, false);
  assert.equal(JSON.stringify(d), before);
  d.update(500, { x: 1, y: 1 });
  assert.ok(Math.abs(d.time - 1) < 1e-8);
  for (let i = 0; i < 1000; i++) d.update(0.05, { x: 100, y: -100 });
  assert.ok(d.player.x >= 28 && d.player.x <= 612 && d.player.y >= 28 && d.player.y <= 332);
  const clock = d.time;
  d.update(NaN, { x: NaN, y: Infinity });
  assert.equal(d.time, clock);
});
test('结算后任何帧都不再修改胜负，及时脱身不继续伤害', () => {
  const d = make();
  d.outcome = 'escaped';
  const before = JSON.stringify(d);
  d.update(0.05, { x: 1, y: 1 });
  assert.equal(JSON.stringify(d), before);
});

test('10FPS和5FPS前台倒计时均约15秒，不因物理分步延长', () => {
  for (const interval of [0.1, 0.2]) {
    const d = new MarketAmbushDuel({
      hp: 10000,
      damage: 1,
      enemyHp: 10000,
      enemyDamage: 1,
      speed: 175,
    });
    let elapsed = 0;
    while (!d.outcome && elapsed < 20) {
      d.update(interval, { x: 0, y: 0 });
      elapsed += interval;
    }
    assert.equal(d.outcome, 'escaped');
    assert.ok(Math.abs(elapsed - 15) < interval + 0.001);
  }
});
