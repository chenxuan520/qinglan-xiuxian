import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { LOGIN_SCRIPT } from '../workers/house-ads/admin.ts';

function client(t: any, width = 390, observeResize = true) {
  let availableWidth = width < 700 ? width - 74 : 366;
  let resized: (() => void) | undefined;
  const button: any = { disabled: true },
    retry: any = { hidden: true, disabled: false };
  const status: any = { textContent: '', dataset: {} },
    container = {
      dataset: { sitekey: '0x4SyntheticTestSiteKey' },
      getBoundingClientRect: () => ({ width: availableWidth }),
      replaceChildren() {},
    };
  const form: any = {
    elements: { username: { value: 'synthetic-user' }, password: { value: 'synthetic-password' } },
    querySelector: () => button,
  };
  let widget: any,
    resets = 0,
    fetches = 0,
    renders = 0,
    removals = 0;
  const scripts: any[] = [],
    requests: any[] = [],
    redirects: string[] = [],
    timers = new Set<any>();
  let reply: (u: any, o: any) => Promise<Response> = async () =>
    Response.json({ message: '账号或密码不正确。' }, { status: 401 });
  const sdk = {
    render(_node: any, opts: any) {
      renders++;
      widget = opts;
      return 'fixture-widget';
    },
    reset(id: string) {
      assert.equal(id, 'fixture-widget');
      resets++;
    },
    remove(id: string) {
      assert.equal(id, 'fixture-widget');
      removals++;
    },
  };
  const window: any = {
    addEventListener(name: string, fn: () => void) {
      assert.equal(name, 'resize');
      resized = fn;
    },
  };
  const elements: any = {
    'login-form': form,
    status,
    'login-verification': container,
    'verification-retry': retry,
  };
  runInNewContext(LOGIN_SCRIPT, {
    window,
    document: {
      getElementById: (id: string) => elements[id],
      createElement: () => ({ remove() {} }),
      head: { append: (script: any) => scripts.push(script) },
    },
    innerWidth: width,
    ResizeObserver: observeResize
      ? class {
          constructor(fn: () => void) {
            resized = fn;
          }
          observe(node: unknown) {
            assert.equal(node, container);
          }
        }
      : undefined,
    AbortController,
    JSON,
    Error,
    location: { replace: (url: string) => redirects.push(url) },
    setTimeout: (fn: any, ms: number) => {
      const id = setTimeout(fn, ms);
      timers.add(id);
      return id;
    },
    clearTimeout: (id: any) => {
      clearTimeout(id);
      timers.delete(id);
    },
    fetch: async (u: any, o: any) => {
      fetches++;
      requests.push({ url: u, body: JSON.parse(o.body) });
      return reply(u, o);
    },
  });
  t.after(() => timers.forEach((id) => clearTimeout(id)));
  return {
    button,
    retry,
    status,
    form,
    scripts,
    requests,
    redirects,
    ready() {
      window.turnstile = sdk;
      scripts.at(-1).onload();
    },
    widget: () => widget,
    resets: () => resets,
    fetches: () => fetches,
    renders: () => renders,
    removals: () => removals,
    resize(nextWidth: number) {
      availableWidth = nextWidth;
      resized!();
    },
    reply(fn: typeof reply) {
      reply = fn;
    },
    submit: () => form.onsubmit({ preventDefault() {} }),
  };
}

test('登录必须取得验证结果：无结果/过期/组件错误不发密码请求，320px用compact，正常屏宽用flexible', async (t) => {
  const c = client(t, 320);
  assert.equal(c.button.disabled, true);
  await c.submit();
  assert.equal(c.fetches(), 0);
  c.ready();
  assert.equal(c.widget().action, 'ad_admin_login');
  assert.equal(c.widget().size, 'compact');
  c.widget().callback('synthetic-proof');
  assert.equal(c.button.disabled, false);
  c.widget()['expired-callback']();
  assert.equal(c.button.disabled, true);
  await c.submit();
  assert.equal(c.fetches(), 0);
  c.widget().callback('next-proof');
  c.widget()['error-callback']();
  assert.equal(c.button.disabled, true);
  assert.equal(c.retry.hidden, false);
  const wide = client(t);
  wide.ready();
  assert.equal(wide.widget().size, 'flexible');
});

