import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, type Zone } from '../src/game.ts';
import { freshSave } from '../src/progress.ts';
import { ENEMY_CONTROL, slowingHazard, entanglingHazard } from '../src/regional-hazards.ts';
import { autoplayInput } from '../src/autoplay.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';
import { drawPlayerAilments } from '../src/regional-render.ts';

function arena(stage = 0) {
  const save = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  Object.assign(save, { unlocked: 6, cultivation: 1e6 });
  const g = new Game(save, stage, 0, () => 0.5);
  g.weapons[0].timer = 99999;
  g.spawnBudget = -10000;
  g.nextElite = g.nextTrialBossAt = 99999;
  g.bossSpawned = true;
  g.player.hp = g.player.maxHp / 2;
  return g;
}
function field(kind: string, damage = 0): Zone {
  return {
    x: 0,
    y: 0,
    radius: 80,
    life: 20,
    maxLife: 20,
    damage,
    tick: 0,
    delay: 0,
    hostile: true,
    kind,
    color: '#abc',
  };
}
function advance(g: Game, seconds: number) {
  for (let t = 0; t < seconds - 1e-9; t += 0.01) g.update(Math.min(0.01, seconds - t));
}
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test('藤缠三秒冻结全部掉落的吸附和拾取，保留物品，结束后照常收取', () => {
  const g = arena();
  g.zones = [field('enemy-roots')];
  g.pickups = ['xp', 'heal', 'magnet', 'iron', 'chest'].map((kind, i) => ({
    kind,
    value: 2,
    pull: i === 0,
    x: 0,
    y: 0,
  })) as Game['pickups'];
  const drops = structuredClone(g.pickups);
  g.updateZones(0.01);
  assert.equal(g.entangled, 3);
  assert.equal(g.slowed, 0);
  g.updatePickups(0.05);
  assert.deepEqual(g.pickups, drops);
  g.zones = [];
  advance(g, 2.99);
  assert.ok(g.entangled > 0);
  assert.deepEqual(g.pickups, drops);
  advance(g, 0.02);
  assert.equal(g.entangled, 0);
  assert.equal(g.pickups.length, 0);
  assert.ok(g.xp > 0);
  assert.ok(g.iron >= 2);
});

test('站在藤圈里不刷新当前藤缠，三秒结束后留出一秒拾取窗口，护体与预警不施加', () => {
  for (const kind of ['enemy-roots', 'boss-roots']) {
    const g = arena();
    g.zones = [field(kind)];
    g.zones[0].delay = 1;
    g.updateZones(0.1);
    assert.equal(g.entangled, 0);
    g.zones[0].delay = 0;
    g.zones[0].tick = 9999; // 单独核藤缠保护，避免零伤害tick附带的既有护体影响再次触发时刻。
    g.player.invincible = 1;
    g.updateZones(0.1);
    assert.equal(g.entangled, 0);
    g.player.invincible = 0;
    g.updateZones(0.01);
    assert.equal(g.entangled, 3);
    const next = g.nextEnemyEntangleAt;
    advance(g, 2);
    near(g.entangled, 1);
    assert.equal(g.nextEnemyEntangleAt, next);
    advance(g, 1.01);
    assert.equal(g.entangled, 0);
    g.pickups = [{ kind: 'iron', x: 0, y: 0, value: 1, pull: false }];
    g.updatePickups(0.01);
    assert.equal(g.pickups.length, 0);
    advance(g, 1);
    assert.ok(g.entangled > 2.9);
  }
});

test('藤圈仅藤缠，冰圈仍按原规则减速，终关旧王同样区分', () => {
  for (const stage of [0, 6])
    for (const kind of ['enemy-roots', 'boss-roots', 'enemy-frost', 'boss-frost']) {
      const g = arena(stage);
      const z = field(kind);
      g.zones = [z];
      g.updateZones(0.01);
      const roots = kind.includes('roots');
      assert.equal(slowingHazard(z), !roots);
      assert.equal(entanglingHazard(z), roots);
      assert.equal(g.entangled, roots ? 3 : 0);
      assert.equal(g.slowed, roots ? 0 : 0.55);
    }
});

test('只有实际正毒伤触发三秒蚀体，受击刷新；护体、零伤害和普通伤害不触发', () => {
  for (const stage of [3, 6])
    for (const kind of ['poison', 'enemy-miasma', 'boss-miasma']) {
      const g = arena(stage);
      g.zones = [field(kind, 1)];
      g.player.invincible = 1;
      g.updateZones(0.01);
      assert.equal(g.corroded, 0);
      g.player.invincible = 0;
      g.zones[0].tick = 0;
      g.zones[0].damage = 0;
      g.updateZones(0.01);
      assert.equal(g.corroded, 0);
      g.player.invincible = 0;
      g.zones[0].tick = 0;
      g.zones[0].damage = 1;
      g.updateZones(0.01);
      assert.equal(g.corroded, 3);
      g.zones = [];
      advance(g, 1);
      near(g.corroded, 2);
      g.hurtPlayer(1, false, true);
      assert.equal(g.corroded, 3);
      g.corroded = 0;
      g.player.invincible = 0;
      g.hurtPlayer(1);
      assert.equal(g.corroded, 0);
    }
});

