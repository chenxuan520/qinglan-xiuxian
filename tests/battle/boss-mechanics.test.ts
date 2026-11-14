import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../src/battle/game.ts';
import { freshSave, readSave, SAVE_SCHEMA } from '../../src/core/progress.ts';
import { bossSkills } from '../../src/battle/boss-skills.ts';
import { FINAL_TRIAL_STAGE, STAGES, TAU } from '../../src/core/data.ts';
import {
  BOSS_MECHANICS as R,
  SOVEREIGN_GOLD,
  bossGuardedByHearts,
  bossReturnOut,
  bossShotPose,
  heartGuardReady,
  summonLinkAlpha,
} from '../../src/battle/boss-mechanics.ts';
import {
  drawBossSummon,
  drawBossMotionCue,
  drawHeartLink,
  drawBossGuard,
} from '../../src/battle/boss-mechanics-render.ts';
import { autoplayInput } from '../../src/battle/autoplay.ts';
import { exportSave, importSave } from '../../src/core/save-transfer.ts';

function encounter(origin: number, arena = origin) {
  const s = freshSave('heaven', ['metal'], 'dual', () => 0.5);
  s.unlocked = 6;
  s.completed = [0, 1, 2, 3, 4, 5];
  s.cultivation = 119940;
  const g = new Game(s, arena, 0, () => 0.5);
  g.weapons[0].timer = 99999;
  g.spawnBudget = -10000;
  g.nextElite = 99999;
  g.nextTrialBossAt = arena === 6 ? 60 : 99999;
  g.bossSpawned = true;
  const e = g.spawnEnemy(10, false, true, { x: -180, y: 0 }, origin);
  Object.assign(e, {
    speed: 0,
    cooldown: 99999,
    pursuitCooldown: 99999,
    skillStep: 3,
    bossSkillQueue: bossSkills(origin, arena === 6)
      .map((_, i) => i)
      .filter((i) => i !== 3),
  });
  return { g, e };
}
function advance(g: Game, seconds: number) {
  for (let t = 0; t < seconds - 1e-9; t += 0.01) g.update(Math.min(0.01, seconds - t));
}
function cast(origin: number, arena = origin) {
  const c = encounter(origin, arena);
  c.g.castBossSkill(c.e, 1, 0);
  return c;
}
const actors = (g: Game) => g.enemies.filter((e) => !e.dead && e.bossSummon);

for (let origin = 0; origin < 6; origin++)
  for (const arena of [origin, 6])
    test(`妖王${origin}在第${arena + 1}关的第四招实际有独立机制，原三招和仙尊不被替换`, () => {
      assert.deepEqual(bossSkills(origin, arena === 6).slice(0, 3), STAGES[origin].skills);
      assert.equal(
        bossSkills(origin, arena === 6).length,
        4 + Number([2, 4].includes(origin)) + (origin === 5 ? 2 : 0),
      );
      assert.deepEqual(bossSkills(6, true).slice(0, 6), STAGES[6].skills);
      assert.equal(bossSkills(6, true).length, 9);
      const { g, e } = cast(origin, arena);
      assert.ok(g.notice.includes(bossSkills(origin, true)[3]));
      if (origin === 0) {
        assert.equal(actors(g).length, 3);
        assert.equal(g.zones.length, 3);
        assert.ok(g.zones.every((z) => z.delay === R.heartGrow));
      }
      if (origin === 1) {
        assert.equal(g.shots.length, 9);
        assert.ok(g.shots.every((b) => b.bossMotion?.kind === 'return'));
        const aim = Math.atan2(g.player.y - e.y, g.player.x - e.x);
        const relative = g.shots.map((b) => {
          const delta = Math.atan2(b.vy, b.vx) - aim;
          return Math.atan2(Math.sin(delta), Math.cos(delta));
        });
        for (let i = 0; i < relative.length; i++)
          assert.ok(
            Math.abs(relative[i] - (-0.6 + i * 0.15)) < 1e-9,
            '九道回焰应居中对称并等距铺开',
          );
      }
      if (origin === 2) {
        assert.equal(actors(g).length, 2);
        assert.ok(actors(g).every((e) => e.bossSummon?.kind === 'wolf'));
      }
      if (origin === 3) {
        assert.equal(g.zones.length, 3);
        assert.ok(
          g.zones.every(
            (z) => z.life === 6 && z.settle === true && Math.hypot(z.vx!, z.vy!) === 95,
          ),
        );
      }
      if (origin === 4) {
        assert.equal(g.shots.length, 5);
        assert.ok(g.shots.every((b) => b.bossMotion?.kind === 'memory'));
      }
      if (origin === 5) {
        assert.equal(g.shots.length, 5);
        assert.ok(g.shots.every((b) => b.bossMotion?.kind === 'star'));
      }
      assert.ok(
        g.zones.every((z) => z.endX === undefined && z.endY === undefined),
        '不重新引入条带',
      );
      assert.deepEqual(
        [e.skillStep, ...e.bossSkillQueue!].sort(),
        bossSkills(origin, arena === 6)
          .map((_, i) => i)
          .filter((i) => i !== 3),
      );
    });

