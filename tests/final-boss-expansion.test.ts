import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { STAGES } from '../src/data.ts';
import { bossSkills, bossRegionalPhase, bossSkillCooldown } from '../src/boss-skills.ts';
import { freshSave, readSave, SAVE_SCHEMA } from '../src/progress.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';
import { bestiaryPanel } from '../src/bestiary-ui.ts';
import { autoplayInput } from '../src/autoplay.ts';

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

test('终关六王原三招编号不漂移；追加独有招式，仙尊仍为原六招', () => {
  const counts = [5, 6, 5, 6, 6, 7, 6];
  for (let origin = 0; origin < 7; origin++) {
    const skills = bossSkills(origin, true);
    assert.equal(skills.length, counts[origin]);
    assert.equal(new Set(skills).size, skills.length);
    assert.deepEqual(skills.slice(0, STAGES[origin].skills.length), STAGES[origin].skills);
    for (let phase = 0; phase < STAGES[origin].skills.length; phase++)
      assert.equal(bossRegionalPhase(origin, phase, true), undefined);
    assert.equal(bossSkills(origin, false).length, origin === 6 ? 6 : 3);
    for (const name of skills) assert.ok(bestiaryPanel(6).body.includes(name), name);
  }
});

test('每一追加招式实际生成不同攻击，暂停及导入导出保留状态与剩余队列', () => {
  for (let origin = 0; origin < 6; origin++)
    for (let phase = 3; phase < bossSkills(origin, true).length; phase++) {
      const { g, e } = encounter(origin, phase);
      g.castBossSkill(e, 1, 0);
      assert.ok(g.notice.includes(bossSkills(origin, true)[phase]));
      const regional = bossRegionalPhase(origin, phase, true);
      if (origin === 2 && regional === 0) {
        assert.equal(e.chargeFollowup, true);
        assert.ok(e.charge > 0.7);
      } else if (origin === 4 && regional === 1) {
        assert.equal(g.enemies.filter((child) => child.illusionOf === e.id).length, 3);
        assert.equal(e.y, 150);
      } else if (origin === 4 && regional === 3) {
        assert.equal(e.x, -260);
        assert.equal(g.zones.length, 0);
      } else {
        assert.ok(g.zones.length > 0, `${origin}/${phase}`);
        assert.ok(g.zones.every((z) => z.delay >= 1.2));
        assert.ok(g.zones.every((z) => z.endX !== undefined || z.vx !== undefined));
        if (origin === 3 && (regional === 0 || regional === 3)) {
          assert.ok(g.zones.every((z) => z.life === 6));
          assert.ok(g.zones.some((z) => z.vx || z.vy));
        }
      }
      g.pause();
      const raw = g.snapshot();
      g.update(0.5);
      assert.deepEqual(g.snapshot(), raw);
      const restored = Game.restore(g.save, structuredClone(raw));
      const imported = importSave(exportSave(g.save, g)).run;
      assert.ok(restored, `${origin}/${phase} restore`);
      assert.ok(imported, `${origin}/${phase} import`);
      for (const h of [restored, imported]) {
        assert.deepEqual(
          JSON.parse(JSON.stringify(h.enemies)),
          JSON.parse(JSON.stringify(raw.enemies)),
        );
        // 文件往返将数值 -0 规范为 0，其他几何与剩余时长须完全保留。
        assert.deepEqual(
          JSON.parse(JSON.stringify(h.zones)),
          JSON.parse(JSON.stringify(raw.zones)),
        );
        assert.deepEqual(
          h.shots.map((shot) => ({ ...shot, hit: [...shot.hit] })),
          raw.shots,
        );
      }
    }
});

test('双王同帧施法均完整落阵，重叠区域不被十四个上限吞掉，普通与原生预算不扩大', () => {
  const { g, e } = encounter(0, 3);
  for (let i = 0; i < 14; i++)
    g.zones.push({
      x: 800,
      y: 800,
      radius: 20,
      life: 10,
      maxLife: 10,
      delay: 10,
      damage: 1,
      tick: 0,
      hostile: true,
      color: '#fff',
      kind: 'boss-roots',
    });
  const other = g.spawnEnemy(10, false, true, { x: -180, y: 0 }, 0);
  Object.assign(other, {
    speed: 0,
    cooldown: 0,
    pursuitCooldown: 9999,
    skillStep: 3,
    bossSkillQueue: [0, 1, 2, 4],
  });
  e.cooldown = 0;
  g.update(0.01);
  assert.equal(g.zones.length, 20);
  assert.notEqual(e.skillStep, 3);
  assert.notEqual(other.skillStep, 3);
  assert.deepEqual(
    g.zones.slice(14, 17).map(({ sourceId, ...z }) => z),
    g.zones.slice(17, 20).map(({ sourceId, ...z }) => z),
  );
  assert.deepEqual(
    g.zones.slice(14).map((z) => z.sourceId),
    [e.id, e.id, e.id, other.id, other.id, other.id],
  );
  assert.equal(e.cooldown, 2.2);
  assert.equal(other.cooldown, 2.2);
  assert.ok(Game.restore(g.save, g.snapshot()));
  for (const boss of [true, false]) {
    const { g: native, e: caster } = encounter(0, 0, 0);
    native.zones = structuredClone(g.zones.slice(0, boss ? 14 : 10));
    caster.boss = boss;
    native.addRegionalFields(caster, [
      {
        x: 0,
        y: 0,
        radius: 20,
        life: 1,
        delay: 1.2,
        damageScale: 1,
        color: '#fff',
        kind: 'boss-roots',
        hostile: true,
      },
    ]);
    assert.equal(native.zones.length, boss ? 14 : 10);
  }
});

