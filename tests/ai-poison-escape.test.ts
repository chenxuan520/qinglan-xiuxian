import test from 'node:test';
import assert from 'node:assert/strict';
import { autoplayInput } from '../src/autoplay.ts';
import { Game, type Zone } from '../src/game.ts';
import { freshSave } from '../src/progress.ts';

function encounter(cultivation = 0, stage = 0) {
  const save = freshSave();
  save.cultivation = cultivation;
  const g = new Game(save, stage, 0, () => 0.5);
  g.weapons[0].timer = 999;
  g.spawnBudget = -1000;
  g.bossSpawned = true;
  g.pickups.push({ x: 1000, y: 0, kind: 'xp', value: 1, pull: false });
  return g;
}

function poison(x: number, y: number, radius: number, delay = 1.2, life = 5): Zone {
  return {
    x,
    y,
    radius,
    delay,
    life,
    maxLife: life,
    damage: 12,
    tick: 0,
    color: '#adbe73',
    kind: 'poison',
    hostile: true,
  };
}

function ring(g: Game, count: number, distance: number, radius: number, delay: number) {
  for (let i = 0; i < count; i++) {
    const angle = (i * Math.PI * 2) / count;
    g.zones.push(poison(Math.cos(angle) * distance, Math.sin(angle) * distance, radius, delay));
  }
}

function advance(g: Game, seconds: number, idle = false) {
  let hits = 0;
  let reversals = 0;
  let last = g.input;
  const samples: { time: number; x: number; y: number; covered: boolean }[] = [];
  g.onEvent = (event) => {
    if (event === 'hurt') hits++;
  };
  for (let frame = 0; frame < Math.round(seconds / 0.02); frame++) {
    if (frame % 6 === 0) {
      g.input = idle ? { x: 0, y: 0 } : autoplayInput(g);
      const length = Math.hypot(g.input.x, g.input.y);
      assert.ok(length < 1e-8 || Math.abs(length - 1) < 1e-8, '移动须为零或单位向量');
      if (g.input.x * last.x + g.input.y * last.y < -0.5) reversals++;
      last = g.input;
    }
    g.update(0.02);
    if (!idle) assert.equal(g.state, 'playing', '必须真实推进战斗，不能因暂停或死亡伪通过');
    samples.push({
      time: g.time,
      x: g.player.x,
      y: g.player.y,
      covered: g.zones.some(
        (z) => z.hostile && Math.hypot(g.player.x - z.x, g.player.y - z.y) < z.radius + 8,
      ),
    });
  }
  return { hits, reversals, samples };
}

test('重叠毒圈在预警结束前按真实移速撤离，不在斥力平衡点往返', (t) => {
  for (const slowed of [false, true]) {
    const g = encounter();
    if (slowed) g.slowed = 0.65;
    ring(g, 8, 125, 60, 1.6);
    g.zones.push(poison(0, 0, 80, 1.6));
    const result = advance(g, 3);
    const atWarningEnd = result.samples[79];
    t.diagnostic(JSON.stringify({ slowed, ...result, samples: atWarningEnd }));
    assert.equal(result.hits, 0, '有足够预警时间，不应留在重叠圈内受伤');
    assert.equal(atWarningEnd.covered, false);
    assert.ok(result.samples.slice(79).every((sample) => !sample.covered));
    assert.ok(result.reversals <= 1, '不能靠每次决策折返来假装移动');
  }
});

test('完整延迟毒环可以及时穿出，有缺口的短预警毒环选择出口', (t) => {
  for (const gap of [false, true]) {
    const g = encounter();
    ring(g, 8, 125, 60, gap ? 0.35 : 1.6);
    if (gap) {
      g.zones.shift();
      g.zones.push(poison(0, 0, 80));
      g.pickups[0].x = -1000;
    }
    const result = advance(g, 3);
    t.diagnostic(
      JSON.stringify({
        gap,
        hits: result.hits,
        reversals: result.reversals,
        x: g.player.x,
        y: g.player.y,
      }),
    );
    assert.equal(result.hits, 0);
    assert.ok(g.player.x > (gap ? 90 : 200), '应穿过尚未生效的毒环或抵达右侧安全缺口');
    assert.ok(result.samples.slice(79).every((sample) => !sample.covered));
    assert.ok(result.reversals <= 1);
  }
});