test('木心被击退或牵引后仍固定在藤圈圆心，其他妖物位移不变', () => {
  const { g } = cast(0);
  const [heart] = actors(g);
  const root = g.zones.find((z) => z.sourceId === heart.id)!;
  heart.bossSummon!.age = R.heartGrow;
  heart.hp = heart.maxHp = 1e9;
  g.weapons = [];
  g.spawnBudget = -10000;
  g.player.invincible = 99999;
  const offset = () => Math.hypot(heart.x - root.x, heart.y - root.y);

  // 游龙尺命中击退 25 像素。
  Object.assign(g.player, { x: root.x - 300, y: root.y });
  g.shots = [
    {
      x: root.x,
      y: root.y,
      vx: 0,
      vy: 0,
      life: 1,
      radius: 18,
      damage: 1,
      color: '#ffffff',
      kind: 'dragon',
      pierce: 1,
      hit: new Set<number>(),
      origin: { x: root.x, y: root.y },
      age: 0,
      bounce: 0,
      crit: false,
    },
  ];
  g.update(0.001);
  assert.ok(offset() < 0.5, `游龙尺击退后偏离藤圈圆心 ${offset().toFixed(2)} 像素`);

  // pulse 范围伤害击退 70 像素。
  Object.assign(g.player, { x: root.x - 60, y: root.y });
  g.weapons = [{ id: 'pulse', level: 1, evolved: false, timer: 0 }];
  g.cast(g.weapons[0]);
  g.weapons[0].timer = 9999;
  g.update(0.001);
  assert.ok(offset() < 0.5, `pulse 击退后偏离藤圈圆心 ${offset().toFixed(2)} 像素`);

  // 阴阳盘牵引：木心归位，普通妖物仍被拉动。
  g.weapons = [];
  g.zones.push({
    x: root.x - 40,
    y: root.y,
    radius: 120,
    life: 1,
    maxLife: 1,
    damage: 0,
    tick: 99,
    color: '#ffffff',
    kind: 'vortex',
    delay: 0,
    hostile: false,
  });
  const bystander = g.spawnEnemy(10, false, false, { x: root.x - 40, y: root.y + 60 });
  Object.assign(bystander, { speed: 0, cooldown: 9999, pursuitCooldown: 9999 });
  const before = { x: bystander.x, y: bystander.y };
  g.update(0.05);
  assert.ok(offset() < 0.5, `牵引后偏离藤圈圆心 ${offset().toFixed(2)} 像素`);
  assert.ok(
    Math.hypot(bystander.x - before.x, bystander.y - before.y) > 0,
    '普通妖物仍受阴阳盘牵引',
  );

  // 绘制坐标取木心本体，字样仍以本体中心对齐。
  const translates: number[][] = [];
  const c = new Proxy({} as CanvasRenderingContext2D, {
    get:
      (_, method: string) =>
      (...args: unknown[]) => {
        if (method === 'translate') translates.push(args as number[]);
      },
  });
  drawBossSummon(c, heart);
  assert.deepEqual(translates, [[root.x, root.y]]);

  // 快照往返后仍在藤圈圆心。
  g.weapons = [{ id: 'sword', level: 1, evolved: false, timer: 9999 }];
  g.pause();
  const restored = Game.restore(g.save, g.snapshot())!;
  const restoredHeart = restored.enemies.find((e) => e.id === heart.id)!;
  const restoredRoot = restored.zones.find((z) => z.sourceId === heart.id)!;
  assert.ok(Math.hypot(restoredHeart.x - restoredRoot.x, restoredHeart.y - restoredRoot.y) < 0.5);
});

