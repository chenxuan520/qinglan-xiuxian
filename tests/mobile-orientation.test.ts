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

function panel(t: test.TestContext, controller: Orientation) {
  const old = Object.getOwnPropertyDescriptor(globalThis, 'matchMedia');
  Object.defineProperty(globalThis, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: true }),
  });
  t.after(() => {
    if (old) Object.defineProperty(globalThis, 'matchMedia', old);
    else Reflect.deleteProperty(globalThis, 'matchMedia');
  });
  const input = { value: 'system', onchange: () => {} };
  const status = { textContent: '', isConnected: true };
  const host = {
    isConnected: true,
    hidden: true,
    innerHTML: '',
    querySelector: (selector: string) => (selector === 'select' ? input : status),
  };
  controller.mount(host as unknown as HTMLElement);
  const choose = (value: string) => {
    input.value = value;
    input.onchange();
  };
  return { choose, status };
}

test('无原生锁定能力时选择竖屏不会先把浏览器送进全屏', async (t) => {
  const h = environment(t);
  Reflect.deleteProperty(h.api, 'lock');
  let entries = 0;
  const controller = new Orientation(
    () => true,
    async () => {
      entries++;
    },
  );
  const ui = panel(t, controller);
  ui.choose('portrait');
  await new Promise((done) => setImmediate(done));
  assert.equal(entries, 0);
  assert.deepEqual(h.calls, ['unlock']);
  assert.match(ui.status.textContent, /无法锁定.*已还原/);
  assert.doesNotMatch(ui.status.textContent, /已锁定/);
});

test('锁定请求未完成也能立即选跟随系统退出全屏，迟到结果不能重新锁住', async (t) => {
  const h = environment(t);
  let active = true,
    finish!: () => void;
  h.api.lock = () =>
    new Promise<void>((resolve) => {
      finish = resolve;
    });
  const controller = new Orientation(
    () => active,
    async () => {},
    async () => {
      active = false;
      h.calls.push('exit');
    },
  );
  const ui = panel(t, controller);
  ui.choose('portrait');
  while (!finish) await new Promise((done) => setImmediate(done));
  ui.choose('system');
  assert.equal(active, false, '不等待挂起的原生lock才能还原');
  assert.equal(ui.status.textContent, '当前跟随系统方向。');
  finish();
  await new Promise((done) => setImmediate(done));
  assert.equal(controller.selected, 'system');
  assert.deepEqual(h.calls, ['unlock', 'exit', 'unlock']);
  assert.equal(ui.status.textContent, '当前跟随系统方向。');
});

for (const outcome of ['success', 'physical-change', 'reject', 'new-pending'] as const) {
  test(`超时旧竖屏迟到${outcome}不破坏后来的横屏选择`, async (t) => {
    const h = environment(t, 'portrait');
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let finishOld!: () => void, finishNew!: () => void;
    Object.assign(h.api, { type: 'portrait-primary' });
    h.api.lock = (mode) => {
      h.calls.push(mode);
      if (mode === 'portrait')
        return new Promise<void>((resolve, reject) => {
          finishOld = () => {
            if (outcome === 'physical-change') Object.assign(h.api, { type: 'portrait-primary' });
            if (outcome === 'reject') reject(Error('late rejection'));
            else resolve();
          };
        });
      if (outcome === 'new-pending')
        return new Promise<void>((resolve) => {
          finishNew = () => {
            Object.assign(h.api, { type: 'landscape-primary' });
            resolve();
          };
        });
      Object.assign(h.api, { type: 'landscape-primary' });
      return Promise.resolve();
    };
    const controller = new Orientation();
    const old = controller.apply(() => true);
    t.mock.timers.tick(2000);
    assert.equal(await old, false);
    controller.select('landscape');
    const latest = controller.apply(() => true);
    if (outcome !== 'new-pending') assert.equal(await latest, true);
    finishOld();
    await new Promise((done) => setImmediate(done));
    if (outcome === 'new-pending') {
      assert.equal(
        controller.apply(() => true),
        latest,
        '旧任务不得清掉新pending',
      );
      finishNew();
      assert.equal(await latest, true);
    }
    await new Promise((done) => setImmediate(done));
    assert.equal(controller.selected, 'landscape');
    assert.equal((h.api as typeof h.api & { type: string }).type, 'landscape-primary');
    assert.deepEqual(
      h.calls,
      outcome === 'physical-change'
        ? ['portrait', 'unlock', 'landscape', 'landscape']
        : ['portrait', 'unlock', 'landscape'],
    );
  });
}

for (const rejected of [false, true]) {
  test(`同向重试已成功后旧请求${rejected ? '拒绝' : '成功'}不解除新锁`, async (t) => {
    const h = environment(t, 'portrait');
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let finish!: () => void,
      attempts = 0,
      leaves = 0;
    Object.assign(h.api, { type: 'portrait-primary' });
    h.api.lock = (mode) => {
      h.calls.push(mode);
      if (++attempts > 1) return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        finish = () => (rejected ? reject(Error('late rejection')) : resolve());
      });
    };
    const controller = new Orientation(
      () => true,
      async () => {},
      async () => {
        leaves++;
      },
    );
    const old = controller.apply();
    t.mock.timers.tick(2000);
    assert.equal(await old, false);
    assert.equal(await controller.apply(), true);
    finish();
    await new Promise((done) => setImmediate(done));
    assert.equal(await controller.apply(), true);
    assert.equal(leaves, 0);
    assert.deepEqual(h.calls, ['portrait', 'unlock', 'portrait']);
  });
}

test('迟到锁真的转偏后，修复请求也挂起时仍会自动还原，不留下错误全屏', async (t) => {
  const h = environment(t, 'portrait');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let active = true,
    attempts = 0,
    finishOld!: () => void;
  Object.assign(h.api, { type: 'portrait-primary' });
  h.api.lock = (mode) => {
    h.calls.push(mode);
    attempts++;
    if (attempts === 1)
      return new Promise<void>((resolve) => {
        finishOld = () => {
          Object.assign(h.api, { type: 'portrait-primary' });
          resolve();
        };
      });
    if (attempts === 2) {
      Object.assign(h.api, { type: 'landscape-primary' });
      return Promise.resolve();
    }
    return new Promise<void>(() => {});
  };
  const controller = new Orientation(
    () => active,
    async () => {},
    async () => {
      active = false;
      h.calls.push('exit');
    },
  );
  const ui = panel(t, controller);
  const old = controller.apply();
  t.mock.timers.tick(2000);
  assert.equal(await old, false);
  controller.select('landscape');
  assert.equal(await controller.apply(), true);
  ui.status.textContent = '已锁定横屏。';
  finishOld();
  await new Promise((done) => setImmediate(done));
  assert.equal(attempts, 3, '只修复最新横屏，不重放旧竖屏');
  t.mock.timers.tick(2000);
  await new Promise((done) => setImmediate(done));
  assert.equal(active, false);
  assert.match(ui.status.textContent, /无法锁定.*已还原/);
  assert.deepEqual(h.calls, ['portrait', 'unlock', 'landscape', 'landscape', 'unlock', 'exit']);
});
