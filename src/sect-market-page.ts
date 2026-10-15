import { townStatus } from './mortal-ui.ts';
import type { SaveData } from './progress.ts';

export function sectMarketPage(save: SaveData, fullscreenButton: string) {
  return `<main class="town-scene sect-market-scene" aria-label="宗门坊市游历"><div id="sect-market-view" class="town-view" tabindex="0" role="region" aria-label="宗门坊市，触屏拖动或方向键移动，走近修士交谈"></div><header class="town-scene-heading"><div class="town-hud"><h2>宗门坊市</h2><small>同道往来 · 坊间机缘</small><div id="town-status">${townStatus(save)}</div><small>现实 1 分钟 = 1 年</small></div><div class="town-scene-actions">${fullscreenButton}<button class="secondary-button" data-action="sect-market-exit">离开坊市</button></div></header><footer class="town-scene-controls"><p><span class="keyboard-hint">WASD / 方向键移动</span><span class="touch-hint">按住空白处拖动行走</span><br>走近修士、商铺或院落，<span class="keyboard-hint">按 E 或</span>点击互动</p><span id="market-guide" role="status"></span><button class="primary-button" data-action="sect-market-talk" disabled>走近可互动</button></footer></main>`;
}
