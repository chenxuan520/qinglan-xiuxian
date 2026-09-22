import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { Game } from '../src/game.ts';
import { ENEMIES, ENEMY_TACTICS, STAGE_ENEMIES } from '../src/data.ts';
import { autoplayInput } from '../src/autoplay.ts';
import { freshSave } from '../src/progress.ts';

function encounter(stage: number, type: number, elite = false, distance = 200) {
  const save = freshSave();
  save.unlocked = 6;
  save.cultivation = 1e9;
  const g = new Game(save, stage, 0, () => 0.5);
  g.weapons[0].timer = 9999;
  g.spawnBudget = -10000;
  g.nextElite = 9999;
  g.bossSpawned = true;
  const e = g.spawnEnemy(type, elite, false, { x: -distance, y: 0 });
  e.cooldown = 0;
  return { g, e };
}
function advance(g: Game, seconds: number) {
  for (let i = 0; i < Math.round(seconds * 100); i++) g.update(0.01);
}

test('远程蓄力只画自身圆环，实弹、冲刺与落地预警仍绘制', async () => {
  const renderUrl = new URL('../src/render.ts', import.meta.url);
  // Renderer 的构造参数属性需要转换，测试加载时处理，不改生产代码。
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
    const calls: { method: string; args: unknown[] }[] = [];
    const ctx = new Proxy({} as CanvasRenderingContext2D, {
      get:
        (_, method: string) =>
        (...args: unknown[]) =>
          calls.push({ method, args }),
    });
    // 只跳过无关图集与装饰，直接执行原 drawGame 和弹丸绘制。
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

  for (let stage = 0; stage < 6; stage++)
    for (const type of STAGE_ENEMIES[stage])
      for (const elite of [false, true]) {
        const tactics = ENEMY_TACTICS[type];
        if (
          !['ranged', 'volley', 'nova', 'soul'].includes(
            (elite ? tactics.eliteSkill : tactics.skill)!,
          )
        )
          continue;
        const { g, e } = encounter(stage, type, elite);
        g.update(0.01);
        assert.equal(e.windup, 0.65);
        const calls = draw(g);
        assert.ok(
          calls.some((c) => c.method === 'arc' && c.args[0] === e.x && c.args[2] === e.radius + 8),
        );
        assert.deepEqual(
          calls.filter((c) => c.method === 'lineTo'),
          [],
        );
        advance(g, 0.5);
        assert.equal(g.shots.length, 0);
        advance(g, 0.2);
        assert.ok(g.shots.length > 0);
        assert.ok(draw(g).some((c) => c.method === 'arc' && c.args[2] === 5));
      }

  for (const elite of [false, true]) {
    const dasher = ENEMY_TACTICS.findIndex((t) => (elite ? t.eliteSkill : t.skill) === 'dash');
    const dash = encounter(0, dasher, elite);
    dash.g.update(0.01);
    assert.ok(dash.e.charge > 0.55);
    assert.ok(draw(dash.g).some((c) => c.method === 'strokeRect' && c.args[2] === 209));
    const tank = STAGE_ENEMIES[0].find((type) => ENEMIES[type].behavior === 'tank')!;
    const stomp = encounter(0, tank, elite, 100);
    stomp.g.update(0.01);
    assert.ok(stomp.g.zones[0].delay > 0);
    assert.ok(draw(stomp.g).some((c) => c.method === 'arc' && c.args[2] === 92));
  }

  const { g } = encounter(1, 0);
  g.enemies = [];
  const boss = g.spawnEnemy(10, false, true, { x: -500, y: 0 });
  boss.pursuitCooldown = 0;
  g.update(0.01);
  const warning = g.effects.find((e) => e.kind === 'line')!;
  assert.ok(warning);
  assert.ok(
    draw(g).some(
      (c) => c.method === 'lineTo' && c.args[0] === warning.x2 && c.args[1] === warning.y2,
    ),
  );
  boss.charge = 0;
  boss.pursuitCooldown = 999;
  boss.cooldown = 0;
  boss.skillStep = 1;
  g.update(0.01);
  assert.ok(g.zones.some((z) => z.delay > 0));
  assert.ok(draw(g).some((c) => c.method === 'arc' && c.args[2] === 50));
});

