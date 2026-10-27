import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { configuredAdProvider } from '../src/ads-platform.ts';
import { defaultAdPlatformSettings } from '../src/ad-platform-contract.ts';
import { adLoadJson } from '../src/ad-load-request.ts';
import { AdLoadTrace } from '../src/ad-load-diagnostics.ts';
import { preloadAdImages } from '../src/ads-preload.ts';
import { storePreparedAd, takePreparedAd } from '../src/ad-preload-cache.ts';
import { requestHouseAd } from '../src/ads-house.ts';
import { validAdLoadDiagnostic } from '../src/ad-load-contract.ts';
import { adEnv, adStore, adWorker, adSessionFixture, exampleAd } from './helpers/house-ads.ts';

const origin = 'https://xiuxian.011203.xyz';
const diagnostic = () => ({
  version: 'v0.0.5-15-g9b644f9',
  placement: 'reward-supplies',
  device: 'mobile',
  browser: 'via',
  stage: 'settings',
  code: 'timeout',
  status: 0,
  elapsed: 12_000,
});

test('慢配置超过原3秒仍进入真实自营provider，不提前回退；关闭后不采纳迟到结果', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const settings = defaultAdPlatformSettings();
  settings.provider = 'house';
  const controller = new AbortController();
  const fetcher = async (_url: any, options: any) =>
    new Promise<Response>((resolve, reject) => {
      setTimeout(() => resolve(Response.json({ settings })), 3500);
      options.signal.addEventListener('abort', () => reject(Error('aborted')), { once: true });
    });
  let result: unknown = 'pending';
  const pending = configuredAdProvider('reward-supplies', controller.signal, fetcher).then(
    (v) => (result = v),
  );
  t.mock.timers.tick(3001);
  await setImmediate();
  assert.equal(result, 'pending');
  t.mock.timers.tick(499);
  await pending;
  assert.equal((result as any)?.name, 'house');
  const cancel = new AbortController();
  const late = configuredAdProvider('reward-supplies', cancel.signal, fetcher);
  cancel.abort();
  t.mock.timers.tick(3500);
  assert.equal(await late, null);
});

test('网络和5xx只重试一次，4xx/坏JSON不重试；取消或超时都有界且不复活旧请求', async (t) => {
  const signal = new AbortController().signal,
    url = new URL(origin + '/ads/v1/settings');
  let calls = 0;
  assert.deepEqual(
    await adLoadJson(url, signal, 512, async () => {
      if (++calls === 1) throw Error('network');
      return Response.json({ ok: 1 });
    }),
    { ok: 1 },
  );
  assert.equal(calls, 2);
  calls = 0;
  assert.deepEqual(
    await adLoadJson(url, signal, 512, async () =>
      ++calls === 1 ? new Response('', { status: 503 }) : Response.json({ ok: 1 }),
    ),
    { ok: 1 },
  );
  assert.equal(calls, 2);
  for (const response of [new Response('', { status: 403 }), new Response('{bad')]) {
    calls = 0;
    assert.equal(
      await adLoadJson(url, signal, 512, async () => {
        calls++;
        return response;
      }),
      null,
    );
    assert.equal(calls, 1);
  }
  t.mock.timers.enable({ apis: ['setTimeout'] });
  calls = 0;
  const trace = new AdLoadTrace();
  const pending = adLoadJson(
    url,
    signal,
    512,
    async (_u, o) => {
      calls++;
      return new Promise((_r, reject) =>
        o!.signal!.addEventListener('abort', () => reject(Error('timeout')), { once: true }),
      );
    },
    trace,
  );
  t.mock.timers.tick(6000);
  await setImmediate();
  assert.equal(calls, 2);
  t.mock.timers.tick(6000);
  assert.equal(await pending, null);
  assert.equal(trace.code, 'timeout');
  assert.equal(calls, 2);
});

