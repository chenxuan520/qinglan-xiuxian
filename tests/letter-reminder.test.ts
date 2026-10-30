import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSave } from '../src/progress.ts';
import { chooseHumanStory } from '../src/human-stories.ts';
import { readHometownLetter, visitHometown } from '../src/hometown.ts';
import { chooseSmithStory, smithAt, smithStoryView } from '../src/town-story.ts';
import { marketFellowView, meetMarketFellow, chooseMarketFellow } from '../src/market-fellow.ts';
import { marketFellowLife, marketFellowLetterWaiting } from '../src/market-fellow-life.ts';
import { MARKET_FELLOW_SETTINGS } from '../src/market-fellow-data.ts';
import { enterNextMarketBatch } from './market-fixture.ts';
import {
  LETTER_REMINDER_TEXT,
  LETTER_REMINDER_KEY,
  LetterReminder,
  waitingLetterKeys,
  type LetterReminderContext,
} from '../src/letter-reminder.ts';

const ready: LetterReminderContext = {
  atHome: true,
  gamePresent: false,
  panel: '',
  foreground: true,
  toastVisible: false,
  blocked: false,
};

function resident() {
  const save = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  save.age = 20;
  save.prologueSeen = save.hometownSeen = true;
  save.mortal.hometown!.stage = 'departed';
  save.mortal.population = { seed: 12345, since: 15 };
  return save;
}

function friendLetter() {
  const save = resident();
  assert.ok(chooseHumanStory(save, 'friend', 'meet'));
  save.age = save.mortal.humanStories!.friend!.endsAt;
  // 本测试单独检查故友来信；家书的发现/阅读另测真实流程。
  save.mortal.hometown!.letterFoundAt = save.age;
  save.mortal.hometown!.letterRead = true;
  return save;
}

test('无信不提醒，有信只用确认的捎话句，同一封本次运行只提醒一次', () => {
  const reminders = new LetterReminder();
  const shown: string[] = [];
  const notify = (text: string) => {
    shown.push(text);
  };
  reminders.queue();
  assert.equal(reminders.flush(resident(), ready, notify), false);
  const save = friendLetter();
  const before = structuredClone(save);
  assert.equal(reminders.flush(save, ready, notify), false, '未重新进入首页时不主动补发');
  reminders.queue();
  assert.equal(reminders.flush(save, ready, notify), true);
  for (let i = 0; i < 3; i++) {
    reminders.queue();
    assert.equal(reminders.flush(save, ready, notify), false);
  }
  assert.deepEqual(shown, ['镇里托人捎话：得空，回来看看。']);
  assert.equal(LETTER_REMINDER_TEXT, shown[0]);
  assert.deepEqual(save, before);
  const refreshed = new LetterReminder();
  refreshed.queue();
  assert.equal(refreshed.flush(save, ready, notify), true, '刷新只丢内存提醒记录');
});

test('三种人间旧信合并一次，后续新的信可独立提醒，已读信不提醒', () => {
  const save = resident();
  for (const id of ['companion', 'friend', 'student'] as const)
    assert.ok(chooseHumanStory(save, id, 'meet'));
  save.age = Math.max(...Object.values(save.mortal.humanStories!).map((s) => s.endsAt));
  save.mortal.hometown!.letterRead = true;
  assert.equal(waitingLetterKeys(save).length, 3);
  const reminders = new LetterReminder();
  const shown: string[] = [];
  reminders.queue();
  reminders.queue();
  assert.equal(
    reminders.flush(save, ready, (text) => shown.push(text)),
    true,
  );
  reminders.queue();
  assert.equal(
    reminders.flush(save, ready, (text) => shown.push(text)),
    false,
  );
  assert.deepEqual(shown, [LETTER_REMINDER_TEXT]);
  for (const id of ['companion', 'friend', 'student'] as const)
    assert.ok(chooseHumanStory(save, id, 'read'));
  assert.deepEqual(waitingLetterKeys(save), []);

  const next = resident();
  const nextReminders = new LetterReminder();
  assert.ok(chooseHumanStory(next, 'friend', 'meet'));
  next.age = next.mortal.humanStories!.friend!.endsAt;
  next.mortal.hometown!.letterRead = true;
  nextReminders.queue();
  assert.equal(
    nextReminders.flush(next, ready, (text) => shown.push(text)),
    true,
  );
  assert.ok(chooseHumanStory(next, 'student', 'meet'));
  next.age = next.mortal.humanStories!.student!.endsAt;
  nextReminders.queue();
  assert.equal(
    nextReminders.flush(next, ready, (text) => shown.push(text)),
    true,
  );
  assert.equal(shown.length, 3);
});

