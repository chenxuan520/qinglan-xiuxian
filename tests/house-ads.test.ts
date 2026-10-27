import test from 'node:test';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import { ADMIN_SCRIPT, LOGIN_SCRIPT, ADMIN_HTML, LOGIN_HTML } from '../workers/house-ads/admin.ts';
import {
  houseAdUrl,
  validHouseAdConfig,
  boundedAdJson,
  HOUSE_AD_PLACEMENTS,
} from '../src/house-ad-contract.ts';
import { HouseAdClock, requestHouseAd } from '../src/ads-house.ts';
import { adReceiptId } from '../src/ad-metrics-contract.ts';
import { defaultAdPlatformSettings } from '../src/ad-platform-contract.ts';
import { watchAdPlacement, type RewardAdCallbacks, type RewardAdProvider } from '../src/ads.ts';
import worker from '../workers/house-ads/index.ts';
import {
  adSessionFixture,
  adStore,
  adEnv,
  exampleAd,
  LOCAL_AD_PASSWORD,
} from './helpers/house-ads.ts';

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

test('电脑和手机图片可分别配置，旧投放可读，手机地址沿用相同HTTPS安全校验', async (t) => {
  const store = adStore(),
    env = adEnv(store);
  t.after(() => store.close());
  new Script(ADMIN_SCRIPT);
  new Script(LOGIN_SCRIPT);
  // 脚本未加载时浏览器默认提交也不能把密码拼进 GET 查询串。
  assert.match(LOGIN_HTML, /<form[^>]*method="post"[^>]*action="\/ads\/admin\/login"/);
  assert.match(ADMIN_HTML, /<form[^>]*method="post"[^>]*action="\/ads\/admin\/password"/);
  const mobileImageUrl = 'https://xiuxian.011203.xyz/assets/journey-map-mobile.webp';
  const campaign = { ...exampleAd, mobileImageUrl };
  assert.equal(validHouseAdConfig({ revision: 0, campaigns: [exampleAd] }), true);
  assert.equal(validHouseAdConfig({ revision: 0, campaigns: [campaign] }), true);
  for (const value of [
    '',
    null,
    123,
    'javascript:alert(1)',
    'http://example.test/a',
    'https://user:pass@example.test/a',
  ])
    assert.equal(
      validHouseAdConfig({ revision: 0, campaigns: [{ ...exampleAd, mobileImageUrl: value }] }),
      false,
    );
  await store.db
    .prepare('UPDATE ad_config SET campaigns = ? WHERE id = 1')
    .bind(JSON.stringify([campaign]))
    .run();
  for (const placement of HOUSE_AD_PLACEMENTS) {
    const response = await worker.fetch(
      new Request(env.ADMIN_ORIGIN + '/ads/v1/ad?placement=' + placement),
      env,
    );
    assert.equal(response.status, 200);
    const delivery = (await response.json()) as { ad: unknown; receipt: string };
    assert.equal(adReceiptId(delivery.receipt), true);
    assert.deepEqual(delivery, {
      receipt: delivery.receipt,
      ad: {
        id: campaign.id,
        name: campaign.name,
        imageUrl: campaign.imageUrl,
        mobileImageUrl,
        targetUrl: campaign.targetUrl,
      },
    });
  }
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

test('正常入口直接显示账号密码登录，伪造身份、过期会话和其他来源均不能访问配置', async (t) => {
  const store = adStore(),
    env = adEnv(store),
    fixture = await adSessionFixture(store),
    token = await fixture.token();
  t.after(() => store.close());
  const page = await worker.fetch(new Request(env.ADMIN_ORIGIN + '/ads/admin/'), env);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /广告管理登录/);
  const get = (headers: HeadersInit = {}) =>
    worker.fetch(new Request(env.ADMIN_ORIGIN + '/ads/admin/config', { headers }), env);
  assert.equal((await get()).status, 401);
  assert.equal(
    (
      await get({
        'Cf-Access-Authenticated-User-Email': 'owner@example.test',
        'Cf-Access-Jwt-Assertion': 'forged',
      })
    ).status,
    401,
  );
  assert.equal((await get({ Cookie: token })).status, 200);
  assert.equal((await get({ Cookie: token + '; ' + token })).status, 401);
  assert.equal((await get({ Cookie: token.slice(0, -5) + '12345' })).status, 401);
  const other = await worker.fetch(
    new Request('https://bypass.workers.dev/admin/config', { headers: { Cookie: token } }),
    env,
  );
  assert.equal(other.status, 403);
  await store.db.prepare('UPDATE ad_sessions SET expires = 1').run();
  assert.equal((await get({ Cookie: token })).status, 401);
});

test('账号密码登录、退出撤销、修改密码撤销所有旧会话，失败不写投放配置', async (t) => {
  const store = adStore(),
    env = adEnv(store),
    fixture = await adSessionFixture(store),
    token = await fixture.token();
  t.after(() => store.close());
  const act = (path: string, data: unknown, cookie = token, origin = env.ADMIN_ORIGIN) =>
    worker.fetch(
      new Request(env.ADMIN_ORIGIN + '/ads/admin/' + path, {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify(data),
      }),
      env,
    );
  const login = { username: 'owner@example.test', password: LOCAL_AD_PASSWORD };
  assert.equal((await act('login', { ...login, username: 'other' })).status, 401);
  assert.equal((await act('login', { ...login, password: 'wrong' })).status, 401);
  assert.equal((await act('login', login, '', 'https://other.test')).status, 403);
  assert.equal(
    (
      await act(
        'password',
        { password: LOCAL_AD_PASSWORD, newPassword: 'New-local-password-2345' },
        '',
      )
    ).status,
    401,
  );
  assert.equal(
    (await act('password', { password: 'wrong', newPassword: 'New-local-password-2345' })).status,
    401,
  );
  assert.equal(
    (await act('password', { password: LOCAL_AD_PASSWORD, newPassword: 'short' })).status,
    400,
  );
  const second = await act('login', login),
    secondCookie = second.headers.get('set-cookie')!.split(';')[0];
  assert.equal(second.status, 200);
  assert.match(
    second.headers.get('set-cookie')!,
    /HttpOnly; Secure; SameSite=Strict; Max-Age=28800/,
  );
  assert.equal((await act('logout', {})).status, 200);
  const config = (cookie: string) =>
    worker.fetch(
      new Request(env.ADMIN_ORIGIN + '/ads/admin/config', { headers: { Cookie: cookie } }),
      env,
    );
  assert.equal((await config(token)).status, 401);
  assert.equal((await config(secondCookie)).status, 200);
  const changed = await act(
    'password',
    { password: LOCAL_AD_PASSWORD, newPassword: 'New-local-password-2345' },
    secondCookie,
  );
  assert.equal(changed.status, 200);
  assert.match(changed.headers.get('set-cookie')!, /Max-Age=0/);
  assert.equal((await config(secondCookie)).status, 401);
  assert.equal((await act('login', login)).status, 401);
  assert.equal((await act('login', { ...login, password: 'New-local-password-2345' })).status, 200);
  assert.equal(store.value()!.revision, 0);
});

test('登录原子限流、正文上限、存储失败均拒绝访问，响应不泄露密码或数据库错误', async (t) => {
  const store = adStore(),
    env = adEnv(store);
  await adSessionFixture(store);
  t.after(() => store.close());
  const login = (body: string) =>
    worker.fetch(
      new Request(env.ADMIN_ORIGIN + '/ads/admin/login', {
        method: 'POST',
        headers: {
          Origin: env.ADMIN_ORIGIN,
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '192.0.2.7',
        },
        body,
      }),
      env,
    );
  assert.equal((await login('x'.repeat(2100))).status, 400);
  store.failures(false, true);
  const failure = await login(
    JSON.stringify({ username: 'owner@example.test', password: LOCAL_AD_PASSWORD }),
  );
  assert.equal(failure.status, 503);
  assert.doesNotMatch(await failure.text(), /fixture|Local-only|password_hash/);
  store.failures(false, false);
  const results = await Promise.all(
    Array.from({ length: 12 }, () =>
      login(JSON.stringify({ username: 'owner@example.test', password: 'wrong' })),
    ),
  );
  assert.equal(results.filter((r) => r.status === 401).length, 10);
  assert.equal(results.filter((r) => r.status === 429).length, 2);
  assert.equal(store.value()!.revision, 0);
});

test('真实Worker+SQLite保存投放，公开接口只返回该位置已启用的图片广告', async (t) => {
  const store = adStore(),
    fixture = await adSessionFixture(store),
    env = adEnv(store),
    token = await fixture.token();
  t.after(() => store.close());
  const admin = (path: string, method = 'GET', body?: unknown, origin = env.ADMIN_ORIGIN) =>
    worker.fetch(
      new Request(env.ADMIN_ORIGIN + path, {
        method,
        headers: {
          Cookie: token,
          Origin: origin,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      env,
    );
  for (const path of ['/ads/admin/config'])
    assert.equal((await worker.fetch(new Request(env.ADMIN_ORIGIN + path), env)).status, 401);
  const html = await admin('/ads/admin/');
  assert.equal(html.status, 200);
  assert.match(html.headers.get('Content-Security-Policy')!, /script-src 'self'/);
  assert.doesNotMatch(await html.text(), /owner@example|test-audience/);
  const initial = (await (await admin('/ads/admin/config')).json()) as any;
  assert.deepEqual(initial, {
    revision: 0,
    campaigns: [],
    settings: {
      ...defaultAdPlatformSettings(),
      adsense: {
        ...defaultAdPlatformSettings().adsense,
        client: JSON.parse(store.value()!.settings as string).adsense.client,
      },
    },
  });
  const config = {
    revision: 0,
    campaigns: [exampleAd, { ...exampleAd, id: 'disabled', enabled: false }],
  };
  assert.equal(
    (await admin('/ads/admin/config', 'PUT', config, 'https://evil.example')).status,
    403,
  );
  assert.equal(store.value()!.revision, 0);
  const saved = await admin('/ads/admin/config', 'PUT', config);
  assert.equal(saved.status, 200);
  assert.equal(((await saved.json()) as any).revision, 1);
  for (const placement of HOUSE_AD_PLACEMENTS) {
    const result = await worker.fetch(
      new Request(env.ADMIN_ORIGIN + '/ads/v1/ad?placement=' + placement, {
        headers: { Origin: 'https://xiuxian.011203.xyz' },
      }),
      env,
    );
    assert.equal(result.status, 200);
    assert.equal(result.headers.get('Access-Control-Allow-Origin'), 'https://xiuxian.011203.xyz');
    assert.equal(result.headers.get('Cache-Control'), 'no-store');
    const delivery = (await result.json()) as { ad: unknown; receipt: string };
    assert.equal(adReceiptId(delivery.receipt), true);
    assert.deepEqual(delivery, {
      receipt: delivery.receipt,
      ad: {
        id: exampleAd.id,
        name: exampleAd.name,
        imageUrl: exampleAd.imageUrl,
        targetUrl: exampleAd.targetUrl,
      },
    });
  }
  assert.equal(
    (await worker.fetch(new Request(env.ADMIN_ORIGIN + '/ads/v1/ad?placement=other'), env)).status,
    400,
  );
  assert.equal(
    (
      await worker.fetch(
        new Request(env.ADMIN_ORIGIN + '/ads/v1/ad?placement=revive', {
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
          headers: { Cookie: token },
        }),
        env,
      )
    ).status,
    403,
  );
  const turnedOff = await admin('/ads/admin/config', 'PUT', { revision: 1, campaigns: [] });
  assert.equal(turnedOff.status, 200);
  assert.deepEqual(
    await (
      await worker.fetch(new Request(env.ADMIN_ORIGIN + '/ads/v1/ad?placement=revive'), env)
    ).json(),
    { ad: null },
  );
});

test('真实SQL并行保存只接受一个版本，失败与非法配置不部分改写', async (t) => {
  const store = adStore(),
    fixture = await adSessionFixture(store),
    env = adEnv(store),
    token = await fixture.token();
  t.after(() => store.close());
  const save = (value: unknown) =>
    worker.fetch(
      new Request(env.ADMIN_ORIGIN + '/ads/admin/config', {
        method: 'PUT',
        headers: {
          Cookie: token,
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
    (await worker.fetch(new Request(env.ADMIN_ORIGIN + '/ads/v1/ad?placement=revive'), env)).status,
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
  class Element extends EventTarget {
    style = { cssText: '', visibility: '' };
    inert = false;
    dataset: Record<string, string> = {};
    attributes: Record<string, string> = {};
    children: Element[] = [];
    removed = false;
    complete = true;
    naturalWidth = 300;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    append(...nodes: Element[]) {
      this.children.push(...nodes);
    }
    setAttribute(name: string, value: string) {
      this.attributes[name] = value;
    }
    replaceChildren(...nodes: Element[]) {
      this.children = nodes;
    }
    remove() {
      this.removed = true;
    }
    focus() {}
    closest(selector: string) {
      return selector === '.result-panel' ? panel : root;
    }
    querySelector(selector: string) {
      return selector.includes('secondary-button') ? cancel : null;
    }
    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
    // 原窗口算法会算出约54%可见，但实际滚动祖先只显示42%。
    getBoundingClientRect() {
      return { top: -47, bottom: 54, left: 0, right: 300, width: 300, height: 101 };
    }
  }
  const panel = new Element(),
    root = new Element(),
    cancel = new Element();
  cancel.dataset.action = 'finish-run';
  let currentImage: Element;
  const document = Object.assign(new EventTarget(), {
    visibilityState: 'visible',
    hasFocus: () => true,
    createElement: (tag: string) => {
      const element = new Element();
      if (tag === 'img') currentImage = element;
      return element;
    },
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
  const layer = root.children[0];
  assert.equal(layer.attributes['aria-modal'], 'true');
  assert.match(layer.style.cssText, /position:fixed;inset:0/);
  assert.match(currentImage!.style.cssText, /object-fit:contain/);
  assert.equal(panel.inert, true, '覆盖期间原奖励页不可操作');
  intersect([{ isIntersecting: true, intersectionRatio: 0.42 }]);
  for (let i = 0; i < 60; i++) {
    now += 100;
    t.mock.timers.tick(100);
  }
  assert.equal(watched, 0);
  assert.equal(layer.removed, false, '未完成有效观看不能提前收起');
  intersect([{ isIntersecting: true, intersectionRatio: 0.8 }]);
  for (let i = 0; i < 50; i++) {
    now += 100;
    t.mock.timers.tick(100);
  }
  assert.equal(watched, 1);
  assert.equal(disconnected, true);
  assert.equal(layer.removed, true, '完成5秒有效观看后自动移除覆盖层');
  assert.equal(panel.inert, false);
  assert.equal(panel.style.visibility, '');
  intersect([{ isIntersecting: false, intersectionRatio: 0 }]);
  now += 10000;
  t.mock.timers.tick(10000);
  assert.equal(watched, 1);
  // 首图已加载，换图后失败且没有 error 事件，不能一直停在不可领取状态。
  let failures = 0;
  disconnected = false;
  await playHouseAd(
    'revive',
    { onWatched: () => watched++, onFailed: () => failures++ },
    { host: host as unknown as HTMLElement, signal: new AbortController().signal, onProgress() {} },
  );
  currentImage!.complete = false;
  currentImage!.naturalWidth = 0;
  now += 100;
  t.mock.timers.tick(100);
  assert.equal(failures, 0, '仍在加载时继续等待');
  currentImage!.complete = true;
  now += 100;
  t.mock.timers.tick(100);
  assert.equal(failures, 1, '确定加载失败后回退且只回退一次');
  assert.equal(watched, 1);
  assert.equal(disconnected, true);
  now += 10000;
  t.mock.timers.tick(10000);
  assert.equal(failures, 1);
});
