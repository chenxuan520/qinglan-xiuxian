import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { freshSave, SAVE_SCHEMA, readSave, completeTribulation } from '../src/progress.ts';
import { bossSkills, bossSkillCooldown } from '../src/boss-skills.ts';
import { SOVEREIGN_GOLD, bossShotPose } from '../src/boss-mechanics.ts';
import { autoplayInput } from '../src/autoplay.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';
import { STAGES } from '../src/data.ts';
import {
  drawBossField,
  drawBossShot,
  drawSovereignWarnings,
  drawSoulShot,
} from '../src/boss-effects.ts';
import { drawBossSummon } from '../src/boss-mechanics-render.ts';
import { drawRegionalField } from '../src/regional-render.ts';

const near = (a: number, b: number, tolerance = 1e-7) =>
  assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
function encounter(origin = 6, arena = 6, cultivation = 119940) {
  const save = freshSave('heaven', ['metal'], 'dual', () => 0.5);
  save.unlocked = 6;
  save.completed = [0, 1, 2, 3, 4, 5];
  save.cultivation = cultivation;
  const g = new Game(save, arena, 0, () => 0.5);
  g.time = 400;
  g.trialBossesSpawned = 7;
  g.trialBossesDefeated = 6;
  g.nextTrialBossAt = g.nextElite = 99999;
  g.bossSpawned = true;
  g.spawnBudget = -10000;
  g.weapons[0].timer = 99999;
  g.player.invincible = 99999;
  const e = g.spawnEnemy(10, false, true, { x: -300, y: 0 }, origin);
  e.speed = 0;
  e.cooldown = e.pursuitCooldown = 99999;
  return { g, e };
}
function cast(c: ReturnType<typeof encounter>, phase: number, borrowed = 0) {
  const { g, e } = c;
  e.skillStep = phase;
  e.bossSkillQueue = bossSkills(e.bossStage!, g.isFinalTrial)
    .map((_, i) => i)
    .filter((i) => i !== phase);
  g.random = () => (borrowed + 0.5) / 6;
  g.castBossSkill(e, 1, 0);
  e.cooldown = e.pursuitCooldown = 99999;
}
function advance(g: Game, seconds: number) {
  for (let t = 0; t < seconds - 1e-9; t += 0.01) g.update(Math.min(0.01, seconds - t));
}

test('仙尊保留原六招，下标6/7/8追加三招；半血前引力回退仍只消耗所抽队列位置', () => {
  for (const final of [false, true]) {
    assert.deepEqual(bossSkills(6, final).slice(0, 6), STAGES[6].skills);
    assert.deepEqual(bossSkills(6, final).slice(6), ['万劫归一', '天劫审判', '归墟引力']);
  }
  for (const hp of [1, 0.5]) {
    const c = encounter();
    c.e.hp = c.e.maxHp * hp;
    cast(c, 8, 3);
    assert.equal(c.e.gravityUntil, undefined);
    assert.equal(c.g.shots.length, 0);
    assert.equal(c.g.zones.length, 3);
    assert.equal(c.g.notice, '九天执劫仙尊 · 万劫归一 · 五毒游瘴');
    assert.deepEqual([c.e.skillStep, ...c.e.bossSkillQueue!], [0, 1, 2, 3, 4, 5, 6, 7]);
  }
  const c = encounter();
  c.e.hp = c.e.maxHp * 0.499;
  cast(c, 8);
  assert.equal(c.e.gravityUntil, c.g.time + 2);
  assert.equal(c.g.shots.length, 24);
});

