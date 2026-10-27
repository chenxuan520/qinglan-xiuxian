import { boundedAdJson } from '../../src/house-ad-contract.ts';
import { adRandomToken, digest } from './auth.ts';

type Env = Pick<HouseAdsEnv, 'DB' | 'ADMIN_ORIGIN'>;
type KeyRow = { key_id: string; prefix: string; created_at: string };
export async function adAccessKeyIdentity(request: Request, env: Env): Promise<string | null> {
  const match = /^Bearer (qlak_[a-f0-9]{64})$/.exec(request.headers.get('Authorization') ?? '');
  if (!match) return null;
  const row = await env.DB.prepare(
    'SELECT k.key_id FROM ad_access_keys k JOIN ad_admin a ON a.id=1 AND a.version=k.version WHERE k.id=1 AND k.token_hash=?',
  )
    .bind(await digest(match[1]))
    .first<{ key_id: string }>();
  return row?.key_id ?? null;
}
export async function adAccessKeyAction(
  request: Request,
  env: Env,
  session: { token_hash: string },
): Promise<{ body: unknown; status: number }> {
  const metadata = (row: KeyRow | null) =>
    row
      ? {
          id: row.key_id,
          prefix: row.prefix,
          createdAt: row.created_at,
        }
      : null;
  if (request.method === 'GET') {
    const row = await env.DB.prepare(
      'SELECT k.key_id,k.prefix,k.created_at FROM ad_access_keys k JOIN ad_admin a ON a.id=1 AND a.version=k.version WHERE k.id=1',
    ).first<KeyRow>();
    return { body: { key: metadata(row) }, status: 200 };
  }
  if (request.method !== 'POST') return { body: { error: 'method-not-allowed' }, status: 405 };
  if (
    request.headers.get('Origin') !== env.ADMIN_ORIGIN ||
    request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json'
  )
    return { body: { error: 'request-denied', message: '请在管理页面内操作。' }, status: 403 };
  let input: unknown;
  try {
    input = await boundedAdJson(request, 256);
  } catch {
    input = null;
  }
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).sort().join(',') !== 'currentId,revoke' ||
    typeof (input as any).revoke !== 'boolean' ||
    !(
      (input as any).currentId === null ||
      (typeof (input as any).currentId === 'string' &&
        /^[a-f0-9-]{36}$/.test((input as any).currentId))
    )
  )
    return { body: { error: 'invalid-body', message: '请刷新密钥状态后重试。' }, status: 400 };
  const { currentId, revoke } = input as { currentId: string | null; revoke: boolean };
  const now = Math.floor(Date.now() / 1000);
  if (revoke) {
    const row = await env.DB.prepare(
      'DELETE FROM ad_access_keys WHERE id=1 AND key_id=? AND EXISTS (SELECT 1 FROM ad_sessions s JOIN ad_admin a ON a.id=1 AND a.version=s.version WHERE s.token_hash=? AND s.expires>?) RETURNING key_id',
    )
      .bind(currentId, session.token_hash, now)
      .first();
    return row
      ? { body: { key: null }, status: 200 }
      : {
          body: { error: 'conflict', message: '密钥或登录状态已变化，请刷新后重试。' },
          status: 409,
        };
  }
  const token = 'qlak_' + adRandomToken(),
    id = crypto.randomUUID(),
    createdAt = new Date().toISOString();
  const row = await env.DB.prepare(
    'INSERT INTO ad_access_keys (id,key_id,token_hash,prefix,created_at,version) SELECT 1,?,?,?,?,a.version FROM ad_admin a JOIN ad_sessions s ON s.version=a.version WHERE a.id=1 AND s.token_hash=? AND s.expires>? AND ((? IS NULL AND NOT EXISTS(SELECT 1 FROM ad_access_keys)) OR EXISTS(SELECT 1 FROM ad_access_keys WHERE key_id=?)) ON CONFLICT(id) DO UPDATE SET key_id=excluded.key_id,token_hash=excluded.token_hash,prefix=excluded.prefix,created_at=excluded.created_at,version=excluded.version RETURNING key_id,prefix,created_at',
  )
    .bind(
      id,
      await digest(token),
      token.slice(0, 13),
      createdAt,
      session.token_hash,
      now,
      currentId,
      currentId,
    )
    .first<KeyRow>();
  return row
    ? { body: { key: metadata(row), accessKey: token }, status: 200 }
    : { body: { error: 'conflict', message: '密钥或登录状态已变化，请刷新后重试。' }, status: 409 };
}
