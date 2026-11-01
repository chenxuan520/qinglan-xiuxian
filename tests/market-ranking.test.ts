import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MARKET_RANKING_ART,
  MARKET_RANKING_SPOT,
  marketRankingContent,
} from '../src/market-ranking.ts';
import { itemArt } from '../src/item-art.ts';
import { MARKET_BUILDINGS, MARKET_START } from '../src/sect-market-data.ts';
import { townWalkable } from '../src/town.ts';

test('坊市万魂幡复用镇魂幡图片，原生链接直达官网榜单而非留名或交易', () => {
  assert.deepEqual(MARKET_RANKING_ART, itemArt('talisman'));
  const html = marketRankingContent(true);
  assert.match(html, /href="https:\/\/xiuxian\.011203\.xyz\/leaderboard\/"/);
  assert.match(html, /target="_blank" rel="noopener"/);
  assert.match(html, /aria-label="查看万魂幡（新标签页）" hidden/);
  assert.ok(html.includes(MARKET_RANKING_ART.src));
  assert.match(html, />万魂幡 ↗<\/span>/);
  assert.doesNotMatch(html, /data-action|<button|<input/);
  assert.equal(townWalkable(MARKET_RANKING_SPOT, MARKET_BUILDINGS, 260), true);
  assert.ok(
    Math.hypot(MARKET_RANKING_SPOT.x - MARKET_START.x, MARKET_RANKING_SPOT.y - MARKET_START.y) <
      200,
  );
});

test('关闭万魂幡时坊市不渲染榜单外链或新增图集请求', () => {
  assert.equal(marketRankingContent(false), '');
});
