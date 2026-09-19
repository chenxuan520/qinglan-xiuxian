import test from 'node:test';
import assert from 'node:assert/strict';
import { autoplayInput } from '../src/autoplay.ts';
import { Game } from '../src/game.ts';
import { freshSave } from '../src/progress.ts';

function encounter(stage: number, angle = 0, distance = 500) {
  const save = freshSave();
  save.unlocked = 6;
  const g = new Game(save, stage, 0, () => 0.5);
  g.weapons[0].timer = 999;
  g.spawnBudget = -1000;
  g.nextTrialBossAt = 999;
  g.bossSpawned = true;
  const boss = g.spawnEnemy(10, false, true, {
    x: -Math.cos(angle) * distance,
    y: -Math.sin(angle) * distance,
  });
  boss.pursuitCooldown = distance > 330 ? 0 : 999;
  boss.cooldown = distance > 330 ? 999 : 0;
  g.update(0.01);
  assert.ok(boss.charge > 0.7);
  boss.cooldown = 999;
  g.pickups.push({ x: boss.x * 2, y: boss.y * 2, kind: 'xp', value: 1, pull: false });
  return { g, boss };
}

function dodge(g: Game) {
  let hits = 0;
  g.onEvent = (event) => {
    if (event === 'hurt') hits++;
  };
  // 实际页面每120ms决策；预警恰好出现在上次决策之后，留出最坏反应延迟。
  for (let frame = 1; frame <= 85; frame++) {
    if (frame % 6 === 0) g.input = autoplayInput(g);
    g.update(0.02);
  }
  return hits;
}

test('七位妖王的远距离冲撞在预警期侧向躲避，路径上经验不抢优先级', () => {
  for (let stage = 0; stage < 7; stage++) {
    for (const angle of [0, Math.PI / 4, Math.PI / 2, Math.PI, -Math.PI / 3]) {
      const { g, boss } = encounter(stage, angle);
      const input = autoplayInput(g);
      assert.ok(Math.abs(input.x * boss.dy - input.y * boss.dx) > 0.9);
      assert.equal(dodge(g), 0, `妖王 ${stage}，方向 ${angle}`);
    }
  }
});

test('狼王近距离突袭和连续突袭能躲开，已侧移的玩家不会为经验折返穿线', () => {
  for (const distance of [130, 230, 320]) {
    for (const side of [-35, 0, 35]) {
      const { g, boss } = encounter(2, 0, distance);
      g.player.y = side;
      for (let round = 0; round < 3; round++) {
        assert.equal(dodge(g), 0, `距离 ${distance}，偏移 ${side}，第 ${round} 次`);
        assert.equal(boss.charge, 0);
        boss.x = g.player.x - distance;
        boss.y = g.player.y;
        boss.skillStep = 0;
        boss.cooldown = 0;
        boss.pursuitCooldown = 999;
        g.input = { x: 0, y: 0 };
        g.update(0.01);
        boss.cooldown = 999;
      }
    }
  }
});

test('第七境两王相向及交叉冲撞不会相互抵消躲避方向', () => {
  for (const angle of [Math.PI, Math.PI / 2, -Math.PI / 2]) {
    const { g } = encounter(6);
    const other = g.spawnEnemy(
      10,
      false,
      true,
      {
        x: -Math.cos(angle) * 500,
        y: -Math.sin(angle) * 500,
      },
      2,
    );
    other.pursuitCooldown = 0;
    other.cooldown = 999;
    g.update(0.01);
    assert.equal(dodge(g), 0, `第二条路径方向 ${angle}`);
  }
});

test('死亡妖王、已冲过及冲程外的妖王不触发额外躲避，续局能继续躲', () => {
  const { g, boss } = encounter(2);
  const restored = Game.restore(g.save, g.snapshot())!;
  assert.ok(restored);
  restored.resume();
  assert.equal(dodge(restored), 0);
  g.pickups = [{ x: 0, y: -1000, kind: 'xp', value: 1, pull: false }];
  for (const state of ['dead', 'passed', 'short']) {
    boss.dead = state === 'dead';
    boss.x = state === 'passed' ? 400 : -500;
    boss.charge = state === 'short' ? 0.1 : 1.55;
    const input = autoplayInput(g);
    assert.ok(Math.abs(input.x) < 1e-8 && input.y < -0.99, state);
  }
});

test('冲刺已经启动时开启AI仍会侧移，剩余冲程按实时位置计算', () => {
  const { g, boss } = encounter(2);
  boss.charge = 0.6;
  boss.x = -450;
  assert.equal(dodge(g), 0);
});
