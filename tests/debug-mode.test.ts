import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../workers/npc-ai/index.ts';
import { DEBUG_SETTINGS } from '../src/setting.ts';
import { debugAccess } from '../src/debug-access.ts';
import { DebugEntry } from '../src/debug-entry.ts';
import {
  DEBUG_REALMS,
  DEBUG_STAGES,
  debugCultivationRemaining,
  debugGrant,
  type DebugGrant,
} from '../src/debug-resources.ts';
import { openDebugPanel, type DebugHost } from '../src/debug-panel.ts';
import {
  freshSave,
  readSave,
  SAVE_SCHEMA,
  realmInfo,
  realmCost,
  IMMORTAL_CULTIVATION,
  TRIBULATION_INTERVAL,
  lifespanInfo,
} from '../src/progress.ts';
import { DIFFICULTIES, FINAL_TRIAL_STAGE, STAGES, TREASURES } from '../src/data.ts';
import { CURIO_IDS } from '../src/curio-data.ts';
import { MEDICINES } from '../src/medicine-data.ts';
import { spiritPower } from '../src/spirit-power.ts';
import { enemyCombatStats } from '../src/enemy-stats.ts';

const origin = 'https://xiuxian.011203.xyz';
const accessRequest = (method = 'GET', site = origin) =>
  new Request('https://npc.example' + DEBUG_SETTINGS.path, { method, headers: { Origin: site } });

test('普通Worker发布保留线上调试开关，配置不再覆盖同名变量', () => {
  const config = readFileSync(new URL('../workers/npc-ai/wrangler.jsonc', import.meta.url), 'utf8');
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.doesNotMatch(config, /"DEBUG_MODE_ENABLED"\s*:/);
  assert.match(pkg.scripts['deploy:npc-ai'], /wrangler deploy[^&]* --keep-vars(?:\s|$)/);
});

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

test('直达所有小境界到渡劫，使用真实累计门槛并记录突破；不改年岁本命或通关', () => {
  let s = freshSave();
  const before = structuredClone(s);
  for (const target of DEBUG_REALMS) {
    const original = structuredClone(s);
    const result = debugGrant(s, request('realm', target.id));
    assert.ok(result.next, result.error);
    assert.deepEqual(s, original);
    s = result.next;
    const realm = realmInfo(s.cultivation, false);
    assert.equal(realm.name, target.name);
    assert.equal(realm.max, false);
    assert.equal(s.age, before.age);
    assert.equal(s.starter, before.starter);
    assert.deepEqual(s.completed, before.completed);
    assert.deepEqual(s.medicine, before.medicine);
    assert.equal(
      s.cultivation,
      target.id === '0'
        ? 1
        : Array.from({ length: +target.id }, (_, i) => realmCost(i)).reduce((a, b) => a + b, 0),
    );
    if (+target.id >= 21) assert.equal(s.nextTribulationAge, s.age + TRIBULATION_INTERVAL);
    assert.equal(readSave(JSON.stringify(s)).save.cultivation, s.cultivation);
    assert.ok('error' in debugGrant(s, request('realm', target.id)));
  }
  assert.equal(s.cultivation, IMMORTAL_CULTIVATION);
  assert.equal(debugCultivationRemaining(s), 0);
  assert.ok(Object.hasOwn(s.chronicle.milestones, 'ascension'));
  assert.ok(!Object.hasOwn(s.chronicle.milestones, 'realm-24'));
});

