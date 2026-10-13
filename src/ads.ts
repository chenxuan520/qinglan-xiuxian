// 激励广告供给层：复活、自选灵根、物资补给、借寿四个广告位共用一套 provider 接口。
// main.ts 只管界面（占位倒计时与领取按钮），provider 决定「什么时刻算看完」：
// 占位 provider 走 5 秒倒计时（无 SDK 的默认行为），真实 SDK provider 以看完回调解锁。
// 接新平台（微信、巨量、其他 H5 激励平台）就是实现 RewardAdProvider 并注册进 PROVIDERS，
// 再在 setting.ts 的 ADS_SETTINGS.provider 指名启用；任何 provider 不可用都回退占位。
import { ADS_SETTINGS } from './setting.ts';
import { adsenseProvider } from './ads-adsense.ts';

export const AD_DURATION_MS = 5000;
export const AD_SECONDS = AD_DURATION_MS / 1000;
// 接入次数限制时，按广告位区分单元与额度。
export type AdPlacement = 'revive' | 'reward-root' | 'reward-supplies' | 'lifespan';
export const AD_PLACEHOLDER_HTML = '<div class="revive-ad">广告位招租</div>';

export interface RewardAdCallbacks {
  // 广告完整看完，解锁奖励；恰好回调一次。
  onWatched(): void;
  // SDK 不可用、加载失败、无库存或被跳过——恰好回调一次，调用方回退占位倒计时。
  onFailed(reason: string): void;
}

export interface RewardAdProvider {
  name: string;
  placementName(placement: AdPlacement): string;
  // 检测 SDK 可用性（未配置或加载失败返回 false）；false 时调用方走占位，不会调 play。
  prepare(): Promise<boolean>;
  play(placement: AdPlacement, callbacks: RewardAdCallbacks): void;
}

// 游戏当前声音状态：main.ts 在初始化与开关声音时同步给广告层，供 SDK 的 sound 参数跟随静音。
let adSoundOn = false;
export function setAdSoundEnabled(on: boolean) {
  adSoundOn = on;
}
export function adSoundEnabled() {
  return adSoundOn;
}

const placeholderProvider: RewardAdProvider = {
  name: 'placeholder',
  placementName: (placement) => placement,
  prepare: async () => false, // 占位模式没有真实广告可准备，play 不会被调用。
  play: (_placement, callbacks) => callbacks.onFailed('占位模式，无真实广告'),
};

const PROVIDERS: Record<string, RewardAdProvider> = {
  placeholder: placeholderProvider,
  adsense: adsenseProvider,
};

export function getAdProvider(): RewardAdProvider {
  return PROVIDERS[ADS_SETTINGS.provider] ?? placeholderProvider;
}