test('终关狼王保留单扑并另有二段扑击，第二次仍完整预警且可续局', () => {
  const old = encounter(2, 0);
  old.g.castBossSkill(old.e, 1, 0);
  assert.equal(old.e.chargeFollowup, undefined);
  const { g, e } = encounter(2, 3);
  g.castBossSkill(e, 1, 0);
  g.update(0.05);
  assert.equal(e.x, -180);
  g.pause();
  const h = Game.restore(g.save, g.snapshot())!;
  h.resume();
  let second = false;
  for (let i = 0; i < 80; i++) {
    const followup = h.boss!.chargeFollowup;
    h.update(0.025);
    if (followup && !h.boss!.chargeFollowup) {
      second = true;
      const x = h.boss!.x;
      assert.ok(h.boss!.charge > 0.7);
      h.update(0.05);
      assert.equal(h.boss!.x, x);
      break;
    }
  }
  assert.ok(second);
});

test('终关幻影无碰撞或奖励，一击即散，本体倒下只清其幻影，不改变旧召唤', () => {
  const { g, e } = encounter(4, 0);
  g.castBossSkill(e, 1, 0);
  const guards = g.enemies.filter((child) => !child.boss);
  assert.equal(guards.length, 4);
  assert.ok(guards.every((child) => child.summonedBy === undefined));
  e.skillStep = 3;
  g.castBossSkill(e, 1, 0);
  const illusions = g.enemies.filter((child) => child.illusionOf === e.id);
  assert.equal(illusions.length, 3);
  const before = [g.kills, g.iron, g.xp, g.damageDealt, g.combatCultivation, g.pickups.length];
  g.hitEnemy(illusions[0], 10000, false, 'sword');
  assert.equal(illusions[0].dead, true);
  assert.deepEqual(
    [g.kills, g.iron, g.xp, g.damageDealt, g.combatCultivation, g.pickups.length],
    before,
  );
  const direction = autoplayInput(g);
  assert.ok(Number.isFinite(direction.x) && Number.isFinite(direction.y));
  g.hitEnemy(e, e.hp, false, 'sword');
  assert.ok(illusions.every((child) => child.dead));
  assert.ok(guards.every((child) => !child.dead));
});

test('扩展编号只允许终关，越界队列与错误幻影/连扑场景仍拒绝', () => {
  for (const arena of [0, 1, 2, 3, 4, 5, 6]) {
    const { g } = encounter(arena < 6 ? arena : 5, 0, arena);
    const raw = g.snapshot();
    const count = bossSkills(arena < 6 ? arena : 5, arena === 6).length;
    raw.enemies[0].skillStep = count - 1;
    raw.enemies[0].bossSkillQueue = [];
    assert.ok(Game.restore(g.save, raw));
    raw.enemies[0].skillStep = count;
    assert.equal(Game.restore(g.save, raw), null);
  }
  const { g } = encounter(0, 0, 0);
  for (const invalid of [
    { chargeFollowup: true },
    { illusionOf: 123, boss: false, damage: 0, speed: 0 },
  ]) {
    const raw = g.snapshot();
    Object.assign(raw.enemies[0], invalid);
    assert.equal(Game.restore(g.save, raw), null);
  }
  assert.ok(SAVE_SCHEMA >= 30);
  const old = { ...g.save, schema: 29, activeRun: g.snapshot() };
  const loaded = readSave(JSON.stringify(old));
  assert.equal(loaded.status, 'ok');
  assert.equal(loaded.save?.cultivation, old.cultivation);
  assert.equal(loaded.save?.activeRun, undefined);
});

test('仅终关缩短常规出招间隔，前六境与预警不变', () => {
  for (let origin = 0; origin < 7; origin++)
    for (const enraged of [false, true]) {
      const { g, e } = encounter(origin, 1);
      if (enraged) e.hp = e.maxHp * 0.4;
      g.castBossSkill(e, 1, 0);
      assert.equal(e.cooldown, bossSkillCooldown(origin, true, enraged));
      assert.equal(e.cooldown, origin === 6 ? (enraged ? 1.1 : 1.8) : enraged ? 1.5 : 2.2);
      assert.ok(g.zones.every((z) => z.delay >= 1.2));
      if (origin < 6) {
        const native = encounter(origin, 1, origin);
        if (enraged) native.e.hp = native.e.maxHp * 0.4;
        native.g.castBossSkill(native.e, 1, 0);
        assert.equal(native.e.cooldown, enraged ? 1.85 : 3);
      }
    }
});
