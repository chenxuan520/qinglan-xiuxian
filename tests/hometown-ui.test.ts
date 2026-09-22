import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSave, realmCost } from '../src/progress.ts';
import {
  departHometown,
  acceptHometownRoot,
  visitHometown,
  readHometownLetter,
} from '../src/hometown.ts';
import {
  hometownContent,
  humanStoryJournal,
  townPage,
  townEventContent,
} from '../src/mortal-ui.ts';
import { unreadHumanLetterKeys } from '../src/human-stories.ts';
import { journeyCardData } from '../src/journey-card.ts';
import { HOMETOWN_HOUSE, HOMETOWN_ROUTE, townWalkable, TOWN_NPCS } from '../src/town.ts';
import { townSceneryLayout } from '../src/town-history.ts';
import { townResidents } from '../src/town-population.ts';

function departed() {
  const save = freshSave('heaven', undefined, 'orthodox', () => 0);
  save.mortal.hometown!.stage = 'walk';
  departHometown(save);
  acceptHometownRoot(save);
  return save;
}

test('离乡路线全程可达且正常速度约二十秒，故居跨千年保留地块', () => {
  let distance = 0;
  for (let i = 1; i < HOMETOWN_ROUTE.length; i++) {
    const from = HOMETOWN_ROUTE[i - 1],
      to = HOMETOWN_ROUTE[i];
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    distance += length;
    for (let step = 0; step <= length; step += 2)
      assert.ok(
        townWalkable({
          x: from.x + ((to.x - from.x) * step) / length,
          y: from.y + ((to.y - from.y) * step) / length,
        }),
      );
  }
  assert.ok(distance / 180 >= 15 && distance / 180 <= 25);
  for (const age of [15, 115, 315, 1015, 100015]) {
    const scenery = { lastVisitAge: age, since: 15, revision: 0 };
    const layout = townSceneryLayout(42, scenery, true);
    const home = layout.buildings.find((b) => b.x === HOMETOWN_HOUSE.x && b.y === HOMETOWN_HOUSE.y);
    assert.equal(home?.caption, '故居');
    assert.equal(home?.art, 3);
    assert.equal(layout.npcs.length, 21);
    assert.deepEqual(
      townResidents({ seed: 42, since: 15 }, age, layout.npcs),
      townResidents({ seed: 42, since: 15 }, age, TOWN_NPCS),
    );
  }
});

test('离乡只展示渡口目标，正式入城才显示人间资源与出口', () => {
  const save = freshSave();
  assert.match(townPage(save, ''), /前往渡口/);
  assert.doesNotMatch(townPage(save, ''), /data-action="town-talk" disabled/);
  assert.doesNotMatch(townPage(save, ''), /灵石|现实 1 分钟|town-exit/);
  save.mortal.hometown!.stage = 'walk';
  departHometown(save);
  acceptHometownRoot(save);
  assert.match(townPage(save, ''), /town-exit/);
  assert.match(townPage(save, ''), /现实 1 分钟/);
});

test('父母去世不自动弹家书，故居发现后并入缘簿，展读才进入留影', () => {
  const save = departed();
  save.age = 100;
  assert.deepEqual(unreadHumanLetterKeys(save), []);
  assert.doesNotMatch(humanStoryJournal(save), /家书/);
  assert.doesNotMatch(JSON.stringify(journeyCardData(save)), /家书犹存|曾归故里/);
  visitHometown(save);
  assert.equal(unreadHumanLetterKeys(save).length, 1);
  assert.match(humanStoryJournal(save), /未读家书/);
  assert.equal(save.mortal.hometown!.letterRead, false);
  readHometownLetter(save);
  assert.deepEqual(unreadHumanLetterKeys(save), []);
  assert.equal(journeyCardData(save).memories[0].title, '家书犹存');
});

test('相见才记录归乡，普通返乡与千年故居文案依据实际状态', () => {
  const save = departed();
  save.age = 46;
  assert.match(hometownContent(save, 'mother'), /一别 31 年/);
  assert.doesNotMatch(hometownContent(save, 'mother'), /走时的模样/);
  visitHometown(save, 'mother');
  assert.equal(journeyCardData(save).memories[0].title, '曾归故里');
  save.age = 100;
  assert.match(hometownContent(save), /门扉紧闭/);
  save.age = 1000;
  assert.match(hometownContent(save), /另住他人/);
  save.cultivation = Array.from({ length: 24 }, (_, i) => realmCost(i)).reduce((a, b) => a + b, 0);
  save.completed = [6];
  assert.match(hometownContent(save), /那年你十五岁/);
});

test('不同此世家书提醒不碰撞，缘簿摘要使用实际写信人的正文', () => {
  const father = departed();
  father.age = 100;
  father.mortal.population = { seed: 1, since: 15 };
  father.mortal.hometown!.parents = {
    father: { ageAtStart: 37, diesAt: 80 },
    mother: { ageAtStart: 39, diesAt: 80 },
  };
  visitHometown(father);
  const mother = structuredClone(father);
  mother.mortal.population!.seed = 2;
  mother.mortal.hometown!.parents = {
    father: { ageAtStart: 43, diesAt: 80 },
    mother: { ageAtStart: 34, diesAt: 80 },
  };
  assert.notDeepEqual(unreadHumanLetterKeys(father), unreadHumanLetterKeys(mother));
  assert.match(humanStoryJournal(father), /出门在外，记得好好吃饭/);
  assert.doesNotMatch(humanStoryJournal(father), /山里若冷/);
  assert.match(humanStoryJournal(mother), /山里若冷/);
});

test('在世父母可闲谈，故居和离世父母不提供聊天表单', () => {
  const save = departed();
  for (const parent of ['father', 'mother'] as const) {
    assert.match(hometownContent(save, parent), /npc-chat-form/);
    assert.match(hometownContent(save, parent), /想对家人说的话/);
  }
  assert.doesNotMatch(hometownContent(save), /npc-chat-form/);
  save.age = 100;
  assert.equal(hometownContent(save, 'father'), '');
  assert.equal(hometownContent(save, 'mother'), '');
});

test('药铺采药与买药按钮归入同组，待办仅禁用采药不禁用药铺', () => {
  const save = departed();
  const npc = townResidents({ seed: 42, since: 15 }, 15).find((n) => n.id === 'herbs')!;
  const html = townEventContent(save, npc);
  assert.match(
    html,
    /class="town-event-actions"><button[^>]*data-action="mortal-activity"[^>]*>接下这件事<\/button><button[^>]*data-action="medicine-shop"/,
  );
  save.mortal.activity = { kind: 'herbs', remaining: 1, total: 1, sect: null };
  const busy = townEventContent(save, npc);
  assert.match(busy, /data-action="mortal-activity"[^>]*disabled/);
  assert.doesNotMatch(busy, /data-action="medicine-shop"[^>]*disabled/);
});