test('未发现家书仅在实际可发现时提醒，发现前后仍是同一封，读后不提醒', () => {
  const save = resident();
  const home = save.mortal.hometown!;
  delete save.mortal.population;
  const deaths = Object.values(home.parents).map((p) => 15 + p.diesAt - p.ageAtStart);
  home.parents.mother.diesAt += 7; // 将两位父母的到期时间明确分开。
  deaths[1] = 15 + home.parents.mother.diesAt - home.parents.mother.ageAtStart;
  save.age = Math.min(...deaths);
  assert.deepEqual(waitingLetterKeys(save), [], '仅一位离世时故居没有可发现的信');
  save.age = Math.max(...deaths) - 0.001;
  assert.deepEqual(waitingLetterKeys(save), []);
  save.age = Math.max(...deaths);
  const before = structuredClone(save);
  const keys = waitingLetterKeys(save);
  assert.equal(keys.length, 1);
  const reminders = new LetterReminder();
  const shown: string[] = [];
  reminders.queue();
  assert.equal(
    reminders.flush(save, ready, (text) => shown.push(text)),
    true,
  );
  assert.deepEqual(save, before, '提醒不替玩家发现或阅读家书');
  save.mortal.population = { seed: 87654, since: save.age };
  assert.ok(visitHometown(save));
  assert.equal(home.letterFoundAt, save.age);
  assert.deepEqual(waitingLetterKeys(save), keys, '首次入镇生成的人口种子和发现年岁不改变家书标识');
  reminders.queue();
  assert.equal(
    reminders.flush(save, ready, (text) => shown.push(text)),
    false,
  );
  assert.ok(readHometownLetter(save));
  assert.deepEqual(waitingLetterKeys(save), []);
  assert.deepEqual(shown, [LETTER_REMINDER_TEXT]);
});

test('铁匠在真实换代后才有旧账来信，已看正文的内存标记和已选去处都阻止重提', () => {
  const save = resident();
  save.mortal.hometown!.letterRead = true;
  assert.ok(chooseSmithStory(save, 'bellows'));
  const end = smithAt(save.mortal.population!, save.age).leavesAt;
  save.age = end - 0.001;
  assert.deepEqual(waitingLetterKeys(save), []);
  save.age = end;
  assert.equal(
    smithStoryView(save.mortal.population!, save.age, save.mortal.smithStory).title,
    '二 · 旧账来信',
  );
  assert.equal(waitingLetterKeys(save).length, 1);
  const reminders = new LetterReminder();
  const before = structuredClone(save);
  reminders.markSmithViewed(save);
  assert.deepEqual(save, before);
  reminders.queue();
  assert.equal(
    reminders.flush(save, ready, () => assert.fail('已看到正文不再提醒')),
    false,
  );
  const unseen = new LetterReminder();
  unseen.queue();
  assert.equal(
    unseen.flush(save, ready, (text) => assert.equal(text, LETTER_REMINDER_TEXT)),
    true,
  );
  save.age += 3000;
  unseen.queue();
  assert.equal(
    unseen.flush(save, ready, () => assert.fail('换更多代仍是同封旧账')),
    false,
  );
  assert.ok(chooseSmithStory(save, 'school'));
  assert.deepEqual(waitingLetterKeys(save), []);
});

function fellowFixture(choice: 'stay' | 'travel', chosenAt = 35) {
  const save = resident();
  save.mortal.hometown!.letterRead = true;
  save.age = 30;
  save.cultivation = 1;
  assert.ok(enterNextMarketBatch(save));
  assert.ok(meetMarketFellow(save));
  save.age = chosenAt;
  assert.ok(meetMarketFellow(save));
  assert.ok(chooseMarketFellow(save, choice, save.mortal.sectMarket!.visit));
  return save;
}