test('指定修为精确增加，边界跨入渡劫但不真仙；无效、超限或低境界请求不部分发放', () => {
  const s = freshSave();
  s.cultivation = IMMORTAL_CULTIVATION - 2;
  const result = debugGrant(s, request('cultivation', '', 2));
  assert.ok(result.next, result.error);
  assert.equal(result.next.cultivation, IMMORTAL_CULTIVATION);
  assert.equal(realmInfo(result.next.cultivation).name, '渡劫');
  assert.equal(s.cultivation, IMMORTAL_CULTIVATION - 2);
  for (const input of [
    ...[0, -1, 0.5, NaN, Infinity, 3, Number.MAX_SAFE_INTEGER].map((n) =>
      request('cultivation', '', n),
    ),
    ...['', '-1', '0', '21', '25', '24.0', '真仙', '__proto__'].map((id) => request('realm', id)),
  ]) {
    const before = structuredClone(s);
    assert.ok('error' in debugGrant(s, input));
    assert.deepEqual(s, before);
  }
  for (const base of [result.next, { ...s, completed: [FINAL_TRIAL_STAGE] }]) {
    for (const input of [request('cultivation'), request('realm', '24')])
      assert.ok('error' in debugGrant(base, input));
  }
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

test('关卡解锁按第1至7境映射，仅修改副本unlocked，保存读回不补修为或通关', () => {
  assert.deepEqual(
    DEBUG_STAGES.map((target) => [target.id, target.stage, target.name]),
    STAGES.map((stage, index) => [String(index + 1), index, `第${index + 1}境 · ${stage.name}`]),
  );
  for (const target of DEBUG_STAGES.slice(1)) {
    const save = freshSave('dual', ['metal', 'wood'], 'dual', () => 0.5);
    save.cultivation = 123;
    save.age = 18;
    save.stones = 29;
    save.iron = 31;
    save.training.power = 4;
    save.forge[save.starter] = 3;
    save.factsTampered = true;
    const before = structuredClone(save);
    const result = debugGrant(save, request('stage', target.id));
    assert.ok(result.next, result.error);
    assert.notEqual(result.next, save);
    assert.deepEqual(save, before);
    assert.deepEqual(result.next, { ...before, unlocked: target.stage });
    assert.match(result.message!, /未补修为或发放通关奖励/);
    const restored = readSave(JSON.stringify(result.next));
    assert.equal(restored.status, 'ok');
    assert.equal(restored.save.unlocked, target.stage);
    assert.equal(restored.save.cultivation, before.cultivation);
    assert.deepEqual(restored.save.completed, before.completed);
    assert.equal(restored.save.factsTampered, true);
  }
});

test('第1境边界、已解锁、低关和重复请求不降级、不重复保存', () => {
  for (let current = 0; current < STAGES.length; current++) {
    for (const target of DEBUG_STAGES) {
      const save = freshSave();
      save.unlocked = current;
      const before = structuredClone(save);
      const result = debugGrant(save, request('stage', target.id));
      if (target.stage <= current) {
        assert.ok('error' in result);
        assert.match(result.error!, /已解锁/);
      } else {
        assert.ok(result.next, result.error);
        assert.equal(result.next.unlocked, target.stage);
        assert.ok('error' in debugGrant(result.next, request('stage', target.id)));
      }
      assert.deepEqual(save, before);
    }
  }
});

test('关卡输入严格拒绝越界、非整数、数值别名和非字符串，错误原子不修改存档', () => {
  const save = freshSave();
  for (const id of [
    '',
    '0',
    '8',
    '-1',
    '1.5',
    '2.0',
    '2e0',
    '0x2',
    '02',
    ' 2',
    '2 ',
    '2\n',
    'Infinity',
    'NaN',
    '__proto__',
    null,
    undefined,
    2,
    NaN,
    Infinity,
  ]) {
    const before = structuredClone(save);
    const result = debugGrant(save, request('stage', id as string));
    assert.ok('error' in result, String(id));
    assert.match(result.error!, /有效关卡/);
    assert.deepEqual(save, before);
  }
});

test('解锁终关前后真实灵威、气血伤害、寿元与各关各难度妖物派生数值相同', () => {
  for (const root of ['heaven', 'none'] as const) {
    const save = freshSave(root, root === 'heaven' ? ['metal'] : [], 'orthodox', () => 0.5);
    save.cultivation = 123;
    save.training.vitality = 3;
    save.training.power = 2;
    save.forge[save.starter] = 4;
    const before = structuredClone(save);
    // spiritPower只构造真实入场属性，不推进任何一帧或运行胜率模拟。
    const power = spiritPower(save);
    const realm = realmInfo(save.cultivation);
    const life = lifespanInfo(save);
    const enemies = STAGES.flatMap((_, stage) =>
      DIFFICULTIES.flatMap((_, difficulty) => [
        enemyCombatStats(stage, difficulty, 90, 0),
        enemyCombatStats(stage, difficulty, 180, 0, false, true),
      ]),
    );
    const result = debugGrant(save, request('stage', '7'));
    assert.ok(result.next, result.error);
    assert.deepEqual(spiritPower(result.next), power);
    assert.deepEqual(realmInfo(result.next.cultivation), realm);
    assert.deepEqual(lifespanInfo(result.next), life);
    assert.deepEqual(
      STAGES.flatMap((_, stage) =>
        DIFFICULTIES.flatMap((_, difficulty) => [
          enemyCombatStats(stage, difficulty, 90, 0),
          enemyCombatStats(stage, difficulty, 180, 0, false, true),
        ]),
      ),
      enemies,
    );
    assert.deepEqual(save, before);
    assert.deepEqual(result.next, { ...before, unlocked: 6 });
  }
});

// 仅为真实openDebugPanel提供最小表单/网络/持久化替身；浏览器布局与真实存储由主线程验收。
function stagePanelHarness(t: TestContext) {
  const save = freshSave();
  const controls = new Map<string, any>();
  const status = { textContent: '' },
    stock = { textContent: '' };
  const submit = { disabled: false, textContent: '' },
    fieldset = { disabled: false };
  const kind = { value: 'stones', onchange: () => {} };
  controls.set('kind', kind);
  const form = {
    elements: { namedItem: (name: string) => controls.get(name) ?? null },
    onsubmit: null as null | ((event: { preventDefault(): void }) => void),
  };
  let fieldsHtml = '',
    shown = '',
    blocked = '',
    active = true,
    connected = true;
  let writes = 0,
    saved = '',
    requests = 0,
    failure: 'false' | 'throw' | null = null;
  const replies: (() => Promise<Response>)[] = [];
  const fields = {
    set innerHTML(html: string) {
      fieldsHtml = html;
      for (const name of ['id', 'quantity', 'forge']) controls.delete(name);
      const selection = /<select name="id"[^>]*>([^]*?)<\/select>/.exec(html);
      if (selection) {
        const options = [
          ...selection[1].matchAll(/<option value="([^"]*)">([^]*?)<\/option>/g),
        ].map((match) => ({ value: match[1], textContent: match[2], disabled: false }));
        controls.set('id', {
          value: options[0]?.value ?? '',
          options,
          onchange: () => {},
          addEventListener(_type: string, handler: () => void) {
            this.onchange = handler;
          },
        });
      }
      for (const match of html.matchAll(/<input ([^>]+)>/g)) {
        const name = /name="([^"]+)"/.exec(match[1])![1];
        controls.set(name, { value: /value="([^"]*)"/.exec(match[1])?.[1] ?? '', max: '' });
      }
    },
    querySelector: (selector: string) =>
      selector === 'select' ? (controls.get('id') ?? null) : null,
  };
  const nodes: Record<string, unknown> = {
    form,
    fieldset,
    '#debug-fields': fields,
    '#debug-status': status,
    '#debug-stock': stock,
    'button[type="submit"]': submit,
  };
  const root = {
    get isConnected() {
      return connected;
    },
    querySelector: (selector: string) => nodes[selector],
  };
  t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    return replies.length ? replies.shift()!() : Response.json({ enabled: true });
  });
  t.mock.method(globalThis, 'FormData', function (target: unknown) {
    assert.equal(target, form);
    return { get: (name: string) => controls.get(name)?.value ?? null } as FormData;
  });
  const host: DebugHost = {
    modal: { querySelector: () => root } as unknown as HTMLElement,
    endpoint: 'https://npc.example',
    getSave: () => save,
    canOpen: () => true,
    active: () => active,
    blocked: () => blocked,
    show: (html) => {
      shown = html;
    },
    toast: () => {},
    commit(next) {
      writes++;
      if (failure === 'throw') throw new Error('storage failure');
      if (failure === 'false') return false;
      saved = JSON.stringify(next);
      Object.assign(save, next);
      return true;
    },
  };
  const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
  return {
    save,
    status,
    stock,
    submit,
    fieldset,
    controls,
    open: () => openDebugPanel(host, () => active),
    stage(id = '7') {
      kind.value = 'stage';
      kind.onchange();
      const selection = controls.get('id');
      selection.value = id;
      selection.onchange();
    },
    send: () => form.onsubmit!({ preventDefault() {} }),
    flush,
    html: () => ({ shown, fields: fieldsHtml }),
    counts: () => ({ writes, requests, saved }),
    failSave: (value: typeof failure) => {
      failure = value;
    },
    block: (value: string) => {
      blocked = value;
    },
    close: () => {
      connected = false;
    },
    deactivate: () => {
      active = false;
    },
    reply: (response: () => Promise<Response>) => {
      replies.push(response);
    },
  };
}

