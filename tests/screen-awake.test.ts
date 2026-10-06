import test from 'node:test';
import assert from 'node:assert/strict';
import { ScreenAwake } from '../src/screen-awake.ts';

class Lease extends EventTarget {
  released = false;
  type = 'screen' as const;
  onrelease = null;
  releases = 0;
  async release() {
    this.releases++;
    this.released = true;
    this.dispatchEvent(new Event('release'));
  }
}
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
function environment(request?: () => Promise<WakeLockSentinel>) {
  const page = Object.assign(new EventTarget(), {
    visibilityState: 'visible' as DocumentVisibilityState,
  });
  const locks: Lease[] = [];
  let calls = 0;
  const awake = new ScreenAwake(
    {
      wakeLock: {
        request: async (type) => {
          assert.equal(type, 'screen');
          calls++;
          if (request) return request();
          const lock = new Lease();
          locks.push(lock);
          return lock;
        },
      },
    },
    page,
  );
  return { awake, page, locks, calls: () => calls };
}

test('自动历练只申请一次常亮，关闭或暂停会释放', async () => {
  const e = environment();
  e.awake.setActive(false);
  assert.equal(e.calls(), 0);
  e.awake.setActive(true);
  for (let i = 0; i < 100; i++) e.awake.setActive(true);
  await flush();
  assert.equal(e.calls(), 1);
  assert.equal(e.locks[0].released, false);
  e.awake.setActive(false);
  await flush();
  assert.equal(e.locks[0].releases, 1);
  e.awake.setActive(false);
  assert.equal(e.locks[0].releases, 1);
});

test('切到后台释放，回到前台重新申请，关闭后不再申请', async () => {
  const e = environment();
  e.awake.setActive(true);
  await flush();
  e.page.visibilityState = 'hidden';
  e.page.dispatchEvent(new Event('visibilitychange'));
  await flush();
  assert.equal(e.locks[0].released, true);
  e.awake.setActive(true);
  assert.equal(e.calls(), 1);
  e.page.visibilityState = 'visible';
  e.page.dispatchEvent(new Event('visibilitychange'));
  await flush();
  assert.equal(e.calls(), 2);
  e.awake.setActive(false);
  e.page.dispatchEvent(new Event('visibilitychange'));
  await flush();
  assert.equal(e.calls(), 2);
});

test('暂停时尚未完成的常亮请求返回后立即释放', async () => {
  let resolve!: (lock: WakeLockSentinel) => void;
  const e = environment(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  e.awake.setActive(true);
  e.awake.setActive(false);
  const lock = new Lease();
  resolve(lock);
  await flush();
  assert.equal(lock.released, true);
  assert.equal(e.calls(), 1);
});

test('申请期间切屏并返回只保留新请求，不接受旧屏幕状态', async () => {
  const resolves: Array<(lock: WakeLockSentinel) => void> = [];
  const e = environment(() => new Promise((done) => resolves.push(done)));
  e.awake.setActive(true);
  e.page.visibilityState = 'hidden';
  e.page.dispatchEvent(new Event('visibilitychange'));
  e.page.visibilityState = 'visible';
  e.page.dispatchEvent(new Event('visibilitychange'));
  const old = new Lease();
  resolves[0](old);
  await flush();
  assert.equal(old.released, true);
  assert.equal(e.calls(), 2);
  const fresh = new Lease();
  resolves[1](fresh);
  await flush();
  assert.equal(fresh.released, false);
  e.awake.setActive(false);
  await flush();
  assert.equal(fresh.released, true);
});

test('拒绝常亮限频重试，重新开启可以立即再申请', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 });
  const e = environment(async () => {
    throw new DOMException('Denied', 'NotAllowedError');
  });
  e.awake.setActive(true);
  await flush();
  for (let i = 0; i < 100; i++) e.awake.setActive(true);
  assert.equal(e.calls(), 1);
  t.mock.timers.tick(30_000);
  e.awake.setActive(true);
  await flush();
  assert.equal(e.calls(), 2);
  e.awake.setActive(false);
  e.awake.setActive(true);
  await flush();
  assert.equal(e.calls(), 3);
});

test('系统收回常亮后重新申请，快速收回不造成逐帧重试', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 });
  const e = environment();
  e.awake.setActive(true);
  await flush();
  await e.locks[0].release();
  for (let i = 0; i < 100; i++) e.awake.setActive(true);
  assert.equal(e.calls(), 1);
  t.mock.timers.tick(30_000);
  e.awake.setActive(true);
  await flush();
  assert.equal(e.calls(), 2);
  assert.equal(e.locks[1].released, false);
  e.awake.setActive(false);
});

test('已释放的请求结果不会被当作仍然常亮', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 });
  const lock = new Lease();
  await lock.release();
  const e = environment(async () => lock);
  e.awake.setActive(true);
  await flush();
  t.mock.timers.tick(30_000);
  e.awake.setActive(true);
  await flush();
  assert.equal(e.calls(), 2);
});

test('不支持常亮的浏览器安全继续', () => {
  const page = Object.assign(new EventTarget(), {
    visibilityState: 'visible' as DocumentVisibilityState,
  });
  const awake = new ScreenAwake({}, page);
  assert.doesNotThrow(() => {
    awake.setActive(true);
    awake.setActive(false);
  });
});
