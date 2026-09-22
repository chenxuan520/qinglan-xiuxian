import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import {
  DIFFICULTIES,
  ENEMIES,
  FINAL_TRIAL_STAGE,
  STAGE_COMBAT_SCALING,
  STAGES,
  TRIAL_BOSS_STAGES,
  tribulationRules,
} from '../src/data.ts';
import { freshSave } from '../src/progress.ts';

test('三难度仅第五、第六关妖王增加气血与移速，前四关和终关复用妖王不变', () => {
  for (const [difficulty, rules] of DIFFICULTIES.entries()) {
    for (let stage = 0; stage < STAGES.length; stage++) {
      const g = new Game(freshSave(), stage, difficulty, () => 0.5);
      const scaling = STAGE_COMBAT_SCALING[stage];
      for (const bossStage of stage === FINAL_TRIAL_STAGE ? TRIAL_BOSS_STAGES : [stage]) {
        const boss = g.spawnEnemy(10, false, true, { x: 100, y: 0 }, bossStage);
        const baseHp =
          stage === FINAL_TRIAL_STAGE
            ? bossStage === FINAL_TRIAL_STAGE
              ? 560000
              : 120000 + bossStage * 35000
            : [16000, 27000, 38000, 49000, 78000, 106500][stage];
        assert.equal(boss.hp, baseHp * rules.hp * scaling.hp);
        assert.equal(boss.maxHp, boss.hp);
        assert.ok(Math.abs(boss.speed - [70, 74, 78, 82, 98.9, 108, 94][stage]) < 1e-10);
        assert.equal(g.spawnEnemy(10, true, true, { x: 100, y: 0 }, bossStage).speed, boss.speed);
        const damage =
          stage === FINAL_TRIAL_STAGE
            ? bossStage === FINAL_TRIAL_STAGE
              ? 220
              : 85 + bossStage * 10
            : 52 + stage * 16;
        assert.equal(boss.damage, damage * rules.damage * scaling.damage);
        assert.equal(boss.bossStage, bossStage);
        assert.equal(boss.radius, bossStage === FINAL_TRIAL_STAGE ? 62 : 48);
      }
    }
  }
});

test('三难度全部关卡仅非妖王精英移速再增10%，普通怪、气血与伤害不变', () => {
  for (const [difficulty, rules] of DIFFICULTIES.entries()) {
    for (let stage = 0; stage < STAGES.length; stage++) {
      const g = new Game(freshSave(), stage, difficulty, () => 0.5);
      const scaling = STAGE_COMBAT_SCALING[stage];
      const final = stage === FINAL_TRIAL_STAGE;
      for (const progress of [0, 0.5, 1]) {
        g.time = STAGES[stage].minutes * 60 * progress;
        const strength = (1 + (final ? progress * 600 : g.time) / 260) * (1 + stage * 0.22);
        for (const [type, template] of ENEMIES.entries()) {
          for (const elite of [false, true]) {
            const enemy = g.spawnEnemy(type, elite, false, { x: 100, y: 0 });
            const isElite = final || elite;
            const eliteScaling = isElite ? scaling.elite : undefined;
            const hp =
              template.hp *
              strength *
              rules.hp *
              (isElite ? 7 : 1) *
              (eliteScaling?.hp ?? 1) *
              scaling.hp;
            const speed =
              (final
                ? Math.max(95 + progress * 35, template.speed * (1.05 + progress * 0.3))
                : template.speed) *
              (1 + progress * 0.3) *
              (isElite ? 1.1 : 1) *
              (eliteScaling?.speed ?? 1);
            const damage =
              template.damage *
              (1 + stage * 0.12) *
              (final ? 1.1 + progress * 0.9 : 1 + progress * 0.35) *
              rules.damage *
              (isElite ? scaling.damage : 1 + (scaling.damage - 1) * 0.65) *
              (final ? 1 : isElite ? 2.2 : 1.3) *
              (eliteScaling?.damage ?? 1);
            assert.deepEqual([enemy.hp, enemy.maxHp, enemy.damage], [hp, hp, damage]);
            assert.ok(Math.abs(enemy.speed - speed * (isElite ? 1.1 : 1)) < 1e-8);
          }
        }
      }
    }
  }
});