for (let borrowed = 0; borrowed < 6; borrowed++)
  test(`万劫归一均匀抽样区间${borrowed}复用真实招牌、仙尊伤害与金色，续局仍合法`, () => {
    const c = encounter();
    const prior = c.g.hostileShot(c.e, 1, 0, 155, 7);
    c.g.zone(900, 900, 10, 1, 7, '#123456', 'blast', 1, true);
    const priorZone = c.g.zones[0];
    cast(c, 6, borrowed);
    assert.equal(c.e.bossStage, 6);
    assert.equal(
      c.g.notice,
      `九天执劫仙尊 · 万劫归一 · ${bossSkills(borrowed, false)[borrowed >= 4 ? 4 : 3]}`,
    );
    const shots = c.g.shots.slice(1),
      zones = c.g.zones.slice(1),
      children = c.g.enemies.slice(1);
    assert.equal(prior.color, STAGES[6].color);
    assert.equal(priorZone.color, '#123456');
    assert.ok(shots.every((b) => b.color === SOVEREIGN_GOLD && b.bossStage === borrowed));
    assert.ok(zones.every((z) => z.color === SOVEREIGN_GOLD));
    assert.ok(
      children.filter((e) => e.bossSummon).every((e) => e.bossSummon!.color === SOVEREIGN_GOLD),
    );
    assert.deepEqual(
      [shots.length, zones.length, children.length],
      [
        [0, 3, 3],
        [7, 0, 0],
        [0, 0, 2],
        [0, 3, 0],
        [0, 0, 3],
        [0, 2, 0],
      ][borrowed],
    );
    if (borrowed === 0) assert.ok(zones.every((z) => z.damage === c.e.damage * 0.55));
    if (borrowed === 1) assert.ok(shots.every((b) => b.damage === c.e.damage * 0.6));
    if (borrowed === 2) assert.ok(children.every((e) => e.maxHp >= c.e.maxHp * 0.08));
    if (borrowed === 3) assert.ok(zones.every((z) => z.damage === c.e.damage && z.life === 12));
    if (borrowed === 4) assert.ok(children.every((child) => child.illusionOf === c.e.id));
    if (borrowed === 5)
      assert.ok(zones.every((z) => z.kind === 'boss-sweep' && z.damage === c.e.damage));
    for (const shot of shots) assert.ok(Number.isFinite(bossShotPose(shot).x));
    assert.ok(Game.restore(c.g.save, c.g.snapshot()));
  });

for (let origin = 0; origin < 6; origin++)
  test(`万劫归一与旧王${origin}共用同一完整招式，连续施法上限及动态推进一致`, () => {
    const native = encounter(origin);
    const sovereign = encounter();
    for (const c of [native, sovereign]) {
      c.e.damage = 100;
      c.e.radius = native.e.radius;
      c.e.hp = c.e.maxHp = 300000;
      c.g.playerTrail = [
        { x: 40, y: 20 },
        { x: 100, y: 50 },
      ];
    }
    const mechanics = (c: ReturnType<typeof encounter>) => ({
      shots: c.g.shots.map(({ color, ...shot }) => shot),
      zones: c.g.zones.map(({ color, ...zone }) => zone),
      summons: c.g.enemies.slice(1).map(({ bossSummon, ...enemy }) => ({
        ...enemy,
        bossSummon: bossSummon && (({ color, ...state }) => state)(bossSummon),
      })),
    });
    for (let castIndex = 0; castIndex < 4; castIndex++) {
      cast(native, origin >= 4 ? 4 : 3, origin);
      cast(sovereign, 6, origin);
      assert.deepEqual(
        mechanics(sovereign),
        mechanics(native),
        '数量、速度、伤害、持续、延迟、轨迹、控制类型和上限必须一致',
      );
    }
    for (const seconds of [0.2, 0.7, 1.4]) {
      advance(native.g, seconds);
      advance(sovereign.g, seconds);
      assert.deepEqual(
        mechanics(sovereign),
        mechanics(native),
        '推进后的弹丸、区域与召物仍共用机制',
      );
    }
  });

test('万劫归一异常路径仍恢复仙尊身份；回焰及召物保留各自上限，新借招不增限制', () => {
  const c = encounter();
  c.g.castBossMechanic = () => {
    throw new Error('injected failure');
  };
  assert.throws(() => cast(c, 6, 2), /injected failure/);
  assert.equal(c.e.bossStage, 6);
  for (const [borrowed, limit] of [
    [0, 3],
    [1, 14],
    [2, 2],
  ]) {
    const h = encounter();
    for (let i = 0; i < 5; i++) cast(h, 6, borrowed);
    assert.equal([0, 2].includes(borrowed) ? h.g.enemies.length - 1 : h.g.shots.length, limit);
  }
  for (const borrowed of [4, 5]) {
    const h = encounter();
    for (let i = 0; i < 5; i++) cast(h, 6, borrowed);
    assert.equal(
      borrowed === 4 ? h.g.enemies.length - 1 : h.g.zones.length,
      borrowed === 4 ? 15 : 10,
    );
  }
});