test('已在活跃重叠毒圈且有近身敌人时撤离，低血量也不留在原地挨打', async (t) => {
  function setup(lowHealth: boolean) {
    const g = encounter();
    ring(g, 8, 125, 60, 0);
    g.zones.push(poison(0, 0, 80, 0));
    const enemy = g.spawnEnemy(0, false, false, { x: -45, y: 0 });
    enemy.cooldown = 999;
    if (lowHealth) g.player.hp = 25;
    return g;
  }
  for (const lowHealth of [false, true]) {
    await t.test(lowHealth ? '低血量' : '满血', () => {
      const idle = setup(lowHealth);
      const idleResult = advance(idle, 4, true);
      const g = setup(lowHealth);
      const result = advance(g, 4);
      t.diagnostic(
        JSON.stringify({
          lowHealth,
          hits: result.hits,
          idleHits: idleResult.hits,
          hp: g.player.hp,
          x: g.player.x,
          y: g.player.y,
          reversals: result.reversals,
        }),
      );
      assert.equal(g.state, 'playing');
      assert.ok(result.hits <= 2 && result.hits < idleResult.hits);
      assert.ok(result.samples.slice(69).every((sample) => !sample.covered));
      assert.ok(result.reversals <= 1);
    });
  }
});

test('安全区域不为经验进入活跃毒圈，无危险时仍正常拾取', () => {
  for (const cultivation of [0, 1e9]) {
    const g = encounter(cultivation);
    if (!cultivation) g.player.hp = 25;
    g.zones.push({ ...poison(180, 0, 65, 0), damage: cultivation ? 1 : 12 });
    const result = advance(g, 3);
    assert.equal(result.hits, 0);
    assert.ok(result.samples.every((sample) => !sample.covered));
  }

  const safe = encounter();
  safe.pickups[0].x = 180;
  safe.pickups[0].y = 70;
  safe.zones.push({ ...poison(90, 35, 100, 0), hostile: false });
  assert.ok(autoplayInput(safe).x > 0.9);
  advance(safe, 2);
  assert.equal(safe.pickups.length, 0);
  assert.ok(safe.xp > 0);
});

test('安全小岛外毒圈即将消散时允许等待，不为保持移动强行受伤', (t) => {
  const g = encounter();
  ring(g, 8, 100, 90, 0);
  for (const z of g.zones) {
    z.life = z.maxLife = 0.3;
    z.tick = 0.2;
  }
  const result = advance(g, 2);
  t.diagnostic(JSON.stringify({ hits: result.hits, waiting: result.samples[11], x: g.player.x }));
  assert.equal(result.hits, 0);
  assert.ok(result.samples.slice(0, 12).every((sample) => Math.hypot(sample.x, sample.y) < 1));
  assert.ok(g.player.x > 200, '毒圈消散后恢复移动');
});

test('重叠毒圈撤离仍避开精英和妖王冲刺路径', () => {
  for (const boss of [false, true]) {
    const g = encounter();
    g.pickups[0].x = -1000;
    ring(g, 8, 125, 60, 1.6);
    g.zones.push(poison(0, 0, 80, 1.6));
    const enemy = g.spawnEnemy(boss ? 10 : 0, !boss, boss, { x: boss ? -500 : -180, y: 0 });
    enemy.cooldown = boss ? 999 : 0;
    enemy.pursuitCooldown = 0;
    g.update(0.01);
    assert.ok(enemy.charge > (boss ? 0.7 : 0.55));
    enemy.cooldown = 999;
    const result = advance(g, 2);
    assert.equal(result.hits, 0);
    assert.ok(result.samples.slice(79).every((sample) => !sample.covered));
  }
});

test('撤离途中按毒圈伤害和剩余寿命取舍，不因最短出口有毒就停住', (t) => {
  for (const life of [0.2, 5]) {
    const g = encounter();
    g.player.hp = 25;
    g.zones.push(poison(0, 0, 80, 0));
    g.zones.push({ ...poison(145, 0, 80, 0, life), damage: 80 });
    const result = advance(g, 3);
    t.diagnostic(JSON.stringify({ life, hits: result.hits, x: g.player.x, y: g.player.y }));
    assert.equal(result.hits, 1, '只承受起点不可避免的一次毒伤，不穿过高伤害区域');
    assert.ok(result.samples.slice(49).every((sample) => !sample.covered));
    if (life < 1) assert.ok(result.samples[49].x > 170, '到达前即消散的毒圈不阻止直线撤离');
    else
      assert.ok(
        // 真实更新在第1帧及之后每25帧触发伤害，间隔中擦过圈缘不算受击风险。
        result.samples
          .filter((_, frame) => frame % 25 === 0)
          .every((sample) => Math.hypot(sample.x - 145, sample.y) >= 88),
        '实际伤害时点必须避开高伤害圈',
      );
    assert.ok(result.reversals <= 1);
  }
});

