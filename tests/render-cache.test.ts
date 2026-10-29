import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import * as battleArt from '../src/battle-art.ts';
import { Game } from '../src/game.ts';
import { freshSave } from '../src/progress.ts';
import { BattleResolution } from '../src/battle-resolution.ts';

const url = new URL('../src/render.ts', import.meta.url);
const hook = registerHooks({
  load(id, context, nextLoad) {
    return id === url.href
      ? {
          format: 'module',
          shortCircuit: true,
          source: stripTypeScriptTypes(readFileSync(url, 'utf8'), { mode: 'transform' }),
        }
      : nextLoad(id, context);
  },
});
const { Renderer } = await import('../src/render.ts').finally(() => hook.deregister());

function fixture(run: (r: any, state: ReturnType<typeof environment>) => void) {
  const previous = ['window', 'document'].map((name) =>
    Object.getOwnPropertyDescriptor(globalThis, name),
  );
  const f = environment();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { innerWidth: 780, innerHeight: 360, devicePixelRatio: 2 },
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => {
        f.canvases++;
        return { getContext: () => f.context() };
      },
    },
  });
  const renderer = Object.assign(Object.create(Renderer.prototype), {
    battleArt,
    ctx: f.context(),
    canvas: {},
    width: 780,
    height: 360,
    scale: 1,
    reducedMotion: { matches: false },
    coarsePointer: { matches: true },
    resolution: new BattleResolution(),
    pixelRatio: 2,
    needsRedraw: false,
    glowSprites: new Map(),
    sprites: new Map(),
    formations: new Map(),
    tiles: [],
    terrainImages: [],
    sprite() {},
    playerFormation() {},
    drawPreview() {},
    drawBossEntrance() {},
    drawRealmBreakthrough() {},
  });
  try {
    run(renderer, f);
  } finally {
    ['window', 'document'].forEach((name, i) => {
      if (previous[i]) Object.defineProperty(globalThis, name, previous[i]!);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
}

function environment() {
  const state = {
    canvases: 0,
    gradients: 0,
    images: [] as number[][],
    fills: [] as { alpha: number; gradient: boolean }[],
    texts: [] as { method: string; value: string }[],
    context() {
      const stack: { globalAlpha: number; fillStyle: unknown }[] = [];
      const values: Record<string, unknown> = { globalAlpha: 1, fillStyle: '' };
      return new Proxy(values, {
        get(target, name: string) {
          if (name in target) return target[name];
          return (...args: any[]) => {
            if (name.startsWith('create') && name.endsWith('Gradient')) {
              state.gradients++;
              return { addColorStop() {} };
            }
            if (name === 'save')
              stack.push({ globalAlpha: Number(target.globalAlpha), fillStyle: target.fillStyle });
            if (name === 'restore') Object.assign(target, stack.pop());
            if (name === 'drawImage') state.images.push(args.slice(1));
            if (name === 'fillText' || name === 'strokeText')
              state.texts.push({ method: name, value: args[0] });
            if (name === 'fillRect')
              state.fills.push({
                alpha: Number(target.globalAlpha),
                gradient: typeof target.fillStyle === 'object',
              });
          };
        },
      }) as unknown as CanvasRenderingContext2D;
    },
  };
  return state;
}

test('关闭伤害数字停止描边和文字绘制，奖励提示、血条绘制与战斗状态保持', () =>
  fixture((r, f) => {
    const game = new Game(freshSave(), 0, 0, () => 0.5);
    game.weapons = [];
    const enemy = (game as any).spawnEnemy(0);
    enemy.hp = enemy.maxHp / 2;
    const damage = ['12', '3.2万!', '1亿'];
    game.effects = [...damage, '+气血', '+玄铁'].map((text) => ({
      x: 0,
      y: 0,
      life: 1,
      maxLife: 1,
      radius: 0,
      color: '#ffffff',
      kind: 'text',
      text,
    }));
    const before = game.snapshot();
    const effects = structuredClone(game.effects);
    game.random = () => {
      throw new Error('显示偏好不得消耗战斗随机数');
    };
    r.showDamageNumbers = true;
    r.drawGame(game, 0);
    assert.equal(f.texts.filter((text) => damage.includes(text.value)).length, 6);
    const visibleBars = structuredClone(f.fills);
    f.texts.length = f.fills.length = 0;
    r.showDamageNumbers = false;
    r.drawGame(game, 0);
    assert.equal(f.texts.filter((text) => damage.includes(text.value)).length, 0);
    assert.equal(f.texts.filter((text) => ['+气血', '+玄铁'].includes(text.value)).length, 4);
    assert.deepEqual(f.fills, visibleBars);
    assert.deepEqual(game.snapshot(), before);
    assert.deepEqual(game.effects, effects);
    f.texts.length = 0;
    r.showDamageNumbers = true;
    r.drawGame(game, 0);
    assert.equal(f.texts.filter((text) => damage.includes(text.value)).length, 6);
    assert.deepEqual(game.snapshot(), before);
  }));

test('飞剑移动与旋转复用纹理，剑尾完整保留，颜色分别缓存且总量有界', () =>
  fixture((r, f) => {
    for (let i = 0; i < 200; i++) r.sword(i, -i, i / 10, i % 2 ? '#abcdef' : '#123456', 0.8);
    assert.equal(f.canvases, 2);
    assert.equal(f.gradients, 2);
    assert.equal(f.images.length, 200);
    assert.deepEqual(f.images[0], [-64, -20, 128, 40]);
    assert.ok(-64 < -55 && 64 > 25, '缓存覆盖原剑尾与剑尖，不截断轨迹');
    for (let i = 0; i < 110; i++) r.sword(0, 0, 0, '#' + i.toString(16).padStart(6, '0'));
    assert.equal(r.glowSprites.size, 96);
  }));

test('两种经验光点只各画一次，持续绘制不改真实对局与拾取物', () =>
  fixture((r, f) => {
    const game = new Game(freshSave(), 0, 0, () => 0.5);
    game.weapons = [];
    game.pickups = [
      { kind: 'xp', x: 10, y: 20, value: 1, pull: false },
      { kind: 'xp', x: -10, y: -20, value: 16, pull: true },
    ];
    const before = game.snapshot();
    game.random = () => {
      throw new Error('绘制不得消耗战斗随机数');
    };
    for (let i = 0; i < 180; i++) r.drawGame(game, i / 60);
    assert.equal(f.canvases, 2);
    assert.equal(f.images.length, 360);
    assert.equal(r.glowSprites.size, 2);
    assert.deepEqual(game.snapshot(), before);
    r.restore();
    r.draw(game, 1000, 0);
    assert.equal(f.canvases, 4, '画布恢复后重建一次静态缓存');
    assert.deepEqual(game.snapshot(), before);
  }));

test('屏幕渐变复用并随尺寸重建，低气血脉动仍实时变化且不泄漏透明度', () =>
  fixture((r, f) => {
    r.drawGame = () => {};
    for (let i = 0; i < 120; i++) r.draw(null, i * 16, 0);
    assert.equal(f.gradients, 2, '首页遮罩只建立两份');
    const game = { player: { x: 0, y: 0 }, lowHealth: 0.5, time: 1 };
    f.fills.length = 0;
    r.draw(game, 2000, 0);
    const expected = (0.38 + 0.37 * 0.5) * (0.7 + 0.3 * (0.5 + Math.sin(5) * 0.5));
    assert.ok(f.fills.some((v) => v.gradient && Math.abs(v.alpha - expected) < 1e-12));
    assert.equal(f.gradients, 3);
    assert.equal(r.ctx.globalAlpha, 1);
    game.lowHealth = 0.9;
    game.time = 3;
    f.fills.length = 0;
    r.draw(game, 2100, 0);
    assert.equal(f.gradients, 3);
    assert.ok(!f.fills.some((v) => v.gradient && v.alpha === expected));
    r.resize();
    r.draw(game, 2200, 0);
    assert.equal(f.gradients, 5, '尺寸改变后重建屏幕遮罩及危急遮罩');
    r.restore();
    r.draw(null, 2300, 0);
    assert.equal(f.gradients, 7, '上下文恢复后按当前画布重建');
  }));

test('自动像素密度只改变画布分辨率，CSS视野、对局与暂停状态保持', () =>
  fixture((r) => {
    r.resize();
    r.drawGame = () => {};
    const game = new Game(freshSave(), 0, 0, () => 0.5);
    const before = game.snapshot();
    game.random = () => {
      throw new Error('画面精度不得消耗战斗随机数');
    };
    r.draw(game, 0, 0);
    const viewport = { ...game.viewport };
    assert.equal(r.canvas.width, 1560);
    for (let i = 1; i <= 80; i++) r.draw(game, i * 100, 0);
    assert.equal(r.canvas.width, 780);
    assert.equal(r.canvas.height, 360);
    assert.deepEqual(game.viewport, viewport);
    assert.deepEqual(game.snapshot(), before);
    game.pause();
    r.draw(game, 9000, 0);
    assert.equal(r.canvas.width, 780);
    assert.equal(game.state, 'paused');
    r.draw(null, 9100, 0);
    assert.equal(r.canvas.width, 1560, '回到首页恢复原精度');
  }));