test('木心全程可打碎，扎根前不伤人，击碎即散阵，无击杀/经验/材料/回血收益', () => {
  const { g } = cast(0);
  const [heart] = actors(g);
  const zone = g.zones.find((z) => z.sourceId === heart.id)!;
  Object.assign(g.player, { x: heart.x, y: heart.y });
  const hp = g.player.hp;
  g.updateZones(1.0);
  assert.equal(g.player.hp, hp);
  const before = [g.kills, g.xp, g.iron, g.combatCultivation, g.pickups.length];
  g.hitEnemy(heart, heart.hp, false, 'sword');
  g.updateZones(0.01);
  assert.deepEqual([g.kills, g.xp, g.iron, g.combatCultivation, g.pickups.length], before);
  assert.ok(!g.zones.includes(zone));
  const second = actors(g)[0];
  Object.assign(g.player, { x: second.x, y: second.y });
  const z = g.zones.find((z) => z.sourceId === second.id)!;
  z.delay = 0;
  g.updateZones(0.01);
  assert.ok(g.player.hp < hp);
  for (const kind of ['cauldron', 'bloodpool']) {
    const { g: h } = cast(0);
    const target = actors(h)[0];
    h.player.hp = h.player.maxHp / 2;
    const hp = h.player.hp;
    h.zones = [
      {
        x: target.x,
        y: target.y,
        radius: 5,
        life: 1,
        maxLife: 1,
        delay: 0,
        damage: target.hp * 2,
        tick: 0,
        kind,
        color: '#fff',
        hostile: false,
      },
    ];
    h.updateZones(0.01);
    assert.equal(h.player.hp, hp, kind);
  }
});

test('木心每王最多三枚，不叠加刷屏，主人倒下或十秒到期后消散', () => {
  const { g, e } = cast(0, 6);
  for (let i = 0; i < 4; i++) {
    e.skillStep = 3;
    g.castBossSkill(e, 1, 0);
  }
  assert.equal(actors(g).length, 3);
  assert.equal(g.zones.length, 3);
  for (const heart of actors(g)) g.updateBossSummon(heart, R.heartLife + 0.01);
  g.updateZones(0.01);
  assert.equal(actors(g).length, 0);
  assert.equal(g.zones.length, 0);
  e.skillStep = 3;
  g.castBossSkill(e, 1, 0);
  g.hitEnemy(e, e.hp);
  assert.ok(g.enemies.filter((c) => c.bossSummon).every((c) => c.dead));
});

test('木心九点九秒仍护王，十秒后消散且藤圈存续八点八秒', () => {
  const { g, e } = cast(0);
  const hearts = actors(g);
  assert.equal(R.heartLife, 10);
  assert.ok(
    g.zones
      .filter((z) => z.kind === 'boss-roots')
      .every((z) => z.life === R.heartLife - R.heartGrow),
  );
  for (const heart of hearts) heart.bossSummon!.age = 9.9;
  const guarded = strike(g, e);
  assert.ok(Game.restore(g.save, g.snapshot()), '九点九秒木心快照可恢复');
  for (const heart of hearts) heart.bossSummon!.age = 10.01;
  g.update(0.001);
  const open = strike(g, e);
  assert.ok(Math.abs(guarded - open * (1 - R.heartGuard)) < 1e-9);
  g.update(0.001);
  assert.equal(actors(g).length, 0);
});

function strike(g: Game, target: any, amount = 100) {
  target.hp = target.maxHp;
  g.update(0.001);
  const before = target.hp;
  g.hitEnemy(target, amount, false, 'sword');
  return before - target.hp;
}

test('木心长成后为施法者减伤三成，全碎或到时后恢复', () => {
  const { g, e } = cast(0);
  const hearts = actors(g);
  const open = strike(g, e);
  for (const heart of hearts) heart.bossSummon!.age = R.heartGrow;
  const guarded = strike(g, e);
  assert.ok(Math.abs(guarded - open * (1 - R.heartGuard)) < 1e-9);
  hearts[1].dead = hearts[2].dead = true;
  assert.ok(Math.abs(strike(g, e) - guarded) < 1e-9, '三颗与一颗长成木心减伤相同');
  g.hitEnemy(hearts[0], hearts[0].hp, false, 'sword');
  assert.ok(Math.abs(strike(g, e) - open) < 1e-9, '击碎全部木心后恢复');
  assert.ok(g.effects.some((v) => v.kind === 'text' && v.text === '木心碎'));

  const expired = cast(0);
  const expiring = actors(expired.g);
  for (const heart of expiring) heart.bossSummon!.age = R.heartLife + 1;
  expired.g.update(0.001);
  assert.ok(!expired.g.effects.some((v) => v.kind === 'text' && v.text === '木心碎'));
  assert.ok(Math.abs(strike(expired.g, expired.e) - open) < 1e-9, '到时消失后恢复');
});

