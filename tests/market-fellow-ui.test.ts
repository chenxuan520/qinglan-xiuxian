import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSave, type SaveData } from '../src/progress.ts';
import { beginSectMarketVisit } from '../src/sect-market.ts';
import { marketCultivators } from '../src/sect-market-data.ts';
import {
  meetMarketFellow,
  chooseMarketFellow,
  marketFellowCharacter,
  marketFellowView,
} from '../src/market-fellow.ts';
import { marketFellowClue, marketFellowContent } from '../src/market-fellow-ui.ts';
import { marketOpportunity, opportunityReason } from '../src/market-social.ts';
import { marketSocialContent } from '../src/market-social-ui.ts';

function fixture() {
  const save = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  save.cultivation = 1;
  save.age = 30;
  save.stones = 10000;
  save.prologueSeen = save.hometownSeen = true;
  save.mortal.hometown!.stage = 'departed';
  save.mortal.population = { seed: 12345, since: 15 };
  assert.ok(beginSectMarketVisit(save));
  return save;
}

function actions(html: string) {
  return [...html.matchAll(/<button\b[^>]*data-action="sect-market-fellow"[^>]*>/g)].map(
    ([tag]) => ({
      id: tag.match(/data-id="([^"]+)"/)?.[1],
      visit: Number(tag.match(/data-visit="(\d+)"/)?.[1]),
    }),
  );
}

function readyStory(choice: 'stay' | 'travel', complete = true) {
  const save = fixture();
  assert.ok(meetMarketFellow(save));
  save.age = 35;
  assert.ok(meetMarketFellow(save));
  assert.ok(chooseMarketFellow(save, choice, save.mortal.sectMarket!.visit));
  save.age = 45;
  if (complete) assert.ok(chooseMarketFellow(save, 'read', save.mortal.sectMarket!.visit));
  return save;
}

function findOffer(
  save: SaveData,
  kind: 'goods' | 'deposit' | 'haggle' | 'invitation',
  honest: boolean,
) {
  for (let seed = 1; seed < 1000; seed++) {
    const candidate = structuredClone(save);
    candidate.mortal.population!.seed = seed;
    assert.ok(beginSectMarketVisit(candidate));
    for (const npc of marketCultivators(
      candidate.mortal.population!,
      candidate.mortal.sectMarket!,
    )) {
      const offer = marketOpportunity(candidate, npc.id);
      if (offer?.kind === kind && offer.honest === honest) {
        Object.assign(save, candidate);
        assert.equal(marketOpportunity(save, npc.id)!.honest, honest);
        return { npc, offer };
      }
    }
  }
  assert.fail(`没有找到 ${kind}/${honest} 的真实坊间机缘样本`);
}

test('同道面板沿真实进度显示可用选择，按钮绑定当前来访，读完只保留返回', () => {
  for (const choice of ['stay', 'travel'] as const) {
    const save = fixture();
    assert.ok(meetMarketFellow(save));
    assert.deepEqual(actions(marketFellowContent(save)), []);
    save.age = 35;
    assert.ok(meetMarketFellow(save));
    assert.ok(beginSectMarketVisit(save));
    let html = marketFellowContent(save);
    assert.deepEqual(actions(html), [
      { id: 'stay', visit: 2 },
      { id: 'travel', visit: 2 },
    ]);
    assert.doesNotMatch(html, /npc-dialogue|data-action="npc-/);
    assert.ok(chooseMarketFellow(save, choice, 2));
    assert.deepEqual(actions(marketFellowContent(save)), []);
    save.age = 45;
    html = marketFellowContent(save);
    assert.deepEqual(actions(html), [{ id: 'read', visit: 2 }]);
    assert.doesNotMatch(html, /class="market-inspection"/);
    assert.ok(chooseMarketFellow(save, 'read', 2));
    html = marketFellowContent(save);
    assert.deepEqual(actions(html), []);
    assert.match(html, /class="market-inspection"/);
    assert.match(html, /data-action="close"/);
    assert.match(html, /金丹/);
    assert.doesNotMatch(html, /undefined|NaN/);
  }
});

test('久别后的面板明确是后人而不是活着的原同道，留坊与访药采用各自线索', () => {
  for (const choice of ['stay', 'travel'] as const) {
    const save = readyStory(choice);
    save.age = 2000;
    assert.notEqual(marketFellowCharacter(save)!.generation, 0);
    const html = marketFellowContent(save);
    assert.match(html, /后人|药册传人/);
    assert.match(html, /旧人已去/);
    assert.doesNotMatch(html, /劝他|十年修持与亲历，终于让他结成金丹/);
    assert.deepEqual(actions(html), []);
    assert.equal(marketFellowView(save)!.hintKind, choice === 'stay' ? 'trade' : 'trail');
  }
});

test('还未相识或尚未读完第三逢时，真实交易面板不提前揭示故人线索', () => {
  for (const save of [fixture(), readyStory('stay', false), readyStory('travel', false)]) {
    for (const kind of ['goods', 'deposit', 'invitation'] as const) {
      const { npc, offer } = findOffer(save, kind, false);
      const before = JSON.stringify(save);
      assert.equal(marketFellowClue(save, offer), '');
      assert.doesNotMatch(marketSocialContent(save, npc), /故人所授/);
      assert.equal(JSON.stringify(save), before);
    }
  }
});

test('留坊只帮助辨交易、访药只帮助辨邀约；真假线索不同，渲染不代替核验或禁用原交易', () => {
  for (const choice of ['stay', 'travel'] as const) {
    const clues = new Map<string, string>();
    for (const kind of ['goods', 'deposit', 'haggle', 'invitation'] as const) {
      for (const honest of [true, false]) {
        const save = readyStory(choice);
        const { npc, offer } = findOffer(save, kind, honest);
        const before = JSON.stringify(save);
        const reason = opportunityReason(save, npc.id, save.mortal.sectMarket!.visit, 'accept');
        const clue = marketFellowClue(save, offer);
        const html = marketSocialContent(save, npc);
        const matchesBranch =
          choice === 'stay' ? kind === 'goods' || kind === 'deposit' : kind === 'invitation';
        if (matchesBranch) {
          assert.ok(clue.length > 0);
          assert.match(html, /故人所授/);
          assert.ok(html.includes(clue));
          clues.set(`${kind}/${honest}`, clue);
        } else {
          assert.equal(clue, '');
          assert.doesNotMatch(html, /故人所授/);
        }
        assert.match(html, /data-action="sect-market-inspect"/);
        assert.match(html, /data-action="sect-market-opportunity"/);
        assert.match(html, /data-action="sect-market-decline"/);
        assert.equal(
          opportunityReason(save, npc.id, save.mortal.sectMarket!.visit, 'accept'),
          reason,
        );
        assert.equal(JSON.stringify(save), before, '查看线索不能核验、付费、扣龄或改变真假');
        assert.deepEqual(save.mortal.marketSocial!.inspected, []);
      }
      if (clues.has(`${kind}/true`))
        assert.notEqual(clues.get(`${kind}/true`), clues.get(`${kind}/false`));
    }
    assert.equal(marketFellowClue(readyStory(choice), undefined), '');
  }
});
