import test from 'node:test';
import assert from 'node:assert/strict';
import { autoplayInput } from '../../src/battle/autoplay.ts';
import { Game } from '../../src/battle/game.ts';
import { freshSave } from '../../src/core/progress.ts';
import { TREASURES, tribulationRules } from '../../src/core/data.ts';

function encounter(round = 4, mode: 'normal' | 'extreme' = 'normal') {
  const save = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  save.cultivation = 1e9;
  save.unlocked = 6;
  save.tribulations = round - 1;
  save.age = save.nextTribulationAge = 20000;
  save.training = { vitality: 20, power: 20, speed: 20 };
  save.lifeMode = mode;
  const game = Game.createTribulation(save, null);
  game.random = () => 0.5;
  game.weapons[0].timer = 9999;
  return game;
}

test('前四劫完整参数不变，后续按同一公式递进并在各边界停止变化', () => {
  const early = [
    [5000, 0.25, 1.2, 3.4, 2.8, 0.26],
    [8000, 0.28, 1.1, 3.1, 2.5, 0.24],
    [12000, 0.32, 1, 2.8, 2.2, 0.22],
    [20000, 0.38, 0.85, 2.4, 1.8, 0.18],
  ];
  for (const [i, expected] of early.entries())
    assert.deepEqual(Object.values(tribulationRules(i + 1)), expected);
  const fifth = tribulationRules(5);
  for (const [key, value] of Object.entries({
    hp: 30000,
    damage: 0.43,
    warning: 0.75,
    interval: 2.1,
    opening: 1.5,
    openingDamage: 0.16,
  }))
    assert.ok(Math.abs(fifth[key as keyof typeof fifth] - value) < 1e-10, key);
  for (let round = 5; round < 100; round++) {
    const previous = tribulationRules(round - 1),
      current = tribulationRules(round);
    if (round <= 12) assert.ok(Math.abs(current.hp / previous.hp - 1.5) < 1e-12);
    else assert.equal(current.hp, previous.hp);
    assert.ok(Math.abs(current.damage - Math.min(1, previous.damage + 0.05)) < 1e-12);
    assert.ok(Math.abs(current.warning - Math.max(0.1, previous.warning - 0.1)) < 1e-12);
    assert.ok(Math.abs(current.interval - Math.max(1.2, previous.interval - 0.3)) < 1e-12);
    assert.ok(Math.abs(current.opening - Math.max(0.65, previous.opening - 0.3)) < 1e-12);
    assert.ok(
      Math.abs(current.openingDamage - Math.max(0.03, previous.openingDamage - 0.02)) < 1e-12,
    );
  }
  const last = tribulationRules(1000000);
  assert.deepEqual(
    [last.damage, last.warning, last.interval, last.opening, last.openingDamage],
    [1, 0.1, 1.2, 0.65, 0.03],
  );
  assert.equal(tribulationRules(12).hp, 512578.125);
  assert.equal(last.hp, tribulationRules(12).hp);
});

test('两模式天劫保持避让距离，末招期间持续走位且能经过完整反击窗口', () => {
  for (const mode of ['normal', 'extreme'] as const)
    for (const round of [4, 5]) {
      const game = encounter(round, mode);
      let lastSkillDecisions = 0,
        openings = 0,
        hits = 0,
        minimumClosedDistance = Infinity;
      game.onEvent = (event) => {
        if (event === 'hurt') hits++;
      };
      for (let frame = 0; frame < 3000; frame++) {
        if (frame % 6 === 0) {
          game.input = autoplayInput(game);
          if (game.tribulationStep === 4) {
            lastSkillDecisions++;
            assert.ok(Math.hypot(game.input.x, game.input.y) > 0.9);
          }
          if (game.tribulationVulnerable) openings++;
          else
            minimumClosedDistance = Math.min(
              minimumClosedDistance,
              Math.hypot(game.player.x, game.player.y),
            );
        }
        game.update(0.02);
      }
      assert.equal(game.state, 'playing', `${mode}/${round}`);
      assert.equal(hits, 0, `${mode}/${round}`);
      assert.ok(lastSkillDecisions > 20 && openings > 10);
      assert.ok(minimumClosedDistance > 175, `${minimumClosedDistance}`);
    }
});

test('核心近处及中心开自动会向外移动，不被目标吸引和排斥抵消成站定', () => {
  for (const [x, y] of [
    [0, 0],
    [0, 110],
    [110, 0],
    [-110, -50],
  ]) {
    const game = encounter();
    Object.assign(game.player, { x, y });
    game.input = autoplayInput(game);
    assert.ok(Math.hypot(game.input.x, game.input.y) > 0.9);
    game.tribulationNextAt = 999;
    const before = Math.hypot(x, y);
    for (let f = 0; f < 6; f++) game.update(0.02);
    assert.ok(Math.hypot(game.player.x, game.player.y) > before + 10);
  }
});

test('天劫直线雷弹在尚未贴身时预测相对轨迹，连续实际移动可避开', () => {
  const game = encounter();
  game.time = 10;
  game.tribulationStep = 4;
  game.tribulationNextAt = 999;
  game.player.x = 0;
  game.player.y = 220;
  game.shots.push({
    x: -180,
    y: 220,
    vx: 290,
    vy: 0,
    life: 3,
    radius: 8,
    damage: game.player.maxHp,
    color: '#d2b5ff',
    kind: 'hostile',
    pierce: 1,
    hit: new Set(),
    origin: { x: -180, y: 220 },
    age: 0,
    bounce: 0,
    crit: false,
  });
  const hp = game.player.hp;
  for (let frame = 0; frame < 45; frame++) {
    if (frame % 6 === 0) game.input = autoplayInput(game);
    game.update(0.02);
  }
  assert.equal(game.player.hp, hp);
  assert.equal(game.state, 'playing');
});

test('法宝拉开距离后仍有反击机会，包含一级近程法宝和全部六重仙器', () => {
  for (const level of [1, 6])
    for (const treasure of TREASURES) {
      const game = encounter();
      game.weapons = [{ id: treasure.id, level, evolved: level === 6, timer: 0 }];
      game.player.invincible = 1000; // 只隔离输出可达性，不作为躲避成功证据。
      const boss = game.boss!,
        before = boss.hp;
      for (let frame = 0; frame < 5000 && game.state === 'playing'; frame++) {
        if (frame % 6 === 0) game.input = autoplayInput(game);
        game.update(0.02);
        if (boss.hp < before) break;
      }
      assert.ok(boss.hp < before, `${treasure.id}/${level}`);
    }
});

test('天劫末招续局后按当前危险继续躲避，不添加AI持久状态', () => {
  const game = encounter();
  for (let frame = 0; game.tribulationStep !== 4 && frame < 1000; frame++) {
    if (frame % 6 === 0) game.input = autoplayInput(game);
    game.update(0.02);
  }
  assert.equal(game.tribulationStep, 4);
  const keys = Object.keys(game.snapshot()).sort();
  const restored = Game.restore(game.save, game.snapshot())!;
  assert.ok(restored);
  restored.resume();
  assert.deepEqual(autoplayInput(restored), autoplayInput(game));
  assert.deepEqual(Object.keys(restored.snapshot()).sort(), keys);
});