test('木心减伤只作用于施法者本体，小怪、木心与其他妖王不受影响', () => {
  const guarded = cast(0),
    hearts = actors(guarded.g);
  for (const heart of hearts) heart.bossSummon!.age = R.heartGrow;
  const other = guarded.g.spawnEnemy(10, false, true, { x: 200, y: 0 });
  Object.assign(other, { speed: 0, cooldown: 99999 });
  const guardedBoss = strike(guarded.g, guarded.e);
  const guardedOther = strike(guarded.g, other);
  const guardedHeart = strike(guarded.g, hearts[0], 10);

  const control = cast(0);
  const controlOther = control.g.spawnEnemy(10, false, true, { x: 200, y: 0 });
  Object.assign(controlOther, { speed: 0, cooldown: 99999 });
  const controlBoss = strike(control.g, control.e);
  const controlOtherDamage = strike(control.g, controlOther);
  const controlHeart = strike(control.g, actors(control.g)[0], 10);
  assert.ok(Math.abs(guardedBoss - controlBoss * 0.7) < 1e-9);
  assert.equal(guardedOther, controlOtherDamage);
  assert.equal(guardedHeart, controlHeart);
});

test('仙尊万劫归一借落种成林时同样获得木心减伤', () => {
  const { g, e } = encounter(6, FINAL_TRIAL_STAGE);
  g.random = () => 0;
  e.skillStep = 8;
  e.hp = e.maxHp;
  g.castBossSkill(e, 1, 0);
  assert.equal(e.bossStage, FINAL_TRIAL_STAGE);
  const hearts = actors(g);
  assert.equal(hearts.length, 3);
  assert.ok(hearts.every((heart) => heart.bossSummon!.color === SOVEREIGN_GOLD));
  const open = strike(g, e);
  for (const heart of hearts) heart.bossSummon!.age = R.heartGrow;
  const guarded = strike(g, e);
  assert.ok(Math.abs(guarded - open * (1 - R.heartGuard)) < 1e-9);
});

test('木心护王状态不入快照，读档首帧按长成木心重算', () => {
  const { g, e } = cast(0);
  for (const heart of actors(g)) heart.bossSummon!.age = R.heartGrow;
  const raw = g.snapshot();
  assert.ok(!JSON.stringify(raw).includes('guardedBosses'));
  const guarded = strike(g, e);
  const restored = Game.restore(g.save, raw)!;
  restored.weapons[0].timer = 99999;
  restored.resume();
  const boss = restored.enemies.find((v) => v.boss)!;
  assert.equal(strike(restored, boss), guarded);
});

