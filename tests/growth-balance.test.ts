import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import {
  freshSave,
  realmCost,
  parseSave,
  realmBonuses,
  realmHealthMultiplier,
  realmDamageMultiplier,
} from '../src/progress.ts';
import { SPIRIT_ROOTS, STAGES, type CultivationPath, type SpiritRootId } from '../src/data.ts';
import { spiritPower } from '../src/spirit-power.ts';

const cultivationAt = (step: number) =>
  Array.from({ length: step }, (_, i) => realmCost(i)).reduce((a, b) => a + b, 0);

function fixture(step: number, path: CultivationPath = 'dual', root: SpiritRootId = 'heaven') {
  const save = freshSave(root);
  save.path = path;
  save.cultivation = cultivationAt(step);
  if (step === 24) save.completed = [6];
  return save;
}

test('境界独立乘区每大境气血翻倍、伤害三倍，小境基底加10%，真仙气血三倍、伤害五倍', () => {
  for (let step = 0; step <= 26; step++) {
    const capped = Math.min(step, 23);
    assert.equal(
      realmHealthMultiplier(step),
      2 ** Math.floor(capped / 3) * 1.1 ** (capped % 3) * (step >= 24 ? 3 : 1),
    );
    assert.equal(
      realmDamageMultiplier(step),
      3 ** Math.floor(capped / 3) * 1.1 ** (capped % 3) * (step >= 24 ? 5 : 1),
    );
    if (step >= 24) assert.deepEqual(realmBonuses(step), realmBonuses(23));
    if (step < 23 && step % 3 < 2) {
      assert.ok(
        Math.abs(realmHealthMultiplier(step + 1) / realmHealthMultiplier(step) - 1.1) < 1e-12,
      );
      assert.ok(
        Math.abs(realmDamageMultiplier(step + 1) / realmDamageMultiplier(step) - 1.1) < 1e-12,
      );
      assert.equal(realmBonuses(step + 1).hp - realmBonuses(step).hp, 3);
      assert.ok(
        Math.abs(realmBonuses(step + 1).damage - realmBonuses(step).damage - 0.025) < 1e-12,
      );
    }
  }
});

test('各灵根满根基满功法仍保留大境倍数差距，小境在原加法收益上提升10%', () => {
  for (const root of SPIRIT_ROOTS)
    for (const level of [0, 20])
      for (const step of [3, 6, 9, 12, 15, 18, 21]) {
        const games = [step - 1, step, step + 1, step + 2].map((realm) => {
          const save = fixture(realm, 'dual', root.id);
          save.training = { vitality: level, power: level, speed: level };
          const g = new Game(save, 0, 0);
          if (level) {
            g.passives = { power: 5, blood: 5, guard: 5 };
            g.state = 'upgrade';
            g.choices = [{ type: 'passive', id: 'bone', level: 5 }];
            assert.equal(g.choose(0), true);
          }
          return g;
        });
        const [before, after, minor, late] = games;
        const label = `${root.id} 根基 ${level} 境界 ${step}`;
        assert.ok(after.stats.damage / before.stats.damage >= 3 / 1.21, `${label} 跨境伤害`);
        assert.ok(after.player.maxHp / before.player.maxHp >= 1.65, `${label} 跨境气血`);
        assert.ok(late.stats.damage / before.stats.damage >= 3, `${label} 同阶段伤害`);
        assert.ok(late.player.maxHp / before.player.maxHp >= 2, `${label} 同阶段气血`);
        assert.ok(minor.player.maxHp / after.player.maxHp > 1.1, `${label} 小境气血`);
        assert.ok(minor.stats.damage / after.stats.damage > 1.1, `${label} 小境伤害`);
        const expected =
          (1.1 * (1 + realmBonuses(step + 1).damage)) / (1 + realmBonuses(step).damage);
        assert.ok(Math.abs(minor.stats.damage / after.stats.damage - expected) < 1e-12);
      }
});

