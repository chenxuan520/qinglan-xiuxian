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
  const viewport: {
    innerWidth: number;
    innerHeight: number;
    matchMedia?: (query: string) => { matches: boolean };
  } = { innerWidth: 800, innerHeight: 600 };
  const media = { matches: false };
  const counts = { timer: 0, boss: 0, hud: 0, notice: 0, prompt: 0, writes: 0, removes: 0 };
  const geometry = { hudBottom: 125.2, noticeHeight: 36.2, promptHeight: 22.2 };
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
      return { bottom: (media.matches ? timer + 2 : Math.max(137, timer + 10)) + 42 };
    },
  });
  let timer = element();
  const boss = element(true);
  let hud = {
    isConnected: true,
    getBoundingClientRect() {
      counts.hud++;
      return { bottom: geometry.hudBottom };
    },
  };
  const classes = new Set<string>();
  const notice = {
    hidden: false,
    isConnected: true,
    classList: { contains: (name: string) => classes.has(name) },
    getBoundingClientRect() {
      counts.notice++;
      return { height: geometry.noticeHeight };
    },
  };
  let prompt = {
    hidden: true,
    isConnected: true,
    getBoundingClientRect() {
      counts.prompt++;
      return { height: geometry.promptHeight };
    },
  };
  const root = {
    querySelector: (selector: string) =>
      ({
        '.stage-timer': timer,
        '#boss-bar': boss,
        '.game-hud': hud,
        '#notice': notice,
        '#cache-prompt': prompt,
      })[selector] ?? null,
    contains: (node: unknown) => [timer, boss, hud, notice, prompt].includes(node as never),
    style: {
      getPropertyValue: (name: string) => properties.get(name) || '',
      setProperty(name: string, value: string) {
        counts.writes++;
        properties.set(name, value);
      },
      removeProperty(name: string) {
        counts.removes++;
        properties.delete(name);
      },
    },
  } as unknown as HTMLElement;
  const observers: Observer[] = [];
  class Observer {
    private notify: () => void;
    disconnected = false;
    observed: unknown[] = [];
    boxes = new Map<unknown, string | undefined>();
    constructor(notify: () => void) {
      this.notify = notify;
      observers.push(this);
    }
    observe(node: unknown, options?: ResizeObserverOptions) {
      this.observed.push(node);
      this.boxes.set(node, options?.box);
    }
    disconnect() {
      this.disconnected = true;
    }
    fire() {
      this.notify();
    }
    borderChanged(node: unknown) {
      if (this.boxes.get(node) === 'border-box') this.notify();
    }
  }
  return {
    root,
    viewport,
    counts,
    properties,
    boss,
    get timer() {
      return timer;
    },
    get hud() {
      return hud;
    },
    notice,
    get prompt() {
      return prompt;
    },
    classes,
    geometry,
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
    setCompact(matches: boolean) {
      media.matches = matches;
      viewport.matchMedia ??= () => media;
    },
    detach() {
      timer.isConnected = false;
      boss.isConnected = false;
    },
    replace() {
      timer.isConnected = false;
      timer = element();
    },
    replaceHud() {
      const previous = hud;
      previous.isConnected = false;
      hud = { ...previous, isConnected: true };
    },
    replacePrompt() {
      const previous = prompt;
      previous.isConnected = false;
      prompt = { ...previous, isConnected: true };
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
    assert.deepEqual(f.observers[0].observed, [f.timer, f.boss, f.hud]);
    assert.deepEqual([...f.properties.keys()], ['--battle-timer-bottom', '--battle-info-bottom']);
    for (let i = 0; i < 200; i++) layout.update();
    assert.equal(f.pending, 0);
    assert.equal(f.counts.timer, 1);
    f.setBottom(180.2);
    f.observers[0].fire();
    f.flush();
    assert.equal(f.properties.get('--battle-info-bottom'), '181px');
    assert.equal(f.counts.timer, 2);
    assert.equal(f.counts.hud + f.counts.notice + f.counts.prompt + f.counts.removes, 0);
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

test('竖屏以整条顶栏定位，保留原三项并额外观察通知和守匣提示', () =>
  fixture((f) => {
    f.setCompact(true);
    const layout = new HudLayout(f.root);
    layout.update();
    assert.equal(f.pending, 1);
    assert.equal(f.counts.hud, 0, 'update 只调度，不同步读取布局');
    f.flush();
    assert.deepEqual(f.observers[0].observed, [f.timer, f.boss, f.hud, f.notice, f.prompt]);
    assert.equal(f.properties.get('--battle-timer-bottom'), '126px');
    assert.equal(f.properties.get('--battle-info-bottom'), '126px');
    assert.equal(f.properties.get('--battle-notice-space'), '0px');
    assert.equal(f.properties.get('--battle-prompt-space'), '0px');
    assert.equal(f.counts.timer, 0);
    assert.equal(f.counts.hud, 1);
    assert.equal(f.counts.notice + f.counts.prompt, 0, '隐藏提示不读尺寸');
    const before = { ...f.counts };
    for (let i = 0; i < 200; i++) layout.update();
    f.flush();
    assert.deepEqual(f.counts, before, '无变化的 HUD 刷新不逐帧测量或写样式');
  }));

test('竖屏顶栏变高后妖王栏紧随，通知基准在妖王底部且两帧内收敛', () =>
  fixture((f) => {
    f.setCompact(true);
    f.boss.hidden = false;
    const layout = new HudLayout(f.root);
    layout.update();
    f.flush();
    assert.equal(f.properties.get('--battle-info-bottom'), '170px');
    f.geometry.hudBottom = 200.2;
    f.observers[0].fire();
    f.flush();
    assert.equal(f.properties.get('--battle-timer-bottom'), '201px');
    assert.equal(f.properties.get('--battle-info-bottom'), '245px');
    assert.equal(f.pending, 0);
    const writes = f.counts.writes;
    f.observers[0].fire();
    f.flush();
    assert.equal(f.counts.writes, writes, '收敛后不重复写定位变量');
    const before = { ...f.counts };
    for (let i = 0; i < 200; i++) layout.update();
    f.flush();
    assert.deepEqual(f.counts, before);
    f.boss.hidden = true;
    layout.update();
    f.flush();
    assert.equal(f.properties.get('--battle-info-bottom'), '201px');
  }));

test('全屏切换仅改变顶栏内边距与外框高度时，仍重新定位妖王栏且合并测量', () =>
  fixture((f) => {
    f.setCompact(true);
    f.boss.hidden = false;
    const layout = new HudLayout(f.root);
    layout.update();
    f.flush();
    f.geometry.hudBottom = 36;
    for (let i = 0; i < 20; i++) f.observers[0].borderChanged(f.hud);
    assert.equal(f.pending, 1);
    f.flush();
    assert.equal(f.properties.get('--battle-timer-bottom'), '36px');
    assert.equal(f.properties.get('--battle-info-bottom'), '80px');
    assert.equal(f.pending, 0);
  }));

test('提示显隐无需等待尺寸回调，通知 visible 类及两处 hidden 均改变占位', () =>
  fixture((f) => {
    f.setCompact(true);
    const layout = new HudLayout(f.root);
    layout.update();
    f.flush();
    f.classes.add('visible');
    f.prompt.hidden = false;
    const before = { ...f.counts };
    layout.update();
    layout.update();
    assert.equal(f.pending, 1, '多个可见性变化合并同一帧');
    assert.deepEqual(f.counts, before);
    f.flush();
    assert.equal(f.properties.get('--battle-notice-space'), '45px');
    assert.equal(f.properties.get('--battle-prompt-space'), '31px');
    assert.equal(f.counts.notice, 1);
    assert.equal(f.counts.prompt, 1);
    const shown = { ...f.counts };
    for (let i = 0; i < 200; i++) layout.update();
    f.flush();
    assert.deepEqual(f.counts, shown);
    f.classes.delete('visible');
    layout.update();
    f.flush();
    assert.equal(f.properties.get('--battle-notice-space'), '0px');
    assert.equal(f.properties.get('--battle-prompt-space'), '31px');
    assert.equal(f.counts.notice, shown.notice, '不可见通知不读取仍存在的盒尺寸');
    f.classes.add('visible');
    f.notice.hidden = true;
    f.prompt.hidden = true;
    layout.update();
    f.flush();
    assert.equal(f.properties.get('--battle-notice-space'), '0px');
    assert.equal(f.properties.get('--battle-prompt-space'), '0px');
    f.notice.hidden = false;
    layout.update();
    f.flush();
    assert.equal(f.properties.get('--battle-notice-space'), '45px');
  }));

test('通知与守匣换行的尺寸回调合并更新高度加8，空盒及脱离页面不占位', () =>
  fixture((f) => {
    f.setCompact(true);
    f.classes.add('visible');
    f.prompt.hidden = false;
    const layout = new HudLayout(f.root);
    layout.update();
    f.flush();
    f.geometry.noticeHeight = 76;
    f.geometry.promptHeight = 48;
    const before = { ...f.counts };
    for (let i = 0; i < 100; i++) f.observers[0].fire();
    assert.equal(f.pending, 1);
    assert.deepEqual(f.counts, before);
    f.flush();
    assert.equal(f.properties.get('--battle-notice-space'), '84px');
    assert.equal(f.properties.get('--battle-prompt-space'), '56px');
    assert.equal(f.counts.notice, before.notice + 1);
    assert.equal(f.counts.prompt, before.prompt + 1);
    assert.equal(f.counts.writes, before.writes + 2);
    assert.equal(f.pending, 0);
    const writes = f.counts.writes;
    f.observers[0].fire();
    f.flush();
    assert.equal(f.counts.writes, writes);
    f.geometry.noticeHeight = 0;
    f.prompt.isConnected = false;
    const promptReads = f.counts.prompt;
    f.observers[0].fire();
    f.flush();
    assert.equal(f.properties.get('--battle-notice-space'), '0px');
    assert.equal(f.properties.get('--battle-prompt-space'), '0px');
    assert.equal(f.counts.prompt, promptReads);
  }));

test('竖屏转横屏移除专用变量，恢复原三项观察与计时栏测量，转回重新绑定', () =>
  fixture((f) => {
    f.setCompact(true);
    f.classes.add('visible');
    f.prompt.hidden = false;
    const layout = new HudLayout(f.root);
    layout.update();
    f.flush();
    assert.equal(f.properties.get('--battle-notice-space'), '45px');
    f.setCompact(false);
    layout.update();
    assert.ok(f.observers[0].disconnected);
    assert.equal(f.properties.has('--battle-notice-space'), false);
    assert.equal(f.properties.has('--battle-prompt-space'), false);
    assert.deepEqual(f.observers[1].observed, [f.timer, f.boss, f.hud]);
    f.flush();
    assert.equal(f.properties.get('--battle-timer-bottom'), '101px');
    assert.equal(f.properties.get('--battle-info-bottom'), '101px');
    assert.deepEqual([...f.properties.keys()], ['--battle-timer-bottom', '--battle-info-bottom']);
    const before = { ...f.counts };
    for (let i = 0; i < 200; i++) layout.update();
    f.flush();
    assert.deepEqual(f.counts, before);
    f.setCompact(true);
    layout.update();
    assert.ok(f.observers[1].disconnected);
    assert.equal(f.observers[2].observed.length, 5);
    f.flush();
    assert.equal(f.properties.get('--battle-timer-bottom'), '126px');
    assert.equal(f.properties.get('--battle-notice-space'), '45px');
  }));

test('竖屏重建顶栏或提示会换观察节点，reset取消测量、清变量且迟到回调无效', () =>
  fixture((f) => {
    f.setCompact(true);
    const layout = new HudLayout(f.root);
    layout.update();
    f.flush();
    f.replaceHud();
    layout.update();
    assert.ok(f.observers[0].disconnected);
    assert.ok(f.observers[1].observed.includes(f.hud));
    f.replacePrompt();
    layout.update();
    assert.ok(f.observers[1].disconnected);
    assert.ok(f.observers[2].observed.includes(f.prompt));
    assert.equal(f.pending, 1);
    layout.reset();
    assert.ok(f.observers[2].disconnected);
    assert.equal(f.pending, 0);
    assert.equal(f.properties.has('--battle-notice-space'), false);
    assert.equal(f.properties.has('--battle-prompt-space'), false);
    const before = { ...f.counts };
    for (const observer of f.observers) observer.fire();
    f.flush();
    assert.deepEqual(f.counts, before);
  }));

test('竖屏无 ResizeObserver 仍响应视口和显隐，不在每次HUD刷新时测量', () =>
  fixture((f) => {
    f.setCompact(true);
    const layout = new HudLayout(f.root);
    layout.update();
    f.flush();
    const before = { ...f.counts };
    for (let i = 0; i < 200; i++) layout.update();
    f.flush();
    assert.deepEqual(f.counts, before);
    f.classes.add('visible');
    f.prompt.hidden = false;
    f.boss.hidden = false;
    layout.update();
    f.flush();
    assert.equal(f.properties.get('--battle-info-bottom'), '170px');
    assert.equal(f.properties.get('--battle-notice-space'), '45px');
    assert.equal(f.properties.get('--battle-prompt-space'), '31px');
    f.viewport.innerHeight = 800;
    f.geometry.hudBottom = 160;
    layout.update();
    f.flush();
    assert.equal(f.properties.get('--battle-info-bottom'), '204px');
  }, false));