test('炉边信判定与真实视图一致，覆盖两种选择、迟归、未及圆愿和已完成', () => {
  for (const choice of ['stay', 'travel'] as const)
    for (const chosenAt of [35, 140, 155]) {
      const save = fellowFixture(choice, chosenAt);
      const story = save.mortal.marketFellow!;
      const life = marketFellowLife(story);
      const checkpoints = new Set([
        chosenAt,
        chosenAt + 9.999,
        chosenAt + 10,
        life.endedAt - 0.001,
        life.endedAt,
        life.endedAt + 1000,
      ]);
      for (const age of checkpoints) {
        save.age = age;
        const expected = marketFellowView(save)?.phase === '旧信待展';
        assert.equal(
          marketFellowLetterWaiting(story, age),
          expected,
          `${choice}/${chosenAt}/${age}`,
        );
        assert.equal(waitingLetterKeys(save).length, expected ? 1 : 0);
      }
      save.age = Math.max(life.endedAt, chosenAt + 10);
      assert.ok(chooseMarketFellow(save, 'read', save.mortal.sectMarket!.visit));
      assert.equal(marketFellowView(save)?.phase, '一炉有归');
      assert.deepEqual(waitingLetterKeys(save), []);
    }
});

test('家书、人间旧信、旧账和炉边信同时等待仍只合并一句，不泄露来源或数量', () => {
  const save = fellowFixture('travel');
  for (const id of ['companion', 'friend', 'student'] as const)
    assert.ok(chooseHumanStory(save, id, 'meet'));
  assert.ok(chooseSmithStory(save, 'bellows'));
  save.mortal.hometown!.letterRead = false;
  save.mortal.hometown!.letterFoundAt = null;
  save.age = marketFellowLife(save.mortal.marketFellow!).endedAt;
  assert.equal(waitingLetterKeys(save).length, 6);
  const reminders = new LetterReminder();
  const shown: string[] = [];
  reminders.queue();
  assert.equal(
    reminders.flush(save, ready, (text) => shown.push(text)),
    true,
  );
  reminders.queue();
  assert.equal(
    reminders.flush(save, ready, (text) => shown.push(text)),
    false,
  );
  assert.deepEqual(shown, ['镇里托人捎话：得空，回来看看。']);
});

test('抽取寿数计算保留原寿终边界与升境时机，首页判定不让不可访问炉边的角色收到提醒', () => {
  for (const [choice, chosenAt, goldenAt, soulAt, end] of [
    ['stay', 35, 45, null, 450],
    ['travel', 35, 45, 115, 950],
    ['travel', 140, null, null, 150],
    ['stay', 155, null, null, 150],
  ] as const) {
    const save = fellowFixture(choice, chosenAt);
    assert.deepEqual(marketFellowLife(save.mortal.marketFellow!), {
      goldenAt,
      soulAt,
      endedAt: end,
    });
    save.age = Math.max(end, chosenAt + MARKET_FELLOW_SETTINGS.outcomeYears);
    assert.equal(waitingLetterKeys(save).length, 1);
    save.cultivation = 0;
    assert.deepEqual(waitingLetterKeys(save), []);
    save.cultivation = 1;
    delete save.mortal.sectMarket;
    assert.deepEqual(waitingLetterKeys(save), []);
  }
});

test('战斗或暂停、任意面板、离开首页、后台、已有提示和强制流程期间均等待', () => {
  const save = friendLetter();
  for (const patch of [
    { atHome: false },
    { gamePresent: true }, // 暂停仍有 game；不能仅依赖 running 状态。
    { panel: 'pause' },
    { panel: 'settings' },
    { panel: 'lifespan' },
    { panel: 'sect-dues' },
    { panel: 'tribulation' },
    { foreground: false },
    { toastVisible: true },
    { blocked: true },
  ]) {
    const reminders = new LetterReminder();
    let calls = 0;
    reminders.queue();
    assert.equal(
      reminders.flush(save, { ...ready, ...patch }, () => calls++),
      false,
    );
    assert.equal(calls, 0);
    assert.equal(
      reminders.flush(save, ready, () => calls++),
      true,
    );
    assert.equal(calls, 1);
  }
});