test('天劫审判3秒后按到期落脚点/输入落三雷，半径60、错拍预警、1.2倍伤害', () => {
  const c = encounter();
  cast(c, 7);
  assert.deepEqual(c.e.judgements, [403]);
  c.g.input = { x: 0.6, y: 0.8 };
  advance(c.g, 2.9);
  assert.equal(c.g.zones.length, 0);
  const p = { x: c.g.player.x, y: c.g.player.y };
  c.g.time = 403;
  c.g.updateSovereignSkills(0);
  assert.equal(c.g.zones.length, 3);
  c.g.zones.forEach((z, i) => {
    near(z.x, p.x + 0.6 * 65 * i);
    near(z.y, p.y + 0.8 * 65 * i);
    assert.equal(z.radius, 60);
    near(z.delay, 0.8 + i * 0.4);
    assert.equal(z.damage, c.e.damage * 1.2);
    assert.equal(z.color, '#d2b5ff');
  });
  assert.equal(c.e.judgements, undefined);
  c.g.player.invincible = 0;
  c.g.updateZones(0.01);
  assert.equal(c.g.effects.filter((e) => e.kind === 'lightning').length, 0);
  for (let i = 0; i < 80; i++) c.g.updateZones(0.01);
  assert.ok(c.g.effects.some((e) => e.kind === 'lightning'));
});

test('短间隔两次审判各在施法后三秒落雷，不吞掉前一次；暂停与升级冻结劫印', () => {
  const c = encounter();
  cast(c, 7);
  advance(c.g, 1.2);
  cast(c, 7);
  assert.equal(c.e.judgements!.length, 2);
  const raw = c.g.snapshot();
  c.g.pause();
  c.g.update(1);
  assert.equal(c.g.time, raw.time);
  assert.deepEqual(c.e.judgements, raw.enemies[0].judgements);
  c.g.state = 'upgrade';
  c.g.update(1);
  assert.equal(c.g.time, raw.time);
  c.g.state = 'playing';
  advance(c.g, 1.81);
  assert.equal(c.g.zones.length, 3);
  assert.equal(c.e.judgements!.length, 1);
  c.g.zones = [];
  advance(c.g, 1.2);
  assert.equal(c.g.zones.length, 3);
  assert.equal(c.e.judgements, undefined);
});

test('归墟引力完整两秒拉180像素，零时和一秒各24弹，结束后不再拉', () => {
  const c = encounter();
  c.e.hp *= 0.4;
  cast(c, 8);
  assert.equal(c.g.shots.length, 24);
  c.g.shots.forEach((b) => {
    near(Math.hypot(b.vx, b.vy), 170);
    assert.equal(b.damage, c.e.damage * 0.75);
  });
  c.g.shots = [];
  advance(c.g, 0.99);
  assert.equal(c.g.shots.length, 0);
  near(c.g.player.x, -89.1);
  advance(c.g, 0.02);
  assert.equal(c.g.shots.length, 24);
  advance(c.g, 0.99);
  near(c.g.player.x, -180);
  advance(c.g, 0.1);
  near(c.g.player.x, -180);
  assert.equal(c.e.gravityUntil, undefined);
});

test('引力叠加在自身移动之后，定身不拉，不穿过仙尊，不额外结算碰撞伤害', () => {
  const c = encounter();
  c.e.hp *= 0.4;
  cast(c, 8);
  c.g.input = { x: 1, y: 0 };
  const speed = c.g.stats.speed;
  advance(c.g, 0.5);
  near(c.g.player.x, (speed - 90) * 0.5);
  const bound = encounter();
  bound.e.hp *= 0.4;
  cast(bound, 8);
  bound.g.immobilized = 5;
  advance(bound.g, 2.1);
  near(bound.g.player.x, 0);
  const close = encounter();
  close.e.hp *= 0.4;
  close.e.x = -1;
  cast(close, 8);
  const hp = close.g.player.hp;
  advance(close.g, 0.05);
  near(close.g.player.x, -1);
  assert.equal(close.g.player.hp, hp);
});

