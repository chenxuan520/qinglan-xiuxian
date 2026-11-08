import test from 'node:test';
import assert from 'node:assert/strict';
import { TREASURES } from '../../src/core/data.ts';
import { TREASURE_LORE } from '../../src/items/treasure-lore.ts';
import { freshSave } from '../../src/core/progress.ts';
import { catalogPanel } from '../../src/content/catalog-ui.ts';

function detail(save: ReturnType<typeof freshSave>, id: string) {
  return catalogPanel(save, {
    panel: 'treasure-detail' as const,
    catalogTreasures: TREASURES,
    schoolFilter: 'all',
    treasurePage: 0,
    selectedTreasure: id as (typeof TREASURES)[number]['id'],
    bookTab: 'treasures',
  }).body;
}

test('器物来历恰好覆盖全部 36 件法宝且无空文案', () => {
  const ids = TREASURES.map((t) => t.id).sort();
  assert.equal(ids.length, 36);
  assert.deepEqual(Object.keys(TREASURE_LORE).sort(), ids);
  for (const id of ids) {
    assert.equal(typeof TREASURE_LORE[id as keyof typeof TREASURE_LORE], 'string', id);
    assert.ok(TREASURE_LORE[id as keyof typeof TREASURE_LORE].trim().length > 20, id);
  }
});

test('法宝详情在按钮之后显示器物来历，未收藏的法宝同样显示', () => {
  const save = freshSave();
  save.artifacts = [];
  for (const t of TREASURES) {
    const body = detail(save, t.id);
    assert.ok(body.includes(TREASURE_LORE[t.id]), t.id);
    assert.match(
      body,
      /<section class="treasure-lore"><h4 class="guide-subheading">器物来历<\/h4>/,
      t.id,
    );
    assert.ok(
      body.indexOf('class="treasure-lore"') > body.indexOf('class="detail-actions"'),
      `${t.id} 的来历应在按钮行之后`,
    );
  }
});

test('升级卡片与妖物志不引入器物来历', () => {
  const save = freshSave();
  const arsenal = catalogPanel(save, {
    panel: 'arsenal' as const,
    catalogTreasures: TREASURES,
    schoolFilter: 'all',
    treasurePage: 0,
    selectedTreasure: save.starter,
    bookTab: 'treasures',
  }).body;
  assert.doesNotMatch(arsenal, /器物来历/);
});
