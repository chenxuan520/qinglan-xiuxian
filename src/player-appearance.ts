import type { CultivationPath } from './data.ts';
import { assetUrl } from './asset-url.ts';
import { spriteFrame } from './sprites.ts';

export const PLAYER_IMAGES: Record<CultivationPath, string> = {
  orthodox: '/assets/characters.webp',
  demonic: '/assets/player-demonic.webp',
  dual: '/assets/player-dual.webp',
};

export function playerHomeOffset(path: CultivationPath) {
  return path === 'demonic' ? -0.06 : 0;
}

export function playerSpriteFrame(path: CultivationPath) {
  const frame = spriteFrame(0);
  if (path === 'orthodox') return { ...frame, scale: 1 };
  // 阴阳盘立绘的人物占比更大，按人物而非整张图片统一视觉尺寸。
  return {
    ...frame,
    columns: 1,
    rows: 1,
    url: PLAYER_IMAGES[path],
    scale: path === 'dual' ? 0.9 : 1,
  };
}

export function playerSpriteBackground(path: CultivationPath) {
  const frame = playerSpriteFrame(path);
  const position = frame.scale === 1 ? '0% 0%' : '50% 50%';
  return `url('${assetUrl(frame.url)}') ${position} / ${frame.columns * 100 * frame.scale}% ${frame.rows * 100 * frame.scale}% no-repeat`;
}