test('长成木心画实线藤脉，受护妖王有护体光且不留画布状态', () => {
  const calls: any[] = [],
    state: Record<string, unknown> = {};
  let depth = 0,
    dashes = 0;
  const c = new Proxy({} as CanvasRenderingContext2D, {
    get:
      (_: unknown, method: string) =>
      (...args: unknown[]) => {
        if (method === 'save') depth++;
        if (method === 'restore') depth--;
        if (method === 'setLineDash') dashes++;
        calls.push({ method, args, ...state });
      },
    set: (_, key: string, value) => {
      state[key] = value;
      return true;
    },
  });
  const { g, e } = cast(0);
  const heart = actors(g)[0];
  heart.bossSummon!.age = R.heartGrow;
  drawHeartLink(c, heart, e);
  drawBossGuard(c, e);
  assert.equal(dashes, 0);
  assert.equal(depth, 0);
  assert.ok(calls.some((v) => v.method === 'moveTo' && v.args[0] === heart.x));
  assert.ok(calls.some((v) => v.method === 'lineTo' && v.args[0] === e.x));
  assert.ok(
    calls.some(
      (v) =>
        v.method === 'stroke' &&
        v.lineWidth === 3 &&
        v.globalAlpha === 0.55 &&
        v.strokeStyle === STAGES[0].color,
    ),
  );
  const underlay = calls.findIndex(
    (v) => v.method === 'stroke' && v.lineWidth === 5 && v.strokeStyle === '#173e2c',
  );
  const vine = calls.findIndex(
    (v) => v.method === 'stroke' && v.lineWidth === 3 && v.strokeStyle === STAGES[0].color,
  );
  assert.ok(underlay >= 0 && vine > underlay, '先画深色底衬再画主藤线');
  assert.ok(
    calls.some(
      (v) => v.method === 'fill' && v.globalAlpha === 0.18 && v.fillStyle === STAGES[0].color,
    ),
  );
  assert.ok(calls.some((v) => v.method === 'arc' && v.args[2] === e.radius + 10));
  assert.ok(calls.some((v) => v.method === 'stroke' && v.globalAlpha === 0.5 && v.lineWidth === 2));

  heart.bossSummon!.age = R.heartGrow - 0.001;
  assert.equal(heartGuardReady(heart), false);
  heart.bossSummon!.age = R.heartGrow;
  assert.equal(heartGuardReady(heart), true);
  assert.equal(bossGuardedByHearts(g.enemies, e.id), true);
  heart.bossSummon!.color = SOVEREIGN_GOLD;
  e.bossStage = FINAL_TRIAL_STAGE;
  calls.length = 0;
  drawHeartLink(c, heart, e);
  drawBossGuard(c, e);
  assert.ok(calls.some((v) => v.method === 'stroke' && v.strokeStyle === SOVEREIGN_GOLD));
  assert.ok(calls.some((v) => v.method === 'fill' && v.fillStyle === SOVEREIGN_GOLD));
});

test('冥主幽影追踪带普通鬼卒瞬移，幻影与其他妖物不动', () => {
  for (const arena of [4, 6]) {
    const { g, e } = encounter(4, arena);
    e.skillStep = 0;
    g.castBossSkill(e, 1, 0);
    const guards = g.enemies.filter(
      (c) => !c.dead && c.summonedBy === e.id && !c.bossSummon && c.illusionOf === undefined,
    );
    assert.ok(guards.length > 0);
    const illusion = g.spawnEnemy(50, false, false, { x: 40, y: 40 });
    illusion.illusionOf = e.id;
    const other = g.spawnEnemy(50, false, false, { x: -40, y: 40 });
    const beforeIllusion = { x: illusion.x, y: illusion.y };
    const beforeOther = { x: other.x, y: other.y };
    g.castBossPursuit(e, 1, 0);
    assert.equal(e.x, g.player.x - 260);
    assert.equal(e.y, g.player.y);
    guards.forEach((guard, i) => {
      const a = (i / guards.length) * TAU;
      assert.ok(Math.abs(guard.x - (e.x + Math.cos(a) * 90)) < 1);
      assert.ok(Math.abs(guard.y - (e.y + Math.sin(a) * 90)) < 1);
    });
    assert.deepEqual({ x: illusion.x, y: illusion.y }, beforeIllusion);
    assert.deepEqual({ x: other.x, y: other.y }, beforeOther);
  }
});

test('幽影换形侧移不带鬼卒，鬼卒位置保持', () => {
  const { g, e } = encounter(4);
  e.skillStep = 0;
  g.castBossSkill(e, 1, 0);
  const guards = g.enemies.filter(
    (c) => !c.dead && c.summonedBy === e.id && !c.bossSummon && c.illusionOf === undefined,
  );
  const before = guards.map((guard) => ({ x: guard.x, y: guard.y }));
  e.skillStep = 4;
  g.castBossSkill(e, 1, 0);
  assert.deepEqual(
    guards.map((guard) => ({ x: guard.x, y: guard.y })),
    before,
  );
});

test('召唤连线按距离淡出：150像素全亮、250像素半透明、300像素不画', () => {
  assert.equal(summonLinkAlpha({ x: 0, y: 0 }, { x: 150, y: 0 }), 1);
  assert.equal(summonLinkAlpha({ x: 0, y: 0 }, { x: 200, y: 0 }), 1);
  assert.equal(summonLinkAlpha({ x: 0, y: 0 }, { x: 250, y: 0 }), 0.5);
  assert.equal(summonLinkAlpha({ x: 0, y: 0 }, { x: 300, y: 0 }), 0);
  assert.equal(summonLinkAlpha({ x: 0, y: 0 }, { x: 400, y: 0 }), 0);
});

