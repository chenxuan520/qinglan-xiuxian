import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultAdPlatformSettings } from '../src/ad-platform-contract.ts';
import { ADS_SETTINGS } from '../src/setting.ts';
import { adLoadJson } from '../src/ad-load-request.ts';
import { AdLoadTrace } from '../src/ad-load-diagnostics.ts';
import { configuredAdProvider } from '../src/ads-platform.ts';
import { requestHouseAd } from '../src/ads-house.ts';
import { adEnv, adStore, adWorker, exampleAd } from './helpers/house-ads.ts';

const origin = 'https://xiuxian.011203.xyz';
const prefix = '/api/reward-content/';

test('统一公开地址返回真实配置、分端素材、凭条和幂等事件，不开放管理入口', async (t) => {
  const store = adStore(),
    env = adEnv(store);
  t.after(() => store.close());
  await store.db
    .prepare('UPDATE ad_config SET campaigns = ?, settings = ? WHERE id = 1')
    .bind(
      JSON.stringify([
        {
          ...exampleAd,
          desktopWeight: 0,
          mobileWeight: 1,
          mobileImageUrl: origin + '/mobile.webp',
        },
      ]),
      JSON.stringify(defaultAdPlatformSettings()),
    )
    .run();
  const call = (path: string, method = 'GET', body?: unknown, source = origin) =>
    adWorker.fetch(
      new Request(origin + path, {
        method,
        headers: { Origin: source, 'Content-Type': 'text/plain' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      env,
    );
  for (const canonical of ['config', 'preload']) {
    const query = canonical === 'preload' ? '?device=mobile' : '?placement=reward-root';
    const response = await call(prefix + canonical + query);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('X-Qinglan-Content'), 'reward-content-v1');
    assert.equal(response.headers.get('Access-Control-Expose-Headers'), 'X-Qinglan-Content');
    const body: any = await response.json();
    if (canonical === 'config') assert.deepEqual(body, { settings: defaultAdPlatformSettings() });
    else {
      assert.deepEqual(body.images, [origin + '/mobile.webp']);
      assert.equal(Object.keys(body.ads).length, 4);
      assert.ok(
        Object.values(body.ads).every((ad: any) => ad.imageUrl === origin + '/mobile.webp'),
      );
    }
  }
  for (const route of [prefix + 'creative']) {
    const mobile = await call(route + '?placement=reward-root&device=mobile&verification=1');
    const delivery: any = await mobile.json();
    assert.equal(delivery.ad.imageUrl, origin + '/mobile.webp');
    assert.equal(typeof delivery.receipt, 'string');
    assert.deepEqual(await (await call(route + '?placement=reward-root&device=desktop')).json(), {
      ad: null,
    });
    for (const event of [prefix + 'event', prefix + 'event'])
      assert.equal(
        (await call(event, 'POST', { receipt: delivery.receipt, flags: 13 })).status,
        204,
      );
    const row: any = await store.db
      .prepare('SELECT flags, verification FROM ad_receipts WHERE id = ?')
      .bind(delivery.receipt)
      .first();
    assert.equal(row.flags, 13);
    assert.equal(row.verification, 1);
  }
  for (const route of [
    'admin/config',
    'admin/login',
    'admin/diagnostics',
    'openapi.json',
    'unknown',
  ])
    for (const method of ['GET', 'POST', 'PUT'])
      assert.equal((await call(prefix + route, method)).status, 404);
  for (const route of ['config', 'creative', 'preload', 'event'])
    assert.equal((await call(prefix + route, 'PUT')).status, 405);
  assert.equal(
    (await call(prefix + 'creative?placement=revive', 'GET', undefined, 'https://evil.test'))
      .status,
    403,
  );
  assert.equal(
    (await call(prefix + 'event', 'OPTIONS', undefined, 'https://chenxuan520.github.io')).status,
    204,
  );
  assert.equal((await call('/ads/admin/config')).status, 401);
  for (const path of ['/v1/settings', '/v1/ad', '/v1/preload', '/v1/event'])
    for (const prefix of ['', '/ads'])
      for (const method of ['GET', 'POST'])
        assert.equal((await call(prefix + path, method)).status, 404);
});

test('切换位置和设备仍使用同一公开签发频控', async (t) => {
  const store = adStore(),
    env = adEnv(store),
    keys: string[] = [];
  t.after(() => store.close());
  await store.db
    .prepare('UPDATE ad_config SET campaigns = ? WHERE id = 1')
    .bind(JSON.stringify([exampleAd]))
    .run();
  env.AD_RECEIPT_LIMITER = {
    async limit({ key }: { key: string }) {
      keys.push(key);
      return { success: keys.length === 1 };
    },
  };
  for (const [index, route] of [
    prefix + 'creative?placement=revive&device=mobile',
    prefix + 'creative?placement=reward-root&device=desktop',
  ].entries()) {
    const result: any = await (await adWorker.fetch(new Request(origin + route), env)).json();
    assert.equal(result.ad.id, exampleAd.id);
    assert.equal(typeof result.receipt, index === 0 ? 'string' : 'undefined');
  }
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1]);
});

test('旧ads路径被替换成伪200时，新玩家路径仍读真实SQL配置和创意，不将失败当无库存', async (t) => {
  const store = adStore(),
    env = adEnv(store),
    calls: string[] = [];
  t.after(() => store.close());
  await store.db
    .prepare('UPDATE ad_config SET campaigns = ? WHERE id = 1')
    .bind(JSON.stringify([exampleAd]))
    .run();
  const fetcher: typeof fetch = async (input, options) => {
    const url = String(input);
    calls.push(new URL(url).pathname);
    assert.equal(options?.credentials, 'omit');
    if (new URL(url).pathname.startsWith('/ads/')) return new Response('blocked', { status: 200 });
    return adWorker.fetch(new Request(url, options), env);
  };
  const signal = new AbortController().signal;
  assert.equal(await adLoadJson(new URL(origin + '/ads/v1/settings'), signal, 8000, fetcher), null);
  assert.equal((await configuredAdProvider('reward-root', signal, fetcher))?.name, 'house');
  const delivery = await requestHouseAd('reward-root', signal, fetcher);
  assert.equal(delivery?.id, exampleAd.id);
  assert.deepEqual(calls, ['/ads/v1/settings', prefix + 'config', prefix + 'creative']);
  assert.equal(new URL(ADS_SETTINGS.house.preloadEndpoint).pathname, prefix + 'preload');
  assert.equal(new URL(ADS_SETTINGS.house.eventEndpoint).pathname, prefix + 'event');
});

test('新公开地址的非JSON响应缺少服务标记时记录有限诊断，不采集响应正文', async () => {
  for (const [marker, code] of [
    [false, 'unexpected-response'],
    [true, 'json'],
  ] as const) {
    const trace = new AdLoadTrace();
    const result = await adLoadJson(
      new URL(origin + prefix + 'config'),
      new AbortController().signal,
      8000,
      async () =>
        new Response('blocked', {
          headers: marker ? { 'X-Qinglan-Content': 'reward-content-v1' } : {},
        }),
      trace,
    );
    assert.equal(result, null);
    assert.equal(trace.status, 200);
    assert.equal(trace.code, code);
  }
});