test('毒君弹原生与终关均施加蚀体，其他妖王弹不扩大毒效', () => {
  for (const arenaStage of [3, 6])
    for (const origin of [2, 3, 4]) {
      const g = arena(arenaStage);
      const e = g.spawnEnemy(10, false, true, { x: 0, y: -100 }, origin);
      const shot = g.hostileShot(e, 1, 0, 10, 1);
      Object.assign(shot, { x: 0, y: 0, vx: 0, vy: 0 });
      g.updateShots(0.01);
      assert.equal(g.corroded, origin === 3 ? 3 : 0);
    }
});

test('首次毒伤的骨甲反伤斩妖也不能绕过蚀体回复限制', () => {
  const g = arena(3);
  g.passives = { bone: 1, devour: 5 };
  const e = g.spawnEnemy(48, false, false, { x: 10, y: 0 });
  e.hp = 1;
  const before = g.player.hp;
  const damage = g.stats.armor;
  g.zones = [field('boss-miasma', 1)];
  g.updateZones(0.01);
  assert.equal(g.kills, 1);
  assert.equal(g.corroded, 3);
  near(g.player.hp, before - damage);
});

test('首次蚀体提示在同帧宝匣后真实保留，之后不反复覆盖普通战斗提示', () => {
  const g = arena(3);
  g.zones = [field('boss-miasma', 1)];
  g.pickups = [{ kind: 'chest', x: 0, y: 0, value: 1, pull: false }];
  g.update(0.01);
  assert.equal(g.corroded, 3);
  assert.equal(g.notice, '蚀体 · 无法回复');
  assert.equal(g.noticeTime, 3);
  g.pickups = [{ kind: 'chest', x: 0, y: 0, value: 1, pull: false }];
  g.update(0.01);
  assert.match(g.notice, /炼器宝匣/);
});

test('同帧首次藤缠和蚀体提示均保留，不增加对局保存字段', () => {
  const g = arena(6);
  const before = Object.keys(g.snapshot()).sort();
  g.zones = [{ ...field('boss-roots'), tick: 10 }, field('boss-miasma', 1)];
  g.update(0.01);
  assert.equal(g.entangled, 3);
  assert.equal(g.corroded, 3);
  assert.ok(g.notice.includes('藤缠 · 暂难拾取'));
  assert.ok(g.notice.includes('蚀体 · 无法回复'));
  assert.deepEqual(Object.keys(g.snapshot()).sort(), before);
});

test('蚀体阻止回血、回春灵露、宝匣与斩妖回血，回春丹留在地上而其他物品照收', () => {
  const g = arena(3);
  g.corroded = 3;
  const hp = g.player.hp;
  g.heal(10000);
  near(g.player.hp, hp);
  advance(g, 1);
  near(g.player.hp, hp);
  g.pickups = [
    { kind: 'heal', x: 0, y: 0, value: 1, pull: true },
    { kind: 'chest', x: 0, y: 0, value: 1, pull: false },
    { kind: 'iron', x: 0, y: 0, value: 1, pull: false },
  ];
  g.updatePickups(0.01);
  assert.equal(g.pickups.length, 1);
  assert.equal(g.pickups[0].kind, 'heal');
  assert.ok(g.iron > 0);
  near(g.player.hp, hp);
  g.state = 'upgrade';
  g.choices = [{ type: 'heal', id: 'heal', level: 1 }];
  g.choose(0);
  near(g.player.hp, hp);
  g.passives.devour = 5;
  const e = g.spawnEnemy(48, false, false, { x: 150, y: 150 });
  g.hitEnemy(e, e.hp);
  near(g.player.hp, hp);
  g.zones = [];
  advance(g, 2.01);
  assert.equal(g.corroded, 0);
  assert.equal(g.pickups.filter((p) => p.kind === 'heal').length, 0);
  assert.ok(g.player.hp > hp);
});

test('神农鼎与化血盏命中仍结算伤害，蚀体仅暂停其回血', () => {
  for (const kind of ['cauldron', 'bloodpool']) {
    const g = arena(3);
    g.corroded = 3;
    const hp = g.player.hp;
    const e = g.spawnEnemy(48, false, false, { x: 100, y: 0 });
    const before = e.hp;
    g.zones = [{ ...field(kind, 1), x: 100, hostile: false }];
    g.updateZones(0.01);
    assert.ok(e.hp < before);
    assert.equal(g.player.hp, hp);
  }
});

