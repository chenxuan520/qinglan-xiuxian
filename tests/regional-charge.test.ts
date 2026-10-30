import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { freshSave } from '../src/progress.ts';
import { ENEMIES, ENEMY_TACTICS, STAGE_ENEMIES } from '../src/data.ts';
import { regionalEnemyTactics, regionalEnemyFields } from '../src/regional-combat.ts';
import { bestiaryPanel } from '../src/bestiary-ui.ts';
import { autoplayInput } from '../src/autoplay.ts';

function arena(stage: number, type = [0, 35, 43, 51, 59][stage], elite = false) {
  const save = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  Object.assign(save, { unlocked: 6, cultivation: 10000, age: 900 });
  const g = new Game(save, stage, 0, () => 0.5);
  g.weapons[0].timer = 99999;
  g.spawnBudget = -10000;
  g.nextElite = g.nextTrialBossAt = 99999;
  g.bossSpawned = true;
  const e = g.spawnEnemy(type, elite, false, { x: -100, y: 0 });
  Object.assign(e, { speed: 0, cooldown: 9999, damage: 10 });
  return { g, e };
}
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
function advance(g: Game, s: number) {
  for (let t = 0; t < s - 1e-9; t += 0.01) g.update(Math.min(0.01, s - t));
}

test('二至五境全部普通与精英冲刺映射到地域技能，一、六、终关保持原分工', () => {
  const mapped = [
    'dash',
    'firecharge',
    'frostcharge',
    'miasmacharge',
    'soulcharge',
    'thundercharge',
  ] as const;
  for (let stage = 0; stage < 6; stage++)
    for (const type of STAGE_ENEMIES[stage]) {
      const base = ENEMY_TACTICS[type],
        actual = regionalEnemyTactics(stage, type, base, ENEMIES[type].behavior);
      for (const key of ['skill', 'eliteSkill'] as const) {
        if (base[key] === 'dash') assert.equal(actual[key], mapped[stage]);
      }
      assert.deepEqual(regionalEnemyTactics(6, type, base, ENEMIES[type].behavior), base);
    }
});

test('二至五境冲刺均保留原蓄势、209距离与380速度，冰路预警跟随额外0.3秒', () => {
  for (let stage = 1; stage <= 4; stage++)
    for (const elite of [false, true]) {
      const { g, e } = arena(stage, undefined, elite);
      g.castEnemySkill(e, 100, 1, 0);
      const charge = 1.25 + (stage === 2 ? (e.id % 2) * 0.3 : 0);
      assert.equal(e.charge, charge);
      if (stage === 2) {
        const z = g.zones[0];
        assert.equal(z.kind, 'enemy-frost');
        close(z.endX! - z.x, 209);
        close(z.delay, charge - 0.55);
        assert.equal(z.life, 1.3);
      }
      g.player.y = 500;
      g.updateEnemies(charge - 0.55);
      close(e.x, -100);
      g.updateEnemies(0.2);
      close(e.x, -24);
      g.updateEnemies(0.35);
      if (e.charge > 0) g.updateEnemies(e.charge);
      close(e.x, 109);
      close(e.charge, 0);
      const before = g.zones.length;
      g.updateEnemies(0.01);
      assert.equal(g.zones.length, before);
    }
});

test('深泽冲刺只在实际终点爆瘴，暂停与续局不重复，毒伤刷新三秒蚀体', () => {
  const { g, e } = arena(3);
  g.castEnemySkill(e, 100, 1, 0);
  assert.equal(g.zones.length, 0);
  g.updateEnemies(0.8);
  assert.equal(g.zones.length, 0);
  g.pause();
  const h = Game.restore(g.save, JSON.parse(JSON.stringify(g.snapshot())))!;
  assert.ok(h);
  h.update(0.05);
  assert.equal(h.zones.length, 0);
  h.resume();
  const restored = h.enemies.find((x) => x.id === e.id)!;
  h.updateEnemies(restored.charge);
  assert.equal(h.zones.length, 1);
  const z = h.zones[0];
  close(z.x, 109);
  close(z.y, 0);
  assert.equal(z.vx, 0);
  assert.equal(z.vy, 0);
  close(z.life, 4.8);
  assert.equal(z.delay, 1);
  assert.equal(z.damage, 6.5);
  h.player.x = z.x;
  h.player.invincible = 0;
  h.updateZones(1.01);
  assert.equal(h.corroded, 0);
  h.updateZones(0.01);
  assert.equal(h.corroded, 3);
  h.corroded = 1;
  h.player.invincible = 0;
  z.tick = 0;
  h.updateZones(0.01);
  assert.equal(h.corroded, 3);
  h.updateEnemies(0.1);
  assert.equal(h.zones.length, 1);
  assert.ok(Game.restore(h.save, JSON.parse(JSON.stringify(h.snapshot()))));
});

