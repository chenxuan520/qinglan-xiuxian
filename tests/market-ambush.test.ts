import test from 'node:test';
import assert from 'node:assert/strict';
import { MarketAmbushDuel } from '../src/market-ambush.ts';
import {
  AMBUSH_MAX_SHOTS,
  initialAmbushSnapshot,
  validAmbushSnapshot,
  validAmbushStats,
} from '../src/market-ambush-data.ts';
const make = () =>
  new MarketAmbushDuel({ hp: 100, damage: 15, enemyHp: 90, enemyDamage: 20, speed: 175 });
test('真实自动发射、近身预警与伤害，无移动可胜，低输出可败', () => {
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

test('10FPS和5FPS均不再于十五秒自动脱身，撤离必须主动请求', () => {
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
    assert.equal(d.outcome, null);
    assert.ok(d.time >= 20 - interval);
  }
});

test('撤离自动退向左侧，拉开距离保持两秒；手动输入可覆盖并重置进度', () => {
  const stats = { hp: 10000, damage: 1, enemyHp: 10000, enemyDamage: 1, speed: 175 };
  const d = new MarketAmbushDuel(stats);
  assert.equal(d.requestRetreat(), true);
  d.update(0.2, { x: 1, y: 0 });
  assert.ok(d.player.x > 150, '向右的手动走位优先于自动撤离');
  for (let i = 0; i < 4; i++) d.update(0.1, { x: -1, y: 0 });
  for (let i = 0; i < 20 && !d.outcome; i++) d.update(0.1, { x: 0, y: 0 });
  assert.equal(d.outcome, null);
  assert.ok(d.player.x <= 60);
  assert.ok(d.retreatProgress > 0 && d.retreatProgress < 2);
  const saved = d.snapshot();
  saved.enemy.x = saved.player.x + 100;
  saved.enemy.y = saved.player.y;
  saved.warning = null;
  saved.lunge = null;
  const blocked = new MarketAmbushDuel(stats, saved);
  blocked.update(0.05, { x: 0, y: 0 });
  assert.equal(blocked.retreatProgress, 0, '敌人靠近时安全停留重新计时');
  const fresh = new MarketAmbushDuel(stats);
  fresh.requestRetreat();
  for (let i = 0; i < 60 && !fresh.outcome; i++) fresh.update(0.05, { x: 0, y: 0 });
  assert.equal(fresh.outcome, 'escaped');
  assert.ok(fresh.time >= 2);
  assert.ok(validAmbushSnapshot(fresh.snapshot(), stats));
});

test('完整快照恢复预警、冲刺、飞行弹丸和固定数值，继续逐帧完全一致', () => {
  const d = make();
  let checked = 0;
  for (let i = 0; i < 600 && !d.outcome; i++) {
    d.update(1 / 60, { x: i % 180 < 90 ? 0 : -1, y: 0 });
    const snapshot = d.snapshot();
    assert.ok(validAmbushSnapshot(snapshot), JSON.stringify(snapshot));
    if (snapshot.warning || snapshot.lunge || snapshot.shots.length) {
      const restored = MarketAmbushDuel.restore(JSON.parse(JSON.stringify(snapshot)))!;
      assert.ok(restored);
      for (let n = 0; n < 5; n++) {
        restored.update(1 / 60, { x: 0, y: 1 });
        d.update(1 / 60, { x: 0, y: 1 });
        assert.deepEqual(restored.snapshot(), d.snapshot(), '恢复分支应与未中断的原战斗完全一致');
      }
      checked++;
    }
  }
  assert.ok(checked > 20);
  const stats = { hp: 100, damage: 15, enemyHp: 90, enemyDamage: 20, speed: 175 };
  const original = new MarketAmbushDuel(stats);
  stats.hp = 10000;
  assert.equal(original.snapshot().stats.hp, 100);
  const copy = original.snapshot();
  copy.player.hp = 1;
  copy.stats.damage = 900;
  assert.equal(original.player.hp, 100);
  assert.equal(original.snapshot().stats.damage, 15);
});

test('同时击杀死亡优先，复活满血、清招并给三秒无敌且不重置敌人气血', () => {
  const stats = { hp: 100, damage: 15, enemyHp: 90, enemyDamage: 100, speed: 175 };
  const s = initialAmbushSnapshot(stats);
  s.enemy = { x: 150, y: 180, hp: 15, maxHp: 90 };
  s.lunge = { from: { x: 150, y: 180 }, to: { x: 150, y: 180 }, time: 0.29 };
  s.shots = [{ x: 150, y: 180, vx: 0, vy: 0 }];
  const simultaneous = new MarketAmbushDuel(stats, s);
  simultaneous.update(0.02, { x: 0, y: 0 });
  assert.equal(simultaneous.player.hp, 0);
  assert.equal(simultaneous.enemy.hp, 0);
  assert.equal(simultaneous.outcome, 'defeat');
  assert.ok(validAmbushSnapshot(simultaneous.snapshot()));
  assert.equal(simultaneous.revive(), true);
  assert.equal(simultaneous.outcome, 'victory');
  assert.ok(validAmbushSnapshot(simultaneous.snapshot()));

  const defeated = initialAmbushSnapshot(stats);
  defeated.player.hp = 0;
  defeated.outcome = 'defeat';
  defeated.enemy.hp = 40;
  defeated.warning = { x: 150, y: 180, origin: { x: 200, y: 180 }, remaining: 0.4 };
  const revived = new MarketAmbushDuel(stats, defeated);
  assert.equal(revived.revive(), true);
  assert.equal(revived.player.hp, 100);
  assert.equal(revived.enemy.hp, 40);
  assert.equal(revived.warning, null);
  assert.equal(revived.snapshot().lunge, null);
  assert.equal(revived.shots.length, 0);
  assert.equal(revived.invincible, 3);
  const protectedSnapshot = revived.snapshot();
  protectedSnapshot.enemy = { x: 150, y: 180, hp: 40, maxHp: 90 };
  protectedSnapshot.lunge = { from: { x: 150, y: 180 }, to: { x: 150, y: 180 }, time: 0.29 };
  const protectedDuel = new MarketAmbushDuel(stats, protectedSnapshot);
  protectedDuel.update(0.02, { x: 0, y: 0 });
  assert.equal(protectedDuel.player.hp, 100);
  assert.ok(Math.abs(protectedDuel.invincible - 2.98) < 1e-8);
});

test('DTO拒绝非有限数、越界弹丸/气血、冲突招式、替换数值和伪造结局', () => {
  const valid = make().snapshot();
  const invalid: ((s: typeof valid) => void)[] = [
    (s) => {
      s.time = Infinity;
    },
    (s) => {
      s.stats.speed = NaN;
    },
    (s) => {
      s.player.hp = s.player.maxHp + 1;
    },
    (s) => {
      s.enemy.hp = -1;
    },
    (s) => {
      s.enemy.maxHp = 1;
    },
    (s) => {
      s.player.x = 1;
    },
    (s) => {
      s.shots = Array.from({ length: AMBUSH_MAX_SHOTS + 1 }, () => ({ x: 1, y: 1, vx: 0, vy: 0 }));
    },
    (s) => {
      s.shots = [{ x: 1, y: 1, vx: Infinity, vy: 0 }];
    },
    (s) => {
      s.outcome = 'victory';
    },
    (s) => {
      s.outcome = 'defeat';
    },
    (s) => {
      s.outcome = 'escaped';
    },
    (s) => {
      s.invincible = 4;
    },
    (s) => {
      s.warning = { x: 150, y: 180, origin: { x: 150, y: 180 }, remaining: 0.4 };
      s.lunge = { from: { x: 150, y: 180 }, to: { x: 150, y: 180 }, time: 0 };
    },
  ];
  for (const alter of invalid) {
    const s = structuredClone(valid);
    alter(s);
    assert.equal(validAmbushSnapshot(s), false);
    assert.equal(MarketAmbushDuel.restore(s), null);
  }
  assert.equal(validAmbushSnapshot(valid, { ...valid.stats, hp: 200 }), false);
  assert.equal(validAmbushSnapshot(null), false);
  assert.equal(validAmbushSnapshot({ version: 1, stats: valid.stats }), false);
  assert.equal(validAmbushStats({ ...valid.stats, hp: 0 }), false);
});

test('站立后再撤离，贴四边遭追击时的预警/冲刺/身陨快照始终合法', () => {
  const stats = { hp: 80, damage: 8.6, enemyHp: 243, enemyDamage: 43.2, speed: 140 };
  for (const direction of [
    { x: -1, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: -1 },
    { x: 0, y: 1 },
  ]) {
    const d = new MarketAmbushDuel(stats);
    for (let i = 0; i < 60 * 20 && !d.outcome; i++) {
      if (i === 180) d.requestRetreat();
      d.update(1 / 60, i < 180 ? { x: 0, y: 0 } : direction);
      assert.ok(validAmbushSnapshot(d.snapshot(), stats), JSON.stringify(d.snapshot()));
    }
    assert.equal(d.outcome, 'defeat');
  }
});

test('斜退到角落时预警与冲刺不会因浮点误差越出快照边界', () => {
  const stats = { hp: 80, damage: 8.6, enemyHp: 243, enemyDamage: 43.2, speed: 140 };
  for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 12) {
    const d = new MarketAmbushDuel(stats);
    for (let i = 0; i < 1200 && !d.outcome; i++) {
      if (d.time >= 4) d.requestRetreat();
      d.update(
        1 / 60,
        d.retreatRequested ? { x: Math.cos(angle), y: Math.sin(angle) } : { x: 0, y: 0 },
      );
      assert.ok(
        validAmbushSnapshot(d.snapshot(), stats),
        JSON.stringify({ angle, snapshot: d.snapshot() }),
      );
    }
  }
});
