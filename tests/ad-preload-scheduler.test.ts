import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { preloadRewardAds } from '../src/ads-platform-source.ts';
import { defaultAdPlatformSettings } from '../src/ad-platform-contract.ts';
import { takePreparedAd } from '../src/ad-preload-cache.ts';
import { exampleAd } from './helpers/house-ads.ts';

test('自动续备、消费后补位、并发合并与前后台/离线/省流量/页面退出均有界且零凭条事件', async (t) => {
  const globals = ['window', 'document', 'navigator', 'Image'] as const;
  const previous = globals.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  const document = Object.assign(new EventTarget(), { hidden: false });
  const window = Object.assign(new EventTarget(), {
    requestIdleCallback(callback: () => void) {
      callback();
      return 1;
    },
  });
  const navigator = {
    onLine: true,
    userAgent: 'Chrome desktop',
    maxTouchPoints: 0,
    connection: { saveData: false },
  };
  class Image {
    naturalWidth = 200;
    onload: (() => void) | null = null;
    set src(_url: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  for (const [name, value] of Object.entries({ window, document, navigator, Image }))
    Object.defineProperty(globalThis, name, { configurable: true, value });
  t.after(() =>
    globals.forEach((name, index) => {
      if (previous[index]) Object.defineProperty(globalThis, name, previous[index]!);
      else delete (globalThis as any)[name];
    }),
  );
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls: string[] = [];
  let delayed = false,
    release: (() => void) | undefined;
  t.mock.method(globalThis, 'fetch', async (input: URL, options: RequestInit) => {
    const url = String(input);
    calls.push(url);
    assert.equal(options.credentials, 'omit');
    assert.equal(new URL(url).searchParams.has('verification'), false);
    if (url.includes('/config')) {
      if (delayed)
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      return Response.json({ settings: defaultAdPlatformSettings() });
    }
    assert.match(url, /\/api\/reward-content\/preload\?device=desktop$/);
    return Response.json({
      images: [exampleAd.imageUrl],
      ads: Object.fromEntries(exampleAd.placements.map((placement) => [placement, exampleAd])),
    });
  });
  async function flush() {
    for (let i = 0; i < 30; i++) await setImmediate();
  }
  async function until(predicate: () => boolean) {
    for (let i = 0; i < 2000; i++) {
      if (predicate()) {
        await flush();
        return;
      }
      await setImmediate();
    }
    assert.fail('预热未在有限调度内完成');
  }
  try {
    preloadRewardAds();
    await until(() => calls.length === 2);
    assert.equal(takePreparedAd('reward-root', 'desktop')?.id, exampleAd.id);
    assert.equal(takePreparedAd('reward-root', 'desktop'), null);
    preloadRewardAds(); // 完整观看后的同一补位入口。
    await until(() => calls.length === 4);
    assert.equal(takePreparedAd('reward-root', 'desktop')?.id, exampleAd.id);
    t.mock.timers.tick(60_000);
    await until(() => calls.length === 6);
    assert.equal(takePreparedAd('reward-root', 'desktop')?.id, exampleAd.id);

    delayed = true;
    preloadRewardAds();
    await until(() => !!release);
    const count = calls.length;
    for (let i = 0; i < 20; i++) preloadRewardAds();
    assert.equal(calls.length, count, '并发补位不额外发请求');
    document.hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    release!();
    delayed = false;
    release = undefined;
    await flush();
    assert.equal(calls.length, count, '后台迟到配置不能继续预热图片');
    t.mock.timers.tick(180_000);
    await flush();
    assert.equal(calls.length, count);
    document.hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    await until(() => calls.length === count + 2);

    for (const mode of ['offline', 'saveData', 'pagehide']) {
      if (mode === 'offline') navigator.onLine = false;
      if (mode === 'saveData') navigator.connection.saveData = true;
      window.dispatchEvent(new Event(mode === 'pagehide' ? 'pagehide' : 'offline'));
      const stopped = calls.length;
      t.mock.timers.tick(180_000);
      await flush();
      assert.equal(calls.length, stopped, mode + '不循环请求');
      navigator.onLine = true;
      navigator.connection.saveData = false;
      window.dispatchEvent(new Event(mode === 'pagehide' ? 'pageshow' : 'online'));
      await until(() => calls.length === stopped + 2);
    }
    assert.ok(calls.every((url) => /\/api\/reward-content\/(config|preload)(\?|$)/.test(url)));
  } finally {
    window.dispatchEvent(new Event('pagehide'));
    await flush();
  }
});