test('九幽只在实际冲刺接触时封宝，普通碰撞/蓄势不封，护体与保护间隔保留', () => {
  for (const phase of ['walk', 'windup', 'charge', 'immune', 'protected'] as const) {
    const { g, e } = arena(4);
    e.x = 0;
    if (phase !== 'walk') {
      e.dx = 1;
      e.dy = 0;
      e.charge = phase === 'windup' ? 1 : 0.1;
    }
    if (phase === 'immune') g.player.invincible = 1;
    if (phase === 'protected') {
      g.enemySeal();
      g.sealed = 0;
    }
    g.updateEnemies(0.01);
    assert.equal(g.sealed, phase === 'charge' ? 1 : 0, phase);
  }
  const { g, e } = arena(4);
  e.x = -3.8;
  e.charge = 0.01;
  e.dx = 1;
  g.updateEnemies(0.01);
  assert.equal(e.charge, 0);
  assert.equal(g.sealed, 1);
  assert.ok(Game.restore(g.save, JSON.parse(JSON.stringify(g.snapshot()))));
});

test('古墟火径沿用原伤害，拆两成为1.5秒灼烧；终关火径不新增灼烧', () => {
  for (const stage of [1, 6]) {
    const { g, e } = arena(stage, 31);
    g.addRegionalFields(e, regionalEnemyFields(e, 'firecharge', 1, 0)!);
    const z = g.zones[0];
    g.player.x = z.x + 50;
    z.delay = 0;
    const hp = g.player.hp;
    g.updateZones(0.01);
    close(hp - g.player.hp, z.damage * g.stats.armor * (stage === 1 ? 0.8 : 1));
    assert.equal(g.burning.life, stage === 1 ? 1.5 : 0);
    if (stage === 1) close(g.burning.damage, z.damage * g.stats.armor * 0.2);
  }
});

test('冰路和终点毒瘴均可被自动历练识别规避，不依赖伤害跳点忽略冰路', () => {
  for (const stage of [2, 3]) {
    const { g, e } = arena(stage);
    e.x = stage === 2 ? -50 : 50;
    if (stage === 2) {
      e.charge = 1.25;
      g.addRegionalFields(e, regionalEnemyFields(e, 'frostcharge', 1, 0)!);
    } else g.addRegionalFields(e, regionalEnemyFields(e, 'miasmacharge', 1, 0)!);
    g.enemies = [];
    const z = g.zones[0];
    z.delay = 0;
    z.tick = stage === 2 ? 10 : 0;
    z.damage = 25;
    g.player.hp = 100;
    g.player.x = 0;
    g.player.y = 0;
    g.pickups = [{ kind: 'xp', x: 80, y: 0, value: 3, pull: false }];
    const input = autoplayInput(g);
    assert.ok(Math.abs(input.y) > 0.1 || input.x < 0.9);
    if (stage === 2) {
      g.updateZones(0.01);
      assert.equal(g.slowed, 0.55);
    }
  }
});

test('妖物志列出各境新冲刺后果，终关不显示新增的冰冲、瘴冲与封魂扑杀', () => {
  for (const [stage, words] of [
    [1, '火痕，命中后灼烧'],
    [2, '冰路'],
    [3, '扑击终点'],
    [4, '冲撞命中后封宝1秒'],
  ] as const)
    assert.ok(bestiaryPanel(stage).body.includes(words), words);
  for (const word of ['踏霜扑杀', '迸瘴扑杀', '封魂扑杀'])
    assert.ok(!bestiaryPanel(6).body.includes(word));
});
