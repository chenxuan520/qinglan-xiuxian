import test from 'node:test';
import assert from 'node:assert/strict';
import { MobileDisplay } from '../src/mobile-display.ts';

function environment(t: test.TestContext, mobile = true) {
  const calls: string[] = [];
  const events = new EventTarget();
  const root = {
    async requestFullscreen() {
      calls.push('fullscreen');
      doc.fullscreenElement = root;
      events.dispatchEvent(new Event('fullscreenchange'));
    },
  };
  const doc = {
    documentElement: root,
    fullscreenElement: null as object | null,
    addEventListener: events.addEventListener.bind(events),
    async exitFullscreen() {
      calls.push('exit');
      doc.fullscreenElement = null;
      events.dispatchEvent(new Event('fullscreenchange'));
    },
  };
  const orientation = {
    async lock(value: string) {
      calls.push(value);
    },
    unlock() {
      calls.push('unlock');
    },
  };
  for (const [key, value] of Object.entries({
    document: doc,
    screen: { orientation },
    matchMedia: () => ({ matches: mobile }),
  })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, key, original);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
  return { calls, doc, root, orientation, events };
}

for (const direction of ['portrait-primary', 'landscape-primary']) {
  test(`手机点击入场立即请求全屏，保持${direction === 'portrait-primary' ? '竖屏' : '横屏'}`, async (t) => {
    const { calls, orientation } = environment(t);
    Object.assign(orientation, { type: direction });
    const display = new MobileDisplay(() => {});
    const entered = display.enter();
    assert.deepEqual(calls, ['fullscreen']);
    await entered;
    assert.deepEqual(calls, ['fullscreen']);
    assert.equal(display.active, true);
    await display.leave();
    assert.deepEqual(calls, ['fullscreen', 'exit']);
    assert.equal(display.active, false);
  });
}

test('桌面端入场不改变全屏状态或屏幕方向', async (t) => {
  const { calls } = environment(t, false);
  await new MobileDisplay(() => {}).enter();
  assert.deepEqual(calls, []);
});

test('缺少屏幕方向接口不影响进入全屏', async (t) => {
  const { calls } = environment(t);
  Reflect.deleteProperty(screen, 'orientation');
  const display = new MobileDisplay(() => {});
  await display.enter();
  assert.equal(display.active, true);
  await display.leave();
  assert.deepEqual(calls, ['fullscreen', 'exit']);
});

test('缺少全屏接口或全屏请求被拒绝时安全降级', async (t) => {
  const { calls, root } = environment(t);
  root.requestFullscreen = async () => {
    throw new Error('NotAllowedError');
  };
  const display = new MobileDisplay(() => {});
  await display.enter();
  assert.equal(display.active, false);
  Reflect.deleteProperty(root, 'requestFullscreen');
  await display.enter();
  await display.leave();
  assert.deepEqual(calls, []);
});

test('全屏请求期间返回首页会在请求完成后退出全屏，不锁定首页', async (t) => {
  const { calls, root, doc } = environment(t);
  let resolve!: () => void;
  root.requestFullscreen = () =>
    new Promise<void>((done) => {
      resolve = () => {
        doc.fullscreenElement = root;
        done();
      };
    });
  const display = new MobileDisplay(() => {});
  const entry = display.enter();
  await display.leave();
  resolve();
  await entry;
  assert.equal(display.active, false);
  assert.deepEqual(calls, ['exit']);
});

test('手动退出全屏不改变屏幕方向，再次点击可重新进入', async (t) => {
  const { calls, doc } = environment(t);
  let updates = 0;
  const display = new MobileDisplay(() => {
    updates++;
  });
  await display.enter();
  await doc.exitFullscreen();
  assert.deepEqual(calls, ['fullscreen', 'exit']);
  assert.equal(display.active, false);
  await display.enter();
  assert.equal(display.active, true);
  assert.equal(updates, 3);
});

test('离场时保留用户原有的全屏状态', async (t) => {
  const { doc, calls } = environment(t);
  doc.fullscreenElement = {};
  const display = new MobileDisplay(() => {});
  await display.enter();
  await display.leave();
  assert.equal(display.active, true);
  assert.deepEqual(calls, []);
});

test('快速重复入场共用同一个全屏请求', async (t) => {
  const { calls } = environment(t);
  const display = new MobileDisplay(() => {});
  await Promise.all([display.enter(), display.enter()]);
  assert.deepEqual(calls, ['fullscreen']);
});

test('缺少屏幕方向锁定接口时仍可使用 WebKit 全屏', async (t) => {
  const { doc, root, calls, orientation, events } = environment(t);
  const webkitDoc = Object.assign(doc, { webkitFullscreenElement: null as object | null });
  Object.assign(root, {
    webkitRequestFullscreen() {
      calls.push('fullscreen');
      webkitDoc.webkitFullscreenElement = root;
      events.dispatchEvent(new Event('webkitfullscreenchange'));
    },
  });
  Object.assign(doc, {
    webkitExitFullscreen() {
      calls.push('exit');
      webkitDoc.webkitFullscreenElement = null;
      events.dispatchEvent(new Event('webkitfullscreenchange'));
    },
  });
  Reflect.deleteProperty(root, 'requestFullscreen');
  Reflect.deleteProperty(doc, 'exitFullscreen');
  Reflect.deleteProperty(orientation, 'lock');
  const display = new MobileDisplay(() => {});
  await display.enter();
  assert.equal(display.active, true);
  await display.leave();
  assert.equal(display.active, false);
  assert.deepEqual(calls, ['fullscreen', 'exit']);
});
