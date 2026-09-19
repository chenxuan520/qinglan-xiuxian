import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { freshSave } from '../src/progress.ts';

function encounter(stage = 0, x = -500) {
  const save = freshSave();
  save.unlocked = 6;
  const g = new Game(save, stage, 0, () => 0.5);
  g.weapons[0].timer = 999;
  g.player.invincible = 999;
  const boss = g.spawnEnemy(10, false, true, { x, y: 0 }, stage);
  boss.cooldown = 999;
  boss.pursuitCooldown = 0;
  return { g, boss };
}

test('七位妖王远距离追袭先预警，锁定方向，冲刺距离与预警一致', () => {
  for (let stage = 0; stage < 7; stage++) {
    const { g, boss } = encounter(stage);
    g.update(0.01);
    assert.ok(boss.charge > 1.5);
    const warning = g.effects.find((e) => e.kind === 'line')!;
    assert.ok(warning);
    assert.equal(warning.x, -500);
    assert.equal(warning.x2, 74);
    for (let i = 0; i < 16; i++) g.update(0.05);
    assert.equal(boss.x, -500, '蓄力时不能前进');
    g.player.y = 200;
    boss.cooldown = 0;
    while (boss.charge > 0) g.update(0.01);
    assert.ok(Math.abs(boss.x - warning.x2!) < 1e-8);
    assert.equal(boss.y, 0, '冲刺不能转弯追踪侧向闪避的玩家');
    assert.ok(boss.pursuitCooldown! > 7, '不会在冲刺结束后立即重复追袭');
  }
});

test('追袭有距离和独立冷却限制，半血加快，普通冲刺保持原速度', () => {
  const { g, boss } = encounter(0, -200);
  g.update(0.01);
  assert.equal(boss.charge, 0);
  boss.x = -500;
  boss.pursuitCooldown = 1;
  g.update(0.01);
  assert.equal(boss.charge, 0);
  boss.hp = boss.maxHp * 0.4;
  boss.pursuitCooldown = 0;
  g.update(0.01);
  assert.equal(boss.pursuitCooldown, 6.5);
  const mob = g.spawnEnemy(0, false, false, { x: -100, y: 300 });
  mob.charge = 0.5;
  mob.dx = 1;
  mob.dy = 0;
  mob.cooldown = 999;
  g.update(0.05);
  assert.equal(mob.x, -81);
});

test('冲刺期间不被原有招式打断，冷却与预警跨刷新保留，兼容旧妖王快照', () => {
  const { g, boss } = encounter(2);
  g.update(0.01);
  boss.cooldown = 0;
  g.update(0.05);
  assert.equal(boss.skillStep, undefined);
  assert.equal(boss.x, -500);
  const raw = JSON.parse(JSON.stringify(g.snapshot()));
  const restored = Game.restore(g.save, raw)!;
  assert.ok(restored);
  assert.equal(restored.boss!.pursuitCooldown, boss.pursuitCooldown);
  assert.ok(restored.effects.some((e) => e.kind === 'line'));
  assert.equal(restored.boss!.charge, boss.charge);
  delete raw.enemies[0].pursuitCooldown;
  assert.ok(Game.restore(g.save, raw));
  raw.enemies[0].pursuitCooldown = 'bad';
  assert.equal(Game.restore(g.save, raw), null);
});
