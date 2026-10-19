import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, Script } from 'node:vm';
import { resourceFailureContent } from '../src/resource-panel.ts';
import { markFirstTourSeen } from '../src/first-run-tour.ts';

const source = readFileSync(new URL('../src/interface-tour-source.ts', import.meta.url), 'utf8');
// 执行真实入口与关闭逻辑，仅替换网络加载器和浏览器节点。
const flow = new Script(
  stripTypeScriptTypes(
    source
      .slice(source.indexOf('let current:'))
      .replace(/^async function fetchTour\([^]*?^\}\n/m, '')
      .replace(/^export /gm, ''),
  ),
);

function harness(failures: number) {
  const normal = '<p>跟着界面走一遍</p><button data-action="guide-tour">开始界面导览</button>';
  let captured = '',
    close = () => {},
    starts = 0;
  const flags: boolean[] = [];
  type Button = {
    isConnected: boolean;
    disabled: boolean;
    innerHTML: string;
    textContent: string;
    closest(): typeof host;
    focus(): void;
  };
  let button: Button;
  const host = {
    html: normal,
    get innerHTML() {
      return this.html;
    },
    set innerHTML(value: string) {
      this.html = value;
      button.isConnected = false;
      button = makeButton(value.match(/<button[^>]*>([^<]*)<\/button>/)![1]);
    },
    querySelector: () => button,
  };
  function makeButton(label: string): Button {
    return {
      isConnected: true,
      disabled: false,
      innerHTML: label,
      get textContent() {
        return this.innerHTML;
      },
      set textContent(value: string) {
        this.innerHTML = value;
      },
      closest: () => host,
      focus: () => {},
    };
  }
  button = makeButton('开始界面导览');
  const modal = { querySelector: () => button };
  const module = {
    startInterfaceTour: (_ui: unknown, _modal: unknown, onClose: () => void) => {
      starts++;
      captured = host.innerHTML;
      assert.equal(button.disabled, false);
      assert.equal(button.innerHTML, '开始界面导览');
      close = onClose;
    },
    stopInterfaceTour: () => close(),
  };
  const context = createContext({
    document: { hidden: false },
    fetchTour: async () => {
      if (failures-- > 0) throw Error('offline');
      return module;
    },
    resourceFailureContent,
    markFirstTourSeen,
    resourceFailed: (handled: boolean) => flags.push(handled),
  });
  flow.runInContext(context);
  return {
    context,
    host,
    normal,
    flags,
    get starts() {
      return starts;
    },
    get captured() {
      return captured;
    },
    get button() {
      return button;
    },
    start: () => context.startInterfaceTour({}, modal),
    stop: () => context.stopInterfaceTour(),
    module,
  };
}

test('导览初次成功在开始前恢复按钮，退出后可再次进入', async () => {
  const h = harness(0);
  await h.start();
  assert.equal(h.captured, h.normal);
  h.stop();
  await h.start();
  assert.equal(h.starts, 2);
  assert.deepEqual(h.flags, []);
});

test('连续加载失败仍保留首次正常入口，联网重试与退出后恢复正常按钮', async () => {
  const h = harness(2);
  for (let attempt = 0; attempt < 2; attempt++) {
    await h.start();
    assert.equal(h.starts, 0);
    assert.match(h.host.innerHTML, /重试导览/);
    assert.match(h.host.innerHTML, /data-action="refresh-game"/);
  }
  await h.start();
  assert.equal(h.captured, h.normal);
  assert.equal(h.host.innerHTML, h.normal);
  assert.doesNotMatch(h.host.innerHTML, /重试导览|refresh-game/);
  assert.deepEqual(h.flags, [true, true]);
  h.stop();
  await h.start();
  assert.equal(h.starts, 2);
});

test('等待导览时关闭面板，迟到成功或失败不能修改已断开的入口', async () => {
  for (const succeeds of [true, false]) {
    const h = harness(0);
    const pending = Promise.withResolvers();
    h.context.fetchTour = () => pending.promise;
    const original = h.host.innerHTML;
    const request = h.start();
    h.stop();
    h.button.isConnected = false;
    if (succeeds) pending.resolve(h.module);
    else pending.reject(Error('offline'));
    await request;
    assert.equal(h.starts, 0);
    assert.equal(h.host.innerHTML, original);
  }
});

test('自动导览不依赖指南按钮，沿用活动状态且在资源就绪后才消费首次标记', async () => {
  const h = harness(0);
  let starts = 0,
    consumed = 0;
  Object.assign(h.module, {
    startInterfaceTour: (_ui: unknown, _modal: unknown, _close: unknown, automatic: boolean) => {
      assert.equal(automatic, true);
      starts++;
    },
  });
  const modal = { querySelector: () => null };
  assert.equal(
    await h.context.startAutomaticInterfaceTour(
      {},
      modal,
      () => true,
      () => false,
    ),
    false,
  );
  assert.equal(starts, 0);
  assert.equal(
    await h.context.startAutomaticInterfaceTour(
      {},
      modal,
      () => true,
      () => {
        consumed++;
        return true;
      },
    ),
    true,
  );
  assert.equal(consumed, 1);
  assert.equal(starts, 1);
  assert.equal(new Script('tourActive').runInContext(h.context), true);
});

test('自动导览加载期间离开首页，不能展示蒙层或提前消费标记', async () => {
  const h = harness(0);
  const pending = Promise.withResolvers();
  h.context.fetchTour = () => pending.promise;
  let valid = true,
    consumed = 0;
  const request = h.context.startAutomaticInterfaceTour(
    {},
    {},
    () => valid,
    () => {
      consumed++;
      return true;
    },
  );
  valid = false;
  pending.resolve(h.module);
  assert.equal(await request, false);
  assert.equal(consumed, 0);
  assert.equal(h.starts, 0);
  assert.equal(new Script('tourActive').runInContext(h.context), false);
});
