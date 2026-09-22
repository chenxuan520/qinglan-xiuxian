import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, type Enemy, type Shot } from '../src/game.ts';
import { treasure, type WeaponKind } from '../src/data.ts';
import { freshSave } from '../src/progress.ts';

function game(id: WeaponKind, evolved = true) {
  const g = new Game(
    freshSave('none', [], 'dual', () => 0.99),
    0,
    0,
    () => 0.99,
  );
  g.weapons = [{ id, level: 6, evolved, timer: 0 }];
  return g;
}

function target(g: Game, kind = 'boss', x = 100, y = 0) {
  const e = g.spawnEnemy(0, kind === 'elite', kind === 'boss', { x, y });
  Object.assign(e, { hp: 1e7, maxHp: 1e7, radius: 10, speed: 0, cooldown: 999 });
  return e;
}

function damage(g: Game) {
  const w = g.weapons[0];
  return treasure(w.id).damage * 2.6 * g.stats.damage * (w.evolved ? 1.8 : 1);
}

function close(actual: number, expected: number, message: string) {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} != ${expected}`);
}

function checkDamage(g: Game, expected: [Enemy, number][]) {
  for (const [e, amount] of expected) {
    close(e.maxHp - e.hp, amount, `目标 ${e.id} 扣血`);
    assert.equal(e.dead, false);
  }
  const total = expected.reduce((sum, [, amount]) => sum + amount, 0);
  close(g.damageDealt, total, '总伤害');
  close(g.damageBySource[g.weapons[0].id] ?? 0, total, '法宝来源伤害');
}

// 只控制命中顺序，不替换施法、碰撞、爆炸或伤害结算；dt=0 避免走位和计时干扰。
function strike(g: Game, shot: Shot, e: Enemy) {
  assert.ok(g.shots.includes(shot), '必须使用仍存活的生产弹丸');
  for (const b of g.shots) Object.assign(b, { x: 2000, y: 2000 });
  Object.assign(shot, { x: e.x, y: e.y });
  g.updateShots(0);
}

const projectiles = [
  ['sword', 0.45, 7],
  ['fire', 0.45, 7],
  ['fan', 0.45, 7],
  ['blade', 0.45, 7],
  ['pearl', 0.45, 7],
  ['dragon', 0.45, 7],
  ['qin', 0.45, 9],
  ['talisman', 0.45, 10],
  ['beads', 0.45, 8],
  ['shard', 0.45, 7],
  ['arrow', 0.6, 7],
  ['flute', 0.6, 7],
  ['nail', 0.6, 8],
  ['skull', 0.6, 8],
] as const;

for (const [id, factor, evolvedCount] of projectiles) {
  test(`${id}：仅觉醒后对同一 Boss 后续子弹衰减至 ${factor}，弹数、基础伤害及冷却不变`, () => {
    for (const evolved of [false, true]) {
      for (const kind of ['boss', 'normal', 'elite']) {
        const g = game(id, evolved);
        const e = target(g, kind);
        g.update(0.001);
        const shots = [...g.shots];
        assert.equal(shots.length, evolvedCount - (evolved ? 0 : 3));
        close(
          g.weapons[0].timer,
          treasure(id).cooldown * g.stats.cooldown * (evolved ? 0.7 : 1),
          '施法冷却',
        );
        const d = damage(g);
        let expected = 0;
        for (const [i, shot] of shots.entries()) {
          assert.equal(shot.crit, false);
          close(shot.damage, d, '未结算弹丸伤害');
          strike(g, shot, e);
          expected +=
            d * (id === 'fire' ? 1.65 : 1) * (evolved && kind === 'boss' && i > 0 ? factor : 1);
          checkDamage(g, [[e, expected]]);
          close(shot.damage, d, '命中不得改写弹丸基础伤害');
        }
      }
    }
  });
}

test('火球七颗等价 3.7 颗，直伤与自身 0.65 爆炸共用系数，炸到普通怪和精英仍是全伤', () => {
  const g = game('fire');
  const boss = target(g);
  const normal = target(g, 'normal', 171.5);
  const elite = target(g, 'elite', 100, 71.5);
  const outside = target(g, 'normal', 172.5);
  g.cast(g.weapons[0]);
  assert.equal(g.shots.length, 7);
  const d = damage(g);
  for (const [i, shot] of [...g.shots].entries()) {
    strike(g, shot, boss);
    checkDamage(g, [
      [boss, d * 1.65 * (1 + i * 0.45)],
      [normal, d * 0.65 * (i + 1)],
      [elite, d * 0.65 * (i + 1)],
      [outside, 0],
    ]);
  }
  close(boss.maxHp - boss.hp, d * 1.65 * 3.7, '七颗完整火球伤害');
});

test('同轮两个 Boss 分别享有首颗全伤，下次 cast 即使同一时刻也重新全伤', () => {
  const g = game('fire');
  const a = target(g);
  const b = target(g, 'boss', 500);
  const d = damage(g) * 1.65;
  for (let cast = 1; cast <= 3; cast++) {
    g.cast(g.weapons[0]);
    for (const [i, shot] of [...g.shots].entries()) strike(g, shot, i % 2 ? b : a);
    checkDamage(g, [
      [a, cast * d * (1 + 3 * 0.45)],
      [b, cast * d * (1 + 2 * 0.45)],
    ]);
  }
});

for (const [id, factor] of [
  ['orbit', 0.45],
  ['compass', 0.4],
] as const) {
  test(`${id}：重叠环点或近身八线独立计为子攻击，仅同轮 Boss 后续命中衰减`, () => {
    for (const evolved of [false, true]) {
      for (const kind of ['boss', 'normal', 'elite']) {
        const g = game(id, evolved);
        const e = target(g, kind, 0);
        // 覆盖全部环点；compass 的八条线均经过近身目标。
        e.radius = 150;
        const count = evolved ? 8 : id === 'orbit' ? 5 : 4;
        const expected =
          damage(g) * (evolved && kind === 'boss' ? 1 + (count - 1) * factor : count);
        for (let cast = 1; cast <= 2; cast++) {
          g.cast(g.weapons[0]);
          checkDamage(g, [[e, expected * cast]]);
        }
      }
    }
  });
}

test('雷击孤立 Boss 不降伤，邻近七次爆炸对两个 Boss 各计首包，对小怪不降伤', () => {
  for (const evolved of [false, true]) {
    for (const neighbors of [0, 6]) {
      const g = game('lightning', evolved);
      const enemies = [target(g)];
      for (let i = 1; i <= neighbors; i++)
        enemies.push(target(g, i === 1 ? 'boss' : i === 2 ? 'elite' : 'normal', 100 + i * 10));
      const count = neighbors ? (evolved ? 7 : 4) : 1;
      for (let cast = 1; cast <= 2; cast++) {
        g.cast(g.weapons[0]);
        checkDamage(
          g,
          enemies.map((e) => [
            e,
            cast * damage(g) * (evolved && e.boss ? 1 + (count - 1) * 0.4 : count),
          ]),
        );
      }
    }
  }
});

test('持续领域每次 tick 全额，单发穿透、单次范围及连锁法宝不受衰减', () => {
  for (const id of ['poison', 'vortex', 'cauldron', 'pagoda', 'bloodpool'] as const) {
    const g = game(id);
    const boss = target(g);
    g.cast(g.weapons[0]);
    while (g.zones.some((z) => z.delay > 0)) g.updateZones(0.05);
    for (let tick = 1; tick <= 3; tick++) {
      g.updateZones(tick === 1 ? 0 : 0.5);
      checkDamage(g, [[boss, damage(g) * tick]]);
    }
  }
  for (const id of ['spear', 'pulse', 'ice', 'chain', 'whip', 'scythe', 'umbrella'] as const) {
    const g = game(id);
    const boss = target(g);
    for (let cast = 1; cast <= 3; cast++) {
      g.cast(g.weapons[0]);
      if (id === 'spear') strike(g, g.shots.at(-1)!, boss);
      checkDamage(g, [[boss, damage(g) * cast]]);
    }
  }
});

test('分裂子片继承父弹 hit 而非共享 hit，父子共享本轮首包预算且各片分别衰减', () => {
  const g = game('shard');
  const a = target(g);
  const b = target(g, 'boss', 300);
  const d = damage(g);
  g.cast(g.weapons[0]);
  const parents = [...g.shots];
  strike(g, parents[0], a);
  const firstChildren = g.shots.filter((shot) => !parents.includes(shot));
  assert.equal(firstChildren.length, 2);
  for (const child of firstChildren) {
    assert.deepEqual(child.hit, new Set([a.id]));
    strike(g, child, a);
  }
  checkDamage(g, [
    [a, d],
    [b, 0],
  ]);
  strike(g, firstChildren[0], b);
  checkDamage(g, [
    [a, d],
    [b, d * 0.6],
  ]);
  assert.deepEqual(parents[0].hit, new Set([a.id]));
  assert.deepEqual(firstChildren[1].hit, new Set([a.id]));
  strike(g, firstChildren[1], b);
  for (const parent of parents.slice(1)) strike(g, parent, b);
  const bDamage = d * (0.6 + 0.6 * 0.45 + 6 * 0.45);
  checkDamage(g, [
    [a, d],
    [b, bDamage],
  ]);
  const children = [...g.shots];
  assert.equal(children.length, 14);
  for (const child of children) strike(g, child, b);
  checkDamage(g, [
    [a, d],
    [b, bDamage],
  ]);
  for (const child of children) strike(g, child, a);
  const aDamage = d * (1 + 12 * 0.6 * 0.45);
  checkDamage(g, [
    [a, aDamage],
    [b, bDamage],
  ]);
  for (const child of children) strike(g, child, a);
  checkDamage(g, [
    [a, aDamage],
    [b, bDamage],
  ]);
});

for (const id of ['pearl', 'beads'] as const) {
  test(`${id}：弹射仍排除已命中目标，换 Boss 各计首包，之后命中普通怪全伤`, () => {
    const g = game(id);
    const a = target(g);
    const b = target(g, 'boss', 300);
    const normal = target(g, 'normal', 500);
    g.cast(g.weapons[0]);
    const shots = [...g.shots];
    const d = damage(g);
    const bossDamage = d * (1 + (shots.length - 1) * 0.45);
    for (const shot of shots) strike(g, shot, a);
    for (const shot of shots) strike(g, shot, a);
    checkDamage(g, [
      [a, bossDamage],
      [b, 0],
      [normal, 0],
    ]);
    for (const shot of shots) strike(g, shot, b);
    for (const shot of shots) strike(g, shot, a);
    checkDamage(g, [
      [a, bossDamage],
      [b, bossDamage],
      [normal, 0],
    ]);
    for (const shot of shots) {
      strike(g, shot, normal);
      assert.deepEqual(shot.hit, new Set([a.id, b.id, normal.id]));
      close(shot.damage, d, '弹射基础伤害');
    }
    checkDamage(g, [
      [a, bossDamage],
      [b, bossDamage],
      [normal, d * shots.length],
    ]);
  });
}

test('部分命中后快照保留共享施法上下文，分开两次 cast，JSON 往返与续战均不修改原对象', () => {
  const g = game('sword');
  const a = target(g);
  const b = target(g, 'boss', 400);
  const d = damage(g);
  g.cast(g.weapons[0]);
  g.cast(g.weapons[0]);
  strike(g, g.shots[0], a);
  checkDamage(g, [
    [a, d],
    [b, 0],
  ]);
  const snapshot = g.snapshot();
  const json = JSON.stringify(snapshot);
  assert.equal(snapshot.bossVolleys?.length, 2, '活跃弹丸按 cast 而非法宝种类分组');
  assert.equal(snapshot.shots[0].bossAttack.volley, snapshot.shots[6].bossAttack.volley);
  assert.notEqual(snapshot.shots[0].bossAttack.volley, snapshot.shots[7].bossAttack.volley);
  assert.equal(typeof snapshot.shots[0].bossAttack.volley, 'number');

  for (const raw of [snapshot, JSON.parse(json)]) {
    const restored = Game.restore(structuredClone(g.save), raw);
    assert.ok(restored, '合法快照可恢复');
    restored.random = () => 0.99;
    const [ra, rb] = restored.enemies;
    assert.equal(restored.shots[0].bossAttack.volley, restored.shots[6].bossAttack.volley);
    assert.notEqual(restored.shots[0].bossAttack.volley, restored.shots[7].bossAttack.volley);
    assert.notEqual(
      restored.shots[0].bossAttack.multipliers,
      restored.shots[1].bossAttack.multipliers,
    );
    strike(restored, restored.shots[0], ra);
    checkDamage(restored, [
      [ra, d],
      [rb, 0],
    ]);
    for (const shot of [...restored.shots].slice(1)) strike(restored, shot, ra);
    checkDamage(restored, [
      [ra, 2 * 3.7 * d],
      [rb, 0],
    ]);
    for (const shot of [...restored.shots].reverse()) strike(restored, shot, rb);
    checkDamage(restored, [
      [ra, 2 * 3.7 * d],
      [rb, 2 * 3.7 * d],
    ]);
    assert.equal(JSON.stringify(raw), json, '恢复及后续命中不污染输入快照');
    assert.equal(JSON.stringify(g.snapshot()), json, '恢复后的上下文不与原对局共享');
  }
  for (const shot of [...g.shots].slice(1)) strike(g, shot, a);
  checkDamage(g, [
    [a, 2 * 3.7 * d],
    [b, 0],
  ]);
  assert.equal(JSON.stringify(snapshot), json, '原对局继续命中也不污染既有快照');
});

test('已命中的火球消失后再续局，剩余五颗仍继承该轮已消耗的首包', () => {
  const g = game('fire');
  const boss = target(g);
  g.cast(g.weapons[0]);
  const shots = [...g.shots];
  strike(g, shots[0], boss);
  strike(g, shots[1], boss);
  assert.equal(g.shots.length, 5);
  const raw = JSON.parse(JSON.stringify(g.snapshot()));
  const restored = Game.restore(g.save, raw);
  assert.ok(restored);
  restored.random = () => 0.99;
  const d = damage(g) * 1.65;
  checkDamage(restored, [[restored.enemies[0], d * 1.45]]);
  for (const shot of [...restored.shots]) strike(restored, shot, restored.enemies[0]);
  checkDamage(restored, [[restored.enemies[0], d * 3.7]]);
  checkDamage(g, [[boss, d * 1.45]]);
});

test('旧 shots 没有元数据时保持原伤害直到消失，新发射弹丸才应用 Boss 衰减', () => {
  const g = game('fire');
  target(g);
  g.cast(g.weapons[0]);
  const raw = JSON.parse(JSON.stringify(g.snapshot()));
  delete raw.bossVolleys;
  for (const shot of raw.shots) delete shot.bossAttack;
  const restored = Game.restore(g.save, raw);
  assert.ok(restored);
  restored.random = () => 0.99;
  const boss = restored.enemies[0];
  const d = damage(restored) * 1.65;
  for (const shot of [...restored.shots]) strike(restored, shot, boss);
  checkDamage(restored, [[boss, 7 * d]]);
  restored.cast(restored.weapons[0]);
  for (const shot of [...restored.shots]) strike(restored, shot, boss);
  checkDamage(restored, [[boss, (7 + 3.7) * d]]);
  assert.equal(restored.shots.length, 0);
  assert.deepEqual(restored.snapshot().bossVolleys, [], '已消失施法不得留下永久伤害预算');
});

test('不合法施法表、索引和子攻击倍率必须拒绝恢复', async (t) => {
  const g = game('sword');
  const boss = target(g);
  g.cast(g.weapons[0]);
  strike(g, g.shots[0], boss);
  const snapshot = g.snapshot();
  assert.ok(snapshot.bossVolleys, '生产快照需包含施法表');
  const mutations: [string, (s: typeof snapshot) => void][] = [
    ['施法表不是数组', (s) => (s.bossVolleys = {})],
    ['施法表为 null', (s) => (s.bossVolleys = null)],
    ['未知法宝', (s) => (s.bossVolleys[0].weapon = 'invalid')],
    ['命中表不是数组', (s) => (s.bossVolleys[0].hitBosses = {})],
    ['非法 Boss 编号', (s) => (s.bossVolleys[0].hitBosses = [-1])],
    ['小数 Boss 编号', (s) => (s.bossVolleys[0].hitBosses = [1.5])],
    ['重复 Boss 编号', (s) => (s.bossVolleys[0].hitBosses = [boss.id, boss.id])],
    ['子攻击为 null', (s) => (s.shots[0].bossAttack = null)],
    ['子攻击缺字段', (s) => (s.shots[0].bossAttack = {})],
    ['缺少施法表', (s) => delete s.bossVolleys],
    ['越界施法索引', (s) => (s.shots[0].bossAttack.volley = s.bossVolleys.length)],
    ['负数施法索引', (s) => (s.shots[0].bossAttack.volley = -1)],
    ['小数施法索引', (s) => (s.shots[0].bossAttack.volley = 0.5)],
    ['法宝不匹配', (s) => (s.shots[0].kind = 'arrow')],
    ['敌弹携带上下文', (s) => (s.shots[0].kind = 'hostile')],
    ['倍率表为 null', (s) => (s.shots[0].bossAttack.multipliers = null)],
    ['倍率表为数组', (s) => (s.shots[0].bossAttack.multipliers = [])],
    ['倍率超范围', (s) => (s.shots[0].bossAttack.multipliers[boss.id] = 2)],
    ['倍率不属于当前法宝', (s) => (s.shots[0].bossAttack.multipliers[boss.id] = 0.6)],
    ['倍率为 NaN', (s) => (s.shots[0].bossAttack.multipliers[boss.id] = NaN)],
    ['倍率为 Infinity', (s) => (s.shots[0].bossAttack.multipliers[boss.id] = Infinity)],
    ['倍率目标编号非法', (s) => (s.shots[0].bossAttack.multipliers = { invalid: 1 })],
    ['倍率目标不在命中表', (s) => (s.bossVolleys[0].hitBosses = [])],
  ];
  for (const [name, mutate] of mutations) {
    await t.test(name, () => {
      const raw = structuredClone(snapshot);
      mutate(raw);
      assert.equal(Game.restore(structuredClone(g.save), raw), null);
    });
  }
});

test('独立天劫不使用同次施法衰减，原核心开放结算仍记录完整来源伤害', () => {
  for (const id of ['fire', 'arrow', 'compass', 'orbit'] as const) {
    const source = game(id);
    const g = Game.createTribulation(source.save, source);
    g.random = () => 0.99;
    g.time = 20;
    g.player.x = g.player.y = 0;
    const boss = g.boss!;
    Object.assign(boss, { hp: 1e7, maxHp: 1e7, x: 0, y: 0, radius: 150 });
    assert.ok(g.tribulationVulnerable);
    g.cast(g.weapons[0]);
    for (const shot of [...g.shots]) strike(g, shot, boss);
    const expected = damage(g) * (id === 'fire' ? 7 * 1.65 : id === 'arrow' ? 7 : 8);
    checkDamage(g, [[boss, expected]]);
    close(g.tribulationOpeningDamage, expected, '原天劫核心开放伤害');
  }
});
