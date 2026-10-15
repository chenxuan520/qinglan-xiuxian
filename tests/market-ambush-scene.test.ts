import test from 'node:test';
import assert from 'node:assert/strict';
import { MarketAmbushScene } from '../src/market-ambush-scene.ts';
import { initialAmbushSnapshot, type AmbushSnapshot } from '../src/market-ambush-data.ts';
import type { SaveData } from '../src/progress.ts';
import type { MarketCultivator } from '../src/sect-market-data.ts';

class Element extends EventTarget {
  innerHTML = '';
  textContent = '';
  hidden = false;
  disabled = false;
  value = 0;
  style: Record<string, string> = {};
  removed = false;
  focus() {}
  remove() {
    this.removed = true;
  }
}
const stats = { hp: 10000, damage: 1, enemyHp: 10000, enemyDamage: 1, speed: 175 };
async function harness(
  checkpoint: (snapshot: AmbushSnapshot) => boolean = () => true,
  snapshot = initialAmbushSnapshot(stats),
  imageFailure = false,
  useObserver = false,
) {
  const names = ['document', 'window', 'Image', 'ResizeObserver', 'IntersectionObserver'] as const;
  const previous = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  const document = Object.assign(new EventTarget(), { hidden: false });
  const window = new EventTarget();
  let fail = imageFailure;
  const images: { onload: (() => void) | null; onerror: (() => void) | null }[] = [];
  class Image {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor() {
      images.push(this);
    }
    set src(_: string) {
      queueMicrotask(() => (fail ? this.onerror?.() : this.onload?.()));
    }
  }
  const intersections: ((entries: unknown[]) => void)[] = [];
  let disconnected = 0;
  class IntersectionObserver {
    constructor(callback: (entries: unknown[]) => void) {
      intersections.push(callback);
    }
    observe() {}
    disconnect() {
      disconnected++;
    }
  }
  const globals = {
    document,
    window,
    Image,
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    IntersectionObserver: useObserver ? IntersectionObserver : undefined,
  };
  for (const name of names)
    Object.defineProperty(globalThis, name, {
      value: globals[name],
      configurable: true,
      writable: true,
    });
  const nodes = new Map<string, Element>();
  for (const name of [
    '.market-ambush-field',
    '.ambush-player',
    '.ambush-enemy',
    '.ambush-player-hp',
    '.ambush-enemy-hp',
    '.ambush-warning',
    '.ambush-shots',
    '.ambush-clock',
    '.ambush-loading',
    '.ambush-save-error',
    '[data-action="market-ambush-exit"]',
  ])
    nodes.set(name, new Element());
  const host = Object.assign(new Element(), {
    querySelector: (selector: string) => nodes.get(selector) ?? null,
  });
  const save = {
    path: 'orthodox',
    mortal: { marketSocial: { ambush: { stats, snapshot, revivesUsed: 0 } } },
  } as unknown as SaveData;
  const finished: string[] = [];
  const scene = new MarketAmbushScene(
    host as unknown as HTMLElement,
    save,
    { path: 'demonic' } as MarketCultivator,
    (result) => finished.push(result),
    checkpoint,
  );
  await new Promise((resolve) => setImmediate(resolve));
  return {
    scene,
    host,
    document,
    window,
    nodes,
    save,
    finished,
    images,
    visible: (ratio: number, intersecting = ratio > 0) => {
      for (const callback of intersections)
        callback([
          {
            target: nodes.get('.market-ambush-field'),
            intersectionRatio: ratio,
            isIntersecting: intersecting,
          },
        ]);
    },
    disconnected: () => disconnected,
    setImageFailure: (value: boolean) => {
      fail = value;
    },
    restore: () => {
      scene.destroy();
      names.forEach((name, i) => {
        const descriptor = previous[i];
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      });
    },
  };
}

test('场景从固定snapshot恢复，每秒、双方HP变化及撤离请求即时保存', async () => {
  const stored: AmbushSnapshot[] = [];
  const initial = initialAmbushSnapshot(stats);
  initial.time = 8;
  initial.player.hp = 8123;
  const h = await harness((s) => {
    stored.push(s);
    return true;
  }, initial);
  try {
    assert.equal(h.scene.ready, true);
    assert.equal(h.scene.duel.time, 8);
    assert.equal(h.scene.duel.player.hp, 8123);
    h.scene.update(1000, true);
    h.scene.update(1600, true);
    assert.equal(stored.length, 0);
    h.scene.update(2200, true);
    assert.ok(stored.some((s) => s.time >= 9));
    assert.equal(h.scene.requestRetreat(), true);
    assert.equal(stored.at(-1)!.retreatRequested, true);
    // 玩家弹丸命中后即刻保存，不等待下一秒周期。
    h.scene.duel.shots = [{ x: h.scene.duel.enemy.x, y: h.scene.duel.enemy.y, vx: 0, vy: 0 }];
    const count = stored.length;
    h.scene.update(2210, true);
    assert.ok(stored.length > count);
    assert.equal(stored.at(-1)!.enemy.hp, h.scene.duel.enemy.hp);
    assert.equal(
      h.save.mortal.marketSocial!.ambush!.snapshot.player.hp,
      8123,
      '场景通过回调保存，不偷改外部save',
    );
  } finally {
    h.restore();
  }
});

