import test from 'node:test';
import assert from 'node:assert/strict';
import { startAdWatch } from '../src/scene-flow.ts';
import { freshSave } from '../src/progress.ts';
import { watchAdPlacement } from '../src/ads.ts';

test('真实无投放显示招租，加载故障原位重试作废旧轮次且不重复领取', () => {
  for (const noInventory of [true, false]) {
    const children: any[] = [],
      watches: any[] = [],
      cleared: unknown[] = [];
    const host: any = {
      hidden: false,
      removeAttribute() {},
      append: (node: any) => children.push(node),
    };
    let text = '';
    Object.defineProperty(host, 'textContent', {
      get: () => text,
      set(value) {
        text = value;
        children.length = 0;
      },
    });
    const button: any = {};
    const shell: any = {
      save: freshSave(),
      panel: 'reward-ad',
      adTimer: 1,
      adWatchEpoch: 0,
      getAdProvider: () => ({ name: 'platform' }),
      modal: { querySelector: (selector: string) => (selector === '.revive-ad' ? host : button) },
      document: { createElement: () => ({}) },
      watchAdPlacement: (options: any) => watches.push(options),
      clearInterval: (timer: unknown) => cleared.push(timer),
      startAdCountdown() {
        this.adReadyAt = 12345;
      },
      startAdWatch: (...args: any[]) => startAdWatch(shell, ...args),
      markAdWatched() {
        throw Error('重试不能直接领取');
      },
    };
    startAdWatch(shell, 'claim-ad-reward', '领取奖励', 'reward-supplies');
    watches[0].onFallback('synthetic failure', noInventory);
    assert.equal(text, noInventory ? '广告位招租' : '广告加载失败');
    assert.equal(shell.adReadyAt, 12345, '保留既有占位兜底');
    assert.equal(children.length, noInventory ? 0 : 1);
    if (noInventory) continue;
    const retry = children[0];
    retry.onclick();
    assert.equal(watches.length, 2);
    assert.equal(shell.adReadyAt, 0);
    assert.equal(button.disabled, true);
    assert.equal(shell.adWatched, false);
    assert.deepEqual(cleared, [1]);
    assert.equal(watches[0].alive(), false);
    assert.equal(watches[1].alive(), true);
    retry.onclick();
    assert.equal(watches.length, 2, '已拆除按钮的迟到重复事件不能重开');
    shell.panel = '';
    assert.equal(watches[1].alive(), false);
  }
});

test('合法投放更新的静默诊断不等于无库存，仍给重试而非招租', async () => {
  const noInventory = await new Promise<boolean>((resolve) => {
    watchAdPlacement({
      provider: {
        name: 'platform',
        placementName: () => 'synthetic',
        prepare: async (context) => {
          context!.trace!.silent = true;
          return false;
        },
        play: () => assert.fail('未准备不能播放'),
      },
      placement: 'reward-supplies',
      alive: () => true,
      onWatched: () => assert.fail('更新不能冒充看完'),
      onFallback: (_reason, empty) => resolve(empty),
    });
  });
  assert.equal(noInventory, false);
});