test('前六境精英保留弹道、冲刺、震地与召唤，爆炸怪仍近身自爆', () => {
  let count = 0;
  for (let stage = 0; stage < 6; stage++)
    for (const type of STAGE_ENEMIES[stage]) {
      const { g, e } = encounter(stage, type, true, 140);
      const skill = ENEMY_TACTICS[type].eliteSkill;
      g.update(0.01);
      if (!skill) {
        assert.equal(ENEMIES[type].behavior, 'explode');
        assert.equal(e.charge, 0);
      } else if (skill === 'dash') assert.ok(e.charge > 0.55);
      else if (['ranged', 'volley', 'nova', 'soul'].includes(skill)) {
        assert.equal(g.shots.length, 0);
        advance(g, 0.7);
        assert.ok(g.shots.length > 0);
      } else if (skill === 'summon') {
        assert.equal(g.enemies.filter((v) => v.summonedBy === e.id).length, 3);
      } else assert.ok(g.zones.some((z) => z.kind === `enemy-${skill}` && z.delay > 0));
      count++;
    }
  assert.equal(count, 72);
});

test('前六境地域法师恢复蓄势直线灵弹，不再在玩家脚下生成地域法阵', () => {
  for (const [stage, type] of [5, 33, 45, 53, 61, 69].entries()) {
    for (const elite of [false, true]) {
      const { g, e } = encounter(stage, type, elite);
      g.update(0.01);
      assert.equal(e.pendingSkill, stage === 4 ? 'soul' : 'ranged');
      assert.ok(e.windup! > 0);
      assert.equal(g.zones.length, 0);
      assert.equal(g.shots.length, 0);
      advance(g, 0.7);
      assert.equal(g.shots.length, stage === 4 ? (elite ? 4 : 2) : 1);
      if (stage === 4) {
        assert.ok(g.shots.some((shot) => shot.vy < 0));
        assert.ok(g.shots.some((shot) => shot.vy > 0));
      }
    }
  }
});

test('第五境无面幽魂与爆魂冥瓮精英保留交叉灵弹', () => {
  for (const [type, elite, expectedSkill, shots] of [
    [58, false, 'ranged', 1],
    [58, true, 'soul', 4],
    [61, false, 'soul', 2],
    [61, true, 'soul', 4],
    [62, false, undefined, 0],
    [62, true, 'soul', 4],
  ] as const) {
    const { g, e } = encounter(4, type, elite);
    g.update(0.01);
    assert.equal(e.pendingSkill, expectedSkill);
    advance(g, 0.7);
    assert.equal(g.shots.length, shots);
  }
});

test('狼群分别包抄两翼，保持原速度；首境菇妖仍直接追击', () => {
  const { g, e } = encounter(0, 1);
  const other = g.spawnEnemy(1, false, false, { x: e.x, y: e.y });
  const mushroom = g.spawnEnemy(0, false, false, { x: e.x, y: e.y });
  g.update(0.05);
  assert.ok(e.y * other.y < 0);
  assert.ok(Math.abs(Math.hypot(e.x + 200, e.y) - e.speed * 0.05) < 1e-8);
  assert.equal(mushroom.y, 0);
  assert.equal(mushroom.charge, 0);
});

test('灵弹蓄势后沿锁定方向发射，施法者死亡可以打断', () => {
  const { g, e } = encounter(0, 2);
  g.update(0.01);
  assert.equal(g.shots.length, 0);
  assert.equal(e.pendingSkill, 'ranged');
  assert.ok(e.windup! > 0);
  g.player.y = 180;
  advance(g, 0.5);
  assert.equal(g.shots.length, 0);
  advance(g, 0.7);
  assert.equal(g.shots.length, 1);
  assert.equal(g.shots[0].vy, 0);
  assert.equal(g.zones.length, 0);
  e.cooldown = 0;
  g.shots = [];
  g.update(0.01);
  assert.equal(e.pendingSkill, 'ranged');
  e.dead = true;
  advance(g, 0.7);
  assert.equal(g.shots.length, 0);
});

