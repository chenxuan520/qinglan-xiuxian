import test from 'node:test';
import assert from 'node:assert/strict';
import { choiceGuidance } from '../src/choice-guidance.ts';
import { choiceCard } from '../src/common-ui.ts';
import { Game, type Weapon } from '../src/game.ts';
import { freshSave } from '../src/progress.ts';
import { ROOT_STARTERS, type CultivationPath, type WeaponKind } from '../src/data.ts';

function weapon(id: WeaponKind, level = 6, evolved = false): Weapon {
  return { id, level, evolved, timer: 0 };
}
function fixture(path: CultivationPath = 'orthodox') {
  return new Game(
    freshSave('heaven', ['metal'], path, () => 0.5),
    0,
    0,
    () => 0.5,
  );
}

test('新学配套功法说明选后剩余重数，不把一重误报成可觉醒', () => {
  const game = fixture();
  game.weapons = [weapon('sword')];
  game.passives = { haste: 2, guard: 1, duration: 3 };
  const hint = choiceGuidance(game, { type: 'passive', id: 'power', level: 1 })!;
  assert.match(hint.text, /配套青霄剑/);
  assert.match(hint.text, /选后此法还需4重/);
  assert.doesNotMatch(hint.text, /配方齐备|无法觉醒/);
});

test('最后功法位同时说明支持的法宝和真正失去觉醒路径的法宝', () => {
  const game = fixture();
  game.weapons = [weapon('sword'), weapon('ice', 3), weapon('pulse', 6, true)];
  game.passives = { haste: 2, guard: 1, duration: 3 };
  const hint = choiceGuidance(game, { type: 'passive', id: 'area', level: 1 })!;
  assert.match(hint.text, /配套玄冰镜/);
  assert.match(hint.text, /占最后功法位：青霄剑本局无法觉醒/);
  assert.doesNotMatch(hint.text, /东皇钟/);
  assert.equal(hint.blocksEvolution, true);
});

test('仍有空位时不报无法觉醒，已有功法在满槽后也能继续升重', () => {
  const game = fixture();
  game.weapons = [weapon('sword'), weapon('ice', 4)];
  game.passives = { haste: 2, guard: 1 };
  assert.equal(
    choiceGuidance(game, { type: 'passive', id: 'area', level: 1 })!.blocksEvolution,
    false,
  );
  game.passives = { haste: 2, guard: 1, duration: 3, area: 2 };
  const hint = choiceGuidance(game, { type: 'passive', id: 'area', level: 3 })!;
  assert.match(hint.text, /配套玄冰镜/);
  assert.doesNotMatch(hint.text, /青霄剑|无法觉醒/);
});

test('兼修持有任一替代功法即可继续补重，另一条已满时不误报缺配方', () => {
  const game = fixture('dual');
  game.weapons = [weapon('sword'), weapon('ice', 4)];
  game.passives = { blood: 1, guard: 2, haste: 2 };
  const hint = choiceGuidance(game, { type: 'passive', id: 'area', level: 1 })!;
  assert.match(hint.text, /配套玄冰镜/);
  assert.doesNotMatch(hint.text, /青霄剑|无法觉醒/);
  game.passives.blood = 5;
  const alternative = choiceGuidance(game, { type: 'passive', id: 'power', level: 1 })!;
  assert.doesNotMatch(alternative.text, /青霄剑|配套/);
  assert.match(alternative.text, /玄冰镜本局无法觉醒/);
});

test('共用功法补满后区分已齐备与法宝重数不足，忽略已觉醒法宝', () => {
  const game = fixture('dual');
  game.weapons = [weapon('sword'), weapon('shard'), weapon('fire', 4), weapon('arrow', 6, true)];
  game.passives = { power: 4 };
  const hint = choiceGuidance(game, { type: 'passive', id: 'power', level: 5 })!;
  assert.match(hint.text, /青霄剑、裂魂镜配方齐备，后续升级可觉醒/);
  assert.match(hint.text, /离火珠功法补齐，法宝仍需六重/);
  assert.match(hint.compact, /青霄剑等2件配方齐备；另1件待法宝六重/);
  assert.doesNotMatch(hint.text, /追星弓/);
});

test('末位影响多件法宝时完整列出，手机按同一集合压缩件数', () => {
  const game = fixture('dual');
  game.weapons = [weapon('sword'), weapon('fire', 2), weapon('shard', 4), weapon('ice', 3)];
  game.passives = { haste: 1, guard: 1, duration: 1 };
  const hint = choiceGuidance(game, { type: 'passive', id: 'area', level: 1 })!;
  assert.match(hint.text, /占最后功法位：青霄剑、离火珠、裂魂镜本局无法觉醒/);
  assert.match(hint.compact, /占最后功法位：青霄剑等3件本局无法觉醒/);
});

test('十种本命按本局实际配方提示功法补齐，正魔路线均成立', () => {
  for (const path of ['orthodox', 'demonic'] as const) {
    for (const starters of Object.values(ROOT_STARTERS)) {
      const game = fixture(path);
      const id = starters[path === 'demonic' ? 1 : 0];
      game.weapons = [weapon(id)];
      const partner = game.evolutionRequirements(id)[0];
      game.passives = { [partner]: 4 };
      assert.match(
        choiceGuidance(game, { type: 'passive', id: partner, level: 5 })!.text,
        /配方齐备，后续升级可觉醒/,
        `${path}/${id}`,
      );
    }
  }
});

test('无关功法、已觉醒与其他类型保留原有说明，提示计算不修改对局', () => {
  const game = fixture();
  game.weapons = [weapon('sword', 6, true)];
  game.passives = { haste: 2, guard: 1, duration: 3 };
  const before = game.snapshot();
  for (const choice of [
    { type: 'passive', id: 'power', level: 1 },
    { type: 'passive', id: 'spirit', level: 1 },
    { type: 'weapon', id: 'ice', level: 1 },
    { type: 'evolve', id: 'sword', level: 7 },
    { type: 'heal', id: 'heal', level: 1 },
  ] as const)
    assert.equal(choiceGuidance(game, choice), null);
  assert.deepEqual(game.snapshot(), before);
});

test('卡片在原收益位置展示动态提示，保留功法效果与宗门精研，不增加操作', () => {
  const game = fixture();
  game.weapons = [weapon('sword')];
  game.passives = { haste: 1, guard: 1, duration: 1 };
  game.save.mortal.mastery.power = 2;
  const card = choiceCard(game, game.save, { type: 'passive', id: 'power', level: 1 }, 1);
  assert.match(card, /每重法宝伤害 \+12%/);
  assert.match(card, /class="choice-benefit "><span class="choice-guidance-full">配套青霄剑/);
  assert.match(card, /choice-guidance-compact/);
  assert.match(card, /宗门精研 2 阶/);
  assert.doesNotMatch(card, /功效按重数叠加|choice-benefit-hint|disabled/);
  assert.equal((card.match(/<button\b/g) || []).length, 1);
  assert.match(card, /data-action="choose" data-id="1"/);
});
