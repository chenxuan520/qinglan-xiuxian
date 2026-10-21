import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSave, parseSave, IMMORTAL_CULTIVATION, forge } from '../src/progress.ts';
import { ACHIEVEMENT_IDS, recordChronicle } from '../src/chronicle.ts';
import { chronicleAchievements } from '../src/chronicle-achievements.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';
import { journeyCardData } from '../src/journey-card.ts';
import {
  journeyAppraisalFacts,
  localJourneyAppraisal,
  validJourneyAppraisalFacts,
} from '../src/journey-appraisal.ts';

const final = (s: ReturnType<typeof freshSave>) => chronicleAchievements(s).at(-1)!;
function ready() {
  const s = freshSave('none', [], 'dual', () => 0.5);
  s.cultivation = IMMORTAL_CULTIVATION;
  s.completed = [0, 1, 2, 3, 4, 5, 6];
  s.unlocked = 6;
  s.tribulations = 5;
  s.age = 9000;
  return s;
}
test('十五项仅含十四基础成就和万古独尊，缺任一项都不能由旧拍卖或自身标记凑数', () => {
  assert.equal(new Set(ACHIEVEMENT_IDS).size, 14);
  assert.deepEqual(
    chronicleAchievements(freshSave())
      .filter((a) => a.id !== 'peerless')
      .map((a) => a.id)
      .sort(),
    [...ACHIEVEMENT_IDS].sort(),
  );
  for (const missing of ACHIEVEMENT_IDS) {
    const s = ready();
    for (const id of ACHIEVEMENT_IDS) if (id !== missing) s.chronicle.milestones[id] = 100;
    s.chronicle.milestones['auction-treasure'] = 100;
    s.chronicle.milestones.peerless = 100;
    const achievements = chronicleAchievements(s);
    assert.equal(achievements.length, 15);
    assert.equal(final(s).id, 'peerless');
    assert.equal(final(s).title, '万古独尊');
    assert.equal(final(s).achieved, false, missing);
    assert.ok(!journeyAppraisalFacts(s, 'ongoing').feats.includes('peerless'));
    assert.ok(!achievements.some((a) => a.id === 'auction-treasure'));
  }
});
test('实际炼器达成最后一项时即时点亮圆满，记真实年岁且重复事件不重颁', () => {
  const s = ready();
  for (const id of ACHIEVEMENT_IDS) if (id !== 'forge') s.chronicle.milestones[id] = 100;
  s.forge[s.starter] = 9;
  s.stones = s.iron = 1000000;
  assert.equal(forge(s, s.starter), true);
  assert.equal(final(s).achieved, true);
  assert.equal(final(s).age, 9000);
  assert.equal(s.chronicle.milestones.peerless, 9000);
  recordChronicle(s, '重复既有成果', '不应再次颁奖。', 'forge');
  assert.equal(s.chronicle.entries.filter((e) => e.title === '万古独尊').length, 1);
  const restored = importSave(exportSave(s)).save;
  assert.equal(final(restored).achieved, true);
  assert.equal(final(restored).age, 9000);
  assert.equal(restored.chronicle.entries.filter((e) => e.title === '万古独尊').length, 1);
  assert.ok(journeyCardData(restored).memories.some((m) => m.title === '万古独尊'));
  const facts = journeyAppraisalFacts(restored, 'ongoing');
  assert.equal(validJourneyAppraisalFacts(facts), true);
  assert.ok(facts.feats.includes('peerless'));
  assert.equal(localJourneyAppraisal(facts).title, '万古独尊');
  assert.equal(final(freshSave()).achieved, false);
});
test('旧档十四项齐备才补圆满，未知年岁不编造，旧拍卖记录不替代任何前置', () => {
  for (const unknown of [false, true]) {
    const s = ready();
    ACHIEVEMENT_IDS.forEach((id, i) => {
      s.chronicle.milestones[id] = unknown && i === 0 ? null : 100 + i;
    });
    s.chronicle.milestones['auction-treasure'] = 120;
    const restored = parseSave(JSON.stringify(s));
    assert.equal(final(restored).achieved, true);
    assert.equal(final(restored).age, unknown ? null : 113);
    assert.equal(Object.hasOwn(restored.chronicle.milestones, 'auction-treasure'), false);
    assert.equal(
      parseSave(JSON.stringify(restored)).chronicle.entries.filter((e) => e.title === '万古独尊')
        .length,
      1,
    );
  }
  const s = ready();
  s.chronicle.milestones.peerless = 100;
  assert.equal(parseSave(JSON.stringify(s)).chronicle.milestones.peerless, undefined);
});