test('淬体每阶加5%至二十阶翻倍，金刚五重加50%，各境界灵根路线保持独立乘区', () => {
  for (const root of SPIRIT_ROOTS)
    for (const path of ['orthodox', 'demonic', 'dual'] as const)
      for (let step = 0; step <= 24; step++)
        for (const vitality of [0, 1, 10, 20]) {
          const save = fixture(step, path, root.id);
          save.training.vitality = vitality;
          const g = new Game(save, 0, 0);
          const base = root.baseHp + realmBonuses(step).hp;
          const pathHealth = path === 'orthodox' ? 1.12 : 1;
          const expected = base * (1 + vitality * 0.05);
          const label = `${root.id} ${path} 境界 ${step} 淬体 ${vitality}`;
          assert.equal(
            g.player.maxHp,
            Math.round(expected * pathHealth * realmHealthMultiplier(step)),
            label,
          );
          assert.equal(g.player.hp, g.player.maxHp, label);
          if (path === 'demonic') continue;
          g.player.hp -= 17;
          for (let guard = 1; guard <= 5; guard++) {
            g.state = 'upgrade';
            g.choices = [{ type: 'passive', id: 'guard', level: guard }];
            assert.equal(g.choose(0), true);
            assert.equal(
              g.player.maxHp,
              Math.round(expected * (1 + guard * 0.1) * pathHealth * realmHealthMultiplier(step)),
              label,
            );
            assert.equal(g.player.maxHp - g.player.hp, 17, label);
            assert.equal(g.stats.armor, 1 - guard * 0.06, label);
          }
        }
});

test('增伤功法与魔道共用原加法池，但不再被境界稀释，悟道劫印闭关和药效保持相乘', () => {
  for (const root of SPIRIT_ROOTS)
    for (const path of ['orthodox', 'demonic', 'dual'] as const)
      for (let step = 0; step <= 24; step++) {
        const save = fixture(step, path, root.id);
        save.training.power = 20;
        save.tribulations = 3;
        save.retreatBonus.power = 17;
        save.medicine.active.heqi = save.age + 100;
        const g = new Game(save, 0, 0);
        const base = g.stats.damage;
        const pathDamage = path === 'demonic' ? 0.12 : 0;
        const label = `${root.id} ${path} 境界 ${step}`;
        const independent =
          (1 + realmBonuses(step).damage) *
          (1 + (20 * root.powerPerLevel) / 100) *
          1.06 *
          1.17 *
          realmDamageMultiplier(step) *
          1.18;
        assert.ok(Math.abs(base / independent - (1 + pathDamage)) < 1e-12, label);
        let combined = pathDamage;
        const build: Record<string, number> = {};
        for (const [id, rate, school] of [
          ['power', 0.12, 'orthodox'],
          ['spirit', 0.04, 'orthodox'],
          ['blood', 0.18, 'demonic'],
          ['forbidden', 0.08, 'demonic'],
        ] as const) {
          if (path !== 'dual' && path !== school) continue;
          for (const level of [1, 5]) {
            g.passives = { [id]: level };
            assert.ok(
              Math.abs(g.stats.damage / base - (1 + pathDamage + level * rate) / (1 + pathDamage)) <
                1e-12,
              `${label} ${id} ${level}`,
            );
          }
          build[id] = 5;
          combined += 5 * rate;
        }
        g.passives = build;
        assert.ok(
          Math.abs(g.stats.damage / base - (1 + combined) / (1 + pathDamage)) < 1e-12,
          label,
        );
      }
});

