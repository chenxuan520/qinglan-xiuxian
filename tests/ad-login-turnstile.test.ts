import test from 'node:test';
import assert from 'node:assert/strict';
import { createHouseAdsWorker } from '../workers/house-ads/index.ts';
import { adEnv, adStore, seedAdAdmin, LOCAL_AD_PASSWORD } from './helpers/house-ads.ts';

const origin = 'https://xiuxian.011203.xyz';
async function fixture(t: any) {
  const store = adStore(),
    env = adEnv(store);
  await seedAdAdmin(store);
  t.after(() => store.close());
  let serial = 0,
    calls = 0;
  const used = new Set<string>();
  const verify: typeof fetch = async (url, options) => {
    calls++;
    assert.equal(String(url), 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
    assert.equal(options?.method, 'POST');
    assert.equal(new Headers(options?.headers).has('Cookie'), false);
    assert.equal(new Headers(options?.headers).has('Authorization'), false);
    const data = new URLSearchParams(String(options?.body));
    assert.equal(data.get('secret'), env.TURNSTILE_SECRET);
    const token = data.get('response')!;
    const fresh = !used.has(token);
    used.add(token);
    return Response.json({
      success: fresh,
      action: 'ad_admin_login',
      hostname: 'xiuxian.011203.xyz',
      'error-codes': fresh ? [] : ['timeout-or-duplicate'],
    });
  };
  const worker = createHouseAdsWorker(undefined, verify);
  const login = (patch: Record<string, unknown> = {}, ip = '198.51.100.5') =>
    worker.fetch(
      new Request(origin + '/ads/admin/login', {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
        body: JSON.stringify({
          username: 'owner@example.test',
          password: LOCAL_AD_PASSWORD,
          'cf-turnstile-response': 'local-proof-' + ++serial,
          ...patch,
        }),
      }),
      env,
    );
  return { store, env, worker, verify, login, calls: () => calls };
}

test('缺少/超长验证结果在D1和密码前拒绝；缺配置失败关闭，不泄露secret或原始token', async (t) => {
  const f = await fixture(t);
  f.store.failures(true, true);
  for (const token of [undefined, '', 'x'.repeat(2049)]) {
    const r = await f.login({ 'cf-turnstile-response': token });
    assert.equal(r.status, 403);
    assert.doesNotMatch(await r.text(), /synthetic|local-proof|secret/i);
  }
  assert.equal(f.calls(), 0);
  f.env.TURNSTILE_SECRET = '';
  assert.equal((await f.login()).status, 503);
  assert.equal(f.calls(), 0);
});

test('只有success严格为true、action和精确站点同时匹配才验证密码；错误站点/动作/过期等不创建会话或限流记录', async (t) => {
  const f = await fixture(t);
  for (const result of [
    { success: 'true', action: 'ad_admin_login', hostname: 'xiuxian.011203.xyz' },
    { success: true, action: 'other', hostname: 'xiuxian.011203.xyz' },
    { success: true, action: 'ad_admin_login', hostname: 'evil.xiuxian.011203.xyz' },
    { success: true, action: 'ad_admin_login', hostname: 'localhost' },
    { success: false, 'error-codes': ['timeout-or-duplicate'] },
  ]) {
    const worker = createHouseAdsWorker(undefined, async () => Response.json(result));
    const r = await worker.fetch(
      new Request(origin + '/ads/admin/login', {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'owner@example.test',
          password: LOCAL_AD_PASSWORD,
          'cf-turnstile-response': 'synthetic',
        }),
      }),
      f.env,
    );
    assert.equal(r.status, 403);
    assert.equal(r.headers.has('set-cookie'), false);
  }
  assert.equal((await f.store.db.prepare('SELECT count(*) n FROM ad_sessions').first())?.n, 0);
  assert.equal((await f.store.db.prepare('SELECT count(*) n FROM ad_login_limits').first())?.n, 0);
});

