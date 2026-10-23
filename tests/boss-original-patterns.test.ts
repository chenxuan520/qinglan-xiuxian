import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { STAGES } from '../src/data.ts';
import { bossSkills, bossSkillCooldown } from '../src/boss-skills.ts';
import { freshSave } from '../src/progress.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';
import { bestiaryPanel } from '../src/bestiary-ui.ts';

function encounter(origin: number, phase: number, arena = 6) {
  const save = freshSave('heaven', ['metal'], 'dual', () => 0.5);
  save.unlocked = 6;
  save.completed = [0, 1, 2, 3, 4, 5];
  save.cultivation = 119940;
  const g = new Game(save, arena, 0, () => 0.5);
  g.spawnBudget = -10000;
  g.nextElite = g.nextTrialBossAt = 99999;
  g.bossSpawned = true;
  g.weapons[0].timer = 9999;
  g.player.invincible = 9999;
  const e = g.spawnEnemy(10, false, true, { x: -180, y: 0 }, origin);
  e.cooldown = e.pursuitCooldown = 9999;
  e.speed = 0;
  e.skillStep = phase;
  e.bossSkillQueue = bossSkills(origin, arena === 6)
    .map((_, i) => i)
    .filter((i) => i !== phase);
  return { g, e };
}

// 按实际攻击形态验收，防止同名招式被另一种几何替换仍让测试通过。
const patterns = [
  [
    [6, 0, 0],
    [0, 7, 0],
    [0, 0, 3],
  ],
  [
    [0, 9, 0],
    [5, 0, 0],
    [0, 16, 0],
  ],
  [
    [0, 0, 0],
    [0, 7, 0],
    [8, 0, 0],
  ],
  [
    [5, 0, 0],
    [0, 5, 0],
    [0, 0, 4],
  ],
  [
    [0, 0, 4],
    [0, 20, 0],
    [7, 0, 0],
  ],
  [
    [9, 0, 0],
    [0, 22, 0],
    [5, 0, 0],
  ],
  [
    [0, 24, 0],
    [5, 0, 0],
    [9, 0, 0],
    [0, 11, 0],
    [0, 0, 6],
    [1, 0, 0],
  ],
];
for (let origin = 0; origin < 7; origin++)
  for (const arena of origin === 6 ? [6] : [origin, 6])
    test(`${STAGES[origin].boss}在第${arena + 1}关逐招恢复原圆阵、弹幕、召唤或单次冲锋`, () => {
      assert.deepEqual(
        bossSkills(origin, arena === 6).slice(0, STAGES[origin].skills.length),
        STAGES[origin].skills,
      );
      for (let phase = 0; phase < patterns[origin].length; phase++) {
        const { g, e } = encounter(origin, phase, arena);
        g.castBossSkill(e, 1, 0);
        assert.ok(g.notice.includes(STAGES[origin].skills[phase]));
        assert.deepEqual(
          [g.zones.length, g.shots.length, g.enemies.length - 1],
          patterns[origin][phase],
          `招式${phase}`,
        );
        assert.ok(
          g.zones.every(
            (z) =>
              z.endX === undefined &&
              z.endY === undefined &&
              z.vx === undefined &&
              z.vy === undefined,
          ),
          '所有妖王地面攻击必须是固定圆形',
        );
        assert.ok(g.zones.every((z) => z.delay >= 1.2));
        assert.equal(
          e.charge > 0.7,
          (origin === 2 && phase === 0) || (origin === 6 && phase === 5),
        );
        assert.equal(e.chargeFollowup, undefined);
        const shown = bestiaryPanel(arena).body;
        assert.ok(shown.includes(STAGES[origin].skills[phase]));
        g.pause();
        const snapshot = JSON.parse(JSON.stringify(g.snapshot()));
        for (const h of [Game.restore(g.save, snapshot), importSave(exportSave(g.save, g)).run]) {
          assert.ok(h, `${origin}/${phase}续局`);
          assert.deepEqual(JSON.parse(JSON.stringify(h.zones)), snapshot.zones);
          assert.deepEqual(JSON.parse(JSON.stringify(h.enemies)), snapshot.enemies);
          h.update(0.5);
          assert.deepEqual(JSON.parse(JSON.stringify(h.zones)), snapshot.zones, '暂停不能推进攻击');
        }
      }
    });

