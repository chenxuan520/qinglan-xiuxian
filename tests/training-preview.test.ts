import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSave, train, trainingCost, trainingYears } from '../src/progress.ts';
import { Game } from '../src/game.ts';
import { SPIRIT_ROOTS } from '../src/data.ts';
import { trainingStepPreview, trainingStepText } from '../src/training-preview.ts';
import { cultivationPanel } from '../src/cultivation-ui.ts';
import { preparationAdviceContent } from '../src/preparation-advice.ts';

test('三根基当前与下阶预览对照真实修炼后的入场属性，含后十阶、奇物、药效与路线', () => {
  for (const root of SPIRIT_ROOTS)
    for (const enhanced of [false, true])
      for (const level of [0, 9, 10, 15, 19])
        for (const kind of ['vitality', 'power', 'speed'] as const) {
          const s = freshSave(root.id, ['metal'], enhanced ? 'demonic' : 'orthodox', () => 0.5);
          s.cultivation = 1000;
          s.training[kind] = level;
          s.stones = trainingCost(level, s) + 10000;
          s.forge[s.starter] = 5;
          s.retreatBonus = { vitality: 17, power: 13, speed: 11 };
          if (enhanced) {
            for (const id of [
              'soul-wood',
              'wind-wings',
              'sacred-fragment',
              'heaven-house',
            ] as const) {
              s.curios.bag[id] = 1;
              s.curios.acquired.push(id);
            }
            for (const id of ['heqi', 'dingling', 'yingxiang'])
              s.medicine.active[id] = s.age + 10000;
          }
          const before = structuredClone(s);
          const preview = trainingStepPreview(s, kind);
          assert.deepEqual(s, before, '预览不得修改年岁、天劫时钟或物资');
          const actual = (save: typeof s) => {
            const game = new Game(structuredClone(save), 0, 0, () => 0.5);
            return kind === 'vitality'
              ? game.player.maxHp
              : kind === 'power'
                ? game.weaponHitDamage(game.weapons[0])
                : game.stats.speed;
          };
          assert.equal(preview.current, actual(s));
          assert.ok(train(s, kind));
          assert.equal(preview.next, actual(s));
          assert.ok(Math.abs(s.age - before.age - trainingYears(before)) < 1e-9);
          assert.equal(before.stones - s.stones, trainingCost(level, before));
          assert.ok(cultivationPanel(before, 0).body.includes(trainingStepText(before, kind)));
        }
});

test('满阶不虚构下一阶，失败结算的根基建议带具体增幅与真实费用但不增加办理按钮', () => {
  const s = freshSave();
  s.stones = 10000;
  s.iron = 0;
  for (const kind of ['vitality', 'power', 'speed'] as const) {
    s.training = { vitality: 20, power: 20, speed: 20 };
    assert.equal(trainingStepPreview(s, kind).next, null);
    assert.doesNotMatch(trainingStepText(s, kind), /→/);
    s.training[kind] = 19;
    const result = preparationAdviceContent(s, false, true);
    assert.ok(result.includes(trainingStepText(s, kind)));
    assert.ok(result.includes(`${trainingCost(19, s)}灵石、${trainingYears(s)}年`));
    assert.doesNotMatch(result, /data-action=/);
    assert.equal(preparationAdviceContent(s, true, true), '');
  }
});
