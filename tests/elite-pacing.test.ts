import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { ENEMIES, ENEMY_TACTICS, SPIRIT_ROOTS, STAGES, enemyRoster } from '../src/data.ts';
import { freshSave } from '../src/progress.ts';

function fixture(stage = 2) {
  const save = freshSave('heaven');
  save.unlocked = stage;
  const g = new Game(save, stage, 0, () => 0.5);
  g.weapons[0].timer = 9999;
  return g;
}
const elites = (g: Game) => g.enemies.filter((e) => e.elite && !e.boss && !e.dead);

test('三至六境前半程保留原间隔，过半只接一波，之后每24秒出现突进和远程精英', () => {
  for (let stage = 2; stage <= 5; stage++) {
    const g = fixture(stage);
    const half = STAGES[stage].minutes * 30;
    const interval = (STAGES[stage].minutes * 60) / (STAGES[stage].minutes + 2);
    assert.equal(g.nextElite, interval);
    for (let wave = 1; wave * interval < half; wave++) {
      g.time = wave * interval - 0.01;
      g.enemies = [];
      g.update(0.01);
      assert.equal(elites(g).length, 1);
      assert.equal(g.nextElite, (wave + 1) * interval);
    }
    g.time = half - 0.01;
    g.enemies = [];
    g.update(0.01);
    assert.equal(ENEMY_TACTICS[elites(g)[0].type].eliteSkill, 'dash');
    assert.ok(
      ['ranged', 'volley', 'nova', 'soul', 'firebolt', 'frostbolt', 'gapring'].includes(
        ENEMY_TACTICS[elites(g)[1].type].eliteSkill,
      ),
    );
    assert.equal(g.nextElite, half + 24);
    g.update(0.01);
    assert.equal(elites(g).length, 2);
    for (const time of [half + 24, STAGES[stage].minutes * 45]) {
      g.time = time - 0.01;
      g.nextElite = time;
      g.enemies = [];
      g.update(0.01);
      const roster = enemyRoster(stage, g.time);
      const [dash, ranged] = elites(g);
      assert.equal(dash.type, roster.filter((t) => ENEMY_TACTICS[t].eliteSkill === 'dash').at(-1));
      assert.equal(
        ranged.type,
        roster
          .filter((t) =>
            ['ranged', 'volley', 'nova', 'soul', 'firebolt', 'frostbolt', 'gapring'].includes(
              ENEMY_TACTICS[t].eliteSkill,
            ),
          )
          .at(-1),
      );
    }
  }
});

test('单只和双只波次均遵守四只上限，死去精英与妖王不占名额，满额后不连补', () => {
  for (const late of [false, true]) {
    const g = fixture();
    g.time = late ? 144 : 40;
    // 先正常触发一次，保证后半程起点已记录。
    g.update(0.01);
    g.enemies = [];
    for (let i = 0; i < (late ? 3 : 4); i++) g.spawnEnemy(0, true);
    g.spawnEnemy(0, true).dead = true;
    g.spawnEnemy(10, false, true);
    g.nextElite = g.time;
    g.update(0.01);
    const blockedAt = g.time;
    assert.equal(elites(g).length, late ? 3 : 4);
    assert.equal(g.nextElite, blockedAt + 1);
    elites(g)[0].dead = true;
    g.time = blockedAt + 0.99;
    g.update(0.005);
    assert.equal(elites(g).length, late ? 2 : 3);
    g.update(0.01);
    assert.equal(elites(g).length, 4);
    assert.ok(g.nextElite > g.time + 23);
    g.update(0.01);
    assert.equal(elites(g).length, 4);
  }
});

test('三至六境妖王前15秒停止追加精英，不移除已有妖物、不改变妖王出场时刻', () => {
  for (let stage = 2; stage <= 5; stage++) {
    const g = fixture(stage);
    const duration = STAGES[stage].minutes * 60;
    g.time = duration - 15 - 0.02;
    g.update(0.01);
    const ids = elites(g).map((e) => e.id);
    assert.equal(ids.length, 2);
    g.nextElite = duration - 15;
    g.update(0.01);
    assert.deepEqual(
      elites(g).map((e) => e.id),
      ids,
    );
    assert.equal(g.bossSpawned, false);
    g.time = duration - 0.01;
    g.update(0.01);
    assert.ok(g.boss);
    assert.deepEqual(
      elites(g).map((e) => e.id),
      ids,
    );
    g.update(0.05);
    assert.equal(g.enemies.filter((e) => e.boss).length, 1);
  }
});

test('精英气血35%进度后平滑增加，90%达逐关4/6/8/10倍；伤害速度与奖励用原规则', () => {
  for (let stage = 0; stage <= 6; stage++) {
    for (const progress of [0, 0.35, 0.5, 0.75, 0.9, 1, 1.2]) {
      for (const [elite, boss] of [
        [false, false],
        [true, false],
        [false, true],
      ]) {
        const old = fixture(stage);
        old.elitePacingVersion = 1;
        const g = fixture(stage);
        old.time = g.time = STAGES[stage].minutes * 60 * progress;
        const type = enemyRoster(stage, g.time).at(-1)!;
        const before = old.spawnEnemy(type, elite, boss);
        const after = g.spawnEnemy(type, elite, boss);
        const expected =
          elite && !boss && stage >= 2 && stage <= 5
            ? 1 +
              ([4, 6, 8, 10][stage - 2] - 1) *
                Math.max(0, Math.min(1, (progress - 0.35) / 0.55)) ** 1.5
            : 1;
        assert.ok(Math.abs(after.maxHp / before.maxHp - expected) < 1e-10);
        assert.equal(after.hp, after.maxHp);
        assert.deepEqual({ ...after, hp: before.hp, maxHp: before.maxHp }, before);
        old.hitEnemy(before, before.hp * 100);
        g.hitEnemy(after, after.hp * 100);
        assert.equal(g.combatCultivation, old.combatCultivation);
        assert.equal(g.bossCultivation, old.bossCultivation);
        assert.deepEqual(g.pickups, old.pickups);
      }
    }
  }
});

