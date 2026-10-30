import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../workers/leaderboard/index.ts';
import {
  leaderboardStore,
  leaderboardUrl,
  submitLeaderboard,
  anonymousCookie,
} from './helpers/leaderboard.ts';
import { extractLeaderboardFacts } from '../src/leaderboard-contract.ts';
import { freshSave } from '../src/progress.ts';

const origin = 'https://xiuxian.011203.xyz';
function fixture() {
  const store = leaderboardStore();
  let authenticated = true,
    fail = false,
    checks = 0;
  const env = {
    ...store.env,
    ADMIN_AUTH: {
      async fetch(request: Request) {
        checks++;
        assert.equal(request.url, origin + '/ads/admin/session');
        if (fail) throw Error('isolated auth transport failure');
        return Response.json({ ok: authenticated }, { status: authenticated ? 200 : 401 });
      },
    },
  };
  return {
    ...store,
    env,
    auth(value: boolean) {
      authenticated = value;
    },
    fail(value: boolean) {
      fail = value;
    },
    checks: () => checks,
  };
}
const ended = () => {
  const save = freshSave();
  save.pendingReincarnation = 'lifespan';
  return extractLeaderboardFacts(save)!;
};
const moderate = (
  name: string,
  action: string,
  updatedAt: string,
  score: number,
  headers: Record<string, string> = {},
) =>
  new Request(origin + '/leaderboard/admin/moderate', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ name, action, expectedUpdatedAt: updatedAt, expectedScore: score }),
  });