test('现有调试表单列出七境，只显示关卡选择与不补修为说明，成功保存后禁用重复解锁', async (t) => {
  const h = stagePanelHarness(t);
  await h.open();
  h.stage();
  assert.match(h.html().shown, /<option value="stage">关卡解锁<\/option>/);
  for (const target of DEBUG_STAGES)
    assert.ok(h.html().fields.includes(`<option value="${target.id}">${target.name}</option>`));
  assert.match(h.html().fields, /不补修为、不发通关奖励/);
  assert.doesNotMatch(h.html().fields, /name="quantity"|name="forge"/);
  assert.equal(h.controls.get('id').options[0].disabled, true);
  assert.equal(h.submit.textContent, '解锁关卡（不补修为）');
  const before = structuredClone(h.save);
  h.send();
  await h.flush();
  assert.deepEqual(h.save, { ...before, unlocked: 6 });
  assert.equal(JSON.parse(h.counts().saved).unlocked, 6);
  assert.equal(h.counts().writes, 1);
  assert.equal(h.counts().requests, 2, '入口与提交分别联网核验');
  assert.match(h.status.textContent, /已保存/);
  assert.equal(h.submit.disabled, true);
  assert.equal(h.submit.textContent, '全部关卡已解锁');
  const selected = h.controls.get('id');
  assert.equal(selected.value, '7');
  assert.equal(selected.options.find((option: any) => option.value === '7').disabled, false);
  assert.equal(
    selected.options.find((option: any) => option.value === '7').textContent,
    DEBUG_STAGES[6].name,
  );
  h.send();
  await h.flush();
  assert.equal(h.counts().writes, 1);
});

