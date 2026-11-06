import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { ALTARS } from '../src/altars.ts';
import { Game } from '../src/game.ts';
import { freshSave } from '../src/progress.ts';
import { STAGES, TAU } from '../src/data.ts';
import { spriteFrame } from '../src/sprites.ts';
import { drawBossSummon } from '../src/boss-mechanics-render.ts';

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

// 记录真实绘制调用与纹理合成，不作为浏览器像素或视觉验收。
function fixture(run: (renderer: any, drawing: ReturnType<typeof drawingFixture>) => void) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const drawing = drawingFixture();
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => drawing.canvas() },
  });
  const renderer = Object.assign(Object.create(Renderer.prototype), {
    ctx: drawing.context(false),
    width: 800,
    height: 600,
    scale: 1,
    images: new Map(),
    sprites: new Map(),
    formations: new Map(),
    glowSprites: new Map(),
    reducedMotion: { matches: false },
    coarsePointer: { matches: false },
    playerFormation() {},
    battleArt: { drawSovereignWarnings() {}, drawBossSummon },
  });
  try {
    run(renderer, drawing);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  }
}

function drawingFixture() {
  const calls: {
    method: string;
    args: any[];
    color: unknown;
    composite: unknown;
    filter: unknown;
    texture: boolean;
  }[] = [];
  const canvases: any[] = [];
  return {
    calls,
    canvases,
    context(texture: boolean) {
      const stack: Record<string, unknown>[] = [];
      const values: Record<string, unknown> = {
        globalAlpha: 1,
        filter: 'none',
        globalCompositeOperation: 'source-over',
      };
      return new Proxy(values, {
        get(target, name: string) {
          if (name in target) return target[name];
          return (...args: any[]) => {
            if (name === 'save') stack.push({ ...target });
            else if (name === 'restore') Object.assign(target, stack.pop());
            else
              calls.push({
                method: name,
                args,
                color: target.fillStyle,
                composite: target.globalCompositeOperation,
                filter: target.filter,
                texture,
              });
          };
        },
      });
    },
    canvas() {
      const context = this.context(true);
      const canvas = { width: 0, height: 0, getContext: () => context };
      canvases.push(canvas);
      return canvas;
    },
  };
}

function encounter(stage = 0): any {
  const game = new Game(freshSave(), stage, 0, () => 0.5);
  game.weapons = [];
  Object.assign(game, {
    time: 100,
    altar: {
      kind: ALTARS[stage].kind,
      x: 100,
      y: 0,
      spawnAt: 100,
      expiresAt: 130,
      phase: 'offered',
    },
  });
  return game;
}

test('六境祭坛仅offered/prompt绘制45半径阵法、地域色、名称、glyph及30秒进度，无屏边箭头', () =>
  fixture((r, drawing) => {
    r.sprite = () => {};
    for (let stage = 0; stage < ALTARS.length; stage++) {
      const game = encounter(stage);
      const original = JSON.stringify({
        altar: game.altar,
        save: game.save,
        effects: game.effects,
      });
      game.random = () => {
        throw Error('绘制不能消耗战斗随机数');
      };
      for (const phase of ['pending', 'offered', 'prompt', 'accepted', 'gone']) {
        game.altar.phase = phase;
        drawing.calls.length = 0;
        r.drawGame(game, game.time);
        const shown = ['offered', 'prompt'].includes(phase);
        const texts = drawing.calls.filter((call) => call.method === 'fillText');
        assert.deepEqual(
          texts.map((call) => call.args[0]),
          shown ? [ALTARS[stage].name, ALTARS[stage].glyph] : [],
        );
        if (shown) {
          assert.ok(texts.every((call) => call.color === STAGES[stage].color));
          assert.ok(drawing.calls.some((call) => call.method === 'arc' && call.args[2] === 45));
          const ring = drawing.calls.find(
            (call) => call.method === 'arc' && call.args[0] === 100 && call.args[2] === 50,
          )!;
          assert.equal(ring.args[4] - ring.args[3], TAU);
        }
      }
      game.altar.phase = 'offered';
      game.time = 115;
      drawing.calls.length = 0;
      r.drawGame(game, game.time);
      const ring = drawing.calls.find(
        (call) => call.method === 'arc' && call.args[0] === 100 && call.args[2] === 50,
      )!;
      assert.equal(ring.args[4] - ring.args[3], TAU / 2);
      game.altar.x = 5000;
      drawing.calls.length = 0;
      r.drawGame(game, game.time);
      assert.equal(
        drawing.calls.some((call) => call.method === 'fillText'),
        false,
      );
      game.time = 100;
      game.altar.x = 100;
      assert.equal(
        JSON.stringify({ altar: game.altar, save: game.save, effects: game.effects }),
        original,
      );
    }
  }));

