import test from 'node:test';
import assert from 'node:assert/strict';
import { LeaderboardOffer } from '../src/leaderboard-offer.ts';
import {
  LeaderboardPreference,
  LEADERBOARD_PREFERENCE_KEY,
} from '../src/leaderboard-preference.ts';
import { freshSave, IMMORTAL_CULTIVATION } from '../src/progress.ts';
import type { LeaderboardBoard, LeaderboardEntry } from '../src/leaderboard-contract.ts';
import type { LeaderboardProfile } from '../src/leaderboard-profile.ts';

const board: LeaderboardBoard = { version: 1, limit: 100, minimumScore: 0, entries: [] };
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const ended = () => {
  const save = freshSave();
  save.pendingReincarnation = 'lifespan';
  return save;
};
const entry = (name: string, score: number): LeaderboardEntry => ({
  name,
  score,
  grade: '下品',
  title: '凡尘初涉',
  lifeMode: 'normal',
  ending: 'lifespan',
  updatedAt: '2026-10-30T00:00:00.000Z',
});
const fullBoard = (minimumScore: number): LeaderboardBoard => ({
  ...board,
  minimumScore,
  entries: Array.from({ length: 100 }, (_, i) => entry('榜上修士' + i, minimumScore + 99 - i)),
});

test('万魂幡开关只保存独立本机偏好，失败不应用，重新读取保留选择', () => {
  const values = new Map<string, string>([['game', 'untouched']]);
  let fail = false;
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem(key: string, value: string) {
      if (fail) throw Error('quota');
      values.set(key, value);
    },
  };
  const preference = new LeaderboardPreference(() => storage);
  assert.equal(preference.enabled, true);
  fail = true;
  assert.equal(preference.toggle(), false);
  assert.equal(preference.enabled, true);
  assert.equal(values.has(LEADERBOARD_PREFERENCE_KEY), false);
  fail = false;
  assert.equal(preference.toggle(), true);
  assert.equal(preference.enabled, false);
  assert.equal(new LeaderboardPreference(() => storage).enabled, false);
  assert.equal(values.get('game'), 'untouched');
  assert.equal(
    new LeaderboardPreference(() => {
      throw Error('unavailable');
    }).enabled,
    false,
  );
});

test('未结束不查询，安全时异步核实前百，一世只提醒一次且不写存档', async () => {
  let reads = 0,
    notices = 0;
  const save = freshSave();
  const offer = new LeaderboardOffer(
    () => true,
    async () => {
      reads++;
      return board;
    },
  );
  offer.flush(save, true, () => notices++);
  assert.equal(reads, 0);
  save.pendingReincarnation = 'lifespan';
  const before = JSON.stringify(save);
  offer.flush(save, false, () => notices++);
  assert.equal(reads, 0);
  offer.flush(save, true, () => notices++);
  assert.equal(reads, 1);
  assert.equal(notices, 0);
  await settle();
  offer.flush(save, false, () => notices++);
  assert.equal(notices, 0);
  for (let i = 0; i < 20; i++) offer.flush(save, true, () => notices++);
  assert.equal(notices, 1);
  assert.equal(reads, 1);
  assert.equal(offer.canSign(save), true);
  assert.equal(offer.canSign(freshSave()), false);
  const priorTampered = save.factsTampered;
  save.factsTampered = true;
  assert.equal(offer.canSign(save), false);
  save.factsTampered = priorTampered;
  assert.equal(JSON.stringify(save), before);
});

test('成仙和四种落幕均可候选，低于或等于满榜门槛不提醒', async () => {
  for (const reason of ['immortal', 'lifespan', 'tribulation', 'ambush', 'extreme'] as const) {
    const save = freshSave();
    if (reason === 'immortal') {
      save.completed = [6];
      save.journeyEnded = true;
    } else save.pendingReincarnation = reason;
    let notices = 0;
    const offer = new LeaderboardOffer(
      () => true,
      async () => board,
    );
    offer.flush(save, true, () => notices++);
    await settle();
    offer.flush(save, true, () => notices++);
    assert.equal(notices, 1, reason);
  }
  for (const score of [99, 100]) {
    const full: LeaderboardBoard = { ...board, minimumScore: 100, entries: Array(100).fill({}) };
    let notices = 0;
    const save = ended();
    const offer = new LeaderboardOffer(
      () => true,
      async () => full,
      () => score,
    );
    offer.flush(save, true, () => notices++);
    await settle();
    offer.flush(save, true, () => notices++);
    assert.equal(notices, 0);
  }
});

