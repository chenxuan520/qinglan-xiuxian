import test from 'node:test';
import assert from 'node:assert/strict';
import {
  autoplayChoice,
  awakenOutlook,
  choiceScore,
  freePassiveSlots,
  passiveCoverage,
  reservedPassive,
} from '../../src/battle/autoplay.ts';
import type { Choice, Game } from '../../src/battle/game.ts';

interface WeaponStub {
  id: string;
  level: number;
  evolved?: boolean;
}
function stub(
  weapons: WeaponStub[],
  passives: Record<string, number>,
  requirements: Record<string, string[]>,
  choices: Choice[] = [],
) {
  return {
    weapons: weapons.map((w) => ({ level: 6, evolved: false, ...w })),
    passives,
    player: { hp: 100, maxHp: 100 },
    evolutionRequirements: (id: string) => requirements[id] ?? [],
    choices,
    rerolls: 0,
    save: { autoplayBuild: { mode: 'default', targets: [] } },
  } as unknown as Game;
}
const weapon = (id: string, level = 1): Choice => ({ type: 'weapon', id, level });
const passive = (id: string, level = 1): Choice => ({ type: 'passive', id, level });
const threeLearned = { power: 1, guard: 1, blood: 1 };
const requirements = {
  first: ['area'],
  second: ['area'],
  third: ['haste'],
};

test('觉醒前景按已学配套、剩余功法格与最后一格预留判定', () => {
  for (const [requirements, learned] of [
    [{ first: ['area'] }, { area: 1 }],
    [{ first: ['area', 'haste'] }, { haste: 1 }],
  ] as const) {
    const g = stub([{ id: 'first', level: 6 }], learned, requirements);
    assert.equal(awakenOutlook(g, 'first'), 'sure');
    assert.equal(
      awakenOutlook(
        stub([{ id: 'first', level: 6 }], { power: 1, guard: 1 }, requirements),
        'first',
      ),
      'open',
    );
    assert.equal(
      awakenOutlook(
        stub([{ id: 'first', level: 6 }], { power: 1, guard: 1, blood: 1, abyss: 1 }, requirements),
        'first',
      ),
      'dead',
    );
  }
  const last = stub(
    [
      { id: 'first', level: 6 },
      { id: 'second', level: 6 },
      { id: 'third', level: 6 },
    ],
    threeLearned,
    requirements,
  );
  assert.equal(awakenOutlook(last, 'third'), 'dead');
});

test('最后一个功法格按覆盖数预留，功法分随覆盖数提高', () => {
  const g = stub(
    [
      { id: 'first', level: 6 },
      { id: 'second', level: 6 },
      { id: 'third', level: 6 },
    ],
    threeLearned,
    requirements,
  );
  assert.equal(freePassiveSlots(g), 1);
  assert.equal(passiveCoverage(g, 'area'), 2);
  assert.equal(passiveCoverage(g, 'haste'), 1);
  assert.equal(reservedPassive(g), 'area');
  assert.equal(choiceScore(passive('area'), g), 65);
  assert.equal(choiceScore(passive('haste'), g), 55);
});

test('最后一格预定后，配套相符的新法宝不扣分、配套不符的减分', () => {
  const g = stub(
    [
      { id: 'first', level: 5 },
      { id: 'second', level: 5 },
      { id: 'third', level: 5 },
    ],
    threeLearned,
    { ...requirements, sword: ['area'], umbrella: ['haste'] },
  );
  assert.equal(choiceScore(weapon('sword'), g), 18);
  assert.equal(choiceScore(weapon('umbrella'), g), 10);
});

test('功法格充足时覆盖两件的新功法比覆盖一件高 3 分', () => {
  const g = stub(
    [
      { id: 'first', level: 6 },
      { id: 'second', level: 6 },
      { id: 'third', level: 6 },
    ],
    { power: 1, guard: 1 },
    requirements,
  );
  assert.equal(freePassiveSlots(g), 2);
  assert.equal(choiceScore(passive('area'), g) - choiceScore(passive('haste'), g), 3);
});

test('最后一格不让与未覆盖法宝无关的新功法占用', () => {
  const g = stub(
    [
      { id: 'first', level: 6 },
      { id: 'second', level: 6 },
      { id: 'third', level: 6 },
    ],
    threeLearned,
    requirements,
  );
  assert.equal(choiceScore(passive('abyss'), g), -11);
  const noUncovered = stub([{ id: 'first', level: 6, evolved: true }], threeLearned, {
    first: ['area'],
  });
  assert.equal(freePassiveSlots(noUncovered), 1);
  assert.equal(choiceScore(passive('abyss'), noUncovered), 9);
});

test('普通但能觉醒的法宝优先于高优却无法觉醒的法宝', () => {
  const g = stub(
    [
      { id: 'first', level: 6 },
      { id: 'second', level: 6 },
      { id: 'third', level: 6 },
    ],
    threeLearned,
    { ...requirements, sword: ['haste'], spear: ['area'] },
    [weapon('sword'), weapon('spear')],
  );
  assert.ok(choiceScore(weapon('spear'), g) > choiceScore(weapon('sword'), g));
  assert.equal(autoplayChoice(g)!.index, 1);
  g.choices = [weapon('sword', 2), weapon('spear', 2)];
  assert.ok(choiceScore(weapon('spear', 2), g) > choiceScore(weapon('sword', 2), g));
  assert.equal(autoplayChoice(g)!.index, 1);
});
