import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../../workers/house-ads/index.ts';
import { hashAdPassword } from '../../workers/house-ads/auth.ts';
import type { HouseAdsWorkerEnv } from '../../workers/house-ads/index.ts';

// 仅供测试：真实 SQLite 执行同一份迁移/SQL；账号和密码是本地合成夹具，不能用于线上认证。
export function adStore() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(
    readFileSync(
      new URL('../../workers/house-ads/migrations/0001_ad_config.sql', import.meta.url),
      'utf8',
    ),
  );
  sqlite.exec(
    readFileSync(
      new URL('../../workers/house-ads/migrations/0002_admin_login.sql', import.meta.url),
      'utf8',
    ),
  );
  sqlite.exec(
    readFileSync(
      new URL('../../workers/house-ads/migrations/0003_ad_platform.sql', import.meta.url),
      'utf8',
    ),
  );
  let failRead = false,
    failWrite = false;
  const db = {
    prepare(sql: string) {
      let args: Array<string | number> = [];
      const statement = {
        bind(...values: Array<string | number>) {
          args = values;
          return statement;
        },
        async first() {
          if (failRead || (failWrite && /^\s*(INSERT|UPDATE|DELETE)/i.test(sql)))
            throw Error('read/write fixture');
          return sqlite.prepare(sql).get(...args) ?? null;
        },
        async run() {
          if (failWrite) throw Error('write fixture');
          const changes = () => Number(sqlite.prepare('SELECT total_changes() AS n').get()!.n);
          const before = changes();
          sqlite.prepare(sql).run(...args);
          // D1 meta.changes 包含触发器的写入，不能只用 node:sqlite 的主语句 changes。
          return { success: true, meta: { changes: changes() - before } };
        },
        async all() {
          if (failRead) throw Error('read fixture');
          return { success: true, results: sqlite.prepare(sql).all(...args) };
        },
      };
      return statement;
    },
  };
  return {
    db,
    failures(read: boolean, write: boolean) {
      failRead = read;
      failWrite = write;
    },
    value() {
      return sqlite.prepare('SELECT * FROM ad_config WHERE id = 1').get();
    },
    close() {
      sqlite.close();
    },
  };
}
export const LOCAL_AD_PASSWORD = 'Local-only-password-1234';
export async function seedAdAdmin(
  store: ReturnType<typeof adStore>,
  username = 'owner@example.test',
  password = LOCAL_AD_PASSWORD,
) {
  const salt = 'local-test-salt-not-a-production-credential';
  await store.db
    .prepare('INSERT INTO ad_admin (id, username, salt, password_hash) VALUES (1, ?, ?, ?)')
    .bind(username, salt, await hashAdPassword(password, salt))
    .run();
}
export async function adSessionFixture(
  store: ReturnType<typeof adStore>,
  origin = 'https://xiuxian.011203.xyz',
) {
  await seedAdAdmin(store);
  const response = await worker.fetch(
    new Request(origin + '/ads/admin/login', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'owner@example.test', password: LOCAL_AD_PASSWORD }),
    }),
    adEnv(store, origin),
  );
  if (response.status !== 200) throw Error('local login fixture failed: ' + response.status);
  const cookie = response.headers.get('set-cookie')!.split(';')[0];
  return {
    async token() {
      return cookie;
    },
  };
}
export function adEnv(store: ReturnType<typeof adStore>, origin = 'https://xiuxian.011203.xyz') {
  return {
    DB: store.db,
    ADMIN_ORIGIN: origin,
    ALLOWED_ORIGINS: 'https://xiuxian.011203.xyz,https://chenxuan520.github.io',
  } as unknown as HouseAdsWorkerEnv;
}
export const exampleAd = {
  id: 'sample-campaign',
  name: '山河画卷',
  imageUrl: 'https://xiuxian.011203.xyz/assets/qinglan-prologue.webp',
  targetUrl: 'https://xiuxian.011203.xyz/novel/',
  enabled: true,
  placements: ['revive', 'reward-root', 'reward-supplies', 'lifespan'] as const,
};
