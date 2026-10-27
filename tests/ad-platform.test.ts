import test from 'node:test';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import { weightedHouseAd, validHouseAdConfig } from '../src/house-ad-contract.ts';
import { defaultAdPlatformSettings, validAdPlatformSettings } from '../src/ad-platform-contract.ts';
import { adReceiptId } from '../src/ad-metrics-contract.ts';
import { adTracker } from '../src/ad-metrics.ts';
import { adMetrics, adDay, issueAdReceipt, recordAdMetrics } from '../workers/house-ads/metrics.ts';
import { configuredAdProvider } from '../src/ads-platform.ts';
import worker from '../workers/house-ads/index.ts';
import seller from '../workers/ads-verify/index.ts';
import { ADMIN_HTML, LOGIN_HTML, ADMIN_SCRIPT } from '../workers/house-ads/admin.ts';
import { adStore, adEnv, adSessionFixture, exampleAd } from './helpers/house-ads.ts';

const GOOGLE_CLIENT = 'ca-pub-1234567890123456';
function settings(provider: 'house' | 'adsense' | 'placeholder' = 'house') {
  const s = defaultAdPlatformSettings();
  s.provider = provider;
  s.adsense.client = GOOGLE_CLIENT;
  return s;
}
function api(
  env: ReturnType<typeof adEnv>,
  path: string,
  cookie = '',
  method = 'GET',
  body?: unknown,
  origin = env.ADMIN_ORIGIN,
) {
  return worker.fetch(
    new Request(env.ADMIN_ORIGIN + path, {
      method,
      headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
  );
}
async function seed(
  store: ReturnType<typeof adStore>,
  campaigns: unknown[] = [exampleAd],
  config = settings(),
) {
  await store.db
    .prepare('UPDATE ad_config SET campaigns = ?, settings = ? WHERE id = 1')
    .bind(JSON.stringify(campaigns), JSON.stringify(config))
    .run();
}

test('同广告位按完整整数票权重抽取，旧广告默认1，禁用与其他位置不参与', (t) => {
  const a = { ...exampleAd, id: 'a', weight: 2 },
    b = { ...exampleAd, id: 'b', weight: 3 },
    old = { ...exampleAd, id: 'old' },
    disabled = { ...exampleAd, id: 'disabled', weight: 1000, enabled: false },
    other = { ...exampleAd, id: 'other', weight: 1000, placements: ['lifespan'] as any };
  const ads = [a, b, old, disabled, other],
    counts: Record<string, number> = {};
  for (let n = 0; n < 6; n++) {
    const id = weightedHouseAd(ads as any, 'revive', n)!.id;
    counts[id] = (counts[id] ?? 0) + 1;
  }
  assert.deepEqual(counts, { a: 2, b: 3, old: 1 });
  assert.equal(weightedHouseAd([], 'revive'), null);
  assert.throws(() => weightedHouseAd(ads as any, 'revive', 6));
  for (const weight of [0, -1, 1.5, 1001, Infinity, NaN, '5'])
    assert.equal(validHouseAdConfig({ revision: 0, campaigns: [{ ...exampleAd, weight }] }), false);
  assert.equal(
    validHouseAdConfig({ revision: 0, campaigns: [{ ...exampleAd, weight: 1000 }] }),
    true,
  );
  let calls = 0;
  t.mock.method(crypto, 'getRandomValues', (buffer: any) => {
    buffer[0] = calls++ === 0 ? 0xffffffff : 4;
    return buffer;
  });
  assert.equal(weightedHouseAd([a, b] as any, 'revive')!.id, 'b');
  assert.equal(calls, 2, '尾部余数被拒绝，不能偏向第一张票');
});

test('平台配置仅接受真实Google字段与四个广告位，空client不能启用Google', () => {
  assert.equal(validAdPlatformSettings(defaultAdPlatformSettings()), true);
  assert.equal(validAdPlatformSettings(settings('adsense')), true);
  for (const patch of [
    { provider: 'other' },
    { provider: 1 },
    { secret: 'no' },
    { adsense: { ...settings().adsense, client: 'pub-123' } },
    { adsense: { ...settings().adsense, testMode: 'on' } },
    {
      adsense: {
        ...settings().adsense,
        placements: { ...settings().adsense.placements, revive: '<script>' },
      },
    },
  ])
    assert.equal(validAdPlatformSettings({ ...settings(), ...patch }), false);
  assert.equal(
    validAdPlatformSettings({ ...defaultAdPlatformSettings(), provider: 'adsense' }),
    false,
  );
  for (const html of [ADMIN_HTML, LOGIN_HTML])
    assert.match(
      html,
      /<link rel="icon" type="image\/svg\+xml" href="https:\/\/xiuxian\.011203\.xyz\/favicon\.svg">/,
    );
  new Script(ADMIN_SCRIPT);
});

test('同一配置源驱动管理端、Google选择和两份ads.txt，旧格式保存不清空Google配置', async (t) => {
  const store = adStore(),
    env = adEnv(store),
    fixture = await adSessionFixture(store),
    cookie = await fixture.token();
  t.after(() => store.close());
  const s = settings('adsense');
  s.adsense.testMode = true;
  s.adsense.placements.revive = 'owner-revive';
  assert.equal(
    (
      await api(env, '/ads/admin/config', cookie, 'PUT', {
        revision: 0,
        campaigns: [exampleAd],
        settings: s,
      })
    ).status,
    200,
  );
  const pub = await (await api(env, '/ads/v1/settings')).json();
  assert.deepEqual(pub, { settings: s });
  assert.deepEqual(await (await api(env, '/ads/v1/ad?placement=revive')).json(), { ad: null });
  const line = 'google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n';
  assert.equal(await (await api(env, '/ads.txt')).text(), line);
  assert.equal(
    await (await seller.fetch(new Request('https://011203.xyz/ads.txt'), env)).text(),
    line,
  );
  assert.equal(
    (await api(env, '/ads/admin/config', cookie, 'PUT', { revision: 1, campaigns: [] })).status,
    200,
  );
  assert.deepEqual(
    ((await (await api(env, '/ads/admin/config', cookie)).json()) as any).settings,
    s,
  );
  assert.equal(
    (
      await api(env, '/ads/admin/config', cookie, 'PUT', {
        revision: 2,
        campaigns: [],
        settings: { ...s, adsense: { ...s.adsense, client: 'bad' } },
      })
    ).status,
    400,
  );
  assert.equal(store.value()!.revision, 2);
});

test('真实SQLite凭条固定广告归属，并发乱序重放仅累计一次，统计未登录不可见', async (t) => {
  const store = adStore(),
    env = adEnv(store),
    fixture = await adSessionFixture(store),
    cookie = await fixture.token();
  t.after(() => store.close());
  await seed(store);
  assert.equal((await api(env, '/ads/admin/stats')).status, 401);
  const delivery = (await (await api(env, '/ads/v1/ad?placement=revive')).json()) as any;
  assert.ok(adReceiptId(delivery.receipt));
  assert.deepEqual(Object.keys(delivery).sort(), ['ad', 'receipt']);
  assert.equal(delivery.ad.weight, undefined);
  const before = (await (await api(env, '/ads/admin/stats', cookie)).json()) as any;
  assert.equal(before.rows[0].requests, 1);
  assert.equal(before.rows[0].shown, 0);
  const calls = await Promise.all(
    [13, 1, 3, 5, 15, 3, 15, 13].map((flags) =>
      api(env, '/ads/v1/event', '', 'POST', { receipt: delivery.receipt, flags }),
    ),
  );
  assert.ok(calls.every((r) => r.status === 204));
  const report = (await (await api(env, '/ads/admin/stats', cookie)).json()) as any;
  assert.deepEqual(report.rows, [
    {
      id: exampleAd.id,
      provider: 'house',
      name: exampleAd.name,
      requests: 1,
      shown: 1,
      clicked: 1,
      watched: 1,
      claimed: 1,
      archived: false,
    },
  ]);
  for (const body of [
    { receipt: delivery.receipt, flags: 8 },
    { receipt: delivery.receipt, flags: 16 },
    { receipt: delivery.receipt, flags: 1, ad_id: 'other' },
    { receipt: 'bad', flags: 1 },
  ])
    assert.equal((await api(env, '/ads/v1/event', '', 'POST', body)).status, 400);
  assert.equal(
    (
      await api(
        env,
        '/ads/v1/event',
        '',
        'POST',
        { receipt: delivery.receipt, flags: 15 },
        'https://evil.test',
      )
    ).status,
    403,
  );
  assert.equal((await api(env, '/ads/admin/stats?days=999', cookie)).status, 400);
  const next = { ...exampleAd, id: 'new-ad', name: '同名新广告' };
  assert.equal(
    (await api(env, '/ads/admin/config', cookie, 'PUT', { revision: 0, campaigns: [next] })).status,
    200,
  );
  const archived = ((await (await api(env, '/ads/admin/stats', cookie)).json()) as any).rows;
  assert.equal(archived.find((r: any) => r.id === exampleAd.id).archived, true);
  assert.equal(archived.find((r: any) => r.id === next.id).requests, 0);
});

test('凭条来源、期限、日期和verification隔离，Google不伪造点击，过期清理保留日报', async (t) => {
  const store = adStore(),
    db = store.db as any;
  t.after(() => store.close());
  const origin = 'https://xiuxian.011203.xyz',
    now = Date.parse('2026-10-27T15:59:59Z');
  assert.equal(adDay(now), '2026-10-27');
  assert.equal(adDay(now + 1000), '2026-10-28');
  const id = await issueAdReceipt(db, exampleAd, 'house', 'revive', origin, now);
  await recordAdMetrics(db, { receipt: id, flags: 15 }, 'https://chenxuan520.github.io', now);
  assert.equal((await adMetrics(db, 1, now)).rows[0].shown, 0);
  await recordAdMetrics(db, { receipt: id, flags: 15 }, origin, now + 86400001);
  assert.equal((await adMetrics(db, 1, now)).rows[0].shown, 0);
  await recordAdMetrics(db, { receipt: id, flags: 5 }, origin, now + 1);
  assert.equal((await adMetrics(db, 1, now)).rows[0].watched, 1);
  const verification = await issueAdReceipt(
    db,
    { ...exampleAd, id: 'verification' },
    'house',
    'revive',
    origin,
    now,
    true,
  );
  await recordAdMetrics(db, { receipt: verification, flags: 15 }, origin, now + 1);
  assert.equal(
    (await adMetrics(db, 1, now)).rows.some((r) => r.id === 'verification'),
    false,
  );
  const google = await issueAdReceipt(
    db,
    { id: 'google-adsense', name: 'Google AdSense' },
    'adsense',
    'revive',
    origin,
    now,
  );
  await recordAdMetrics(db, { receipt: google, flags: 15 }, origin, now + 1);
  assert.equal((await adMetrics(db, 1, now)).rows.find((r) => r.provider === 'adsense')!.shown, 0);
  await recordAdMetrics(db, { receipt: google, flags: 13 }, origin, now + 2);
  assert.equal(
    (await adMetrics(db, 1, now)).rows.find((r) => r.provider === 'adsense')!.claimed,
    1,
  );
  await issueAdReceipt(
    db,
    { ...exampleAd, id: 'next-day' },
    'house',
    'lifespan',
    origin,
    now + 2 * 86400000,
  );
  assert.equal(
    (await adMetrics(db, 7, now + 2 * 86400000)).rows.find((r) => r.id === exampleAd.id)!.watched,
    1,
  );
  assert.equal(
    (await adMetrics(db, 1, now + 2 * 86400000)).rows.some((r) => r.id === exampleAd.id),
    false,
  );
});

test('预览来源不污染正式统计，统计写故障不阻止返回真实图片', async (t) => {
  const store = adStore(),
    env = adEnv(store);
  t.after(() => store.close());
  await seed(store);
  const local = (await (
    await api(env, '/ads/v1/ad?placement=revive', '', 'GET', undefined, 'http://localhost:5173')
  ).json()) as any;
  assert.equal(local.ad.id, exampleAd.id);
  assert.equal(local.receipt, undefined);
  const verification = (await (
    await api(env, '/ads/v1/ad?placement=revive&verification=1')
  ).json()) as any;
  assert.ok(adReceiptId(verification.receipt));
  assert.equal((await adMetrics(env.DB, 7)).rows.length, 0);
  store.failures(false, true);
  const fallback = (await (await api(env, '/ads/v1/ad?placement=revive')).json()) as any;
  assert.equal(fallback.ad.id, exampleAd.id);
  assert.equal(fallback.receipt, undefined);
});

test('客户端按实际事件累计快照，重复事件零请求、点击不带Cookie，打点失败不抛异常', async () => {
  const calls: any[] = [];
  const track = adTracker(crypto.randomUUID(), async (input, options) => {
    calls.push({ input: String(input), options, body: JSON.parse(options!.body as string) });
    return new Response(null, { status: 204 });
  });
  assert.equal(calls.length, 0);
  track('shown');
  track('shown');
  track('clicked');
  track('watched');
  track('claimed');
  track('claimed');
  assert.deepEqual(
    calls.map((c) => c.body.flags),
    [1, 3, 7, 15],
  );
  assert.ok(
    calls.every(
      (c) =>
        c.options.credentials === 'omit' &&
        c.options.keepalive === true &&
        c.input === 'https://xiuxian.011203.xyz/ads/v1/event',
    ),
  );
  assert.ok(calls.every((c) => Object.keys(c.body).sort().join(',') === 'flags,receipt'));
  assert.doesNotThrow(() =>
    adTracker(crypto.randomUUID(), (() => {
      throw Error('network fixture');
    }) as any)('shown'),
  );
  adTracker('invalid', async () => assert.fail('invalid receipt cannot report'))('claimed');
});

test('运行时配置快照只选择启用的平台，取消后的配置不触发SDK，错误配置拒绝', async () => {
  const signal = new AbortController();
  let calls = 0;
  const provider = await configuredAdProvider('revive', signal.signal, async (input, options) => {
    calls++;
    assert.equal(new URL(String(input)).searchParams.get('placement'), 'revive');
    assert.equal(options!.credentials, 'omit');
    return Response.json({ settings: settings('house') });
  });
  assert.equal(provider!.name, 'house');
  assert.equal(calls, 1);
  assert.equal(
    await configuredAdProvider('revive', signal.signal, async () =>
      Response.json({ settings: settings('placeholder') }),
    ),
    null,
  );
  assert.equal(
    await configuredAdProvider('revive', signal.signal, async () =>
      Response.json({ settings: { provider: 'adsense', adsense: { client: 'bad' } } }),
    ),
    null,
  );
  signal.abort();
  assert.equal(
    await configuredAdProvider('revive', signal.signal, async () =>
      assert.fail('cancelled selection cannot fetch'),
    ),
    null,
  );
});
