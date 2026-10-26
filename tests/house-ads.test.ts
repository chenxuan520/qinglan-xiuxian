import test from 'node:test';
import assert from 'node:assert/strict';
import {
  houseAdUrl,
  validHouseAdConfig,
  boundedAdJson,
  HOUSE_AD_PLACEMENTS,
} from '../src/house-ad-contract.ts';
import { HouseAdClock, requestHouseAd } from '../src/ads-house.ts';
import { watchAdPlacement, type RewardAdCallbacks, type RewardAdProvider } from '../src/ads.ts';
import worker from '../workers/house-ads/index.ts';
import { allowedAdAdmin } from '../workers/house-ads/access.ts';
import { adAccessFixture, adStore, adEnv, exampleAd } from './helpers/house-ads.ts';

test('广告配置封闭校验HTTPS链接、20条上限、唯一身份与四个合法广告位', () => {
  const config = { revision: 0, campaigns: [structuredClone(exampleAd)] };
  assert.equal(validHouseAdConfig(config), true);
  assert.equal(validHouseAdConfig({ revision: 0, campaigns: [] }), true);
  for (const url of [
    'http://example.com/a',
    'javascript:alert(1)',
    'data:image/png,test',
    '//example.com',
    'https://user:pass@example.com/a',
    ' https://example.com',
  ])
    assert.equal(houseAdUrl(url), false);
  for (const patch of [
    { name: '' },
    { imageUrl: 'javascript:alert(1)' },
    { targetUrl: 'http://example.com' },
    { enabled: 1 },
    { placements: [] },
    { placements: ['revive', 'revive'] },
    { placements: ['other'] },
    { html: '<script>' },
  ])
    assert.equal(validHouseAdConfig({ ...config, campaigns: [{ ...exampleAd, ...patch }] }), false);
  for (const value of [
    { ...config, revision: -1 },
    { ...config, extra: 1 },
    { ...config, campaigns: [exampleAd, exampleAd] },
    {
      ...config,
      campaigns: Array.from({ length: 21 }, (_, i) => ({ ...exampleAd, id: 'a-' + i })),
    },
  ])
    assert.equal(validHouseAdConfig(value), false);
});

test('有界JSON读取拒绝分块超限和损坏正文，不只信任Content-Length', async () => {
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode('{"a":'));
      c.enqueue(new Uint8Array(40));
      c.close();
    },
  });
  await assert.rejects(boundedAdJson(new Response(stream), 20), /body-too-large/);
  await assert.rejects(boundedAdJson(new Response('not json'), 100));
  assert.deepEqual(await boundedAdJson(Response.json({ a: 1 }), 100), { a: 1 });
});

test('Access实际RSA签名同时核验身份、应用、签发方与期限，伪造邮箱标头不能登录', async () => {
  const fixture = await adAccessFixture(),
    store = adStore(),
    env = adEnv(store);
  const fetcher: typeof fetch = async (url) => {
    assert.equal(String(url), 'https://review.cloudflareaccess.com/cdn-cgi/access/certs');
    return Response.json(fixture.publicKeys);
  };
  const check = async (token: string) =>
    allowedAdAdmin(
      new Request(env.ADMIN_ORIGIN + '/admin/', { headers: { 'Cf-Access-Jwt-Assertion': token } }),
      { ...env, ADMIN_EMAIL: env.ADMIN_EMAIL!, ACCESS_AUD: env.ACCESS_AUD! },
      fetcher,
    );
  assert.equal(await check(await fixture.token()), true);
  for (const patch of [
    { email: 'other@example.test' },
    { aud: ['other'] },
    { iss: 'https://other.cloudflareaccess.com' },
    { exp: 1 },
    { iat: 9e12 },
    { nbf: 9e12 },
  ])
    assert.equal(await check(await fixture.token(patch)), false);
  assert.equal(await check(await fixture.token({}, { alg: 'HS256' })), false);
  assert.equal(await check(await fixture.token({}, { kid: 'unknown' })), false);
  const valid = await fixture.token();
  assert.equal(await check(valid.slice(0, -20) + 'invalid'), false);
  assert.equal(
    await allowedAdAdmin(
      new Request(env.ADMIN_ORIGIN + '/admin/', {
        headers: { 'Cf-Access-Authenticated-User-Email': 'owner@example.test' },
      }),
      { ...env, ADMIN_EMAIL: env.ADMIN_EMAIL!, ACCESS_AUD: env.ACCESS_AUD! },
      fetcher,
    ),
    false,
  );
  assert.equal(
    await allowedAdAdmin(
      new Request(env.ADMIN_ORIGIN + '/admin/'),
      { ...env, ADMIN_EMAIL: '', ACCESS_AUD: '' },
      fetcher,
    ),
    false,
  );
  store.close();
});

