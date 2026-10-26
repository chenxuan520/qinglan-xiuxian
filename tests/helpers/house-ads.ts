import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import type { HouseAdsWorkerEnv } from '../../workers/house-ads/index.ts';

// 仅供测试：真实 SQLite 执行同一份迁移/SQL；Access 私钥只在本进程内，不能用于线上认证。
export function adStore() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(
    readFileSync(
      new URL('../../workers/house-ads/migrations/0001_ad_config.sql', import.meta.url),
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
          if (failRead) throw Error('read fixture');
          return sqlite.prepare(sql).get(...args) ?? null;
        },
        async run() {
          if (failWrite) throw Error('write fixture');
          const result = sqlite.prepare(sql).run(...args);
          return { success: true, meta: { changes: Number(result.changes) } };
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
export async function adAccessFixture() {
  const keys = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  const key = {
    ...(await crypto.subtle.exportKey('jwk', keys.publicKey)),
    kid: 'test-key',
    alg: 'RS256',
  };
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return {
    publicKeys: { keys: [key] },
    async token(patch: Record<string, unknown> = {}, header: Record<string, unknown> = {}) {
      const now = Math.floor(Date.now() / 1000);
      const payload =
        encode({ alg: 'RS256', kid: 'test-key', ...header }) +
        '.' +
        encode({
          iss: 'https://review.cloudflareaccess.com',
          aud: ['test-audience'],
          email: 'owner@example.test',
          iat: now - 1,
          exp: now + 3600,
          ...patch,
        });
      const signature = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        keys.privateKey,
        new TextEncoder().encode(payload),
      );
      return payload + '.' + Buffer.from(signature).toString('base64url');
    },
  };
}
export function adEnv(
  store: ReturnType<typeof adStore>,
  origin = 'https://qinglan-ads.011203.xyz',
) {
  return {
    DB: store.db,
    ACCESS_TEAM_DOMAIN: 'review.cloudflareaccess.com',
    ACCESS_AUD: 'test-audience',
    ADMIN_EMAIL: 'owner@example.test',
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