test('普通怪和精英不再生成地域法阵，重甲近身震地保留', () => {
  for (const stage of [0, 1, 2, 3, 4, 5]) {
    const caster = [5, 33, 45, 53, 61, 69][stage];
    for (const elite of [false, true]) {
      const { g } = encounter(stage, caster, elite);
      g.update(0.01);
      assert.equal(g.zones.length, 0);
    }
  }
  const tank = STAGE_ENEMIES[0].find((type) => ENEMIES[type].behavior === 'tank')!;
  for (const elite of [false, true]) {
    const { g } = encounter(0, tank, elite, 100);
    g.update(0.01);
    assert.ok(g.zones.some((zone) => zone.kind === 'enemy-stomp'));
  }
});

test('精英冲刺AI侧移避开，续局后仍可辨认锁定路线', () => {
  for (const restored of [false, true]) {
    const { g: original } = encounter(0, 0, true, 180);
    original.update(0.01);
    const g = restored ? Game.restore(original.save, original.snapshot())! : original;
    assert.ok(g);
    g.resume();
    g.pickups.push({ x: -500, y: 0, kind: 'xp', value: 1, pull: false });
    let hits = 0;
    g.onEvent = (name) => {
      if (name === 'hurt') hits++;
    };
    for (let i = 0; i < 160; i++) {
      if (i % 12 === 0) g.input = autoplayInput(g);
      g.update(0.01);
    }
    assert.equal(hits, 0);
  }
});

test('前六境大量精英施法受限：弹幕64、召唤护卫12，法师不生成地域法阵', () => {
  const { g } = encounter(5, 69, true);
  g.enemies = [];
  g.player.invincible = 999;
  for (let i = 0; i < 160; i++) {
    const angle = (i / 160) * Math.PI * 2;
    const type = [69, 25, 26, 71][i % 4];
    const e = g.spawnEnemy(type, true, false, {
      x: Math.cos(angle) * 280,
      y: Math.sin(angle) * 280,
    });
    e.cooldown = 0;
  }
  let maxShots = 0,
    maxZones = 0,
    maxSummons = 0;
  for (let i = 0; i < 2000; i++) {
    g.update(0.01);
    maxShots = Math.max(maxShots, g.shots.length);
    maxZones = Math.max(maxZones, g.zones.length);
    maxSummons = Math.max(maxSummons, g.enemies.filter((e) => e.summonedBy !== undefined).length);
    assert.ok(g.shots.length <= 64);
    assert.ok(g.zones.length <= 12);
    assert.ok(g.enemies.filter((e) => e.summonedBy !== undefined).length <= 12);
  }
  assert.ok(maxShots > 0 && maxZones === 0 && maxSummons > 0);
});

test('旧档补默认迟滞字段，蓄势续局不丢技能，无效技能状态拒绝恢复', () => {
  const { g } = encounter(4, 61, true);
  g.update(0.01);
  const restored = Game.restore(g.save, g.snapshot())!;
  assert.ok(restored);
  restored.resume();
  advance(restored, 0.7);
  assert.equal(restored.shots.length, 4);
  const legacy = g.snapshot();
  delete legacy.slowed;
  delete legacy.nextEnemySkillAt;
  for (const e of legacy.enemies) {
    delete e.windup;
    delete e.pendingSkill;
  }
  assert.equal(Game.restore(g.save, legacy)!.slowed, 0);
  for (const value of [NaN, -1, Infinity, 2]) {
    const bad = g.snapshot();
    bad.slowed = value;
    assert.equal(Game.restore(g.save, bad), null);
  }
  const bad = g.snapshot();
  bad.enemies[0].pendingSkill = 'missing';
  assert.equal(Game.restore(g.save, bad), null);
});

test('终关继续使用原行为：法师立即发弹、追击精英第二批才冲刺，无新区域和减速', () => {
  const { g, e } = encounter(6, 61, true);
  g.update(0.01);
  assert.equal(g.shots.length, 1);
  assert.equal(e.windup, undefined);
  assert.equal(e.pendingSkill, undefined);
  assert.equal(g.slowed, 0);
  assert.equal(g.zones.length, 0);
  const chase = encounter(6, 65, true);
  chase.g.update(0.01);
  assert.equal(chase.e.charge, 0);
  chase.g.time = 46;
  chase.e.cooldown = 0;
  chase.g.update(0.01);
  assert.ok(chase.e.charge > 0);
});
