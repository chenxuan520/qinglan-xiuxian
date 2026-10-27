import test from 'node:test';
import assert from 'node:assert/strict';
import { adResponseJson, AdResponseError } from '../src/ad-response-json.ts';
import { adLoadJson } from '../src/ad-load-request.ts';
import { AdLoadTrace } from '../src/ad-load-diagnostics.ts';
import { configuredAdProvider } from '../src/ads-platform.ts';
import { defaultAdPlatformSettings } from '../src/ad-platform-contract.ts';
import { setImmediate } from 'node:timers/promises';

function withoutStream(response: Response) {
  return new Proxy(response, {
    get(target, key) {
      if (key === 'body') return undefined;
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

test('广告配置在有原生text但无响应流的环境仍能选择真实自营供给，且不带Cookie', async () => {
  const trace = new AdLoadTrace();
  const result = await configuredAdProvider(
    'reward-supplies',
    new AbortController().signal,
    async (_url, options) => {
      assert.equal(options?.credentials, 'omit');
      assert.equal(options?.cache, 'no-store');
      return withoutStream(Response.json({ settings: defaultAdPlatformSettings() }));
    },
    trace,
  );
  assert.equal(result?.name, 'house');
  assert.equal(trace.status, 200);
});

test('缺TextDecoder时走原生text；中文、emoji、转义内容按UTF8字节限制，BOM正常解析', async (t) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'TextDecoder')!;
  Object.defineProperty(globalThis, 'TextDecoder', { value: undefined, configurable: true });
  t.after(() => Object.defineProperty(globalThis, 'TextDecoder', original));
  const value = { name: '青岚🚪', lines: '甲\n乙' };
  const text = JSON.stringify(value),
    bytes = new Blob([text]).size;
  assert.deepEqual(await adResponseJson(new Response(text), bytes), value);
  await assert.rejects(
    adResponseJson(new Response(text), bytes - 1),
    (e: unknown) => e instanceof AdResponseError && e.code === 'too-large',
  );
  assert.deepEqual(await adResponseJson(new Response('\uFEFF' + text), bytes), value);
});

test('流读取仍逐块拒绝超限；无流时已知长度提前拒绝，未知长度读取后仍拒绝超限', async () => {
  let cancelled = false;
  const response = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(12));
      },
      cancel() {
        cancelled = true;
      },
    }),
  );
  await assert.rejects(
    adResponseJson(response, 8),
    (e: unknown) => e instanceof AdResponseError && e.code === 'too-large',
  );
  assert.equal(cancelled, true);
  let read = false;
  const oversized = withoutStream(new Response('{}', { headers: { 'Content-Length': '99999' } }));
  const guarded = new Proxy(oversized, {
    get(target, key) {
      if (key === 'text')
        return () => {
          read = true;
          throw Error('must not read');
        };
      return Reflect.get(target, key);
    },
  });
  await assert.rejects(adResponseJson(guarded, 128));
  assert.equal(read, false);
  await assert.rejects(
    adResponseJson(withoutStream(new Response('x'.repeat(129))), 128),
    (e: unknown) => e instanceof AdResponseError && e.code === 'too-large',
  );
});

test('真实HTTP状态与HTML、坏JSON、空正文、读取异常和schema失败分开记录，不记录响应原文', async () => {
  for (const [response, code] of [
    [new Response('<html>not json</html>', { headers: { 'Content-Type': 'text/html' } }), 'html'],
    [new Response('{bad', { headers: { 'X-Qinglan-Content': 'reward-content-v1' } }), 'json'],
    [withoutStream(new Response('')), 'empty'],
    [
      new Proxy(withoutStream(new Response('{}')), {
        get(target, key) {
          return key === 'text'
            ? async () => {
                throw Error('private body');
              }
            : Reflect.get(target, key);
        },
      }),
      'body-read',
    ],
  ] as const) {
    const trace = new AdLoadTrace();
    assert.equal(
      await adLoadJson(
        new URL('https://xiuxian.011203.xyz/api/reward-content/config'),
        new AbortController().signal,
        512,
        async () => response,
        trace,
      ),
      null,
    );
    assert.equal(trace.status, 200);
    assert.equal(trace.code, code);
  }
  const trace = new AdLoadTrace();
  assert.equal(
    await configuredAdProvider(
      'reward-root',
      new AbortController().signal,
      async () => Response.json({ settings: {} }),
      trace,
    ),
    null,
  );
  assert.equal(trace.status, 200);
  assert.equal(trace.code, 'schema');
});

test('无流兼容正文即使忽略AbortSignal仍按6秒取消，仅瞬时超时重试一次，迟到结果无效', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const trace = new AdLoadTrace();
  const response = () =>
    new Proxy(withoutStream(new Response('{}')), {
      get(target, key) {
        return key === 'text' ? () => new Promise(() => {}) : Reflect.get(target, key);
      },
    });
  const result = adLoadJson(
    new URL('https://xiuxian.011203.xyz/api/reward-content/config'),
    new AbortController().signal,
    512,
    async () => {
      calls++;
      return response();
    },
    trace,
  );
  await setImmediate();
  t.mock.timers.tick(6000);
  await setImmediate();
  assert.equal(calls, 2);
  t.mock.timers.tick(6000);
  assert.equal(await result, null);
  assert.equal(trace.code, 'timeout');
  assert.equal(trace.status, 200, '已取得200响应的正文超时仍保留真实HTTP状态');
  const controller = new AbortController();
  const cancelled = adLoadJson(
    new URL('https://xiuxian.011203.xyz/api/reward-content/config'),
    controller.signal,
    512,
    async () => response(),
  );
  await setImmediate();
  controller.abort();
  assert.equal(await cancelled, null);
});
