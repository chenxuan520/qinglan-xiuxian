import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';

// 检查页面控制器的可观察操作，Worker 缓存算法另由 offline.test.ts 覆盖。
const source = readFileSync(new URL('../src/offline.ts', import.meta.url), 'utf8');
const javascript = transpileModule(source.replaceAll('import.meta.env.BASE_URL', '__base'), {
  compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
}).outputText;
type Status = { ready: boolean; stored: boolean; busy: boolean };

function harness(base = '/', registered = false) {
  const scope = new URL(base, 'https://game.test/').href;
  const names = new Set<string>();
  const actions: string[] = [];
  const saved = new Map([['qinglan-immortal-v1', '{"cultivation":5000,"volume":0.42}']]);
  const nodes = Object.fromEntries(
    [
      '.offline-status',
      '[data-action="offline-cache"]',
      '[data-action="offline-cancel"]',
      '[data-action="offline-clear"]',
      'progress',
      '[data-offline-summary]',
    ].map((selector) => [selector, { textContent: '', disabled: false, hidden: false, value: 0 }]),
  );
  const cacheStorage = {
    async keys() {
      return [...names];
    },
    async delete(name: string) {
      return names.delete(name);
    },
  };
  const remote = { status: { ready: false, stored: false, busy: false } as Status };
  let deferClear = false;
  let finishClear: (() => void) | undefined;
  let deferStatus = false;
  const pendingStatuses: Array<() => void> = [];
  class Channel {
    port1 = { onmessage: undefined as ((event: { data: object }) => void) | undefined, close() {} };
    port2 = {
      postMessage: (data: object) => queueMicrotask(() => this.port1.onmessage?.({ data })),
    };
  }
  const reg = registered
    ? {
        active: {
          scriptURL: new URL('offline-worker.js', scope).href,
          postMessage(message: { action: string }, ports: Channel['port2'][]) {
            actions.push(message.action);
            if (message.action === 'clear') {
              const finish = () => {
                remote.status = { ready: false, stored: false, busy: false };
                ports[0].postMessage({ result: { ...remote.status } });
              };
              if (deferClear) finishClear = finish;
              else finish();
            } else {
              const result = { ...remote.status };
              const finish = () => ports[0].postMessage({ result });
              if (deferStatus && message.action === 'status') pendingStatuses.push(finish);
              else finish();
            }
          },
        },
      }
    : null;
  const api = {} as {
    initOffline(): void;
    checkOffline(): Promise<void>;
    openOfflinePanel(): Promise<void>;
    offlineAction(action: string): Promise<void>;
  };
  vm.runInNewContext(javascript, {
    exports: api,
    require: () => ({ assetUrl: (path: string) => new URL(path, scope).href }),
    __base: base,
    __QINGLAN_BUILD_ID__: 'a'.repeat(24),
    window: { isSecureContext: true, caches: cacheStorage },
    caches: cacheStorage,
    navigator: { serviceWorker: { getRegistration: async () => reg } },
    location: { href: scope },
    document: {
      querySelector: (selector: string) =>
        selector === '.offline-resources'
          ? { querySelector: (child: string) => nodes[child] }
          : nodes[selector],
    },
    localStorage: {
      getItem: (key: string) => saved.get(key),
      setItem: (key: string, value: string) => saved.set(key, value),
      removeItem: (key: string) => saved.delete(key),
      clear: () => saved.clear(),
    },
    fetch: async () => ({ ok: true, json: async () => ({ build: 'a'.repeat(24), bytes: 1024 }) }),
    MessageChannel: Channel,
    AbortController,
    URL,
    Promise,
    setTimeout,
    clearTimeout,
  });
  return {
    api,
    nodes,
    names,
    actions,
    saved,
    remote,
    deferClear() {
      deferClear = true;
    },
    finishClear() {
      assert.ok(finishClear);
      finishClear();
    },
    deferStatus() {
      deferStatus = true;
    },
    finishStatus(index = 0) {
      assert.ok(pendingStatuses[index]);
      pendingStatuses[index]();
    },
  };
}

