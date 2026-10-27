import { STANDALONE } from './build-mode.ts';
import { ModuleSource, retryModule } from './module-source.ts';
import type { RewardAdProvider } from './ads.ts';
const source = STANDALONE
  ? null
  : new ModuleSource<typeof import('./ads-platform.ts')>((attempt) =>
      attempt ? retryModule('ads-platform', 'ad-platform', attempt) : import('./ads-platform.ts'),
    );
export function platformAdProvider(): RewardAdProvider {
  let selected: RewardAdProvider | null = null;
  return {
    name: 'platform',
    loadTimeoutMs: 8000,
    ownsPlaybackClock: true,
    placementName: (p) => selected?.placementName(p) ?? `qinglan-${p}`,
    async prepare(context) {
      const current = () => !!context && !context.signal.aborted && context.alive?.() !== false;
      if (!source || !context || !current()) return false;
      const module = await source.load();
      if (!current()) return false;
      selected = await module.configuredAdProvider(context.placement, context.signal);
      return current() && !!selected && selected.prepare(context);
    },
    play(placement, callbacks, context) {
      if (!selected || context?.signal.aborted) {
        callbacks.onFailed('广告暂不可用');
        return;
      }
      selected.play(placement, callbacks, context);
    },
  };
}
