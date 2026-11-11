import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { uiClickTarget, uiClickResult } from '../../../scripts/ui/ui-click-target.ts';

// 只模拟DOM几何与事件分发；真实MCP回归另对照完整检查点。
function page(
  options: {
    disabled?: boolean;
    hidden?: boolean;
    inert?: boolean;
    covered?: boolean;
    detached?: boolean;
    replaced?: boolean;
    missing?: boolean;
    width?: number;
    left?: number;
    moveFrames?: number;
    oscillating?: boolean;
    frameDelay?: number;
    stalled?: boolean;
  } = {},
) {
  let frames = 0;
  let scrolls = 0;
  const child = {};
  const node = {
    isConnected: !options.detached,
    scrollIntoView: () => scrolls++,
    getBoundingClientRect: () => {
      const x =
        (options.left ?? 20) +
        (options.oscillating ? (frames % 2) * 80 : Math.min(frames, options.moveFrames ?? 0));
      const width = options.width ?? 80;
      return { x, y: 30, left: x, top: 30, right: x + width, bottom: 70, width, height: 40 };
    },
    matches: () => !!options.disabled,
    closest: () => (options.inert ? {} : null),
    contains: (hit: unknown) => hit === child,
  };
  const handlers = new Map<string, Set<(event: any) => void>>();
  const storage = new Map<string, string>();
  const window = {
    addEventListener: (name: string, handler: (event: any) => void) => {
      if (!handlers.has(name)) handlers.set(name, new Set());
      handlers.get(name)!.add(handler);
    },
    removeEventListener: (name: string, handler: (event: any) => void) =>
      handlers.get(name)?.delete(handler),
    dispatchEvent: (event: any) => {
      for (const handler of handlers.get(event.type) ?? []) handler(event);
    },
  };
  const context = {
    innerWidth: 390,
    innerHeight: 844,
    performance,
    document: {
      querySelector: () =>
        options.missing ? null : options.replaced && frames > 0 ? { ...node } : node,
      elementFromPoint: () => (options.covered ? {} : child),
    },
    getComputedStyle: () => ({
      visibility: options.hidden ? 'hidden' : 'visible',
      display: 'block',
    }),
    requestAnimationFrame: (callback: () => void) =>
      setTimeout(() => {
        if (options.stalled) return;
        frames++;
        callback();
      }, options.frameDelay ?? 1),
    cancelAnimationFrame: clearTimeout,
    setTimeout,
    clearTimeout,
    window,
    Event,
    sessionStorage: {
      setItem: (key: string, value: string) => storage.set(key, value),
      getItem: (key: string) => storage.get(key) ?? null,
      removeItem: (key: string) => storage.delete(key),
    },
  };
  return {
    target: (timeout = 150) => runInNewContext(`(${uiClickTarget})('button', ${timeout})`, context),
    result: (token: string) =>
      runInNewContext(`(${uiClickResult})(${JSON.stringify(token)})`, context),
    scrolls: () => scrolls,
    listeners: () => [...handlers.values()].reduce((n, set) => n + set.size, 0),
    fire: (type: string, expectedTarget = true) => {
      let prevented = false;
      window.dispatchEvent({
        type,
        composedPath: () => (expectedTarget ? [child, node] : [{}]),
        preventDefault: () => (prevented = true),
        stopImmediatePropagation: () => (prevented = true),
      });
      return prevented;
    },
    options,
  };
}

test('定位后必须有真实点击命中同一节点才通过，完成后移除监听', async () => {
  const fixture = page();
  const { x, y, token } = await fixture.target();
  assert.deepEqual({ x, y }, { x: 60, y: 50 });
  assert.equal(fixture.scrolls(), 1);
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'])
    assert.equal(fixture.fire(type), false);
  assert.equal(fixture.result(token), true);
  assert.equal(fixture.listeners(), 0);
});

test('位置变化时重新定位，停止后才返回最新坐标', async () => {
  const fixture = page({ moveFrames: 3 });
  const { x, y, token } = await fixture.target();
  assert.deepEqual({ x, y }, { x: 63, y: 50 });
  assert.equal(fixture.scrolls(), 2);
  fixture.fire('click');
  fixture.result(token);
});

test('部分越出视口时只使用可见部分，完全越界拒绝点击', async () => {
  const fixture = page({ left: -20 });
  const { x, y, token } = await fixture.target();
  assert.deepEqual({ x, y }, { x: 30, y: 50 });
  fixture.fire('click');
  fixture.result(token);
  await assert.rejects(page({ left: -100 }).target(), /元素未变为可点击状态：button/);
});

for (const [name, options] of [
  ['禁用', { disabled: true }],
  ['隐藏', { hidden: true }],
  ['inert或aria-hidden祖先', { inert: true }],
  ['被其他元素遮挡', { covered: true }],
  ['已移除', { detached: true }],
  ['定位期间被替换', { replaced: true }],
  ['不存在', { missing: true }],
  ['无可见面积', { width: 0 }],
  ['逐帧往返移动', { oscillating: true }],
] as const)
  test(`${name}的目标超时必须失败，不能绕过真实点击条件`, async () => {
    await assert.rejects(page(options).target(), /元素未变为可点击状态：button/);
  });

for (const [name, mutation] of [
  ['被替换', (p: ReturnType<typeof page>) => (p.options.replaced = true)],
  ['被禁用', (p: ReturnType<typeof page>) => (p.options.disabled = true)],
  ['失去连接', (p: ReturnType<typeof page>) => (p.options.missing = true)],
  ['被遮挡或滚离原坐标', (_p: ReturnType<typeof page>) => {}],
] as const)
  test(`定位完成后目标${name}，阻止后续实际误点并报告失败`, async () => {
    const fixture = page();
    const { token } = await fixture.target();
    mutation(fixture);
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'])
      assert.equal(fixture.fire(type, name !== '被遮挡或滚离原坐标'), true);
    assert.throws(() => fixture.result(token), /真实点击未命中预期元素/);
    assert.equal(fixture.listeners(), 0);
  });

test('没有实际点击或校验token不符时失败，不能把仅定位当点击成功', async () => {
  const fixture = page();
  const { token } = await fixture.target();
  assert.throws(() => fixture.result(token), /真实点击未命中预期元素/);
  fixture.fire('click');
  assert.throws(() => fixture.result('wrong-token'), /真实点击未命中预期元素/);
  assert.equal(fixture.listeners(), 0);
});

test('仅pointerup误中其他节点也必须阻止，后续正确事件不能覆盖失败', async () => {
  const fixture = page();
  const { token } = await fixture.target();
  assert.equal(fixture.fire('pointerdown'), false);
  assert.equal(fixture.fire('mousedown'), false);
  assert.equal(fixture.fire('pointerup', false), true);
  assert.equal(fixture.fire('mouseup'), true);
  assert.equal(fixture.fire('click'), true);
  assert.throws(() => fixture.result(token), /真实点击未命中预期元素/);
  assert.equal(fixture.listeners(), 0);
});

for (const [name, options] of [
  ['动画帧停滞', { stalled: true }],
  ['动画帧迟到', { frameDelay: 60 }],
] as const)
  test(`${name}仍遵守独立超时，迟到不能恢复成成功`, async () => {
    const fixture = page(options);
    await assert.rejects(
      Promise.race([
        fixture.target(20),
        new Promise((_, reject) => setTimeout(() => reject(Error('定位期限失效')), 200)),
      ]),
      /元素未变为可点击状态：button/,
    );
    assert.equal(fixture.listeners(), 0);
  });
