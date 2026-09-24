import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { Game } from '../src/game.ts';
import { treasure } from '../src/data.ts';
import { freshSave, parseSave } from '../src/progress.ts';
import { joinSect } from '../src/mortal.ts';

const renderUrl = new URL('../src/render.ts', import.meta.url);
// 与敌人预警测试一致，仅转换 Renderer 的构造参数属性。
const hook = registerHooks({
  load(url, context, nextLoad) {
    if (url !== renderUrl.href) return nextLoad(url, context);
    return {
      format: 'module',
      shortCircuit: true,
      source: stripTypeScriptTypes(readFileSync(renderUrl, 'utf8'), { mode: 'transform' }),
    };
  },
});
const { Renderer } = await import('../src/render.ts').finally(() => hook.deregister());

function draw(g: Game) {
  const calls: { method: string; args: number[]; alpha: number }[] = [];
  const alphas: number[] = [];
  const ctx = new Proxy({ globalAlpha: 1 } as CanvasRenderingContext2D, {
    get(target, method: string) {
      if (method === 'globalAlpha') return target.globalAlpha;
      return (...args: number[]) => {
        if (method === 'save') alphas.push(target.globalAlpha);
        else if (method === 'restore') target.globalAlpha = alphas.pop()!;
        else if (method === 'arc' || method === 'lineTo')
          calls.push({ method, args, alpha: target.globalAlpha });
      };
    },
  });
  // 保留真实 drawGame；只跳过图集和法阵叶节点，记录实际几何及透明度。
  const renderer = Object.assign(Object.create(Renderer.prototype), {
    ctx,
    width: 1280,
    height: 800,
    scale: 1,
    sprite() {},
    formation() {},
    cachedFormation() {},
    glowSprite(_key: string, _width: number, _height: number, paint: (c: typeof ctx) => void) {
      paint(ctx);
    },
  });
  renderer.drawGame(g, g.time);
  return calls;
}
const circles = (g: Game) =>
  draw(g)
    .filter((c) => c.method === 'arc')
    .map((c) => ({ radius: c.args[2], visible: c.alpha > 0 }));

function quiet(save = freshSave('heaven', ['wood'], 'dual', () => 0.9)) {
  const g = new Game(save, 0, 0, () => 0.9);
  g.weapons = [];
  g.passives = { area: 5, duration: 2 };
  g.spawnBudget = -10000;
  g.nextElite = 9999;
  g.bossSpawned = true;
  g.player.invincible = 9999;
  return g;
}
function target(g: Game, x: number, y = 0) {
  const e = g.spawnEnemy(0, false, false, { x, y });
  e.hp = e.maxHp = 1e6;
  e.radius = 10;
  e.speed = 0;
  e.cooldown = 9999;
  return e;
}

test('瞬时范围命中与控制不等待扩圈，首帧、中段及结束前均显示全范围', async (t) => {
  for (const id of ['pulse', 'ice'] as const)
    await t.test(id, () => {
      const g = quiet();
      const w = { id, level: 1, evolved: false, timer: 0 };
      g.weapons = [w];
      assert.equal(g.stats.area, 1.6);
      assert.equal(g.stats.damage, 1);
      const radius = (95 + 7) * g.stats.area * 1.5;
      // 边界按既有碰撞规则取 R + 敌人半径，圈外只多 0.01。
      const positions = [radius / 2, radius + 10, radius + 10.01];
      const enemies = positions.map((x) => target(g, x));
      const damage = treasure(id).damage;
      const frames: { cast: number; frame: number; circles: ReturnType<typeof circles> }[] = [];
      for (let cast = 1; cast <= 2; cast++) {
        g.update(0.01);
        assert.deepEqual(
          enemies.map((e) => e.maxHp - e.hp),
          [damage * cast, damage * cast, 0],
        );
        assert.equal(g.damageBySource[id], damage * cast * 2);
        assert.equal(w.timer, treasure(id).cooldown * g.stats.cooldown);
        for (const [i, e] of enemies.entries()) {
          assert.equal(e.x, positions[i] + (id === 'pulse' && i < 2 ? 70 : 0));
          assert.equal(e.y, 0);
          if (id === 'ice' && i < 2)
            assert.ok(Math.abs(e.slow - (2.5 * g.stats.duration - 0.01)) < 1e-8);
          else assert.ok(e.slow <= 0);
        }
        // 不依赖瞬时效果的 kind 命名，检查实际 cast 产物和同次 update 后的绘制。
        const effect = g.effects.find((e) => e.color === treasure(id).color)!;
        assert.ok(effect);
        assert.equal(effect.radius, radius);
        assert.equal(effect.maxLife, 0.75);
        for (let frame = 1; frame <= 74; frame++) {
          if (frame > 1) g.update(0.01);
          assert.equal(g.damageBySource[id], damage * cast * 2);
          if ([1, 38, 74].includes(frame)) frames.push({ cast, frame, circles: circles(g) });
        }
        assert.ok(effect.life > 0 && effect.life < 0.011);
        if (cast === 2) break;
        g.pause();
        const paused = g.snapshot();
        const pausedLife = effect.life;
        for (let i = 0; i < 80; i++) g.update(0.05);
        assert.deepEqual(g.snapshot(), paused);
        assert.equal(effect.life, pausedLife);
        g.resume();
        enemies.forEach((e, i) => (e.x = positions[i]));
        const steps = Math.ceil(w.timer / 0.01);
        for (let i = 1; i < steps; i++) {
          g.update(0.01);
          assert.equal(g.damageBySource[id], damage * 2);
        }
      }
      assert.deepEqual(
        frames,
        frames.map((f) => ({ ...f, circles: [{ radius, visible: true }] })),
        `${id} 已即时命中边界靶，反馈半径不能随 life 才扩到伤害边缘`,
      );
    });

  await t.test('雪魄', () => {
    const save = freshSave();
    save.medicine.active.xuepo = save.age + 10;
    const g = quiet(save);
    const enemies = [90, 180, 180.01].map((x) => target(g, x));
    g.update(0.01);
    assert.deepEqual(
      enemies.map((e) => e.slow),
      [1.99, 1.99, -0.01],
    );
    assert.equal(g.damageDealt, 0);
    const effect = g.effects.find((e) => e.radius === 180)!;
    assert.ok(effect);
    assert.equal(effect.maxLife, 0.6);
    assert.deepEqual(circles(g), [{ radius: 180, visible: true }]);
  });
});

