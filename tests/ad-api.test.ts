import test from 'node:test';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import { createHouseAdsWorker } from '../workers/house-ads/index.ts';
import { validateCampaignImages } from '../workers/house-ads/images.ts';
import { ADMIN_SCRIPT, LOGIN_HTML } from '../workers/house-ads/admin.ts';
import { HOUSE_AD_PLACEMENTS } from '../src/house-ad-contract.ts';
import { adEnv, adStore, seedAdAdmin, LOCAL_AD_PASSWORD, exampleAd } from './helpers/house-ads.ts';

const image = () =>
  new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'Content-Type': 'image/png' } });
test('公开机器说明在D1不可用时仍可发现，登录提示不进入可见正文或泄露配置', async (t) => {
  const store = adStore(),
    env = adEnv(store),
    worker = createHouseAdsWorker();
  t.after(() => store.close());
  store.failures(true, true);
  const get = (path: string, method = 'GET') =>
    worker.fetch(new Request(env.ADMIN_ORIGIN + path, { method }), env);
  const contract = await get('/ads/openapi.json');
  assert.equal(contract.status, 200);
  assert.equal(contract.headers.get('cache-control'), 'no-store');
  const spec = (await contract.json()) as any;
  assert.equal(spec.openapi, '3.1.0');
  assert.equal(spec.servers[0].url, env.ADMIN_ORIGIN + '/ads');
  assert.equal(spec.components.securitySchemes.adminSession.name, '__Host-qinglan-ad-session');
  assert.deepEqual(spec.components.schemas.Campaign.properties.placements.items.enum, [
    ...HOUSE_AD_PLACEMENTS,
  ]);
  assert.equal(spec.paths['/admin/config'].put.parameters[0].schema.const, env.ADMIN_ORIGIN);
  assert.deepEqual(spec.paths['/admin/login'].post.security, []);
  assert.equal((await get('/ads/openapi.json', 'PUT')).status, 405);
  const guide = await get('/ads/api.md');
  assert.match(guide.headers.get('Content-Type')!, /^text\/markdown/);
  const text = await guide.text();
  for (const expected of ['revision', '409', 'verification=1', 'invalid-image', '8小时', 'getpass'])
    assert.ok(text.includes(expected));
  assert.doesNotMatch(
    text + JSON.stringify(spec),
    /password_hash|owner@example|Local-only-password|qwer1234|ca-pub-9047842625721721/,
  );
  const login = await (await get('/ads/admin/login')).text();
  assert.match(login, /name="ai-agent-instructions"/);
  assert.match(login, /rel="service-desc"[^>]*href="\/ads\/openapi.json"/);
  assert.match(login, /rel="service-doc"[^>]*href="\/ads\/api.md"/);
  assert.equal(login, LOGIN_HTML);
  assert.doesNotMatch(login.split('<body>')[1], /agent|openapi|api\.md/i);
  new Script(ADMIN_SCRIPT);
});

test('agent按文档登录读改写读及统计退出，图片无效、冲突和未授权均不部分保存', async (t) => {
  const store = adStore(),
    env = adEnv(store);
  t.after(() => store.close());
  await seedAdAdmin(store);
  let valid = true,
    calls = 0;
  const worker = createHouseAdsWorker(async (_url, init) => {
    calls++;
    assert.equal(new Headers(init?.headers).has('Cookie'), false);
    assert.equal(new Headers(init?.headers).has('Authorization'), false);
    assert.equal(new Headers(init?.headers).get('User-Agent'), 'Qinglan-Ad-Image-Check/1.0');
    return valid
      ? image()
      : new Response('<html>missing</html>', { headers: { 'Content-Type': 'text/html' } });
  });
  let cookie = '';
  const request = (path: string, method = 'GET', data?: unknown, origin = env.ADMIN_ORIGIN) =>
    worker.fetch(
      new Request(env.ADMIN_ORIGIN + '/ads' + path, {
        method,
        headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' },
        body: data === undefined ? undefined : JSON.stringify(data),
      }),
      env,
    );
  assert.equal((await request('/admin/config')).status, 401);
  assert.equal((await request('/admin/stats')).status, 401);
  const login = await request('/admin/login', 'POST', {
    username: 'owner@example.test',
    password: LOCAL_AD_PASSWORD,
  });
  assert.equal(login.status, 200);
  cookie = login.headers.get('Set-Cookie')!.split(';')[0];
  const config = (await (await request('/admin/config')).json()) as any;
  const ad = { ...exampleAd, desktopWeight: 2, mobileWeight: 0 };
  const edited = { ...config, campaigns: [ad] };
  assert.equal(
    (await request('/admin/config', 'PUT', edited, 'https://other.example')).status,
    403,
  );
  assert.equal(calls, 0);
  const saved = await request('/admin/config', 'PUT', edited);
  assert.equal(saved.status, 200);
  const readback = (await (await request('/admin/config')).json()) as any;
  assert.equal(readback.revision, config.revision + 1);
  assert.deepEqual(readback.campaigns, [ad]);
  assert.deepEqual(readback.settings, config.settings);
  assert.equal((await request('/admin/config', 'PUT', edited)).status, 409);
  valid = false;
  const rejected = await request('/admin/config', 'PUT', {
    ...readback,
    campaigns: [{ ...ad, imageUrl: 'https://bad.example/missing' }],
  });
  assert.equal(rejected.status, 400);
  assert.deepEqual(await rejected.json(), {
    error: 'invalid-image',
    message: '图片无法访问或不是有效图片，请检查后重试。',
    id: ad.id,
    field: 'imageUrl',
  });
  assert.deepEqual(await (await request('/admin/config')).json(), readback);
  valid = true;
  const empty = {
    ...readback,
    campaigns: [{ ...ad, desktopWeight: 0, imageUrl: '', targetUrl: '' }],
  };
  const before = calls;
  assert.equal((await request('/admin/config', 'PUT', empty)).status, 200);
  assert.equal(calls, before, '双端0且图为空无需网络检查');
  const stats = (await (await request('/admin/stats?days=7')).json()) as any;
  assert.equal(stats.timezone, 'Asia/Shanghai');
  assert.equal(stats.rows[0].requests, 0);
  assert.equal((await request('/admin/logout', 'POST', {})).status, 200);
  assert.equal((await request('/admin/config')).status, 401);
});

