import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';
import { defaultAdPlatformSettings } from '../src/ad-platform-contract.ts';
import { watchAdPlacement } from '../src/ads.ts';

function sdk(t: any, immediate = true) {
  const names = ['document', 'adsbygoogle', 'adBreak', 'adConfig'];
  const previous = names.map((n) => Object.getOwnPropertyDescriptor(globalThis, n));
  t.after(() =>
    names.forEach((n, i) =>
      previous[i]
        ? Object.defineProperty(globalThis, n, previous[i]!)
        : delete (globalThis as any)[n],
    ),
  );
  const captured = { scripts: [] as any[], breaks: [] as any[], configs: [] as any[] };
  const appendChild = (script: any) => {
    captured.scripts.push(script);
    if (immediate) queueMicrotask(() => script.onload?.());
  };
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => ({
        attrs: {} as Record<string, string>,
        setAttribute(name: string, value: string) {
          this.attrs[name] = value;
        },
        remove() {
          (this as any).removed = true;
        },
      }),
      head: { appendChild },
      body: { appendChild },
    },
  });
  Object.defineProperty(globalThis, 'adsbygoogle', {
    configurable: true,
    writable: true,
    value: [],
  });
  Object.defineProperty(globalThis, 'adBreak', {
    configurable: true,
    writable: true,
    value: (o: any) => captured.breaks.push(o),
  });
  Object.defineProperty(globalThis, 'adConfig', {
    configurable: true,
    writable: true,
    value: (o: any) => captured.configs.push(o),
  });
  return captured;
}
async function fresh() {
  const u = new URL('../src/ads-adsense.ts', import.meta.url);
  u.searchParams.set('sdk-fixture', crypto.randomUUID());
  return import(u.href);
}
const google = () => {
  const a = defaultAdPlatformSettings().adsense;
  a.client = 'ca-pub-1234567890123456';
  a.testMode = true;
  a.placements.revive = 'managed-revive';
  return a;
};
const context = (signal = new AbortController().signal) => ({
  host: {} as HTMLElement,
  signal,
  onProgress() {},
});

test('后台Google字段实际进入官方script和placement，真实回调类别去重且不伪造点击', async (t) => {
  const captured = sdk(t),
    module = await fresh(),
    posts: any[] = [];
  t.mock.method(globalThis, 'fetch', async (_input: any, options: any) => {
    posts.push(JSON.parse(options.body));
    assert.equal(options.credentials, 'omit');
    return new Response(null, { status: 204 });
  });
  const provider = module.createAdsenseProvider(google(), crypto.randomUUID()),
    ctx = context();
  assert.equal(await provider.prepare({ placement: 'revive', signal: ctx.signal }), true);
  assert.equal(captured.scripts.length, 1);
  assert.equal(
    captured.scripts[0].src,
    'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1234567890123456',
  );
  assert.equal(captured.scripts[0].attrs['data-adbreak-test'], 'on');
  assert.equal(captured.scripts[0].async, true);
  assert.equal(captured.scripts[0].crossOrigin, 'anonymous');
  let starts = 0,
    watches = 0,
    shows = 0,
    claim: (() => void) | undefined;
  provider.play(
    'revive',
    {
      onStarted: () => starts++,
      onWatched: (f: any) => {
        watches++;
        claim = f;
      },
      onFailed: () => assert.fail('valid SDK flow'),
    },
    ctx,
  );
  const event = captured.breaks[0];
  assert.equal(event.name, 'managed-revive');
  event.beforeReward(() => shows++);
  event.beforeAd();
  event.adViewed();
  event.adViewed();
  event.adBreakDone({ breakStatus: 'viewed' });
  event.adDismissed();
  claim!();
  claim!();
  assert.equal(starts, 1);
  assert.equal(shows, 1);
  assert.equal(watches, 1);
  assert.deepEqual(
    posts.map((p) => p.flags),
    [1, 5, 13],
  );
  const changed = module.createAdsenseProvider({ ...google(), client: 'ca-pub-9876543210987654' });
  assert.equal(await changed.prepare(), false);
  assert.equal(captured.scripts.length, 1, '同页不把新账号误用到旧SDK');
  assert.equal(
    await module.createAdsenseProvider({ ...google(), testMode: false }).prepare(),
    false,
  );
});

test('Google开始播放后解除加载超时，不把长广告误回退；关闭后的迟到回调不播放或计数', async (t) => {
  const captured = sdk(t),
    module = await fresh();
  let watched = 0,
    fallback = 0;
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  watchAdPlacement({
    provider: module.createAdsenseProvider(google()),
    placement: 'revive',
    host: {} as HTMLElement,
    alive: () => true,
    onWatched: () => watched++,
    onFallback: () => fallback++,
    timeoutMs: 100,
  });
  await new Promise<void>((r) => setImmediate(r));
  assert.equal(captured.breaks.length, 1);
  captured.breaks[0].beforeAd();
  t.mock.timers.tick(60000);
  assert.equal(fallback, 0);
  assert.equal(watched, 0);
  captured.breaks[0].adViewed();
  assert.equal(watched, 1);
  const controller = new AbortController(),
    provider = module.createAdsenseProvider(google());
  assert.equal(await provider.prepare(), true);
  provider.play(
    'revive',
    {
      onStarted: () => assert.fail('late start'),
      onWatched: () => assert.fail('late watched'),
      onFailed: () => assert.fail('late failure'),
    },
    context(controller.signal),
  );
  controller.abort();
  const late = captured.breaks[1];
  late.beforeReward(() => assert.fail('late fullscreen playback'));
  late.beforeAd();
  late.adViewed();
  late.adDismissed();
});

test('配置加载期间取消会移除未就绪Google脚本，不保留迟到的准备成功', async (t) => {
  const captured = sdk(t, false),
    module = await fresh(),
    controller = new AbortController();
  const pending = module
    .createAdsenseProvider(google())
    .prepare({ placement: 'revive', signal: controller.signal });
  assert.equal(captured.scripts.length, 1);
  controller.abort();
  assert.equal(await pending, false);
  assert.equal(captured.scripts[0].removed, true);
  assert.equal(captured.scripts[0].onload, null);
  assert.equal(captured.configs.length, 0);
});

test('关闭后、存活轮询触发前返回的平台配置也不能迟到注入Google脚本', async (t) => {
  const captured = sdk(t, false);
  const { platformAdProvider } = await import('../src/ads-platform-source.ts');
  let alive = true,
    pending: ((r: Response) => void) | undefined;
  t.mock.method(
    globalThis,
    'fetch',
    () =>
      new Promise<Response>((resolve) => {
        pending = resolve;
      }),
  );
  watchAdPlacement({
    provider: platformAdProvider(),
    placement: 'revive',
    host: {} as HTMLElement,
    alive: () => alive,
    onWatched: () => assert.fail('closed'),
    onFallback: () => assert.fail('closed'),
  });
  const deadline = Date.now() + 2000;
  while (!pending && Date.now() < deadline) await new Promise<void>((r) => setImmediate(r));
  assert.ok(pending, '平台配置请求已开始');
  alive = false;
  const settings = defaultAdPlatformSettings();
  settings.provider = 'adsense';
  settings.adsense = google();
  pending(Response.json({ settings }));
  await new Promise<void>((r) => setImmediate(r));
  await new Promise<void>((r) => setImmediate(r));
  assert.equal(captured.scripts.length, 0, '200ms轮询前也须核对实际存活状态');
});