test('两猎狼从相反侧翼绕行、完整蓄势锁向，扑后再包抄、六秒消散不结算', () => {
  const { g } = cast(2);
  const wolves = actors(g);
  assert.equal(wolves.length, 2);
  assert.ok(wolves[0].y * wolves[1].y < 0);
  advance(g, 1.21);
  assert.ok(wolves.every((e) => e.charge > R.wolfDash));
  const before = wolves.map((e) => ({ x: e.x, y: e.y }));
  Object.assign(g.player, { x: 900, y: 900 });
  advance(g, 0.2);
  for (let i = 0; i < 2; i++) {
    assert.ok(Math.abs(wolves[i].x - before[i].x) < 1e-9);
    assert.ok(Math.abs(wolves[i].y - before[i].y) < 1e-9);
    const d = Math.hypot(900 - wolves[i].x, 900 - wolves[i].y);
    assert.ok(Math.abs(wolves[i].dx - (900 - wolves[i].x) / d) < 1e-9);
    assert.ok(Math.abs(wolves[i].dy - (900 - wolves[i].y) / d) < 1e-9);
  }
  advance(g, 0.3);
  const locked = wolves.map((e) => ({ dx: e.dx, dy: e.dy }));
  Object.assign(g.player, { x: -900, y: -900 });
  advance(g, 0.2);
  for (let i = 0; i < 2; i++) {
    assert.equal(wolves[i].dx, locked[i].dx);
    assert.equal(wolves[i].dy, locked[i].dy);
  }
  advance(g, 0.9);
  assert.equal(actors(g).length, 2);
  advance(g, 3.3);
  assert.equal(actors(g).length, 0);
  assert.equal(g.kills, 0);
  assert.equal(g.pickups.length, 0);
});

test('回焰预热无伤，去程与返程沿同一轨迹，转向短停，真实命中后只扣一次血', () => {
  const { g } = cast(1);
  const b = g.shots[4];
  g.shots = [b];
  Object.assign(g.player, { x: b.origin.x, y: b.origin.y });
  const hp = g.player.hp;
  g.updateShots(0.7);
  assert.equal(g.player.hp, hp);
  g.updateShots(0.11);
  assert.ok(g.player.hp < hp);
  assert.equal(g.shots.length, 0);
  const { g: h } = cast(1);
  Object.assign(h.player, { x: 900, y: 900 });
  const shot = h.shots[4];
  const out = bossShotPose(shot, R.returnWarmup + 0.5),
    back = bossShotPose(shot, R.returnWarmup + 2 * bossReturnOut(shot) + R.returnRest - 0.5);
  assert.ok(Math.abs(out.x - back.x) < 1e-9 && Math.abs(out.y - back.y) < 1e-9);
  assert.ok(out.vx > 0 && back.vx < 0);
  const wait = bossShotPose(shot, R.returnWarmup + bossReturnOut(shot) + 0.2);
  assert.equal(wait.vx, 0);
  assert.equal(wait.vy, 0);
  h.updateShots(R.returnWarmup + bossReturnOut(shot) + 0.2);
  const at = { x: shot.x, y: shot.y };
  h.updateShots(0.1);
  assert.deepEqual({ x: shot.x, y: shot.y }, at);
});

test('回焰与星珠跨转折点按同一轨迹推进，长短帧和读档不造成瞬移', () => {
  for (const origin of [1, 5]) {
    const { g } = cast(origin);
    Object.assign(g.player, { x: 900, y: 900 });
    const h = Game.restore(g.save, g.snapshot())!;
    assert.ok(h);
    const span =
      origin === 1 ? R.returnWarmup + bossReturnOut(g.shots[0]) + R.returnRest + 0.2 : 2.3;
    g.updateShots(span);
    for (let t = 0; t < span - 1e-9; t += 0.01) h.updateShots(Math.min(0.01, span - t));
    for (let i = 0; i < g.shots.length; i++) {
      assert.ok(Math.abs(g.shots[i].x - h.shots[i].x) < 1e-7);
      assert.ok(Math.abs(g.shots[i].y - h.shots[i].y) < 1e-7);
    }
  }
});