test('结算年岁提示在前，等待后只读取此刻仍未读的信，不把迟到提醒带去其他页面', () => {
  const save = friendLetter();
  const reminders = new LetterReminder();
  const log = ['山中一程，人间已过 35 年。'];
  reminders.queue();
  assert.equal(
    reminders.flush(save, { ...ready, toastVisible: true }, (text) => log.push(text)),
    false,
  );
  assert.equal(
    reminders.flush(save, { ...ready, atHome: false }, (text) => log.push(text)),
    false,
  );
  assert.deepEqual(log, ['山中一程，人间已过 35 年。']);
  assert.equal(
    reminders.flush(save, ready, (text) => log.push(text)),
    true,
  );
  assert.deepEqual(log, ['山中一程，人间已过 35 年。', LETTER_REMINDER_TEXT]);
  const readBeforeShow = new LetterReminder();
  readBeforeShow.queue();
  assert.equal(
    readBeforeShow.flush(save, { ...ready, blocked: true }, () => assert.fail()),
    false,
  );
  assert.ok(chooseHumanStory(save, 'friend', 'read'));
  assert.equal(
    readBeforeShow.flush(save, ready, () => assert.fail('迟到时已读不能再提醒')),
    false,
  );
});

test('已落幕或待轮回的存档不因暂时没有面板而显示提醒', () => {
  for (const pending of ['lifespan', 'tribulation', 'ambush', 'extreme', null] as const) {
    const save = friendLetter();
    save.pendingReincarnation = pending;
    save.journeyEnded = pending === null;
    const reminders = new LetterReminder();
    reminders.queue();
    assert.equal(
      reminders.flush(save, ready, () => assert.fail('强制流程必须优先')),
      false,
    );
    save.pendingReincarnation = null;
    save.journeyEnded = false;
    assert.equal(
      reminders.flush(save, ready, (text) => assert.equal(text, LETTER_REMINDER_TEXT)),
      true,
    );
  }
});