test('冻结纹理只在角色不透明部分覆盖淡蓝0.35，保留受击闪光且复用缓存，不改变普通纹理', () =>
  fixture((r, drawing) => {
    const frame = spriteFrame(1);
    r.images.set(frame.url, { complete: true, naturalWidth: 1536, naturalHeight: 1024 });
    r.sprite(1, 0, 0, 84);
    assert.equal(
      drawing.calls.some((call) => call.composite === 'source-atop'),
      false,
    );
    for (const flash of [false, true]) {
      const start = drawing.calls.length;
      r.sprite(1, 0, 0, 84, 1, flash, 'orthodox', true);
      const calls = drawing.calls.slice(start);
      const crop = calls.find((call) => call.texture && call.method === 'drawImage')!;
      assert.equal(crop.filter, flash ? 'brightness(1.7)' : 'none');
      const tint = calls.find((call) => call.texture && call.method === 'fillRect')!;
      const canvas = drawing.canvases.at(-1);
      assert.equal(tint.composite, 'source-atop');
      assert.equal(tint.color, 'rgba(179, 220, 240, 0.35)');
      assert.equal(tint.filter, 'none');
      assert.deepEqual(tint.args, [0, 0, canvas.width, canvas.height]);
    }
    const count = drawing.canvases.length;
    drawing.calls.length = 0;
    r.sprite(1, 0, 0, 84);
    r.sprite(1, 10, 10, 84, -1, false, 'orthodox', true);
    assert.equal(drawing.canvases.length, count);
    assert.equal(
      drawing.calls.some((call) => call.texture),
      false,
    );
    assert.equal(r.ctx.globalAlpha, 1);
    assert.equal(r.ctx.globalCompositeOperation, 'source-over');
  }));

test('普通、精英及魂影按frozenUntil选择冻结纹理，妖王不冻结，到期复原且不新增粒子', () =>
  fixture((r) => {
    const game = encounter();
    game.altar = null;
    const ordinary = game.spawnEnemy(0, false, false, { x: 80, y: 0 });
    const elite = game.spawnEnemy(0, true, false, { x: 120, y: 0 });
    const illusion = game.spawnEnemy(0, false, false, { x: 160, y: 0 });
    illusion.illusionOf = 999;
    const boss = game.spawnEnemy(0, false, true, { x: 200, y: 0 });
    for (const enemy of [ordinary, elite, illusion, boss]) enemy.frozenUntil = 108;
    const before = JSON.stringify({
      enemies: game.enemies,
      effects: game.effects,
      zones: game.zones,
    });
    const sprites: any[][] = [];
    r.sprite = (...args: any[]) => sprites.push(args);
    r.drawGame(game, game.time);
    for (const enemy of [ordinary, elite, illusion, boss])
      assert.equal(sprites.find((args) => args[1] === enemy.x)![7], !enemy.boss);
    game.time = 108;
    sprites.length = 0;
    r.drawGame(game, game.time);
    assert.ok(
      sprites.filter((args) => args[1] !== game.player.x).every((args) => args[7] === false),
    );
    assert.equal(
      JSON.stringify({ enemies: game.enemies, effects: game.effects, zones: game.zones }),
      before,
    );
  }));

test('Canvas木心同样整体淡蓝覆盖，复用临时纹理且冻结结束恢复原绘制', () =>
  fixture((r, drawing) => {
    const game = encounter();
    game.altar = null;
    const heart = game.spawnEnemy(0, false, false, { x: 100, y: 0 });
    heart.bossSummon = { kind: 'heart', age: 1 };
    heart.frozenUntil = 108;
    r.sprite = () => {};
    const before = JSON.stringify(heart);
    r.drawGame(game, game.time);
    const tint = drawing.calls.find(
      (call) => call.texture && call.composite === 'source-atop' && call.method === 'fillRect',
    )!;
    assert.equal(tint.color, 'rgba(179, 220, 240, 0.35)');
    assert.deepEqual(tint.args, [0, 0, 256, 256]);
    assert.equal(drawing.canvases.length, 1);
    r.drawGame(game, game.time);
    assert.equal(drawing.canvases.length, 1);
    game.time = 108;
    drawing.calls.length = 0;
    r.drawGame(game, game.time);
    assert.equal(
      drawing.calls.some((call) => call.texture),
      false,
    );
    assert.equal(JSON.stringify(heart), before);
  }));