test('逆行魂影从足迹浮现，蓄力后锁定扑出时玩家位置并不再追踪', () => {
  const { g, e } = encounter(4);
  g.time = 10;
  g.playerTrail = Array.from({ length: 21 }, (_, i) => ({ x: i * 10, y: 0, time: i * 0.15 }));
  Object.assign(g.player, { x: 300, y: 0 });
  g.castBossSkill(e, 1, 0);
  const b = g.shots[0];
  if (b.bossMotion?.kind !== 'memory') throw Error('missing memory');
  assert.deepEqual(b.bossMotion.path, [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ]);
  assert.ok(Math.abs(b.bossMotion.warmup - 0.8) < 1e-9);
  g.updateShots(0.5);
  assert.deepEqual({ x: b.x, y: b.y }, { x: 0, y: 0 });
  Object.assign(g.player, { x: 300, y: 0 });
  g.updateShots(0.31);
  assert.equal(b.bossMotion.locked, true);
  assert.deepEqual(b.bossMotion.path[1], { x: 300, y: 0 });
  const locked = structuredClone(b.bossMotion.path);
  Object.assign(g.player, { x: 900, y: 900 });
  g.updateShots(0.2);
  assert.deepEqual(b.bossMotion.path, locked);
  const pose = bossShotPose(b, b.age);
  assert.ok(Math.abs(Math.hypot(pose.vx, pose.vy) - R.memorySpeed) < 1e-6);
});

test('星珠绕固定星位旋转，五颗按1.3/1.65/2/2.35/2.7秒错拍释放，蓄势时不造成碰撞伤害', () => {
  const { g } = cast(5);
  const b = g.shots[0];
  const m = b.bossMotion!;
  if (m.kind !== 'star') throw Error('star');
  assert.deepEqual(
    g.shots.map((b) => b.bossMotion!.kind === 'star' && Number(b.bossMotion!.launchAt.toFixed(2))),
    [1.3, 1.65, 2, 2.35, 2.7],
  );
  const p = bossShotPose(b, 0.7);
  assert.ok(Math.abs(Math.hypot(p.x - m.center.x, p.y - m.center.y) - R.orbitRadius) < 1e-8);
  Object.assign(g.player, { x: p.x, y: p.y });
  const hp = g.player.hp;
  g.updateShots(0.7);
  assert.equal(g.player.hp, hp);
  const before = bossShotPose(b, m.launchAt - 1e-7),
    after = bossShotPose(b, m.launchAt + 1e-7);
  assert.ok(Math.hypot(before.x - after.x, before.y - after.y) < 0.001);
});

test('第四境六秒漂移毒瘴：预警时不漂移、不伤人；激活后按95速度移动，仍不是条带', () => {
  const { g } = cast(3);
  const z = g.zones[1],
    x = z.x,
    y = z.y;
  const hp = g.player.hp;
  g.updateZones(0.6);
  assert.equal(z.x, x);
  assert.equal(z.y, y);
  assert.equal(g.player.hp, hp);
  z.delay = 0;
  g.updateZones(0.2);
  assert.equal(z.x, x);
  assert.ok(Math.abs(z.y - y - 95 * 0.2) < 1e-8);
  assert.equal(z.life, 5.8);
  assert.equal(z.settle, true);
  assert.equal(z.endX, undefined);
});

test('新机制暂停与导入导出往返完整，外部修改快照不污染活场状态', () => {
  for (let origin = 0; origin < 6; origin++) {
    const { g } = cast(origin, 6);
    g.pause();
    const raw = JSON.parse(JSON.stringify(g.snapshot()));
    for (const h of [Game.restore(g.save, raw), importSave(exportSave(g.save, g)).run]) {
      assert.ok(h, `${origin}`);
      const before = h.snapshot();
      h.update(1);
      assert.deepEqual(h.snapshot(), before);
      assert.deepEqual(JSON.parse(JSON.stringify(h.snapshot())), raw);
    }
    const copy = g.snapshot();
    if (copy.shots[0]?.bossMotion?.kind === 'memory') {
      copy.shots[0].bossMotion.path[0].x = 999;
      assert.notEqual(
        g.shots[0].bossMotion!.kind === 'memory' && g.shots[0].bossMotion!.path[0].x,
        999,
      );
    }
  }
});

