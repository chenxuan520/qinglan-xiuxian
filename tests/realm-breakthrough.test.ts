import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { Game } from '../src/game.ts';
import { freshSave, realmCost } from '../src/progress.ts';
import { REALMS } from '../src/data.ts';
import { realmBreakthroughCue, REALM_BREAKTHROUGH_DURATION } from '../src/realm-breakthrough.ts';

const threshold = (step: number) =>
  Array.from({ length: step }, (_, i) => realmCost(i)).reduce((a, b) => a + b, 0);

function encounter(step: number) {
  const save = freshSave();
  save.cultivation = threshold(step) - 1;
  save.completed = [6];
  const g = new Game(save, 0, 0, () => 0.5);
  g.weapons[0].timer = 9999;
  g.spawnBudget = -10000;
  g.nextElite = 9999;
  g.player.invincible = 9999;
  return g;
}

function earn(g: Game) {
  const enemy = g.spawnEnemy(0, false, false, { x: 300, y: 0 });
  g.hitEnemy(enemy, enemy.maxHp);
}

test('筑基至大乘各触发一次短演出，小阶段和真仙保留原有反馈', () => {
  for (let step = 1; step <= 24; step++) {
    const g = encounter(step);
    assert.equal(realmBreakthroughCue(g), null, '读取已有修为不触发演出');
    const events: string[] = [];
    g.onEvent = (name) => events.push(name);
    earn(g);
    assert.equal(g.realm, step);
    assert.equal(events.filter((name) => name === 'breakthrough').length, 1);
    const major = step % 3 === 0 && step < 24;
    const effect = g.effects.find((e) => e.kind === 'realm-breakthrough');
    if (major) {
      assert.equal(effect!.maxLife, REALM_BREAKTHROUGH_DURATION);
      assert.equal(effect!.realmIndex, step / 3);
      assert.equal(realmBreakthroughCue(g)!.name, REALMS[step / 3]);
      assert.equal(realmBreakthroughCue(g)!.progress, 0);
      assert.equal(g.state, 'playing', '演出不暂停战斗');
    } else {
      assert.ok(
        g.effects.some((e) => e.kind === 'pulse'),
        '保留小阶段和真仙的既有 pulse',
      );
      assert.equal(effect, undefined);
      assert.equal(realmBreakthroughCue(g), null);
    }
    const next = new Game(g.save, 0, 0, () => 0.5);
    assert.equal(g.player.maxHp, next.player.maxHp);
    assert.equal(g.stats.damage, next.stats.damage);
  }
});

test('连续跨境只保留最新演出，暂停冻结，读档不重播，视觉不耗随机数', () => {
  const g = encounter(3);
  earn(g);
  g.save.cultivation = threshold(9) - 1;
  earn(g);
  assert.equal(g.realm, 9);
  assert.equal(g.effects.filter((e) => e.kind === 'realm-breakthrough').length, 1);
  assert.equal(realmBreakthroughCue(g)!.name, '元婴');
  g.update(0.01);
  g.pause();
  const cue = realmBreakthroughCue(g);
  const snapshot = g.snapshot();
  g.random = () => {
    throw new Error('视觉不可消耗随机数');
  };
  for (let i = 0; i < 20; i++) {
    g.update(0.05);
    assert.deepEqual(realmBreakthroughCue(g), cue);
  }
  assert.deepEqual(g.snapshot(), snapshot);
  assert.equal(JSON.stringify(snapshot).includes('realm-breakthrough'), false);
  const restored = Game.restore(g.save, JSON.parse(JSON.stringify(snapshot)))!;
  assert.ok(restored);
  assert.equal(realmBreakthroughCue(restored), null);
  assert.equal(restored.realm, g.realm);
  for (const state of ['won', 'lost'] as const) {
    g.state = state;
    assert.equal(realmBreakthroughCue(g), null);
  }
  g.state = 'paused';
  g.random = () => 0.5;
  g.resume();
  for (let i = 0; i < 13; i++) g.update(0.05);
  assert.equal(realmBreakthroughCue(g), null);
  assert.equal(
    g.effects.some((e) => e.kind === 'realm-breakthrough'),
    false,
  );
  const immortal = encounter(24);
  immortal.effects.push({
    x: 0,
    y: 0,
    life: 0.3,
    maxLife: 0.6,
    radius: 95,
    color: '#f3d68d',
    kind: 'realm-breakthrough',
    realmIndex: 7,
  });
  earn(immortal);
  assert.equal(immortal.realm, 24);
  assert.equal(realmBreakthroughCue(immortal), null, '真仙仍用原反馈，不能残留上一次大乘名号');
  const legacyGame = new Game(freshSave(), 0, 0, () => 0.5);
  legacyGame.level = 25;
  legacyGame.kills = 500;
  const legacy = JSON.parse(JSON.stringify(legacyGame.snapshot()));
  delete legacy.creditedCultivation;
  const legacySave = freshSave();
  const migrated = Game.restore(legacySave, legacy)!;
  assert.ok(migrated);
  assert.equal(legacySave.cultivation, 550, '保留旧档补发修为');
  assert.equal(migrated.realm, 4);
  assert.equal(realmBreakthroughCue(migrated), null, '旧档补发修为跨境界也不播放新演出');
});