test('部分或全部解锁后保留已选关卡名称可显示，仍禁止降级和重复写入', async (t) => {
  for (const id of ['3', '7'])
    await t.test(id, async (t) => {
      const h = stagePanelHarness(t);
      await h.open();
      h.stage(id);
      h.send();
      await h.flush();
      const selection = h.controls.get('id');
      const option = selection.options.find((option: any) => option.value === id);
      assert.equal(selection.value, id);
      assert.equal(option.textContent, DEBUG_STAGES[Number(id) - 1].name);
      assert.equal(option.disabled, false, '保留选中项可显示，避免原生select把名称绘制为空');
      for (const other of selection.options)
        if (other.value !== id) assert.equal(other.disabled, Number(other.value) < Number(id));
      assert.equal(h.submit.disabled, true);
      const before = structuredClone(h.save);
      const counts = h.counts();
      h.send();
      await h.flush();
      assert.deepEqual(h.counts(), counts);
      selection.value = '1';
      selection.onchange();
      assert.equal(h.submit.disabled, true);
      h.send();
      await h.flush();
      assert.deepEqual(h.save, before);
      assert.deepEqual(h.counts(), counts);
      assert.ok('error' in debugGrant(h.save, request('stage', id)));
      assert.ok('error' in debugGrant(h.save, request('stage', '1')));
      if (id === '7') {
        h.stage(id);
        assert.equal(h.controls.get('id').value, id);
        assert.equal(h.controls.get('id').options.find((o: any) => o.value === id).disabled, false);
        assert.equal(h.submit.disabled, true);
      }
    });
});