test('真仙在相同灵根、路线和功法根基下伤害五倍、气血三倍，成仙条件不足不提前获得', () => {
  for (const root of SPIRIT_ROOTS)
    for (const path of ['orthodox', 'demonic', 'dual'] as const)
      for (const level of [0, 20]) {
        const save = fixture(24, path, root.id);
        save.completed = [];
        save.training = { vitality: level, power: level, speed: level };
        save.tribulations = 3;
        save.retreatBonus.power = 17;
        save.retreatBonus.vitality = 11;
        const before = new Game(save, 0, 0);
        const after = new Game({ ...save, completed: [6] }, 0, 0);
        const late = new Game(
          { ...save, completed: [6], cultivation: cultivationAt(24) - 1 },
          0,
          0,
        );
        assert.equal(before.realm, 23);
        assert.equal(after.realm, 24);
        assert.equal(late.realm, 23);
        for (const healthBuild of [false, true]) {
          for (const game of [before, after, late]) {
            game.passives = healthBuild
              ? { power: 5, blood: 5, guard: 5 }
              : { power: 5, blood: 5, spirit: 4, forbidden: 3 };
            if (healthBuild) {
              game.state = 'upgrade';
              game.choices = [{ type: 'passive', id: 'bone', level: 5 }];
              assert.equal(game.choose(0), true);
            }
          }
          const label = `${root.id} ${path} 根基 ${level} 气血功法 ${healthBuild}`;
          assert.ok(Math.abs(after.stats.damage / before.stats.damage - 5) < 1e-12, label);
          // 两境分别在最终气血取整，三倍比较最多相差 1 点。
          assert.ok(Math.abs(after.player.maxHp - before.player.maxHp * 3) <= 1, label);
          assert.equal(before.stats.damage, late.stats.damage, label);
          assert.equal(before.player.maxHp, late.player.maxHp, label);
        }
      }
});

function swordDamage(
  step: number,
  forge: number,
  root: SpiritRootId = 'heaven',
  power = 0,
  passives: Record<string, number> = {},
) {
  const save = fixture(step, 'dual', root);
  save.forge.sword = forge;
  save.training.power = power;
  save.starter = 'sword';
  const g = new Game(save, 0, 0, () => 0.99);
  g.passives = passives;
  const enemy = g.spawnEnemy(0, false, false, { x: 100, y: 0 });
  enemy.hp = enemy.maxHp = 1e8;
  enemy.speed = enemy.damage = 0;
  for (let i = 0; i < 10; i++) g.update(0.05);
  assert.ok(g.damageDealt > 0);
  return g.damageDealt;
}

test('攻法独立乘区进入实际法宝命中与伤害统计，低境至真仙收益一致', () => {
  for (const root of SPIRIT_ROOTS)
    for (const step of [0, 1, 9, 23, 24]) {
      const base = swordDamage(step, 0, root.id, 20);
      const trained = swordDamage(step, 0, root.id, 20, {
        power: 5,
        spirit: 5,
        blood: 5,
        forbidden: 5,
      });
      assert.ok(
        Math.abs(trained / base - (1 + 5 * 0.12 + 5 * 0.04 + 5 * 0.18 + 5 * 0.08)) < 1e-8,
        `${root.id} 境界 ${step}`,
      );
    }
});

test('同境界灵根直接命中只保留既有五行与悟道倍率，没有新增隐藏伤害项', () => {
  for (const step of [0, 9, 23, 24])
    for (const power of [0, 20]) {
      const base = swordDamage(step, 0, 'none');
      for (const root of SPIRIT_ROOTS) {
        const save = fixture(step, 'dual', root.id);
        save.training.power = power;
        const g = new Game(save, 0, 0);
        const training = 1 + (power * root.powerPerLevel) / 100;
        assert.equal(
          g.stats.damage,
          (1 + realmBonuses(step).damage) * training * realmDamageMultiplier(step),
        );
        const expected = training * (1 + root.damageBonus / 100);
        assert.ok(
          Math.abs(swordDamage(step, 0, root.id, power) / base - expected) < 1e-8,
          `${root.id} 境界 ${step}`,
        );
      }
    }
});

test('入场本命伤害展示与一重非暴击实际命中一致，包含炼器、五行与悟道', () => {
  for (const step of [0, 6, 9, 23, 24])
    for (const root of ['heaven', 'five', 'none'] as const) {
      const save = fixture(step, 'dual', root);
      save.starter = 'sword';
      save.forge.sword = 5;
      save.training.power = 10;
      const before = JSON.stringify(save);
      assert.ok(Math.abs(spiritPower(save).weaponDamage - swordDamage(step, 5, root, 10)) < 1e-8);
      assert.equal(JSON.stringify(save), before);
    }
});

