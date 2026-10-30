import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { freshSave } from '../src/progress.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';
import { bestiaryPanel } from '../src/bestiary-ui.ts';
import { regionalEnemyFields } from '../src/regional-combat.ts';
import { bossSkills } from '../src/boss-skills.ts';
import { guideContent } from '../src/guide.ts';
import { readFileSync } from 'node:fs';

function encounter(arena = 3, difficulty = 0) {
  const save = freshSave('heaven', ['metal'], 'dual', () => 0.5);
  save.unlocked = 6;
  save.completed = [0, 1, 2, 3, 4, 5];
  save.cultivation = 119940;
  const g = new Game(save, arena, difficulty, () => 0.5);
  g.weapons[0].timer = 99999;
  g.spawnBudget = -10000;
  g.nextElite = g.nextTrialBossAt = 99999;
  g.bossSpawned = true;
  const boss = g.spawnEnemy(10, false, true, { x: -500, y: 0 }, 3);
  Object.assign(boss, {
    speed: 0,
    cooldown: 99999,
    pursuitCooldown: 99999,
    skillStep: 3,
    bossSkillQueue: bossSkills(3, arena === 6)
      .map((_, i) => i)
      .filter((i) => i !== 3),
  });
  return { g, boss };
}

test('第四境三团毒瘴持续十二秒、速度七十二，三种难度与各方向相同；终关保留原值', () => {
  for (const difficulty of [0, 1, 2])
    for (const [nx, ny] of [
      [1, 0],
      [0, -1],
      [0.6, 0.8],
      [Math.SQRT1_2, Math.SQRT1_2],
    ])
      for (const arena of [3, 6]) {
        const { g, boss } = encounter(arena, difficulty);
        g.castBossSkill(boss, nx, ny);
        assert.equal(g.zones.length, 3);
        assert.deepEqual(
          g.zones.map((z) => z.delay),
          [1.45, 1.2, 1.45],
        );
        for (const z of g.zones) {
          assert.equal(z.life, arena === 3 ? 12 : 6);
          assert.equal(z.maxLife, z.life);
          assert.ok(Math.abs(Math.hypot(z.vx!, z.vy!) - (arena === 3 ? 72 : 24)) < 1e-8);
          assert.equal(z.damage, boss.damage);
          assert.equal(z.radius, 62);
          assert.equal(z.endX, undefined);
        }
      }
});

test('第四境真实远距追袭生成十二秒、九十六速度的追云，终关追云仍为六秒与三十二', () => {
  for (const difficulty of [0, 1, 2]) {
    const { g, boss } = encounter(3, difficulty);
    boss.pursuitCooldown = 0;
    g.update(0.01);
    assert.equal(g.zones.length, 1);
    const z = g.zones[0];
    assert.equal(z.life, 12);
    assert.equal(z.maxLife, 12);
    assert.equal(z.vx, 96);
    assert.equal(z.vy, 0);
    assert.equal(z.castDelay, 1.2);
    assert.equal(z.damage, boss.damage * 0.8);
    assert.equal(z.radius, 58);
    const trial = encounter(6, difficulty);
    trial.boss.skillStep = 4;
    trial.g.castBossSkill(trial.boss, 0.6, 0.8);
    const old = trial.g.zones[0];
    assert.equal(old.life, 6);
    assert.ok(Math.abs(Math.hypot(old.vx!, old.vy!) - 32) < 1e-8);
  }
});

