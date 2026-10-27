import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adEnv,
  adStore,
  adSessionFixture,
  adWorker,
  exampleAd,
  LOCAL_AD_PASSWORD,
} from './helpers/house-ads.ts';
import { createHouseAdsWorker } from '../workers/house-ads/index.ts';
import { createContext, runInContext } from 'node:vm';
import { ADMIN_SCRIPT } from '../workers/house-ads/admin.ts';

async function fixture(t: { after(fn: () => void): void }) {
  const store = adStore(),
    env = adEnv(store),
    session = await adSessionFixture(store);
  t.after(() => store.close());
  const cookie = await session.token();
  const call = (
    path: string,
    method = 'GET',
    body?: unknown,
    headers: Record<string, string> = {},
  ) =>
    adWorker.fetch(
      new Request(env.ADMIN_ORIGIN + '/ads/admin/' + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      env,
    );
  const owner = (path: string, method = 'GET', body?: unknown) =>
    call(path, method, body, { Cookie: cookie, Origin: env.ADMIN_ORIGIN });
  const create = async (currentId: string | null = null) => {
    const response = await owner('access-key', 'POST', { currentId, revoke: false });
    assert.equal(response.status, 200);
    return (await response.json()) as any;
  };
  return { store, env, cookie, call, owner, create };
}

test('账号生成一次性Key、hash存储、匿名读取拒绝，机器无Cookie/Origin直接读改写读', async (t) => {
  const { store, call, owner, create } = await fixture(t);
  assert.equal((await call('access-key')).status, 401);
  const created = await create();
  assert.ok(/^qlak_[a-f0-9]{64}$/.test(created.accessKey));
  const row = await store.db.prepare('SELECT * FROM ad_access_keys').first();
  assert.ok(!JSON.stringify(row).includes(created.accessKey));
  const metadata: any = await (await owner('access-key')).json();
  assert.deepEqual(metadata, { key: created.key });
  assert.equal(metadata.accessKey, undefined);
  const auth = { Authorization: 'Bearer ' + created.accessKey };
  const before: any = await (await call('config', 'GET', undefined, auth)).json();
  const edited = { ...before, campaigns: [exampleAd] };
  assert.equal((await call('config', 'PUT', edited, auth)).status, 200);
  const read: any = await (await call('config', 'GET', undefined, auth)).json();
  assert.deepEqual(read.campaigns, [exampleAd]);
  assert.equal(read.revision, before.revision + 1);
  assert.equal((await call('config', 'PUT', edited, auth)).status, 409);
  for (const path of ['stats?days=7', 'diagnostics?days=1'])
    assert.equal((await call(path, 'GET', undefined, auth)).status, 200);
});

test('Bearer不回落Cookie、不允许管理密钥/改密/登录，跨Origin拒绝，Cookie写仍须同源', async (t) => {
  const { call, owner, create, cookie, env } = await fixture(t),
    created = await create();
  const auth = { Authorization: 'Bearer ' + created.accessKey, Cookie: cookie };
  for (const [path, method] of [
    ['access-key', 'GET'],
    ['access-key', 'POST'],
    ['password', 'POST'],
    ['logout', 'POST'],
    ['login', 'POST'],
    ['', 'GET'],
  ])
    assert.equal(
      (await call(path, method, method === 'POST' ? {} : undefined, auth)).status,
      403,
      path,
    );
  assert.equal(
    (await call('config', 'GET', undefined, { Cookie: cookie, Authorization: 'Bearer invalid' }))
      .status,
    401,
  );
  assert.equal(
    (await call('config', 'GET', undefined, { ...auth, Origin: 'https://evil.test' })).status,
    403,
  );
  assert.equal(
    (
      await call(
        'access-key',
        'POST',
        { currentId: created.key.id, revoke: true },
        { Cookie: cookie },
      )
    ).status,
    403,
  );
  const config: any = await (await owner('config')).json();
  assert.equal((await call('config', 'PUT', config, { Cookie: cookie })).status, 403);
  assert.equal(
    (await call('config', 'PUT', config, { ...auth, Origin: env.ADMIN_ORIGIN })).status,
    200,
  );
});

test('更换与撤销即时生效，旧页面不能覆盖新Key，改密撤销全部Key和会话', async (t) => {
  const { call, owner, create } = await fixture(t),
    first = await create(),
    second = await create(first.key.id);
  const read = (key: string) =>
    call('config', 'GET', undefined, { Authorization: 'Bearer ' + key });
  assert.equal((await read(first.accessKey)).status, 401);
  assert.equal((await read(second.accessKey)).status, 200);
  assert.equal(
    (await owner('access-key', 'POST', { currentId: first.key.id, revoke: false })).status,
    409,
  );
  assert.equal((await read(second.accessKey)).status, 200);
  assert.equal(
    (await owner('access-key', 'POST', { currentId: second.key.id, revoke: true })).status,
    200,
  );
  assert.equal((await read(second.accessKey)).status, 401);
  const third = await create();
  assert.equal(
    (
      await owner('password', 'POST', {
        password: LOCAL_AD_PASSWORD,
        newPassword: 'New-local-only-password-123',
      })
    ).status,
    200,
  );
  assert.equal((await read(third.accessKey)).status, 401);
  assert.equal((await owner('config')).status, 401);
});

test('生成/读取失败不假报成功，非法正文与失效会话不能生成或撤销Key', async (t) => {
  const { store, owner, call, cookie } = await fixture(t);
  for (const body of [
    {},
    { currentId: null, revoke: 'yes' },
    { currentId: 'invalid', revoke: false },
    { currentId: null, revoke: false, extra: 1 },
  ])
    assert.equal((await owner('access-key', 'POST', body)).status, 400);
  store.failures(false, true);
  assert.equal((await owner('access-key', 'POST', { currentId: null, revoke: false })).status, 503);
  store.failures(false, false);
  assert.equal((await store.db.prepare('SELECT count(*) AS n FROM ad_access_keys').first())?.n, 0);
  await store.db.prepare('DELETE FROM ad_sessions').run();
  assert.equal(
    (
      await call(
        'access-key',
        'POST',
        { currentId: null, revoke: false },
        { Cookie: cookie, Origin: 'https://xiuxian.011203.xyz' },
      )
    ).status,
    401,
  );
});

test('Key在慢图片校验期间撤销，迟到PUT不得写入投放', async (t) => {
  const { store, env, owner, create } = await fixture(t),
    created = await create();
  let release!: () => void, started!: () => void;
  const reached = new Promise<void>((r) => (started = r)),
    gate = new Promise<void>((r) => (release = r));
  const worker = createHouseAdsWorker(async () => {
    started();
    await gate;
    return new Response(new Uint8Array([137, 80, 78, 71]), {
      headers: { 'Content-Type': 'image/png' },
    });
  });
  const config: any = await (await owner('config')).json();
  const pending = worker.fetch(
    new Request(env.ADMIN_ORIGIN + '/ads/admin/config', {
      method: 'PUT',
      headers: { Authorization: 'Bearer ' + created.accessKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...config, campaigns: [exampleAd] }),
    }),
    env,
  );
  await reached;
  assert.equal(
    (await owner('access-key', 'POST', { currentId: created.key.id, revoke: true })).status,
    200,
  );
  release();
  assert.equal((await pending).status, 409);
  assert.equal(store.value()?.revision, config.revision);
});

