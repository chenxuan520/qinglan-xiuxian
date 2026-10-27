import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { UI_AD_FIXTURE } from '../scripts/ui-ad-fixture.ts';
import { ADS_SETTINGS } from '../src/setting.ts';
import { validAdPlatformSettings } from '../src/ad-platform-contract.ts';

test('通用界面广告夹具固定无库存、保留设备请求并透传其他接口，不依赖真实投放', async () => {
  const forwarded: unknown[] = [];
  const window = {
    fetch: async (input: unknown) => {
      forwarded.push(input);
      return Response.json({ live: true });
    },
  } as any;
  runInNewContext(UI_AD_FIXTURE, {
    window,
    URL,
    Request,
    Response,
    location: { href: 'http://localhost:5173/' },
  });
  const settings = await (
    await window.fetch(ADS_SETTINGS.platform.endpoint + '?placement=revive')
  ).json();
  assert.ok(validAdPlatformSettings(settings.settings));
  assert.equal(settings.settings.provider, 'house');
  for (const device of ['desktop', 'mobile']) {
    const result = await window.fetch(
      new Request(ADS_SETTINGS.house.endpoint + '?placement=revive&device=' + device),
    );
    assert.deepEqual(await result.json(), { ad: null });
  }
  assert.equal(window.__uiAdFixtureRequests.length, 3);
  assert.match(window.__uiAdFixtureRequests[2].query, /device=mobile/);
  assert.equal(forwarded.length, 0);
  assert.deepEqual(
    await (await window.fetch(ADS_SETTINGS.house.preloadEndpoint + '?device=mobile')).json(),
    { images: [] },
  );
  assert.equal(window.__uiAdFixtureRequests.length, 4);
  assert.equal(forwarded.length, 0);
  assert.deepEqual(await (await window.fetch('/unrelated')).json(), { live: true });
  assert.equal(forwarded.length, 1);
});
