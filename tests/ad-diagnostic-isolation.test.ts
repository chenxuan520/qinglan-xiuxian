import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { setImmediate } from 'node:timers/promises';
import { adEnv, adStore, adWorker } from './helpers/house-ads.ts';
import {
  AD_DIAGNOSTIC_MAX_ROWS,
  AD_DIAGNOSTIC_MAX_VERSIONS,
} from '../workers/house-ads/diagnostics.ts';
import { validAdLoadDiagnostic } from '../src/ad-load-contract.ts';
import { houseAdDeviceFromUserAgent } from '../src/house-ad-contract.ts';
import { TELEMETRY_SETTINGS, ADS_SETTINGS } from '../src/setting.ts';

const origin = 'https://xiuxian.011203.xyz';
const sample = () => ({
  version: 'v0.0.5-26-geb63aa5',
  placement: 'revive',
  device: 'mobile',
  browser: 'via',
  stage: 'settings',
  code: 'http',
  status: 503,
  elapsed: 20,
});
function sender(store: ReturnType<typeof adStore>) {
  const env = adEnv(store);
  return (body = sample(), source = origin, query = '') =>
    adWorker.fetch(
      new Request(origin + '/api/client-status' + query, {
        method: 'POST',
        headers: { Origin: source, 'Content-Type': 'text/plain' },
        body: JSON.stringify(body),
      }),
      env,
    );
}

test('本机和未获准预览不能写生产诊断，dev/dirty及verification不入库，两个正式来源照常聚合', async () => {
  const store = adStore(),
    send = sender(store);
  try {
    for (const source of [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://[::1]:5173',
      'https://preview.qinglan-xiuxian.pages.dev',
    ])
      assert.equal((await send(sample(), source)).status, 403);
    for (const version of ['dev', 'v0.0.5-26-geb63aa5-dirty'])
      assert.equal((await send({ ...sample(), version })).status, 204);
    assert.equal((await send(sample(), origin, '?verification=1')).status, 204);
    assert.equal(
      (await store.db.prepare('SELECT count(*) n FROM ad_load_diagnostics').first())?.n,
      0,
    );
    await send();
    await send(sample(), 'https://chenxuan520.github.io');
    assert.equal(
      (await store.db.prepare('SELECT count FROM ad_load_diagnostics').first())?.count,
      2,
    );
    assert.equal((await store.db.prepare('SELECT count(*) n FROM ad_receipts').first())?.n, 0);
  } finally {
    store.close();
  }
});

test('版本数量达到日上限后拒收新版本，已有版本仍能聚合', async () => {
  const store = adStore(),
    send = sender(store);
  try {
    for (let n = 0; n <= AD_DIAGNOSTIC_MAX_VERSIONS; n++)
      await send({ ...sample(), version: `v0.0.${n}` });
    assert.equal(
      (await store.db.prepare('SELECT count(DISTINCT version) n FROM ad_load_diagnostics').first())
        ?.n,
      AD_DIAGNOSTIC_MAX_VERSIONS,
    );
    await send({ ...sample(), version: 'v0.0.0' });
    assert.equal(
      (
        await store.db
          .prepare("SELECT count FROM ad_load_diagnostics WHERE version='v0.0.0'")
          .first()
      )?.count,
      2,
    );
  } finally {
    store.close();
  }
});

test('日记录数到上限时不增新分组，原分组仍计数，旧日记录按原规则清理', async () => {
  const store = adStore(),
    send = sender(store),
    now = new Date().toISOString();
  try {
    for (let n = 0; n < AD_DIAGNOSTIC_MAX_ROWS; n++)
      await store.db
        .prepare(
          'INSERT INTO ad_load_diagnostics (day,version,placement,device,browser,stage,code,status,elapsed_total,last_seen) VALUES (?,?,?,?,?,?,?,?,?,?)',
        )
        .bind(
          now.slice(0, 10),
          sample().version,
          'revive',
          n < 600 ? 'mobile' : 'desktop',
          'via',
          'settings',
          'http',
          n % 600,
          20,
          now,
        )
        .run();
    await store.db
      .prepare(
        'INSERT INTO ad_load_diagnostics (day,version,placement,device,browser,stage,code,status,elapsed_total,last_seen) VALUES (?,?,?,?,?,?,?,?,?,?)',
      )
      .bind(
        '2000-01-01',
        sample().version,
        'revive',
        'mobile',
        'via',
        'settings',
        'http',
        0,
        20,
        now,
      )
      .run();
    await send({ ...sample(), device: 'desktop', status: 599 });
    await send({ ...sample(), status: 0 });
    assert.equal(
      (await store.db.prepare('SELECT count(*) n FROM ad_load_diagnostics').first())?.n,
      AD_DIAGNOSTIC_MAX_ROWS,
    );
    assert.equal(
      (
        await store.db
          .prepare("SELECT count FROM ad_load_diagnostics WHERE device='mobile' AND status=0")
          .first()
      )?.count,
      2,
    );
    assert.equal(
      (
        await store.db
          .prepare(
            "SELECT count(*) n FROM ad_load_diagnostics WHERE device='desktop' AND status=599",
          )
          .first()
      )?.n,
      0,
    );
  } finally {
    store.close();
  }
});

test('客户端自身排除本机、预览、验证、开发和单机，只在正式页上报且一轮一次', async () => {
  const source = readFileSync(
    new URL('../src/ad-load-diagnostics.ts', import.meta.url),
    'utf8',
  ).replace(/^import[^;]+;\n/gm, '');
  for (const [url, version, standalone, expected] of [
    [origin + '/', sample().version, false, 1],
    ['https://chenxuan520.github.io/qinglan-xiuxian/', sample().version, false, 1],
    ['http://localhost:5173/', sample().version, false, 0],
    ['https://preview.qinglan-xiuxian.pages.dev/', sample().version, false, 0],
    [origin + '/?verification=1', sample().version, false, 0],
    [origin + '/', 'dev', false, 0],
    [origin + '/', sample().version + '-dirty', false, 0],
    [origin + '/', sample().version, true, 0],
  ] as const) {
    const calls: { url: string; init: RequestInit }[] = [];
    const ctx = createContext({
      performance,
      setTimeout,
      clearTimeout,
      AbortController,
      URL,
      URLSearchParams,
      STANDALONE: standalone,
      GAME_VERSION: version,
      ADS_SETTINGS,
      TELEMETRY_SETTINGS,
      validAdLoadDiagnostic,
      houseAdDeviceFromUserAgent,
      window: { location: new URL(url) },
      navigator: { userAgent: 'Via/7.0' },
      fetch: async (url: URL, init: RequestInit) => {
        calls.push({ url: String(url), init });
        return new Response(null, { status: 204 });
      },
    });
    runInContext(
      stripTypeScriptTypes(source.replace('export class', 'class')) +
        '\nconst trace = new AdLoadTrace();trace.report("revive");trace.report("revive");',
      ctx,
    );
    await setImmediate();
    assert.equal(calls.length, expected, `${url} ${version} standalone=${standalone}`);
    if (expected) {
      assert.equal(calls[0].init.credentials, 'omit');
      assert.equal(new URL(calls[0].url).pathname, '/api/client-status');
      assert.equal(validAdLoadDiagnostic(JSON.parse(String(calls[0].init.body))), true);
    }
  }
});
