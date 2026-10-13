import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { SPIRIT_ROOTS } from '../src/data.ts';
import {
  IMMORTAL_CULTIVATION,
  SAVE_SCHEMA,
  cultivationReward,
  freshSave,
  parseSave,
  readSave,
  realmInfo,
  settleRun,
  enterImmortalGate,
} from '../src/progress.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';

const victory = {
  stage: 6,
  difficulty: 0,
  kills: 7,
  time: 425,
  iron: 3,
  level: 100,
  combatCultivation: 217600,
  victory: true,
};

test('七种灵根三档难度均在终关结算补足成仙，保留超额且不重复乘倍率', () => {
  assert.equal(IMMORTAL_CULTIVATION, 119940);
  for (const root of SPIRIT_ROOTS)
    for (const difficulty of [0, 1, 2])
      for (const initial of [0, 57024, 119000, 1e6]) {
        const save = freshSave(root.id);
        const run = { ...victory, difficulty, spiritRoot: root.id };
        const ordinary = cultivationReward(run, 400);
        const creditedCultivation = Math.floor(ordinary / 2);
        save.cultivation = initial + creditedCultivation;
        const before = save.cultivation;
        const result = settleRun(save, { ...run, creditedCultivation });
        const expected = Math.max(initial + ordinary, IMMORTAL_CULTIVATION);
        assert.equal(save.cultivation, expected);
        assert.equal(result.ascensionCultivation, expected - initial - ordinary);
        assert.equal(result.cultivation, expected - initial);
        assert.equal(result.cultivationRemaining, expected - before);
        assert.equal(result.cultivation - result.cultivationRemaining, creditedCultivation);
        assert.equal(realmInfo(save.cultivation, save.completed.includes(6)).name, '真仙');
        assert.equal(save.chronicle.milestones['realm-24'], save.age);
        assert.equal(enterImmortalGate(save), true);
      }
});

test('前六关、终关失败和放弃没有补足；足额但未通关仍被成仙门槛锁住', () => {
  for (let stage = 0; stage < 7; stage++)
    for (const won of [false, true]) {
      if (stage === 6 && won) continue;
      const save = freshSave('none');
      const result = settleRun(save, {
        ...victory,
        stage,
        victory: won,
        combatCultivation: 0,
        kills: 0,
        level: 1,
      });
      assert.equal(result.ascensionCultivation, 0);
      assert.equal(realmInfo(save.cultivation, save.completed.includes(6)).max, false);
      assert.equal(enterImmortalGate(save), false);
    }
  const save = freshSave();
  save.cultivation = IMMORTAL_CULTIVATION * 2;
  settleRun(save, { ...victory, victory: false });
  assert.equal(realmInfo(save.cultivation, save.completed.includes(6)).name, '渡劫');
  assert.equal(enterImmortalGate(save), false);
});

test('仙尊提前被杀不触发保底，六王后的读档不成仙，最后一王倒下才结算', () => {
  for (const root of ['none', 'five', 'heaven'] as const) {
    const save = freshSave(root);
    save.unlocked = 6;
    save.completed = [0, 1, 2, 3, 4, 5];
    save.cultivation = 57024;
    let g = new Game(save, 6, 0, () => 0.5);
    g.trialBossesSpawned = 7;
    const order = [6, 0, 1, 2, 3, 4, 5];
    const enemies = order.map((stage) => g.spawnEnemy(10, false, true, { x: 500, y: 0 }, stage));
    for (const e of enemies.slice(0, 6)) g.hitEnemy(e, e.maxHp, false, 'sword');
    assert.equal(g.trialBossesDefeated, 6);
    assert.notEqual(g.state, 'won');
    assert.equal(save.completed.includes(6), false);
    assert.equal(realmInfo(save.cultivation, false).max, false);
    const before = save.cultivation;
    const imported = importSave(exportSave(save, g));
    assert.equal(imported.save.cultivation, before);
    g = imported.run!;
    assert.ok(g);
    g.resume();
    const final = g.enemies.find((e) => e.boss && !e.dead)!;
    g.hitEnemy(final, final.maxHp, false, 'sword');
    assert.equal(g.state, 'won');
    const earned = g.save.cultivation;
    const result = settleRun(g.save, { ...g.snapshot(), victory: g.state === 'won' });
    assert.equal(g.save.cultivation, earned + result.cultivationRemaining);
    assert.equal(realmInfo(g.save.cultivation, g.save.completed.includes(6)).name, '真仙');
    if (root === 'none') assert.ok(result.ascensionCultivation > 0);
    const once = g.save.cultivation;
    const restored = importSave(exportSave(g.save, null)).save;
    assert.equal(restored.cultivation, once);
    assert.deepEqual(restored.chronicle, g.save.chronicle);
    // 重游仍发正常收益，但不会再发成仙补足。
    const repeat = settleRun(restored, { ...victory, spiritRoot: root });
    assert.equal(repeat.ascensionCultivation, 0);
    assert.equal(restored.cultivation, once + repeat.cultivation);
    assert.equal(
      restored.chronicle.entries.filter((e) => e.title === '七劫登仙').length,
      result.ascensionCultivation > 0 ? 1 : 0,
    );
  }
});

