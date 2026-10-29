import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { SPRITE_ATLASES, spriteFrame } from '../src/sprites.ts';
import { PLAYER_IMAGES, playerSpriteFrame } from '../src/player-appearance.ts';

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

function fixture(run: (renderer: any, state: ReturnType<typeof drawing>) => void) {
  const original = ['window', 'document'].map((name) =>
    Object.getOwnPropertyDescriptor(globalThis, name),
  );
  const state = drawing();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      innerWidth: 390,
      innerHeight: 844,
      devicePixelRatio: 2,
      matchMedia: () => ({ matches: false }),
    },
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => state.canvas() },
  });
  const renderer = new Renderer(state.canvas() as unknown as HTMLCanvasElement);
  try {
    run(renderer, state);
  } finally {
    ['window', 'document'].forEach((name, i) => {
      if (original[i]) Object.defineProperty(globalThis, name, original[i]!);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
}

function drawing() {
  const calls: { canvas: unknown; source: any; args: number[]; filter: unknown }[] = [];
  const canvases: any[] = [];
  const state = {
    calls,
    canvases,
    canvas() {
      const canvas = { width: 0, height: 0, addEventListener() {}, getContext: () => context };
      const attributes: Record<string, unknown> = { globalAlpha: 1, filter: 'none' };
      const stack: Record<string, unknown>[] = [];
      const context = new Proxy(attributes, {
        get(target, name: string) {
          if (name in target) return target[name];
          return (...args: any[]) => {
            if (name === 'save') stack.push({ ...target });
            else if (name === 'restore') Object.assign(target, stack.pop());
            else if (name === 'drawImage')
              calls.push({ canvas, source: args[0], args: args.slice(1), filter: target.filter });
            else if (name.endsWith('Gradient')) return { addColorStop() {} };
          };
        },
      });
      canvases.push(canvas);
      return canvas;
    },
  };
  return state;
}

function images() {
  return new Map(
    [
      ...new Set([...SPRITE_ATLASES.map((sheet) => sheet.url), ...Object.values(PLAYER_IMAGES)]),
    ].map((url) => [url, { url, complete: true, naturalWidth: 3072, naturalHeight: 2048 }]),
  );
}

// Crop coordinates are checked against the public atlas and player-frame contracts;
// cached textures must preserve every item, route, flash variant and display extent.
test('精灵缓存保留全部82个图集裁切、三路线和闪光；移动复用同图且不再读取源图元数据', () =>
  fixture((renderer, state) => {
    renderer.images = images();
    for (let index = 0; index <= 81; index++) {
      const paths = index === 0 ? (['orthodox', 'demonic', 'dual'] as const) : ['orthodox'];
      for (const path of paths)
        for (const flash of [false, true]) {
          const frame = index === 0 ? playerSpriteFrame(path as any) : spriteFrame(index);
          const artScale = 'scale' in frame ? frame.scale : 1;
          state.calls.length = 0;
          renderer.sprite(index, 13, -27, 84, -1, flash, path);
          assert.equal(state.calls.length, 2, '首次创建只裁切一次，再绘制主画布');
          const [crop, drawn] = state.calls;
          assert.equal(crop.source, renderer.images.get(frame.url));
          assert.deepEqual(crop.args.slice(0, 4), [
            frame.x * 2,
            frame.y * 2,
            3072 / frame.columns,
            2048 / frame.rows,
          ]);
          assert.equal(crop.filter, flash ? 'brightness(1.7)' : 'none');
          const width = Math.min(84, (84 * 4 * frame.width) / (3 * frame.height));
          const height = (width * frame.height) / frame.width;
          assert.deepEqual(crop.args.slice(4), [0, 0, Math.ceil(width * 2), Math.ceil(height * 2)]);
          assert.equal(drawn.source, crop.canvas);
          assert.deepEqual(drawn.args, [
            (-width * artScale) / 2,
            -height * 0.765 + (height * (1 - artScale)) / 2,
            width * artScale,
            height * artScale,
          ]);
          const source = renderer.images.get(frame.url);
          const get = renderer.images.get;
          renderer.images.get = () => assert.fail('缓存命中不应重新找源图或计算其裁切信息');
          state.calls.length = 0;
          renderer.sprite(index, -90, 60, 84, 1, flash, path);
          renderer.images.get = get;
          assert.equal(state.calls.length, 1);
          assert.equal(state.calls[0].source, drawn.source);
          assert.deepEqual(state.calls[0].args, drawn.args);
          assert.equal(source.complete, true);
        }
    }
    assert.equal(renderer.sprites.size, 168);
  }));

test('尚未加载的源图不缓存空白；尺寸独立且256条有界，恢复后重新按原裁切建立', () =>
  fixture((renderer, state) => {
    const frame = spriteFrame(30);
    renderer.sprite(30, 0, 0, 84);
    assert.equal(renderer.sprites.size, 0);
    const source = { url: frame.url, complete: false, naturalWidth: 0, naturalHeight: 2048 };
    renderer.images.set(frame.url, source);
    renderer.sprite(30, 0, 0, 84);
    assert.equal(renderer.sprites.size, 0);
    source.complete = true;
    source.naturalWidth = 3072;
    renderer.sprite(30, 0, 0, 84);
    const first = state.calls.at(-1)!;
    for (let size = 85; size <= 385; size++) renderer.sprite(30, 0, 0, size);
    assert.equal(renderer.sprites.size, 256);
    state.calls.length = 0;
    renderer.sprite(30, 0, 0, 84);
    assert.equal(state.calls.length, 2, '被驱逐的尺寸仍可按原样重建');
    assert.deepEqual(state.calls[1].args, first.args);
    renderer.drawPreview = () => {};
    renderer.restore();
    renderer.draw(null, 100, 0);
    assert.equal(renderer.sprites.size, 0, '上下文恢复清理旧canvas及关联元数据');
    state.calls.length = 0;
    renderer.sprite(30, 0, 0, 84);
    assert.equal(state.calls.length, 2);
    assert.deepEqual(state.calls[1].args, first.args);
    assert.notEqual(state.calls[1].source, first.source);
  }));
