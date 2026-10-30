import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { OWNER_COOKIE } from '../workers/leaderboard/index.ts';
import { parseLeaderboardFacts, scoreLeaderboardFacts } from '../workers/leaderboard/score.ts';
import {
  extractLeaderboardFacts,
  LEADERBOARD_ACHIEVEMENTS,
  isLeaderboardBoard,
  isLeaderboardResult,
  normalizeLeaderboardName,
} from '../src/leaderboard-contract.ts';
import { freshSave, IMMORTAL_CULTIVATION } from '../src/progress.ts';
import { ACHIEVEMENT_IDS } from '../src/chronicle.ts';
import { CURIO_IDS } from '../src/curio-data.ts';
import { SECTS } from '../src/mortal-data.ts';
import { SPIRIT_ROOTS, rootElementsFor, FINAL_TRIAL_STAGE } from '../src/data.ts';
import { journeyScore } from '../src/journey-score.ts';
import {
  leaderboardStore,
  leaderboardUrl,
  submitLeaderboard,
  anonymousCookie,
} from './helpers/leaderboard.ts';

function endingSave() {
  const save = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  save.age = 100;
  save.pendingReincarnation = 'lifespan';
  return save;
}
const body = (save = endingSave(), name = '青岚客') => ({
  version: 1,
  name,
  facts: extractLeaderboardFacts(save)!,
});

test('排行榜契约只提取计分事实；成仙前未结束不上传，通终关无需结束此世', () => {
  const save = freshSave();
  assert.equal(extractLeaderboardFacts(save), null);
  save.completed = [FINAL_TRIAL_STAGE];
  save.age = 35778;
  save.cultivation = IMMORTAL_CULTIVATION;
  const snapshot = JSON.stringify(save);
  const facts = extractLeaderboardFacts(save)!;
  assert.equal(facts.ending, 'immortal');
  assert.ok(parseLeaderboardFacts(facts));
  assert.equal(JSON.stringify(save), snapshot);
  for (const key of [
    'chronicle',
    'mortal',
    'medicine',
    'chat',
    'entries',
    'seed',
    'stones',
    'resume',
  ])
    assert.ok(!Object.hasOwn(facts, key));
  assert.deepEqual(LEADERBOARD_ACHIEVEMENTS, ACHIEVEMENT_IDS);
});

test('后端使用真实道果公式重算，涵盖全部灵根、极限、根基、奇物、宗门、丹药和历史成就', () => {
  for (const root of SPIRIT_ROOTS)
    for (const lifeMode of ['normal', 'extreme'] as const) {
      const save = freshSave(
        root.id,
        rootElementsFor(root.id, [], () => 0.5),
        'orthodox',
        () => 0.5,
      );
      save.lifeMode = lifeMode;
      save.cultivation = IMMORTAL_CULTIVATION;
      save.completed = [0, 1, 2, 3, 4, 5, 6];
      save.age = 35778;
      save.training = { vitality: 20, power: 20, speed: 20 };
      save.retreatBonus = { vitality: 37, power: 29, speed: 13 };
      save.forge[save.starter] = 10;
      save.tribulations = 5;
      save.curios.bag = Object.fromEntries(CURIO_IDS.map((id) => [id, 1]));
      save.curios.acquired = [...CURIO_IDS];
      save.medicine.used.peiying = 3;
      save.medicine.active.wuchang = save.age + 100;
      save.mortal.member = { id: SECTS[0].id, dueAt: save.age + 100, dues: 0 };
      save.mortal.mastery[SECTS[0].id] = 10;
      save.chronicle.milestones = Object.fromEntries(
        ACHIEVEMENT_IDS.filter((id) => id !== 'one-life-clear' || lifeMode === 'extreme').map(
          (id) => [id, 20],
        ),
      );
      save.adUsage = { root: 1, revive: 2, lifespan: 3, supplies: 4, bestRoot: 'heaven' };
      for (const inherited of [false, true]) {
        if (inherited) save.chronicle.milestones['birth-inheritance'] = 15;
        const before = JSON.stringify(save);
        const facts = parseLeaderboardFacts(extractLeaderboardFacts(save));
        assert.ok(facts, root.id + ' ' + lifeMode);
        assert.deepEqual(scoreLeaderboardFacts(facts), journeyScore(save));
        assert.equal(JSON.stringify(save), before);
      }
    }
});

