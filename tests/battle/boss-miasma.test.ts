import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../src/battle/game.ts';
import { freshSave, realmDamageMultiplier } from '../../src/core/progress.ts';
import { DIFFICULTIES, STAGE_COMBAT_SCALING, STAGE_REALM_STEPS } from '../../src/core/data.ts';
import { exportSave, importSave } from '../../src/core/save-transfer.ts';
import { bestiaryPanel } from '../../src/content/bestiary-ui.ts';
import { regionalEnemyFields } from '../../src/battle/regional-combat.ts';
import { bossSkills } from '../../src/battle/boss-skills.ts';
import { guideContent } from '../../src/guide/guide.ts';
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

test('第四境三团毒瘴持续十二秒、速度95、半径75，三种难度与各方向相同，终关同值', () => {
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
          assert.equal(z.life, 12);
          assert.equal(z.maxLife, z.life);
          assert.ok(Math.abs(Math.hypot(z.vx!, z.vy!) - 95) < 1e-8);
          assert.equal(z.damage, boss.damage);
          assert.equal(z.radius, 75);
          assert.equal(z.endX, undefined);
        }
        for (const [index, side] of [-105, 0, 105].entries()) {
          const z = g.zones[index];
          assert.equal(z.x, g.player.x + nx * (side ? 60 : 0) - ny * side);
          assert.equal(z.y, g.player.y + ny * (side ? 60 : 0) + nx * side);
          assert.equal(z.vx, -ny * Math.sign(side || 1) * 95);
          assert.equal(z.vy, nx * Math.sign(side || 1) * 95);
        }
      }
});

test('第四境真实远距追袭生成十二秒、速度120、半径70的追云，终关同值', () => {
  for (const difficulty of [0, 1, 2]) {
    const { g, boss } = encounter(3, difficulty);
    boss.pursuitCooldown = 0;
    g.update(0.01);
    assert.equal(g.zones.length, 1);
    const z = g.zones[0];
    assert.equal(z.life, 12);
    assert.equal(z.maxLife, 12);
    assert.equal(z.vx, 120);
    assert.equal(z.vy, 0);
    assert.equal(z.castDelay, 1.2);
    assert.equal(z.damage, boss.damage * 0.8);
    assert.equal(z.radius, 70);
    const trial = encounter(6, difficulty);
    trial.boss.pursuitCooldown = 0;
    trial.g.update(0.01);
    const old = trial.g.zones[0];
    assert.equal(old.life, 12);
    assert.ok(Math.abs(Math.hypot(old.vx!, old.vy!) - 120) < 1e-8);
    assert.equal(old.vx, 120);
    assert.equal(old.vy, 0);
    assert.equal(old.radius, 70);
    assert.equal(old.castDelay, 1.2);
    assert.equal(old.damage, trial.boss.damage * 0.8);
  }
});

test('毒君原生气血按3.8倍率出生，未计难度及区域境界倍率的基础目标为18.62万', () => {
  for (const [difficulty, rules] of DIFFICULTIES.entries()) {
    const { boss } = encounter(3, difficulty);
    const expected =
      186200 *
      rules.hp *
      rules.bossHp[3] *
      STAGE_COMBAT_SCALING[3].hp *
      realmDamageMultiplier(STAGE_REALM_STEPS[3]);
    assert.ok(Math.abs(boss.maxHp - expected) < 1e-7);
    assert.equal(boss.hp, boss.maxHp);
  }
});

