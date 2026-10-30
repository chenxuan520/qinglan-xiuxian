import { createHash } from 'node:crypto';
import { factsSealInput, FACTS_VERSION } from '../../src/leaderboard-integrity.ts';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker, { type LeaderboardWorkerEnv } from '../../workers/leaderboard/index.ts';

// Real SQLite runs the production migration and queries; only the D1 transport is synthetic.
export function leaderboardStore() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(
    readFileSync(
      new URL('../../workers/leaderboard/migrations/0001_leaderboard.sql', import.meta.url),
      'utf8',
    ),
  );
  sqlite.exec(
    readFileSync(
      new URL('../../workers/leaderboard/migrations/0002_moderation.sql', import.meta.url),
      'utf8',
    ),
  );
  const statements = new WeakMap<object, () => unknown[]>();
  let failAt = -1;
  const db = {
    prepare(sql: string) {
      let args: Array<string | number> = [];
      const statement = {
        bind(...values: Array<string | number>) {
          args = values;
          return statement;
        },
        async all() {
          return { success: true, results: sqlite.prepare(sql).all(...args) };
        },
      };
      statements.set(statement, () => sqlite.prepare(sql).all(...args));
      return statement;
    },
    async batch(queries: object[]) {
      sqlite.exec('BEGIN');
      try {
        const results = queries.map((q, i) => {
          if (i === failAt) throw Error('local database failure fixture');
          return { success: true, results: statements.get(q)!() };
        });
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  const limiter = {
    calls: [] as string[],
    allowed: true,
    async limit({ key }: { key: string }) {
      this.calls.push(key);
      return { success: this.allowed };
    },
  };
  return {
    sqlite,
    limiter,
    env: { DB: db, SUBMIT_LIMITER: limiter } as LeaderboardWorkerEnv,
    failBatchAt(index: number) {
      failAt = index;
    },
    rows() {
      return sqlite.prepare('SELECT * FROM leaderboard').all();
    },
    close() {
      sqlite.close();
    },
  };
}
export const leaderboardUrl = 'https://xiuxian.011203.xyz/api/leaderboard';
export function submitLeaderboard(
  body: unknown,
  cookie?: string,
  headers: Record<string, string> = {},
) {
  // 旧有事务测试统一构造有效摘要；刻意传seal:null仍保留给拒绝用例。
  const payload = JSON.parse(JSON.stringify(body));
  if (
    payload &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    Object.hasOwn(payload, 'facts') &&
    !Object.hasOwn(payload, 'seal')
  ) {
    try {
      payload.seal = {
        v: FACTS_VERSION,
        h: createHash('sha256').update(factsSealInput(payload.facts)).digest('hex'),
      };
    } catch {
      payload.seal = null;
    }
  }
  return new Request(leaderboardUrl, {
    method: 'POST',
    headers: {
      Origin: 'https://xiuxian.011203.xyz',
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '192.0.2.19',
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: JSON.stringify(payload),
  });
}
export async function anonymousCookie(store: ReturnType<typeof leaderboardStore>, body: unknown) {
  const response = await worker.fetch(submitLeaderboard(body), store.env);
  if (response.status !== 428) throw Error('anonymous identity fixture failed: ' + response.status);
  return response.headers.get('set-cookie')!.split(';')[0];
}
