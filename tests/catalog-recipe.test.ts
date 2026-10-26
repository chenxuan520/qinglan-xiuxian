import test from 'node:test';
import assert from 'node:assert/strict';
import { TREASURES, evolutionPassives, passive, pathInfo } from '../src/data.ts';
import { catalogEvolutionRecipe, choiceCard } from '../src/common-ui.ts';
import { freshSave, dropArtifacts } from '../src/progress.ts';
import { Game } from '../src/game.ts';
import { catalogPanel } from '../src/catalog-ui.ts';

test('藏器阁说明覆盖未集齐、不足三件与已集齐，实际遗宝不重复或补足虚构法宝', () => {
  for (const remaining of [4, 3, 2, 1, 0]) {
    const save = freshSave();
    save.artifacts = TREASURES.slice(0, TREASURES.length - remaining).map((t) => t.id);
    const header = catalogPanel(save, {
      panel: 'arsenal',
      catalogTreasures: TREASURES,
      schoolFilter: 'all',
      treasurePage: 0,
      selectedTreasure: save.starter,
      bookTab: 'treasures',
    }).body.split('</p>')[0];
    assert.match(header, /至多掉落 3 件未拥有法宝/);
    assert.match(header, /不足 3 件时掉剩余数量，收齐后不再重复掉落/);
    assert.doesNotMatch(header, /必掉 3 件/);
    const owned = [...save.artifacts];
    const dropped = dropArtifacts(save, () => 0.5);
    assert.equal(dropped.length, Math.min(remaining, 3));
    assert.equal(new Set(dropped).size, dropped.length);
    assert.ok(dropped.every((id) => !owned.includes(id) && save.artifacts.includes(id)));
  }
});

test('完整法宝图鉴始终写明两种配套五重功法及所属流派，同流派先列出', () => {
  for (const t of TREASURES) {
    const recipe = catalogEvolutionRecipe(t);
    const partners = evolutionPassives(t).map((id) => passive(id));
    assert.equal(partners.length, 2, t.id);
    for (const p of partners)
      assert.ok(recipe.includes(`${p.name}五重（${pathInfo(p.school).name}）`), t.id);
    const own = partners.find((p) => p.school === t.school)!;
    const other = partners.find((p) => p.school !== t.school)!;
    assert.ok(recipe.indexOf(own.name) < recipe.indexOf(other.name), t.id);
    assert.ok(recipe.includes(`${t.name}六重 ＋（`), t.id);
    assert.ok(recipe.includes(' 或 '), t.id);
  }
});

test('图鉴的两条配方不改变纯修升级卡片的实际觉醒要求', () => {
  for (const path of ['orthodox', 'demonic'] as const) {
    const save = freshSave();
    save.path = path;
    const game = new Game(save, 0, 0);
    for (const t of TREASURES.filter((item) => item.school === path)) {
      const card = choiceCard(game, save, { type: 'weapon', id: t.id, level: 1 }, 0);
      const allowed = evolutionPassives(t, path).map((id) => passive(id));
      assert.equal(allowed.length, 1);
      assert.ok(card.includes(`${allowed[0].name}五重`), t.id);
      const other = evolutionPassives(t)
        .map((id) => passive(id))
        .find((p) => p.school !== path)!;
      assert.ok(!card.includes(`${other.name}五重`), t.id);
    }
  }
});