test('蚀体也阻止境界突破与恢复战况的正向气血补算，不取消气血上限成长', () => {
  const save = freshSave();
  const g = new Game(save, 0, 0, () => 0.5);
  g.player.hp /= 2;
  g.corroded = 3;
  const hp = g.player.hp,
    maxHp = g.player.maxHp;
  g.kills = 1;
  g.combatCultivation = 100000;
  g.creditCultivation();
  assert.ok(g.player.maxHp > maxHp);
  assert.equal(g.player.hp, hp);
  const h = new Game(freshSave(), 0, 0, () => 0.5);
  h.player.hp /= 2;
  h.corroded = 3;
  h.pause();
  const raw = h.snapshot();
  h.save.cultivation = 1e9;
  const restored = Game.restore(h.save, raw)!;
  assert.ok(restored);
  assert.ok(restored.player.maxHp > raw.player.maxHp);
  assert.equal(restored.player.hp, raw.player.hp);
});

test('新状态暂停冻结、快照及导入保留，非法计时拒绝；旧快照缺字段默认为零', () => {
  const g = arena(3);
  g.entangled = 3;
  g.corroded = 2;
  g.nextEnemyEntangleAt = 5;
  g.pause();
  const raw = JSON.parse(JSON.stringify(g.snapshot()));
  for (const h of [Game.restore(g.save, raw), importSave(exportSave(g.save, g)).run]) {
    assert.ok(h);
    h.update(1);
    assert.equal(h.entangled, 3);
    assert.equal(h.corroded, 2);
    assert.equal(h.nextEnemyEntangleAt, 5);
    h.resume();
    h.update(0.05);
    near(h.entangled, 2.95);
    near(h.corroded, 1.95);
  }
  for (const key of ['entangled', 'corroded'])
    for (const bad of [-1, 3.01, NaN, Infinity, null])
      assert.equal(Game.restore(g.save, { ...raw, [key]: bad }), null);
  for (const bad of [-1, NaN, Infinity, null])
    assert.equal(Game.restore(g.save, { ...raw, nextEnemyEntangleAt: bad }), null);
  for (const key of ['entangled', 'corroded', 'nextEnemyEntangleAt']) delete raw[key];
  const old = Game.restore(g.save, raw)!;
  assert.ok(old);
  assert.equal(old.entangled, 0);
  assert.equal(old.corroded, 0);
});

test('复活、寿尽借寿与进入天劫不受蚀体阻挡并清除两种状态', () => {
  const g = arena(3);
  Object.assign(g, { entangled: 3, corroded: 3, state: 'lost' });
  g.player.hp = 0;
  assert.ok(g.revive());
  assert.equal(g.player.hp, g.player.maxHp);
  assert.equal(g.entangled + g.corroded, 0);
  const h = arena(3);
  h.save.cultivation = 0;
  h.realm = 0;
  h.save.age = h.lifespan;
  Object.assign(h, { entangled: 3, corroded: 3, state: 'lost' });
  h.player.hp = 0;
  assert.ok(h.borrowLife());
  assert.equal(h.player.hp, h.player.maxHp);
  assert.equal(h.entangled + h.corroded, 0);
  const trial = Game.createTribulation(g.save, g);
  assert.equal(trial.corroded + trial.entangled, 0);
  assert.equal(trial.player.hp, trial.player.maxHp);
});

test('自动历练不追藤缠期间的掉落与蚀体期间的回春丹，恢复后继续拾取', () => {
  const g = arena();
  g.time = 0;
  g.pickups = [{ kind: 'xp', x: -150, y: 0, value: 1, pull: false }];
  assert.ok(autoplayInput(g).x < -0.9);
  g.entangled = 3;
  assert.ok(autoplayInput(g).x > 0.9);
  g.entangled = 0;
  g.corroded = 3;
  g.pickups[0].kind = 'heal';
  assert.ok(autoplayInput(g).x > 0.9);
  g.pickups.push({ kind: 'iron', x: 0, y: 100, value: 1, pull: false });
  assert.ok(autoplayInput(g).y > 0.9);
  g.pickups.pop();
  g.corroded = 0;
  assert.ok(autoplayInput(g).x < -0.9);
});

test('新状态表现使用明确提示、有限坐标与平衡画布状态，减少动态仍可辨识', () => {
  const g = arena();
  g.entangled = 3;
  g.corroded = 3;
  let depth = 0;
  const labels: string[] = [];
  const c = new Proxy({} as CanvasRenderingContext2D, {
    get:
      (_, key) =>
      (...args: unknown[]) => {
        if (key === 'save') depth++;
        if (key === 'restore') depth--;
        assert.ok(depth >= 0);
        for (const arg of args) if (typeof arg === 'number') assert.ok(Number.isFinite(arg));
        if (key === 'fillText') labels.push(String(args[0]));
      },
  });
  for (const reduced of [false, true]) {
    drawPlayerAilments(c, g, 1, reduced);
    assert.equal(depth, 0);
  }
  assert.ok(labels.includes('藤缠 · 暂难拾取'));
  assert.ok(labels.includes('蚀体 · 无法回复'));
  assert.equal(ENEMY_CONTROL.entangle, 3);
  assert.equal(ENEMY_CONTROL.corrode, 3);
});
