import { projectLeaderboardFactsV1 } from './leaderboard-facts-v1.ts';
import type { SaveData } from './progress.ts';

// 版本2保留承缘估值，仅真正落幕后可留名；版本1冻结供旧摘要先验。
export function projectLeaderboardFactsV2(save: SaveData) {
  return {
    ...projectLeaderboardFactsV1(save),
    ending: save.pendingReincarnation ?? (save.journeyEnded ? ('immortal' as const) : null),
    inheritanceValue: save.inheritanceValue ?? 0,
  };
}
