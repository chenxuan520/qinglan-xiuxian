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
  test(`mobile entry requests fullscreen during the click and preserves ${direction}`, async (t) => {
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

test('desktop entry does not change fullscreen or orientation', async (t) => {
  const { calls } = environment(t, false);
  await new MobileDisplay(() => {}).enter();
  assert.deepEqual(calls, []);
});

test('missing screen orientation API does not interrupt fullscreen entry', async (t) => {
  const { calls } = environment(t);
  Reflect.deleteProperty(screen, 'orientation');
  const display = new MobileDisplay(() => {});
  await display.enter();
  assert.equal(display.active, true);
  await display.leave();
  assert.deepEqual(calls, ['fullscreen', 'exit']);
});

test('missing APIs and rejected fullscreen are harmless', async (t) => {
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

test('returning home during fullscreen request releases it without locking the home screen', async (t) => {
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

test('manual fullscreen exit preserves orientation and can be retried with a new click', async (t) => {
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

test('leaving preserves fullscreen already owned by the user', async (t) => {
  const { doc, calls } = environment(t);
  doc.fullscreenElement = {};
  const display = new MobileDisplay(() => {});
  await display.enter();
  await display.leave();
  assert.equal(display.active, true);
  assert.deepEqual(calls, []);
});

test('rapid repeated entry shares one fullscreen request', async (t) => {
  const { calls } = environment(t);
  const display = new MobileDisplay(() => {});
  await Promise.all([display.enter(), display.enter()]);
  assert.deepEqual(calls, ['fullscreen']);
});

test('WebKit fullscreen works without a screen orientation lock API', async (t) => {
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