test('预加载去重并限制4张，只读preload而不申请广告凭条/打点，取消后不继续加载', async () => {
  const requested: string[] = [],
    images: any[] = [];
  const urls = Array.from({ length: 6 }, (_, i) => origin + '/image-' + i + '.webp');
  await preloadAdImages(
    new AbortController().signal,
    async (u, o) => {
      requested.push(String(u));
      assert.equal(o?.credentials, 'omit');
      return Response.json({ images: [urls[0], ...urls, 'http://invalid.test/x'] });
    },
    () => {
      const image: any = {
        set src(v: string) {
          images.push(v);
          queueMicrotask(() => image.onload?.());
        },
      };
      return image;
    },
  );
  assert.equal(requested.length, 1);
  assert.match(requested[0], /\/api\/reward-content\/preload\?device=/);
  assert.deepEqual(images, urls.slice(0, 4));
  const cancel = new AbortController();
  cancel.abort();
  await preloadAdImages(
    cancel.signal,
    async () => assert.fail('cancelled fetch'),
    () => assert.fail('cancelled image'),
  );
});

test('诊断只允许封闭字段与有限枚举，不接受URL、IP、任意异常或扩展字段', () => {
  assert.equal(validAdLoadDiagnostic(diagnostic()), true);
  for (const value of [
    { ...diagnostic(), url: origin },
    { ...diagnostic(), ip: '1.2.3.4' },
    { ...diagnostic(), stage: 'full error' },
    { ...diagnostic(), code: 'error: token' },
    { ...diagnostic(), elapsed: 60_001 },
    { ...diagnostic(), status: 600 },
    { ...diagnostic(), version: 'https://secret.test' },
  ])
    assert.equal(validAdLoadDiagnostic(value), false);
});

test('诊断经过来源/独立频控后真实SQL聚合，私有查询需原登录；不写投放和运营指标', async () => {
  const store = adStore(),
    env = adEnv(store);
  let allowed = true,
    calls = 0;
  env.AD_DIAGNOSTIC_LIMITER = {
    async limit() {
      calls++;
      return { success: allowed };
    },
  };
  const send = (body: any = diagnostic(), headers: Record<string, string> = { Origin: origin }) =>
    adWorker.fetch(
      new Request(origin + '/api/client-status', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain', ...headers },
        body: JSON.stringify(body),
      }),
      env,
    );
  try {
    const original = store.value();
    assert.equal((await send()).status, 204);
    assert.equal((await send()).status, 204);
    allowed = false;
    await send();
    allowed = true;
    await send({ ...diagnostic(), secret: 'no' });
    assert.equal((await send(diagnostic(), { Origin: 'https://evil.test' })).status, 403);
    assert.equal(calls, 4);
    const rows = (await store.db.prepare('SELECT * FROM ad_load_diagnostics').all()).results;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].count, 2);
    assert.equal(rows[0].elapsed_total, 24_000);
    assert.deepEqual(store.value(), original);
    assert.equal((await store.db.prepare('SELECT count(*) n FROM ad_receipts').first())?.n, 0);
    const url = origin + '/ads/admin/diagnostics?days=1';
    assert.equal((await adWorker.fetch(new Request(url), env)).status, 401);
    const session = await adSessionFixture(store);
    const response = await adWorker.fetch(
      new Request(url, { headers: { Cookie: await session.token() } }),
      env,
    );
    assert.equal(response.status, 200);
    assert.equal(((await response.json()) as any).rows[0].count, 2);
  } finally {
    store.close();
  }
});