test('审判/引力续局与导入保留剩余时刻且深克隆，第二环在读档前后都只发一次', () => {
  for (const seconds of [0.6, 1.2]) {
    const c = encounter();
    c.e.hp *= 0.4;
    cast(c, 7);
    cast(c, 8);
    advance(c.g, seconds);
    c.g.shots = [];
    c.g.pause();
    const raw = c.g.snapshot();
    assert.notEqual(raw.enemies[0].judgements, c.e.judgements);
    for (const g of [Game.restore(c.g.save, raw), importSave(exportSave(c.g.save, c.g)).run]) {
      assert.ok(g);
      const e = g.boss!;
      assert.deepEqual(e.judgements, c.e.judgements);
      assert.notEqual(e.judgements, raw.enemies[0].judgements);
      assert.equal(e.gravityUntil, c.e.gravityUntil);
      const x = g.player.x;
      advance(g, 1);
      assert.equal(g.player.x, x, '恢复后先暂停');
      g.resume();
      advance(g, 0.5);
      assert.equal(g.shots.length, seconds < 1 ? 24 : 0);
      advance(g, 2.01 - seconds - 0.5);
      near(g.player.x, -180);
      assert.equal(e.gravityUntil, undefined);
      advance(g, 1.01);
      assert.equal(e.judgements, undefined);
      assert.equal(g.zones.length, 3);
    }
  }
  assert.equal(SAVE_SCHEMA, 44);
  const old = freshSave();
  old.schema = SAVE_SCHEMA - 1;
  assert.equal(readSave(JSON.stringify(old)).status, 'ok');
});

test('仙尊死亡、寿尽、灼烧及普通战败清除全部计时；旧王和独立天劫拒绝伪造计时', () => {
  for (const ending of ['boss', 'age', 'burn', 'hit']) {
    const c = encounter(6, 6, ending === 'age' ? 0 : 119940);
    c.e.hp *= 0.4;
    cast(c, 7);
    cast(c, 8);
    if (ending === 'boss') c.g.hitEnemy(c.e, c.e.maxHp * 2);
    if (ending === 'age') {
      c.g.save.age = c.g.lifespan;
      c.g.save.nextTribulationAge = c.g.lifespan + 1000;
    }
    if (ending === 'burn') c.g.burning = { life: 0.01, damage: c.g.player.maxHp * 2 };
    if (ending === 'hit') {
      c.g.player.invincible = 0;
      c.g.hurtPlayer(c.g.player.maxHp * 2);
    }
    c.g.update(0.01);
    assert.equal(c.e.judgements, undefined, ending);
    assert.equal(c.e.gravityUntil, undefined, ending);
    assert.equal(c.g.gravityBoss, undefined, ending);
  }
  const c = encounter();
  cast(c, 7);
  c.e.hp *= 0.4;
  cast(c, 8);
  const raw = c.g.snapshot();
  for (const value of [null, [], [NaN], [399], [404], [403, 402], Array(7).fill(403), 'bad']) {
    const bad = structuredClone(raw);
    Object.assign(bad.enemies[0], { judgements: value });
    assert.equal(Game.restore(c.g.save, bad), null, JSON.stringify(value));
  }
  for (const value of [null, NaN, 399, 403, 'bad']) {
    const bad = structuredClone(raw);
    Object.assign(bad.enemies[0], { gravityUntil: value });
    assert.equal(Game.restore(c.g.save, bad), null);
  }
  for (const patch of [{ boss: false }, { bossStage: 4 }, { dead: true }, { hp: 0 }]) {
    const bad = structuredClone(raw);
    Object.assign(bad.enemies[0], patch);
    assert.equal(Game.restore(c.g.save, bad), null);
  }
  const native = encounter(2, 2);
  native.e.judgements = [403];
  assert.equal(Game.restore(native.g.save, native.g.snapshot()), null);
});

test('周期天劫中断恰好跨过第二环/劫印到期时，保存合法且归来不漏招、不重发', () => {
  for (const seconds of [0.99, 2.99]) {
    const c = encounter();
    c.e.hp *= 0.4;
    cast(c, 7);
    cast(c, 8);
    advance(c.g, seconds);
    c.g.shots = [];
    const before = c.g.time;
    c.g.save.nextTribulationAge = c.g.save.age + 1e-6;
    c.g.update(0.01);
    assert.equal(c.g.state, 'paused');
    near(c.g.time, before + 0.01);
    assert.ok(Game.restore(c.g.save, c.g.snapshot()));
    assert.equal(c.g.zones.length, 0);
    assert.equal(completeTribulation(c.g.save, c.g.save.tribulations + 1), true);
    c.g.resume();
    advance(c.g, 0.03);
    if (seconds < 1) {
      assert.equal(c.g.shots.length, 24);
      advance(c.g, 1.01);
      assert.equal(c.e.gravityUntil, undefined);
      near(c.g.player.x, -180);
    } else {
      assert.equal(c.g.zones.length, 3);
      assert.equal(c.e.judgements, undefined);
    }
  }
});

