import test from 'node:test';
import assert from 'node:assert/strict';
import { createUpdateCheck, resourceFailed } from '../src/update-check.ts';
import { GuideSource } from '../src/guide-source.ts';
import { ChronicleSource } from '../src/chronicle-source.ts';
import { MarketEventSource } from '../src/market-event-source.ts';
import { NpcChatSource } from '../src/npc-chat-source.ts';

const current = 'a'.repeat(24),
  next = 'b'.repeat(24);
const url = new URL('https://site.example/qinglan-xiuxian/offline-manifest.json');
test('按构建号识别更新，两站子路径不变、禁用缓存并带独立检查参数', async () => {
  let notices = 0;
  const calls: URL[] = [];
  const check = createUpdateCheck(
    current,
    url,
    () => notices++,
    async (input, options) => {
      const requested = input as URL;
      calls.push(requested);
      assert.equal(requested.origin, url.origin);
      assert.equal(requested.pathname, url.pathname);
      assert.match(requested.searchParams.get('_')!, /^\d+$/);
      assert.equal(options!.cache, 'no-store');
      assert.ok(options!.signal instanceof AbortSignal);
      return Response.json({ schema: 1, build: calls.length === 1 ? current : next });
    },
  );
  await check();
  assert.equal(notices, 0);
  await check();
  assert.equal(notices, 1);
  assert.equal(url.search, '');
});

test('并发资源失败只检查一次，检查结束后仍可重新核验', async () => {
  let calls = 0,
    notices = 0,
    release!: () => void;
  const check = createUpdateCheck(
    current,
    url,
    () => notices++,
    async () => {
      calls++;
      await new Promise<void>((r) => (release = r));
      return Response.json({ schema: 1, build: next });
    },
  );
  const first = check();
  for (let i = 0; i < 20; i++) assert.equal(check(), first);
  assert.equal(calls, 1);
  release();
  await first;
  assert.equal(notices, 1);
  const second = check();
  assert.equal(calls, 2);
  release();
  await second;
  assert.equal(notices, 2);
});

test('断网、状态码、坏JSON及不完整清单都不能误报已更新', async () => {
  for (const data of [
    null,
    {},
    [],
    { schema: 2, build: next },
    { schema: 1, build: 'new' },
    { schema: 1, build: 123 },
    { schema: 1, build: current },
  ]) {
    let notices = 0;
    await createUpdateCheck(
      current,
      url,
      () => notices++,
      async () => Response.json(data),
    )();
    assert.equal(notices, 0);
  }
  for (const fetcher of [
    async () => {
      throw Error('offline');
    },
    async () => new Response('bad', { status: 503 }),
    async () => new Response('<html>fallback</html>'),
  ]) {
    let notices = 0;
    await createUpdateCheck(current, url, () => notices++, fetcher)();
    assert.equal(notices, 0);
  }
});

test('版本请求五秒超时会终止，不提示更新，后续检查可以恢复', { timeout: 10000 }, async () => {
  let notices = 0,
    calls = 0,
    aborted = false;
  const check = createUpdateCheck(
    current,
    url,
    () => notices++,
    async (_input, options) => {
      if (calls++) return Response.json({ schema: 1, build: next });
      return new Promise<Response>((_resolve, reject) =>
        options!.signal!.addEventListener('abort', () => {
          aborted = true;
          reject(new DOMException('aborted', 'AbortError'));
        }),
      );
    },
  );
  await check();
  assert.equal(aborted, true);
  assert.equal(notices, 0);
  await check();
  assert.equal(notices, 1);
});

test('已处理的指南、履历、坊市和闲谈加载失败也发送信号，不吞掉原重试错误', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'dispatchEvent');
  const target = new EventTarget();
  let signals = 0;
  const handled: boolean[] = [];
  target.addEventListener('vite:preloadError', (event) => {
    signals++;
    handled.push((event as Event & { handledResourceFailure: boolean }).handledResourceFailure);
  });
  Object.defineProperty(globalThis, 'dispatchEvent', {
    configurable: true,
    value: target.dispatchEvent.bind(target),
  });
  try {
    resourceFailed();
    assert.equal(signals, 1);
    for (const Source of [GuideSource, ChronicleSource, MarketEventSource]) {
      const failure = Error('module unavailable');
      const source = new Source(async () => {
        throw failure;
      });
      await assert.rejects(source.load(), (e) => e === failure);
      await assert.rejects(source.load(), (e) => e === failure);
    }
    let fallback = 0;
    await new NpcChatSource(async () => {
      throw Error('missing');
    }).show(
      { isConnected: true },
      () => assert.fail('not loaded'),
      () => fallback++,
    );
    assert.equal(fallback, 1);
    assert.equal(signals, 8);
    assert.deepEqual(handled, [false, true, true, true, true, true, true, true]);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'dispatchEvent', descriptor);
    else Reflect.deleteProperty(globalThis, 'dispatchEvent');
  }
});
