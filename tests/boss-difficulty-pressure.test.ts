import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { DIFFICULTIES } from '../src/data.ts';
import { bossSkills, bossSkillCooldown, bossPursuitCooldown } from '../src/boss-skills.ts';
import { bossShotPose } from '../src/boss-mechanics.ts';
import { freshSave } from '../src/progress.ts';

const affected = (stage: number) => [1, 2, 3, 5].includes(stage);
const near = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) <= Math.max(1, Math.abs(expected)) * 1e-12);
function encounter(stage: number, difficulty: number, arena = stage) {
  const save = freshSave('heaven', ['metal'], 'dual', () => 0.5);
  save.unlocked = 6;
  save.completed = [0, 1, 2, 3, 4, 5];
  save.cultivation = 119940;
  const g = new Game(save, arena, difficulty, () => 0.5);
  const boss = g.spawnEnemy(10, false, true, { x: -180, y: 0 }, stage);
  boss.pursuitCooldown = 9999;
  return { g, boss };
}
function cast(c: ReturnType<typeof encounter>, phase: number, half = false) {
  const { g, boss } = c;
  boss.hp = boss.maxHp * (half ? 0.4 : 1);
  boss.skillStep = phase;
  boss.bossSkillQueue = bossSkills(boss.bossStage!, g.isFinalTrial)
    .map((_, i) => i)
    .filter((i) => i !== phase);
  g.castBossSkill(boss, 1, 0);
}

test('三档七境妖王出招与弹速倍率符合方案，不新增伤害倍率', () => {
  for (const [difficulty, rules] of DIFFICULTIES.entries()) {
    for (const [field, factor] of [
      ['bossCooldown', [1, 0.9, 0.8][difficulty]],
      ['bossShotSpeed', [1, 1.1, 1.2][difficulty]],
    ] as const) {
      assert.deepEqual(
        rules[field],
        Array.from({ length: 7 }, (_, stage) => (affected(stage) ? factor : 1)),
      );
    }
    assert.equal('bossDamage' in rules, false);
  }
});

test('原生妖王扇射/环射按难度提速及缩短常规冷却，终关七王保持基础值', () => {
  const patterns: [number, number, number[]][] = [
    [0, 1, Array(7).fill(165)],
    [1, 0, [...Array(9).fill(200), ...Array(8).fill(145)]],
    [1, 2, [...Array(20).fill(180), ...Array(20).fill(130)]],
    [2, 1, [...Array(3).fill(240), ...Array(2).fill(180), ...Array(2).fill(130)]],
    [3, 1, Array(5).fill(160)],
    [4, 1, Array(20).fill(200)],
    [5, 1, Array(22).fill(175)],
    [6, 0, Array(24).fill(185)],
  ];
  for (const [stage, phase, speeds] of patterns)
    for (const arena of new Set([stage, 6]))
      for (let difficulty = 0; difficulty < 3; difficulty++)
        for (const half of [false, true]) {
          const c = encounter(stage, difficulty, arena);
          cast(c, phase, half);
          const active = arena !== 6 && affected(stage);
          const speedFactor = active ? [1, 1.1, 1.2][difficulty] : 1;
          const cooldownFactor = active ? [1, 0.9, 0.8][difficulty] : 1;
          const expectedSpeeds = stage === 6 && half ? Array(32).fill(185) : speeds;
          assert.equal(c.g.shots.length, expectedSpeeds.length);
          c.g.shots.forEach((shot, i) => {
            near(Math.hypot(shot.vx, shot.vy), expectedSpeeds[i] * speedFactor);
            assert.equal(shot.damage, c.boss.damage * 0.75);
          });
          assert.equal(
            c.boss.cooldown,
            bossSkillCooldown(stage, arena === 6, half) * cooldownFactor,
          );
          assert.equal(c.boss.pursuitCooldown, 9999);
        }
});

test('回焰/逆行魂影/星位轮转的实际轨迹、寿命和预警不随新弹速倍率改变', () => {
  const shape = (g: Game) =>
    g.shots.map(({ damage: _damage, ...shot }) => ({
      shot,
      poses: [0, 0.8, 1.5, 2.8, 4].map((age) => bossShotPose(shot, age)),
    }));
  for (const stage of [1, 4, 5])
    for (const arena of [stage, 6]) {
      const base = encounter(stage, 0, arena);
      cast(base, 3);
      assert.ok(base.g.shots.length);
      for (const difficulty of [1, 2]) {
        const current = encounter(stage, difficulty, arena);
        cast(current, 3);
        assert.deepEqual(shape(current.g), shape(base.g));
        for (const shot of current.g.shots)
          assert.equal(shot.damage, current.boss.damage * (stage === 5 ? 0.85 : 0.6));
      }
    }
});

test('地面区域沿用原妖王伤害，几何、预警与持续时间不改', () => {
  for (const [stage, phase] of [
    [1, 1],
    [2, 2],
    [3, 0],
    [3, 3],
    [5, 0],
    [5, 2],
  ]) {
    const base = encounter(stage, 0);
    cast(base, phase);
    assert.ok(base.g.zones.length);
    const shape = (g: Game) => g.zones.map(({ damage: _damage, ...zone }) => zone);
    for (const difficulty of [1, 2]) {
      const current = encounter(stage, difficulty);
      cast(current, phase);
      assert.deepEqual(shape(current.g), shape(base.g));
      assert.ok(current.g.zones.every((zone) => zone.damage === current.boss.damage));
    }
  }
});

test('冲刺原蓄力和保护下限保留，追袭冷却不乘新常规间隔倍率', () => {
  for (const difficulty of [0, 1, 2])
    for (const half of [false, true]) {
      const c = encounter(2, difficulty);
      cast(c, 0, half);
      near(c.boss.charge, 0.425 + 0.7);
      assert.equal(
        c.boss.cooldown,
        Math.max(bossSkillCooldown(2, false, half) * [1, 0.9, 0.8][difficulty], 1.625),
      );
      assert.equal(c.boss.pursuitCooldown, bossPursuitCooldown(half));
      near(c.g.effects.find((effect) => effect.kind === 'line')!.maxLife, 0.425);
    }
});

test('高难度独立天劫核心与妖王扇射不叠加两组压力倍率', () => {
  for (const stage of [1, 2, 3, 5])
    for (const difficulty of [0, 1, 2]) {
      const source = encounter(stage, difficulty);
      source.g.save.age = source.g.save.nextTribulationAge = 20000;
      const original = Game.createTribulation(source.g.save, source.g);
      assert.equal(original.difficulty, 0, '实际独立天劫统一使用原难度规则');
      const raw = original.snapshot();
      raw.difficulty = difficulty;
      const g = Game.restore(original.save, raw)!;
      assert.ok(g, '额外覆盖高难度天劫快照的倍率隔离边界');
      assert.ok(g.tribulation);
      const boss = g.spawnEnemy(10, false, true, { x: -180, y: 0 }, 1);
      cast({ g, boss }, 0);
      assert.equal(boss.cooldown, bossSkillCooldown(1, false, false));
      assert.equal(g.shots.length, 17);
      g.shots.forEach((shot, i) => near(Math.hypot(shot.vx, shot.vy), i < 9 ? 200 : 145));
    }
});