test('独立天劫保留毒瘴24/32速度、62/58半径及六秒时长，方向伤害预警不变', () => {
  for (const arena of [3, 6])
    for (const [nx, ny] of [
      [1, 0],
      [0.6, 0.8],
    ]) {
      const { g: source } = encounter(arena);
      const g = Game.createTribulation(structuredClone(source.save), source);
      const boss = g.boss!;
      // 只为直接覆盖天劫分支而指定毒君身份，不运行或修改天劫招式轮换。
      boss.bossStage = 3;
      assert.ok(g.tribulation > 0);
      g.castBossMechanic(boss, nx, ny);
      assert.equal(g.zones.length, 3);
      assert.deepEqual(
        g.zones.map((z) => z.delay),
        [1.45, 1.2, 1.45],
      );
      for (const [index, side] of [-105, 0, 105].entries()) {
        const z = g.zones[index];
        assert.equal(z.radius, 62);
        assert.equal(z.life, 6);
        assert.equal(z.maxLife, 6);
        assert.equal(z.damage, boss.damage);
        assert.equal(z.vx, -ny * Math.sign(side || 1) * 24);
        assert.equal(z.vy, nx * Math.sign(side || 1) * 24);
      }
      g.zones = [];
      g.castBossPursuit(boss, nx, ny);
      assert.equal(g.zones.length, 1);
      const z = g.zones[0];
      assert.equal(z.radius, 58);
      assert.equal(z.life, 6);
      assert.equal(z.maxLife, 6);
      assert.equal(z.castDelay, 1.2);
      assert.equal(z.damage, boss.damage * 0.8);
      assert.equal(z.x, boss.x + nx * 165);
      assert.equal(z.y, boss.y + ny * 165);
      assert.equal(z.vx, nx * 32);
      assert.equal(z.vy, ny * 32);
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
  assert.ok(Math.abs(z.y - before.y - 95 * 6.1) < 1e-7);
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

test('旧毒瘴快照的72/96速度和62/58半径继续按原记录恢复，不追改为新参数', () => {
  for (const arena of [3, 6])
    for (const pursuit of [false, true]) {
      const { g, boss } = encounter(arena);
      if (pursuit) g.castBossPursuit(boss, 1, 0);
      else g.castBossMechanic(boss, 1, 0);
      g.pause();
      const raw = g.snapshot();
      for (const z of raw.zones) {
        z.vx = pursuit ? 96 : 0;
        z.vy = pursuit ? 0 : 72;
        z.radius = pursuit ? 58 : 62;
      }
      const restored = Game.restore(g.save, raw);
      assert.ok(restored);
      assert.deepEqual(restored.zones, raw.zones);
      restored.update(0.5);
      assert.deepEqual(restored.zones, raw.zones, '旧局暂停后仍保持原记录');
    }
});

test('续局只允许第四境与终关妖王毒瘴的合法速度，不放行其他危险区与非有限速度', () => {
  for (const [arena, kind, speed] of [
    [3, 'boss-miasma', 120.01],
    [6, 'boss-miasma', 120.01],
    [3, 'enemy-miasma', 72],
    [3, 'boss-frost', 72],
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

test('固定毒池保持，小怪瘴云提速150%，图鉴中第四境和终关时长一致', () => {
  const { g, boss } = encounter();
  boss.skillStep = 0;
  g.castBossSkill(boss, 1, 0);
  assert.equal(g.zones.length, 5);
  assert.ok(g.zones.every((z) => z.life === 5 && z.vx === undefined));
  const enemy = g.spawnEnemy(50, false, false);
  const [cloud] = regionalEnemyFields(enemy, 'miasma', 1, 0)!;
  assert.ok(Math.abs(cloud.life - 4.8) < 1e-8);
  assert.equal(cloud.vx, 30);
  assert.equal(cloud.vy, 0);
  assert.equal(cloud.radius, 50);
  assert.equal(cloud.x, enemy.x + 75);
  assert.equal(cloud.y, enemy.y);
  const poison = /五毒游瘴<\/span> 三团漂移毒瘴，持续<span class="combat-unit">12秒<\/span>/;
  assert.match(bestiaryPanel(3).body, poison);
  assert.match(bestiaryPanel(6).body, poison);
  assert.doesNotMatch(bestiaryPanel(6).body, /持续<span class="combat-unit">6秒<\/span>/);
  const guide = guideContent('combat');
  const gameplay = readFileSync(new URL('../../docs/gameplay.md', import.meta.url), 'utf8');
  assert.match(
    guide,
    /第四境毒君的毒矢飞远后落地化瘴，另有更大更快的三团漂移毒瘴，游瘴与追云均持续12秒/,
  );
  assert.match(guide, /终关毒君的漂移毒瘴与追云同样持续12秒/);
  assert.match(gameplay, /第四境毒君的三团漂移毒瘴与远距追云持续12秒/);
  assert.match(gameplay, /终关毒君的两种移动毒瘴同样持续12秒/);
});
