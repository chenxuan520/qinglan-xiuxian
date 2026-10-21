import test from 'node:test';
import assert from 'node:assert/strict';
import { MobileDisplay } from '../src/mobile-display.ts';
import { ORIENTATION_KEY } from '../src/orientation.ts';

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
  const preferences = new Map<string, string>();
  for (const [key, value] of Object.entries({
    document: doc,
    screen: { orientation },
    matchMedia: () => ({ matches: mobile }),
    localStorage: {
      getItem: (key: string) => preferences.get(key) ?? null,
      setItem: (key: string, value: string) => {
        preferences.set(key, value);
      },
    },
  })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, key, original);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
  return { calls, doc, root, orientation, events, preferences };
}

test('本机方向选择在入场全屏后锁定，回首页解锁并退出，默认仍跟随系统', async (t) => {
  const h = environment(t);
  h.preferences.set(ORIENTATION_KEY, 'portrait');
  const display = new MobileDisplay(() => {});
  await display.enter();
  assert.deepEqual(h.calls, ['fullscreen', 'portrait']);
  await display.leave();
  assert.deepEqual(h.calls, ['fullscreen', 'portrait', 'unlock', 'exit']);
  await display.enter();
  assert.deepEqual(h.calls.slice(-2), ['fullscreen', 'portrait']);
});

test('方向锁定迟到回调不能把已回首页的屏幕重新锁住', async (t) => {
  const h = environment(t);
  h.preferences.set(ORIENTATION_KEY, 'landscape');
  let resolve!: () => void;
  h.orientation.lock = (mode: string) => {
    h.calls.push(mode);
    return new Promise<void>((done) => {
      resolve = done;
    });
  };
  const display = new MobileDisplay(() => {});
  const entering = display.enter();
  while (!resolve) await new Promise((done) => setImmediate(done));
  await display.leave();
  resolve();
  await entering;
  assert.equal(display.active, false);
  assert.deepEqual(h.calls, ['fullscreen', 'landscape', 'exit', 'unlock']);
});

for (const direction of ['portrait-primary', 'landscape-primary']) {
  test(`手机手动请求全屏，保持${direction === 'portrait-primary' ? '竖屏' : '横屏'}`, async (t) => {
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

test('桌面端调用全屏入口不改变状态或屏幕方向', async (t) => {
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

test('指定竖屏锁定被拒绝时解除隐式方向锁并退出本次全屏', async (t) => {
  const h = environment(t);
  h.preferences.set(ORIENTATION_KEY, 'portrait');
  h.orientation.lock = async (value) => {
    h.calls.push(value);
    throw Error('WebView does not support orientation lock');
  };
  const display = new MobileDisplay(() => {});
  await display.enter();
  assert.equal(display.active, false);
  assert.deepEqual(h.calls, ['fullscreen', 'portrait', 'unlock', 'exit']);
});

test('锁定接口声称成功但仍横屏时不得保留全屏或冒称竖屏成功', async (t) => {
  const h = environment(t);
  h.preferences.set(ORIENTATION_KEY, 'portrait');
  Object.assign(h.orientation, { type: 'landscape-primary' });
  const display = new MobileDisplay(() => {});
  await display.enter();
  assert.equal(display.active, false);
  assert.deepEqual(h.calls, ['fullscreen', 'portrait', 'unlock', 'exit']);
});

test('屏幕API声称竖屏但实际视口仍横屏时自动还原', async (t) => {
  const h = environment(t);
  h.preferences.set(ORIENTATION_KEY, 'portrait');
  Object.assign(h.orientation, { type: 'portrait-primary' });
  Object.defineProperty(globalThis, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({ matches: query === '(pointer: coarse)' }),
  });
  const display = new MobileDisplay(() => {});
  await display.enter();
  assert.equal(display.active, false);
  assert.deepEqual(h.calls, ['fullscreen', 'portrait', 'unlock', 'exit']);
});

test('原生退出暂时拒绝后保留本次全屏归属，允许再次还原', async (t) => {
  const h = environment(t);
  const display = new MobileDisplay(() => {});
  await display.enter();
  const exit = h.doc.exitFullscreen;
  h.doc.exitFullscreen = async () => {
    throw Error('temporary WebView failure');
  };
  assert.equal(await display.leave(), false);
  assert.equal(display.active, true);
  h.doc.exitFullscreen = exit;
  assert.equal(await display.leave(), true);
  assert.equal(display.active, false);
  assert.deepEqual(h.calls, ['fullscreen', 'exit']);
});

test('原生方向锁挂起两秒自动退出，迟到成功不重锁，随后仍可重新选择', async (t) => {
  const h = environment(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  h.preferences.set(ORIENTATION_KEY, 'portrait');
  let finish!: () => void;
  h.orientation.lock = (value) => {
    h.calls.push(value);
    return new Promise<void>((resolve) => {
      finish = resolve;
    });
  };
  const display = new MobileDisplay(() => {});
  const entering = display.enter();
  while (!finish) await new Promise((done) => setImmediate(done));
  t.mock.timers.tick(2000);
  await entering;
  assert.equal(display.active, false);
  assert.deepEqual(h.calls, ['fullscreen', 'portrait', 'unlock', 'exit']);
  finish();
  await new Promise((done) => setImmediate(done));
  assert.equal(display.active, false);
  assert.equal(h.calls.at(-1), 'unlock');
  h.orientation.lock = async (value) => {
    h.calls.push(value);
  };
  await display.enter();
  assert.equal(display.active, true);
  assert.deepEqual(h.calls.slice(-2), ['fullscreen', 'portrait']);
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

test('快速重复手动进入全屏共用同一个请求', async (t) => {
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