test('新快照结构拒绝损坏轨迹与召唤状态，旧存档仍保留永久进度', () => {
  for (const origin of [1, 4, 5]) {
    const { g } = cast(origin);
    const raw = g.snapshot();
    raw.shots[0].bossMotion = { kind: 'memory', path: [{ x: 0, y: NaN }], warmup: 1 };
    assert.equal(Game.restore(g.save, raw), null);
  }
  const { g } = cast(0);
  const raw = g.snapshot();
  raw.enemies[1].bossSummon!.age = Infinity;
  assert.equal(Game.restore(g.save, raw), null);
  const s = freshSave();
  s.schema = SAVE_SCHEMA - 1;
  s.stones = 1234;
  s.cultivation = 5678;
  s.activeRun = g.snapshot();
  const read = readSave(JSON.stringify(s));
  assert.equal(read.status, 'ok');
  assert.equal(read.save.stones, 1234);
  assert.equal(read.save.cultivation, 5678);
});

test('自动走位对回焰、魂影、星珠的判断使用可见轨迹而非未公布招式队列', () => {
  for (const origin of [1, 4, 5]) {
    const { g, e } = cast(origin);
    const a = autoplayInput(g);
    e.skillStep = 0;
    e.bossSkillQueue = [3, 2, 1];
    assert.deepEqual(autoplayInput(g), a);
    assert.ok(Number.isFinite(a.x) && Number.isFinite(a.y));
  }
});

test('自动走位遇上折返、逆行和错拍的实际碰撞路线会放弃直取灵气', () => {
  for (const origin of [1, 4, 5]) {
    const { g } = cast(origin);
    g.enemies = [];
    g.pickups = [{ x: 200, y: 0, kind: 'xp', value: 1, pull: false }];
    const shot = g.shots[origin === 1 ? 2 : 0];
    g.shots = [shot];
    if (shot.bossMotion?.kind === 'memory') {
      // 新魂影在扑出瞬间才锁定路径；这里手工给出已锁定的真实路线。
      shot.bossMotion.path = [
        { x: shot.x, y: shot.y },
        { x: 200, y: 0 },
        { x: 200, y: -160 },
      ];
      shot.bossMotion.locked = true;
      shot.bossMotion.warmup = R.memoryWarmup;
    }
    shot.age =
      origin === 1
        ? R.returnWarmup + bossReturnOut(shot) + R.returnRest + 0.1
        : origin === 4
          ? 1.5
          : 1.3;
    // 将真实攻击轨迹置于拾取直路，保持各招自己的转向、延迟和速度。
    const future = bossShotPose(shot, shot.age + 0.36);
    const dx = g.stats.speed * 0.36 - future.x,
      dy = -future.y;
    shot.origin.x += dx;
    shot.origin.y += dy;
    const m = shot.bossMotion!;
    if (m.kind === 'star') {
      m.center.x += dx;
      m.center.y += dy;
    }
    if (m.kind === 'memory')
      for (const p of m.path) {
        p.x += dx;
        p.y += dy;
      }
    const { x, y, vx, vy } = bossShotPose(shot);
    Object.assign(shot, { x, y, vx, vy });
    const risk = (input: { x: number; y: number }) =>
      [0.12, 0.24, 0.36, 0.6].reduce((sum, t) => {
        const p = bossShotPose(shot, shot.age + t);
        return (
          sum +
          (p.active
            ? Math.max(
                0,
                1 -
                  Math.hypot(input.x * g.stats.speed * t - p.x, input.y * g.stats.speed * t - p.y) /
                    (shot.radius + 12 + g.stats.speed * 0.12),
              )
            : 0)
        );
      }, 0);
    const input = autoplayInput(g);
    assert.ok(risk(input) < risk({ x: 1, y: 0 }), `妖王${origin}会选择更少暴露的路线`);
  }
});

test('新机制绘制保持画布状态、有限坐标和独立形态，减少动态也不改变判定', () => {
  let depth = 0;
  const c = new Proxy({} as CanvasRenderingContext2D, {
    get:
      (_, method: string) =>
      (...args: unknown[]) => {
        for (const arg of args) if (typeof arg === 'number') assert.ok(Number.isFinite(arg));
        if (method === 'save') depth++;
        if (method === 'restore') depth--;
        assert.ok(depth >= 0);
      },
  });
  for (const origin of [0, 2])
    for (const e of actors(cast(origin).g)) {
      drawBossSummon(c, e);
      assert.equal(depth, 0);
    }
  for (const origin of [1, 4, 5])
    for (const b of cast(origin).g.shots)
      for (const age of [0, 0.6, 1.5, 2.4]) {
        b.age = age;
        drawBossMotionCue(c, b);
        assert.equal(depth, 0);
      }
});
