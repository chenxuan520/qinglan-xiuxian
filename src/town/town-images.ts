import { assetUrl } from '../core/asset-url.ts';
import type { CultivationPath } from '../core/data.ts';
import { PLAYER_IMAGES } from '../battle/player-appearance.ts';

// 离乡场景的全部图片；新玩家序章期间按此清单顺序预热。
export const TOWN_IMAGES = [
  '/assets/town-ground.webp',
  '/assets/town-buildings.webp',
  '/assets/sect-market-buildings.webp',
  '/assets/town-props.webp',
  '/assets/town-npcs.webp',
  ...Object.values(PLAYER_IMAGES),
];
const PLAYER_IMAGE_LIST = Object.values(PLAYER_IMAGES);

export async function preloadTownImages(playerPath: CultivationPath = 'orthodox') {
  const images = [
    ...TOWN_IMAGES.filter((name) => !PLAYER_IMAGE_LIST.includes(name)),
    PLAYER_IMAGES[playerPath],
    ...PLAYER_IMAGE_LIST.filter((name) => name !== PLAYER_IMAGES[playerPath]),
  ];
  for (const name of images) {
    const image = new Image();
    image.src = assetUrl(name);
    try {
      await image.decode();
    } catch {
      // 预热失败不阻塞序章或进镇；进镇加载层会再次请求并提示失败。
    }
  }
}
