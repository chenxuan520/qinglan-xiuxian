import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { existsSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { offlineBuild } from '../scripts/offline-build.ts';

const worker = readFileSync(new URL('../public/offline-worker.js', import.meta.url), 'utf8');
const BUILD = 'a'.repeat(24);
const NEXT = 'b'.repeat(24);
const digest = (contents) => createHash('sha256').update(contents).digest('hex');

function harness(base = '/') {
  const scope = `https://game.test${base}`;
  const stored = new Map();
  const listeners = new Map();
  const responses = new Map();
  const fetches = [];
  let offline = false;
  let gate;
  let quota = false;
  let clock = 0;
  const key = (request) => (typeof request === 'string' ? request : request.url);
  const cacheStorage = {
    async keys() {
      return [...stored.keys()];
    },
    async delete(name) {
      return stored.delete(name);
    },
    async open(name) {
      if (!stored.has(name)) stored.set(name, new Map());
      const entries = stored.get(name);
      return {
        async keys() {
          return [...entries.keys()].map((url) => new Request(url));
        },
        async match(request) {
          return entries.get(key(request))?.clone();
        },
        async put(request, response) {
          if (quota === true || (quota === 'marker' && key(request).endsWith('.offline-complete')))
            throw new DOMException('Storage full', 'QuotaExceededError');
          entries.set(key(request), response.clone());
        },
      };
    },
  };
  vm.runInNewContext(worker, {
    self: {
      registration: { scope },
      clients: { claim: async () => {}, matchAll: async () => [] },
      skipWaiting: async () => {},
      addEventListener: (name, handler) => listeners.set(name, handler),
    },
    caches: cacheStorage,
    fetch: async (request, options) => {
      const url = new URL(typeof request === 'string' ? request : request.url || request.href);
      fetches.push(url.href);
      if (offline) throw new TypeError('offline');
      if (gate) await gate(url, options);
      if (options?.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      url.search = '';
      return responses.get(url.href)?.clone() || new Response('missing', { status: 404 });
    },
    crypto: webcrypto,
    URL,
    Request,
    Response,
    Headers,
    AbortController,
    DOMException,
    setTimeout,
    clearTimeout,
    Date: { now: () => ++clock },
  });
  function fixture(build = BUILD, text = 'old', additional = {}) {
    const contents = {
      'index.html': `<html>${text}</html>`,
      'assets/main.js': text,
      'assets/last-stage.webp': `map-${text}`,
      'assets/music.m4a': '0123456789',
      'assets/font.woff2': 'font',
      'assets/journey-card.js': 'lazy export',
      ...additional,
    };
    const resources = Object.entries(contents).map(([path, value]) => {
      const bytes = Buffer.from(value);
      responses.set(new URL(path, scope).href, new Response(bytes));
      return { path, bytes: bytes.length, sha256: digest(bytes) };
    });
    const manifest = {
      schema: 1,
      build,
      version: text,
      base,
      bytes: resources.reduce((sum, entry) => sum + entry.bytes, 0),
      resources,
    };
    responses.set(new URL(`offline-manifest-${build}.json`, scope).href, Response.json(manifest));
    return manifest;
  }
  async function message(action, build = BUILD, onProgress = () => {}) {
    let result;
    let error;
    let lifetime;
    listeners.get('message')({
      data: { action, build },
      ports: [
        {
          postMessage(data) {
            if (data.progress) onProgress(data.progress);
            if (data.result) result = data.result;
            if (data.error) error = data.error;
          },
          close() {},
        },
      ],
      waitUntil(promise) {
        lifetime = promise;
      },
    });
    await lifetime;
    return { result, error };
  }
  async function request(path, { method = 'GET', navigate = false, range = '' } = {}) {
    let response;
    listeners.get('fetch')({
      request: {
        url: new URL(path, scope).href,
        method,
        mode: navigate ? 'navigate' : 'cors',
        headers: new Headers(range ? { Range: range } : {}),
      },
      respondWith(promise) {
        response = promise;
      },
    });
    return response ? await response : undefined;
  }
  return {
    scope,
    stored,
    responses,
    fetches,
    fixture,
    message,
    request,
    setOffline(value) {
      offline = value;
    },
    setGate(value) {
      gate = value;
    },
    setQuota(value) {
      quota = value;
    },
  };
}

test('离线缓存只在明确操作后建立，完整缓存包含未访问地图、字体、音乐及懒加载代码', async () => {
  const h = harness();
  const manifest = h.fixture();
  assert.equal((await h.message('status')).result.ready, false);
  assert.equal(h.fetches.length, 0);
  const progress = [];
  const cached = await h.message('cache', BUILD, (value) => progress.push({ ...value }));
  assert.equal(cached.error, undefined);
  assert.equal(cached.result.ready, true);
  assert.equal(progress.at(-1).bytes, manifest.bytes);
  assert.equal(progress.at(-1).count, manifest.resources.length);
  h.setOffline(true);
  assert.equal(
    await (await h.request('some-entry?from=bookmark', { navigate: true })).text(),
    '<html>old</html>',
  );
  assert.equal(
    await (await h.request(`assets/last-stage.webp?qinglan-build=${BUILD}`)).text(),
    'map-old',
  );
  assert.equal(await (await h.request('assets/journey-card.js')).text(), 'lazy export');
  assert.equal(await (await h.request('assets/font.woff2')).text(), 'font');
});

test('相对base单机包在根目录与任意子目录缓存、断网重开，仍拒绝外部和越界资源', async () => {
  for (const base of ['/', '/games/qinglan/']) {
    const h = harness(base);
    const manifest = h.fixture();
    manifest.base = './';
    h.responses.set(
      new URL(`offline-manifest-${BUILD}.json`, h.scope).href,
      Response.json(manifest),
    );
    assert.equal((await h.message('cache')).error, undefined);
    h.setOffline(true);
    assert.equal(await (await h.request('', { navigate: true })).text(), '<html>old</html>');
    assert.equal(await (await h.request('assets/journey-card.js')).text(), 'lazy export');
  }
  for (const path of ['https://other.test/file.js', '../file.js', '/file.js']) {
    const h = harness('/local/');
    const manifest = h.fixture();
    manifest.base = './';
    manifest.resources[0].path = path;
    h.responses.set(
      new URL(`offline-manifest-${BUILD}.json`, h.scope).href,
      Response.json(manifest),
    );
    assert.equal((await h.message('cache')).error, 'invalid-manifest');
  }
});

test('新旧版本素材隔离，成功更新后断网导航使用完整新版本', async () => {
  const h = harness();
  h.fixture();
  await h.message('cache');
  h.fixture(NEXT, 'new');
  assert.equal((await h.message('status', NEXT)).result.ready, false);
  assert.equal((await h.message('status', NEXT)).result.stored, true);
  assert.equal((await h.message('cache', NEXT)).result.ready, true);
  h.setOffline(true);
  assert.equal(
    await (await h.request(`assets/last-stage.webp?qinglan-build=${BUILD}`)).text(),
    'map-old',
  );
  assert.equal(
    await (await h.request(`assets/last-stage.webp?qinglan-build=${NEXT}`)).text(),
    'map-new',
  );
  assert.equal(await (await h.request('', { navigate: true })).text(), '<html>new</html>');
});

test('缓存后的监控目录导航保留独立页面，兼容根路径与 GitHub 子路径', async () => {
  for (const base of ['/', '/qinglan-xiuxian/']) {
    const h = harness(base);
    h.fixture(BUILD, 'game', { 'monitor/index.html': '<html>monitor</html>' });
    assert.equal((await h.message('cache')).error, undefined);
    h.setOffline(true);
    assert.equal(
      await (await h.request('monitor/?days=7', { navigate: true })).text(),
      '<html>monitor</html>',
    );
    assert.equal(
      await (await h.request('monitor/index.html', { navigate: true })).text(),
      '<html>monitor</html>',
    );
    assert.equal(await (await h.request('', { navigate: true })).text(), '<html>game</html>');
  }
});

test('完整缓存包含未访问的小说，根路径、Pages 与相对单机断网导航保持正文入口', async () => {
  for (const [base, manifestBase] of [
    ['/', '/'],
    ['/qinglan-xiuxian/', '/qinglan-xiuxian/'],
    ['/games/qinglan/', './'],
  ]) {
    const h = harness(base);
    const manifest = h.fixture(BUILD, 'game', {
      'novel/index.html': '<html>novel</html>',
      'assets/novel.js': 'chapter content',
      'assets/novel.css': 'book styles',
    });
    manifest.base = manifestBase;
    h.responses.set(
      new URL(`offline-manifest-${BUILD}.json`, h.scope).href,
      Response.json(manifest),
    );
    assert.equal((await h.message('cache')).error, undefined);
    h.setOffline(true);
    for (const path of ['novel/#chapter-42', 'novel/index.html?from=guide'])
      assert.equal(await (await h.request(path, { navigate: true })).text(), '<html>novel</html>');
    assert.equal(await (await h.request('assets/novel.js')).text(), 'chapter content');
    assert.equal(await (await h.request('assets/novel.css')).text(), 'book styles');
    assert.equal(await (await h.request('', { navigate: true })).text(), '<html>game</html>');
  }
});

test('部署资源变化、网络失败和空间不足不能标记完整，也不会破坏旧版缓存', async () => {
  for (const failure of ['changed', 'network', 'quota', 'marker-quota']) {
    const h = harness();
    h.fixture();
    await h.message('cache');
    h.fixture(NEXT, 'new');
    if (failure === 'changed')
      h.responses.set(new URL('assets/main.js', h.scope).href, new Response('wrong'));
    if (failure === 'network') h.responses.delete(new URL('assets/main.js', h.scope).href);
    if (failure === 'quota') h.setQuota(true);
    if (failure === 'marker-quota') h.setQuota('marker');
    const result = await h.message('cache', NEXT);
    assert.equal(
      result.error,
      {
        changed: 'resource-changed',
        network: 'network',
        quota: 'QuotaExceededError',
        'marker-quota': 'QuotaExceededError',
      }[failure],
    );
    h.setQuota(false);
    assert.equal(h.stored.size, 1);
    assert.equal((await h.message('status', NEXT)).result.ready, false);
    assert.equal((await h.message('status', BUILD)).result.ready, true);
    h.setOffline(true);
    assert.equal(await (await h.request('', { navigate: true })).text(), '<html>old</html>');
  }
});

test('缓存过程中重复操作受保护，取消会停止写入并允许重新缓存', async () => {
  const h = harness();
  h.fixture();
  let started;
  const waiting = new Promise((resolve) => (started = resolve));
  h.setGate(async (url, options) => {
    if (!url.pathname.endsWith('.webp')) return;
    started();
    await new Promise((resolve) =>
      options.signal.addEventListener('abort', resolve, { once: true }),
    );
  });
  const caching = h.message('cache');
  await waiting;
  assert.equal((await h.message('status')).result.busy, true);
  assert.equal((await h.message('cache')).error, 'busy');
  const cancelled = h.message('cancel');
  assert.equal((await caching).error, 'cancelled');
  assert.equal((await cancelled).result.ready, false);
  assert.equal(h.stored.size, 0);
  h.setGate(null);
  assert.equal((await h.message('cache')).result.ready, true);
});

test('资源被浏览器逐出后不再声称完整，清除操作只删除自己的作用域', async () => {
  const h = harness('/qinglan-xiuxian/');
  h.fixture();
  await h.message('cache');
  h.stored.set('other-app-cache', new Map());
  h.stored.set('qinglan-offline:/other/:version', new Map());
  const own = [...h.stored.values()][0];
  own.delete(new URL('assets/last-stage.webp', h.scope).href);
  assert.equal((await h.message('status')).result.ready, false);
  assert.equal((await h.message('cache')).result.ready, true);
  assert.equal((await h.message('clear')).result.stored, false);
  assert.deepEqual([...h.stored.keys()], ['other-app-cache', 'qinglan-offline:/other/:version']);
  assert.equal(await h.request('https://backend.test/chat', { method: 'POST' }), undefined);
  assert.equal(await h.request('chat', { method: 'POST' }), undefined);
});

test('离线音乐支持字节范围和后缀，非法范围返回 416', async () => {
  const h = harness();
  h.fixture();
  await h.message('cache');
  h.setOffline(true);
  const part = await h.request('assets/music.m4a', { range: 'bytes=2-5' });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('Content-Range'), 'bytes 2-5/10');
  assert.equal(await part.text(), '2345');
  assert.equal(await (await h.request('assets/music.m4a', { range: 'bytes=-3' })).text(), '789');
  assert.equal(await (await h.request('assets/music.m4a', { range: 'bytes=8-' })).text(), '89');
  for (const range of ['bytes=20-', 'bytes=4-1', 'bytes=-0', 'bytes=0-1,4-5', 'bytes=-'])
    assert.equal((await h.request('assets/music.m4a', { range })).status, 416);
});

test('清单越界、重复或缺少首页时拒绝缓存', async () => {
  for (const bad of ['../private', '/outside', 'https://other.test/a', 'duplicate', 'no-index']) {
    const h = harness('/qinglan-xiuxian/');
    const manifest = h.fixture();
    if (bad === 'duplicate') manifest.resources.push(manifest.resources[0]);
    else if (bad === 'no-index') manifest.resources[0].path = 'missing.html';
    else manifest.resources[0].path = bad;
    h.responses.set(
      new URL(`offline-manifest-${BUILD}.json`, h.scope).href,
      Response.json(manifest),
    );
    assert.equal((await h.message('cache')).error, 'invalid-manifest');
    assert.equal((await h.message('status')).result.ready, false);
  }
});

test('构建清单收录完整输出并校验内容，部署子路径和资源变化进入构建号', () => {
  const root = mkdtempSync(join(tmpdir(), 'qinglan-manifest-'));
  try {
    for (const dir of [
      'src',
      'public/assets',
      'scripts',
      'monitor',
      'novel',
      'docs',
      'output/assets',
    ])
      mkdirSync(join(root, dir), { recursive: true });
    for (const path of [
      'index.html',
      'monitor/index.html',
      'novel/index.html',
      'docs/novel.md',
      'vite.config.ts',
      'scripts/offline-build.ts',
      'package-lock.json',
      'src/main.ts',
      'public/assets/map.webp',
      'output/index.html',
      'output/assets/lazy.js',
    ])
      writeFileSync(join(root, path), path);
    function build(base, mode = 'production') {
      const plugin = offlineBuild('test-v1');
      const config = { root, base, command: 'build', define: {}, build: { outDir: 'output' } };
      config.mode = mode;
      plugin.configResolved(config);
      plugin.closeBundle();
      return {
        manifest: JSON.parse(readFileSync(join(root, 'output/offline-manifest.json'), 'utf8')),
        config,
        plugin,
      };
    }
    const initial = build('/qinglan-xiuxian/');
    const preload = initial.plugin.transformIndexHtml('', { filename: join(root, 'index.html') });
    assert.deepEqual(preload, [
      {
        tag: 'link',
        attrs: {
          rel: 'preload',
          as: 'image',
          href: `/qinglan-xiuxian/assets/sect-market-buildings.webp?qinglan-build=${initial.manifest.build}`,
        },
        injectTo: 'head-prepend',
      },
    ]);
    assert.equal(
      initial.plugin.transformIndexHtml('', { filename: join(root, 'monitor/index.html') }),
      undefined,
    );
    assert.equal(initial.manifest.base, '/qinglan-xiuxian/');
    assert.equal(initial.manifest.resources.length, 2);
    assert.equal(
      initial.manifest.resources[0].sha256,
      digest(Buffer.from('output/assets/lazy.js')),
    );
    assert.equal(initial.manifest.build, build('/qinglan-xiuxian/').manifest.build);
    assert.notEqual(initial.manifest.build, build('/').manifest.build);
    assert.notEqual(
      initial.manifest.build,
      build('/qinglan-xiuxian/', 'standalone').manifest.build,
    );
    writeFileSync(join(root, 'novel/index.html'), 'novel page changed');
    const novelPageChanged = build('/qinglan-xiuxian/');
    assert.notEqual(initial.manifest.build, novelPageChanged.manifest.build);
    writeFileSync(join(root, 'docs/novel.md'), 'novel text changed');
    const novelTextChanged = build('/qinglan-xiuxian/');
    assert.notEqual(novelPageChanged.manifest.build, novelTextChanged.manifest.build);
    writeFileSync(join(root, 'monitor/index.html'), 'monitor changed');
    const monitorChanged = build('/qinglan-xiuxian/');
    assert.notEqual(novelTextChanged.manifest.build, monitorChanged.manifest.build);
    writeFileSync(join(root, 'public/assets/map.webp'), 'changed');
    assert.notEqual(monitorChanged.manifest.build, build('/qinglan-xiuxian/').manifest.build);
    assert.match(
      initial.plugin.transform("body{background:url('/assets/map.webp')}", 'src/style.css'),
      new RegExp(`qinglan-build=${initial.manifest.build}`),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('构建产物与清单不收录 public 复制来的点文件，输出目录原有 .git 保留', () => {
  const root = mkdtempSync(join(tmpdir(), 'qinglan-dotfiles-'));
  try {
    for (const dir of ['src', 'scripts', 'monitor', 'novel', 'docs', 'output/.git'])
      mkdirSync(join(root, dir), { recursive: true });
    for (const path of [
      'index.html',
      'monitor/index.html',
      'novel/index.html',
      'docs/novel.md',
      'vite.config.ts',
      'scripts/offline-build.ts',
      'package-lock.json',
      'src/main.ts',
      'output/index.html',
      'output/.git/HEAD',
    ])
      writeFileSync(join(root, path), path);
    // 模拟 Vite 把 public 原样复制进输出目录。
    for (const path of ['.DS_Store', 'assets/map.webp', 'assets/.opencode/node_modules/x.js'])
      for (const dir of ['public', 'output']) {
        mkdirSync(join(root, dir, path, '..'), { recursive: true });
        writeFileSync(join(root, dir, path), path);
      }
    const plugin = offlineBuild('test-v1');
    plugin.configResolved({
      root,
      mode: 'production',
      base: '/',
      command: 'build',
      define: {},
      publicDir: join(root, 'public'),
      build: { outDir: 'output' },
    });
    plugin.closeBundle();
    const paths = JSON.parse(
      readFileSync(join(root, 'output/offline-manifest.json'), 'utf8'),
    ).resources.map((entry) => entry.path);
    assert.ok(paths.includes('assets/map.webp'));
    assert.ok(!paths.some((path) => path.includes('.DS_Store') || path.includes('.opencode')));
    assert.equal(existsSync(join(root, 'output/.DS_Store')), false);
    assert.equal(existsSync(join(root, 'output/assets/.opencode')), false);
    assert.equal(existsSync(join(root, 'output/.git/HEAD')), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

for (const base of ['/', '/qinglan-xiuxian/']) {
  test(`缓存原文经普通导航可在离线时作为附件下载：${base}`, async () => {
    const h = harness(base);
    const path = 'assets/novel-abCD_12.md';
    const text = '# 青岚纪 · 不系舟\n\n山河未尽。\n';
    h.fixture(BUILD, 'book', { [path]: text });
    assert.equal((await h.message('cache')).error, undefined);
    for (const offline of [false, true]) {
      h.setOffline(offline);
      for (const navigate of [false, true]) {
        const response = await h.request(path, { navigate });
        assert.equal(response.status, 200);
        assert.match(response.headers.get('Content-Disposition'), /^attachment;/);
        assert.ok(
          response.headers
            .get('Content-Disposition')
            .includes(encodeURIComponent('青岚纪_不系舟.md')),
        );
        assert.equal(await response.text(), text);
      }
    }
    const html = await h.request('index.html', { navigate: true });
    assert.equal(html.headers.has('Content-Disposition'), false, '正常页面不能被误作附件');
  });
}
