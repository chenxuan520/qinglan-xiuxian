import test from 'node:test';
import assert from 'node:assert/strict';
import { warmAdPlatform, configuredAdProvider } from '../src/ads-platform.ts';
import { defaultAdPlatformSettings } from '../src/ad-platform-contract.ts';
import { storePreparedAd, takePreparedAd, clearPreparedAds } from '../src/ad-preload-cache.ts';
import { AdLoadTrace } from '../src/ad-load-diagnostics.ts';
import { exampleAd } from './helpers/house-ads.ts';

for (const next of ['adsense', 'placeholder', 'house'] as const) {
  test(`默认fetch路径预热后切换${next}立即重新读取供给，保留或清理预备素材`, async (t) => {
    let settings = defaultAdPlatformSettings(),
      reads = 0;
    clearPreparedAds();
    t.after(clearPreparedAds);
    t.mock.method(globalThis, 'fetch', async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/preload')) return Response.json({ images: [], ads: {} });
      assert.ok(url.pathname.endsWith('/config'));
      reads++;
      return Response.json({ settings });
    });
    const signal = new AbortController().signal;
    await warmAdPlatform(signal);
    storePreparedAd('revive', 'desktop', exampleAd);
    settings = {
      ...settings,
      provider: next,
      adsense: { ...settings.adsense, client: 'ca-pub-1234567890123456' },
    };
    // 故意不传fetcher，覆盖旧代码只在默认fetch上执行的缓存短路。
    const provider = await configuredAdProvider('revive', signal);
    assert.equal(reads, 2);
    assert.equal(provider?.name ?? 'placeholder', next);
    assert.equal(!!takePreparedAd('revive', 'desktop'), next === 'house');
    assert.equal(takePreparedAd('revive', 'desktop'), null);
  });
}

test('预热后的配置故障或取消不沿用旧供给，不消费预备图片或生成凭条请求', async (t) => {
  let failed = false;
  const paths: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(String(input));
    paths.push(url.pathname);
    if (url.pathname.endsWith('/preload')) return Response.json({ images: [] });
    return failed
      ? new Response('', { status: 403 })
      : Response.json({ settings: defaultAdPlatformSettings() });
  });
  const signal = new AbortController().signal;
  await warmAdPlatform(signal);
  storePreparedAd('revive', 'desktop', exampleAd);
  t.after(clearPreparedAds);
  failed = true;
  const trace = new AdLoadTrace();
  assert.equal(await configuredAdProvider('revive', signal, fetch, trace), null);
  assert.equal(trace.status, 403);
  assert.equal(takePreparedAd('revive', 'desktop')?.id, exampleAd.id);
  const cancelled = new AbortController();
  cancelled.abort();
  const count = paths.length;
  assert.equal(await configuredAdProvider('revive', cancelled.signal), null);
  assert.equal(paths.length, count);
  assert.ok(paths.every((path) => /\/(config|preload)$/.test(path)));
});