test('后台延迟刷新期间禁止生成，读完再生成且元数据刷新不丢一次性密钥', async () => {
  const nodes = new Map<string, any>();
  const element = (id: string) => {
    if (!nodes.has(id)) nodes.set(id, { value: '', hidden: true, disabled: false, dataset: {} });
    return nodes.get(id);
  };
  let release!: (response: unknown) => void,
    posts = 0;
  const firstRead = new Promise((resolve) => {
    release = resolve;
  });
  let metadata: any = { id: 'old-test-id', prefix: 'old', createdAt: '2026-10-28T00:00:00Z' };
  let reads = 0;
  const context = createContext({
    document: { getElementById: element },
    AbortController,
    setTimeout,
    clearTimeout,
    oldMetadata: metadata,
    fetch: async (_url: string, init: any) => {
      if (init.method === 'GET' && ++reads === 1) return firstRead;
      if (init.method === 'POST') {
        posts++;
        metadata = { ...metadata, id: 'new-test-id', prefix: 'new' };
        return {
          ok: true,
          json: async () => ({ key: metadata, accessKey: 'synthetic-ui-key-only' }),
        };
      }
      return { ok: true, json: async () => ({ key: metadata }) };
    },
  });
  const source = ADMIN_SCRIPT.slice(
    ADMIN_SCRIPT.indexOf('let keyMeta='),
    ADMIN_SCRIPT.indexOf('keyGenerate.onclick='),
  );
  runInContext(source + ';keyMeta=oldMetadata;keyReady=true;', context);
  const pending = runInContext('loadKey()', context);
  assert.equal(element('key-generate').disabled, true);
  await runInContext('changeKey(false)', context);
  assert.equal(posts, 0, '旧GET未返回时不得发生成请求');
  release({ ok: true, json: async () => ({ key: metadata }) });
  await pending;
  await runInContext('changeKey(false)', context);
  assert.equal(posts, 1);
  assert.equal(element('key-value').value, 'synthetic-ui-key-only');
  await runInContext('loadKey()', context);
  assert.equal(element('key-value').value, 'synthetic-ui-key-only');
  assert.equal(element('key-once').hidden, false);
});
