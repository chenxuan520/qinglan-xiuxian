import test from 'node:test';
import assert from 'node:assert/strict';
import { HudLayout } from '../src/hud-layout.ts';

function fixture(run: (f: ReturnType<typeof environment>) => void, observer = true) {
  const names = ['window', 'requestAnimationFrame', 'cancelAnimationFrame', 'ResizeObserver'];
  const previous = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  const f = environment();
  const values = [f.viewport, f.request, f.cancel, observer ? f.Observer : undefined];
  names.forEach((name, i) =>
    Object.defineProperty(globalThis, name, { configurable: true, value: values[i] }),
  );
  try {
    run(f);
  } finally {
    names.forEach((name, i) => {
      if (previous[i]) Object.defineProperty(globalThis, name, previous[i]!);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
}

function environment() {
  let next = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const properties = new Map<string, string>();
  const viewport = { innerWidth: 800, innerHeight: 600 };
  const counts = { timer: 0, boss: 0, writes: 0 };
  let bottom = 100.2;
  const element = (boss = false) => ({
    isConnected: true,
    hidden: boss,
    getBoundingClientRect() {
      if (!boss) {
        counts.timer++;
        return { bottom };
      }
      counts.boss++;
      const timer = Number.parseFloat(properties.get('--battle-timer-bottom') || '0');
      return { bottom: Math.max(137, timer + 10) + 42 };
    },
  });
  let timer = element();
  const boss = element(true);
  const hud = {};
  const root = {
    querySelector: (selector: string) =>
      selector === '.stage-timer' ? timer : selector === '#boss-bar' ? boss : hud,
    contains: (node: unknown) => node === timer || node === boss,
    style: {
      getPropertyValue: (name: string) => properties.get(name) || '',
      setProperty(name: string, value: string) {
        counts.writes++;
        properties.set(name, value);
      },
    },
  } as unknown as HTMLElement;
  const observers: Observer[] = [];
  class Observer {
    private notify: () => void;
    disconnected = false;
    observed: unknown[] = [];
    constructor(notify: () => void) {
      this.notify = notify;
      observers.push(this);
    }
    observe(node: unknown) {
      this.observed.push(node);
    }
    disconnect() {
      this.disconnected = true;
    }
    fire() {
      this.notify();
    }
  }
  return {
    root,
    viewport,
    counts,
    properties,
    boss,
    observers,
    Observer,
    request: (callback: FrameRequestCallback) => {
      frames.set(++next, callback);
      return next;
    },
    cancel: (id: number) => frames.delete(id),
    get pending() {
      return frames.size;
    },
    setBottom(value: number) {
      bottom = value;
    },
    detach() {
      timer.isConnected = false;
      boss.isConnected = false;
    },
    replace() {
      timer.isConnected = false;
      timer = element();
    },
    flush() {
      let turns = 0;
      while (frames.size) {
        assert.ok(++turns < 8, '定位必须收敛，不能逐帧循环');
        const [id, callback] = frames.entries().next().value!;
        frames.delete(id);
        callback(0);
      }
    },
  };
}

test('普通HUD刷新不反复读布局；内容换行后重新定位', () =>
  fixture((f) => {
    const layout = new HudLayout(f.root);
    layout.update();
    f.flush();
    assert.equal(f.properties.get('--battle-info-bottom'), '101px');
    assert.equal(f.counts.timer, 1);
    assert.equal(f.observers[0].observed.length, 3);
    for (let i = 0; i < 200; i++) layout.update();
    assert.equal(f.pending, 0);
    assert.equal(f.counts.timer, 1);
    f.setBottom(180.2);
    f.observers[0].fire();
    f.flush();
    assert.equal(f.properties.get('--battle-info-bottom'), '181px');
    assert.equal(f.counts.timer, 2);
  }));

test('计时栏移位后妖王栏与通知跟随实际新位置，定位收敛', () =>
  fixture((f) => {
    const layout = new HudLayout(f.root);
    layout.update();
    f.flush();
    f.boss.hidden = false;
    f.setBottom(200.2);
    f.observers[0].fire();
    f.flush();
    assert.equal(f.properties.get('--battle-timer-bottom'), '201px');
    assert.equal(f.properties.get('--battle-info-bottom'), '253px');
    assert.equal(f.pending, 0);
    const writes = f.counts.writes;
    f.observers[0].fire();
    f.flush();
    assert.equal(f.counts.writes, writes, '未变化的定位变量不重复写入');
  }));

test('横竖屏变化重新测量；重建HUD取消旧节点的观察与待办', () =>
  fixture((f) => {
    const layout = new HudLayout(f.root);
    layout.update();
    f.flush();
    f.viewport.innerHeight = 400;
    f.setBottom(90);
    layout.update();
    f.flush();
    assert.equal(f.properties.get('--battle-info-bottom'), '90px');
    f.replace();
    layout.update();
    assert.ok(f.observers[0].disconnected);
    assert.equal(f.observers.length, 2);
    layout.reset();
    assert.ok(f.observers[1].disconnected);
    assert.equal(f.pending, 0);
    const before = { ...f.counts };
    f.observers[1].fire();
    f.flush();
    assert.deepEqual(f.counts, before, '关闭后的迟到回调不再测量或改样式');
  }));

test('脱离页面的节点不再读取位置或写定位变量', () =>
  fixture((f) => {
    const layout = new HudLayout(f.root);
    layout.update();
    f.detach();
    f.flush();
    assert.equal(f.counts.timer, 0);
    assert.equal(f.counts.writes, 0);
  }));

test('缺少ResizeObserver时保留定位，并合并同帧多次刷新', () =>
  fixture((f) => {
    const layout = new HudLayout(f.root);
    for (let i = 0; i < 20; i++) layout.update();
    assert.equal(f.pending, 1);
    f.flush();
    assert.equal(f.counts.timer, 1);
    f.setBottom(222);
    layout.update();
    f.flush();
    assert.equal(f.properties.get('--battle-info-bottom'), '222px');
  }, false));
