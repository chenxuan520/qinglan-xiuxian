import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../workers/npc-ai/index.ts';
import { DEBUG_SETTINGS } from '../src/setting.ts';
import { debugAccess } from '../src/debug-access.ts';
import { DebugEntry } from '../src/debug-entry.ts';
import { debugGrant, type DebugGrant } from '../src/debug-resources.ts';
import type { DebugHost } from '../src/debug-panel.ts';
import { freshSave, readSave, SAVE_SCHEMA } from '../src/progress.ts';
import { TREASURES } from '../src/data.ts';
import { CURIO_IDS } from '../src/curio-data.ts';
import { MEDICINES } from '../src/medicine-data.ts';

const origin = 'https://xiuxian.011203.xyz';
const accessRequest = (method = 'GET', site = origin) =>
  new Request('https://npc.example' + DEBUG_SETTINGS.path, { method, headers: { Origin: site } });

test('Worker 调试开关默认关闭，仅明确true开放；两站与本机CORS均正常且禁止缓存', async () => {
  for (const setting of [undefined, '', 'false', 'TRUE', '1', 'true']) {
    for (const site of [origin, 'https://chenxuan520.github.io', 'http://localhost:5173']) {
      const env = {
        ALLOWED_ORIGINS: origin + ',https://chenxuan520.github.io',
        DEBUG_MODE_ENABLED: setting,
        AI: {
          run() {
            throw Error('调试不能调用AI');
          },
        },
      };
      const r = await worker.fetch(accessRequest('GET', site), env as any);
      assert.equal(r.status, 200);
      assert.deepEqual(await r.json(), { enabled: setting === 'true' });
      assert.equal(r.headers.get('Cache-Control'), 'no-store');
      assert.equal(r.headers.get('Access-Control-Allow-Origin'), site);
      assert.equal(r.headers.get('Access-Control-Allow-Methods'), 'GET, OPTIONS');
    }
  }
  const env = { ALLOWED_ORIGINS: origin, DEBUG_MODE_ENABLED: 'true' } as any;
  assert.equal((await worker.fetch(accessRequest('OPTIONS'), env)).status, 204);
  for (const method of ['POST', 'PUT', 'DELETE'])
    assert.equal((await worker.fetch(accessRequest(method), env)).status, 405);
  for (const site of ['', origin + '.evil', 'https://evil.example'])
    assert.equal((await worker.fetch(accessRequest('GET', site), env)).status, 403);
});

test('客户端准入不缓存许可，每次向Worker请求；异常、假值与旧格式都关闭', async () => {
  const replies: unknown[] = [
    { enabled: true },
    { enabled: false },
    { enabled: 'true' },
    { allowed: true },
    null,
    {},
  ];
  const calls: RequestInit[] = [];
  const fetcher = async (url: any, options: any) => {
    assert.equal(url, 'https://npc.example' + DEBUG_SETTINGS.path);
    calls.push(options);
    return Response.json(replies.shift());
  };
  for (const expected of [
    'enabled',
    'disabled',
    'unavailable',
    'unavailable',
    'unavailable',
    'unavailable',
  ])
    assert.equal(await debugAccess('https://npc.example', fetcher as any), expected);
  assert.equal(calls.length, 6);
  for (const options of calls) {
    assert.equal(options.method, 'GET');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.credentials, 'omit');
    assert.ok(options.signal instanceof AbortSignal);
  }
  for (const fetcher of [
    async () => new Response('x', { status: 503 }),
    async () => new Response('no json'),
    async () => {
      throw Error('offline');
    },
  ])
    assert.equal(await debugAccess('https://npc.example', fetcher as any), 'unavailable');
});

test('准入请求超时会终止，不能无限停留或放行', { timeout: 10000 }, async () => {
  let aborted = false;
  const fetcher = (_url: unknown, options: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      options.signal!.addEventListener('abort', () => {
        aborted = true;
        reject(new Error('aborted'));
      });
    });
  assert.equal(await debugAccess('https://npc.example', fetcher as any), 'unavailable');
  assert.equal(aborted, true);
});

function entryHarness() {
  let about = true,
    now = 0,
    loads = 0,
    opens = 0;
  const host = { canOpen: () => about, toast: () => {} } as DebugHost;
  const module = {
    openDebugPanel: async (_host: DebugHost, current: () => boolean) => {
      if (current()) opens++;
    },
  };
  const entry = new DebugEntry(
    host,
    async () => {
      loads++;
      return module;
    },
    () => now,
  );
  const button = { isConnected: true } as HTMLElement;
  return {
    entry,
    button,
    module,
    setAbout: (v: boolean) => {
      about = v;
    },
    time: (v: number) => {
      now = v;
    },
    counts: () => ({ loads, opens }),
  };
}
test('隐藏入口仅版本号连续七次触发，超时、换页和换元素均重计', async () => {
  const h = entryHarness();
  for (let i = 0; i < 6; i++) await h.entry.tap(h.button);
  assert.deepEqual(h.counts(), { loads: 0, opens: 0 });
  h.time(DEBUG_SETTINGS.tapWindowMs + 1);
  await h.entry.tap(h.button);
  assert.deepEqual(h.counts(), { loads: 0, opens: 0 });
  const second = { isConnected: true } as HTMLElement;
  for (let i = 0; i < 6; i++) await h.entry.tap(second);
  assert.deepEqual(h.counts(), { loads: 0, opens: 0 });
  await h.entry.tap(second);
  assert.deepEqual(h.counts(), { loads: 1, opens: 1 });
  h.setAbout(false);
  for (let i = 0; i < 7; i++) await h.entry.tap(h.button);
  assert.deepEqual(h.counts(), { loads: 1, opens: 1 });
});

