import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSave, parseSave } from '../src/progress.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';
import { townResidents } from '../src/town-population.ts';
import {
  HUMAN_STORIES,
  chooseHumanStory,
  humanStoryView,
  humanStoryGreeting,
  syncHumanStories,
  unreadHumanLetterKeys,
} from '../src/human-stories.ts';
import { humanStoryJournal } from '../src/mortal-ui.ts';

function resident(age = 20) {
  const save = freshSave();
  save.age = age;
  save.mortal.population = { seed: 12345, since: 15 };
  return save;
}

test('未读旧信按真实人物标识，展示缘簿不标已读，新来信可独立提示', () => {
  const save = resident();
  assert.deepEqual(unreadHumanLetterKeys(save), []);
  chooseHumanStory(save, 'friend', 'meet');
  assert.deepEqual(unreadHumanLetterKeys(save), []);
  save.age = save.mortal.humanStories!.friend!.endsAt;
  const before = JSON.stringify(save);
  const keys = unreadHumanLetterKeys(save);
  assert.equal(keys.length, 1);
  const shown = new Set(keys);
  assert.equal(
    unreadHumanLetterKeys(save).some((key) => !shown.has(key)),
    false,
  );
  assert.ok(humanStoryJournal(save, false).includes('有一封未读旧信'));
  assert.equal(JSON.stringify(save), before);
  assert.deepEqual(unreadHumanLetterKeys(importSave(exportSave(save, null)).save), keys);
  chooseHumanStory(save, 'student', 'meet');
  save.age = save.mortal.humanStories!.student!.endsAt;
  assert.equal(unreadHumanLetterKeys(save).length, 2);
  assert.equal(unreadHumanLetterKeys(save).filter((key) => !shown.has(key)).length, 1);
  assert.equal(chooseHumanStory(save, 'friend', 'read'), true);
  assert.equal(unreadHumanLetterKeys(save).length, 1);
  assert.equal(save.mortal.humanStories!.student!.read, false);
});

test('三段旧事只在对应人物处结识，不自动结缘；未成年不出现道侣故事', () => {
  const save = resident(15);
  assert.equal(humanStoryView(save, 'companion'), null);
  assert.equal(chooseHumanStory(save, 'companion', 'meet'), false);
  save.age = 20;
  for (const id of ['companion', 'friend', 'student'] as const) {
    assert.equal(chooseHumanStory(save, id, 'bond'), false);
    assert.equal(chooseHumanStory(save, id, 'meet'), true);
    assert.equal(save.mortal.humanStories?.[id]?.choice, null);
    const before = JSON.stringify(save);
    assert.equal(chooseHumanStory(save, id, 'meet'), false);
    assert.equal(JSON.stringify(save), before);
  }
});

test('道侣需两年相识与主动选择，可只作知己；不同选择保留不同旧信', () => {
  for (const choice of ['bond', 'friendship']) {
    const save = resident();
    chooseHumanStory(save, 'companion', 'meet');
    assert.equal(chooseHumanStory(save, 'companion', choice), false);
    save.age += 2;
    assert.equal(chooseHumanStory(save, 'companion', choice), true);
    assert.equal(chooseHumanStory(save, 'companion', 'bond'), false);
    const story = save.mortal.humanStories!.companion!;
    save.age += 5;
    assert.equal(chooseHumanStory(save, 'companion', 'visit'), true);
    assert.equal(chooseHumanStory(save, 'companion', 'visit'), false);
    save.age = story.endsAt - 0.001;
    assert.equal(syncHumanStories(save), false);
    save.age = story.endsAt;
    assert.equal(syncHumanStories(save), true);
    const view = humanStoryView(save, 'companion')!;
    assert.equal(view.keepsake, choice === 'bond' ? '同心旧结' : '青线书签');
    assert.ok(view.letter.join('').includes(choice === 'bond' ? '与你结缘' : '知己'));
    assert.ok(view.letter.join('').includes('那年灯下'));
    assert.ok(humanStoryGreeting(save, 'tailor').includes('后来接手'));
  }
});

test('旧友和少年各有分支后文，不能串用其他故事的选择', () => {
  for (const id of ['friend', 'student'] as const) {
    const config = HUMAN_STORIES[id];
    const letters: string[] = [];
    for (const choice of config.choices) {
      const save = resident();
      chooseHumanStory(save, id, 'meet');
      assert.equal(chooseHumanStory(save, id, 'bond'), false);
      save.age += config.years;
      assert.equal(chooseHumanStory(save, id, choice.id), true);
      save.age = save.mortal.humanStories![id]!.endsAt + 2000;
      syncHumanStories(save);
      letters.push(humanStoryView(save, id)!.letter.join(''));
    }
    assert.notEqual(letters[0], letters[1]);
  }
});

test('错过一生仍有旧信，不追认道侣；辞世只记录一次，信物随本世保存', () => {
  const save = resident();
  chooseHumanStory(save, 'companion', 'meet');
  const first = townResidents(save.mortal.population!, save.age).find((n) => n.id === 'tailor')!;
  save.age += 1000;
  assert.equal(syncHumanStories(save), true);
  const view = humanStoryView(save, 'companion')!;
  assert.equal(view.name, first.name);
  assert.equal(view.keepsake, '青线书签');
  assert.equal(chooseHumanStory(save, 'companion', 'bond'), false);
  assert.equal(chooseHumanStory(save, 'companion', 'read'), true);
  const before = JSON.stringify(save);
  assert.equal(syncHumanStories(save), false);
  assert.equal(chooseHumanStory(save, 'companion', 'read'), false);
  assert.equal(JSON.stringify(save), before);
  assert.notEqual(
    townResidents(save.mortal.population!, save.age).find((n) => n.id === 'tailor')!.name,
    first.name,
  );
  for (const copy of [parseSave(JSON.stringify(save)), importSave(exportSave(save, null)).save]) {
    assert.deepEqual(copy.mortal.humanStories, save.mortal.humanStories);
    assert.deepEqual(humanStoryView(copy, 'companion'), humanStoryView(save, 'companion'));
  }
  assert.equal(freshSave().mortal.humanStories, undefined);
});

test('旧档兼容；未来相识、伪造寿终、提前选择、提前读信及非法故事拒绝导入', () => {
  const save = resident();
  assert.equal(importSave(exportSave(save, null)).save.mortal.humanStories, undefined);
  chooseHumanStory(save, 'companion', 'meet');
  const story = save.mortal.humanStories!.companion!;
  for (const stories of [
    null,
    [],
    { unknown: story },
    { companion: { ...story, metAt: 1000 } },
    { companion: { ...story, endsAt: story.endsAt + 1 } },
    { companion: { ...story, choice: 'bond', chosenAt: save.age } },
    { companion: { ...story, choice: 'river', chosenAt: save.age } },
    { companion: { ...story, visitedAt: save.age } },
    { companion: { ...story, ended: true } },
    { companion: { ...story, read: true } },
  ])
    assert.throws(() =>
      importSave(JSON.stringify({ ...save, mortal: { ...save.mortal, humanStories: stories } })),
    );
});

test('时间跳跃后读档补齐旧信，已结束人生不能再作新选择', () => {
  const save = resident();
  chooseHumanStory(save, 'friend', 'meet');
  save.age += 500;
  const restored = parseSave(JSON.stringify(save));
  assert.equal(restored.mortal.humanStories!.friend!.ended, true);
  restored.journeyEnded = true;
  assert.equal(chooseHumanStory(restored, 'student', 'meet'), false);
  assert.equal(chooseHumanStory(restored, 'friend', 'read'), false);
});