test('双狼原生/终关与仙尊借用都至少施放者8%气血，标准精英若更高则保留；木心不改', () => {
  for (const [origin, arena] of [
    [2, 2],
    [2, 6],
    [6, 6],
  ]) {
    for (const hp of [100, 1e12]) {
      const c = encounter(origin, arena);
      c.e.hp = c.e.maxHp = hp;
      if (origin === 6) cast(c, 6, 2);
      else c.g.castBossMechanic(c.e, 1, 0);
      const wolves = c.g.enemies.filter((e) => e.bossSummon?.kind === 'wolf');
      assert.equal(wolves.length, 2);
      assert.ok(wolves.every((e) => e.elite && e.hp === e.maxHp && e.maxHp >= hp * 0.08));
      if (hp === 1e12) assert.ok(wolves.every((e) => e.maxHp === hp * 0.08));
      else assert.ok(wolves.every((e) => e.maxHp > hp * 0.08));
    }
  }
  const native = encounter(0, 6),
    borrowed = encounter();
  native.g.castBossMechanic(native.e, 1, 0);
  cast(borrowed, 6, 0);
  assert.deepEqual(
    native.g.enemies.slice(1).map((e) => e.maxHp),
    borrowed.g.enemies.slice(1).map((e) => e.maxHp),
  );
});

test('自动历练只在引力中加背离单位向量，静止仙尊隔离场景两秒距离不减', () => {
  for (const point of [
    { x: -300, y: 0 },
    { x: 0, y: 300 },
    { x: 200, y: -200 },
  ]) {
    const c = encounter();
    Object.assign(c.e, point);
    c.e.hp *= 0.4;
    const original = autoplayInput(c.g);
    cast(c, 8);
    c.g.shots = [];
    const direction = autoplayInput(c.g);
    assert.ok(direction.x * point.x + direction.y * point.y < 0);
    let before = Math.hypot(c.e.x - c.g.player.x, c.e.y - c.g.player.y);
    for (let i = 0; i < 200; i++) {
      c.g.input = autoplayInput(c.g);
      c.g.update(0.01);
      c.g.shots = [];
      const after = Math.hypot(c.e.x - c.g.player.x, c.e.y - c.g.player.y);
      assert.ok(after >= before - 1e-7);
      before = after;
    }
    c.g.player.x = c.g.player.y = 0;
    delete c.e.gravityUntil;
    assert.deepEqual(autoplayInput(c.g), original);
    c.g.immobilized = 1;
    c.e.gravityUntil = c.g.time + 2;
    assert.deepEqual(autoplayInput(c.g), { x: 0, y: 0 });
  }
  const c = encounter();
  c.e.speed = 122.2;
  c.e.hp *= 0.4;
  c.g.save.retreatBonus.speed = 100;
  cast(c, 8);
  c.g.shots = [];
  const distance = Math.abs(c.e.x);
  for (let i = 0; i < 200; i++) {
    c.g.input = autoplayInput(c.g);
    c.g.update(0.01);
    c.g.shots = [];
  }
  assert.ok(Math.hypot(c.e.x - c.g.player.x, c.e.y - c.g.player.y) >= distance);
});

