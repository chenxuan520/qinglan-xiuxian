import test from 'node:test';
import assert from 'node:assert/strict';
import { LeaderboardPanel } from '../src/leaderboard-controller.ts';
import { LeaderboardClient } from '../src/leaderboard-client.ts';
import {
  extractLeaderboardFacts,
  type LeaderboardFacts,
  type LeaderboardEntry,
} from '../src/leaderboard-contract.ts';
import { freshSave } from '../src/progress.ts';
import { TAMPERED_LEADERBOARD_MESSAGE } from '../src/leaderboard-integrity.ts';

// 仅测试控制器的请求、幂等与迟到状态；真实布局由 MCP 正常入口另验。
class Element {
  readonly children: Element[] = [];
  readonly attributes = new Map<string, string>();
  private text = '';
  textWrites = 0;
  innerHTML = '';
  hidden = false;
  disabled = false;
  isConnected = true;
  value = '';
  title = '';
  className = '';
  readonly tagName: string;
  constructor(tagName = 'DIV') {
    this.tagName = tagName;
  }
  get textContent() {
    return this.text;
  }
  set textContent(value: string) {
    this.text = value;
    this.textWrites++;
  }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
  hasAttribute(name: string) {
    return this.attributes.has(name);
  }
  append(...nodes: Element[]) {
    this.children.push(...nodes);
  }
  replaceChildren(...nodes: Element[]) {
    this.children.splice(0, this.children.length, ...nodes);
  }
  closest(selector: string) {
    return selector === 'button' && this.tagName === 'BUTTON' ? this : null;
  }
}
function facts() {
  const save = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  save.age = 100;
  save.pendingReincarnation = 'lifespan';
  return extractLeaderboardFacts(save)!;
}
const entry: LeaderboardEntry = {
  name: '青岚客',
  score: 2500,
  grade: '帝品',
  title: '万古绝尘',
  lifeMode: 'normal',
  ending: 'lifespan',
  updatedAt: '2026-10-30T00:00:00Z',
};
const board = (entries: LeaderboardEntry[] = []) => ({
  version: 1,
  limit: 100,
  minimumScore: entries.length === 100 ? entries.at(-1)!.score : 0,
  entries,
});
async function turn() {
  for (let i = 0; i < 12; i++) await new Promise<void>((resolve) => setImmediate(resolve));
}
async function waitFor(ready: () => boolean) {
  const deadline = Date.now() + 3000;
  while (!ready() && Date.now() < deadline)
    await new Promise<void>((resolve) => setTimeout(resolve, 2));
  assert.equal(ready(), true, '等待控制器完成当前操作');
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function fixture(
  fetcher: typeof fetch,
  run: (f: ReturnType<typeof environment>) => Promise<void>,
) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const f = environment(fetcher);
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: (name: string) => new Element(name.toUpperCase()) },
  });
  try {
    await run(f);
  } finally {
    f.panel.destroy();
    if (original) Object.defineProperty(globalThis, 'document', original);
    else Reflect.deleteProperty(globalThis, 'document');
  }
}
function environment(fetcher: typeof fetch) {
  const selectors = [
    'refresh',
    'status',
    'sign',
    'score',
    'form',
    'name',
    'submit',
    'eligibility',
    'list',
    'close',
  ];
  const elements = new Map(
    selectors.map((key) => [
      key,
      new Element(
        ['refresh', 'submit', 'close'].includes(key) ? 'BUTTON' : key === 'form' ? 'FORM' : 'DIV',
      ),
    ]),
  );
  for (const [key, element] of elements) element.setAttribute('data-leaderboard-' + key, '');
  const listeners = new Map<string, Array<{ fn: (event: any) => void; signal: AbortSignal }>>();
  const host = new Element();
  Object.assign(host, {
    querySelector(selector: string) {
      const key = selector.match(/\[data-leaderboard-([^\]]+)\]/)?.[1];
      return elements.get(key!);
    },
    contains(element: Element) {
      return [...elements.values()].includes(element);
    },
    addEventListener(type: string, fn: (event: any) => void, options: { signal: AbortSignal }) {
      const list = listeners.get(type) ?? [];
      list.push({ fn, signal: options.signal });
      listeners.set(type, list);
    },
  });
  let current = true,
    enabled = true,
    score = 2500,
    eligible: LeaderboardFacts | null = facts(),
    closes = 0;
  let blockedReason = '';
  const panel = new LeaderboardPanel(host as unknown as HTMLElement, {
    isCurrent: () => current,
    enabled: () => enabled,
    score: () => score,
    eligibleFacts: () => eligible,
    blockedReason: () => blockedReason,
    client: new LeaderboardClient({
      origin: 'http://localhost:5173',
      fetcher,
      enabled: () => enabled,
    }),
    onClose: () => closes++,
  });
  const el = (name: string) => elements.get(name)!;
  function event(type: string, target: Element) {
    const e = {
      target,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
    };
    for (const { fn, signal } of listeners.get(type) ?? []) if (!signal.aborted) fn(e);
    return e;
  }
  return {
    panel,
    host,
    el,
    event,
    submit() {
      return event('submit', el('form'));
    },
    click(key: string) {
      return event('click', el(key));
    },
    get closes() {
      return closes;
    },
    set current(v: boolean) {
      current = v;
    },
    set enabled(v: boolean) {
      enabled = v;
    },
    set score(v: number) {
      score = v;
    },
    set eligible(v: LeaderboardFacts | null) {
      eligible = v;
    },
    set blockedReason(v: string) {
      blockedReason = v;
    },
  };
}

