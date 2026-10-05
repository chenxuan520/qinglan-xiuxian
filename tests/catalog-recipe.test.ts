import test from 'node:test';
import assert from 'node:assert/strict';
import { TREASURES, evolutionPassives, passive, pathInfo } from '../src/data.ts';
import { catalogEvolutionRecipe, choiceCard } from '../src/common-ui.ts';
import { freshSave } from '../src/progress.ts';
import { Game } from '../src/game.ts';

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
