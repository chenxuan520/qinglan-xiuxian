import test from 'node:test';
import assert from 'node:assert/strict';
import { leaderboardAvailable } from '../src/leaderboard-availability.ts';
import {
  LeaderboardClient,
  LeaderboardError,
  canSubmitLeaderboardScore,
} from '../src/leaderboard-client.ts';
import { extractLeaderboardFacts, type LeaderboardEntry } from '../src/leaderboard-contract.ts';
import { freshSave } from '../src/progress.ts';

const origin = 'https://xiuxian.011203.xyz';
const entry: LeaderboardEntry = {
  name: '青岚客',
  score: 2500,
  grade: '帝品',
  title: '万古绝尘',
  lifeMode: 'normal',
  ending: 'immortal',
  updatedAt: '2026-10-30T00:00:00Z',
};
const empty = { version: 1, limit: 100, minimumScore: 0, entries: [] };
function facts() {
  const save = freshSave('dual', ['metal', 'earth'], 'dual', () => 0.5);
  save.completed = [0, 1, 2, 3, 4, 5, 6];
  return extractLeaderboardFacts(save)!;
}
const errorCode = (code: string) => (error: unknown) =>
  error instanceof LeaderboardError && error.code === code;

test('排行榜只准官网和精确本机同源预览，分发站点及非法来源零请求', async () => {
  for (const allowed of [
    origin,
    'http://localhost:5173',
    'https://127.0.0.1:5173',
    'http://[::1]:5173',
  ])
    assert.equal(leaderboardAvailable(allowed), true, allowed);
  for (const blocked of [
    '',
    'invalid',
    origin + '/path',
    'https://xiuxian.011203.xyz.evil.example',
    'http://xiuxian.011203.xyz',
    'https://chenxuan520.github.io',
    'https://preview.pages.dev',
    'file:///game/index.html',
    'ftp://localhost',
  ]) {
    let calls = 0;
    const client = new LeaderboardClient({
      origin: blocked,
      fetcher: async () => {
        calls++;
        return Response.json(empty);
      },
    });
    assert.equal(client.available(), false);
    await assert.rejects(client.read(new AbortController().signal), errorCode('unavailable'));
    await assert.rejects(
      client.submit(entry.name, facts(), new AbortController().signal),
      errorCode('unavailable'),
    );
    assert.equal(calls, 0, blocked);
  }
});

test('读榜使用相对同源接口和Cookie策略；不足百名及满榜分数边界明确', async () => {
  const client = new LeaderboardClient({
    origin: 'http://localhost:5173',
    fetcher: async (url, init) => {
      assert.equal(url, '/api/leaderboard');
      assert.equal(init?.credentials, 'same-origin');
      assert.equal(init?.redirect, 'error');
      assert.equal(init?.cache, 'no-store');
      assert.equal(init?.method, 'GET');
      assert.equal(init?.body, undefined);
      return Response.json(empty);
    },
  });
  const board = await client.read(new AbortController().signal);
  assert.equal(canSubmitLeaderboardScore(board, 0), true);
  assert.equal(canSubmitLeaderboardScore(board, -1), false);
  assert.equal(canSubmitLeaderboardScore(board, 0.5), false);
  const full = {
    ...board,
    minimumScore: 100,
    entries: Array.from({ length: 100 }, (_, i) => ({
      ...entry,
      name: `修士${i}`,
      score: 199 - i,
    })),
  };
  assert.equal(canSubmitLeaderboardScore(full, 100), false);
  assert.equal(canSubmitLeaderboardScore(full, 101), true);
});

test('首次428只按同一正文有界重试一次，服务端最高分unchanged原样保留', async () => {
  const bodies: unknown[] = [];
  const original = facts();
  const before = structuredClone(original);
  const client = new LeaderboardClient({
    origin,
    fetcher: async (_url, init) => {
      assert.equal(init?.method, 'POST');
      assert.equal(init?.credentials, 'same-origin');
      assert.equal(new Headers(init?.headers).get('Content-Type'), 'application/json');
      assert.equal(new Headers(init?.headers).has('Authorization'), false);
      bodies.push(init?.body);
      if (bodies.length === 1)
        return Response.json({ error: 'identity-required' }, { status: 428 });
      return Response.json({ version: 1, status: 'unchanged', entry });
    },
  });
  const result = await client.submit('  青岚客  ', original, new AbortController().signal);
  assert.equal(result.status, 'unchanged');
  assert.equal(result.entry.score, 2500);
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
  assert.deepEqual(JSON.parse(String(bodies[0])), { version: 1, name: '青岚客', facts: original });
  assert.deepEqual(original, before);
});