test('拒绝明显矛盾、未知字段和不合理计分事实，不把事实检查声称为真实游玩证明', () => {
  const original = body().facts;
  const bad: unknown[] = [
    { ...original, cultivation: -1 },
    { ...original, cultivation: 1.2 },
    { ...original, cultivation: 1e99 },
    { ...original, age: Infinity },
    { ...original, completed: [0, 0] },
    { ...original, completed: [7] },
    { ...original, rootElements: [] },
    { ...original, training: { ...original.training, power: 21 } },
    { ...original, peiyingUsed: 4 },
    { ...original, curios: [CURIO_IDS[0]], acquiredCurios: [] },
    { ...original, ending: 'immortal' },
    { ...original, ending: 'extreme' },
    { ...original, achievements: ['peerless'] },
    { ...original, achievements: ['forge'] },
    { ...original, achievements: ['training-master'] },
    { ...original, achievements: ['mastery'] },
    { ...original, achievements: ['five-tribulations'] },
    { ...original, adUsage: { ...original.adUsage, root: -1 } },
    { ...original, total: 999999 },
    { ...original, forge: { unknown: 10 } },
    { ...original, starter: 'unknown' },
    { ...original, mastery: { unknown: 10 } },
  ];
  for (const facts of bad) assert.equal(parseLeaderboardFacts(facts), null);
  const historical = {
    ...original,
    achievements: [
      'collection',
      'level-100',
      'six-immortals',
      'story',
      'three-paths',
      'permanent-medicine',
    ],
  };
  assert.ok(
    parseLeaderboardFacts(historical),
    'historical achievements survive selling items and changing roots',
  );
});

test('署名标准化统一大小写和全角，不接受控制字符、HTML及超长姓名', () => {
  assert.deepEqual(normalizeLeaderboardName('　ＡＢＣ  青岚　'), {
    name: 'ABC 青岚',
    key: 'abc 青岚',
  });
  for (const value of [null, '', '<script>', 'a\u0000b', 'a\u200bb', '仙'.repeat(25)])
    assert.equal(normalizeLeaderboardName(value), null);
});

test('首次匿名握手只设置安全cookie且不占名；同正文第二次才写入，公榜无身份泄漏', async () => {
  const store = leaderboardStore();
  try {
    const payload = body();
    const first = await worker.fetch(submitLeaderboard(payload), store.env);
    assert.equal(first.status, 428);
    assert.equal((await first.json()).error, 'identity-required');
    const cookie = first.headers.get('set-cookie')!;
    assert.match(cookie, new RegExp('^' + OWNER_COOKIE + '=[a-f0-9]{64};'));
    for (const flag of ['Path=/', 'Secure', 'HttpOnly', 'SameSite=Strict', 'Max-Age=31536000'])
      assert.ok(cookie.includes(flag));
    assert.equal(store.rows().length, 0);
    const second = await worker.fetch(submitLeaderboard(payload, cookie.split(';')[0]), store.env);
    assert.equal(second.status, 200);
    const result = await second.json();
    assert.ok(isLeaderboardResult(result));
    assert.equal(result.status, 'saved');
    assert.equal(result.entry.score, journeyScore(endingSave()).total);
    const raw = store.rows()[0];
    assert.notEqual(raw.owner_hash, cookie.split('=')[1].split(';')[0]);
    assert.equal(String(raw.owner_hash).length, 64);
    const get = await worker.fetch(new Request(leaderboardUrl), store.env);
    assert.equal(get.headers.get('set-cookie'), null);
    assert.match(get.headers.get('cache-control')!, /max-age=30/);
    const text = await get.text();
    assert.ok(
      !text.includes(String(raw.owner_hash)) &&
        !text.includes('submission_hash') &&
        !text.includes('Cookie'),
    );
    const board = JSON.parse(text);
    assert.ok(isLeaderboardBoard(board));
    assert.equal(board.minimumScore, 0);
    assert.equal(store.limiter.calls[0].length, 64);
    assert.ok(!store.limiter.calls[0].includes('192.0.2.19'));
  } finally {
    store.close();
  }
});