for (const base of ['/', '/qinglan-xiuxian/']) {
  test(`服务线程注销后仍清除本项目全部缓存，保留其他作用域与存档（${base}）`, async () => {
    const h = harness(base);
    const prefix = `qinglan-offline:${base}:`;
    const other = base === '/' ? '/another-game/' : '/';
    for (const name of [
      `${prefix}old`,
      `${prefix}current`,
      `${prefix}pending`,
      `qinglan-offline:${other}:complete`,
      'another-cache',
    ])
      h.names.add(name);
    const before = [...h.saved];
    h.api.initOffline();
    await h.api.checkOffline();
    await h.api.offlineAction('offline-clear');
    assert.deepEqual(
      [...h.names].sort(),
      ['another-cache', `qinglan-offline:${other}:complete`].sort(),
    );
    assert.deepEqual([...h.saved], before);
    assert.match(h.nodes['.offline-status'].textContent, /已清除所有缓存资源/);
  });
}

test('另一页完成新旧版本缓存后不继续显示旧清除提示', async () => {
  for (const ready of [true, false]) {
    const h = harness('/', true);
    h.api.initOffline();
    await h.api.checkOffline();
    await h.api.offlineAction('offline-clear');
    assert.match(h.nodes['.offline-status'].textContent, /已清除所有缓存资源/);
    h.remote.status = { ready, stored: true, busy: false };
    await h.api.openOfflinePanel();
    assert.doesNotMatch(h.nodes['.offline-status'].textContent, /已清除/);
    assert.match(
      h.nodes['.offline-status'].textContent,
      ready ? /全部离线资源已缓存/ : /已有旧版离线资源/,
    );
  }
});

test('清除过程中重开设置不会解锁缓存或并发清除', async () => {
  const h = harness('/', true);
  h.api.initOffline();
  await h.api.checkOffline();
  h.actions.length = 0;
  h.deferClear();
  const pending = h.api.offlineAction('offline-clear');
  await new Promise((resolve) => setImmediate(resolve));
  await h.api.openOfflinePanel();
  await h.api.offlineAction('offline-cache');
  await h.api.offlineAction('offline-clear');
  assert.deepEqual(h.actions, ['clear']);
  assert.equal(h.nodes['[data-action="offline-cache"]'].disabled, true);
  assert.equal(h.nodes['[data-action="offline-clear"]'].disabled, true);
  h.finishClear();
  await pending;
  assert.equal(h.nodes['[data-action="offline-cache"]'].disabled, false);
  assert.equal(h.nodes['[data-action="offline-clear"]'].disabled, false);
  assert.match(h.nodes['.offline-status'].textContent, /已清除所有缓存资源/);
});

test('清除前的迟到状态不能把已删除资源重新显示为已缓存', async () => {
  const h = harness('/', true);
  h.remote.status = { ready: true, stored: true, busy: false };
  h.api.initOffline();
  await h.api.checkOffline();
  h.deferStatus();
  const old = h.api.checkOffline();
  await new Promise((resolve) => setImmediate(resolve));
  await h.api.offlineAction('offline-clear');
  h.finishStatus();
  await old;
  assert.match(h.nodes['.offline-status'].textContent, /已清除所有缓存资源/);
  assert.equal(h.nodes['[data-action="offline-cache"]'].disabled, false);
});

test('状态检查乱序返回时只采用最新一次检查结果', async () => {
  const h = harness('/', true);
  h.api.initOffline();
  await h.api.checkOffline();
  h.deferStatus();
  const old = h.api.checkOffline();
  await new Promise((resolve) => setImmediate(resolve));
  h.remote.status = { ready: true, stored: true, busy: false };
  const latest = h.api.checkOffline();
  await new Promise((resolve) => setImmediate(resolve));
  h.finishStatus(1);
  await latest;
  h.finishStatus(0);
  await old;
  assert.match(h.nodes['.offline-status'].textContent, /全部离线资源已缓存/);
  assert.equal(h.nodes['[data-action="offline-cache"]'].disabled, true);
});