test('控制器读榜安全构造姓名与超长分数，无资格只读；重复刷新合并，关闭回父入口', async () => {
  let calls = 0;
  const pending = deferred<Response>();
  await fixture(
    async () => {
      calls++;
      return pending.promise;
    },
    async (f) => {
      f.eligible = null;
      const loading = f.panel.load();
      void f.panel.load();
      assert.equal(calls, 1);
      pending.resolve(
        Response.json(
          board([
            { ...entry, name: '长'.repeat(24), score: Number.MAX_SAFE_INTEGER, title: '<img>' },
          ]),
        ),
      );
      await loading;
      assert.equal(f.el('sign').hidden, true);
      assert.match(f.el('eligibility').textContent, /此世离世或完成终章/);
      const row = f.el('list').children[0].children[0];
      assert.equal(row.children[1].textContent, '长'.repeat(24));
      assert.equal(row.children[1].title, '长'.repeat(24));
      assert.equal(row.children[2].textContent, String(Number.MAX_SAFE_INTEGER));
      assert.equal(row.children[3].children[1].textContent, '<img>');
      assert.equal(row.innerHTML, '');
      f.click('close');
      f.click('close');
      assert.equal(f.closes, 1);
    },
  );
});

test('满榜平分不显示署名；入榜成功后读权威榜单，点击/键盘重复提交只写一次', async () => {
  let posts = 0,
    reads = 0;
  const response = deferred<Response>();
  await fixture(
    async (_url, init) => {
      if (init?.method === 'POST') {
        posts++;
        return response.promise;
      }
      reads++;
      return Response.json(board(reads > 1 ? [entry] : []));
    },
    async (f) => {
      await f.panel.load();
      assert.equal(f.el('sign').hidden, false);
      f.el('name').value = ' 青岚客 ';
      const e = f.submit();
      f.submit();
      assert.equal(e.defaultPrevented, true);
      await waitFor(() => posts === 1);
      assert.equal(posts, 1);
      assert.equal(f.el('name').disabled, true);
      assert.equal(f.el('submit').disabled, true);
      response.resolve(Response.json({ version: 1, status: 'saved', entry }));
      await turn();
      assert.equal(reads, 2);
      assert.equal(posts, 1);
      assert.equal(f.el('name').value, '青岚客');
      assert.equal(f.el('submit').disabled, false);
      assert.match(f.el('status').textContent, /已留名/);
      assert.equal(f.el('sign').hidden, true, '即使本机不能保存署名，已成功的这一世不再展示表单');
      assert.equal(f.el('list').children[0].children[0].children[2].textContent, '2500');
    },
  );
  const full = Array.from({ length: 100 }, (_, i) => ({
    ...entry,
    name: `修士${i}`,
    score: 200 - i,
  }));
  await fixture(
    async () => Response.json(board(full)),
    async (f) => {
      f.score = 101;
      await f.panel.load();
      assert.equal(f.el('sign').hidden, true);
      f.score = 102;
      await f.panel.load();
      assert.equal(f.el('sign').hidden, false);
    },
  );
});

test('低分更新保留服务端最高分，刷新失败也不把已确认入榜报成失败', async () => {
  let reads = 0;
  await fixture(
    async (_url, init) => {
      if (init?.method === 'POST') return Response.json({ version: 1, status: 'unchanged', entry });
      if (++reads === 1) return Response.json(board([entry]));
      throw Error('explicit read failure');
    },
    async (f) => {
      await f.panel.load();
      f.el('name').value = entry.name;
      f.submit();
      await waitFor(() => !f.el('submit').disabled);
      assert.match(f.el('status').textContent, /已保留这个名字的最高道果/);
      assert.match(f.el('status').textContent, /榜单暂未刷新/);
      assert.equal(f.el('submit').disabled, false);
      assert.equal(f.el('name').value, entry.name);
    },
  );
});

