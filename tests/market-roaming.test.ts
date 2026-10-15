import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  marketCamera,
  marketVisitorPosition,
  MARKET_SCENE_WIDTH,
  MARKET_SCENE_HEIGHT,
  MARKET_SCENE_PADDING,
} from '../src/market-roaming.ts';
import {
  MARKET_WIDTH,
  MARKET_HEIGHT,
  MARKET_START,
  MARKET_BUILDINGS,
  marketCharacters,
  marketLocalReply,
  isMarketCultivatorId,
} from '../src/sect-market-data.ts';
import { beginSectMarketVisit, sectMarketOffer } from '../src/sect-market.ts';
import { townWalkable } from '../src/town.ts';
import { freshSave, realmInfo, lifespanInfo } from '../src/progress.ts';
import { SPIRIT_ROOTS } from '../src/data.ts';
import { Game } from '../src/game.ts';
import { validDialogue, dialogueMessages } from '../workers/npc-ai/index.ts';
import { sectMarketEventContent } from '../src/sect-market-ui.ts';
import { AUCTION_SPOT } from '../src/auction-data.ts';

test('宽屏、超宽屏与手机横竖屏镜头在中心及四角完整覆盖，不露右侧或底部底色', () => {
  for (const [width, height] of [
    [1365, 900],
    [1920, 1080],
    [2560, 1440],
    [3440, 1440],
    [390, 844],
    [320, 640],
    [800, 360],
  ]) {
    for (const position of [
      MARKET_START,
      { x: 24, y: 24 },
      { x: MARKET_WIDTH - 24, y: 24 },
      { x: 24, y: MARKET_HEIGHT - 24 },
      { x: MARKET_WIDTH - 24, y: MARKET_HEIGHT - 24 },
    ]) {
      const c = marketCamera(width, height, position);
      assert.ok(c.x <= 1e-8 && c.y <= 1e-8);
      assert.ok(c.x + MARKET_SCENE_WIDTH * c.scale >= width - 1e-8);
      assert.ok(c.y + MARKET_SCENE_HEIGHT * c.scale >= height - 1e-8);
      const px = c.x + (position.x + MARKET_SCENE_PADDING) * c.scale;
      const py = c.y + (position.y + MARKET_SCENE_PADDING) * c.scale;
      assert.ok(px - 39 * c.scale >= 0 && px + 39 * c.scale <= width);
      assert.ok(py - 104 * c.scale >= 0 && py <= height, '完整立绘不能在边缘被裁掉');
    }
  }
});

test('出生点、拍卖门前与散步路线都避开完整建筑脚点，动静交替且连续', () => {
  assert.ok(townWalkable(MARKET_START, MARKET_BUILDINGS, 260));
  assert.ok(townWalkable(AUCTION_SPOT, MARKET_BUILDINGS, 260));
  for (const visit of [1, 2, 999]) {
    const visitors = marketCharacters({ seed: 12345, since: 15 }, { visit, realmIndex: 7 }).filter(
      (n) => n.roaming,
    );
    assert.equal(visitors.length, 12);
    for (const npc of visitors) {
      let previous = marketVisitorPosition(npc, 0);
      const states = new Set<boolean>();
      for (let i = 0; i <= 1000; i++) {
        const p = marketVisitorPosition(npc, i / 10);
        assert.ok(
          townWalkable(p, MARKET_BUILDINGS, 260),
          `${npc.id} 穿过建筑：${JSON.stringify(p)}`,
        );
        assert.ok(Math.hypot(p.x - previous.x, p.y - previous.y) <= 4.601);
        states.add(p.moving);
        previous = p;
      }
      assert.equal(states.size, 2);
    }
  }
});

test('十五位具名修士稳定不重名，访客可正常聊境界但没有摊主交易或奖励入口', () => {
  const save = freshSave();
  save.cultivation = 1;
  save.mortal.population = { seed: 12345, since: 15 };
  beginSectMarketVisit(save);
  const npcs = marketCharacters(save.mortal.population, save.mortal.sectMarket!);
  assert.equal(npcs.length, 15);
  assert.equal(new Set(npcs.map((n) => n.name)).size, 15);
  assert.deepEqual(marketCharacters(save.mortal.population, save.mortal.sectMarket!), npcs);
  for (const npc of npcs.filter((n) => n.roaming)) {
    assert.ok(npc.realmIndex >= 0 && npc.realmIndex < 8);
    assert.equal(sectMarketOffer(save, npc.id), undefined);
    const content = sectMarketEventContent(save, npc);
    assert.match(content, /npc-chat/);
    assert.doesNotMatch(content, /data-action="sect-market-(exchange|debate|request|opportunity)"/);
    assert.match(marketLocalReply(npc, '互换丹药', 0), /只来逛市访友/);
    const request = {
      population: save.mortal.population,
      age: save.age,
      npcId: npc.id,
      realm: '炼气初期',
      message: '聊聊修行',
      history: [],
      marketVisit: {
        visit: save.mortal.sectMarket!.visit,
        realmIndex: save.mortal.sectMarket!.realmIndex,
      },
    };
    assert.equal(validDialogue(request), true);
    const prompt = dialogueMessages(request)[0].content;
    assert.ok(prompt.includes(npc.name) && prompt.includes(npc.realm));
    assert.match(prompt, /没有自己的交易摊位/);
  }
  for (const id of ['market-visitor-12', 'market-visitor--1', 'market-visitor-01'])
    assert.equal(isMarketCultivatorId(id), false);
});

test('凡人与初入炼气共用原第一阶战斗、寿元与门槛，不增加伤害或气血', () => {
  assert.equal(realmInfo(0).name, '凡人');
  assert.equal(realmInfo(1).name, '炼气初期');
  assert.equal(realmInfo(0).step, realmInfo(1).step);
  assert.equal(realmInfo(0).needed, realmInfo(1).needed);
  for (const root of SPIRIT_ROOTS) {
    const mortal = freshSave(root.id, root.id === 'none' ? [] : ['metal']);
    const cultivator = structuredClone(mortal);
    cultivator.cultivation = 1;
    for (const difficulty of [0, 1, 2]) {
      const a = new Game(mortal, 0, difficulty, () => 0.5);
      const b = new Game(cultivator, 0, difficulty, () => 0.5);
      assert.deepEqual(a.player, b.player);
      assert.deepEqual(a.weapons, b.weapons);
      assert.deepEqual(a.stats, b.stats);
    }
    assert.deepEqual(lifespanInfo(mortal), lifespanInfo(cultivator));
  }
});

test('坊市建筑资源是真实透明 WebP 且整张小于250KB，不额外生成地板', () => {
  const bytes = readFileSync('public/assets/sect-market-buildings.webp');
  assert.equal(bytes.subarray(8, 12).toString(), 'WEBP');
  assert.equal(bytes.readUInt32LE(4) + 8, bytes.length);
  assert.ok(bytes.length <= 250_000);
  assert.equal(bytes.subarray(12, 16).toString(), 'VP8X');
  assert.ok(bytes[20] & 0x10, '保留 alpha 透明通道');
});