test('自然回复只乘一次境界，功法、法宝与宝匣按最大气血回复，不重复放大', () => {
  for (const root of SPIRIT_ROOTS)
    for (const path of ['orthodox', 'demonic', 'dual'] as const)
      for (const vitality of [0, 20])
        for (const step of [0, 1, 9, 23, 24]) {
          const save = fixture(step, path, root.id);
          save.training.vitality = vitality;
          save.tribulations = 2;
          save.retreatBonus.vitality = 7;
          if (vitality) {
            save.medicine.used.peiying = 3;
            save.medicine.active = {
              zhenyuan: save.age + 100,
              yangjing: save.age + 100,
              dingling: save.age + 100,
            };
          }
          const g = new Game(save, 0, 0, () => 0.99);
          const duration = path === 'demonic' ? 0 : 3;
          const devour = path === 'orthodox' ? 0 : 2;
          if (duration) g.passives.duration = duration;
          if (devour) g.passives.devour = devour;
          g.state = 'upgrade';
          g.choices = [{ type: 'passive', id: path === 'demonic' ? 'bone' : 'guard', level: 5 }];
          assert.equal(g.choose(0), true);
          g.weapons = [];
          const health = realmHealthMultiplier(step);
          const medicineRegen = vitality ? 1.15 * 1.3 * 1.2 : 1;
          const regen =
            (root.baseRegen * medicineRegen * health + duration * g.player.maxHp * 0.001) *
            (path === 'orthodox' ? 1.2 : 1) *
            (1 - devour * 0.04 * (vitality ? 0.5 : 1));
          const killHeal = devour * g.player.maxHp * 0.0005;
          assert.equal(g.stats.regen, regen);
          assert.equal(g.stats.killHeal, killHeal);
          g.player.hp = g.player.maxHp / 2;
          const before = g.player.hp;
          g.update(0.05);
          assert.ok(Math.abs(g.player.hp - before - regen * 0.05) < 1e-8);
          const enemy = g.spawnEnemy(0, false, false, { x: 100, y: 0 });
          const wounded = g.player.hp;
          g.hitEnemy(enemy, enemy.maxHp);
          assert.ok(Math.abs(g.player.hp - wounded - killHeal) < 1e-8);
          const healed = g.player.hp;
          g.hitEnemy(enemy, enemy.maxHp);
          assert.equal(g.player.hp, healed);
          const target = g.spawnEnemy(0, false, false, { x: 100, y: 0 });
          target.hp = target.maxHp = 1e8;
          const second = g.spawnEnemy(0, false, false, { x: 100, y: 0 });
          second.hp = second.maxHp = 1e8;
          for (const kind of ['cauldron', 'bloodpool']) {
            g.player.hp = before;
            g.zones = [
              {
                x: 100,
                y: 0,
                radius: 60,
                life: 1,
                maxLife: 1,
                damage: 1,
                tick: 0,
                color: '#fff',
                kind,
                delay: 0,
                hostile: false,
              },
            ];
            g.updateZones(0.01);
            assert.ok(
              Math.abs(
                g.player.hp - before - g.player.maxHp * (kind === 'cauldron' ? 0.0015 : 0.001),
              ) < 1e-8,
            );
            const tickHealed = g.player.hp;
            g.updateZones(0.01);
            assert.equal(g.player.hp, tickHealed);
            g.zones[0].x = 1000;
            g.zones[0].tick = 0;
            g.updateZones(0.01);
            assert.equal(g.player.hp, tickHealed);
          }
          for (const kind of ['chest', 'heal'] as const) {
            g.player.hp = before;
            g.pickups = [{ x: 0, y: 0, kind, value: 1, pull: false }];
            g.updatePickups(0.01);
            assert.ok(
              Math.abs(g.player.hp - before - g.player.maxHp * (kind === 'chest' ? 0.05 : 0.3)) <
                1e-8,
            );
          }
        }
});

