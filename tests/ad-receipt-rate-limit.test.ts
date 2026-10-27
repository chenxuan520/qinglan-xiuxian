import test from 'node:test';
import assert from 'node:assert/strict';
import { createHouseAdsWorker } from '../workers/house-ads/index.ts';
import { adMetrics } from '../workers/house-ads/metrics.ts';
import { HOUSE_AD_PLACEMENTS } from '../src/house-ad-contract.ts';
import { adStore, adEnv, exampleAd } from './helpers/house-ads.ts';

const worker = createHouseAdsWorker();
async function fixture(t: { after(fn: () => void): void }, maximum = 2) {
  const store = adStore(),
    env = adEnv(store),
    keys: string[] = [],
    counts = new Map<string, number>();
  t.after(() => store.close());
  await store.db
    .prepare('UPDATE ad_config SET campaigns = ? WHERE id = 1')
    .bind(JSON.stringify([exampleAd]))
    .run();
  env.AD_RECEIPT_LIMITER = {
    async limit({ key }) {
      keys.push(key);
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return { success: n <= maximum };
    },
  };
  const request = (
    path: string,
    headers: Record<string, string> = {},
    method = 'GET',
    body?: unknown,
    base = env.ADMIN_ORIGIN,
  ) =>
    worker.fetch(
      new Request(base + path, {
        method,
        headers: { Origin: env.ADMIN_ORIGIN, 'CF-Connecting-IP': '198.51.100.8', ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      env,
    );
  const provider = (value: string) =>
    store.db
      .prepare("UPDATE ad_config SET settings = json_set(settings, '$.provider', ?) WHERE id = 1")
      .bind(value)
      .run();
  return { store, env, keys, request, provider };
}

test('同一IP的自营/Google、四广告位、两端、验证及不同域名请求共用签发额度，超限仍200返回供给', async (t) => {
  const { store, request, provider, keys } = await fixture(t);
  const first = await request('/api/reward-content/creative?placement=revive&device=desktop');
  assert.equal(first.status, 200);
  const house = (await first.json()) as any;
  assert.equal(house.ad.id, exampleAd.id);
  assert.ok(house.receipt);
  await provider('adsense');
  const second = await request('/api/reward-content/config?placement=reward-root');
  assert.equal(second.status, 200);
  const google = (await second.json()) as any;
  assert.equal(google.settings.provider, 'adsense');
  assert.ok(google.receipt);
  for (const placement of HOUSE_AD_PLACEMENTS) {
    const limited = await request(
      '/api/reward-content/config?placement=' + placement + '&verification=1',
    );
    assert.equal(limited.status, 200);
    assert.deepEqual(await limited.json(), { settings: google.settings });
  }
  await provider('house');
  for (const placement of HOUSE_AD_PLACEMENTS)
    for (const device of ['desktop', 'mobile']) {
      const limited = await request(
        '/api/reward-content/creative?placement=' +
          placement +
          '&device=' +
          device +
          '&verification=1',
        {},
        'GET',
        undefined,
        'https://qinglan-ads.011203.xyz',
      );
      assert.equal(limited.status, 200);
      assert.deepEqual(await limited.json(), { ad: house.ad });
    }
  assert.equal(new Set(keys).size, 1);
  assert.match(keys[0], /^qinglan-house-ads:receipt:v1:[a-f0-9]{64}$/);
  assert.equal(keys[0].includes('198.51.100.8'), false);
  const report = await adMetrics(store.db as any, 1);
  assert.equal(
    report.rows.reduce((n, row) => n + row.requests, 0),
    2,
  );
});

test('只按边缘IP区分额度，不信任X-Forwarded-For；来源拒绝和无实际供给不消耗签发额度', async (t) => {
  const { request, provider, keys } = await fixture(t, 1);
  assert.ok(
    ((await (await request('/api/reward-content/creative?placement=revive')).json()) as any)
      .receipt,
  );
  assert.equal(
    (
      (await (
        await request('/api/reward-content/creative?placement=revive', {
          'X-Forwarded-For': '203.0.113.9',
        })
      ).json()) as any
    ).receipt,
    undefined,
  );
  assert.ok(
    (
      (await (
        await request('/api/reward-content/creative?placement=revive', {
          'CF-Connecting-IP': '203.0.113.9',
        })
      ).json()) as any
    ).receipt,
  );
  assert.equal(new Set(keys).size, 2);
  const count = keys.length;
  assert.equal(
    (
      await request('/api/reward-content/creative?placement=revive', {
        Origin: 'https://untrusted.example',
      })
    ).status,
    403,
  );
  await provider('placeholder');
  assert.deepEqual(await (await request('/api/reward-content/creative?placement=revive')).json(), {
    ad: null,
  });
  await provider('adsense');
  assert.equal((await request('/api/reward-content/config')).status, 200);
  assert.equal(keys.length, count);
});

test('频控拒绝、缺可信IP/绑定及异常均不新增任何D1写入，广告与Google参数照常返回', async (t) => {
  const { store, env, request, provider } = await fixture(t);
  let writes = 0;
  const original = store.db.prepare.bind(store.db);
  t.mock.method(store.db, 'prepare', (sql: string) => {
    if (/^\s*(INSERT|UPDATE|DELETE)/i.test(sql)) writes++;
    return original(sql);
  });
  for (const mode of ['denied', 'throw', 'missing-binding', 'missing-ip', 'empty-ip', 'long-ip']) {
    env.AD_RECEIPT_LIMITER = {
      async limit() {
        if (mode === 'throw') throw Error('rate fixture');
        return { success: false };
      },
    };
    if (mode === 'missing-binding') delete (env as any).AD_RECEIPT_LIMITER;
    const headers: Record<string, string> = { Origin: env.ADMIN_ORIGIN };
    if (mode !== 'missing-ip')
      headers['CF-Connecting-IP'] =
        mode === 'empty-ip' ? '' : mode === 'long-ip' ? 'a'.repeat(65) : '198.51.100.8';
    const result = await worker.fetch(
      new Request(env.ADMIN_ORIGIN + '/api/reward-content/creative?placement=revive', { headers }),
      env,
    );
    assert.equal(result.status, 200);
    const body = (await result.json()) as any;
    assert.equal(body.ad.id, exampleAd.id);
    assert.equal(body.receipt, undefined);
  }
  assert.equal(writes, 0);
  await provider('adsense');
  writes = 0;
  const google = await request('/api/reward-content/config?placement=revive');
  assert.equal(google.status, 200);
  const settings = (await google.json()) as any;
  assert.equal(settings.settings.provider, 'adsense');
  assert.equal(settings.receipt, undefined);
  assert.equal(writes, 0);
});

test('已签发凭条在触发限流后仍接受真实事件，重放不重复累计且无需重新签发', async (t) => {
  const { store, request } = await fixture(t, 1);
  const delivery = (await (
    await request('/api/reward-content/creative?placement=revive')
  ).json()) as any;
  assert.ok(delivery.receipt);
  assert.equal(
    ((await (await request('/api/reward-content/creative?placement=revive')).json()) as any)
      .receipt,
    undefined,
  );
  for (const flags of [1, 5, 13, 13]) {
    const event = await request(
      '/api/reward-content/event',
      { 'Content-Type': 'application/json' },
      'POST',
      {
        receipt: delivery.receipt,
        flags,
      },
    );
    assert.equal(event.status, 204);
  }
  assert.deepEqual(
    (await adMetrics(store.db as any, 1)).rows.map((row) => ({ ...row })),
    [
      {
        id: exampleAd.id,
        name: exampleAd.name,
        provider: 'house',
        requests: 1,
        shown: 1,
        clicked: 0,
        watched: 1,
        claimed: 1,
      },
    ],
  );
});

test('并发签发全部先等待同一频控决策；验证请求也使用额度但不进入运营汇总', async (t) => {
  const { store, request, keys } = await fixture(t, 2);
  const responses = await Promise.all(
    Array.from({ length: 12 }, () =>
      request('/api/reward-content/creative?placement=revive&verification=1'),
    ),
  );
  assert.ok(responses.every((r) => r.status === 200));
  const bodies = (await Promise.all(responses.map((r) => r.json()))) as any[];
  assert.equal(bodies.filter((b) => b.receipt).length, 2);
  assert.ok(bodies.every((b) => b.ad.id === exampleAd.id));
  assert.equal(keys.length, 12);
  assert.deepEqual(
    (await adMetrics(store.db as any, 1)).rows.map((row) => ({ ...row })),
    [],
  );
});