test('保存失败或抛错不解锁，重试成功只保存一次有效结果', async (t) => {
  for (const failure of ['false', 'throw'] as const)
    await t.test(failure, async (t) => {
      const h = stagePanelHarness(t);
      await h.open();
      h.stage();
      const before = structuredClone(h.save);
      h.failSave(failure);
      h.send();
      await h.flush();
      assert.deepEqual(h.save, before);
      assert.equal(h.counts().saved, '');
      assert.match(h.status.textContent, /未解锁|未能解锁/);
      assert.equal(h.fieldset.disabled, false);
      assert.equal(h.submit.disabled, false);
      h.failSave(null);
      h.send();
      await h.flush();
      assert.deepEqual(h.save, { ...before, unlocked: 6 });
      assert.equal(h.counts().writes, 2);
      h.send();
      await h.flush();
      assert.equal(h.counts().writes, 2);
    });
});

test('权限核验期间连续提交只发一次请求并保存一次，保存目标沿用提交时选择', async (t) => {
  const h = stagePanelHarness(t);
  await h.open();
  h.stage();
  let resolve!: (response: Response) => void;
  h.reply(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  h.send();
  h.send();
  h.send();
  assert.equal(h.fieldset.disabled, true);
  assert.equal(h.counts().requests, 2);
  assert.equal(h.counts().writes, 0);
  h.controls.get('id').value = '2';
  resolve(Response.json({ enabled: true }));
  await h.flush();
  assert.equal(h.save.unlocked, 6);
  assert.equal(h.counts().writes, 1);
});

test('提交前宿主保护禁止解锁，权限迟到时关闭/换页/写档受阻都不能生效', async (t) => {
  for (const message of [
    '请先结束未完成的历练，再发放物资。',
    '请先处理当前仙途。',
    '当前存档已停止写入。',
  ])
    await t.test(message, async (t) => {
      const h = stagePanelHarness(t);
      await h.open();
      h.stage();
      h.block(message);
      h.send();
      await h.flush();
      assert.equal(h.save.unlocked, 0);
      assert.equal(h.counts().writes, 0);
      assert.equal(h.counts().requests, 1);
      assert.equal(h.status.textContent, message);
    });
  for (const state of ['closed', 'inactive', 'blocked', 'revoked', 'offline'])
    await t.test(state, async (t) => {
      const h = stagePanelHarness(t);
      await h.open();
      h.stage();
      let resolve!: (response: Response) => void;
      h.reply(
        state === 'offline'
          ? async () => {
              throw new Error('offline');
            }
          : () =>
              new Promise((done) => {
                resolve = done;
              }),
      );
      h.send();
      if (state === 'closed') h.close();
      if (state === 'inactive') h.deactivate();
      if (state === 'blocked') h.block('当前存档已停止写入。');
      if (state !== 'offline') resolve(Response.json({ enabled: state !== 'revoked' }));
      await h.flush();
      assert.equal(h.save.unlocked, 0);
      assert.equal(h.counts().writes, 0);
      assert.equal(h.counts().saved, '');
      assert.doesNotMatch(h.status.textContent, /已保存/);
    });
});

test('篡改表单关卡输入或等待期间已有更高进度，不写入无效/重复结果', async (t) => {
  const h = stagePanelHarness(t);
  await h.open();
  h.stage();
  h.controls.get('id').value = '2.0';
  h.send();
  await h.flush();
  assert.match(h.status.textContent, /有效关卡/);
  assert.equal(h.counts().writes, 0);
  assert.equal(h.save.unlocked, 0);
  h.stage();
  let resolve!: (response: Response) => void;
  h.reply(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  h.send();
  h.save.unlocked = 6;
  resolve(Response.json({ enabled: true }));
  await h.flush();
  assert.equal(h.save.unlocked, 6);
  assert.equal(h.counts().writes, 0);
  assert.match(h.status.textContent, /已解锁/);
});
