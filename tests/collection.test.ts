import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { TREASURES } from '../src/data.ts';
import {
  freshSave,
  parseSave,
  forge,
  forgeCost,
  claimArtifacts,
  settleRun,
} from '../src/progress.ts';

test('三十六件已收藏法宝均能炼至十阶，每阶准确扣款且刷新保留，满阶不再扣款', () => {
  for (const item of TREASURES) {
    let save = freshSave();
    save.artifacts = TREASURES.map((t) => t.id);
    save.stones = save.iron = 1000000;
    for (let level = 0; level < 10; level++) {
      const cost = forgeCost(level);
      const { stones, iron } = save;
      assert.equal(forge(save, item.id), true, `${item.id} 升至 ${level + 1} 阶`);
      assert.equal(save.stones, stones - cost.stones);
      assert.equal(save.iron, iron - cost.iron);
      save = parseSave(JSON.stringify(save));
      assert.equal(save.forge[item.id], level + 1);
    }
    const before = JSON.stringify(save);
    assert.equal(forge(save, item.id), false);
    assert.equal(JSON.stringify(save), before);
  }
});

test('炼器前五阶保持旧价，后五阶两种材料费用加速递增，缺少任一材料不扣款', () => {
  assert.deepEqual(
    Array.from({ length: 5 }, (_, level) => forgeCost(level)),
    [
      { iron: 3, stones: 35 },
      { iron: 6, stones: 80 },
      { iron: 9, stones: 125 },
      { iron: 12, stones: 170 },
      { iron: 15, stones: 215 },
    ],
  );
  assert.deepEqual(forgeCost(9), { iron: 330, stones: 4940 });
  for (let level = 5; level < 10; level++) {
    const cost = forgeCost(level),
      prior = forgeCost(level - 1),
      beforePrior = forgeCost(level - 2);
    for (const material of ['iron', 'stones'] as const) {
      assert.ok(cost[material] - prior[material] > prior[material] - beforePrior[material]);
      const save = freshSave();
      save.forge.sword = level;
      save.stones = cost.stones;
      save.iron = cost.iron;
      save[material]--;
      const before = JSON.stringify(save);
      assert.equal(forge(save, 'sword'), false);
      assert.equal(JSON.stringify(save), before);
    }
  }
});

test('十阶炼器实际攻击伤害增加百分之一百五十，旧五阶存档仍保留原加成', () => {
  const damage = (level: number) => {
    const save = parseSave(JSON.stringify({ ...freshSave(), forge: { sword: level } }));
    const game = new Game(save, 0, 0, () => 0.5);
    game.spawnEnemy(0, false, false, { x: 200, y: 0 });
    game.update(0.01);
    return game.shots.find((shot) => shot.kind === 'sword')!.damage;
  };
  assert.ok(Math.abs(damage(5) / damage(0) - 1.4) < 1e-10);
  assert.ok(Math.abs(damage(10) / damage(0) - 2.5) < 1e-10);
});

test('音量保存与旧档兼容，零音量和最大音量均有效，越界值被限制', () => {
  assert.equal(freshSave().volume, 0.6);
  for (const volume of [0, 0.37, 1])
    assert.equal(parseSave(JSON.stringify({ ...freshSave(), volume })).volume, volume);
  assert.equal(parseSave('{"version":1,"volume":-1}').volume, 0);
  assert.equal(parseSave('{"version":1,"volume":8}').volume, 1);
  assert.equal(parseSave('{"version":1,"volume":"bad"}').volume, 0.6);
});

test('新角色默认静音，存档解析仍保留显式声音设置', () => {
  assert.equal(freshSave().sound, false);
  assert.equal(parseSave(null).sound, false);
  assert.equal(parseSave('{"version":1}').sound, false);
  for (const sound of [false, true])
    assert.equal(parseSave(JSON.stringify({ ...freshSave(), sound })).sound, sound);
});

test('默认仅有青霄剑与追魂钉，未收藏法宝不能炼器但仍可局内领悟', () => {
  const save = freshSave();
  assert.deepEqual(save.artifacts, ['sword', 'nail']);
  save.stones = save.iron = 9999;
  assert.equal(forge(save, 'orbit'), false);
  assert.equal(save.stones, 9999);
  assert.equal(forge(save, 'sword'), true);
  const g = new Game(save, 0, 0);
  const offered = new Set<string>();
  for (let i = 0; i < 500; i++)
    for (const c of g.makeChoices()) if (c.type === 'weapon') offered.add(c.id);
  assert.equal(offered.size, TREASURES.length);
  save.starter = 'orbit';
  assert.equal(new Game(save, 0, 0).weapons[0].id, 'sword');
  save.path = 'demonic';
  assert.equal(new Game(save, 0, 0).weapons[0].id, 'nail');
});

test('只有击败妖王才掉三件未拥有法宝，收入藏器阁，收齐后不重复掉落', () => {
  const save = freshSave();
  const g = new Game(save, 6, 0, () => 0.5);
  const small = g.spawnEnemy(0, true);
  g.hitEnemy(small, 1e9);
  assert.deepEqual(save.artifactDrops, []);
  assert.equal(save.artifacts.length, 2);
  for (let i = 0; i < 12; i++) {
    g.hitEnemy(g.spawnEnemy(10, false, true, undefined, 0), 1e9);
    assert.equal(new Set(save.artifacts).size, Math.min(36, 2 + (i + 1) * 3));
    assert.deepEqual(save.artifactDrops, []);
  }
  const reloaded = parseSave(JSON.stringify(save));
  assert.equal(reloaded.artifacts.length, 36);
  assert.deepEqual(claimArtifacts(reloaded), []);
  assert.deepEqual(reloaded.artifactDrops, []);
  assert.equal(reloaded.chronicle.entries.filter((e) => e.title === '万宝归藏').length, 1);
});

