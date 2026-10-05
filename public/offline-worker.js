/* 可选离线资源缓存：只有玩家点击设置面板里的按钮才建立完整缓存。 */
const scope = self.registration.scope;
const prefix = `qinglan-offline:${new URL(scope).pathname}:`;
const marker = new URL('.offline-complete', scope).href;
let task = null;

function resourceUrl(path) {
  const url = new URL(path, scope);
  if (
    !path ||
    path.startsWith('/') ||
    path.includes('\\') ||
    path.split('/').some((part) => part === '..' || part === '.') ||
    url.origin !== new URL(scope).origin ||
    !url.href.startsWith(scope) ||
    url.search ||
    url.hash
  )
    throw new Error('invalid-manifest');
  return url.href;
}

function validateManifest(manifest, build) {
  if (
    manifest.schema !== 1 ||
    manifest.build !== build ||
    !/^[a-f0-9]{24}$/.test(build) ||
    manifest.base !== new URL(scope).pathname ||
    typeof manifest.version !== 'string' ||
    !Array.isArray(manifest.resources) ||
    manifest.resources.length === 0
  )
    throw new Error('invalid-manifest');
  const paths = new Set();
  let bytes = 0;
  for (const entry of manifest.resources) {
    resourceUrl(entry.path);
    if (
      paths.has(entry.path) ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 0 ||
      !/^[a-f0-9]{64}$/.test(entry.sha256)
    )
      throw new Error('invalid-manifest');
    paths.add(entry.path);
    bytes += entry.bytes;
  }
  if (!paths.has('index.html') || bytes !== manifest.bytes) throw new Error('invalid-manifest');
  return manifest;
}

async function completeCaches() {
  const completed = [];
  for (const name of await caches.keys()) {
    if (!name.startsWith(prefix)) continue;
    const cache = await caches.open(name);
    const response = await cache.match(marker);
    if (!response) continue;
    try {
      const saved = await response.json();
      const manifest = validateManifest(saved.manifest, name.slice(prefix.length));
      completed.push({ name, cache, manifest, completedAt: saved.completedAt });
    } catch {
      // 不认残缺或其他协议写入的缓存。
    }
  }
  return completed.sort((a, b) => b.completedAt - a.completedAt);
}

async function status(build) {
  const completed = await completeCaches();
  // 也检查键是否仍在：系统逐出资源后不能继续声称全部可离线。
  const usable = [];
  for (const entry of completed) {
    const keys = new Set((await entry.cache.keys()).map((request) => request.url));
    if (entry.manifest.resources.every((resource) => keys.has(resourceUrl(resource.path))))
      usable.push(entry.manifest.build);
  }
  return {
    ready: usable.includes(build),
    stored: usable.length > 0,
    busy: !!task,
    progress: task?.progress,
  };
}

async function download(build, port) {
  try {
    return await cacheBuild(build, port);
  } catch (error) {
    // 完成标记或元数据写入也可能失败，不能遗留整包半成品。
    if (/^[a-f0-9]{24}$/.test(build)) {
      const name = prefix + build;
      if ((await caches.keys()).includes(name)) {
        const cache = await caches.open(name);
        if (!(await cache.match(marker))) await caches.delete(name);
      }
    }
    throw error;
  }
}