test('同浏览器只保留最高分，重复重试幂等；另一浏览器和清cookie后都不能认领已占名', async () => {
  const store = leaderboardStore();
  try {
    const payload = body();
    const cookie = await anonymousCookie(store, payload);
    const saved = await (await worker.fetch(submitLeaderboard(payload, cookie), store.env)).json();
    const retry = await (await worker.fetch(submitLeaderboard(payload, cookie), store.env)).json();
    assert.equal(retry.status, 'unchanged');
    assert.deepEqual(retry.entry, saved.entry);
    const high = endingSave();
    high.cultivation = 200000;
    high.completed = [0, 1, 2, 3, 4, 5];
    high.age = 35778;
    high.training.power = 20;
    const higher = await (
      await worker.fetch(submitLeaderboard(body(high), cookie), store.env)
    ).json();
    assert.equal(higher.status, 'saved');
    assert.ok(higher.entry.score > saved.entry.score);
    const lower = await (await worker.fetch(submitLeaderboard(payload, cookie), store.env)).json();
    assert.equal(lower.status, 'unchanged');
    assert.deepEqual(lower.entry, higher.entry);
    const stranger = await anonymousCookie(store, body(high));
    const conflict = await worker.fetch(submitLeaderboard(body(high), stranger), store.env);
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json()).error, 'name-taken');
    assert.deepEqual(store.rows().length, 1);
    const noCookies = await worker.fetch(submitLeaderboard(body(high)), store.env);
    assert.equal(noCookies.status, 428);
    assert.equal(store.rows().length, 1);
  } finally {
    store.close();
  }
});