test('环形木阵、冰牢、鬼牢和陨雷保留原落点，十字天雷保留九处圆阵与错拍', () => {
  for (const [origin, phase, count, ring, radius, life] of [
    [0, 0, 6, 130, 42, 2],
    [2, 2, 8, 145, 46, 2],
    [4, 2, 6, 165, 52, 2],
    [5, 2, 5, 95, 70, 0.5],
  ]) {
    const { g, e } = encounter(origin, phase, origin);
    Object.assign(g.player, { x: 87, y: -63 });
    g.castBossSkill(e, 1, 0);
    for (let i = 0; i < count; i++) {
      const z = g.zones[i];
      assert.ok(Math.abs(z.x - 87 - Math.cos((i / count) * Math.PI * 2) * ring) < 1e-8);
      assert.ok(Math.abs(z.y + 63 - Math.sin((i / count) * Math.PI * 2) * ring) < 1e-8);
      assert.equal(z.radius, radius);
      assert.equal(z.life, life);
    }
  }
  const { g, e } = encounter(5, 0, 5);
  g.castBossSkill(e, 1, 0);
  assert.deepEqual(
    g.zones.map((z) => [z.x, z.y, z.radius, z.delay]).sort(),
    [
      [-210, 0, 48, 1.2],
      [-105, 0, 48, 1.2],
      [0, 0, 48, 1.2],
      [105, 0, 48, 1.2],
      [210, 0, 48, 1.2],
      [0, -210, 48, 1.65],
      [0, -105, 48, 1.65],
      [0, 105, 48, 1.65],
      [0, 210, 48, 1.65],
    ].sort(),
  );
});

test('原生毒君与冥主保留特色追袭，其余远距蓄势冲锋，没有条带落阵', () => {
  for (let origin = 0; origin < 7; origin++)
    for (const arena of origin === 6 ? [6] : [origin, 6]) {
      const { g, e } = encounter(origin, 0, arena);
      e.x = -500;
      e.pursuitCooldown = 0;
      g.update(0.01);
      if (arena !== 6 && origin === 3) {
        assert.equal(e.charge, 0);
        assert.equal(g.zones.length, 1);
        assert.equal(g.zones[0].life, 6);
        assert.equal(g.zones[0].endX, undefined);
        continue;
      }
      if (arena !== 6 && origin === 4) {
        assert.equal(e.charge, 0);
        assert.equal(e.x, -260);
        assert.equal(g.zones.length, 0);
        continue;
      }
      assert.ok(e.charge > 0.7);
      assert.equal(e.x, -500);
      assert.equal(g.zones.length, 0);
      assert.ok(
        g.effects.some((f) => f.kind === 'line'),
        '原冲锋方向预警仍保留',
      );
    }
});

test('当前招式队列保存完整，已撤妖王条带清除且小怪区域保留', () => {
  for (let origin = 0; origin < 6; origin++) {
    const { g } = encounter(origin, 0);
    const raw = g.snapshot();
    raw.enemies[0].skillStep = 3;
    raw.enemies[0].bossSkillQueue = [0, 1, 2];
    const field = {
      x: 0,
      y: 0,
      endX: 300,
      endY: 0,
      radius: 20,
      life: 2,
      maxLife: 2,
      delay: 1.2,
      damage: 10,
      tick: 0,
      hostile: true,
      color: '#fff',
      kind: 'boss-flame',
    };
    raw.zones = [field];
    const h = Game.restore(g.save, raw);
    assert.ok(h);
    assert.equal(h.time, raw.time);
    assert.equal(h.boss!.hp, raw.enemies[0].hp);
    assert.equal(h.boss!.skillStep, 3);
    assert.deepEqual(h.boss!.bossSkillQueue, [0, 1, 2]);
    assert.deepEqual(h.zones, []);
    const native = encounter(origin, 0, origin);
    const mixed = native.g.snapshot();
    mixed.zones = [field, { ...field, kind: 'enemy-firepath' }];
    assert.deepEqual(Game.restore(native.g.save, mixed)!.zones, [
      { ...field, kind: 'enemy-firepath' },
    ]);
    for (const invalid of [bossSkills(origin, true).length, -1, 0.5]) {
      const broken = structuredClone(raw);
      broken.enemies[0].skillStep = invalid;
      assert.equal(Game.restore(g.save, broken), null);
    }
    const broken = structuredClone(raw);
    broken.enemies[0].bossSkillQueue = [1, 1];
    assert.equal(Game.restore(g.save, broken), null);
  }
});

test('双王同帧圆阵完整保留，危险区可重叠，不额外增加互锁', () => {
  const { g, e } = encounter(0, 0);
  const other = g.spawnEnemy(10, false, true, { x: e.x, y: e.y }, 0);
  Object.assign(other, {
    speed: 0,
    cooldown: 0,
    pursuitCooldown: 9999,
    skillStep: 0,
    bossSkillQueue: [1, 2],
  });
  e.cooldown = 0;
  g.update(0.01);
  assert.equal(g.zones.length, 12);
  assert.deepEqual(g.zones.slice(0, 6), g.zones.slice(6, 12));
  assert.equal(e.cooldown, bossSkillCooldown(0, true, false));
  assert.equal(other.cooldown, bossSkillCooldown(0, true, false));
});

