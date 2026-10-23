import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSave } from '../src/progress.ts';
import { Game } from '../src/game.ts';
import { auctionArtifactComparison, auctionContent } from '../src/auction-ui.ts';
import { beginSectMarketVisit } from '../src/sect-market.ts';
import { prepareAuction } from '../src/auction.ts';
import { auctionLots, buyAuction } from '../src/auction-trade.ts';
import type { AuctionItem } from '../src/auction-data.ts';

test('拍品炼器对比与同配置真实武器伤害比一致，不能拿增伤百分点当提升', () => {
  const s = freshSave('heaven', ['metal'], 'dual', () => 0.5);
  const item: AuctionItem = { kind: 'artifact', id: 'sword', quantity: 1, forgeLevel: 5 };
  const weapon = { id: 'sword' as const, level: 3, evolved: false, timer: 0 };
  for (let current = 0; current < 10; current++)
    for (let next = current + 1; next <= 10; next++) {
      s.forge.sword = current;
      item.forgeLevel = next;
      const before = new Game(s, 0, 0).weaponHitDamage(weapon),
        upgraded = structuredClone(s);
      upgraded.forge.sword = next;
      const after = new Game(upgraded, 0, 0).weaponHitDamage(weapon);
      const gain = ((after / before - 1) * 100).toFixed(1);
      assert.ok(auctionArtifactComparison(s, item).includes(`此宝伤害 +${gain}%`));
    }
  s.forge.sword = 2;
  item.forgeLevel = 5;
  const html = auctionArtifactComparison(s, item);
  assert.match(html, /已有 2 阶 → 竞得后 5 阶/);
  assert.match(html, /此宝伤害 \+20.7%/);
  assert.match(html, /炼器增伤 \+16% → \+40%/);
});
test('新收藏不冒称整体战力增幅，同阶/低阶/满阶无提升，非武器没有对比', () => {
  const s = freshSave(),
    item: AuctionItem = { kind: 'artifact', id: 'pagoda', quantity: 1, forgeLevel: 6 };
  assert.match(auctionArtifactComparison(s, item), /尚未收藏.*炼器增伤 \+52%/);
  assert.doesNotMatch(auctionArtifactComparison(s, item), /同等搭配|已有/);
  s.artifacts.push('pagoda');
  s.forge.pagoda = 6;
  assert.match(auctionArtifactComparison(s, item), /相同，无需竞拍/);
  s.forge.pagoda = 10;
  assert.match(auctionArtifactComparison(s, item), /已有 10 阶.*更高，无需竞拍/);
  for (const kind of ['medicine', 'curio', 'iron'] as const)
    assert.equal(auctionArtifactComparison(s, { ...item, kind }), '');
});
test('预览不写存档；真实成交阶数与预览一致且不换本命，结拍卡不再显示未来收益', () => {
  const s = freshSave('heaven', ['metal'], 'dual', () => 0.5);
  s.cultivation = 1;
  s.stones = 100000;
  s.mortal.population = { seed: 1, since: 15 };
  s.hometownSeen = true;
  s.mortal.hometown.stage = 'departed';
  beginSectMarketVisit(s);
  prepareAuction(s);
  const lot = auctionLots(s).find((l) => l.kind === 'artifact' && l.forgeLevel > 0)!;
  if (!s.artifacts.includes(lot.id)) s.artifacts.push(lot.id);
  s.forge[lot.id] = 0;
  const before = JSON.stringify(s),
    starter = s.starter;
  assert.ok(auctionContent(s, 'buy', false).includes(`data-artifact-comparison="${lot.id}"`));
  assert.equal(JSON.stringify(s), before);
  assert.equal(buyAuction(s, lot.index, 100000, s.mortal.sectMarket!.visit)!.outcome, 'won');
  assert.equal(s.forge[lot.id], lot.forgeLevel);
  assert.equal(s.starter, starter);
  assert.ok(!auctionContent(s, 'buy', false).includes(`data-artifact-comparison="${lot.id}"`));
});