test('第二次身份拒绝、占名、限流和服务错误不循环重试；无效输入不发请求', async () => {
  for (const [status, code, expectedCalls] of [
    [428, 'identity-required', 2],
    [409, 'name-taken', 1],
    [429, 'rate-limited', 1],
    [409, 'not-qualified', 1],
    [503, 'unavailable', 1],
  ] as const) {
    let calls = 0;
    const client = new LeaderboardClient({
      origin,
      fetcher: async () => {
        calls++;
        return Response.json({ error: code }, { status });
      },
    });
    await assert.rejects(
      client.submit(entry.name, facts(), new AbortController().signal),
      errorCode(code),
    );
    assert.equal(calls, expectedCalls);
  }
  let calls = 0;
  const client = new LeaderboardClient({
    origin,
    fetcher: async () => {
      calls++;
      return Response.json(empty);
    },
  });
  for (const name of ['', '<script>', '名'.repeat(25), 'a\u0000b'])
    await assert.rejects(
      client.submit(name, facts(), new AbortController().signal),
      errorCode('invalid-input'),
    );
  const oversized = facts();
  oversized.artifacts = ['x'.repeat(20000)];
  await assert.rejects(
    client.submit(entry.name, oversized, new AbortController().signal),
    errorCode('invalid-input'),
  );
  assert.equal(calls, 0);
});

test('坏清单、HTML、超大正文、未知协议及非法成功响应拒绝使用', async () => {
  const responses = [
    () => Response.json({ ...empty, version: 2 }),
    () => Response.json({ ...empty, entries: [{ ...entry, score: -1 }] }),
    () => Response.json({ ...empty, entries: [entry, entry] }),
    () => Response.json({ ...empty, entries: [{ ...entry, score: 1 }, entry] }),
    () => new Response('<html>gateway</html>', { headers: { 'Content-Type': 'text/html' } }),
    () => new Response('{', { headers: { 'Content-Type': 'application/json' } }),
    () =>
      new Response('{}', {
        headers: { 'Content-Type': 'application/json', 'Content-Length': '65537' },
      }),
    () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(65537));
            controller.close();
          },
        }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
  ];
  for (const response of responses) {
    const client = new LeaderboardClient({ origin, fetcher: async () => response() });
    await assert.rejects(client.read(new AbortController().signal), errorCode('unavailable'));
  }
  const client = new LeaderboardClient({
    origin,
    fetcher: async () =>
      Response.json({ version: 1, status: 'saved', entry: { ...entry, score: NaN } }),
  });
  await assert.rejects(
    client.submit(entry.name, facts(), new AbortController().signal),
    errorCode('unavailable'),
  );
});

test('整次操作超时包含读正文与身份重发，取消后不再发送第二轮', async () => {
  const stalled = new LeaderboardClient({
    origin,
    timeoutMs: 10,
    fetcher: async () => new Promise(() => {}),
  });
  await assert.rejects(stalled.read(new AbortController().signal), errorCode('timeout'));
  let bodyCancelled = 0;
  const body = new LeaderboardClient({
    origin,
    timeoutMs: 10,
    fetcher: async () =>
      new Response(
        new ReadableStream({
          start() {},
          cancel() {
            bodyCancelled++;
          },
        }),
        {
          headers: { 'Content-Type': 'application/json' },
        },
      ),
  });
  await assert.rejects(body.read(new AbortController().signal), errorCode('timeout'));
  assert.equal(bodyCancelled, 1);
  const signal = new AbortController();
  let calls = 0;
  const cancelled = new LeaderboardClient({
    origin,
    fetcher: async () => {
      calls++;
      signal.abort();
      return Response.json({ error: 'identity-required' }, { status: 428 });
    },
  });
  await assert.rejects(
    cancelled.submit(entry.name, facts(), signal.signal),
    errorCode('cancelled'),
  );
  assert.equal(calls, 1);
  const already = new AbortController();
  already.abort();
  await assert.rejects(cancelled.read(already.signal), errorCode('cancelled'));
  assert.equal(calls, 1);
});

test('关闭开关后客户端零查询与上传，身份握手中关闭也不重发', async () => {
  let enabled = false,
    calls = 0;
  const client = new LeaderboardClient({
    origin,
    enabled: () => enabled,
    fetcher: async () => {
      calls++;
      enabled = false;
      return Response.json({ error: 'identity-required' }, { status: 428 });
    },
  });
  await assert.rejects(client.read(new AbortController().signal), errorCode('unavailable'));
  await assert.rejects(
    client.submit(entry.name, facts(), new AbortController().signal),
    errorCode('unavailable'),
  );
  assert.equal(calls, 0);
  enabled = true;
  await assert.rejects(
    client.submit(entry.name, facts(), new AbortController().signal),
    errorCode('cancelled'),
  );
  assert.equal(calls, 1);
});
