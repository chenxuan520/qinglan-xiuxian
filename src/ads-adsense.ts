import { STANDALONE } from './build-mode.ts';
// Google AdSense 激励广告 provider（H5 Placement API）。
// 官方脚本模式：adsbygoogle.push() 队列 + 页面定义 adConfig/adBreak 推送包装器。
// 未配置 client、脚本加载失败、无广告库存或玩家中途关闭，全部经 onFailed 回退占位倒计时。
// 文档：https://developers.google.com/adsense/platforms/web/placement-api
import { ADS_SETTINGS } from './setting.ts';
import { adSoundEnabled } from './ads.ts';
import type { AdPlacement, RewardAdCallbacks, RewardAdProvider } from './ads.ts';

const SCRIPT_BASE = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';

// 环境视图：浏览器只要注入 <script> 就行；Node/测试环境没有 document，prepare 直接失败回占位。
type AdsenseEnv = {
  document?: {
    createElement(tag: string): {
      src: string;
      async: boolean;
      crossOrigin: string;
      onload: (() => void) | null;
      onerror: ((e: unknown) => void) | null;
    };
    head?: { appendChild(node: unknown): void };
    body: { appendChild(node: unknown): void };
  };
  adsbygoogle?: unknown[];
  adBreak?: (options: Record<string, unknown>) => void;
  adConfig?: (options: Record<string, unknown>) => void;
};
function env(): AdsenseEnv {
  return globalThis as AdsenseEnv;
}

let scriptState: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';

// 页面自己的 adBreak/adConfig 推送包装器（Placement API 的惯用模式）。
function ensureBreakFunctions() {
  const scope = env();
  scope.adsbygoogle ??= [];
  scope.adBreak ??= (options) => scope.adsbygoogle!.push(options);
  scope.adConfig ??= scope.adBreak;
}

function injectScript(src: string): Promise<boolean> {
  return new Promise<boolean>((resolvePromise) => {
    const doc = env().document;
    if (!doc || typeof doc.createElement !== 'function') {
      resolvePromise(false);
      return;
    }
    const script = doc.createElement('script');
    script.src = src;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => resolvePromise(true);
    script.onerror = () => resolvePromise(false);
    (doc.head ?? doc.body).appendChild(script);
  });
}

// 玩家是自己点了广告面板的「看广告」按钮才进来的：面板本身就是奖励提示与 opt-in 确认，
// beforeReward 里直接 showAdFn()（官方对"自定义奖励提示确认后才播放"的钩子）语义一致，保留这个拍板。
export const adsenseProvider: RewardAdProvider = {
  name: 'adsense',
  placementName: (placement) => `qinglan-${placement}`,
  async prepare() {
    if (STANDALONE || !ADS_SETTINGS.adsense.client) return false;
    if (scriptState === 'ready') return true;
    if (scriptState === 'failed') return false;
    if (scriptState === 'loading') return false; // 简化：并发请求视为不可用，下一次广告位再试。
    scriptState = 'loading';
    const src = `${SCRIPT_BASE}?client=${ADS_SETTINGS.adsense.client}`;
    const ok = await injectScript(src);
    if (ok) {
      ensureBreakFunctions();
      env().adConfig!({ preloadAdBreaks: 'auto' });
      scriptState = 'ready';
      return true;
    }
    scriptState = 'failed';
    return false;
  },
  play(placement: AdPlacement, callbacks: RewardAdCallbacks) {
    const scope = env();
    if (!scope.adBreak || !scope.adConfig) {
      callbacks.onFailed('SDK 未就绪');
      return;
    }
    try {
      // 官方 adBreak 只接受 type/name/beforeAd/afterAd/beforeReward/adDismissed/adViewed/adBreakDone；
      // 无库存、超时、被跳过、未准备好全部从 adBreakDone 的 breakStatus 里出来。失败的查看状态与玩家点击
      // 面板的本来交互由 main.ts 的占位倒计时处理。
      let settled = false;
      const fail = (reason: string) => {
        if (!settled) {
          settled = true;
          callbacks.onFailed(reason);
        }
      };
      // sound 实时跟随游戏静音；preload 已在 prepare 完成，这里只更新当次播放的声音标记。
      scope.adConfig({ sound: adSoundEnabled() ? 'on' : 'off' });
      scope.adBreak({
        type: 'reward',
        name: this.placementName(placement),
        beforeReward: (showAdFn: () => void) => showAdFn(),
        adViewed: () => {
          settled = true;
          callbacks.onWatched();
        },
        adDismissed: () => fail('玩家中途关闭广告'),
        adBreakDone: (info: { breakStatus?: string } | undefined) => {
          if (info?.breakStatus !== 'viewed')
            fail(`广告未完整播放（${info?.breakStatus ?? '未知'}）`);
        },
      });
    } catch (error) {
      callbacks.onFailed(error instanceof Error ? error.message : '广告播放异常');
    }
  },
};