const entry = (name: string, hash = 'a'.repeat(64), score = 100) => [
  name.toLowerCase(),
  name,
  hash,
  score,
  '中下品',
  '初窥门径',
  'normal',
  'lifespan',
  'b'.repeat(64),
  '2026-10-29T00:00:00.000Z',
  '2026-10-29T00:00:00.000Z',
];
function seed(store: ReturnType<typeof fixture>, name: string, hash = 'a'.repeat(64), score = 100) {
  store.sqlite
    .prepare('INSERT INTO leaderboard VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(...entry(name, hash, score));
}

test('管理接口未登录、Bearer、跨站、认证故障均拒绝且不改榜单', async () => {
  const store = fixture();
  try {
    seed(store, 'Alice');
    const req = () => moderate('Alice', 'remove', '2026-10-29T00:00:00.000Z', 100);
    store.auth(false);
    assert.equal((await worker.fetch(req(), store.env)).status, 401);
    assert.equal(
      (await worker.fetch(new Request(origin + '/leaderboard/admin/entries'), store.env)).status,
      401,
    );
    store.auth(true);
    assert.equal(
      (
        await worker.fetch(
          moderate('Alice', 'remove', '2026-10-29T00:00:00.000Z', 100, {
            Origin: 'https://evil.example',
          }),
          store.env,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await worker.fetch(
          moderate('Alice', 'remove', '2026-10-29T00:00:00.000Z', 100, {
            Authorization: 'Bearer invalid-fixture',
          }),
          store.env,
        )
      ).status,
      403,
    );
    store.fail(true);
    assert.equal((await worker.fetch(req(), store.env)).status, 503);
    assert.equal(store.rows().length, 1);
  } finally {
    store.close();
  }
});

test('管理查询不泄露持有者散列，模糊查询将通配符视作字面量', async () => {
  const store = fixture();
  try {
    seed(store, 'Alice');
    seed(store, 'A_100%');
    const response = await worker.fetch(
      new Request(origin + '/leaderboard/admin/entries?q=' + encodeURIComponent('_100%')),
      store.env,
    );
    const value = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(
      value.entries.map((row: { name: string }) => row.name),
      ['A_100%'],
    );
    assert.equal(JSON.stringify(value).includes('owner_hash'), false);
    assert.equal(JSON.stringify(value).includes('submission_hash'), false);
    assert.equal(
      (await worker.fetch(new Request(origin + '/leaderboard/admin/entries?other=x'), store.env))
        .status,
      400,
    );
  } finally {
    store.close();
  }
});

test('删除核对分数和版本，冲突不删；删除后可重新提交', async () => {
  const store = fixture();
  try {
    seed(store, 'Alice');
    assert.equal(
      (await worker.fetch(moderate('Alice', 'remove', '2026-10-29T00:00:00.000Z', 101), store.env))
        .status,
      409,
    );
    assert.equal(store.rows().length, 1);
    assert.equal(
      (await worker.fetch(moderate('Alice', 'remove', '2026-10-29T00:00:00.000Z', 100), store.env))
        .status,
      200,
    );
    assert.equal(store.rows().length, 0);
    assert.equal(store.sqlite.prepare('SELECT COUNT(*) AS n FROM leaderboard_blocks').get()!.n, 0);
    const payload = { version: 1, name: 'Alice', facts: ended() };
    const cookie = await anonymousCookie(store, payload);
    assert.equal((await worker.fetch(submitLeaderboard(payload, cookie), store.env)).status, 200);
  } finally {
    store.close();
  }
});

test('屏蔽原子删除并阻止同名和同身份换名，解除后不恢复旧成绩', async () => {
  const store = fixture();
  try {
    const payload = { version: 1, name: 'Alice', facts: ended() };
    const cookie = await anonymousCookie(store, payload);
    const submit = await worker.fetch(submitLeaderboard(payload, cookie), store.env);
    const result = await submit.json();
    assert.equal(submit.status, 200);
    assert.equal(
      (
        await worker.fetch(
          moderate('Alice', 'block', result.entry.updatedAt, result.entry.score),
          store.env,
        )
      ).status,
      200,
    );
    assert.equal(store.rows().length, 0);
    const publicBoard = await (await worker.fetch(new Request(leaderboardUrl), store.env)).json();
    assert.deepEqual(publicBoard.entries, []);
    assert.equal((await worker.fetch(submitLeaderboard(payload, cookie), store.env)).status, 403);
    assert.equal(
      (await worker.fetch(submitLeaderboard({ ...payload, name: 'Other' }, cookie), store.env))
        .status,
      403,
    );
    const newCookie = await anonymousCookie(store, payload);
    assert.equal(
      (await worker.fetch(submitLeaderboard(payload, newCookie), store.env)).status,
      403,
    );
    const rows = await (
      await worker.fetch(new Request(origin + '/leaderboard/admin/entries'), store.env)
    ).json();
    assert.deepEqual(Object.keys(rows.blocked[0]).sort(), ['name', 'updatedAt']);
    assert.equal(
      (await worker.fetch(moderate('Alice', 'unblock', rows.blocked[0].updatedAt, 0), store.env))
        .status,
      200,
    );
    assert.equal(store.rows().length, 0);
    assert.equal((await worker.fetch(submitLeaderboard(payload, cookie), store.env)).status, 200);
  } finally {
    store.close();
  }
});

test('屏蔽事务写失败完全回滚，非JSON与过大正文不操作', async () => {
  const store = fixture();
  try {
    seed(store, 'Alice');
    store.failBatchAt(1);
    assert.equal(
      (await worker.fetch(moderate('Alice', 'block', '2026-10-29T00:00:00.000Z', 100), store.env))
        .status,
      503,
    );
    assert.equal(store.rows().length, 1);
    assert.equal(store.sqlite.prepare('SELECT COUNT(*) AS n FROM leaderboard_blocks').get()!.n, 0);
    assert.equal(
      (
        await worker.fetch(
          moderate('Alice', 'remove', '2026-10-29T00:00:00.000Z', 100, {
            'Content-Type': 'text/plain',
          }),
          store.env,
        )
      ).status,
      403,
    );
    const huge = new Request(origin + '/leaderboard/admin/moderate', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 'a'.repeat(3000) }),
    });
    assert.equal((await worker.fetch(huge, store.env)).status, 400);
    assert.equal(store.rows().length, 1);
  } finally {
    store.close();
  }
});
