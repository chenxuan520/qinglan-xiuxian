import test from 'node:test';
import assert from 'node:assert/strict';
import { minimumLeaderboardAge, parseLeaderboardFacts } from '../workers/leaderboard/score.ts';
import { extractLeaderboardFacts } from '../src/leaderboard-contract.ts';
import { freshSave, IMMORTAL_CULTIVATION } from '../src/progress.ts';

const ended = () => {
  const save = freshSave();
  save.pendingReincarnation = 'extreme';
  save.lifeMode = 'extreme';
  return save;
};
test('首通最低年岁按正式排程和年率逐境累计，不按难度或养成追涨', () => {
  assert.deepEqual(
    Array.from({ length: 7 }, (_, i) =>
      minimumLeaderboardAge(Array.from({ length: i + 1 }, (_, j) => j)),
    ),
    [45, 120, 295, 645, 1445, 3445, 8945],
  );
  const save = ended();
  save.completed = [0];
  save.age = 45;
  assert.ok(parseLeaderboardFacts(extractLeaderboardFacts(save)));
  save.age = 30;
  assert.equal(parseLeaderboardFacts(extractLeaderboardFacts(save)), null);
  save.age = 44;
  assert.ok(parseLeaderboardFacts(extractLeaderboardFacts(save)));
  save.age = 43.999;
  assert.equal(parseLeaderboardFacts(extractLeaderboardFacts(save)), null);
});
test('七境全通年岁100拒绝，35778岁真仙事实通过；天机屋与根基不会额外抬高下限', () => {
  const save = freshSave();
  save.cultivation = IMMORTAL_CULTIVATION;
  save.completed = [0, 1, 2, 3, 4, 5, 6];
  save.age = 100;
  assert.equal(parseLeaderboardFacts(extractLeaderboardFacts(save)), null);
  save.age = 35778;
  assert.ok(parseLeaderboardFacts(extractLeaderboardFacts(save)));
  save.age = 8945;
  save.training = { vitality: 20, power: 20, speed: 20 };
  save.curios.bag['heaven-house'] = 1;
  save.curios.acquired = ['heaven-house'];
  assert.ok(parseLeaderboardFacts(extractLeaderboardFacts(save)));
});