test('真实Worker+SQLite保存投放，公开接口只返回该位置已启用的图片广告', async (t) => {
  const fixture = await adAccessFixture(),
    store = adStore(),
    env = adEnv(store),
    token = await fixture.token();
  t.after(() => store.close());
  t.mock.method(globalThis, 'fetch', async (url: any) => {
    assert.match(String(url), /\/cdn-cgi\/access\/certs$/);
    return Response.json(fixture.publicKeys);
  });
  const admin = (path: string, method = 'GET', body?: unknown, origin = env.ADMIN_ORIGIN) =>
    worker.fetch(
      new Request(env.ADMIN_ORIGIN + path, {
        method,
        headers: {
          'Cf-Access-Jwt-Assertion': token,
          Origin: origin,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      env,
    );
  for (const path of ['/admin/', '/admin/app.js', '/admin/app.css', '/admin/config'])
    assert.equal((await worker.fetch(new Request(env.ADMIN_ORIGIN + path), env)).status, 401);
  const html = await admin('/admin/');
  assert.equal(html.status, 200);
  assert.match(html.headers.get('Content-Security-Policy')!, /script-src 'self'/);
  assert.doesNotMatch(await html.text(), /owner@example|test-audience/);
  assert.deepEqual(await (await admin('/admin/config')).json(), { revision: 0, campaigns: [] });
  const config = {
    revision: 0,
    campaigns: [exampleAd, { ...exampleAd, id: 'disabled', enabled: false }],
  };
  assert.equal((await admin('/admin/config', 'PUT', config, 'https://evil.example')).status, 403);
  assert.equal(store.value()!.revision, 0);
  const saved = await admin('/admin/config', 'PUT', config);
  assert.equal(saved.status, 200);
  assert.equal(((await saved.json()) as any).revision, 1);
  for (const placement of HOUSE_AD_PLACEMENTS) {
    const result = await worker.fetch(
      new Request(env.ADMIN_ORIGIN + '/v1/ad?placement=' + placement, {
        headers: { Origin: 'https://xiuxian.011203.xyz' },
      }),
      env,
    );
    assert.equal(result.status, 200);
    assert.equal(result.headers.get('Access-Control-Allow-Origin'), 'https://xiuxian.011203.xyz');
    assert.equal(result.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await result.json(), {
      ad: {
        id: exampleAd.id,
        name: exampleAd.name,
        imageUrl: exampleAd.imageUrl,
        targetUrl: exampleAd.targetUrl,
      },
    });
  }
  assert.equal(
    (await worker.fetch(new Request(env.ADMIN_ORIGIN + '/v1/ad?placement=other'), env)).status,
    400,
  );
  assert.equal(
    (
      await worker.fetch(
        new Request(env.ADMIN_ORIGIN + '/v1/ad?placement=revive', {
          headers: { Origin: 'https://evil.example' },
        }),
        env,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await worker.fetch(
        new Request('https://bypass.workers.dev/admin/config', {
          headers: { 'Cf-Access-Jwt-Assertion': token },
        }),
        env,
      )
    ).status,
    401,
  );
  const turnedOff = await admin('/admin/config', 'PUT', { revision: 1, campaigns: [] });
  assert.equal(turnedOff.status, 200);
  assert.deepEqual(
    await (
      await worker.fetch(new Request(env.ADMIN_ORIGIN + '/v1/ad?placement=revive'), env)
    ).json(),
    { ad: null },
  );
});

test('真实SQL并行保存只接受一个版本，失败与非法配置不部分改写', async (t) => {
  const fixture = await adAccessFixture(),
    store = adStore(),
    env = adEnv(store),
    token = await fixture.token();
  t.after(() => store.close());
  t.mock.method(globalThis, 'fetch', async () => Response.json(fixture.publicKeys));
  const save = (value: unknown) =>
    worker.fetch(
      new Request(env.ADMIN_ORIGIN + '/admin/config', {
        method: 'PUT',
        headers: {
          'Cf-Access-Jwt-Assertion': token,
          Origin: env.ADMIN_ORIGIN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(value),
      }),
      env,
    );
  const config = { revision: 0, campaigns: [exampleAd] };
  const responses = await Promise.all([save(config), save(config)]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
  const before = structuredClone(store.value());
  assert.equal(
    (await save({ revision: 1, campaigns: [{ ...exampleAd, targetUrl: 'javascript:alert(1)' }] }))
      .status,
    400,
  );
  store.failures(false, true);
  assert.equal((await save({ revision: 1, campaigns: [] })).status, 503);
  assert.deepEqual({ ...store.value() }, before);
  store.failures(true, false);
  assert.equal(
    (await worker.fetch(new Request(env.ADMIN_ORIGIN + '/v1/ad?placement=revive'), env)).status,
    503,
  );
});

test('图片广告请求携带广告位且不带登录凭据，取消与无投放均不虚构广告', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (url, options) => {
    calls++;
    assert.equal(new URL(String(url)).searchParams.get('placement'), 'lifespan');
    assert.equal(options?.credentials, 'omit');
    assert.equal(options?.cache, 'no-store');
    return Response.json({ ad: exampleAd });
  };
  assert.equal(
    (await requestHouseAd('lifespan', new AbortController().signal, fetcher))?.id,
    exampleAd.id,
  );
  const aborted = new AbortController();
  aborted.abort();
  assert.equal(await requestHouseAd('lifespan', aborted.signal, fetcher), null);
  assert.equal(calls, 1);
  assert.equal(
    await requestHouseAd('revive', new AbortController().signal, async () =>
      Response.json({ ad: null }),
    ),
    null,
  );
  assert.equal(
    await requestHouseAd('revive', new AbortController().signal, async () =>
      Response.json({ ad: { ...exampleAd, targetUrl: 'javascript:alert(1)' } }),
    ),
    null,
  );
});

test('前台观看按可见时间累计，后台与恢复后的长计时空洞不抵扣观看', () => {
  const clock = new HouseAdClock();
  clock.sample(0, true);
  for (let t = 100; t <= 2000; t += 100) clock.sample(t, true);
  assert.equal(clock.remaining, 3000);
  clock.sample(2000, false);
  clock.sample(600_000, false);
  clock.sample(600_000, true);
  assert.equal(clock.remaining, 3000);
  for (let t = 600100; t <= 603000; t += 100) clock.sample(t, true);
  assert.equal(clock.remaining, 0);
  const suspended = new HouseAdClock();
  suspended.sample(0, true);
  suspended.sample(600000, true);
  assert.equal(suspended.remaining, 4750);
});

test('自营图片成功显示后使用自己的观看时钟，加载超时与旧SDK静默兜底仍独立', async () => {
  let callbacks: RewardAdCallbacks | undefined,
    watched = 0,
    failures = 0;
  const provider: RewardAdProvider = {
    name: 'house-fixture',
    ownsPlaybackClock: true,
    placementName: (p) => p,
    prepare: async () => true,
    play: (_p, cb) => {
      callbacks = cb;
      cb.onStarted?.();
    },
  };
  watchAdPlacement({
    provider,
    placement: 'revive',
    alive: () => true,
    timeoutMs: 10,
    onWatched: () => watched++,
    onFallback: () => failures++,
  });
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(watched, 0);
  assert.equal(failures, 0);
  callbacks!.onWatched();
  callbacks!.onWatched();
  callbacks!.onFailed('late');
  assert.equal(watched, 1);
  assert.equal(failures, 0);
});

test('图片被滚动面板裁掉过半时不累计观看，重新显示后才能完成且释放观察器', async (t) => {
  const { playHouseAd } = await import('../src/ads-house.ts');
  const globals = ['document', 'window', 'IntersectionObserver'] as const;
  const previous = globals.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  t.after(() =>
    globals.forEach((name, i) => {
      if (previous[i]) Object.defineProperty(globalThis, name, previous[i]!);
      else delete (globalThis as any)[name];
    }),
  );
  class Element {
    style = { cssText: '' };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    append() {}
    setAttribute() {}
    replaceChildren() {}
    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
    // 原窗口算法会算出约54%可见，但实际滚动祖先只显示42%。
    getBoundingClientRect() {
      return { top: -47, bottom: 54, left: 0, right: 300, width: 300, height: 101 };
    }
  }
  const document = Object.assign(new EventTarget(), {
    visibilityState: 'visible',
    hasFocus: () => true,
    createElement: () => new Element(),
  });
  let intersect: (
    entries: Array<{ isIntersecting: boolean; intersectionRatio: number }>,
  ) => void = () => {};
  let observed = false,
    disconnected = false,
    watched = 0,
    now = 0;
  class Observer {
    constructor(callback: typeof intersect) {
      intersect = callback;
    }
    observe() {
      observed = true;
    }
    disconnect() {
      disconnected = true;
    }
  }
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    value: Observer,
  });
  t.mock.method(globalThis, 'fetch', async () => Response.json({ ad: exampleAd }));
  t.mock.method(performance, 'now', () => now);
  t.mock.timers.enable({ apis: ['setInterval'] });
  const host = Object.assign(new Element(), { isConnected: true });
  await playHouseAd(
    'revive',
    { onWatched: () => watched++, onFailed: () => assert.fail('图片已加载') },
    {
      host: host as unknown as HTMLElement,
      signal: new AbortController().signal,
      onProgress() {},
    },
  );
  assert.equal(observed, true);
  intersect([{ isIntersecting: true, intersectionRatio: 0.42 }]);
  for (let i = 0; i < 60; i++) {
    now += 100;
    t.mock.timers.tick(100);
  }
  assert.equal(watched, 0);
  intersect([{ isIntersecting: true, intersectionRatio: 0.8 }]);
  for (let i = 0; i < 50; i++) {
    now += 100;
    t.mock.timers.tick(100);
  }
  assert.equal(watched, 1);
  assert.equal(disconnected, true);
  intersect([{ isIntersecting: false, intersectionRatio: 0 }]);
  now += 10000;
  t.mock.timers.tick(10000);
  assert.equal(watched, 1);
});
