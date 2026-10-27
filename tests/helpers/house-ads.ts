import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHouseAdsWorker } from '../../workers/house-ads/index.ts';
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
  sqlite.exec(
    readFileSync(
      new URL('../../workers/house-ads/migrations/0004_ad_load_diagnostics.sql', import.meta.url),
      'utf8',
    ),
  );
  sqlite.exec(
    readFileSync(
      new URL('../../workers/house-ads/migrations/0005_ad_access_key.sql', import.meta.url),
      'utf8',
    ),
  );
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
export const LOCAL_AD_CAPTCHA = 'local-synthetic-turnstile-response';
// 仅SQL/鉴权单测的外部验证依赖；正式Worker始终调用Cloudflare Siteverify。
export const localAdVerification: typeof fetch = async (_input, init) => {
  const body = new URLSearchParams(String(init?.body));
  return Response.json({
    success: body.get('response') === LOCAL_AD_CAPTCHA,
    hostname: 'xiuxian.011203.xyz',
    action: 'ad_admin_login',
  });
};
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
  const response = await adWorker.fetch(
    new Request(origin + '/ads/admin/login', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'owner@example.test',
        password: LOCAL_AD_PASSWORD,
        'cf-turnstile-response': LOCAL_AD_CAPTCHA,
      }),
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
    TURNSTILE_SITE_KEY: '0x4SyntheticLocalSiteKey',
    TURNSTILE_SECRET: 'synthetic-local-verifier-secret',
    ALLOWED_ORIGINS: 'https://xiuxian.011203.xyz,https://chenxuan520.github.io',
    AD_RECEIPT_LIMITER: {
      async limit() {
        return { success: true };
      },
    },
    AD_DIAGNOSTIC_LIMITER: {
      async limit() {
        return { success: true };
      },
    },
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

// 既有SQL/鉴权用例不访问公网；新图片校验另有HTTP成功/失败/重定向/超时用例。
const sqlWorker = createHouseAdsWorker(
  async () =>
    new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'Content-Type': 'image/png' } }),
  localAdVerification,
);
// 模块级SQL用例没有真实Cloudflare边缘，显式补合成地址和允许的频控绑定。
// 真实限流、缺地址、拒绝与异常由ad-receipt-rate-limit.test.ts及本地原生绑定验证。
export const adWorker = {
  fetch(request: Request, env: HouseAdsWorkerEnv) {
    const headers = new Headers(request.headers);
    if (!headers.has('CF-Connecting-IP')) headers.set('CF-Connecting-IP', '198.51.100.7');
    return sqlWorker.fetch(new Request(request, { headers }), env);
  },
};