test('预热接口按端正权重/启用状态返回图片，Google不返回，不申请凭条', async () => {
  const store = adStore(),
    env = adEnv(store),
    settings = defaultAdPlatformSettings();
  settings.provider = 'house';
  try {
    const campaigns = [
      { ...exampleAd, desktopWeight: 0, mobileWeight: 1, mobileImageUrl: origin + '/mobile.webp' },
      {
        ...exampleAd,
        id: 'other',
        desktopWeight: 1,
        mobileWeight: 0,
        imageUrl: origin + '/desktop.webp',
        enabled: false,
      },
    ];
    await store.db
      .prepare('UPDATE ad_config SET campaigns=?,settings=? WHERE id=1')
      .bind(JSON.stringify(campaigns), JSON.stringify(settings))
      .run();
    const preload = async (device: string) =>
      adWorker.fetch(
        new Request(origin + '/ads/v1/preload?device=' + device, { headers: { Origin: origin } }),
        env,
      );
    const mobile = (await (await preload('mobile')).json()) as any;
    assert.deepEqual(mobile.images, [origin + '/mobile.webp']);
    assert.equal(mobile.ads['reward-supplies'].id, exampleAd.id);
    assert.equal('receipt' in mobile, false);
    assert.equal(Object.keys(mobile.ads).length, 4);
    const desktop = (await (await preload('desktop')).json()) as any;
    assert.deepEqual(desktop.images, []);
    assert.ok(Object.values(desktop.ads).every((ad) => ad === null));
    assert.equal((await preload('tablet')).status, 400);
    settings.provider = 'adsense';
    settings.adsense.client = 'ca-pub-1234567890123456';
    await store.db
      .prepare('UPDATE ad_config SET settings=? WHERE id=1')
      .bind(JSON.stringify(settings))
      .run();
    const google = (await (await preload('mobile')).json()) as any;
    assert.deepEqual(google.images, []);
    assert.ok(Object.values(google.ads).every((ad) => ad === null));
    assert.equal((await store.db.prepare('SELECT count(*) n FROM ad_receipts').first())?.n, 0);
  } finally {
    store.close();
  }
});

test('成功预备的一条广告按位置/端隔离、15秒过期且只消费一次，打开不等新的统计请求', async (t) => {
  storePreparedAd('reward-supplies', 'mobile', exampleAd, 100);
  assert.equal(takePreparedAd('reward-root', 'mobile', 101), null);
  assert.equal(takePreparedAd('reward-supplies', 'desktop', 101), null);
  assert.equal(takePreparedAd('reward-supplies', 'mobile', 101)?.id, exampleAd.id);
  assert.equal(takePreparedAd('reward-supplies', 'mobile', 102), null);
  storePreparedAd('reward-supplies', 'mobile', exampleAd, 100);
  assert.equal(takePreparedAd('reward-supplies', 'mobile', 15_100), null);
  storePreparedAd('reward-supplies', 'desktop', exampleAd);
  t.mock.method(globalThis, 'fetch', async () =>
    assert.fail('prepared creative must not wait for fetch'),
  );
  const result = await requestHouseAd('reward-supplies', new AbortController().signal);
  assert.equal(result?.id, exampleAd.id);
  assert.equal(result?.preloaded, true);
  assert.equal(result?.receipt, undefined);
});

test('后台统计凭条仅为当前有效缓存创意签发，不能用campaign参数绕过零权重或其他广告位', async () => {
  const store = adStore(),
    env = adEnv(store),
    settings = defaultAdPlatformSettings();
  settings.provider = 'house';
  try {
    const campaigns = [
      {
        ...exampleAd,
        placements: ['reward-supplies'],
        desktopWeight: 1,
        mobileWeight: 0,
        mobileImageUrl: '',
      },
    ];
    await store.db
      .prepare('UPDATE ad_config SET campaigns=?,settings=? WHERE id=1')
      .bind(JSON.stringify(campaigns), JSON.stringify(settings))
      .run();
    const load = async (placement: string, device: string, campaign = exampleAd.id) =>
      adWorker.fetch(
        new Request(
          origin +
            '/ads/v1/ad?placement=' +
            placement +
            '&device=' +
            device +
            '&campaign=' +
            campaign,
          { headers: { Origin: origin } },
        ),
        env,
      );
    for (const [placement, device] of [
      ['reward-supplies', 'mobile'],
      ['revive', 'desktop'],
    ]) {
      const response = await load(placement, device);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ad: null });
    }
    const response = await load('reward-supplies', 'desktop');
    const body = (await response.json()) as any;
    assert.equal(body.ad.id, exampleAd.id);
    assert.ok(body.receipt);
    assert.equal((await load('reward-supplies', 'desktop', '../../bad')).status, 400);
    assert.equal((await store.db.prepare('SELECT count(*) n FROM ad_receipts').first())?.n, 1);
  } finally {
    store.close();
  }
});
