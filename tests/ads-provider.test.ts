// 广告 provider 注册表与 AdSense provider 的契约测试。
// AdSense 未配置 client 时准备阶段直接失败、回退占位（当前线上行为）。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAdProvider,
  setAdSoundEnabled,
  watchAdPlacement,
  type RewardAdProvider,
} from '../src/ads.ts';
import { adsenseProvider } from '../src/ads-adsense.ts';

// 官方 adBreak() 合法参数全集（Placement API Reference，2023-12-05 版）。
const LEGAL_ADBREAK_KEYS = new Set([
  'type',
  'name',
  'beforeAd',
  'afterAd',
  'beforeReward',
  'adDismissed',
  'adViewed',
  'adBreakDone',
]);

type AdGlobals = {
  adBreak?: (options: Record<string, unknown>) => void;
  adConfig?: (options: Record<string, unknown>) => void;
};

// 往 globalThis 注一个最小的官方惯用广告环境：adBreak/adConfig 只负责抓取调用参数。
function fakeSdk() {
  const scope = globalThis as unknown as AdGlobals;
  const captured: { adBreak?: Record<string, unknown>; adConfigs: Record<string, unknown>[] } = {
    adConfigs: [],
  };
  scope.adBreak = (options) => {
    captured.adBreak = options;
  };
  scope.adConfig = (options) => captured.adConfigs.push(options);
  return {
    captured,
    cleanup() {
      delete scope.adBreak;
      delete scope.adConfig;
    },
  };
}

// 在注入环境下跑一次 play：返回可驱动官方回调的选项与最终 watched/failed 状态。
function playOnce(placement: 'revive' | 'reward-root' | 'reward-supplies' | 'lifespan') {
  const sdk = fakeSdk();
  const result = { watched: false, failed: null as string | null };
  assert.doesNotThrow(() =>
    adsenseProvider.play(placement, {
      onWatched: () => {
        result.watched = true;
      },
      onFailed: (reason) => {
        result.failed = reason;
      },
    }),
  );
  assert.ok(sdk.captured.adBreak, 'SDK 已注入时不应直接走 onFailed');
  return { sdk, options: sdk.captured.adBreak!, result };
}

test('配置层指向注册过的 provider；占位 provider 恒可用作回退', async () => {
  // 联网供给由后台配置选择；占位恒在此接住失败路径。
  const active = getAdProvider();
  assert.ok(
    ['platform', 'adsense', 'placeholder', 'house'].includes(active.name),
    `未知 provider：${active.name}`,
  );
  assert.equal(active.name, 'platform', '联网版在实际打开广告后才读取平台选择');
  if (active.name === 'placeholder') {
    assert.equal(await active.prepare(), false);
    let failed: string | null = null;
    active.play('revive', {
      onWatched: () => assert.fail('占位模式不能有观看完成回调'),
      onFailed: (reason) => {
        failed = reason;
      },
    });
    assert.ok(failed);
  }
});

test('adsense 未配置 client 时 prepare 直接失败，占位兜底保持可用', async () => {
  assert.equal(await adsenseProvider.prepare(), false);
  assert.ok(getAdProvider().name);
});

test('adsense 的 placement 命名与 SDK 未注入时的失败路径都规整', () => {
  assert.equal(adsenseProvider.placementName('revive'), 'qinglan-revive');
  assert.equal(adsenseProvider.placementName('lifespan'), 'qinglan-lifespan');
  let failed: string | null = null;
  adsenseProvider.play('revive', {
    onWatched: () => assert.fail('未注入 SDK 不应发奖'),
    onFailed: (reason) => {
      failed = reason;
    },
  });
  assert.ok(failed);
});

test('adsense play 只用官方合法回调参数，完整看完成才解锁发奖', () => {
  const { sdk, options, result } = playOnce('revive');
  try {
    for (const key of Object.keys(options))
      assert.ok(LEGAL_ADBREAK_KEYS.has(key), `非法 adBreak 参数 ${key}`);
    assert.equal(options.type, 'reward');
    assert.equal(options.name, 'qinglan-revive');
    // sound 跟随静音（默认关闭）。
    assert.deepEqual(sdk.captured.adConfigs.at(-1), { sound: 'off' });

    // beforeReward 触发官方 showAdFn：只播放，不发奖。
    (options.beforeReward as (showAdFn: () => void) => void)(() => {});
    assert.equal(result.watched, false);
    // adViewed 是官方"看完发奖"的信号；之后才允许解锁。
    (options.adViewed as () => void)();
    assert.equal(result.watched, true);
    // 看完后再来 adBreakDone 也不能翻车。
    (options.adBreakDone as (info: { breakStatus: string }) => void)({ breakStatus: 'viewed' });
    assert.equal(result.failed, null);
  } finally {
    sdk.cleanup();
  }
});

