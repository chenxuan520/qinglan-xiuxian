import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSave } from '../src/progress.ts';
import { queueFirstRunTour, FIRST_TOUR_KEY, markFirstTourSeen } from '../src/first-run-tour.ts';

type Host = Parameters<typeof queueFirstRunTour>[0];
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
function harness() {
  const save = freshSave();
  save.prologueSeen = true;
  save.mortal.hometown!.stage = 'departed';
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  const scheduled: (() => void)[] = [];
  const state = { starts: 0, loads: 0, fail: false, messages: [] as string[] };
  const module = {
    startAutomaticInterfaceTour: async (
      _ui: unknown,
      _modal: unknown,
      valid: () => boolean,
      begin: () => boolean,
    ) => {
      if (!valid() || state.fail || !begin()) return false;
      state.starts++;
      return true;
    },
  };
  const host = {
    save,
    saveLock: null,
    game: null,
    pendingRun: null,
    panel: '',
    inMortalWorld: false,
    assetsReady: true,
    sceneLoading: false,
    ui: { firstElementChild: {} },
    modal: {},
    document: { hidden: false },
    guideSource: {
      load: async () => {
        state.loads++;
        return module;
      },
    },
    toast: (text: string) => {
      state.messages.push(text);
    },
  } as unknown as Host;
  return {
    host,
    storage,
    values,
    state,
    module,
    queue: (fresh = true) =>
      queueFirstRunTour(host, fresh, storage, (callback) => {
        scheduled.push(callback);
      }),
    tick: async () => {
      const next = scheduled.shift();
      assert.ok(next);
      next();
      await flush();
    },
    scheduled,
  };
}

test('全新存档在首页自动导览一次，只记录设备偏好，不修改真实存档', async () => {
  const h = harness();
  const before = structuredClone(h.host.save);
  h.queue();
  await flush();
  assert.equal(h.state.starts, 1);
  assert.equal(h.values.get(FIRST_TOUR_KEY), 'seen');
  assert.deepEqual(h.host.save, before);
  h.queue();
  await flush();
  assert.equal(h.state.starts, 1);
});

test('旧档没有首次标记不自动开启，已跳过或完成后的轮回也不弹', async () => {
  const h = harness();
  h.queue(false);
  await flush();
  assert.equal(h.state.loads, 0);
  assert.equal(h.scheduled.length, 0);
  h.values.set(FIRST_TOUR_KEY, 'seen');
  h.host.save = freshSave();
  h.queue(true);
  await flush();
  assert.equal(h.state.loads, 0);
});

test('序章、命盘、离乡、素材和其他面板结束前等待，刷新沿用原世pending', async () => {
  for (const block of [
    (h: Host) => {
      h.save.prologueSeen = false;
    },
    (h: Host) => {
      h.panel = 'root-reveal';
    },
    (h: Host) => {
      h.save.mortal.hometown!.stage = 'walk';
      h.inMortalWorld = true;
    },
    (h: Host) => {
      h.assetsReady = false;
      h.sceneLoading = true;
    },
    (h: Host) => {
      h.panel = 'settings';
    },
    (h: Host) => {
      h.document = { hidden: true } as Document;
    },
    (h: Host) => {
      h.saveLock = 'stale';
    },
  ]) {
    const h = harness();
    const clean = { ...h.host };
    const save = structuredClone(h.host.save);
    block(h.host);
    h.queue();
    assert.equal(h.state.loads, 0);
    assert.equal(h.values.get(FIRST_TOUR_KEY), String(h.host.save.medicine.recipeSeed));
    Object.assign(h.host, clean, { save });
    await h.tick();
    assert.equal(h.state.starts, 1);
  }
  const h = harness();
  h.values.set(FIRST_TOUR_KEY, String(h.host.save.medicine.recipeSeed));
  h.queue(false);
  await flush();
  assert.equal(h.state.starts, 1);
});

test('加载期间换面板或首页节点，不覆盖新界面，返回首页才自动开始', async () => {
  const h = harness();
  const pending = Promise.withResolvers<typeof h.module>();
  h.host.guideSource.load = (() => pending.promise) as Host['guideSource']['load'];
  h.queue();
  h.host.panel = 'settings';
  pending.resolve(h.module);
  await flush();
  assert.equal(h.state.starts, 0);
  assert.notEqual(h.values.get(FIRST_TOUR_KEY), 'seen');
  h.host.panel = '';
  await h.tick();
  assert.equal(h.state.starts, 1);
});

test('轮回/导入换世、开始战斗或另一页已看过，不触发迟到自动教程', async () => {
  for (const change of [
    (h: ReturnType<typeof harness>) => {
      h.host.save.medicine.recipeSeed++;
    },
    (h: ReturnType<typeof harness>) => {
      h.host.save.runs = 1;
    },
    (h: ReturnType<typeof harness>) => {
      h.host.game = {} as NonNullable<Host['game']>;
    },
    (h: ReturnType<typeof harness>) => {
      h.values.set(FIRST_TOUR_KEY, 'seen');
    },
  ]) {
    const h = harness();
    h.host.panel = 'prologue';
    h.queue();
    change(h);
    h.host.panel = '';
    await h.tick();
    assert.equal(h.state.loads, 0);
    assert.equal(h.state.starts, 0);
  }
});

test('偏好读写不可用时降级手动，不弹循环教程；加载失败不修改存档或自动重试', async () => {
  for (const phase of ['read', 'initial-write', 'seen-write']) {
    const h = harness();
    if (phase === 'seen-write')
      h.values.set(FIRST_TOUR_KEY, String(h.host.save.medicine.recipeSeed));
    if (phase === 'read')
      h.storage.getItem = () => {
        throw Error('blocked');
      };
    else
      h.storage.setItem = () => {
        throw Error('quota');
      };
    assert.doesNotThrow(() => h.queue());
    await flush();
    assert.equal(h.state.starts, 0);
    assert.equal(h.scheduled.length, 0);
  }
  const h = harness();
  const before = structuredClone(h.host.save);
  h.state.fail = true;
  h.queue();
  await flush();
  assert.equal(h.state.loads, 1);
  assert.equal(h.state.starts, 0);
  assert.equal(h.scheduled.length, 0);
  assert.notEqual(h.values.get(FIRST_TOUR_KEY), 'seen');
  assert.deepEqual(h.host.save, before);
  assert.match(h.state.messages[0], /怎么玩/);
});

test('等待自动导览时已通过手动入口看过，迟到请求和后续返回不再自动启动', async () => {
  const h = harness();
  const pending = Promise.withResolvers<typeof h.module>();
  h.host.guideSource.load = (() => pending.promise) as Host['guideSource']['load'];
  h.queue();
  assert.equal(markFirstTourSeen(h.storage), true);
  pending.resolve(h.module);
  await flush();
  await h.tick();
  assert.equal(h.state.starts, 0);
  assert.equal(h.values.get(FIRST_TOUR_KEY), 'seen');
  assert.equal(h.scheduled.length, 0);
});
