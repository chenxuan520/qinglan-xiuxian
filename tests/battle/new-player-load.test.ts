import test from 'node:test';
import assert from 'node:assert/strict';
import { loadNewPlayerAssets, startsWithPrologue } from '../../src/battle/new-player-load.ts';
import { preloadTownImages, TOWN_IMAGES } from '../../src/town/town-images.ts';
import { sceneAssets } from '../../src/battle/scene-assets.ts';
import { PLAYER_IMAGES } from '../../src/battle/player-appearance.ts';

const idle = () => new Promise((resolve) => setImmediate(resolve));

test('只有启动即显示序章的新玩家走优先序章流程', () => {
  const free = { saveLock: null, game: null, pendingRun: null, inMortalWorld: false, panel: '' };
  assert.equal(startsWithPrologue({ prologueSeen: false }, free), true);
  assert.equal(startsWithPrologue({ prologueSeen: true }, free), false);
  for (const blocked of [
    { saveLock: 'stale' },
    { game: {} },
    { pendingRun: {} },
    { inMortalWorld: true },
    { panel: 'lifespan-ended' },
  ])
    assert.equal(startsWithPrologue({ prologueSeen: false }, { ...free, ...blocked }), false);
});

function withFakeImage<T>(run: () => T) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'Image');
  Object.defineProperty(globalThis, 'Image', {
    configurable: true,
    value: class {
      fetchPriority = 'auto';
      src = '';
      decode = async () => {};
    },
  });
  try {
    return run();
  } finally {
    if (original) Object.defineProperty(globalThis, 'Image', original);
    else Reflect.deleteProperty(globalThis, 'Image');
  }
}

test('序章立即显示，离乡预热结束后才准备战斗，最后标记就绪', () =>
  withFakeImage(async () => {
    const events: string[] = [];
    let resolveTown!: () => void;
    let resolveBattle!: () => void;
    loadNewPlayerAssets(
      '/assets/qinglan-prologue-dark.webp',
      () => events.push('prologue'),
      () => {
        events.push('town');
        return new Promise<void>((resolve) => (resolveTown = resolve));
      },
      () => {
        events.push('battle');
        return new Promise<void>((resolve) => (resolveBattle = resolve));
      },
      () => events.push('ready'),
      () => events.push('failed'),
    );
    assert.deepEqual(events, ['prologue', 'town'], '战斗准备必须等离乡预热结束');
    await idle();
    assert.deepEqual(events, ['prologue', 'town']);
    resolveTown();
    await idle();
    assert.deepEqual(events, ['prologue', 'town', 'battle']);
    resolveBattle();
    await idle();
    assert.deepEqual(events, ['prologue', 'town', 'battle', 'ready']);
  }));

test('后台准备失败时不标记就绪，并交给失败处理重试', async () => {
  await withFakeImage(async () => {
    const events: string[] = [];
    loadNewPlayerAssets(
      '/assets/qinglan-prologue-dark.webp',
      () => events.push('prologue'),
      async () => events.push('town'),
      async () => {
        events.push('battle');
        throw new Error('offline');
      },
      () => events.push('ready'),
      () => events.push('failed'),
    );
    await idle();
    assert.deepEqual(events, ['prologue', 'town', 'battle', 'failed']);
  });
});

test('离乡预热包含全部三张主角图，当前路线排在最前', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'Image');
  const sources: string[] = [];
  Object.defineProperty(globalThis, 'Image', {
    configurable: true,
    value: class {
      fetchPriority = 'auto';
      decode = async () => {};
      set src(value: string) {
        sources.push(value);
      }
    },
  });
  try {
    await preloadTownImages('demonic');
  } finally {
    if (original) Object.defineProperty(globalThis, 'Image', original);
    else Reflect.deleteProperty(globalThis, 'Image');
  }
  assert.deepEqual(TOWN_IMAGES.slice(0, 5), [
    '/assets/town-ground.webp',
    '/assets/town-buildings.webp',
    '/assets/sect-market-buildings.webp',
    '/assets/town-props.webp',
    '/assets/town-npcs.webp',
  ]);
  assert.deepEqual(sources.slice(5), [
    PLAYER_IMAGES.demonic,
    PLAYER_IMAGES.orthodox,
    PLAYER_IMAGES.dual,
  ]);
  assert.equal(new Set([...Object.values(PLAYER_IMAGES)]).size, 3);
});

test('第一境战斗资源仍包含三张主角图', () => {
  const assets = sceneAssets(0);
  for (const url of Object.values(PLAYER_IMAGES)) assert.ok(assets.includes(url), url);
});
