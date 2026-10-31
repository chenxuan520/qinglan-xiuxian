import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import worker from '../workers/leaderboard/index.ts';
import {
  LEADERBOARD_SCRIPT,
  LEADERBOARD_ADMIN_SCRIPT,
  leaderboardPage,
} from '../workers/leaderboard/page.ts';
import { LOGIN_HTML } from '../workers/house-ads/admin.ts';
import { leaderboardStore } from './helpers/leaderboard.ts';

test('独立榜单及管理页是正式路径，静态页面不查询数据库或读取玩家存档', async () => {
  const store = leaderboardStore();
  try {
    for (const path of [
      '/leaderboard/',
      '/leaderboard/admin/',
      '/leaderboard/app.js',
      '/leaderboard/admin/app.js',
      '/leaderboard/app.css',
    ]) {
      const response = await worker.fetch(
        new Request('https://xiuxian.011203.xyz' + path),
        store.env,
      );
      assert.equal(response.status, 200, path);
      assert.match(response.headers.get('Content-Security-Policy')!, /frame-ancestors 'none'/);
      const text = await response.text();
      assert.doesNotMatch(text, /qinglan-immortal-v1|eval\(|new Function/);
    }
    for (const path of ['/leaderboard', '/leaderboard/admin']) {
      const response = await worker.fetch(
        new Request('https://xiuxian.011203.xyz' + path),
        store.env,
      );
      assert.equal(response.status, 302);
      assert.equal(response.headers.get('Location'), path + '/');
    }
    assert.equal(
      (await worker.fetch(new Request('https://xiuxian.011203.xyz/leaderboard/unknown'), store.env))
        .status,
      404,
    );
    assert.equal(
      (await worker.fetch(new Request('https://evil.example/leaderboard/'), store.env)).status,
      404,
    );
    assert.equal(store.rows().length, 0);
  } finally {
    store.close();
  }
});

test('管理登录复用既有组件但回到自己的管理页，缺失服务与坏响应拒绝', async () => {
  const url = 'https://xiuxian.011203.xyz/leaderboard/admin/login';
  const ok = await leaderboardPage(new Request(url), {
    ADMIN_AUTH: {
      async fetch(request: Request) {
        assert.equal(request.url, 'https://xiuxian.011203.xyz/ads/admin/login');
        assert.equal(request.redirect, 'manual', 'Worker服务调用不得使用不支持的redirect error');
        return new Response(LOGIN_HTML.replace('__TURNSTILE_SITE_KEY__', 'public-local-site-key'), {
          headers: { 'Content-Type': 'text/html' },
        });
      },
    } as any,
  });
  const html = await ok.text();
  assert.match(html, /万魂幡管理登录/);
  assert.match(html, /public-local-site-key/);
  assert.match(html, /\/leaderboard\/admin\/login.js/);
  assert.doesNotMatch(html, /service-desc|Access Key|ai-agent-instructions/);
  const script = await leaderboardPage(new Request(url + '.js'), {});
  const js = await script.text();
  assert.match(js, /fetch\('\/ads\/admin\/login'/);
  assert.match(js, /location.replace\('\/leaderboard\/admin\/'\)/);
  assert.doesNotMatch(js, /location.replace\('\/ads\/admin\/'\)/);
  assert.equal((await leaderboardPage(new Request(url), {})).status, 503);
  const bad = await leaderboardPage(new Request(url), {
    ADMIN_AUTH: {
      async fetch() {
        return new Response('bad', { status: 503 });
      },
    } as any,
  });
  assert.equal(bad.status, 503);
});

class Element {
  hidden = false;
  disabled = false;
  textContent = '';
  className = '';
  title = '';
  value = '';
  returnValue = '';
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  children: Element[] = [];
  listeners = new Map<string, (event: any) => void>();
  append(...nodes: Element[]) {
    this.children.push(...nodes);
  }
  replaceChildren(...nodes: Element[]) {
    this.children = nodes;
  }
  setAttribute() {}
  addEventListener(name: string, fn: (event: any) => void) {
    this.listeners.set(name, fn);
  }
  showModal() {}
}
const settle = () => new Promise((resolve) => setImmediate(resolve));
function harness(script: string, preference = '1') {
  const ids = new Map<string, Element>(),
    listeners = new Map<string, (event: any) => void>();
  const element = (id: string) => {
    if (!ids.has(id)) ids.set(id, new Element());
    return ids.get(id)!;
  };
  let calls = 0,
    response: Promise<Response> | null = null;
  const context = vm.createContext({
    document: {
      getElementById: element,
      createElement: () => new Element(),
      querySelectorAll: () => [...ids.values()],
    },
    localStorage: {
      getItem: () => preference,
      setItem: (_key: string, value: string) => {
        preference = value;
      },
    },
    addEventListener: (key: string, fn: (event: any) => void) => listeners.set(key, fn),
    fetch: async () => {
      calls++;
      return response ?? Response.json({ version: 1, limit: 100, entries: [], minimumScore: 0 });
    },
    AbortController,
    DOMException,
    TextDecoder,
    Intl,
    setTimeout,
    clearTimeout,
    location: { replace() {} },
  });
  new vm.Script(script).runInContext(context);
  return {
    element,
    listeners,
    calls: () => calls,
    setPreference(value: string) {
      preference = value;
    },
    setResponse(value: Promise<Response> | null) {
      response = value;
    },
    context,
  };
}

test('独立页关闭时不请求，主动开启只读取一次；BFCache返回后可刷新', async () => {
  const h = harness(LEADERBOARD_SCRIPT, '0');
  await settle();
  assert.equal(h.calls(), 0);
  assert.equal(h.element('disabled').hidden, false);
  (h.element('enable') as any).onclick();
  await settle();
  assert.equal(h.calls(), 1);
  h.listeners.get('pagehide')!({ persisted: true });
  h.listeners.get('pageshow')!({ persisted: true });
  await settle();
  assert.equal(h.calls(), 2);
  (h.element('refresh') as any).onclick();
  await settle();
  assert.equal(h.calls(), 3);
});

test('跨窗口关闭再开启时丢弃迟到结果并补一次查询', async () => {
  const h = harness(LEADERBOARD_SCRIPT, '0');
  await settle();
  let finish!: (response: Response) => void;
  h.setResponse(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  (h.element('enable') as any).onclick();
  await settle();
  h.setPreference('0');
  h.listeners.get('storage')!({ key: 'qinglan-leaderboard-v1' });
  h.setPreference('1');
  h.listeners.get('storage')!({ key: 'qinglan-leaderboard-v1' });
  h.setResponse(null);
  finish(Response.json({ version: 1, limit: 100, minimumScore: 0, entries: [] }));
  await settle();
  await settle();
  assert.equal(h.calls(), 2);
  assert.equal(h.element('refresh').disabled, false);
  assert.equal(h.element('status').textContent, '');
});

test('管理确认每次清空结果，Esc取消不提交；401停用操作', async () => {
  const h = harness(LEADERBOARD_ADMIN_SCRIPT);
  await settle();
  const row = { name: '测试署名', updatedAt: '2026-10-30T00:00:00Z', score: 2500 };
  vm.runInContext(
    `$('confirm').returnValue='confirm';confirmAction(${JSON.stringify(row)},'remove');`,
    h.context,
  );
  assert.equal(h.element('confirm').returnValue, '');
  h.element('confirm').listeners.get('cancel')!({});
  h.element('confirm').listeners.get('close')!({});
  await settle();
  assert.equal(h.calls(), 1);
  h.setResponse(Promise.resolve(Response.json({ error: 'login-required' }, { status: 401 })));
  (h.element('refresh') as any).onclick();
  await settle();
  assert.equal(h.element('login').hidden, false);
  assert.equal(h.element('refresh').disabled, true);
  vm.runInContext(`confirmAction(${JSON.stringify(row)},'block');`, h.context);
  h.element('confirm').returnValue = 'confirm';
  h.element('confirm').listeners.get('close')!({});
  await settle();
  assert.equal(h.calls(), 2);
});

test('公开前三、后排与管理页完整显示分数，不增加千位逗号或舍入', async () => {
  const entries = [Number.MAX_SAFE_INTEGER, 1234567, 2500, 1000, 999].map((score, i) => ({
    name: `署名${i}`,
    score,
    grade: '上品',
    title: '道行通玄',
    lifeMode: 'normal',
    ending: 'old-age',
    updatedAt: '2026-10-31T00:00:00Z',
  }));
  const original = JSON.stringify(entries);
  const publicPage = harness(LEADERBOARD_SCRIPT, '0');
  await settle();
  vm.runInContext(`render({entries:${original}})`, publicPage.context);
  const cards = [
    ...publicPage.element('podium').children,
    ...publicPage.element('entries').children,
  ];
  assert.equal(cards.length, entries.length);
  assert.deepEqual(
    cards.map((row) => row.children.find((child) => child.className === 'score')!.textContent),
    entries.map((entry) => String(entry.score)),
  );
  const adminPage = harness(LEADERBOARD_ADMIN_SCRIPT);
  await settle();
  vm.runInContext(`state={entries:${original},blocked:[]};render()`, adminPage.context);
  const rows = adminPage.element('admin-entries').children;
  assert.equal(rows.length, entries.length);
  rows.forEach((row, i) =>
    assert.equal(
      row.children[0].children[1].textContent,
      `${entries[i].score} 道果 · 上品 · 普通修行`,
    ),
  );
  assert.equal(JSON.stringify(entries), original);
});
