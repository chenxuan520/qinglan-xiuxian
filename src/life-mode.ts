import { DIFFICULTIES } from './data.ts';
import type { SaveData } from './progress.ts';

export type LifeMode = 'normal' | 'extreme';
export const isExtremeLife = (save: Pick<SaveData, 'lifeMode'>) => save.lifeMode === 'extreme';
export const minimumDifficulty = (save: Pick<SaveData, 'lifeMode'>) =>
  isExtremeLife(save) ? 1 : 0;
export const difficultyAllowed = (save: Pick<SaveData, 'lifeMode'>, value: number) =>
  Number.isInteger(value) && value >= minimumDifficulty(save) && value < DIFFICULTIES.length;
export const rewardDisabled = (save: Pick<SaveData, 'lifeMode'>) =>
  isExtremeLife(save) ? 'disabled aria-disabled="true" title="极限模式不可领取奖励补给"' : '';
export const EXTREME_AD_ACTIONS = new Set([
  'watch-root-ad',
  'watch-supplies-ad',
  'claim-ad-reward',
  'ad-root-quality',
  'ad-root-element',
  'dues-ad',
  'watch-ad',
  'ad-revive',
  'watch-lifespan-ad',
  'claim-lifespan',
  'market-ambush-watch-ad',
  'market-ambush-revive',
]);
export const EXTREME_EXIT_ACTIONS = new Set([
  'abandon',
  'home',
  'return',
  'restart',
  'new-run',
  'tribulation-forfeit',
  'confirm-forfeit',
  'market-ambush-exit',
  'import-save',
  'confirm-import',
  'reincarnate',
  'confirm-reincarnate',
]);
