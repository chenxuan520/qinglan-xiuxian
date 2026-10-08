import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { STAGES } from '../src/data.ts';
import { freshSave, SAVE_SCHEMA, readSave, syncTribulationClock } from '../src/progress.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';

function seeded(seed: number) {
  return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
}

function encounter(stage: number, arena = stage, seed = 41) {
  const save = freshSave('heaven');
  save.unlocked = 6;
  const g = new Game(save, arena, 0, seeded(seed));
  g.weapons[0].timer = 9999;
  g.player.invincible = 9999;
  g.spawnBudget = -10000;
  g.nextElite = 99999;
  g.bossSpawned = true;
  const boss = g.spawnEnemy(10, false, true, { x: -240, y: 0 }, stage);
  boss.speed = 0;
  boss.cooldown = boss.pursuitCooldown = 999;
  return { g, boss };
}

function cast(g: Game, boss = g.boss!) {
  const stage = boss.bossStage ?? g.stage;
  const phase = boss.skillStep ?? 0;
  g.castBossSkill(boss, 1, 0);
  assert.ok(g.notice.includes(STAGES[stage].skills[phase]));
  assert.notEqual(boss.skillStep, phase, '不能连续重复同一招');
  return phase;
}

test('七王在本关和终关均洗牌：每轮不漏招，轮次交界不连发，首招与后续轮次可变化', () => {
  for (let stage = 0; stage < STAGES.length; stage++) {
    const count = STAGES[stage].skills.length;
    for (const arena of new Set([stage, 6])) {
      const starts = new Set<number>();
      const orders = new Set<string>();
      for (let seed = 41; seed < 73; seed++) {
        const { g, boss } = encounter(stage, arena, seed);
        starts.add(boss.skillStep!);
        let previous: number | undefined;
        for (let round = 0; round < 12; round++) {
          if (round === 6) boss.hp = boss.maxHp * 0.4;
          const phases: number[] = [];
          for (let i = 0; i < count; i++) {
            const phase = cast(g, boss);
            assert.notEqual(phase, previous);
            previous = phase;
            phases.push(phase);
            g.shots = [];
            g.zones = [];
            g.effects = [];
            g.enemies = [boss];
          }
          assert.deepEqual(
            [...phases].sort((a, b) => a - b),
            Array.from({ length: count }, (_, i) => i),
          );
          orders.add(phases.join(','));
        }
      }
      assert.equal(starts.size, count, `${stage}/${arena} 的所有招式均能作为首招`);
      assert.ok(orders.size > 1, `${stage}/${arena} 不能固定同一轮顺序`);
    }
  }
});

test('终关七王各有自己的招式队列，某位出招不推进其他王', () => {
  const { g } = encounter(0, 6);
  g.enemies = [];
  const kings = STAGES.map((_, stage) => g.spawnEnemy(10, false, true, { x: -240, y: 0 }, stage));
  const before = kings.map((e) => ({ next: e.skillStep, queue: [...e.bossSkillQueue!] }));
  cast(g, kings[3]);
  for (let i = 0; i < kings.length; i++) {
    if (i === 3) continue;
    assert.deepEqual({ next: kings[i].skillStep, queue: kings[i].bossSkillQueue }, before[i]);
    assert.notEqual(kings[i].bossSkillQueue, kings[3].bossSkillQueue);
  }
});

test('暂停、半血、快照及导出导入保留已排定的下一招和本轮余招，数组不共享', () => {
  for (let stage = 0; stage < STAGES.length; stage++) {
    const { g, boss } = encounter(stage);
    cast(g, boss);
    boss.hp = boss.maxHp * 0.4;
    g.pause();
    const snapshot = g.snapshot();
    g.update(0.5);
    assert.deepEqual(g.snapshot(), snapshot);
    const restored = Game.restore(g.save, snapshot)!;
    const imported = importSave(exportSave(g.save, g)).run!;
    assert.ok(restored);
    assert.ok(imported);
    assert.notEqual(snapshot.enemies[0].bossSkillQueue, boss.bossSkillQueue);
    assert.notEqual(restored.boss!.bossSkillQueue, snapshot.enemies[0].bossSkillQueue);
    const scheduled = [boss.skillStep!, ...boss.bossSkillQueue!];
    for (const game of [g, restored, imported]) {
      assert.deepEqual([game.boss!.skillStep, ...game.boss!.bossSkillQueue!], scheduled);
      const phases = scheduled.map(() => cast(game));
      assert.deepEqual(phases, scheduled);
    }
    assert.deepEqual(
      [snapshot.enemies[0].skillStep, ...snapshot.enemies[0].bossSkillQueue!],
      scheduled,
    );
  }
});