test('原三招和新增第四招及仙尊六招每轮全部出齐且交界不连用，原冷却及半血强化保留', () => {
  for (let origin = 0; origin < 7; origin++)
    for (const enraged of [false, true]) {
      const { g, e } = encounter(origin, 0);
      e.bossSkillQueue = undefined;
      if (enraged) e.hp = e.maxHp * 0.4;
      const count = bossSkills(origin, true).length;
      let previous = -1;
      for (let round = 0; round < 5; round++) {
        const seen = new Set<number>();
        for (let i = 0; i < count; i++) {
          const phase = e.skillStep!;
          assert.notEqual(phase, previous);
          seen.add(phase);
          previous = phase;
          e.charge = 0;
          g.castBossSkill(e, 1, 0);
          assert.equal(
            e.cooldown,
            Math.max(bossSkillCooldown(origin, true, enraged), e.charge > 0 ? e.charge + 0.5 : 0),
          );
          g.zones = [];
          g.shots = [];
          g.enemies = [e];
        }
        assert.equal(seen.size, count);
      }
      if (origin < 6) {
        const native = encounter(origin, 1, origin);
        if (enraged) native.e.hp = native.e.maxHp * 0.4;
        native.g.castBossSkill(native.e, 1, 0);
        assert.equal(native.e.cooldown, bossSkillCooldown(origin, false, enraged));
      }
    }
});

test('每个原生及终关圆阵按真实圆边界命中：预警无伤，圈内受击，圈外安全', () => {
  const ground = [
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 0],
    [4, 2],
    [5, 0],
    [5, 2],
    [6, 1],
    [6, 2],
    [6, 5],
  ];
  for (const [origin, phase] of ground)
    for (const arena of origin === 6 ? [6] : [origin, 6])
      for (const inside of [false, true]) {
        const { g, e } = encounter(origin, phase, arena);
        g.castBossSkill(e, 1, 0);
        const z = g.zones[0];
        assert.ok(z, `${origin}/${phase}必须真的生成圆阵`);
        g.zones = [z];
        g.player.invincible = 0;
        Object.assign(g.player, { x: z.x + z.radius + 8 + (inside ? -0.1 : 0.1), y: z.y });
        const hp = g.player.hp;
        g.updateZones(z.delay / 2);
        assert.equal(g.player.hp, hp, '预警前半程不造成伤害');
        g.updateZones(z.delay + 0.001);
        assert.equal(g.player.hp, hp, '预警结束前不抢先造成伤害');
        g.updateZones(0.01);
        assert.equal(
          g.player.hp < hp,
          inside,
          `第${arena + 1}关妖王${origin}招式${phase}边界${inside ? '内' : '外'}`,
        );
      }
});

test('原环射保持完整360度和均匀缺口，扇射不偷偷变成条带；弹丸命中才扣血', () => {
  for (const [origin, phase, count, speed] of [
    [1, 2, 16, 150],
    [4, 1, 20, 165],
    [5, 1, 22, 175],
    [6, 0, 24, 185],
  ])
    for (const arena of origin === 6 ? [6] : [origin, 6]) {
      const { g, e } = encounter(origin, phase, arena);
      g.castBossSkill(e, 1, 0);
      const angles = g.shots.map((b) => Math.atan2(b.vy, b.vx)).sort((a, b) => a - b);
      assert.equal(angles.length, count);
      for (let i = 0; i < count; i++) {
        const b = g.shots[i];
        assert.ok(Math.abs(Math.hypot(b.vx, b.vy) - speed) < 1e-8);
        const gap =
          i === count - 1 ? angles[0] + 2 * Math.PI - angles[i] : angles[i + 1] - angles[i];
        assert.ok(
          Math.abs(gap - (2 * Math.PI) / count) < 1e-8,
          `第${arena + 1}关第${origin}王每个弹幕缺口应均匀`,
        );
      }
      const b = g.shots[0];
      g.shots = [b];
      g.player.invincible = 0;
      Object.assign(g.player, { x: b.x, y: b.y });
      const hp = g.player.hp;
      g.updateShots(0);
      assert.ok(g.player.hp < hp);
      assert.equal(g.shots.length, 0, '命中后弹丸消失，不重复伤害');
    }
  for (const [origin, phase, count, spread] of [
    [0, 1, 7, 1.15],
    [1, 0, 9, 1.5],
    [3, 1, 5, 0.75],
    [6, 3, 11, Math.PI * 1.2],
  ]) {
    const { g, e } = encounter(origin, phase, 6);
    const angle = 0.4;
    g.castBossSkill(e, Math.cos(angle), Math.sin(angle));
    assert.equal(g.shots.length, count);
    for (let i = 0; i < count; i++) {
      const expected = angle + (i / (count - 1) - 0.5) * spread;
      const b = g.shots[i];
      assert.ok(
        Math.abs(
          Math.atan2(
            Math.sin(Math.atan2(b.vy, b.vx) - expected),
            Math.cos(Math.atan2(b.vy, b.vx) - expected),
          ),
        ) < 1e-8,
      );
    }
    assert.equal(g.zones.length, 0, '扇射使用独立弹丸，不是地面条带');
  }
});
