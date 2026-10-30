import test from 'node:test';
import assert from 'node:assert/strict';
import { adStore, adEnv, adWorker, adSessionFixture } from './helpers/house-ads.ts';

test('榜单复用的管理会话检查只返回确认标记，拒绝缺失与失效会话及Bearer', async () => {
  const store = adStore();
  const url = 'https://xiuxian.011203.xyz/ads/admin/session';
  try {
    const env = adEnv(store);
    assert.equal((await adWorker.fetch(new Request(url), env)).status, 401);
    const fixture = await adSessionFixture(store);
    const cookie = await fixture.token();
    const ok = await adWorker.fetch(new Request(url, { headers: { Cookie: cookie } }), env);
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { ok: true });
    assert.equal(ok.headers.get('Cache-Control'), 'no-store');
    assert.equal(
      (
        await adWorker.fetch(
          new Request(url, {
            headers: { Cookie: cookie, Authorization: 'Bearer invalid-synthetic-fixture' },
          }),
          env,
        )
      ).status,
      403,
    );
    await store.db.prepare('UPDATE ad_admin SET version=version+1 WHERE id=1').run();
    assert.equal(
      (await adWorker.fetch(new Request(url, { headers: { Cookie: cookie } }), env)).status,
      401,
    );
  } finally {
    store.close();
  }
});