test('checkpoint失败冻结完整战况，终局保存成功前不finish，重试只通知一次', async () => {
  let accepted = false;
  const stored: AmbushSnapshot[] = [];
  const initial = initialAmbushSnapshot(stats);
  initial.enemy.hp = 1;
  initial.shots = [{ x: initial.enemy.x, y: initial.enemy.y, vx: 0, vy: 0 }];
  const h = await harness((s) => {
    stored.push(s);
    return accepted;
  }, initial);
  try {
    h.scene.update(1000, true);
    h.scene.update(1050, true);
    assert.equal(h.scene.duel.outcome, 'victory');
    assert.equal(h.scene.checkpointBlocked, true);
    assert.deepEqual(h.finished, []);
    const frozen = h.scene.duel.snapshot();
    h.scene.update(5000, true);
    assert.deepEqual(h.scene.duel.snapshot(), frozen);
    assert.equal(h.scene.requestRetreat(), false);
    accepted = true;
    h.window.dispatchEvent(new Event('blur'));
    assert.equal(h.scene.checkpointBlocked, true, '切后台不能绕过显式重试解除保存失败冻结');
    h.window.dispatchEvent(new Event('focus'));
    assert.equal(h.scene.retryCheckpoint(), true);
    assert.deepEqual(h.finished, ['victory']);
    assert.equal(stored.at(-1)!.outcome, 'victory');
    h.scene.update(6000, true);
    h.scene.retryCheckpoint();
    assert.deepEqual(h.finished, ['victory']);
  } finally {
    h.restore();
  }
});

test('失焦/隐藏保存并暂停，返回不追算后台时间；加载失败只暂停并可重试', async () => {
  let checkpoints = 0;
  const h = await harness(
    () => {
      checkpoints++;
      return true;
    },
    initialAmbushSnapshot(stats),
    true,
  );
  try {
    assert.equal(h.scene.ready, false);
    assert.equal(h.scene.assetsFailed, true);
    h.scene.update(1000, true);
    h.scene.update(9000, true);
    assert.equal(h.scene.duel.time, 0);
    assert.equal(h.scene.duel.outcome, null);
    assert.match(h.nodes.get('.ambush-loading')!.innerHTML, /重试加载/);
    h.setImageFailure(false);
    await h.scene.retryAssets();
    assert.equal(h.scene.ready, true);
    h.scene.update(10000, true);
    h.scene.update(10050, true);
    const before = h.scene.duel.snapshot();
    h.window.dispatchEvent(new Event('blur'));
    assert.equal(checkpoints, 1);
    h.scene.update(20000, true);
    assert.deepEqual(h.scene.duel.snapshot(), before);
    h.window.dispatchEvent(new Event('focus'));
    h.scene.update(30000, true);
    assert.deepEqual(h.scene.duel.snapshot(), before);
    h.document.hidden = true;
    h.document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(checkpoints, 2);
    h.scene.update(60000, true);
    assert.deepEqual(h.scene.duel.snapshot(), before);
    h.document.hidden = false;
    h.document.dispatchEvent(new Event('visibilitychange'));
    h.scene.update(80000, true);
    assert.deepEqual(h.scene.duel.snapshot(), before);
  } finally {
    h.restore();
  }
});

test('复活场景先保存满血无敌新快照，失败继续冻结；锁结局不伪造脱身', async () => {
  let accepted = true;
  const initial = initialAmbushSnapshot(stats);
  initial.player.hp = 0;
  initial.enemy.hp = 500;
  initial.outcome = 'defeat';
  const h = await harness(() => accepted, initial);
  try {
    h.scene.update(1000, true);
    assert.deepEqual(h.finished, ['defeat']);
    accepted = false;
    assert.equal(h.scene.revive(), false);
    assert.equal(h.scene.duel.player.hp, stats.hp);
    assert.equal(h.scene.duel.enemy.hp, 500);
    assert.equal(h.scene.duel.invincible, 3);
    assert.equal(h.scene.checkpointBlocked, true);
    const before = h.scene.duel.snapshot();
    h.scene.update(9000, true);
    assert.deepEqual(h.scene.duel.snapshot(), before);
    accepted = true;
    h.scene.retryCheckpoint();
    assert.equal(h.scene.lockOutcome('escaped'), false);
    assert.equal(h.scene.duel.outcome, null);
  } finally {
    h.restore();
  }
});

test('撤离按钮先于场地，首次可见回调前冻结；战场不足70%可见时保存暂停', async () => {
  let checkpoints = 0;
  const h = await harness(
    () => {
      checkpoints++;
      return true;
    },
    initialAmbushSnapshot(stats),
    false,
    true,
  );
  try {
    assert.ok(
      h.host.innerHTML.indexOf('data-action="market-ambush-exit"') <
        h.host.innerHTML.indexOf('class="market-ambush-field"'),
    );
    assert.equal(h.scene.ready, true);
    h.scene.update(1000, true);
    h.scene.update(5000, true);
    assert.equal(h.scene.duel.time, 0, '素材就绪也必须等场地首次可见回调');
    h.visible(0.7);
    h.scene.update(6000, true);
    h.scene.update(6100, true);
    assert.ok(h.scene.duel.time > 0);
    const before = h.scene.duel.snapshot();
    h.visible(0.69);
    assert.equal(checkpoints, 1, '滚出战场时立即保存');
    h.scene.update(10000, true);
    h.scene.update(20000, true);
    assert.deepEqual(h.scene.duel.snapshot(), before);
    h.visible(0.7);
    h.scene.update(30000, true);
    assert.deepEqual(h.scene.duel.snapshot(), before, '滚回场地不追算离开期间时间');
    h.scene.update(30100, true);
    assert.ok(h.scene.duel.time > before.time);
    h.visible(1, false);
    const offscreen = h.scene.duel.snapshot();
    h.scene.update(90000, true);
    assert.deepEqual(h.scene.duel.snapshot(), offscreen);
  } finally {
    h.restore();
  }
  assert.equal(h.disconnected(), 1);
});
