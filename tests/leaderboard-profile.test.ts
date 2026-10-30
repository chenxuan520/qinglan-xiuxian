import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEADERBOARD_PROFILE_KEY,
  improvesLeaderboardProfile,
  readLeaderboardProfile,
  rememberLeaderboardProfile,
} from '../src/leaderboard-profile.ts';
import { LeaderboardClient, LeaderboardError } from '../src/leaderboard-client.ts';
import type { LeaderboardBoard, LeaderboardEntry } from '../src/leaderboard-contract.ts';

const entry = (name: string, score: number): LeaderboardEntry => ({
  name,
  score,
  grade: '下品',
  title: '凡尘初涉',
  lifeMode: 'normal',
  ending: 'lifespan',
  updatedAt: '2026-10-30T00:00:00.000Z',
});
const empty: LeaderboardBoard = { version: 1, limit: 100, minimumScore: 0, entries: [] };
const storageFixture = () => {
  const values = new Map<string, string>([['qinglan-immortal-v1', 'untouched-game-save']]);
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
};

test('本机署名仅保存规范姓名和同名最高分，不混入游戏存档或服务端身份字段', () => {
  const storage = storageFixture();
  const confirmed = { ...entry('　Ａlice　', 100), owner_hash: 'synthetic-owner-not-for-storage' };
  rememberLeaderboardProfile(confirmed, () => storage);
  assert.deepEqual(
    readLeaderboardProfile(() => storage),
    { name: 'Alice', score: 100 },
  );
  assert.deepEqual(JSON.parse(storage.values.get(LEADERBOARD_PROFILE_KEY)!), {
    name: 'Alice',
    score: 100,
  });
  rememberLeaderboardProfile({ name: 'Alice', score: 90 }, () => storage);
  assert.deepEqual(
    readLeaderboardProfile(() => storage),
    { name: 'Alice', score: 100 },
  );
  rememberLeaderboardProfile({ name: 'Alice', score: 150 }, () => storage);
  assert.deepEqual(
    readLeaderboardProfile(() => storage),
    { name: 'Alice', score: 150 },
  );
  assert.equal(storage.values.get('qinglan-immortal-v1'), 'untouched-game-save');
  assert.deepEqual(
    [...storage.values.keys()].sort(),
    [LEADERBOARD_PROFILE_KEY, 'qinglan-immortal-v1'].sort(),
  );
});

test('缺失、损坏或不可用storage不阻断署名；无效资料不覆盖已确认记录', () => {
  const storage = storageFixture();
  for (const value of [
    null,
    '{',
    '[]',
    '{}',
    JSON.stringify({ name: '', score: 1 }),
    JSON.stringify({ name: '<script>', score: 1 }),
    JSON.stringify({ name: '青岚客', score: -1 }),
    JSON.stringify({ name: '青岚客', score: 1.5 }),
    JSON.stringify({ name: '青岚客', score: Number.MAX_SAFE_INTEGER + 1 }),
  ]) {
    if (value === null) storage.values.delete(LEADERBOARD_PROFILE_KEY);
    else storage.values.set(LEADERBOARD_PROFILE_KEY, value);
    assert.equal(
      readLeaderboardProfile(() => storage),
      null,
      String(value),
    );
  }
  const confirmed = { name: '青岚客', score: 100 };
  rememberLeaderboardProfile(confirmed, () => storage);
  const before = storage.values.get(LEADERBOARD_PROFILE_KEY);
  for (const profile of [
    { name: '', score: 200 },
    { name: '<script>', score: 200 },
    { name: '青岚客', score: -1 },
    { name: '青岚客', score: Infinity },
    { name: '青岚客', score: 1.5 },
  ]) {
    assert.doesNotThrow(() => rememberLeaderboardProfile(profile, () => storage));
    assert.equal(storage.values.get(LEADERBOARD_PROFILE_KEY), before);
  }
  const unavailable = () => {
    throw Error('synthetic storage access denial');
  };
  assert.equal(readLeaderboardProfile(unavailable), null);
  assert.doesNotThrow(() => rememberLeaderboardProfile(confirmed, unavailable));
  const denied = {
    getItem() {
      throw Error('synthetic storage read denial');
    },
    setItem() {
      throw Error('synthetic storage write denial');
    },
  };
  assert.equal(
    readLeaderboardProfile(() => denied),
    null,
  );
  assert.doesNotThrow(() => rememberLeaderboardProfile(confirmed, () => denied));
  assert.doesNotThrow(() =>
    rememberLeaderboardProfile({ name: '青岚客', score: 200 }, () => ({
      getItem: storage.getItem,
      setItem() {
        throw Error('synthetic quota denial');
      },
    })),
  );
  assert.deepEqual(
    readLeaderboardProfile(() => storage),
    confirmed,
  );
});