test('移动毒瘴预警冻结生命与位置，激活后持续十二秒并按既有周期伤害', () => {
  const { g, boss } = encounter();
  g.castBossSkill(boss, 1, 0);
  const z = g.zones[1];
  g.zones = [z];
  const hp = g.player.hp;
  const before = { x: z.x, y: z.y };
  for (let i = 0; i < 10; i++) g.updateZones(0.05);
  assert.equal(z.life, 12);
  assert.deepEqual({ x: z.x, y: z.y }, before);
  assert.equal(g.player.hp, hp);
  z.delay = 0;
  g.updateZones(0.05);
  assert.ok(g.player.hp < hp);
  assert.equal(z.tick, 0.5);
  const injured = g.player.hp;
  g.updateZones(0.05);
  assert.equal(g.player.hp, injured);
  Object.assign(g.player, { x: 10000, y: 10000 });
  for (let i = 0; i < 120; i++) g.updateZones(0.05);
  assert.ok(g.zones.includes(z), '原六秒结束后仍有毒瘴');
  assert.ok(Math.abs(z.y - before.y - 72 * 6.1) < 1e-7);
  for (let i = 0; i < 119; i++) g.updateZones(0.05);
  assert.equal(g.zones.length, 0, '十二秒后消散');
});

test('两种加速毒瘴暂停、刷新续局和导入往返保留速度与剩余时长', () => {
  for (const pursuit of [false, true]) {
    const { g, boss } = encounter();
    if (pursuit) {
      boss.pursuitCooldown = 0;
      g.update(0.01);
    } else g.castBossSkill(boss, Math.SQRT1_2, Math.SQRT1_2);
    g.pause();
    const raw = JSON.parse(JSON.stringify(g.snapshot()));
    for (const restored of [Game.restore(g.save, raw), importSave(exportSave(g.save, g)).run]) {
      assert.ok(restored);
      assert.deepEqual(restored.zones, raw.zones);
      restored.update(1);
      assert.deepEqual(restored.zones, raw.zones, '暂停不推进');
      restored.resume();
      restored.update(0.05);
      assert.ok(
        restored.zones.every((z) => z.life === 12),
        '预警尚未结束',
      );
    }
  }
});

test('续局只扩大第四境妖王毒瘴的合法速度，不放行其他危险区与非有限速度', () => {
  for (const [arena, kind, speed] of [
    [3, 'boss-miasma', 96.01],
    [6, 'boss-miasma', 72],
    [3, 'enemy-miasma', 72],
    [2, 'boss-frost', 72],
    [3, 'boss-miasma', Infinity],
    [3, 'boss-miasma', NaN],
  ] as const) {
    const { g, boss } = encounter(arena);
    g.castBossSkill(boss, 1, 0);
    assert.ok(Game.restore(g.save, g.snapshot()), '修改边界参数前必须是合法快照');
    const raw = g.snapshot();
    Object.assign(raw.zones[0], { kind, vx: speed, vy: 0 });
    assert.equal(Game.restore(g.save, raw), null, `${arena}/${kind}/${speed}`);
  }
});

test('固定毒池与小怪瘴云不受影响，图鉴区分第四境和终关的毒瘴时长', () => {
  const { g, boss } = encounter();
  boss.skillStep = 0;
  g.castBossSkill(boss, 1, 0);
  assert.equal(g.zones.length, 5);
  assert.ok(g.zones.every((z) => z.life === 5 && z.vx === undefined));
  const enemy = g.spawnEnemy(50, false, false);
  const [cloud] = regionalEnemyFields(enemy, 'miasma', 1, 0)!;
  assert.ok(Math.abs(cloud.life - 4.8) < 1e-8);
  assert.equal(cloud.vx, 12);
  assert.match(bestiaryPanel(3).body, /三团持续12秒的漂移毒瘴/);
  assert.match(bestiaryPanel(6).body, /三团持续6秒的漂移毒瘴/);
  assert.doesNotMatch(bestiaryPanel(6).body, /三团持续12秒的漂移毒瘴/);
  const guide = guideContent('combat');
  const gameplay = readFileSync(new URL('../docs/gameplay.md', import.meta.url), 'utf8');
  assert.match(guide, /第四境毒君另有三团持续12秒的漂移毒瘴，追云同样持续12秒/);
  assert.match(guide, /终关毒君的漂移毒瘴与追云持续6秒/);
  assert.match(gameplay, /第四境毒君的三团漂移毒瘴与远距追云持续12秒/);
  assert.match(gameplay, /终关毒君的两种移动毒瘴持续6秒/);
});
