import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import {
  PLAYER_IMAGES,
  playerSpriteFrame,
  playerSpriteBackground,
} from '../src/player-appearance.ts';
import { Game } from '../src/game.ts';
import { freshSave } from '../src/progress.ts';
import { completedJourney } from '../src/common-ui.ts';

test('三道使用对应静态图片，正道只取原图首格，独立立绘完整取景', () => {
  for (const path of ['orthodox', 'demonic', 'dual'] as const) {
    const frame = playerSpriteFrame(path);
    assert.equal(frame.url, PLAYER_IMAGES[path]);
    assert.equal(frame.x, 0);
    assert.equal(frame.y, 0);
    assert.equal(frame.width / frame.height, 3 / 4);
    assert.equal(frame.columns, path === 'orthodox' ? 4 : 1);
    assert.equal(frame.rows, path === 'orthodox' ? 2 : 1);
    const image = readFileSync(`public${frame.url}`);
    assert.equal(image.subarray(8, 12).toString(), 'WEBP');
    assert.ok(image.length < 400_000);
    assert.ok(playerSpriteBackground(path).includes(frame.url));
  }
  assert.equal(new Set(Object.values(PLAYER_IMAGES)).size, 3);
});

const renderUrl = new URL('../src/render.ts', import.meta.url);
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

test('首页主体、元婴与实战读取各自道途，换道不改变旧局形象', () => {
  const calls: unknown[][] = [];
  const gradient = { addColorStop() {} };
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get: () => () => gradient,
  });
  const renderer = Object.assign(Object.create(Renderer.prototype), {
    ctx,
    width: 1365,
    height: 900,
    scale: 1,
    reducedMotion: { matches: false },
    sprite(...args: unknown[]) {
      calls.push(args);
    },
    formation() {},
    playerFormation() {},
    sword() {},
    lotus() {},
  });
  for (const path of ['orthodox', 'demonic', 'dual'] as const) {
    calls.length = 0;
    renderer.drawPreview({ x: 0, y: 0 }, 0, 3, path);
    assert.equal(calls.length, 2);
    assert.ok(calls.every((args) => args[6] === path));
    const save = freshSave('heaven', ['wood'], path);
    const game = new Game(save, 0, 0, () => 0.5);
    game.weapons = [];
    save.path = path === 'dual' ? 'orthodox' : 'dual';
    calls.length = 0;
    renderer.drawGame(game, 0);
    assert.equal(calls.find((args) => args[0] === 0)?.[6], path);
    assert.ok(completedJourney(save, '真仙', true, '').includes(playerSpriteBackground(save.path)));
  }
});
