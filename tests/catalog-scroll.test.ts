import test from 'node:test';
import assert from 'node:assert/strict';
import { TREASURES, PASSIVES } from '../src/data.ts';
import { freshSave } from '../src/progress.ts';
import { catalogPanel } from '../src/catalog-ui.ts';
import { leaderboardSettings } from '../src/leaderboard-preference.ts';

test('藏器阁各流派完整连续显示，无分页也不漏掉末件', () => {
  const save = freshSave();
  for (const schoolFilter of ['all', 'orthodox', 'demonic']) {
    const expected = TREASURES.filter((t) => schoolFilter === 'all' || t.school === schoolFilter);
    const panel = catalogPanel(save, {
      panel: 'arsenal',
      catalogTreasures: TREASURES,
      schoolFilter,
      selectedTreasure: save.starter,
      bookTab: 'treasures',
    });
    const ids = [...panel.body.matchAll(/data-action="treasure" data-id="([^"]+)"/g)].map(
      (m) => m[1],
    );
    assert.deepEqual(
      ids,
      expected.map((t) => t.id),
    );
    assert.equal(new Set(ids).size, expected.length);
    assert.doesNotMatch(panel.body, /collection-pages|data-action="treasure-page"/);
  }
});

test('连续列表不改变功法筛选和详情返回入口', () => {
  const save = freshSave();
  for (const schoolFilter of ['all', 'orthodox', 'demonic']) {
    const panel = catalogPanel(save, {
      panel: 'arsenal',
      catalogTreasures: TREASURES,
      schoolFilter,
      selectedTreasure: save.starter,
      bookTab: 'passives',
    });
    assert.equal(
      [...panel.body.matchAll(/class="passive-card"/g)].length,
      PASSIVES.filter((p) => schoolFilter === 'all' || p.school === schoolFilter).length,
    );
  }
  const last = TREASURES.at(-1)!;
  const detail = catalogPanel(save, {
    panel: 'treasure-detail',
    catalogTreasures: TREASURES,
    schoolFilter: 'all',
    selectedTreasure: last.id,
    bookTab: 'treasures',
  });
  assert.equal(detail.title, last.name);
  assert.match(detail.body, /data-action="close">返回法宝列表/);
});

test('设置只保留榜单开关与独立网页链接，不在仍可游玩时提供留名', () => {
  for (const enabled of [true, false])
    for (const tampered of [true, false]) {
      const html = leaderboardSettings(enabled, tampered);
      assert.match(html, /data-action="leaderboard-toggle"/);
      assert.match(
        html,
        /href="https:\/\/xiuxian\.011203\.xyz\/leaderboard\/" target="_blank" rel="noopener"/,
      );
      assert.doesNotMatch(html, /data-action="leaderboard"|data-leaderboard-list/);
    }
});