test('标准化同名争抢只有一人成功，SQL参数不允许姓名注入', async () => {
  const store = leaderboardStore();
  try {
    const a = body(endingSave(), 'Ａlice'),
      b = body(endingSave(), 'alice');
    const ca = await anonymousCookie(store, a),
      cb = await anonymousCookie(store, b);
    const results = await Promise.all([
      worker.fetch(submitLeaderboard(a, ca), store.env),
      worker.fetch(submitLeaderboard(b, cb), store.env),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    const injection = body(endingSave(), "a'); DROP TABLE x;--");
    const ci = await anonymousCookie(store, injection);
    assert.equal((await worker.fetch(submitLeaderboard(injection, ci), store.env)).status, 200);
    assert.equal(store.rows().length, 2);
  } finally {
    store.close();
  }
});

test('D1批次任何一步失败都回滚，不留下首次占名或半更新', async () => {
  const store = leaderboardStore();
  try {
    const payload = body(),
      cookie = await anonymousCookie(store, payload);
    store.failBatchAt(1);
    assert.equal((await worker.fetch(submitLeaderboard(payload, cookie), store.env)).status, 503);
    assert.equal(store.rows().length, 0);
    store.failBatchAt(-1);
    assert.equal((await worker.fetch(submitLeaderboard(payload, cookie), store.env)).status, 200);
    const before = store.rows();
    const high = endingSave();
    high.training.power = 20;
    store.failBatchAt(1);
    assert.equal(
      (await worker.fetch(submitLeaderboard(body(high), cookie), store.env)).status,
      503,
    );
    assert.deepEqual(store.rows(), before);
  } finally {
    store.close();
  }
});

test('请求边界、JSON流字节上限和频控拒绝仅影响排行榜且不创建任何记录', async () => {
  const store = leaderboardStore();
  try {
    const payload = body();
    for (const headers of [
      { Origin: 'https://evil.example' },
      { 'Content-Type': 'text/plain' },
      { 'CF-Connecting-IP': '' },
    ]) {
      assert.ok(
        (await worker.fetch(submitLeaderboard(payload, undefined, headers), store.env)).status >=
          400,
      );
    }
    assert.equal(
      (await worker.fetch(submitLeaderboard({ ...payload, extra: 1 }), store.env)).status,
      400,
    );
    assert.equal(
      (await worker.fetch(submitLeaderboard({ ...payload, name: '青'.repeat(6000) }), store.env))
        .status,
      400,
    );
    const malformed = new Request(leaderboardUrl, {
      method: 'POST',
      headers: {
        Origin: 'https://xiuxian.011203.xyz',
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '192.0.2.19',
      },
      body: Uint8Array.from([0xff, 0xfe]),
    });
    assert.equal((await worker.fetch(malformed, store.env)).status, 400);
    store.limiter.allowed = false;
    const limited = await worker.fetch(submitLeaderboard(payload), store.env);
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('retry-after'), '60');
    assert.equal(
      (await worker.fetch(new Request(leaderboardUrl, { method: 'DELETE' }), store.env)).status,
      405,
    );
    assert.equal(
      (await worker.fetch(new Request('https://evil.example/api/leaderboard'), store.env)).status,
      404,
    );
    assert.equal(store.rows().length, 0);
    assert.equal(
      (await worker.fetch(new Request(leaderboardUrl), store.env)).status,
      200,
      'reads need no identity or rate allowance',
    );
  } finally {
    store.close();
  }
});

test('前100榜单有稳定排序和真实门槛，查询使用排名索引', async () => {
  const store = leaderboardStore();
  try {
    const statement = store.sqlite.prepare(
      `INSERT INTO leaderboard VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (let i = 0; i < 103; i++)
      statement.run(
        'player' + i,
        '修士' + i,
        'a'.repeat(64),
        i,
        '下品',
        '凡尘初涉',
        'normal',
        'lifespan',
        'b'.repeat(64),
        '2026-10-29T00:00:00.000Z',
        '2026-10-29T00:00:00.000Z',
      );
    const board = await (await worker.fetch(new Request(leaderboardUrl), store.env)).json();
    assert.ok(isLeaderboardBoard(board));
    assert.equal(board.entries.length, 100);
    assert.equal(board.entries[0].score, 102);
    assert.equal(board.minimumScore, 3);
    const plan = store.sqlite
      .prepare(
        'EXPLAIN QUERY PLAN SELECT display_name, score FROM leaderboard ORDER BY score DESC, updated_at ASC, name_key ASC LIMIT 100',
      )
      .all();
    assert.ok(plan.some((row) => String(row.detail).includes('leaderboard_ranking')));
  } finally {
    store.close();
  }
});

test('POST原子复核过时GET门槛：不够当前前百不占名、同分不挤榜，历史低分不假报成功', async () => {
  const store = leaderboardStore();
  try {
    const payload = body(),
      score = journeyScore(endingSave()).total;
    const cookie = await anonymousCookie(store, payload);
    const oldBoard = await (await worker.fetch(new Request(leaderboardUrl), store.env)).json();
    assert.equal(oldBoard.minimumScore, 0);
    const seed = store.sqlite.prepare(
      'INSERT INTO leaderboard VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    const stamp = '2026-10-29T00:00:00.000Z';
    for (let i = 0; i < 100; i++)
      seed.run(
        'seed' + i,
        '先行' + i,
        'a'.repeat(64),
        score,
        '下品',
        '凡尘初涉',
        'normal',
        'lifespan',
        'b'.repeat(64),
        stamp,
        stamp,
      );
    const rejected = await worker.fetch(submitLeaderboard(payload, cookie), store.env);
    assert.equal(rejected.status, 409);
    assert.equal((await rejected.json()).error, 'not-qualified');
    assert.equal(store.rows().length, 100, 'rejected score does not claim a name');
    const high = endingSave();
    high.cultivation = IMMORTAL_CULTIVATION;
    high.completed = [0, 1, 2, 3, 4, 5, 6];
    high.age = 35778;
    high.pendingReincarnation = null;
    const accepted = await worker.fetch(submitLeaderboard(body(high), cookie), store.env);
    assert.equal(accepted.status, 200);
    const saved = await accepted.json();
    const after = await (await worker.fetch(new Request(leaderboardUrl), store.env)).json();
    assert.ok(
      after.entries.some(
        (e: { name: string; score: number }) =>
          e.name === saved.entry.name && e.score === saved.entry.score,
      ),
    );
    store.sqlite
      .prepare('UPDATE leaderboard SET score=? WHERE name_key<>?')
      .run(saved.entry.score + 1, '青岚客');
    const fallen = await worker.fetch(submitLeaderboard(payload, cookie), store.env);
    assert.equal(fallen.status, 409);
    assert.equal(
      (await fallen.json()).error,
      'not-qualified',
      'a historical best outside top100 is not a successful listing',
    );
  } finally {
    store.close();
  }
});

test('并发争夺第100名在同一事务按实时门槛判定，仅一位同分新姓名入榜', async () => {
  const store = leaderboardStore();
  try {
    const a = body(endingSave(), '后来甲'),
      b = body(endingSave(), '后来乙');
    const ca = await anonymousCookie(store, a),
      cb = await anonymousCookie(store, b);
    const score = journeyScore(endingSave()).total;
    const seed = store.sqlite.prepare(
      'INSERT INTO leaderboard VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    const stamp = '2026-10-29T00:00:00.000Z';
    for (let i = 0; i < 100; i++)
      seed.run(
        'seed' + i,
        '先行' + i,
        'a'.repeat(64),
        i < 99 ? score + 1 : score - 1,
        '下品',
        '凡尘初涉',
        'normal',
        'lifespan',
        'b'.repeat(64),
        stamp,
        stamp,
      );
    const results = await Promise.all([
      worker.fetch(submitLeaderboard(a, ca), store.env),
      worker.fetch(submitLeaderboard(b, cb), store.env),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    const failed = await results.find((r) => r.status === 409)!.json();
    assert.equal(failed.error, 'not-qualified');
    const board = await (await worker.fetch(new Request(leaderboardUrl), store.env)).json();
    assert.equal(
      board.entries.filter((e: { name: string }) => ['后来甲', '后来乙'].includes(e.name)).length,
      1,
    );
  } finally {
    store.close();
  }
});

test('公开榜单边缘缓存30秒，共享读取不附带身份且缓存故障可降级直接读库', async () => {
  const store = leaderboardStore(),
    previous = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  const responses = new Map<string, Response>(),
    pending: Promise<unknown>[] = [];
  const ctx = {
    waitUntil(promise: Promise<unknown>) {
      pending.push(promise);
    },
  };
  try {
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: {
        default: {
          async match(request: Request) {
            return responses.get(request.url)?.clone();
          },
          async put(request: Request, response: Response) {
            responses.set(request.url, response);
          },
        },
      },
    });
    const first = await worker.fetch(
      new Request(leaderboardUrl, { headers: { Cookie: OWNER_COOKIE + '=' + 'a'.repeat(64) } }),
      store.env,
      ctx,
    );
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('set-cookie'), null);
    await Promise.all(pending);
    assert.equal(responses.size, 1);
    store.sqlite.exec('DROP TABLE leaderboard');
    const cached = await worker.fetch(new Request(leaderboardUrl), store.env, ctx);
    assert.equal(cached.status, 200);
    assert.ok(isLeaderboardBoard(await cached.json()));
  } finally {
    if (previous) Object.defineProperty(globalThis, 'caches', previous);
    else Reflect.deleteProperty(globalThis, 'caches');
    store.close();
  }
  const fallback = leaderboardStore();
  try {
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: {
        default: {
          async match() {
            throw Error('local cache failure');
          },
          async put() {
            throw Error('local cache failure');
          },
        },
      },
    });
    const response = await worker.fetch(new Request(leaderboardUrl), fallback.env, ctx);
    assert.equal(response.status, 200);
    await Promise.all(pending);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'caches', previous);
    else Reflect.deleteProperty(globalThis, 'caches');
    fallback.close();
  }
});
