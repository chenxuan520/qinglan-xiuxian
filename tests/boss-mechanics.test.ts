import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { freshSave, readSave, SAVE_SCHEMA } from '../src/progress.ts';
import { bossSkills } from '../src/boss-skills.ts';
import { STAGES } from '../src/data.ts';
import { BOSS_MECHANICS as R, bossShotPose } from '../src/boss-mechanics.ts';
import { drawBossSummon, drawBossMotionCue } from '../src/boss-mechanics-render.ts';
import { autoplayInput } from '../src/autoplay.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';

function encounter(origin: number, arena = origin) {
  const s = freshSave('heaven', ['metal'], 'dual', () => 0.5);
  s.unlocked = 6;
  s.completed = [0, 1, 2, 3, 4, 5];
  s.cultivation = 119940;
  const g = new Game(s, arena, 0, () => 0.5);
  g.weapons[0].timer = 99999;
  g.spawnBudget = -10000;
  g.nextElite = g.nextTrialBossAt = 99999;
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
        4 + Number([2, 4].includes(origin)) + Number(arena === 6 && [3, 4].includes(origin)),
      );
      assert.deepEqual(bossSkills(6, true), STAGES[6].skills);
      const { g, e } = cast(origin, arena);
      assert.ok(g.notice.includes(bossSkills(origin, true)[3]));
      if (origin === 0) {
        assert.equal(actors(g).length, 3);
        assert.equal(g.zones.length, 3);
        assert.ok(g.zones.every((z) => z.delay === R.heartGrow));
      }
      if (origin === 1) {
        assert.equal(g.shots.length, 5);
        assert.ok(g.shots.every((b) => b.bossMotion?.kind === 'return'));
      }
      if (origin === 2) {
        assert.equal(actors(g).length, 2);
        assert.ok(actors(g).every((e) => e.bossSummon?.kind === 'wolf'));
      }
      if (origin === 3) {
        assert.equal(g.zones.length, 3);
        assert.ok(g.zones.every((z) => z.life === 6 && Math.hypot(z.vx!, z.vy!) === 24));
      }
      if (origin === 4) {
        assert.equal(g.shots.length, 3);
        assert.ok(g.shots.every((b) => b.bossMotion?.kind === 'memory'));
      }
      if (origin === 5) {
        assert.equal(g.shots.length, 3);
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

test('木心全程可打碎，扎根前不伤人，击碎即散阵，无击杀/经验/材料/回血收益', () => {
  const { g } = cast(0);
  const [heart] = actors(g);
  const zone = g.zones.find((z) => z.sourceId === heart.id)!;
  Object.assign(g.player, { x: heart.x, y: heart.y });
  const hp = g.player.hp;
  g.updateZones(2);
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

test('木心每王最多三枚，不叠加刷屏，主人倒下或八秒到期后消散', () => {
  const { g, e } = cast(0, 6);
  for (let i = 0; i < 4; i++) {
    e.skillStep = 3;
    g.castBossSkill(e, 1, 0);
  }
  assert.equal(actors(g).length, 3);
  assert.equal(g.zones.length, 3);
  for (const heart of actors(g)) g.updateBossSummon(heart, 8.01);
  g.updateZones(0.01);
  assert.equal(actors(g).length, 0);
  assert.equal(g.zones.length, 0);
  e.skillStep = 3;
  g.castBossSkill(e, 1, 0);
  g.hitEnemy(e, e.hp);
  assert.ok(g.enemies.filter((c) => c.bossSummon).every((c) => c.dead));
});

test('两猎狼从相反侧翼绕行，完整蓄势后各扑一次，锁向后不追踪、无额外奖励', () => {
  const { g } = cast(2);
  const wolves = actors(g);
  assert.equal(wolves.length, 2);
  assert.ok(wolves[0].y * wolves[1].y < 0);
  advance(g, 1.21);
  assert.ok(wolves.every((e) => e.charge > 0.55));
  const before = wolves.map((e) => ({ x: e.x, y: e.y, dx: e.dx, dy: e.dy }));
  Object.assign(g.player, { x: 900, y: 900 });
  advance(g, 0.5);
  for (let i = 0; i < 2; i++) {
    assert.equal(wolves[i].x, before[i].x);
    assert.equal(wolves[i].y, before[i].y);
    assert.equal(wolves[i].dx, before[i].dx);
    assert.equal(wolves[i].dy, before[i].dy);
  }
  advance(g, 1.1);
  assert.equal(actors(g).length, 0);
  assert.equal(g.kills, 0);
  assert.equal(g.pickups.length, 0);
});

test('回焰预热无伤，去程与返程沿同一轨迹，转向短停，真实命中后只扣一次血', () => {
  const { g } = cast(1);
  const b = g.shots[2];
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
  const shot = h.shots[2];
  const out = bossShotPose(shot, R.returnWarmup + 0.5),
    back = bossShotPose(shot, R.returnWarmup + 2 * R.returnOut + R.returnRest - 0.5);
  assert.ok(Math.abs(out.x - back.x) < 1e-9 && Math.abs(out.y - back.y) < 1e-9);
  assert.ok(out.vx > 0 && back.vx < 0);
  const wait = bossShotPose(shot, R.returnWarmup + R.returnOut + 0.2);
  assert.equal(wait.vx, 0);
  assert.equal(wait.vy, 0);
  h.updateShots(R.returnWarmup + R.returnOut + 0.2);
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
    g.updateShots(2.3);
    for (let i = 0; i < 230; i++) h.updateShots(0.01);
    for (let i = 0; i < g.shots.length; i++) {
      assert.ok(Math.abs(g.shots[i].x - h.shots[i].x) < 1e-7);
      assert.ok(Math.abs(g.shots[i].y - h.shots[i].y) < 1e-7);
    }
  }
});

test('逆行魂影只走施法前记录的路线，拐弯和停驻都不读取玩家未来位置', () => {
  const { g, e } = encounter(4);
  g.input = { x: 1, y: 0 };
  advance(g, 1.8);
  g.input = { x: 0, y: 1 };
  advance(g, 1.8);
  const trace = structuredClone(g.playerTrail);
  assert.equal(trace.length, R.trailLimit);
  e.skillStep = 3;
  g.castBossSkill(e, 1, 0);
  const b = g.shots[0];
  assert.equal(b.bossMotion?.kind, 'memory');
  if (b.bossMotion?.kind !== 'memory') throw Error('missing memory');
  assert.deepEqual(
    b.bossMotion.path.slice(2),
    trace
      .slice()
      .reverse()
      .map(({ x, y }) => ({ x, y })),
  );
  const path = structuredClone(b.bossMotion.path);
  Object.assign(g.player, { x: 10000, y: -10000 });
  g.updateShots(0.5);
  assert.deepEqual(b.bossMotion.path, path);
  assert.equal(b.x, e.x);
  assert.equal(b.y, e.y);
  const p1 = path[1],
    d = Math.hypot(p1.x - path[0].x, p1.y - path[0].y);
  const pose = bossShotPose(b, b.bossMotion.warmup + d / R.memorySpeed);
  assert.ok(Math.hypot(pose.x - p1.x, pose.y - p1.y) < 1e-7);
});

test('星珠绕固定星位旋转，三颗按1.3/1.75/2.2秒错拍释放，蓄势时不造成碰撞伤害', () => {
  const { g } = cast(5);
  const b = g.shots[0];
  const m = b.bossMotion!;
  if (m.kind !== 'star') throw Error('star');
  assert.deepEqual(
    g.shots.map((b) => b.bossMotion!.kind === 'star' && b.bossMotion!.launchAt),
    [1.3, 1.75, 2.2],
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

test('保留六秒漂移毒瘴：预警时不漂移、不伤人；激活后缓慢移动，仍不是条带', () => {
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
  assert.ok(z.x !== x || z.y !== y);
  assert.equal(z.life, 5.8);
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
    shot.age = origin === 1 ? 2.5 : origin === 4 ? 1.5 : 1.3;
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