test('错误密码、断网、坏响应均重置同一组件，旧验证结果不可再提交，重新验证后才可重试', async (t) => {
  const c = client(t);
  c.ready();
  for (const fail of [
    async () => Response.json({ message: '账号或密码不正确。' }, { status: 401 }),
    async () => {
      throw Error('controlled offline');
    },
    async () => new Response('{bad'),
  ]) {
    c.widget().callback('fresh-proof');
    c.reply(fail);
    const before = c.resets();
    await c.submit();
    assert.equal(c.resets(), before + 1);
    assert.equal(c.button.disabled, true);
    assert.equal(c.form.elements.password.value, 'synthetic-password');
    const sent = c.fetches();
    await c.submit();
    assert.equal(c.fetches(), sent);
  }
  assert.equal(c.requests[0].body['cf-turnstile-response'], 'fresh-proof');
});

test('请求中重复提交只发一次；成功后清密码并进入原后台，既有会话由浏览器管理', async (t) => {
  const c = client(t);
  c.ready();
  let finish!: (r: Response) => void;
  c.reply(async () => new Promise((r) => (finish = r)));
  c.widget().callback('fresh-proof');
  const first = c.submit();
  await c.submit();
  assert.equal(c.fetches(), 1);
  assert.equal(c.button.disabled, true);
  finish(Response.json({ ok: true }));
  await first;
  assert.equal(c.form.elements.password.value, '');
  assert.deepEqual(c.redirects, ['/ads/admin/']);
  assert.equal(c.button.disabled, true);
});

test('错密后的自动验证保留错误提示，手动重试成功则清除加载状态', async (t) => {
  const c = client(t);
  c.ready();
  c.widget().callback('fresh-proof');
  await c.submit();
  c.widget().callback('automatic-proof');
  assert.equal(c.status.textContent, '账号或密码不正确。');
  c.retry.onclick();
  assert.equal(c.status.textContent, '正在加载人机验证…');
  assert.equal(c.button.disabled, true);
  c.widget().callback('manual-proof');
  assert.equal(c.status.textContent, '');
  assert.equal(c.status.dataset.error, 'false');
  assert.equal(c.button.disabled, false);
});

test('脚本失败能重试，旧脚本迟到回调不覆盖新加载状态', async (t) => {
  const c = client(t);
  const old = c.scripts[0];
  old.onerror();
  assert.equal(c.retry.hidden, false);
  assert.equal(c.button.disabled, true);
  c.retry.onclick();
  assert.equal(c.scripts.length, 2);
  c.ready();
  c.widget().callback('new-proof');
  assert.equal(c.button.disabled, false);
  old.onerror();
  assert.equal(c.button.disabled, false);
  assert.equal(c.status.textContent, '');
});

test('验证码按表单实际宽度选择尺寸，缩放只在跨过300px时重建且保留输入', (t) => {
  for (const observer of [true, false]) {
    const c = client(t, 844, observer);
    c.ready();
    assert.equal(c.widget().size, 'flexible');
    const old = c.widget();
    old.callback('synthetic-proof');
    c.resize(286);
    assert.equal(c.widget().size, 'compact');
    assert.equal(c.button.disabled, true);
    assert.equal(c.removals(), 1);
    assert.equal(c.form.elements.username.value, 'synthetic-user');
    assert.equal(c.form.elements.password.value, 'synthetic-password');
    old.callback('late-removed-proof');
    assert.equal(c.button.disabled, true);
    c.widget().callback('new-proof');
    for (const event of ['error-callback', 'expired-callback', 'timeout-callback']) old[event]();
    assert.equal(c.button.disabled, false);
    const renders = c.renders();
    c.resize(299);
    assert.equal(c.renders(), renders);
    assert.equal(c.button.disabled, false);
    c.resize(300);
    assert.equal(c.widget().size, 'flexible');
    assert.equal(c.button.disabled, true);
    assert.equal(c.removals(), 2);
    assert.equal(c.fetches(), 0);
  }
  const narrowForm = client(t, 360);
  narrowForm.ready();
  assert.equal(narrowForm.widget().size, 'compact');
});

test('登录请求中旋转仍适配组件，不重发请求，返回失败后须重新验证', async (t) => {
  const c = client(t, 844);
  c.ready();
  let finish!: (r: Response) => void;
  c.reply(async () => new Promise((r) => (finish = r)));
  c.widget().callback('synthetic-proof');
  const pending = c.submit();
  c.resize(246);
  assert.equal(c.widget().size, 'compact');
  c.widget().callback('ignored-while-busy');
  await c.submit();
  assert.equal(c.fetches(), 1);
  assert.equal(c.button.disabled, true);
  finish(Response.json({ message: '账号或密码不正确。' }, { status: 401 }));
  await pending;
  assert.equal(c.form.elements.password.value, 'synthetic-password');
  assert.equal(c.button.disabled, true);
  c.widget().callback('fresh-after-failure');
  assert.equal(c.button.disabled, false);
  assert.deepEqual(c.redirects, []);
});
