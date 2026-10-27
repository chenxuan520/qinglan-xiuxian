import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validHouseAdConfig,
  validHouseAd,
  weightedHouseAd,
  houseAdWeight,
  houseAdDeviceFromUserAgent,
  HOUSE_AD_PLACEMENTS,
  type HouseAdCampaign,
} from '../src/house-ad-contract.ts';
import { currentHouseAdDevice, requestHouseAd } from '../src/ads-house.ts';
import { adWorker as worker } from './helpers/house-ads.ts';
import { adStore, adEnv, adSessionFixture, exampleAd } from './helpers/house-ads.ts';
const mobileImageUrl = 'https://example.test/mobile.webp';
const deviceAd = { ...exampleAd, desktopWeight: 2, mobileWeight: 3, mobileImageUrl };
const valid = (ad: unknown) => validHouseAdConfig({ revision: 0, campaigns: [ad] });

test('双端0权重可空链接，正权重必须有本端图片及跳转；原单权重仍保持原图兼容', () => {
  assert.ok(valid(exampleAd));
  assert.ok(valid(deviceAd));
  assert.ok(valid({ ...deviceAd, desktopWeight: 0, imageUrl: '' }));
  assert.ok(valid({ ...exampleAd, desktopWeight: 2, mobileWeight: 0 }));
  assert.ok(
    valid({
      ...deviceAd,
      desktopWeight: 0,
      mobileWeight: 0,
      imageUrl: '',
      mobileImageUrl: '',
      targetUrl: '',
    }),
  );
  assert.equal(valid({ ...deviceAd, imageUrl: '' }), false);
  assert.equal(valid({ ...deviceAd, mobileImageUrl: '' }), false);
  assert.equal(valid({ ...deviceAd, mobileImageUrl: undefined }), false);
  assert.equal(valid({ ...deviceAd, targetUrl: '' }), false);
  for (const key of ['desktopWeight', 'mobileWeight']) {
    for (const value of [-1, 1.5, 1001, Infinity, NaN, '0', null])
      assert.equal(valid({ ...deviceAd, [key]: value }), false);
    assert.ok(valid({ ...deviceAd, [key]: 1000 }));
  }
  for (const patch of [
    { imageUrl: 'http://example.test/p.png' },
    { mobileImageUrl: 'javascript:alert(1)' },
    { targetUrl: 'https://user:password@example.test' },
  ])
    assert.equal(valid({ ...deviceAd, desktopWeight: 0, mobileWeight: 0, ...patch }), false);
  // 新格式只给一端权重时，另一端仍继承旧权重/默认1，正权重仍须填本端图片。
  assert.equal(valid({ ...exampleAd, desktopWeight: 0 }), false);
  assert.ok(valid({ ...exampleAd, desktopWeight: 0, mobileImageUrl }));
  assert.ok(valid({ ...exampleAd, mobileWeight: 0 }));
});

test('手机电脑分别按票抽取：0不参与且不落回旧权重，全0不调用随机数', (t) => {
  const phone = { ...deviceAd, id: 'phone', weight: 9, desktopWeight: 0, mobileWeight: 3 };
  const desktop = { ...deviceAd, id: 'desktop', weight: 8, desktopWeight: 4, mobileWeight: 0 };
  const old = { ...exampleAd, id: 'old', weight: 2 };
  const zero = { ...deviceAd, id: 'zero', desktopWeight: 0, mobileWeight: 0 };
  const disabled = {
    ...deviceAd,
    id: 'disabled',
    enabled: false,
    desktopWeight: 1000,
    mobileWeight: 1000,
  };
  const other = {
    ...deviceAd,
    id: 'other',
    placements: ['lifespan'] as any,
    desktopWeight: 1000,
    mobileWeight: 1000,
  };
  const ads: HouseAdCampaign[] = [phone, desktop, old, zero, disabled, other];
  for (const [channel, count, expected] of [
    ['desktop', 6, { desktop: 4, old: 2 }],
    ['mobile', 5, { phone: 3, old: 2 }],
  ] as const) {
    const actual: Record<string, number> = {};
    for (let ticket = 0; ticket < count; ticket++) {
      const id = weightedHouseAd(ads, 'revive', ticket, channel)!.id;
      actual[id] = (actual[id] ?? 0) + 1;
    }
    assert.deepEqual(actual, expected);
  }
  assert.equal(houseAdWeight(phone, 'desktop'), 0);
  assert.equal(houseAdWeight({ ...old, desktopWeight: 0 }, 'mobile'), 2);
  t.mock.method(crypto, 'getRandomValues', () => assert.fail('全0不能抽签'));
  assert.equal(weightedHouseAd([zero], 'revive', undefined, 'mobile'), null);
  assert.equal(weightedHouseAd([zero], 'revive', undefined, 'desktop'), null);
});