test('验证接口网络故障、HTTP失败、损坏/超大响应均拒绝登录且不访问D1', async (t) => {
  const f = await fixture(t);
  f.store.failures(true, true);
  for (const verifier of [
    async () => {
      throw Error('private upstream error');
    },
    async () => new Response('', { status: 503 }),
    async () => new Response('{bad'),
    async () => new Response(' '.repeat(4097)),
  ]) {
    const worker = createHouseAdsWorker(undefined, verifier);
    const response = await worker.fetch(
      new Request(origin + '/ads/admin/login', {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'owner@example.test',
          password: LOCAL_AD_PASSWORD,
          'cf-turnstile-response': 'synthetic',
        }),
      }),
      f.env,
    );
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /private|secret|token/);
  }
});

test('完整2048字符验证token合法，真实登录创建Cookie；同token重放不产生第二会话，原会话与退出仍正常', async (t) => {
  const f = await fixture(t),
    token = 'x'.repeat(2048);
  const first = await f.login({ 'cf-turnstile-response': token });
  assert.equal(first.status, 200);
  const cookie = first.headers.get('set-cookie')!.split(';')[0];
  const second = await f.login({ 'cf-turnstile-response': token });
  assert.equal(second.status, 403);
  assert.equal((await f.store.db.prepare('SELECT count(*) n FROM ad_sessions').first())?.n, 1);
  const config = () =>
    f.worker.fetch(
      new Request(origin + '/ads/admin/config', { headers: { Cookie: cookie } }),
      f.env,
    );
  assert.equal((await config()).status, 200);
  assert.equal(
    (
      await f.worker.fetch(
        new Request(origin + '/ads/admin/logout', {
          method: 'POST',
          headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: cookie },
          body: '{}',
        }),
        f.env,
      )
    ).status,
    200,
  );
  assert.equal((await config()).status, 401);
});

test('取消全局100次限制：旧global已满也不影响101个不同来源合法登录，成功不占失败额度', async (t) => {
  const f = await fixture(t);
  await f.store.db
    .prepare("INSERT INTO ad_login_limits (id,attempts,resets) VALUES ('global',100,?)")
    .bind(Math.floor(Date.now() / 1000) + 900)
    .run();
  for (let i = 0; i < 101; i++)
    assert.equal((await f.login({}, '198.51.100.' + (i + 1))).status, 200);
  assert.equal(
    (
      await f.store.db
        .prepare("SELECT sum(attempts) n FROM ad_login_limits WHERE id!='global'")
        .first()
    )?.n,
    0,
  );
  assert.equal(
    (await f.store.db.prepare("SELECT attempts FROM ad_login_limits WHERE id='global'").first())
      ?.attempts,
    100,
  );
  assert.equal((await f.store.db.prepare('SELECT count(*) n FROM ad_sessions').first())?.n, 101);
});

test('按来源失败与并发名额仍原子：12并发错误密码只放10次，另一来源不受影响；合法重试不消耗额度', async (t) => {
  const f = await fixture(t);
  const results = await Promise.all(
    Array.from({ length: 12 }, () => f.login({ password: 'wrong' })),
  );
  assert.equal(results.filter((r) => r.status === 401).length, 10);
  assert.equal(results.filter((r) => r.status === 429).length, 2);
  assert.equal((await f.login({}, '203.0.113.8')).status, 200);
  for (let i = 0; i < 11; i++) assert.equal((await f.login({}, '203.0.113.8')).status, 200);
});

test('登录响应独立CSP允许官方脚本与iframe，普通后台不扩大；缺配置不能显示假验证成功', async (t) => {
  const f = await fixture(t);
  const page = await f.worker.fetch(new Request(origin + '/ads/admin/'), f.env),
    html = await page.text(),
    csp = page.headers.get('Content-Security-Policy')!;
  assert.match(csp, /script-src 'self' https:\/\/challenges.cloudflare.com/);
  assert.match(csp, /frame-src https:\/\/challenges.cloudflare.com/);
  assert.ok(html.includes(f.env.TURNSTILE_SITE_KEY));
  assert.ok(!html.includes(f.env.TURNSTILE_SECRET));
  assert.match(html, /<button[^>]*type="submit"[^>]*disabled/);
  assert.equal(
    (await f.worker.fetch(new Request(origin + '/ads/admin/config'), f.env)).status,
    401,
  );
});