test('七个大境界适配手机和横屏，减少动态效果静止，动态阵纹不建立画布缓存', async () => {
  const url = new URL('../src/render.ts', import.meta.url);
  const hook = registerHooks({
    load(id, context, nextLoad) {
      if (id !== url.href) return nextLoad(id, context);
      return {
        format: 'module',
        shortCircuit: true,
        source: stripTypeScriptTypes(readFileSync(url, 'utf8'), { mode: 'transform' }),
      };
    },
  });
  const { Renderer } = await import('../src/render.ts').finally(() => hook.deregister());
  let canvases = 0;
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement() {
        canvases++;
        throw new Error('动态阵纹不可生成离屏画布');
      },
    },
  });
  try {
    for (const [width, height] of [
      [1440, 900],
      [960, 600],
      [390, 844],
      [844, 390],
      [320, 568],
      [568, 320],
    ])
      for (const still of [false, true])
        for (let index = 1; index <= 7; index++) {
          const texts: { value: string; x: number; y: number }[] = [];
          let gradients = 0;
          const ctx = new Proxy({} as CanvasRenderingContext2D, {
            get:
              (_, key) =>
              (...args: any[]) => {
                if (key === 'createLinearGradient') {
                  gradients++;
                  return { addColorStop() {} };
                }
                if (key === 'fillText') texts.push({ value: args[0], x: args[1], y: args[2] });
              },
          });
          const renderer = Object.assign(Object.create(Renderer.prototype), {
            ctx,
            width,
            height,
            scale: 1,
            reducedMotion: { matches: still },
            formations: new Map(),
            sprite() {},
          });
          const g = encounter(index * 3);
          earn(g);
          g.enemies = [];
          g.effects = g.effects.filter((e) => e.kind === 'realm-breakthrough');
          const effect = g.effects[0];
          const before = g.snapshot();
          g.random = () => {
            throw new Error('绘制不可消耗随机数');
          };
          for (let frame = 0; frame < 36; frame++) {
            effect.life = REALM_BREAKTHROUGH_DURATION * (1 - frame / 36);
            renderer.drawGame(g, frame / 60);
            renderer.drawRealmBreakthrough(g);
          }
          assert.ok(texts.some((t) => t.value === REALMS[index]));
          assert.ok(texts.every((t) => t.x === width / 2 && t.y > 50 && t.y < height - 65));
          if (still) {
            assert.equal(gradients, 0);
            assert.equal(
              new Set(texts.filter((t) => t.value === REALMS[index]).map((t) => t.y)).size,
              1,
            );
          } else assert.equal(gradients, 36);
          assert.equal(renderer.formations.size, 0);
          assert.deepEqual(g.snapshot(), before);
        }
    assert.equal(canvases, 0);
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