test('各关三难度新旧精英连续恢复不重算场内速度，也不叠加10%倍率', () => {
  for (let difficulty = 0; difficulty < DIFFICULTIES.length; difficulty++) {
    for (let stage = 0; stage < STAGES.length; stage++) {
      for (const legacy of [false, true]) {
        const save = freshSave();
        save.unlocked = stage;
        const g = new Game(save, stage, difficulty, () => 0.5);
        g.time = STAGES[stage].minutes * 30;
        const enemy = g.spawnEnemy(0, true, false, { x: 100, y: 0 });
        if (legacy)
          enemy.speed =
            (stage === FINAL_TRIAL_STAGE
              ? Math.max(112.5, ENEMIES[0].speed * 1.2)
              : ENEMIES[0].speed) *
            1.15 *
            1.1 *
            (STAGE_COMBAT_SCALING[stage].elite?.speed ?? 1);
        let raw = JSON.parse(JSON.stringify(g.snapshot()));
        const expected = raw.enemies;
        for (let round = 0; round < 3; round++) {
          const restored = Game.restore(save, raw);
          assert.ok(restored);
          assert.deepEqual(restored.enemies, expected);
          raw = JSON.parse(JSON.stringify(restored.snapshot()));
        }
      }
    }
  }
});

test('第五、第六关编号的独立天劫不使用普通妖王强化', () => {
  for (const stage of [4, 5]) {
    for (const round of [1, 5, 6]) {
      const save = freshSave();
      save.unlocked = stage;
      save.cultivation = 1e9;
      save.tribulations = round - 1;
      const source = new Game(save, stage, 0, () => 0.5);
      for (const origin of [null, source]) {
        const g = Game.createTribulation(save, origin);
        const rules = tribulationRules(round);
        assert.deepEqual(
          [g.boss!.hp, g.boss!.maxHp, g.boss!.speed, g.boss!.damage],
          [rules.hp, rules.hp, 0, g.player.maxHp * rules.damage],
        );
        const spawned = g.spawnEnemy(10, false, true, { x: 0, y: 0 }, FINAL_TRIAL_STAGE);
        const hp = (16000 + stage * 11000) * DIFFICULTIES[0].hp * STAGE_COMBAT_SCALING[stage].hp;
        assert.deepEqual([spawned.hp, spawned.maxHp, spawned.speed], [hp, hp, 70 + stage * 4]);
      }
    }
  }
});

test('三难度新旧场内妖王反复恢复保留原气血、缺血与移速，不叠加强化倍率', () => {
  for (const [difficulty, rules] of DIFFICULTIES.entries()) {
    for (const stage of [4, 5]) {
      for (const legacy of [false, true]) {
        const save = freshSave();
        save.unlocked = stage;
        const g = new Game(save, stage, difficulty, () => 0.5);
        g.bossSpawned = true;
        const boss = g.spawnEnemy(10, false, true, { x: 100, y: 0 });
        if (legacy) {
          boss.maxHp = (16000 + stage * 11000) * rules.hp * STAGE_COMBAT_SCALING[stage].hp;
          boss.speed = 70 + stage * 4;
        }
        boss.hp = boss.maxHp * 0.63;
        let raw = JSON.parse(JSON.stringify(g.snapshot()));
        if (legacy) delete raw.stageDuration;
        const expected = { ...boss };
        for (let round = 0; round < 3; round++) {
          const restored = Game.restore(save, raw);
          assert.ok(restored);
          assert.deepEqual(restored.boss, expected);
          raw = JSON.parse(JSON.stringify(restored.snapshot()));
        }
      }
    }
  }
});