test('百分比回血不超过上限，零血与致命伤后即使击杀或拾取也不能复活', () => {
  for (const step of [0, 9, 24])
    for (const source of ['regen', 'devour', 'cauldron', 'bloodpool', 'chest', 'heal'] as const)
      for (const state of ['wounded', 'zero', 'overkill']) {
        const save = fixture(step);
        save.training.vitality = 20;
        const g = new Game(save, 0, 0, () => 0.99);
        g.passives = { duration: 5, devour: 5 };
        g.weapons = [];
        g.player.hp = state === 'zero' ? 0 : g.player.maxHp - 0.0001;
        if (state === 'overkill') g.hurtPlayer(g.player.maxHp * 2);
        const before = g.player.hp;
        if (source === 'regen') g.update(0.01);
        else if (source === 'devour') {
          const enemy = g.spawnEnemy(0, false, false, { x: 1000, y: 0 });
          g.hitEnemy(enemy, enemy.maxHp);
          assert.equal(g.kills, 1);
        } else if (source === 'cauldron' || source === 'bloodpool') {
          const enemy = g.spawnEnemy(0, false, false, { x: 1000, y: 0 });
          g.zones = [
            {
              x: 1000,
              y: 0,
              radius: 60,
              life: 1,
              maxLife: 1,
              damage: enemy.maxHp,
              tick: 0,
              color: '#fff',
              kind: source,
              delay: 0,
              hostile: false,
            },
          ];
          g.updateZones(0.01);
          assert.equal(g.kills, 1);
        } else {
          g.pickups = [{ x: 0, y: 0, kind: source, value: 1, pull: false }];
          g.updatePickups(0.01);
          assert.equal(g.pickups.length, 0);
        }
        const label = `境界 ${step} ${source} ${state}`;
        assert.equal(
          g.player.hp,
          state === 'wounded' ? g.player.maxHp : source === 'regen' ? 0 : before,
          label,
        );
        g.update(0.01);
        assert.equal(g.state, state === 'wounded' ? 'playing' : 'lost', label);
        assert.equal(g.player.hp, state === 'wounded' ? g.player.maxHp : 0, label);
      }
});

test('炼器前五阶保留，高阶实际命中收益递增，十阶为未炼器的2.5倍', () => {
  const base = swordDamage(0, 0);
  const expected = [1, 1.08, 1.16, 1.24, 1.32, 1.4, 1.52, 1.68, 1.88, 2.14, 2.5];
  for (let level = 0; level <= 10; level++)
    assert.ok(Math.abs(swordDamage(0, level) / base - expected[level]) < 1e-8);
  assert.ok(swordDamage(0, 10) / swordDamage(0, 9) > 1.16);
  assert.ok(Math.abs(swordDamage(24, 10) / swordDamage(23, 10) - 5) < 1e-8);
});

test('旧档炼器等级保留，灵威使用相同炼器收益且不修改存档', () => {
  const save = fixture(21);
  save.forge.sword = 10;
  const restored = parseSave(JSON.stringify(save));
  const snapshot = JSON.stringify(restored);
  const score = spiritPower(restored).score;
  const noForge = spiritPower({ ...restored, forge: {} }).score;
  assert.ok(Math.abs(score / noForge - Math.sqrt(2.5)) < 0.002);
  assert.equal(JSON.stringify(restored), snapshot);
  assert.equal(restored.forge.sword, 10);
});

test('秘境妖物强度只随关卡和时间变化，玩家提升不会触发动态追涨', () => {
  for (let stage = 0; stage < STAGES.length; stage++) {
    const early = new Game(fixture(0), stage, 0, () => 0.5);
    const immortal = new Game(fixture(24), stage, 0, () => 0.5);
    early.time = immortal.time = STAGES[stage].minutes * 60;
    for (const [elite, boss] of [
      [false, false],
      [true, false],
      [false, true],
    ]) {
      const a = early.spawnEnemy(0, elite, boss, { x: 100, y: 0 }, stage);
      const b = immortal.spawnEnemy(0, elite, boss, { x: 100, y: 0 }, stage);
      assert.deepEqual([a.hp, a.damage, a.speed], [b.hp, b.damage, b.speed]);
    }
  }
});