test('伞面、骨刺多边形及镰斩弧线首帧即使用完整效果半径', async (t) => {
  for (const kind of ['umbrella', 'bone', 'cleave'])
    await t.test(kind, () => {
      const g = quiet();
      const e = {
        x: 73,
        y: -41,
        x2: 74,
        y2: -41,
        radius: 173.6,
        life: 0.7,
        maxLife: 0.7,
        color: '#edc77f',
        kind,
      };
      g.effects = [e];
      const calls = draw(g).filter((c) => c.method === (kind === 'cleave' ? 'arc' : 'lineTo'));
      assert.ok(calls.length > 0);
      assert.ok(calls.every((c) => c.alpha > 0));
      const radii = calls.map((c) =>
        kind === 'cleave' ? c.args[2] : Math.hypot(c.args[0] - e.x, c.args[1] - e.y),
      );
      assert.ok(
        radii.every((r) => Math.abs(r - e.radius) < 1e-8),
        `${kind} 首帧半径 ${radii[0]}，应为完整半径 ${e.radius}`,
      );
    });
});

test('火球爆炸当帧显示既有 area 群伤半径，不改变直击和爆炸结算', () => {
  const g = quiet();
  g.weapons = [{ id: 'fire', level: 1, evolved: false, timer: 0 }];
  const direct = target(g, 300);
  g.update(0.01);
  assert.equal(g.shots.length, 1);
  const shot = g.shots[0];
  assert.equal(direct.hp, direct.maxHp);
  // 将静止靶放在真实火球下一帧的位置，仅消除飞行等待，不替换爆炸逻辑。
  const at = { x: shot.x + shot.vx * 0.01, y: shot.y + shot.vy * 0.01 };
  Object.assign(direct, at);
  const radius = 62 * g.stats.area;
  assert.equal(radius, 99.2);
  const edge = target(g, at.x, at.y + radius + 10);
  const outside = target(g, at.x, at.y + radius + 10.01);
  g.update(0.01);
  assert.equal(g.shots.length, 0);
  assert.ok(Math.abs(direct.maxHp - direct.hp - shot.damage * 1.65) < 1e-8);
  assert.ok(Math.abs(edge.maxHp - edge.hp - shot.damage * 0.65) < 1e-8);
  assert.equal(outside.hp, outside.maxHp);
  const effect = g.effects.find((e) => e.color === shot.color)!;
  assert.ok(effect);
  const feedback = { radius: effect.radius, circles: circles(g) };
  const damage = g.damageDealt;
  g.update(0.01);
  assert.equal(g.damageDealt, damage);
  assert.deepEqual(feedback, { radius, circles: [{ radius, visible: true }] });
});

test('受伤装饰 pulse 保留按 life 扩张，不被瞬时范围修复改成全半径', () => {
  const g = quiet();
  g.player.invincible = 0;
  g.hurtPlayer(1);
  const e = g.effects.find((e) => e.kind === 'pulse')!;
  assert.ok(e);
  for (const fraction of [1, 0.5, 0.02]) {
    e.life = e.maxLife * fraction;
    const feedback = circles(g);
    assert.equal(feedback.length, 1);
    assert.ok(feedback[0].visible);
    assert.ok(Math.abs(feedback[0].radius - e.radius * (1 - fraction)) < 1e-8);
  }
});

test('火球爆炸中途突破解锁旧精研时，视觉仍使用本次判定的范围', () => {
  const save = freshSave();
  save.stones = 1000;
  assert.equal(joinSect(save, 'area'), true);
  save.cultivation = 204;
  save.mortal.mastery.area = 1;
  const g = quiet(parseSave(JSON.stringify(save)));
  assert.equal(g.realm, 1);
  g.weapons = [{ id: 'fire', level: 1, evolved: false, timer: 0 }];
  const direct = target(g, 300);
  g.update(0.01);
  const shot = g.shots[0];
  const at = { x: shot.x + shot.vx * 0.01, y: shot.y + shot.vy * 0.01 };
  Object.assign(direct, at);
  const radius = 62 * g.stats.area;
  const victim = target(g, at.x, at.y + 20);
  victim.hp = 1;
  const outside = target(g, at.x, at.y + radius + 10.5);
  g.update(0.01);
  assert.ok(victim.dead);
  assert.equal(g.realm, 2);
  assert.ok(62 * g.stats.area > radius);
  assert.equal(outside.hp, outside.maxHp);
  const effect = g.effects.find((e) => e.color === shot.color)!;
  assert.equal(effect.radius, radius);
  assert.ok(circles(g).some((circle) => circle.radius === radius && circle.visible));
});
