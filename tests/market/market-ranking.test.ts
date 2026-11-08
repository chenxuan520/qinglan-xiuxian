import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MARKET_RANKING_ART,
  MARKET_RANKING_SPOT,
  marketRankingContent,
  clearMarketRankingBackdrop,
  marketRankingCaptionObscured,
  marketRankingCaptionOffset,
} from '../../src/market/market-ranking.ts';
import { itemArt } from '../../src/items/item-art.ts';
import { MARKET_BUILDINGS, MARKET_WIDTH, MARKET_HEIGHT } from '../../src/sect/sect-market-data.ts';
import { townWalkable } from '../../src/town/town.ts';

test('坊市万魂幡复用镇魂幡图片，原生链接直达官网榜单而非留名或交易', () => {
  assert.deepEqual(MARKET_RANKING_ART, itemArt('talisman'));
  const html = marketRankingContent(true);
  assert.match(html, /href="https:\/\/xiuxian\.011203\.xyz\/leaderboard\/"/);
  assert.match(html, /target="_blank" rel="noopener"/);
  assert.match(html, /aria-label="查看万魂幡（新标签页）" hidden/);
  assert.match(html, />万魂幡 ↗<\/span>/);
  assert.doesNotMatch(html, /data-action|<button|<input/);
  assert.equal(townWalkable(MARKET_RANKING_SPOT, MARKET_BUILDINGS, 260), true);
  assert.ok(MARKET_RANKING_SPOT.x >= MARKET_WIDTH * 0.8);
  assert.ok(MARKET_RANKING_SPOT.y >= MARKET_HEIGHT * 0.8);
});

test('幡的显示去除原图绿色方底，保留紫色幡面、金色杆件及已有透明像素', () => {
  const pixels = new Uint8ClampedArray([
    15, 55, 44, 255, 19, 61, 47, 255, 90, 45, 120, 255, 190, 160, 95, 255, 20, 10, 30, 0,
  ]);
  clearMarketRankingBackdrop(pixels);
  assert.deepEqual(
    [...pixels],
    [15, 55, 44, 0, 19, 61, 47, 0, 90, 45, 120, 255, 190, 160, 95, 255, 20, 10, 30, 0],
  );
});

test('关闭万魂幡时坊市不渲染榜单外链或新增图集请求', () => {
  assert.equal(marketRankingContent(false), '');
});

test('人物从幡下或物件处经过时名称避让，移到侧面或离开后恢复', () => {
  for (const scale of [0.68, 1, 1.23]) {
    assert.equal(marketRankingCaptionObscured({ x: 1608, y: 1258 }, scale), true);
    assert.equal(marketRankingCaptionObscured(MARKET_RANKING_SPOT, scale), true);
    assert.equal(marketRankingCaptionObscured({ x: 1430, y: 1258 }, scale), false);
    assert.equal(marketRankingCaptionObscured({ x: 1640, y: 1000 }, scale), false);
    assert.equal(marketRankingCaptionObscured({ x: 1640, y: 1380 }, scale), false);
  }
});

test('无图横屏文字按实际人物头顶避让，低站位不再被固定偏移推到屏幕外', () => {
  const scale = 844 / 1100;
  const person = { x: 1600.6, y: 1312.6 };
  const baseY = 195 + (MARKET_RANKING_SPOT.y - person.y) * scale;
  const offset = marketRankingCaptionOffset([person], scale, baseY, 390);
  assert.ok(offset > -30);
  assert.ok(baseY + offset - 21 >= 8);
  assert.ok(baseY + offset < 195 - 122 * scale);
});