async function cacheBuild(build, port) {
  const controller = task.controller;
  const signal = controller.signal;
  if (!/^[a-f0-9]{24}$/.test(build)) throw new Error('invalid-manifest');
  if ((await status(build)).ready) return status(build);
  const name = prefix + build;
  const manifestUrl = new URL(`offline-manifest-${build}.json`, scope);
  const manifestTimeout = setTimeout(() => controller.abort(), 60000);
  let manifest;
  try {
    const response = await fetch(manifestUrl, { cache: 'no-store', signal });
    if (!response.ok) throw new Error('network');
    manifest = validateManifest(await response.json(), build);
  } finally {
    clearTimeout(manifestTimeout);
  }
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  await caches.delete(name);
  const cache = await caches.open(name);
  let next = 0;
  const progress = {
    count: 0,
    total: manifest.resources.length,
    bytes: 0,
    totalBytes: manifest.bytes,
  };
  task.progress = progress;
  port.postMessage({ progress });
  let firstError;
  // 等全部并行请求退出后再删除未完成缓存，防止取消后仍写回资源。
  const workers = Array.from({ length: 3 }, async () => {
    while (next < manifest.resources.length && !signal.aborted) {
      const entry = manifest.resources[next++];
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 60000);
      try {
        const url = resourceUrl(entry.path);
        const requestUrl = new URL(url);
        requestUrl.searchParams.set('qinglan-build', build);
        const fetched = await fetch(requestUrl, { cache: 'no-store', signal });
        if (!fetched.ok) throw new Error('network');
        const contents = await fetched.arrayBuffer();
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', contents)))
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join('');
        if (contents.byteLength !== entry.bytes || digest !== entry.sha256)
          throw new Error('resource-changed');
        if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
        const headers = new Headers(fetched.headers);
        headers.delete('content-encoding');
        headers.delete('transfer-encoding');
        headers.set('content-length', String(contents.byteLength));
        await cache.put(url, new Response(contents, { headers }));
        progress.count++;
        progress.bytes += entry.bytes;
        port.postMessage({ progress: { ...progress } });
      } catch (error) {
        firstError ??= timedOut ? new Error('network') : error;
        controller.abort();
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }
  });
  const results = await Promise.allSettled(workers);
  const failure = results.find((result) => result.status === 'rejected');
  if (failure || signal.aborted) {
    await caches.delete(name);
    throw firstError || new DOMException('Cancelled', 'AbortError');
  }
  await cache.put(manifestUrl.href, new Response(JSON.stringify(manifest)));
  // 完成标记最后写；旧版本只有在新版本完整后才有可能清理。
  await cache.put(marker, new Response(JSON.stringify({ manifest, completedAt: Date.now() })));
  const completed = await completeCaches();
  // 保留最近两套完整资源：更新中断不伤旧版，也避免每次更新无限占用空间。
  for (const old of completed.slice(2)) await caches.delete(old.name);
  return status(build);
}

self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('message', (event) => {
  const port = event.ports[0];
  if (!port) return;
  const { action, build } = event.data || {};
  event.waitUntil(
    (async () => {
      try {
        let result;
        if (action === 'status') result = await status(build);
        else if (action === 'cache') {
          if (task) throw new Error('busy');
          // 先占位，避免多个页面同时写同一缓存。
          task = { controller: new AbortController() };
          const promise = download(build, port);
          task.promise = promise;
          try {
            result = await promise;
          } finally {
            task = null;
          }
          result.busy = false;
        } else if (action === 'cancel') {
          task?.controller?.abort();
          await task?.promise?.catch(() => {});
          result = await status(build);
        } else if (action === 'clear') {
          task?.controller?.abort();
          await task?.promise?.catch(() => {});
          for (const name of await caches.keys()) {
            if (name.startsWith(prefix)) await caches.delete(name);
          }
          result = await status(build);
        } else throw new Error('invalid-action');
        port.postMessage({ result });
      } catch (error) {
        port.postMessage({
          error:
            error.name === 'AbortError'
              ? 'cancelled'
              : error.name === 'QuotaExceededError'
                ? error.name
                : error.message,
        });
      } finally {
        port.close();
      }
    })(),
  );
});

async function ranged(response, range) {
  const contents = await response.arrayBuffer();
  const length = contents.byteLength;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  let start = match?.[1] ? Number(match[1]) : 0;
  let end = match?.[2] ? Number(match[2]) : length - 1;
  if (match && !match[1] && match[2]) {
    start = Math.max(0, length - Number(match[2]));
    end = length - 1;
  }
  if (!match || (!match[1] && !match[2]) || start > end || start >= length || end < 0)
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${length}` } });
  end = Math.min(end, length - 1);
  const headers = new Headers(response.headers);
  headers.set('Content-Range', `bytes ${start}-${end}/${length}`);
  headers.set('Content-Length', String(end - start + 1));
  headers.set('Accept-Ranges', 'bytes');
  return new Response(contents.slice(start, end + 1), { status: 206, headers });
}

async function handleFetch(request) {
  const url = new URL(request.url);
  const completed = await completeCaches();
  if (request.mode === 'navigate') {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      const response = await fetch(request, { signal: controller.signal });
      if (response.ok) return response;
      throw new Error('network');
    } catch (error) {
      for (const entry of completed) {
        const response = await entry.cache.match(resourceUrl('index.html'));
        if (response) return response;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  const build = url.searchParams.get('qinglan-build');
  url.searchParams.delete('qinglan-build');
  for (const entry of completed) {
    if (build && entry.manifest.build !== build) continue;
    const response = await entry.cache.match(url.href);
    if (!response) continue;
    const range = request.headers.get('Range');
    return range ? ranged(response, range) : response;
  }
  return fetch(request);
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || !url.href.startsWith(scope)) return;
  event.respondWith(handleFetch(event.request));
});