test('无效署名、占名、限流及过期前百资格均不显示假成功，保留输入可重试', async () => {
  for (const [status, error] of [
    [409, 'name-taken'],
    [429, 'rate-limited'],
    [409, 'not-qualified'],
  ] as const) {
    let posts = 0;
    await fixture(
      async (_url, init) => {
        if (init?.method === 'POST') {
          posts++;
          return Response.json({ error }, { status });
        }
        return Response.json(board());
      },
      async (f) => {
        await f.panel.load();
        f.el('name').value = '名'.repeat(25);
        f.submit();
        await turn();
        assert.equal(posts, 0);
        assert.match(f.el('status').textContent, /姓名需为/);
        f.el('name').value = '自取名';
        f.submit();
        await waitFor(() => posts === 1 && !f.el('submit').disabled);
        assert.equal(posts, 1);
        assert.equal(f.el('name').value, '自取名');
        assert.equal(f.el('submit').disabled, false);
        assert.doesNotMatch(f.el('status').textContent, /已留名|最高道果/);
        assert.match(
          f.el('status').textContent,
          error === 'name-taken'
            ? /已有人留名/
            : error === 'rate-limited'
              ? /过于频繁/
              : /尚未进入前百/,
        );
      },
    );
  }
});

test('初次读取失败可手动重试，已有草稿不丢；关闭后迟到读榜不写面板', async () => {
  let calls = 0;
  await fixture(
    async () => {
      if (++calls === 1) throw Error('network fixture');
      return Response.json(board());
    },
    async (f) => {
      f.el('name').value = '草稿姓名';
      await f.panel.load();
      assert.match(f.el('status').textContent, /暂不可用/);
      assert.equal(f.el('refresh').disabled, false);
      await f.panel.load();
      assert.equal(f.el('name').value, '草稿姓名');
      assert.equal(f.el('sign').hidden, false);
    },
  );
  const pending = deferred<Response>();
  let signal: AbortSignal | undefined;
  await fixture(
    async (_url, init) => {
      signal = init?.signal as AbortSignal;
      return pending.promise;
    },
    async (f) => {
      const loading = f.panel.load();
      const writes = f.el('status').textWrites;
      f.panel.destroy();
      assert.equal(signal?.aborted, true);
      pending.resolve(Response.json(board([entry])));
      await loading;
      await turn();
      assert.equal(f.el('status').textWrites, writes);
      assert.equal(f.el('list').children.length, 0);
    },
  );
});

test('换世、关闭开关或移走面板后，迟到留名不改新对象、不发跟进查询', async () => {
  for (const change of ['life', 'disabled', 'panel'] as const) {
    const pending = deferred<Response>();
    let calls = 0;
    await fixture(
      async (_url, init) => {
        calls++;
        return init?.method === 'POST' ? pending.promise : Response.json(board());
      },
      async (f) => {
        await f.panel.load();
        f.el('name').value = '旧世姓名';
        f.submit();
        await waitFor(() => calls === 2);
        assert.equal(calls, 2);
        const writes = f.el('status').textWrites;
        if (change === 'life') f.eligible = { ...facts(), age: 101 };
        else if (change === 'disabled') f.enabled = false;
        else f.current = false;
        pending.resolve(Response.json({ version: 1, status: 'saved', entry }));
        await turn();
        assert.equal(calls, 2);
        assert.equal(f.el('status').textWrites, writes);
        assert.equal(f.el('name').value, '旧世姓名');
      },
    );
  }
});

test('改动标记阻止读榜和提交，明确显示原因且不影响关闭', async () => {
  let calls = 0;
  await fixture(
    async () => {
      calls++;
      return Response.json(board());
    },
    async (f) => {
      f.blockedReason = TAMPERED_LEADERBOARD_MESSAGE;
      await f.panel.load();
      f.el('name').value = '不应上传';
      f.submit();
      await turn();
      assert.equal(calls, 0);
      assert.equal(f.el('sign').hidden, true);
      assert.equal(f.el('eligibility').textContent, TAMPERED_LEADERBOARD_MESSAGE);
      assert.equal(f.el('status').textContent, TAMPERED_LEADERBOARD_MESSAGE);
      f.click('close');
      assert.equal(f.closes, 1);
    },
  );
});

test('设置关闭时不读取、不留名、不写提示', async () => {
  let calls = 0;
  await fixture(
    async () => {
      calls++;
      return Response.json(board());
    },
    async (f) => {
      f.enabled = false;
      await f.panel.load();
      f.submit();
      await turn();
      assert.equal(calls, 0);
      assert.equal(f.el('status').textWrites, 0);
    },
  );
});