test('广告被中途关闭与 adBreakDone 非 viewed 状态都按失败回退', () => {
  const dismissed = playOnce('lifespan');
  try {
    (dismissed.options.adDismissed as () => void)();
    assert.equal(dismissed.result.watched, false);
    assert.match(dismissed.result.failed!, /中途关闭/);
  } finally {
    dismissed.sdk.cleanup();
  }
  const timeout = playOnce('reward-supplies');
  try {
    (timeout.options.adBreakDone as (info: { breakStatus: string }) => void)({
      breakStatus: 'timeout',
    });
    assert.equal(timeout.result.watched, false);
    assert.match(timeout.result.failed!, /timeout/);
  } finally {
    timeout.sdk.cleanup();
  }
});

test('声音开关实时同步到广告 SDK 的 sound 参数', () => {
  setAdSoundEnabled(true);
  const loud = playOnce('revive');
  try {
    assert.deepEqual(loud.sdk.captured.adConfigs.at(-1), { sound: 'on' });
  } finally {
    loud.sdk.cleanup();
  }
  setAdSoundEnabled(false);
  const quiet = playOnce('revive');
  try {
    assert.deepEqual(quiet.sdk.captured.adConfigs.at(-1), { sound: 'off' });
  } finally {
    quiet.sdk.cleanup();
    setAdSoundEnabled(false);
  }
});

test('SDK 装死（prepare 通过但 play 永不返回回调）时，超时自动回退占位倒计时', async () => {
  const silent: RewardAdProvider = {
    name: 'silent',
    placementName: (p) => p,
    prepare: async () => true,
    play: () => {
      // 故意一句话不多说：模拟未过审账号或库加载失败的完全沉默。
    },
  };
  const outcome = await new Promise<{ watched: boolean; fallback: string | null }>(
    (resolvePromise) => {
      const result = { watched: false, fallback: null as string | null };
      watchAdPlacement({
        provider: silent,
        placement: 'revive',
        alive: () => true,
        timeoutMs: 10,
        onWatched: () => {
          result.watched = true;
          resolvePromise(result);
        },
        onFallback: (reason) => {
          result.fallback = reason;
          resolvePromise(result);
        },
      });
    },
  );
  assert.equal(outcome.watched, false);
  assert.match(outcome.fallback!, /无响应/);
});

test('面板被关闭时（alive 未真），即使 SDK 之后发言也完全作废', async () => {
  const eager: RewardAdProvider = {
    name: 'eager',
    placementName: (p) => p,
    prepare: async () => true,
    play: (_placement, callbacks) => callbacks.onWatched(),
  };
  const outcome = await new Promise<{ watched: boolean; fallback: string | null }>(
    (resolvePromise) => {
      const result = { watched: false, fallback: null as string | null };
      watchAdPlacement({
        provider: eager,
        placement: 'revive',
        alive: () => false,
        timeoutMs: 5_000,
        onWatched: () => {
          result.watched = true;
          resolvePromise(result);
        },
        onFallback: (reason) => {
          result.fallback = reason;
          resolvePromise(result);
        },
      });
      // 两步等候master：先等准备+播放的微任务都过了一遍，确认没有任何做一次调用。
      setTimeout(() => resolvePromise(result), 30);
    },
  );
  assert.equal(outcome.watched, false);
  assert.equal(outcome.fallback, null);
});

test('provider 接口可被第三方实现：注册语义成立', () => {
  const wechatLike: RewardAdProvider = {
    name: 'custom-net',
    placementName: (p) => `net-${p}`,
    prepare: async () => true,
    play: (_placement, callbacks) => callbacks.onWatched(),
  };
  let watched = false;
  wechatLike.play('revive', {
    onWatched: () => {
      watched = true;
    },
    onFailed: () => assert.fail('不应失败'),
  });
  assert.equal(watched, true);
});