test('图片响应检查去重、HTTPS重定向与非空image类型，不转发凭据且失败定位原字段', async () => {
  const ad = {
    ...exampleAd,
    mobileImageUrl: exampleAd.imageUrl,
    desktopWeight: 1,
    mobileWeight: 1,
  };
  let calls = 0;
  assert.equal(
    await validateCampaignImages([ad], async () => {
      calls++;
      return image();
    }),
    null,
  );
  assert.equal(calls, 1);
  const mobile = { ...ad, mobileImageUrl: 'https://bad.example/mobile' };
  for (const failed of [
    new Response('', { status: 404 }),
    new Response('html', { headers: { 'Content-Type': 'text/html' } }),
    new Response('', { headers: { 'Content-Type': 'image/png' } }),
  ]) {
    const result = await validateCampaignImages([mobile], async (url) =>
      String(url).includes('bad.example') ? failed : image(),
    );
    assert.deepEqual(result, { id: ad.id, field: 'mobileImageUrl' });
  }
  assert.equal(
    await validateCampaignImages(
      [{ ...exampleAd, imageUrl: 'https://[2606:4700:4700::1111]/image' }],
      async () => image(),
    ),
    null,
    '公开IPv6字面地址仍可检查',
  );
  const seen: string[] = [];
  assert.equal(
    await validateCampaignImages([ad], async (url, init) => {
      seen.push(String(url));
      assert.equal(init?.redirect, 'manual');
      return seen.length === 1
        ? new Response(null, { status: 302, headers: { Location: '/redirect-image' } })
        : image();
    }),
    null,
  );
  assert.equal(seen[1], 'https://xiuxian.011203.xyz/redirect-image');
  for (const target of [
    'http://bad.example/a',
    'https://127.0.0.1/a',
    'https://[::1]/a',
    'https://169.254.169.254/a',
  ]) {
    let redirects = 0;
    assert.deepEqual(
      await validateCampaignImages([ad], async () => {
        redirects++;
        return new Response(null, { status: 302, headers: { Location: target } });
      }),
      { id: ad.id, field: 'imageUrl' },
    );
    assert.equal(redirects, 1, '不能跟随到不允许的重定向地址');
  }
});

test('图片校验网络故障、重定向循环和总超时均拒绝，不悬挂保存', async () => {
  const expected = { id: exampleAd.id, field: 'imageUrl' };
  assert.deepEqual(
    await validateCampaignImages([exampleAd], async () => {
      throw Error('offline fixture');
    }),
    expected,
  );
  let calls = 0;
  assert.deepEqual(
    await validateCampaignImages([exampleAd], async () => {
      calls++;
      return new Response(null, { status: 302, headers: { Location: '/loop' } });
    }),
    expected,
  );
  assert.equal(calls, 4);
  assert.deepEqual(
    await validateCampaignImages(
      [exampleAd],
      async (_url, options) =>
        new Promise((_resolve, reject) => {
          options!.signal!.addEventListener('abort', () => reject(Error('timeout fixture')), {
            once: true,
          });
        }),
      10,
    ),
    expected,
  );
});