test('手动与自动历练击败妖王后立即解锁炼器，重复击杀和续局不重复入库', () => {
  for (const autoplay of [false, true]) {
    const save = freshSave();
    save.autoplay = autoplay;
    save.unlocked = 6;
    save.stones = save.iron = 1000;
    const g = new Game(save, 6, 0, () => 0.5);
    g.time = 90;
    g.trialBossesSpawned = 1;
    const boss = g.spawnEnemy(10, false, true, undefined, 0);
    g.hitEnemy(boss, 1e9);
    const id = save.artifacts.find((id) => !['sword', 'nail'].includes(id))!;
    assert.ok(id);
    assert.equal(forge(save, id), true);
    g.hitEnemy(boss, 1e9);
    assert.equal(save.artifacts.length, 5);
    const restored = Game.restore(save, JSON.parse(JSON.stringify(g.snapshot())))!;
    assert.ok(restored);
    assert.equal(save.artifacts.length, 5);
    assert.equal(save.chronicle.entries.filter((e) => e.title === '妖王遗宝').length, 1);
  }
});

test('旧档保留已炼器和当前本命，其余法宝待收集；无效、重复收藏被过滤', () => {
  const { artifacts, artifactDrops, ...old } = freshSave();
  const migrated = parseSave(JSON.stringify({ ...old, starter: 'orbit', forge: { fire: 3 } }));
  assert.deepEqual(new Set(migrated.artifacts), new Set(['sword', 'nail', 'orbit', 'fire']));
  assert.equal(migrated.starter, 'orbit');
  const parsed = parseSave(
    JSON.stringify({
      ...freshSave(),
      starter: 'fire',
      artifacts: ['nail', 'invalid', 'nail'],
      artifactDrops: ['orbit', 'orbit', 'nail', 'bad'],
    }),
  );
  assert.deepEqual(parsed.artifacts, ['sword', 'nail', 'orbit']);
  assert.deepEqual(parsed.artifactDrops, []);
  assert.equal(parsed.starter, 'sword');
  assert.deepEqual(parseSave(JSON.stringify(parsed)), parsed);
});

test('后期强怪、精英和妖王给予递增灵气与修为，续局结算不重复入账', () => {
  function kill(stage: number, elite = false, boss = false) {
    const save = freshSave();
    save.unlocked = 6;
    const g = new Game(save, stage, 0, () => 0.5);
    const e = g.spawnEnemy(stage === 0 ? 0 : 64, elite, boss);
    g.hitEnemy(e, 1e9);
    return g;
  }
  const low = kill(0),
    high = kill(5),
    elite = kill(5, true),
    boss = kill(5, false, true);
  assert.ok(high.combatCultivation + 0.7 > (low.combatCultivation + 0.7) * 5);
  assert.ok(elite.save.cultivation > high.save.cultivation);
  assert.ok(high.pickups.find((p) => p.kind === 'xp')!.value > low.pickups[0].value);
  assert.ok(boss.save.cultivation >= 3000);
  assert.ok(boss.level >= 10);
  const restored = Game.restore(high.save, JSON.parse(JSON.stringify(high.snapshot())))!;
  assert.ok(restored);
  assert.equal(restored.combatCultivation, high.combatCultivation);
  const credited = high.save.cultivation;
  const rewards = settleRun(high.save, { ...restored.snapshot(), victory: false });
  assert.equal(rewards.cultivationRemaining, 0);
  assert.equal(high.save.cultivation, credited);
});

test('终关取消回血丹掉落，前六境仍可掉落；终关旧续局的丹药被移除', () => {
  for (const stage of [0, 6]) {
    const save = freshSave();
    save.unlocked = 6;
    const g = new Game(save, stage, 0, () => 0.5);
    const e = g.spawnEnemy(0);
    const rolls = stage === 6 ? [0.5, 0.001] : [0.001];
    g.random = () => rolls.shift() ?? 0.001;
    g.hitEnemy(e, 1e9);
    assert.equal(
      g.pickups.some((p) => p.kind === 'heal'),
      stage !== 6,
    );
    g.pickups.push({ kind: 'heal', value: 1, x: 0, y: 0, pull: true });
    const restored = Game.restore(save, JSON.parse(JSON.stringify(g.snapshot())))!;
    assert.ok(restored);
    assert.equal(
      restored.pickups.some((p) => p.kind === 'heal'),
      stage !== 6,
    );
  }
});

test('终关丹药与宝匣均不回血，前六境分别回30%与5%，宝匣仍升阶法宝给玄铁', () => {
  for (const stage of [0, 1, 2, 3, 4, 5, 6]) {
    for (const kind of ['heal', 'chest'] as const) {
      const g = new Game(freshSave(), stage, 0, () => 0.5);
      g.player.hp = 10;
      g.weapons[0].timer = 999;
      g.pickups = [{ kind, value: 1, x: 0, y: 0, pull: true }];
      const regen = g.stats.regen * 0.01;
      g.update(0.01);
      if (stage === 6) assert.ok(Math.abs(g.player.hp - 10 - regen) < 1e-6);
      else
        assert.ok(
          Math.abs(g.player.hp - 10 - regen - g.player.maxHp * (kind === 'heal' ? 0.3 : 0.05)) <
            1e-6,
        );
      if (kind === 'chest') {
        assert.equal(g.weapons[0].level, 2);
        assert.equal(g.iron, 2);
      }
    }
  }
});