test('第六王无后续伤害的五圈残影不阻挡低血量玩家避开致命敌弹', (t) => {
  for (const control of ['up', 'ai']) {
    const g = encounter(0, 5);
    const boss = g.spawnEnemy(10, false, true, { x: -500, y: 0 });
    boss.skillStep = 2;
    boss.cooldown = 0;
    boss.pursuitCooldown = 999;
    for (let frame = 0; frame < 70; frame++) g.update(0.02);
    assert.equal(g.zones.length, 5);
    for (const z of g.zones) {
      assert.ok(Math.abs(Math.hypot(z.x, z.y) - 95) < 1e-8);
      assert.equal(z.radius, 70);
      assert.ok(Math.abs(z.life - 0.3) < 1e-8);
      assert.ok(Math.abs(z.tick - 0.32) < 1e-8);
      assert.ok(z.tick > z.life, '由真实妖王技能推进至最后一次伤害后的视觉残圈');
    }
    g.enemies = [];
    g.player.hp = 25;
    assert.equal(g.stats.speed, 175);
    g.shots.push({
      x: -60,
      y: -15,
      vx: 230,
      vy: 0,
      damage: 80,
      radius: 7,
      life: 3,
      color: '#f0a5ab',
      kind: 'hostile',
      pierce: 1,
      hit: new Set(),
      origin: { x: -60, y: -15 },
      age: 0,
      bounce: 0,
      crit: false,
    });
    const started = g.time;
    let hits = 0;
    const decisions = [];
    g.onEvent = (event) => {
      if (event === 'hurt') hits++;
    };
    for (let frame = 0; frame < 100 && g.state === 'playing'; frame++) {
      if (frame % 6 === 0) {
        g.input = control === 'up' ? { x: 0, y: -1 } : autoplayInput(g);
        decisions.push(g.input);
      }
      g.update(0.02);
    }
    t.diagnostic(
      JSON.stringify({
        control,
        elapsed: g.time - started,
        hits,
        hp: g.player.hp,
        firstDecisions: decisions.slice(0, 2),
      }),
    );
    assert.equal(hits, 0, '视觉残圈不能让玩家原地等待致命敌弹');
    assert.equal(g.state, 'playing');
    assert.ok(Math.abs(g.time - started - 2) < 1e-8);
  }
});

test('延迟圈叠加tick倒计时、已经错过首tick的持续圈仍避开后续伤害', () => {
  for (const [delay, tick] of [
    [0.4, 0.2],
    [0, 0.05],
  ]) {
    const g = encounter();
    g.player.hp = 25;
    g.zones.push({ ...poison(170, 0, 60, delay, 3), tick, damage: 80 });
    const result = advance(g, 3);
    assert.equal(result.hits, 0, `delay=${delay}, tick=${tick}`);
    assert.ok(g.player.x > 250, '避开伤害后仍继续前行，不一直停住');
  }
});

test('无后续伤害tick的缚根与寒霜仍避让持续减速，不与视觉残圈混淆', () => {
  for (const kind of ['poison', 'enemy-roots', 'enemy-frost']) {
    const g = encounter();
    ring(g, 5, 95, 70, 0);
    for (const z of g.zones) {
      z.kind = kind;
      z.life = 0.3;
      z.tick = 0.32;
    }
    const result = advance(g, 0.24);
    assert.equal(result.hits, 0);
    assert.equal(g.slowed, 0);
    if (kind === 'poison') assert.ok(g.player.x > 35, '无害视觉残圈不应拦路');
    else
      assert.ok(
        result.samples.every((sample) => !sample.covered),
        '迟滞仍有效时不能穿圈',
      );
    assert.equal(advance(g, 2).hits, 0);
    assert.ok(g.player.x > 250);
  }
});
