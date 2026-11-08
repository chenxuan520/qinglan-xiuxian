import test from 'node:test';
import assert from 'node:assert/strict';
import { TREASURES, PASSIVES } from '../../src/core/data.ts';
import { freshSave, lifespanInfo, tribulationDue } from '../../src/core/progress.ts';
import { catalogPanel } from '../../src/content/catalog-ui.ts';
import { leaderboardSettings } from '../../src/leaderboard/leaderboard-preference.ts';
import { showPanel } from '../../src/battle/scene-flow.ts';
import { dispatchAction, type ActionShell } from '../../src/ui/action-controller.ts';

test('切换流派始终认准已保存本命，筛掉本命时不误选首件，分类切换不改变选择', () => {
  const save = freshSave('heaven', ['wood'], 'dual', () => 0.5);
  save.prologueSeen = save.hometownSeen = true;
  save.mortal.hometown.stage = 'departed';
  save.artifacts = TREASURES.map((t) => t.id);
  let body = '';
  const shell = {
    save,
    panel: 'arsenal',
    game: null,
    pendingRun: null,
    saveLock: null,
    lifespanInfo,
    tribulationDue,
    selectedTreasure: TREASURES[0].id,
    bookTab: 'treasures',
    schoolFilter: 'all',
    catalogTreasures: TREASURES,
    modal: { querySelector: () => null },
    medicinePanel: { handle: () => false },
    renderPanel() {
      body = catalogPanel(save, {
        panel: 'arsenal',
        catalogTreasures: this.catalogTreasures,
        selectedTreasure: this.selectedTreasure,
        bookTab: this.bookTab,
        schoolFilter: this.schoolFilter,
      }).body;
    },
  };
  const act = (action: string, id: string) =>
    dispatchAction(shell as unknown as ActionShell, action, id);
  const selected = () =>
    [
      ...body.matchAll(
        /class="collection-card selected[^\"]*" data-action="treasure" data-id="([^\"]+)"/g,
      ),
    ].map((match) => match[1]);
  for (const starter of TREASURES) {
    save.starter = starter.id;
    const before = structuredClone(save);
    shell.selectedTreasure = TREASURES.find((t) => t.id !== starter.id)!.id;
    for (const filter of ['demonic', 'orthodox', 'all', 'demonic', 'all']) {
      act('school-filter', filter);
      assert.deepEqual(
        selected(),
        filter === 'all' || starter.school === filter ? [starter.id] : [],
        `${starter.id} / ${filter}`,
      );
      act('book-tab', 'passives');
      act('book-tab', 'curios');
      act('book-tab', 'treasures');
      assert.deepEqual(
        selected(),
        filter === 'all' || starter.school === filter ? [starter.id] : [],
      );
      assert.deepEqual(save, before);
    }
  }
});

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