function paint() {
  const colors: string[] = [],
    arcs: number[][] = [];
  const c = new Proxy(
    {},
    {
      get:
        (_, key) =>
        (...args: number[]) => {
          if (key === 'arc') arcs.push(args);
        },
      set: (_, key, value) => {
        if (key === 'strokeStyle' || key === 'fillStyle') colors.push(value);
        return true;
      },
    },
  ) as CanvasRenderingContext2D;
  return { c, colors, arcs };
}
test('借用金色真实进入弹体、区域和召物笔画；劫印及引力按快照状态绘制', () => {
  for (const borrowed of [0, 1, 2, 3, 4, 5]) {
    const c = encounter();
    cast(c, 6, borrowed);
    if (borrowed === 4) c.g.updateEnemies(0.8);
    const canvas = paint();
    for (const shot of c.g.shots) {
      if (shot.enemySkill === 'soul' && shot.bossStage === undefined)
        drawSoulShot(canvas.c, shot.radius, shot.color);
      else drawBossShot(canvas.c, shot);
    }
    for (const zone of c.g.zones)
      if (!drawBossField(canvas.c, zone, c.g.time, false))
        drawRegionalField(canvas.c, zone, c.g.time, false, true);
    for (const child of c.g.enemies.slice(1).filter((e) => e.bossSummon))
      drawBossSummon(canvas.c, child);
    assert.ok(canvas.colors.includes(SOVEREIGN_GOLD));
  }
  const c = encounter();
  c.e.hp *= 0.4;
  cast(c, 7);
  cast(c, 8);
  for (const reduced of [false, true]) {
    const canvas = paint();
    drawSovereignWarnings(canvas.c, c.g, reduced);
    assert.ok(canvas.colors.includes(SOVEREIGN_GOLD));
    assert.equal(canvas.arcs.length, 5);
  }
  c.g.hitEnemy(c.e, c.e.maxHp * 2);
  const canvas = paint();
  drawSovereignWarnings(canvas.c, c.g, false);
  assert.equal(canvas.arcs.length, 0);
});

test('仙尊幽影换形留下三影、横移150，0.8秒后各放八枚金色魂弹；原生保持紫色', () => {
  for (const origin of [4, 6]) {
    const c = encounter(origin);
    const before = { x: c.e.x, y: c.e.y };
    cast(c, origin === 6 ? 6 : 4, 4);
    near(c.e.x, before.x);
    near(c.e.y, before.y + 150);
    const shadows = c.g.enemies.filter((e) => e.illusionOf === c.e.id);
    assert.equal(shadows.length, 3);
    assert.deepEqual(
      shadows.map((e) => [e.x, e.y]),
      [-150, 0, 300].map((side) => [before.x, before.y + side]),
    );
    assert.ok(
      shadows.every(
        (e) =>
          e.radius === c.e.radius &&
          e.hp === 1 &&
          e.speed === 0 &&
          e.damage === 0 &&
          e.cooldown === 0.8,
      ),
    );
    assert.ok(
      shadows.every((e) => !('color' in e)),
      '幻影没有颜色字段，不新增字段',
    );
    c.g.updateEnemies(0.799);
    assert.equal(c.g.shots.length, 0);
    c.g.updateEnemies(0.0011);
    assert.equal(c.g.shots.length, 24);
    for (const shadow of shadows)
      assert.equal(
        c.g.shots.filter((s) => s.origin.x === shadow.x && s.origin.y === shadow.y).length,
        8,
      );
    assert.ok(
      c.g.shots.every(
        (s) =>
          s.enemySkill === 'soul' &&
          s.damage === c.e.damage * 0.35 &&
          s.color === (origin === 6 ? SOVEREIGN_GOLD : '#baa2d0'),
      ),
    );
    assert.ok(shadows.every((e) => e.dead));
  }
});

test('幽影换形或周天星轨生成异常时仍恢复仙尊身份', () => {
  for (const borrowed of [4, 5]) {
    const c = encounter();
    if (borrowed === 4)
      c.g.spawnEnemy = () => {
        throw Error('shadow failure');
      };
    else
      c.g.zone = () => {
        throw Error('sweep failure');
      };
    assert.throws(() => cast(c, 6, borrowed), /failure/);
    assert.equal(c.e.bossStage, 6);
  }
});

test('共用魂弹笔画仅仙尊金色覆盖，原生紫色的发光、填充与描边保持', () => {
  for (const color of [undefined, '#baa2d0', SOVEREIGN_GOLD]) {
    const canvas = paint();
    drawSoulShot(canvas.c, 7, color);
    if (color === SOVEREIGN_GOLD)
      assert.ok(canvas.colors.filter((c) => c === SOVEREIGN_GOLD).length >= 2);
    else {
      assert.ok(canvas.colors.includes('#c9a9ed'));
      assert.ok(canvas.colors.includes('#f0dcff'));
      assert.ok(!canvas.colors.includes(SOVEREIGN_GOLD));
    }
  }
});