test('实际通知失败不消耗提醒；存储被拒仍正常提示，清理不重提同信且不改人物存档', () => {
  const save = friendLetter();
  const before = JSON.stringify(save);
  const keys = Object.keys(save);
  const storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new Error('storage denied');
    },
  });
  try {
    const reminders = new LetterReminder();
    reminders.queue();
    assert.throws(() =>
      reminders.flush(save, ready, () => {
        throw new Error('toast unavailable');
      }),
    );
    assert.equal(
      reminders.flush(save, ready, (text) => assert.equal(text, LETTER_REMINDER_TEXT)),
      true,
    );
    reminders.clear();
    assert.equal(
      reminders.flush(save, ready, () => assert.fail('新一世未排队')),
      false,
    );
    reminders.queue();
    assert.equal(
      reminders.flush(save, ready, () => assert.fail('清理后同信不重提')),
      false,
    );
    assert.equal(JSON.stringify(save), before);
    assert.deepEqual(Object.keys(save), keys);
  } finally {
    if (storage) Object.defineProperty(globalThis, 'localStorage', storage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

function reminderStorage(initial: string | null = null) {
  let value = initial;
  let writes = 0;
  return {
    get value() {
      return value;
    },
    get writes() {
      return writes;
    },
    getItem(key: string) {
      assert.equal(key, LETTER_REMINDER_KEY);
      return value;
    },
    setItem(key: string, next: string) {
      assert.equal(key, LETTER_REMINDER_KEY);
      value = next;
      writes++;
    },
  };
}

test('已提示信件跨实例与刷新去重，换世清理不重提原信，新信仍可提醒', () => {
  const store = reminderStorage();
  const save = friendLetter();
  const before = JSON.stringify(save);
  const a = new LetterReminder(() => store);
  a.queue();
  assert.equal(
    a.flush(save, ready, () => {}),
    true,
  );
  const b = new LetterReminder(() => store);
  b.queue();
  assert.equal(
    b.flush(save, ready, () => assert.fail('刷新不重提')),
    false,
  );
  b.clear();
  b.queue();
  assert.equal(
    b.flush(save, ready, () => assert.fail('原信不重提')),
    false,
  );
  assert.equal(JSON.stringify(save), before);
  const next = friendLetter();
  next.mortal.population!.seed++;
  b.queue();
  assert.equal(
    b.flush(next, ready, () => {}),
    true,
  );
  const c = new LetterReminder(() => store);
  c.queue();
  assert.equal(
    c.flush(next, ready, () => assert.fail('新信只一次')),
    false,
  );
});

test('另一实例已提示的信件在本页下一次首页排队时也不重提', () => {
  const store = reminderStorage();
  const early = new LetterReminder(() => store);
  const later = new LetterReminder(() => store);
  const save = friendLetter();
  later.queue();
  assert.equal(
    later.flush(save, ready, () => {}),
    true,
  );
  early.queue();
  assert.equal(
    early.flush(save, ready, () => assert.fail('应回读其他页面记录')),
    false,
  );
});

test('通知函数失败不写去重记录，存储拒写只在当页去重且不阻断游戏', () => {
  const store = reminderStorage();
  const save = friendLetter();
  const r = new LetterReminder(() => store);
  r.queue();
  assert.throws(() =>
    r.flush(save, ready, () => {
      throw new Error('notify failed');
    }),
  );
  assert.equal(store.writes, 0);
  const fresh = new LetterReminder(() => store);
  fresh.queue();
  assert.equal(
    fresh.flush(save, ready, () => {}),
    true,
  );
  const blocked = new LetterReminder(() => ({
    getItem: () => null,
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
  }));
  const before = JSON.stringify(save);
  blocked.queue();
  assert.equal(
    blocked.flush(save, ready, () => {}),
    true,
  );
  blocked.queue();
  assert.equal(
    blocked.flush(save, ready, () => assert.fail('当页不重提')),
    false,
  );
  assert.equal(JSON.stringify(save), before);
});

test('损坏、过大或非信件字符串记录不阻断正常提醒，历史记录保持有界', () => {
  for (const raw of [
    '{',
    '{}',
    'null',
    '[1]',
    '[""]',
    JSON.stringify(['x'.repeat(257)]),
    'x'.repeat(32769),
    JSON.stringify(Array(129).fill('old')),
  ]) {
    const store = reminderStorage(raw);
    const r = new LetterReminder(() => store);
    r.queue();
    assert.equal(
      r.flush(friendLetter(), ready, () => {}),
      true,
    );
    assert.ok(Array.isArray(JSON.parse(store.value!)));
  }
  const store = reminderStorage(JSON.stringify(Array.from({ length: 128 }, (_, i) => `past:${i}`)));
  const save = friendLetter();
  const r = new LetterReminder(() => store);
  r.queue();
  assert.equal(
    r.flush(save, ready, () => {}),
    true,
  );
  const keys = JSON.parse(store.value!);
  assert.equal(keys.length, 128);
  assert.ok(keys.includes(waitingLetterKeys(save)[0]));
  const reload = new LetterReminder(() => store);
  reload.queue();
  assert.equal(
    reload.flush(save, ready, () => assert.fail('最新记录仍在')),
    false,
  );
});

test('无信或首页被阻塞时不写提示记录，也不提前消耗信件', () => {
  const store = reminderStorage();
  const r = new LetterReminder(() => store);
  r.queue();
  assert.equal(
    r.flush(resident(), ready, () => assert.fail()),
    false,
  );
  assert.equal(store.writes, 0);
  r.queue();
  assert.equal(
    r.flush(friendLetter(), { ...ready, blocked: true }, () => assert.fail()),
    false,
  );
  assert.equal(store.writes, 0);
  assert.equal(
    r.flush(friendLetter(), ready, () => {}),
    true,
  );
  assert.equal(store.writes, 1);
});

test('家书发现前后的稳定键跨刷新保持同一提醒，实际发现和阅读不受影响', () => {
  const store = reminderStorage();
  const save = resident();
  delete save.mortal.population;
  const home = save.mortal.hometown!;
  save.age = Math.max(...Object.values(home.parents).map((p) => 15 + p.diesAt - p.ageAtStart));
  const r = new LetterReminder(() => store);
  r.queue();
  assert.equal(
    r.flush(save, ready, () => {}),
    true,
  );
  assert.equal(home.letterFoundAt, null);
  assert.equal(home.letterRead, false);
  assert.ok(visitHometown(save));
  const reload = new LetterReminder(() => store);
  reload.queue();
  assert.equal(
    reload.flush(save, ready, () => assert.fail('家书发现后不重提')),
    false,
  );
  assert.ok(readHometownLetter(save));
  assert.equal(home.letterRead, true);
});

test('铁匠旧账正文已实际展示的记录跨刷新保留，不改故事选择', () => {
  const store = reminderStorage();
  const save = resident();
  save.mortal.hometown!.letterRead = true;
  assert.ok(chooseSmithStory(save, 'bellows'));
  save.age = smithAt(save.mortal.population!, save.age).leavesAt;
  const before = JSON.stringify(save);
  const r = new LetterReminder(() => store);
  r.markSmithViewed(save);
  assert.equal(JSON.stringify(save), before);
  const reload = new LetterReminder(() => store);
  reload.queue();
  assert.equal(
    reload.flush(save, ready, () => assert.fail('已看铁匠正文不重提')),
    false,
  );
});