test('刷新前的一次实际出招只消耗一招，旧队列耗尽后才抽下一轮', () => {
  const { g, boss } = encounter(6);
  const before = [boss.skillStep!, ...boss.bossSkillQueue!];
  boss.cooldown = 0;
  boss.pursuitCooldown = 999;
  g.update(0.01);
  assert.ok(g.notice.includes(STAGES[6].skills[before[0]]));
  assert.deepEqual([boss.skillStep, ...boss.bossSkillQueue!], before.slice(1));
  const h = Game.restore(g.save, JSON.parse(JSON.stringify(g.snapshot())))!;
  h.resume();
  h.player.invincible = 9999;
  const e = h.boss!;
  e.charge = 0;
  e.cooldown = 0;
  h.update(0.01);
  assert.ok(h.notice.includes(STAGES[6].skills[before[1]]));
  assert.deepEqual([e.skillStep, ...e.bossSkillQueue!], before.slice(2));
});

test('旧妖王续局保留已定下一招与冷却，再随机轮换；无旧下一招时保留原首招', () => {
  for (let stage = 0; stage < STAGES.length; stage++) {
    const count = STAGES[stage].skills.length;
    for (const next of [undefined, ...Array.from({ length: count }, (_, i) => i)]) {
      const { g } = encounter(stage);
      const raw = g.snapshot();
      delete raw.enemies[0].bossSkillQueue;
      if (next === undefined) delete raw.enemies[0].skillStep;
      else raw.enemies[0].skillStep = next;
      raw.enemies[0].cooldown = 1.234;
      const h = Game.restore(g.save, JSON.parse(JSON.stringify(raw)))!;
      assert.ok(h);
      assert.equal(h.boss!.skillStep, next);
      assert.equal(h.boss!.cooldown, 1.234);
      h.random = seeded(82);
      const phases = Array.from({ length: count }, () => cast(h));
      assert.equal(phases[0], next ?? 0);
      assert.equal(new Set(phases).size, count);
      assert.ok(Game.restore(h.save, h.snapshot()));
    }
  }
});

test('队列为空是合法轮次末尾；错误类型、重复、越界或当前招式混入的快照拒绝恢复', () => {
  const { g } = encounter(0);
  const raw = g.snapshot();
  raw.enemies[0].skillStep = 0;
  raw.enemies[0].bossSkillQueue = [];
  assert.ok(Game.restore(g.save, raw));
  for (const queue of [null, 'bad', {}, [1, 1], [1, 2, 0], [0], [-1], [3], [1.5], [NaN], ['1']]) {
    const bad = structuredClone(raw);
    Object.assign(bad.enemies[0], { bossSkillQueue: queue });
    assert.equal(Game.restore(g.save, bad), null, JSON.stringify(queue));
  }
  for (const step of [null, '1', -1, 3, 0.5, NaN]) {
    const bad = structuredClone(raw);
    Object.assign(bad.enemies[0], { skillStep: step });
    assert.equal(Game.restore(g.save, bad), null);
  }
  const absent = structuredClone(raw);
  delete absent.enemies[0].skillStep;
  assert.equal(Game.restore(g.save, absent), null);
  const mob = structuredClone(raw);
  mob.enemies[0].boss = false;
  assert.equal(Game.restore(g.save, mob), null);
});

test('独立天劫保留原落雷与核心显露轮次，不生成妖王洗牌队列', () => {
  const save = freshSave('heaven');
  save.cultivation = 1e9;
  save.unlocked = 6;
  syncTribulationClock(save);
  save.age = save.nextTribulationAge;
  const g = Game.createTribulation(save, null);
  assert.equal(g.boss!.bossSkillQueue, undefined);
  assert.equal(g.boss!.skillStep, undefined);
  assert.ok(Game.restore(save, g.snapshot()));
  const bad = g.snapshot();
  bad.enemies[0].skillStep = 0;
  bad.enemies[0].bossSkillQueue = [1, 2];
  assert.equal(Game.restore(save, bad), null);
});

test('新队列使用更高存档协议，旧版本只读保护保留', () => {
  assert.ok(SAVE_SCHEMA >= 9);
  const { g } = encounter(6);
  const file = JSON.parse(exportSave(g.save, g));
  assert.equal(file.save.schema, SAVE_SCHEMA);
  const future = readSave(JSON.stringify({ ...g.save, schema: SAVE_SCHEMA + 1 }));
  assert.equal(future.status, 'newer');
});
