import test from 'node:test';
import assert from 'node:assert/strict';
import { TREASURES, PASSIVES } from '../src/data.ts';
import { freshSave } from '../src/progress.ts';
import { catalogPanel } from '../src/catalog-ui.ts';
import { leaderboardSettings } from '../src/leaderboard-preference.ts';
import { showPanel } from '../src/scene-flow.ts';
import type { ActionShell } from '../src/action-controller.ts';

test('重新打开藏器阁默认高亮当前本命，旧浏览和筛选不影响且收藏顺序不变', () => {
  const save = freshSave('heaven', ['water'], 'dual', () => 0.5);
  save.artifacts = TREASURES.map((t) => t.id);
  let body = '';
  const shell = {
    save,
    panel: '',
    selectedTreasure: TREASURES[0].id,
    bookTab: 'passives',
    schoolFilter: 'demonic',
    renderPanel() {
      body = catalogPanel(save, {
        panel: 'arsenal',
        catalogTreasures: TREASURES,
        selectedTreasure: this.selectedTreasure,
        bookTab: this.bookTab,
        schoolFilter: this.schoolFilter,
      }).body;
    },
  };
  for (const starter of ['pearl', 'nest', 'vortex']) {
    save.starter = starter;
    const before = structuredClone(save);
    shell.selectedTreasure = TREASURES[0].id;
    shell.bookTab = 'curios';
    shell.schoolFilter = 'orthodox';
    showPanel(shell as unknown as ActionShell, 'arsenal');
    assert.deepEqual(
      [
        ...body.matchAll(
          /class="collection-card selected[^\"]*" data-action="treasure" data-id="([^\"]+)"/g,
        ),
      ].map((m) => m[1]),
      [starter],
    );
    assert.deepEqual(
      [...body.matchAll(/data-action="treasure" data-id="([^\"]+)"/g)].map((m) => m[1]),
      TREASURES.map((t) => t.id),
    );
    assert.deepEqual(save, before);
  }
});

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
