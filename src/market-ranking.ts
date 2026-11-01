import { itemArt } from './item-art.ts';
import { STANDALONE } from './build-mode.ts';
import type { TownPoint } from './town.ts';

// 坊市东南侧商铺外围，两棵景树之间，避开中央街巷及院落入口。
export const MARKET_RANKING_SPOT = { x: 1640, y: 1200 };
export const MARKET_RANKING_ART = itemArt('talisman')!;

// 名称在地图上保持14px；人物立绘/头顶名字进入其范围时临时隐去，不移动幡本身。
export function marketRankingCaptionObscured(point: TownPoint, scale: number) {
  return (
    Math.abs(point.x - MARKET_RANKING_SPOT.x) < 39 + 44 / scale &&
    point.y >= MARKET_RANKING_SPOT.y - 25 / scale &&
    point.y - 122 <= MARKET_RANKING_SPOT.y + 4 / scale
  );
}

// 无图时文字仍是入口；按遮挡人物实际头顶作最小避让，并保持在视口内。
export function marketRankingCaptionOffset(
  people: readonly TownPoint[],
  scale: number,
  baseY: number,
  viewportHeight: number,
) {
  const top = Math.min(...people.map((p) => p.y - 122));
  const bottom = Math.max(...people.map((p) => p.y));
  const above = (top - MARKET_RANKING_SPOT.y) * scale - 8;
  const below = (bottom - MARKET_RANKING_SPOT.y) * scale + 29;
  const offset = baseY + above - 21 >= 8 ? above : below;
  return Math.max(29 - baseY, Math.min(viewportHeight - 8 - baseY, offset));
}

export function marketRankingContent(enabled: boolean) {
  if (STANDALONE || !enabled) return '';
  return `<a class="market-ranking" href="https://xiuxian.011203.xyz/leaderboard/" target="_blank" rel="noopener" aria-label="查看万魂幡（新标签页）" hidden><canvas class="market-ranking-art" aria-hidden="true"></canvas><span class="market-ranking-name">万魂幡 ↗</span></a>`;
}

// 现有物品图集带绿底；只在本入口的离屏像素中去底，不改原素材或其他物品显示。
export function clearMarketRankingBackdrop(pixels: Uint8ClampedArray) {
  for (let i = 0; i < pixels.length; i += 4) {
    const green = pixels[i + 1] - Math.max(pixels[i], pixels[i + 2]);
    pixels[i + 3] *= 1 - Math.max(0, Math.min(1, green / 8));
  }
}

export function paintMarketRankingArt(canvas: HTMLCanvasElement, image: HTMLImageElement) {
  try {
    const art = MARKET_RANKING_ART;
    const width = image.naturalWidth / 4,
      height = image.naturalHeight / art.rows;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      canvas.hidden = true;
      return false;
    }
    context.drawImage(
      image,
      art.column * width,
      art.row * height,
      width,
      height,
      0,
      0,
      width,
      height,
    );
    const frame = context.getImageData(0, 0, canvas.width, canvas.height);
    clearMarketRankingBackdrop(frame.data);
    context.putImageData(frame, 0, 0);
    return true;
  } catch {
    // 无Canvas能力时保留原生文字入口，不阻塞坊市加载，也不回退到绿底贴图。
    canvas.hidden = true;
    return false;
  }
}