test('关闭时零请求；关闭、导入、轮回后的迟到响应不提示，网络失败不循环', async () => {
  let enabled = false,
    reads = 0,
    notices = 0;
  let finish!: (value: LeaderboardBoard) => void;
  let signal!: AbortSignal;
  const save = ended();
  const offer = new LeaderboardOffer(
    () => enabled,
    (s) => {
      reads++;
      signal = s;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  );
  offer.flush(save, true, () => notices++);
  assert.equal(reads, 0);
  enabled = true;
  offer.flush(save, true, () => notices++);
  enabled = false;
  offer.flush(save, true, () => notices++);
  assert.equal(signal.aborted, true);
  finish(board);
  await settle();
  assert.equal(notices, 0);
  enabled = true;
  offer.flush(save, true, () => notices++);
  offer.clear();
  finish(board);
  await settle();
  offer.flush(freshSave(), true, () => notices++);
  assert.equal(notices, 0);
  assert.equal(offer.canSign(save), false);
  let failures = 0;
  const offline = new LeaderboardOffer(
    () => true,
    async () => {
      failures++;
      throw Error('offline');
    },
  );
  offline.flush(save, true, () => notices++);
  await settle();
  for (let i = 0; i < 20; i++) offline.flush(save, true, () => notices++);
  assert.equal(failures, 1);
  assert.equal(notices, 0);
});

test('只通终关仍能继续此世时不查询或提醒，真正完成终章才进入候选', async () => {
  const save = freshSave();
  save.completed = [0, 1, 2, 3, 4, 5, 6];
  save.cultivation = IMMORTAL_CULTIVATION;
  let reads = 0,
    notices = 0;
  const offer = new LeaderboardOffer(
    () => true,
    async () => {
      reads++;
      return board;
    },
  );
  for (let i = 0; i < 3; i++) offer.flush(save, true, () => notices++);
  await settle();
  assert.equal(reads, 0);
  assert.equal(notices, 0);
  assert.equal(offer.canSign(save), false);
  save.journeyEnded = true;
  offer.flush(save, true, () => notices++);
  await settle();
  offer.flush(save, true, () => notices++);
  assert.equal(reads, 1);
  assert.equal(notices, 1);
  assert.equal(offer.canSign(save), true);
});

test('邀请同时要求超过自己已确认的最高分与当前前百门槛', async () => {
  const cases: Array<{
    label: string;
    score: number;
    currentBoard: LeaderboardBoard;
    profile: LeaderboardProfile | null;
    expected: boolean;
  }> = [
    {
      label: '低于自己的最高分',
      score: 99,
      currentBoard: board,
      profile: entry('自己', 100),
      expected: false,
    },
    {
      label: '等于自己的最高分',
      score: 100,
      currentBoard: board,
      profile: entry('自己', 100),
      expected: false,
    },
    {
      label: '空榜但确实提高',
      score: 101,
      currentBoard: board,
      profile: entry('自己', 100),
      expected: true,
    },
    {
      label: '提高但仍未入前百',
      score: 150,
      currentBoard: fullBoard(200),
      profile: entry('自己', 100),
      expected: false,
    },
    {
      label: '提高但只追平第百名',
      score: 200,
      currentBoard: fullBoard(200),
      profile: entry('自己', 100),
      expected: false,
    },
    {
      label: '自己的旧记录在前百之外仍参与比较',
      score: 201,
      currentBoard: { ...fullBoard(200), self: entry('自己', 150) },
      profile: null,
      expected: true,
    },
    {
      label: '本机新确认分高于迟到self',
      score: 250,
      currentBoard: { ...fullBoard(100), self: entry('自己', 200) },
      profile: entry('自己', 300),
      expected: false,
    },
    {
      label: '服务端self高于本机旧分',
      score: 250,
      currentBoard: { ...fullBoard(100), self: entry('自己', 300) },
      profile: entry('自己', 200),
      expected: false,
    },
    {
      label: '新Cookie的self不混用旧身份分数',
      score: 101,
      currentBoard: { ...board, self: entry('当前自己', 100) },
      profile: entry('旧身份', 900),
      expected: true,
    },
  ];
  for (const item of cases) {
    const save = ended();
    let notices = 0;
    const offer = new LeaderboardOffer(
      () => true,
      async () => item.currentBoard,
      () => item.score,
      () => item.profile,
    );
    offer.flush(save, true, () => notices++);
    await settle();
    for (let i = 0; i < 3; i++) offer.flush(save, true, () => notices++);
    assert.equal(notices, item.expected ? 1 : 0, item.label);
    assert.equal(offer.canSign(save), item.expected, item.label);
  }
});

test('查询迟到或待提醒期间另一操作提高自己的记录，不再提示旧成绩', async () => {
  for (const updateBeforeResponse of [true, false]) {
    let profile: LeaderboardProfile = { name: '自己', score: 100 };
    let finish!: (value: LeaderboardBoard) => void;
    let reads = 0,
      notices = 0;
    const save = ended();
    const offer = new LeaderboardOffer(
      () => true,
      () => {
        reads++;
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
      () => 150,
      () => profile,
    );
    offer.flush(save, true, () => notices++);
    if (updateBeforeResponse) profile = { name: '自己', score: 200 };
    finish({ ...board, self: entry('自己', 100) });
    await settle();
    if (!updateBeforeResponse) profile = { name: '自己', score: 200 };
    for (let i = 0; i < 3; i++) offer.flush(save, true, () => notices++);
    assert.equal(reads, 1);
    assert.equal(notices, 0);
    assert.equal(offer.canSign(save), false);
  }
});

test('成功留名后即使本机不能记住profile，此世也不重新邀请或查询，下一世再核实', async () => {
  let reads = 0,
    notices = 0;
  const offer = new LeaderboardOffer(
    () => true,
    async () => {
      reads++;
      return board;
    },
    () => 100,
    () => null,
  );
  const save = ended();
  offer.flush(save, true, () => notices++);
  await settle();
  offer.flush(save, true, () => notices++);
  assert.equal(offer.canSign(save), true);
  offer.complete();
  assert.equal(offer.canSign(save), false);
  for (let i = 0; i < 10; i++) offer.flush(save, true, () => notices++);
  assert.equal(notices, 1);
  assert.equal(reads, 1);
  const next = ended();
  next.medicine.recipeSeed = save.medicine.recipeSeed + 1;
  offer.flush(next, true, () => notices++);
  await settle();
  offer.flush(next, true, () => notices++);
  assert.equal(notices, 2);
  assert.equal(reads, 2);
});
