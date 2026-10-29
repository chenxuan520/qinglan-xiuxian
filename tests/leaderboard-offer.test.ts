import test from 'node:test';
import assert from 'node:assert/strict';
import { LeaderboardOffer } from '../src/leaderboard-offer.ts';
import {
  LeaderboardPreference,
  LEADERBOARD_PREFERENCE_KEY,
} from '../src/leaderboard-preference.ts';
import { freshSave } from '../src/progress.ts';
import type { LeaderboardBoard } from '../src/leaderboard-contract.ts';

const board: LeaderboardBoard = { version: 1, limit: 100, minimumScore: 0, entries: [] };
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const ended = () => {
  const save = freshSave();
  save.pendingReincarnation = 'lifespan';
  return save;
};

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
  assert.equal(JSON.stringify(save), before);
});

test('成仙和四种落幕均可候选，低于或等于满榜门槛不提醒', async () => {
  for (const reason of ['immortal', 'lifespan', 'tribulation', 'ambush', 'extreme'] as const) {
    const save = freshSave();
    if (reason === 'immortal') save.completed = [6];
    else save.pendingReincarnation = reason;
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
