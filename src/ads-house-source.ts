import { STANDALONE } from './build-mode.ts';
import { ModuleSource, retryModule } from './module-source.ts';
import type { RewardAdProvider } from './ads.ts';

const source = STANDALONE
  ? null
  : new ModuleSource<typeof import('./ads-house.ts')>((attempt) =>
      attempt ? retryModule('ads-house', 'house-ad', attempt) : import('./ads-house.ts'),
    );

export const houseAdProvider: RewardAdProvider = {
  name: 'house',
  loadTimeoutMs: 30000,
  ownsPlaybackClock: true,
  placementName: (placement) => `qinglan-${placement}`,
  async prepare(context) {
    if (!source) return false;
    context?.trace?.at('house-module');
    await source.load();
    return true;
  },
  play(placement, callbacks, context) {
    if (!source?.current || !context) {
      callbacks.onFailed('图片广告暂未准备好');
      return;
    }
    void source.current.playHouseAd(placement, callbacks, context);
  },
};