test('精英规则不读取灵根、境界或装备，三档难度共用波次和额外气血倍率', () => {
  for (let difficulty = 0; difficulty < 3; difficulty++) {
    for (let stage = 2; stage <= 5; stage++) {
      const samples = SPIRIT_ROOTS.map((root, index) => {
        const save = freshSave(root.id);
        save.cultivation = index * 10000;
        save.training.power = index * 2;
        const g = new Game(save, stage, difficulty, () => 0.5);
        g.weapons = [];
        g.time = STAGES[stage].minutes * 45;
        g.update(0.01);
        return elites(g).map((e) => ({
          type: e.type,
          hp: e.maxHp,
          damage: e.damage,
          speed: e.speed,
        }));
      });
      for (const sample of samples) assert.deepEqual(sample, samples[0]);
    }
  }
});

test('暂停和升级不推进波次，过半前后与满额延期读档均不重复生成或再次乘血量', () => {
  for (const point of ['before', 'after', 'blocked'] as const) {
    let g = fixture(4);
    g.time = STAGES[4].minutes * 30 - 0.01;
    g.nextElite = ((STAGES[4].minutes * 60) / (STAGES[4].minutes + 2)) * 4;
    if (point !== 'before') g.update(0.01);
    if (point === 'blocked') {
      g.spawnEnemy(0, true);
      g.nextElite = g.time;
      g.update(0.01);
    }
    const before = JSON.parse(JSON.stringify(g.snapshot()));
    for (let restore = 0; restore < 3; restore++) {
      g = Game.restore(g.save, JSON.parse(JSON.stringify(g.snapshot())))!;
      assert.ok(g);
      assert.equal(g.elitePacingVersion, 2);
      assert.equal(g.snapshot().lateEliteWaves, before.lateEliteWaves);
      assert.equal(g.nextElite, before.nextElite);
      assert.deepEqual(g.enemies, before.enemies);
      for (const state of ['paused', 'upgrade'] as const) {
        g.state = state;
        g.update(1);
        assert.equal(g.time, before.time);
        assert.equal(g.nextElite, before.nextElite);
      }
      g.state = 'paused';
    }
    g.resume();
    g.update(0.01);
    assert.equal(elites(g).length, point === 'blocked' ? 3 : 2);
    if (point === 'before') assert.equal(g.nextElite, STAGES[4].minutes * 30 + 24);
    else assert.equal(g.nextElite, before.nextElite);
  }
});

test('缺少新版本字段的旧续局保留旧兵种、间隔和气血，新开局使用新规则', () => {
  const g = fixture(4);
  g.elitePacingVersion = 1;
  g.time = 200;
  const e = g.spawnEnemy(0, true);
  e.hp /= 2;
  g.nextElite = g.time;
  const raw = JSON.parse(JSON.stringify(g.snapshot()));
  delete raw.elitePacingVersion;
  delete raw.lateEliteWaves;
  const restored = Game.restore(g.save, raw)!;
  assert.ok(restored);
  assert.equal(restored.elitePacingVersion, 1);
  assert.deepEqual(restored.enemies, raw.enemies);
  restored.resume();
  restored.update(0.01);
  const roster = enemyRoster(4, restored.time);
  const armor = roster.filter((type) => ['tank', 'shield'].includes(ENEMIES[type].behavior));
  assert.deepEqual(
    elites(restored)
      .slice(1)
      .map((e) => e.type),
    [armor.at(-1), roster.at(-1)],
  );
  assert.equal(restored.nextElite, 200 + (STAGES[4].minutes * 60) / (STAGES[4].minutes + 2));
  assert.equal(Game.restore(g.save, restored.snapshot())!.elitePacingVersion, 1);
  assert.equal(new Game(g.save, 4, 0).elitePacingVersion, 2);
});

test('第一二境、第七境和独立天劫不采用新节奏', () => {
  for (const stage of [0, 1, 6]) {
    const g = fixture(stage);
    const old = fixture(stage);
    old.elitePacingVersion = 1;
    for (const time of [60, STAGES[stage].minutes * 30, STAGES[stage].minutes * 60 - 10]) {
      g.time = old.time = time;
      g.nextElite = old.nextElite = time;
      g.update(0.01);
      old.update(0.01);
      assert.deepEqual(g.enemies, old.enemies);
      assert.equal(g.nextElite, old.nextElite);
    }
  }
  const g = fixture(5);
  g.tribulation = 1;
  g.time = 270;
  const after = g.spawnEnemy(0, true);
  g.elitePacingVersion = 1;
  const before = g.spawnEnemy(0, true);
  assert.equal(after.maxHp, before.maxHp);
  assert.equal(g.eliteInterval, (STAGES[5].minutes * 60) / (STAGES[5].minutes + 2));
});

test('未知节奏版本与损坏的阶段标记拒绝恢复', () => {
  const g = fixture();
  for (const version of [0, 3, '2', null]) {
    assert.equal(Game.restore(g.save, { ...g.snapshot(), elitePacingVersion: version }), null);
  }
  for (const flag of [undefined, null, 1, 'false']) {
    assert.equal(Game.restore(g.save, { ...g.snapshot(), lateEliteWaves: flag }), null);
  }
});
