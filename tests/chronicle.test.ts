import test from 'node:test';
import assert from 'node:assert/strict';
import {
  freshSave,
  parseSave,
  gainCultivation,
  realmCost,
  settleRun,
  forge,
} from '../src/progress.ts';
import { recordChronicle, CHRONICLE_LIMIT } from '../src/chronicle.ts';
import { chronicleAchievements } from '../src/chronicle-achievements.ts';
import { spiritPower } from '../src/spirit-power.ts';
import { chronicleContent } from '../src/chronicle-content.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';
import { joinSect, leaveSect } from '../src/mortal.ts';
import { chooseSmithStory } from '../src/town-story.ts';
import { AchievementNotices } from '../src/achievement-notices.ts';
import { journeyCardData } from '../src/journey-card.ts';

test('成就改名同步旧年表、成就提示与留影，保留达成标识、年龄和存档原文', () => {
  const save = freshSave();
  const renamed = [
    ['one-life-clear', '一命通关', '生死证道'],
    ['level-100', '百级归真', '百炼归真'],
    ['mastery', '仙门有道', '一脉真传'],
    ['hard-immortal', '逆境问道', '逆天证道'],
  ];
  // 只造旧版已达成记录；实际触发条件仍由极限、精研和结算套件验证。
  for (const [id, oldTitle] of renamed) {
    save.chronicle.milestones[id] = 15;
    save.chronicle.entries.push({ age: 15, title: oldTitle, detail: '此世所成。' });
  }
  const before = JSON.stringify(save);
  const content = chronicleContent(save);
  const achievements = chronicleAchievements(save);
  const notices = new AchievementNotices();
  for (const [id, oldTitle, newTitle] of renamed) {
    assert.ok(!content.includes(oldTitle), oldTitle);
    assert.ok(content.includes(`<h4>${newTitle}</h4>`), newTitle);
    const achievement = achievements.find((entry) => entry.id === id)!;
    assert.equal(achievement.title, newTitle);
    assert.equal(achievement.age, 15);
    assert.equal(achievement.achieved, true);
    notices.add(save, [id]);
    let notice = '';
    notices.flush(true, (text) => {
      notice = text;
    });
    assert.ok(notice.includes(newTitle));
  }
  const memories = journeyCardData(save).memories.map((memory) => memory.title);
  for (const [, , title] of renamed) assert.ok(memories.includes(title), title);
  assert.equal(JSON.stringify(save), before);
  assert.deepEqual(importSave(exportSave(save, null)).save.chronicle, save.chronicle);
});

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
  assert.equal(
    chronicleAchievements(restored).some((a) => a.id === 'realm-24'),
    false,
  );
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

test('成就栏只保留非必经目标，并补录可由旧档确认的成就', () => {
  const s = freshSave();
  assert.deepEqual(
    chronicleAchievements(s).map((achievement) => achievement.id),
    [
      'story',
      'permanent-medicine',
      'curio-three',
      'mastery',
      'three-paths',
      'level-100',
      'collection',
      'six-immortals',
      'forge',
      'training-master',
      'five-tribulations',
      'hard-immortal',
      'one-life-clear',
      'rootless-immortal',
      'peerless',
    ],
  );
  s.mortal.mastery.power = 10;
  s.tribulations = 5;
  s.training = { vitality: 20, power: 20, speed: 20 };
  s.medicine.used.peiying = 1;
  const restored = parseSave(JSON.stringify(s));
  assert.equal(restored.chronicle.milestones.mastery, null);
  assert.equal(restored.chronicle.milestones['five-tribulations'], null);
  assert.equal(restored.chronicle.milestones['training-master'], null);
  assert.equal(restored.chronicle.milestones['permanent-medicine'], null);

  const butian = freshSave();
  recordChronicle(butian, '丹药入体', '补天有成 · 异灵根 · 火灵根。');
  assert.equal(parseSave(JSON.stringify(butian)).chronicle.milestones['permanent-medicine'], null);
});

test('同一世重游同一秘境，三路线各胜一次才达成三道皆证，失败与重复路线不补齐', () => {
  const s = freshSave();
  const run = (path: 'orthodox' | 'demonic' | 'dual') =>
    settleRun(s, {
      stage: 0,
      difficulty: 0,
      kills: 0,
      time: 180,
      victory: true,
      iron: 0,
      level: 1,
      path,
    });
  run('orthodox');
  run('orthodox');
  settleRun(s, {
    stage: 0,
    difficulty: 0,
    kills: 0,
    time: 90,
    victory: false,
    iron: 0,
    level: 1,
    path: 'dual',
  });
  assert.equal(Object.hasOwn(s.chronicle.milestones, 'path-dual'), false);
  run('demonic');
  assert.equal(Object.hasOwn(s.chronicle.milestones, 'three-paths'), false);
  run('dual');
  assert.equal(s.chronicle.milestones['three-paths'], s.age);
  run('dual');
  assert.equal(s.chronicle.entries.filter((entry) => entry.title === '三道皆证').length, 1);
  assert.equal(
    chronicleAchievements(s).find((a) => a.id === 'three-paths')!.detail,
    '同一世以正道、魔道、兼修各通关一次',
  );
  assert.equal(importSave(exportSave(s, null)).save.chronicle.milestones['three-paths'], s.age);
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