test('实际Worker+SQLite按渠道筛选四广告位、0不下发凭条；缺device兼容UA/CH，非法渠道拒绝', async (t) => {
  const store = adStore(),
    env = adEnv(store),
    session = await adSessionFixture(store),
    cookie = await session.token();
  t.after(() => store.close());
  const call = (path: string, options: RequestInit = {}) =>
    worker.fetch(
      new Request(env.ADMIN_ORIGIN + path, {
        ...options,
        headers: { Origin: env.ADMIN_ORIGIN, ...options.headers },
      }),
      env,
    );
  const put = (revision: number, campaigns: unknown[]) =>
    call('/ads/admin/config', {
      method: 'PUT',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision, campaigns }),
    });
  const phone = { ...deviceAd, id: 'phone-only', desktopWeight: 0, imageUrl: '' };
  const desktop = { ...deviceAd, id: 'desktop-only', mobileWeight: 0, mobileImageUrl: undefined };
  assert.equal((await put(0, [phone, desktop])).status, 200);
  for (const placement of HOUSE_AD_PLACEMENTS)
    for (const channel of ['desktop', 'mobile']) {
      const r = await call('/ads/v1/ad?placement=' + placement + '&device=' + channel);
      assert.equal(r.status, 200);
      const body = (await r.json()) as any;
      assert.equal(body.ad.id, channel === 'mobile' ? phone.id : desktop.id);
      assert.ok(validHouseAd(body.ad));
      assert.equal(body.ad.imageUrl, channel === 'mobile' ? mobileImageUrl : exampleAd.imageUrl);
      assert.equal(body.ad.desktopWeight, undefined);
      assert.equal(body.ad.mobileWeight, undefined);
      assert.ok(body.receipt);
    }
  for (const headers of [
    { 'User-Agent': 'iPhone Mobile' },
    { 'User-Agent': 'Linux Chrome', 'Sec-CH-UA-Mobile': '?1' },
  ])
    assert.equal(
      ((await (await call('/ads/v1/ad?placement=revive', { headers })).json()) as any).ad.id,
      phone.id,
    );
  assert.equal(
    (
      (await (
        await call('/ads/v1/ad?placement=revive', { headers: { 'User-Agent': 'Windows Chrome' } })
      ).json()) as any
    ).ad.id,
    desktop.id,
  );
  for (const device of ['', 'phone', 'all', 'Desktop'])
    assert.equal((await call('/ads/v1/ad?placement=revive&device=' + device)).status, 400);
  assert.equal(
    (await put(1, [{ ...phone, desktopWeight: 1 }])).status,
    400,
    '正电脑权重缺图不改配置',
  );
  assert.equal(store.value()!.revision, 1);
  assert.equal(
    (
      await put(1, [
        {
          ...deviceAd,
          desktopWeight: 0,
          mobileWeight: 0,
          imageUrl: '',
          mobileImageUrl: '',
          targetUrl: '',
        },
      ])
    ).status,
    200,
  );
  for (const channel of ['desktop', 'mobile'])
    assert.deepEqual(await (await call('/ads/v1/ad?placement=revive&device=' + channel)).json(), {
      ad: null,
    });
});

test('手机横屏和桌面窄窗不按宽度互换渠道，iPad桌面UA归手机', (t) => {
  const names = ['navigator', 'window'] as const,
    previous = names.map((n) => Object.getOwnPropertyDescriptor(globalThis, n));
  t.after(() =>
    names.forEach((n, i) =>
      previous[i]
        ? Object.defineProperty(globalThis, n, previous[i]!)
        : delete (globalThis as any)[n],
    ),
  );
  const setup = (ua: string, width: number, touches: number, coarse: boolean, mobile?: boolean) => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { userAgent: ua, maxTouchPoints: touches, userAgentData: { mobile } },
    });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { innerWidth: width, matchMedia: () => ({ matches: coarse }) },
    });
  };
  setup('iPhone Mobile', 844, 5, true);
  assert.equal(currentHouseAdDevice(), 'mobile');
  setup('Windows Chrome', 320, 0, false);
  assert.equal(currentHouseAdDevice(), 'desktop');
  setup('Windows Chrome', 1440, 10, false);
  assert.equal(currentHouseAdDevice(), 'desktop');
  setup('Macintosh Safari', 1024, 5, false);
  assert.equal(currentHouseAdDevice(), 'mobile');
  setup('Linux Chrome', 844, 1, true, false);
  assert.equal(currentHouseAdDevice(), 'mobile');
  setup('Linux Chrome', 1000, 0, false, true);
  assert.equal(currentHouseAdDevice(), 'mobile');
  assert.equal(houseAdDeviceFromUserAgent('Android Tablet'), 'mobile');
});

test('一次请求锁定渠道，响应期间设备信号变化也不重选；公开请求仍不带管理凭据', async (t) => {
  const old = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  t.after(() =>
    old
      ? Object.defineProperty(globalThis, 'navigator', old)
      : delete (globalThis as any).navigator,
  );
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { userAgent: 'iPhone Mobile', onLine: true },
  });
  let returned: ((r: Response) => void) | undefined;
  const result = requestHouseAd('revive', new AbortController().signal, async (u, options) => {
    assert.equal(new URL(String(u)).searchParams.get('device'), 'mobile');
    assert.equal(options!.credentials, 'omit');
    return new Promise<Response>((resolve) => (returned = resolve));
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { userAgent: 'Windows Chrome', onLine: true },
  });
  returned!(Response.json({ ad: { ...exampleAd, mobileImageUrl } }));
  const ad = await result;
  assert.equal(ad!.device, 'mobile');
  assert.equal(ad!.mobileImageUrl, mobileImageUrl);
});
