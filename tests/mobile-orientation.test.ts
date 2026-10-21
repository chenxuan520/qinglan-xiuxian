import test from 'node:test';
import assert from 'node:assert/strict';
import { Orientation, ORIENTATION_KEY } from '../src/orientation.ts';

function environment(t: test.TestContext, initial?: string) {
  const calls: string[] = [];
  const entries = new Map(initial === undefined ? [] : [[ORIENTATION_KEY, initial]]);
  let fail = false;
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem(key: string, value: string) {
      if (fail) throw Error('storage-full');
      entries.set(key, value);
    },
  };
  const api = {
    async lock(mode: string) {
      calls.push(mode);
    },
    unlock() {
      calls.push('unlock');
    },
  };
  for (const [key, value] of Object.entries({
    localStorage: storage,
    screen: { orientation: api },
  })) {
    const old = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => {
      if (old) Object.defineProperty(globalThis, key, old);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
  return {
    calls,
    api,
    entries,
    block: () => {
      fail = true;
    },
  };
}

test('缺省及坏设置跟随系统，读回有效本机选择，不写游戏存档', async (t) => {
  const h = environment(t);
  for (const stored of [undefined, 'bad', 'system']) {
    if (stored === undefined) h.entries.delete(ORIENTATION_KEY);
    else h.entries.set(ORIENTATION_KEY, stored);
    const controller = new Orientation();
    assert.equal(controller.selected, 'system');
    assert.equal(await controller.apply(() => true), true);
    assert.deepEqual(h.calls, []);
  }
  const controller = new Orientation();
  assert.equal(controller.select('portrait'), true);
  assert.equal(new Orientation().selected, 'portrait');
  assert.deepEqual([...h.entries.keys()], [ORIENTATION_KEY]);
  assert.equal(await controller.apply(() => true), true);
  assert.deepEqual(h.calls, ['portrait']);
});

test('竖横锁定只各申请一次，跟随系统解除本游戏方向锁', async (t) => {
  const h = environment(t);
  const controller = new Orientation();
  for (const mode of ['portrait', 'landscape']) {
    assert.equal(controller.select(mode), true);
    assert.equal(await controller.apply(() => true), true);
    assert.equal(await controller.apply(() => true), true);
  }
  assert.deepEqual(h.calls, ['portrait', 'landscape']);
  controller.select('system');
  await controller.apply(() => true);
  controller.release();
  assert.deepEqual(h.calls, ['portrait', 'landscape', 'unlock']);
});

test('保存失败不部分应用选择，也不覆盖旧值；非法值拒绝', async (t) => {
  const h = environment(t, 'portrait');
  const controller = new Orientation();
  h.block();
  assert.equal(controller.select('landscape'), false);
  assert.equal(controller.select('arbitrary'), false);
  assert.equal(controller.selected, 'portrait');
  assert.equal(h.entries.get(ORIENTATION_KEY), 'portrait');
  await controller.apply(() => true);
  assert.deepEqual(h.calls, ['portrait']);
});

test('浏览器不支持或拒绝时解除旧锁，不把失败当成已锁定', async (t) => {
  const h = environment(t, 'portrait');
  const controller = new Orientation();
  await controller.apply(() => true);
  controller.select('landscape');
  h.api.lock = async () => {
    throw Error('not-supported');
  };
  assert.equal(await controller.apply(() => true), false);
  assert.deepEqual(h.calls, ['portrait', 'unlock']);
  Reflect.deleteProperty(h.api, 'lock');
  assert.equal(await controller.apply(() => true), false);
});

test('锁定等待期间改选横屏只应用最新选择，返回首页解除迟到锁', async (t) => {
  const h = environment(t, 'portrait');
  let resolve!: () => void;
  h.api.lock = (mode: string) => {
    h.calls.push(mode);
    return mode === 'portrait'
      ? new Promise<void>((done) => {
          resolve = done;
        })
      : Promise.resolve();
  };
  let active = true;
  const controller = new Orientation();
  const pending = controller.apply(() => active);
  controller.select('landscape');
  const latest = controller.apply(() => active);
  assert.equal(latest, pending);
  resolve();
  await pending;
  assert.deepEqual(h.calls, ['portrait', 'landscape']);
  controller.select('portrait');
  const leaving = controller.apply(() => active);
  active = false;
  controller.release();
  resolve();
  await leaving;
  assert.deepEqual(h.calls, ['portrait', 'landscape', 'portrait', 'unlock', 'unlock']);
});
