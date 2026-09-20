import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSave, gainCultivation, realmCost, settleRun, forge } from '../src/progress.ts';
import { recordChronicle, chronicleAchievements, CHRONICLE_LIMIT } from '../src/chronicle.ts';
import { spiritPower } from '../src/spirit-power.ts';
import { chronicleContent } from '../src/chronicle-ui.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';
import { joinSect, leaveSect } from '../src/mortal.ts';
import { chooseSmithStory } from '../src/town-story.ts';

test('连续突破逐境记录真实年龄，待渡劫不提前获得真仙成就，重复结算不重复记首通', () => {
  const s = freshSave();
  s.age = 42.5;
  const total = Array.from({ length: 24 }, (_, i) => realmCost(i)).reduce((a, b) => a + b, 0);
  gainCultivation(s, total);
  assert.equal(s.chronicle.milestones['realm-3'], 42.5);
  assert.equal(s.chronicle.milestones['realm-23'], 42.5);
  assert.equal(s.chronicle.milestones.ascension, 42.5);
  assert.equal(Object.hasOwn(s.chronicle.milestones, 'realm-24'), false);
  const count = s.chronicle.entries.length;
  gainCultivation(s, 0);
  assert.equal(s.chronicle.entries.length, count);
  s.age = 45;
  const run = { stage: 6, difficulty: 0, kills: 0, time: 600, victory: true, iron: 0, level: 1 };
  settleRun(s, run);
  assert.equal(s.chronicle.milestones['realm-24'], 45);
  assert.equal(s.chronicle.milestones['stage-6'], 45);
  settleRun(s, run);
  assert.equal(s.chronicle.entries.filter((e) => e.title === '突破 · 真仙').length, 1);
  assert.deepEqual(importSave(exportSave(s, null)).save.chronicle, s.chronicle);
});

test('旧档补录不编造年龄，长时间游玩限制年表但不丢成就，坏记录拒绝导入且正文转义', () => {
  const s = freshSave();
  s.cultivation = 1e9;
  s.completed = [0, 1, 2, 3, 4, 5, 6];
  const old = { ...s, chronicle: undefined };
  const restored = importSave(JSON.stringify(old)).save;
  assert.equal(restored.chronicle.milestones['realm-24'], null);
  assert.equal(chronicleAchievements(restored).find((a) => a.id === 'realm-24')!.achieved, true);
  for (let i = 0; i < 250; i++) recordChronicle(restored, '游历', `第 ${i} 次驻足`);
  assert.equal(restored.chronicle.entries.length, CHRONICLE_LIMIT);
  assert.equal(restored.chronicle.milestones['realm-24'], null);
  recordChronicle(restored, '<img src=x>', '<script>test</script>');
  assert.ok(chronicleContent(restored).includes('&lt;script&gt;'));
  assert.ok(!chronicleContent(restored).includes('<img src=x>'));
  restored.chronicle.entries[0].age = -1;
  assert.throws(() => importSave(JSON.stringify(restored)));
  assert.equal(freshSave().chronicle.entries.length, 1);
});

test('宗门、炼器与人间故事进入年表，未遇故事不提前剧透', () => {
  const s = freshSave();
  assert.ok(!chronicleContent(s).includes('炉火长明'));
  s.stones = 1e8;
  s.iron = 1e6;
  s.age = 26;
  joinSect(s, 'power');
  leaveSect(s);
  assert.equal(s.chronicle.milestones.sect, 26);
  assert.ok(s.chronicle.entries.some((e) => e.detail.includes('离开太玄剑宗')));
  for (let i = 0; i < 10; i++) forge(s, 'sword');
  assert.equal(s.chronicle.milestones.forge, 26);
  s.mortal.population = { seed: 12345, since: 15 };
  chooseSmithStory(s, 'bellows');
  assert.ok(s.chronicle.entries[0].detail.includes('修好渡船旧钟'));
});

test('灵威纯计算不修改存档，真实成长提高评估，未装备法宝与灵石不虚增灵威', () => {
  const s = freshSave();
  const initial = spiritPower(s).score;
  const before = JSON.stringify(s);
  assert.equal(spiritPower(s).score, initial);
  assert.equal(JSON.stringify(s), before);
  for (const key of ['vitality', 'power', 'speed'] as const) {
    const copy = structuredClone(s);
    copy.training[key] = 10;
    assert.ok(spiritPower(copy).score > initial);
  }
  s.forge.nail = 10;
  s.stones = 1e8;
  assert.equal(spiritPower(s).score, initial);
  s.forge.sword = 10;
  assert.ok(spiritPower(s).score > initial);
  const high = freshSave();
  high.cultivation = 1e9;
  const pending = spiritPower(high).score;
  high.completed = [6];
  assert.ok(spiritPower(high).score > pending);
});
