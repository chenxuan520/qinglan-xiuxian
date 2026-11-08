import type { SaveData } from '../core/progress.ts';

export interface StartupState {
  saveLock: unknown;
  game: unknown;
  pendingRun: unknown;
  inMortalWorld: boolean;
  panel: string;
}

// 只有启动时会真正显示序章的新玩家才把序章提到最前。
export function startsWithPrologue(save: Pick<SaveData, 'prologueSeen'>, state: StartupState) {
  return (
    !save.prologueSeen &&
    !state.saveLock &&
    !state.game &&
    !state.pendingRun &&
    !state.inMortalWorld &&
    !state.panel
  );
}

function preloadImage(src: string) {
  const image = new Image();
  image.fetchPriority = 'high';
  image.src = src;
  return image.decode().catch(() => {});
}

// 序章立即显示，离乡图随后预热，最后才在后台准备第一境战斗资源。
export function loadNewPlayerAssets(
  prologueImage: string,
  renderPrologue: () => void,
  preloadTown: () => Promise<void>,
  prepareBattle: () => Promise<void>,
  markReady: () => void,
  onFailure: () => void,
) {
  void preloadImage(prologueImage);
  renderPrologue();
  void preloadTown().then(prepareBattle).then(markReady).catch(onFailure);
}
