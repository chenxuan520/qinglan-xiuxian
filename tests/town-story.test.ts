import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSave, parseSave } from '../src/progress.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';
import {
  chooseSmithStory,
  smithAt,
  smithStoryView,
  smithStoryLine,
  smithStoryMemory,
} from '../src/town-story.ts';

function resident() {
  const save = freshSave();
  save.mortal.population = { seed: 12345, since: 15 };
  save.iron = 8;
  return save;
}
function nextGeneration(save: ReturnType<typeof resident>) {
  save.age = smithAt(save.mortal.population!, save.age).leavesAt;
}

test('首次结识从当前年岁起算，旧玩家可开篇；两种帮助均可继续且不能重复扣费', () => {
  for (const age of [15, 8000])
    for (const choice of ['iron', 'bellows']) {
      const save = resident();
      save.age = age;
      const population = save.mortal.population!;
      assert.equal(smithStoryView(population, age).chapter, 1);
      assert.equal(chooseSmithStory(save, choice), true);
      assert.equal(save.mortal.smithStory!.metAt, age);
      assert.equal(save.mortal.smithStory!.generation, smithAt(population, age).generation);
      assert.equal(save.iron, choice === 'iron' ? 6 : 8);
      const before = JSON.stringify(save);
      assert.equal(chooseSmithStory(save, choice), false);
      assert.equal(chooseSmithStory(save, 'school'), false);
      assert.equal(JSON.stringify(save), before);
    }
  const poor = resident();
  poor.iron = 1;
  assert.equal(chooseSmithStory(poor, 'iron'), false);
  assert.equal(poor.mortal.smithStory, undefined);
  assert.equal(chooseSmithStory(poor, 'bellows'), true);
  assert.equal(poor.iron, 1);
});

test('三代传承严格依换代节点推进，四种分支均有后文，奖励只能领取一次', () => {
  for (const help of ['iron', 'bellows'])
    for (const legacy of ['harbor', 'school']) {
      const save = resident();
      const population = save.mortal.population!;
      const first = smithAt(population, save.age);
      chooseSmithStory(save, help);
      save.age = first.leavesAt - 0.001;
      assert.equal(smithStoryView(population, save.age, save.mortal.smithStory).chapter, 1);
      assert.equal(chooseSmithStory(save, legacy), false);
      nextGeneration(save);
      const view = smithStoryView(population, save.age, save.mortal.smithStory);
      assert.equal(view.chapter, 2);
      assert.ok(view.text.includes(first.name));
      assert.ok(view.quote.includes(help === 'iron' ? '玄铁' : '拉风箱'));
      assert.equal(chooseSmithStory(save, legacy), true);
      assert.equal(chooseSmithStory(save, legacy === 'school' ? 'harbor' : 'school'), false);
      assert.equal(chooseSmithStory(save, 'remember'), false);
      assert.ok(
        smithStoryLine(population, save.age, save.mortal.smithStory, 'fisher').includes(
          legacy === 'school' ? '学堂' : '渡口',
        ),
      );
      assert.equal(smithStoryLine(population, save.age, save.mortal.smithStory, 'farmer'), '');
      nextGeneration(save);
      const beforeIron = save.iron;
      assert.equal(chooseSmithStory(save, 'remember'), true);
      assert.equal(save.iron - beforeIron, help === 'iron' ? 6 : 4);
      assert.equal(save.mortal.smithStory!.completed, true);
      const restored = importSave(exportSave(save, null)).save;
      const before = JSON.stringify(restored);
      assert.equal(chooseSmithStory(restored, 'remember'), false);
      assert.equal(JSON.stringify(restored), before);
      assert.ok(
        smithStoryMemory(population, save.age, save.mortal.smithStory, 'smith').includes(
          '不能再次赠送',
        ),
      );
    }
});

test('跨越数代可由旧信接续，第二三章依次完成，不把后人当亲历者', () => {
  const save = resident();
  chooseSmithStory(save, 'bellows');
  save.age += 3000;
  const view = smithStoryView(save.mortal.population!, save.age, save.mortal.smithStory);
  assert.equal(view.chapter, 2);
  assert.ok(view.text.includes('前人的名字'));
  assert.equal(chooseSmithStory(save, 'remember'), false);
  assert.equal(chooseSmithStory(save, 'school'), true);
  assert.equal(
    smithStoryView(save.mortal.population!, save.age, save.mortal.smithStory).chapter,
    3,
  );
  assert.equal(chooseSmithStory(save, 'remember'), true);
  save.age += 100000;
  assert.equal(chooseSmithStory(save, 'remember'), false);
  assert.equal(save.mortal.smithStory!.completed, true);
});

test('故事各阶段与名字随刷新、导出导入保留，轮回新存档没有前世故事', () => {
  const save = resident();
  chooseSmithStory(save, 'iron');
  for (let chapter = 1; chapter <= 3; chapter++) {
    for (const restored of [
      parseSave(JSON.stringify(save)),
      importSave(exportSave(save, null)).save,
    ]) {
      assert.deepEqual(restored.mortal.smithStory, save.mortal.smithStory);
      assert.deepEqual(
        smithStoryView(restored.mortal.population!, restored.age, restored.mortal.smithStory),
        smithStoryView(save.mortal.population!, save.age, save.mortal.smithStory),
      );
    }
    nextGeneration(save);
    chooseSmithStory(save, chapter === 1 ? 'harbor' : 'remember');
  }
  assert.equal(freshSave().mortal.smithStory, undefined);
  assert.equal(importSave(exportSave(resident(), null)).save.mortal.smithStory, undefined);
});

test('伪造选择、未来相识、错位代际和提前完成的故事拒绝导入', () => {
  const save = resident();
  chooseSmithStory(save, 'iron');
  const story = save.mortal.smithStory!;
  for (const invalid of [
    null,
    [],
    { ...story, help: '<script>' },
    { ...story, metAt: 999 },
    { ...story, generation: 1 },
    { ...story, completed: true },
    { ...story, legacy: 'school' },
    { ...story, legacy: 'unknown' },
    { ...story, completed: 'false' },
    { ...story, metAt: '15' },
  ])
    assert.throws(() =>
      importSave(JSON.stringify({ ...save, mortal: { ...save.mortal, smithStory: invalid } })),
    );
  assert.throws(() =>
    importSave(JSON.stringify({ ...save, mortal: { ...save.mortal, population: undefined } })),
  );
});