test('更新版本存档只读，旧版本档升级读取', () => {
  const save = freshSave('none');
  save.cultivation = 1000;
  save.completed = [0, 1, 2, 3, 4, 5, 6];
  save.schema = SAVE_SCHEMA + 1;
  const newer = readSave(JSON.stringify(save));
  assert.equal(newer.status, 'newer');
  assert.equal(newer.save.cultivation, 1000);
  assert.throws(() => importSave(JSON.stringify(save)), /更新的版本/);
  const older = freshSave('none');
  older.schema = SAVE_SCHEMA - 1;
  const upgraded = readSave(JSON.stringify(older));
  assert.equal(upgraded.status, 'ok');
  assert.equal(upgraded.save.schema, SAVE_SCHEMA);
  assert.equal(parseSave(JSON.stringify(freshSave('none'))).cultivation, 0);
});

test('旧档升级：成仙补足、收藏反推与番天印校正，导入往返幂等', () => {
  // schema 7 的老档：completed 含终关但修为不足 → 升级补足成仙缺口。
  const old = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  old.schema = 7;
  old.unlocked = 6;
  old.completed = [0, 1, 2, 3, 4, 5, 6];
  old.cultivation = 57024;
  old.stones = 4321;
  old.iron = 91;
  old.age = 1015;
  old.forge.sword = 4;
  old.medicine.bag.xuling = 2;
  old.nextTribulationAge = 10000;
  const raw = JSON.stringify(old);
  const restored = parseSave(raw);
  assert.equal(restored.schema, SAVE_SCHEMA);
  assert.equal(restored.cultivation, IMMORTAL_CULTIVATION);
  assert.equal(realmInfo(restored.cultivation, true).name, '真仙');
  assert.equal(restored.age, old.age);
  assert.equal(restored.stones, old.stones);
  assert.equal(restored.forge.sword, old.forge.sword);
  assert.deepEqual(restored.medicine, old.medicine);
  assert.equal(restored.nextTribulationAge, 0);
  assert.equal(restored.chronicle.milestones['realm-24'], null);
  const again = parseSave(JSON.stringify(restored));
  assert.equal(again.cultivation, restored.cultivation);
  assert.deepEqual(again.chronicle, restored.chronicle);
  const imported = importSave(raw).save;
  assert.equal(imported.cultivation, restored.cultivation);
  assert.deepEqual(imported.chronicle, restored.chronicle);
  assert.equal(JSON.stringify(old), raw, '迁移不改调用方原对象');

  // 缺收藏字段的旧档：保留已投入炼器与当前本命，其余重新收集。
  const { artifacts, artifactDrops, ...bare } = freshSave(
    'heaven',
    ['metal'],
    'orthodox',
    () => 0.5,
  );
  bare.schema = 7;
  bare.forge.fire = 3;
  bare.starter = 'lightning';
  const revived = parseSave(JSON.stringify(bare));
  assert.deepEqual(new Set(revived.artifacts), new Set(['sword', 'nail', 'fire', 'lightning']));
  assert.equal(revived.starter, 'lightning');
  assert.equal(revived.forge.fire, 3);
});

test('老档带天劫原历练与旧版续局，升级导入成功且不阻塞', () => {
  const build = (schema?: number) => {
    const save = freshSave('none', [], 'orthodox', () => 0.5);
    if (schema === undefined) delete (save as { schema?: number }).schema;
    else save.schema = schema;
    save.unlocked = 6;
    save.completed = [0, 1, 2, 3, 4, 5, 6];
    save.cultivation = 119940;
    save.tribulations = 2;
    save.tribulationReturn = {
      version: 1,
      state: 'paused',
      stage: 3,
      time: 100,
      player: { x: 0, y: 0, hp: 1e6, maxHp: 1e6, invincible: 0, facing: 1, moving: false },
      weapons: [],
      passives: {},
      enemies: [],
      shots: [],
      zones: [],
      pickups: [],
      choices: [],
      bossSpawned: false,
      elapsedYears: 0,
    };
    save.activeRun = null;
    return JSON.parse(JSON.stringify(save));
  };
  for (const schema of [12, undefined] as const) {
    const file = { format: 'qinglan-save', version: 1, save: build(schema) };
    const restored = importSave(JSON.stringify(file));
    assert.equal(restored.save.schema, SAVE_SCHEMA);
    assert.equal(restored.run, null, '老档的进行中对局在升级时放弃');
    assert.equal(realmInfo(restored.save.cultivation, true).name, '真仙');
    assert.equal(restored.save.tribulations, 2);
  }
});