test('只从服务端self确认本机署名，公榜其他姓名和失败响应不能改写；自己可在前百之外', async () => {
  const storage = storageFixture();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let response: unknown = { ...empty, entries: [entry('榜上他人', 900)] };
  let status = 200;
  const client = new LeaderboardClient({
    origin: 'https://xiuxian.011203.xyz',
    fetcher: async () => Response.json(response, { status }),
  });
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
    await client.read(new AbortController().signal);
    assert.equal(readLeaderboardProfile(), null, '不能从公榜猜测当前浏览器身份');
    const own = entry('服务端确认名', 500);
    response = {
      ...empty,
      minimumScore: 600,
      entries: Array.from({ length: 100 }, (_, i) => entry('前百修士' + i, 699 - i)),
      self: own,
    };
    const board = await client.read(new AbortController().signal);
    assert.equal(
      board.entries.some((item) => item.name === own.name),
      false,
    );
    assert.deepEqual(board.self, own);
    assert.deepEqual(readLeaderboardProfile(), { name: own.name, score: 500 });
    response = { ...empty, self: entry(own.name, 400) };
    await client.read(new AbortController().signal);
    assert.deepEqual(readLeaderboardProfile(), { name: own.name, score: 500 });
    response = { ...empty, self: entry(own.name, 700) };
    await client.read(new AbortController().signal);
    assert.deepEqual(readLeaderboardProfile(), { name: own.name, score: 700 });
    const before = storage.values.get(LEADERBOARD_PROFILE_KEY);
    response = { ...empty, self: entry('无效姓名', -1) };
    await assert.rejects(client.read(new AbortController().signal), LeaderboardError);
    assert.equal(storage.values.get(LEADERBOARD_PROFILE_KEY), before);
    response = { error: 'unavailable', self: entry('不应确认', 900) };
    status = 503;
    await assert.rejects(client.read(new AbortController().signal), LeaderboardError);
    assert.equal(storage.values.get(LEADERBOARD_PROFILE_KEY), before);
    status = 200;
    response = { ...empty, self: null };
    await client.read(new AbortController().signal);
    assert.equal(storage.values.get(LEADERBOARD_PROFILE_KEY), before);
    assert.equal(storage.values.get('qinglan-immortal-v1'), 'untouched-game-save');
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('超过自己的最高分须同时比较服务端self、同名榜上记录与本机确认分', () => {
  const own = entry('青岚客', 100);
  assert.equal(improvesLeaderboardProfile(empty, 0, null), true);
  assert.equal(improvesLeaderboardProfile(empty, 100, own), false);
  assert.equal(improvesLeaderboardProfile(empty, 101, own), true);
  const board = { ...empty, self: own, entries: [entry('青岚客', 300)] };
  assert.equal(improvesLeaderboardProfile(board, 300, own), false);
  assert.equal(improvesLeaderboardProfile(board, 301, own), true);
  assert.equal(
    improvesLeaderboardProfile({ ...empty, self: own }, 200, {
      name: '青岚客',
      score: 250,
    }),
    false,
  );
  assert.equal(
    improvesLeaderboardProfile({ ...empty, self: own }, 101, {
      name: '旧Cookie的另一人',
      score: 900,
    }),
    true,
    '服务端self优先，不能混用另一个已确认身份的分数',
  );
});