test('连点并发只载入一次，离开关于后迟到模块不得打开面板', async () => {
  const h = entryHarness();
  let resolve!: (v: any) => void;
  const host = { canOpen: () => true, toast: () => {} } as DebugHost;
  const button = { isConnected: true } as HTMLElement;
  let loads = 0;
  const e = new DebugEntry(
    host,
    () => {
      loads++;
      return new Promise((r) => {
        resolve = r;
      });
    },
    () => 0,
  );
  for (let i = 0; i < 6; i++) await e.tap(button);
  const pending = e.tap(button);
  for (let i = 0; i < 20; i++) await e.tap(button);
  assert.equal(loads, 1);
  Object.assign(button, { isConnected: false });
  resolve(h.module);
  await pending;
  assert.equal(h.counts().opens, 0);
});

const request = (kind: string, id = '', quantity = 1, forge = 0): DebugGrant => ({
  kind,
  id,
  quantity,
  forge,
});
test('五类发放只返回副本，可按原存档格式保存读回；本命、功法、配方、年岁及修为保留', () => {
  let s = freshSave();
  s.prologueSeen = true;
  s.cultivation = 123;
  s.stones = 12;
  s.iron = 14;
  const original = structuredClone(s);
  const grants = [
    request('stones', '', 1000),
    request('iron', '', 1000),
    ...TREASURES.map((t) => request('artifact', t.id, 1, 10)),
    ...MEDICINES.map((m) => request('medicine', m.id, 7)),
    ...CURIO_IDS.map((id) => request('curio', id, 1)),
  ];
  for (const input of grants) {
    const before = structuredClone(s);
    const result = debugGrant(s, input);
    assert.ok('next' in result);
    assert.deepEqual(s, before);
    s = result.next!;
    const read = readSave(JSON.stringify(s));
    assert.equal(read.status, 'ok');
    assert.equal(read.save.schema, SAVE_SCHEMA);
    assert.deepEqual(read.save.artifacts, s.artifacts);
    for (const t of TREASURES) assert.equal(read.save.forge[t.id] || 0, s.forge[t.id] || 0);
    assert.deepEqual(read.save.medicine, s.medicine);
    assert.deepEqual(read.save.curios, s.curios);
  }
  assert.equal(s.stones, 1012);
  assert.equal(s.iron, 1014);
  assert.equal(s.artifacts.length, TREASURES.length);
  assert.equal(s.starter, original.starter);
  assert.equal(s.path, original.path);
  assert.equal(s.age, original.age);
  assert.equal(s.cultivation, 123);
  assert.deepEqual(s.mortal, original.mortal);
  assert.deepEqual(s.medicine.recipes, original.medicine.recipes);
  assert.equal(s.medicine.recipeSeed, original.medicine.recipeSeed);
});

test('重复法宝不复制、不降低炼器，清除对应待领和已售标记', () => {
  const s = freshSave();
  s.artifacts = ['sword'];
  s.starter = 'sword';
  s.forge.sword = 9;
  s.artifactDrops = ['sword', 'fire'];
  s.mortal.auction = {
    hall: 0,
    visit: 1,
    closed: [],
    releasedArtifacts: ['sword', 'fire'],
    history: [],
  };
  const result = debugGrant(s, request('artifact', 'sword', 1, 1));
  assert.ok('next' in result);
  const next = result.next!;
  assert.deepEqual(next.artifacts, ['sword']);
  assert.equal(next.forge.sword, 9);
  assert.deepEqual(next.artifactDrops, ['fire']);
  assert.deepEqual(next.mortal.auction!.releasedArtifacts, ['fire']);
  assert.equal(next.starter, 'sword');
});

test('无效数量、物品、阶数和溢出被拒绝，原存档不会部分改变', () => {
  const s = freshSave();
  const inputs = [
    ...['stones', 'iron', 'medicine', 'curio'].flatMap((kind) =>
      [0, -1, 0.5, NaN, Infinity, 1000001].map((q) =>
        request(kind, kind === 'medicine' ? 'heqi' : 'heaven-bottle', q),
      ),
    ),
    request('artifact', 'sword', 1, 11),
    request('artifact', 'sword', 1, -1),
    request('artifact', 'sword', 1, 0.5),
    ...['artifact', 'medicine', 'curio'].map((kind) => request(kind, '__proto__')),
    request('unknown'),
  ];
  for (const input of inputs) {
    const before = structuredClone(s);
    assert.ok('error' in debugGrant(s, input));
    assert.deepEqual(s, before);
  }
  for (const kind of ['stones', 'iron'] as const) {
    s[kind] = Number.MAX_SAFE_INTEGER;
    assert.ok('error' in debugGrant(s, request(kind)));
  }
  s.medicine.bag.heqi = Number.MAX_SAFE_INTEGER;
  assert.ok('error' in debugGrant(s, request('medicine', 'heqi')));
  s.curios.bag['heaven-bottle'] = Number.MAX_SAFE_INTEGER;
  assert.ok('error' in debugGrant(s, request('curio', 'heaven-bottle')));
});
