import { boundedAdJson } from '../../src/house-ad-contract.ts';
import { verifyAdLogin, type TurnstileEnv } from './turnstile.ts';

type AuthEnv = Pick<HouseAdsEnv, 'DB' | 'ADMIN_ORIGIN'> & TurnstileEnv;
const COOKIE = '__Host-qinglan-ad-session';
const SESSION_SECONDS = 8 * 60 * 60;
const hex = (bytes: ArrayBuffer | Uint8Array) =>
  Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
export const adRandomToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const digest = async (value: string) =>
  hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
async function passwordKey(password: string, salt: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 100_000, hash: 'SHA-256' },
    key,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    false,
    ['sign', 'verify'],
  );
}
const PASSWORD_CONTEXT = new TextEncoder().encode('qinglan-ad-admin-password-v1');
export async function hashAdPassword(password: string, salt: string): Promise<string> {
  return hex(await crypto.subtle.sign('HMAC', await passwordKey(password, salt), PASSWORD_CONTEXT));
}
const cookie = (value: string, seconds = SESSION_SECONDS) =>
  `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${seconds}`;
function sessionToken(request: Request) {
  const matches = (request.headers.get('Cookie') ?? '')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.startsWith(COOKIE + '='));
  const value = matches[0]?.slice(COOKIE.length + 1);
  return matches.length === 1 && /^[a-f0-9]{64}$/.test(value ?? '') ? value! : null;
}
export async function adAdminSession(
  request: Request,
  env: AuthEnv,
  now = Math.floor(Date.now() / 1000),
) {
  const token = sessionToken(request);
  if (!token) return null;
  const hash = await digest(token);
  return await env.DB.prepare(
    'SELECT s.token_hash FROM ad_sessions s JOIN ad_admin a ON a.id = 1 AND a.version = s.version WHERE s.token_hash = ? AND s.expires > ?',
  )
    .bind(hash, now)
    .first<{ token_hash: string }>();
}
type Admin = { username: string; salt: string; password_hash: string; version: number };
const passwordMatches = async (password: string, admin: Admin) => {
  if (!/^[a-f0-9]{64}$/.test(admin.password_hash)) return false;
  const expected = Uint8Array.from(admin.password_hash.match(/../g)!, (b) => parseInt(b, 16));
  return crypto.subtle.verify(
    'HMAC',
    await passwordKey(password, admin.salt),
    expected,
    PASSWORD_CONTEXT,
  );
};
const reply = (body: unknown, status = 200, sessionCookie?: string) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...(sessionCookie ? { 'Set-Cookie': sessionCookie } : {}),
    },
  });
async function reserveAttempt(request: Request, env: AuthEnv, now: number) {
  await env.DB.prepare('DELETE FROM ad_login_limits WHERE resets <= ?').bind(now).run();
  // 仅按可信地址散列保留失败/正在校验的名额，不设全局总额；成功与服务故障释放。
  const id = await digest(request.headers.get('CF-Connecting-IP') ?? 'unknown');
  const row = await env.DB.prepare(
    'INSERT INTO ad_login_limits (id, attempts, resets) VALUES (?, 1, ?) ON CONFLICT(id) DO UPDATE SET attempts=attempts+1 WHERE attempts<10 RETURNING resets',
  )
    .bind(id, now + 900)
    .first<{ resets: number }>();
  return row ? { id, resets: row.resets } : null;
}
export async function adAuthAction(
  request: Request,
  env: AuthEnv,
  verifyFetch: typeof fetch = fetch,
): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/^\/ads(?=\/)/, '');
  if (request.method !== 'POST') return reply({ message: '请在管理页面内操作。' }, 405);
  if (
    new URL(request.url).origin !== env.ADMIN_ORIGIN ||
    request.headers.get('Origin') !== env.ADMIN_ORIGIN ||
    request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json'
  )
    return reply({ message: '请在管理页面内操作。' }, 403);
  const now = Math.floor(Date.now() / 1000);
  let reservation: { id: string; resets: number } | null = null;
  let wrongCredentials = false;
  try {
    if (path === '/admin/logout') {
      const token = sessionToken(request);
      if (token)
        await env.DB.prepare('DELETE FROM ad_sessions WHERE token_hash = ?')
          .bind(await digest(token))
          .run();
      return reply({ ok: true }, 200, cookie('', 0));
    }
    const session = path === '/admin/password' ? await adAdminSession(request, env, now) : null;
    if (path === '/admin/password' && !session)
      return reply({ message: '登录已失效，请重新登录。' }, 401);
    let input: unknown;
    try {
      input = await boundedAdJson(request, path === '/admin/login' ? 4096 : 2048);
    } catch {
      return reply({ message: '请检查填写内容。' }, 400);
    }
    if (!input || typeof input !== 'object' || Array.isArray(input))
      return reply({ message: '请检查填写内容。' }, 400);
    const body = input as Record<string, unknown>;
    if (typeof body.password !== 'string' || !body.password.length || body.password.length > 128)
      return reply({ message: '请填写账号和密码。' }, 400);
    if (
      path === '/admin/login' &&
      (typeof body.username !== 'string' || body.username.length > 254)
    )
      return reply({ message: '请填写账号和密码。' }, 400);
    if (
      path === '/admin/password' &&
      (typeof body.newPassword !== 'string' ||
        body.newPassword.length < 12 ||
        body.newPassword.length > 128)
    )
      return reply({ message: '新密码请使用12至128个字符。' }, 400);
    if (path === '/admin/login') {
      const verification = await verifyAdLogin(
        request,
        env,
        body['cf-turnstile-response'],
        verifyFetch,
      );
      if (verification !== 'valid')
        return reply(
          {
            message:
              verification === 'invalid'
                ? '请重新完成人机验证。'
                : '人机验证暂不可用，请稍后重试。',
          },
          verification === 'invalid' ? 403 : 503,
        );
    }
    reservation = await reserveAttempt(request, env, now);
    if (!reservation) return reply({ message: '尝试次数过多，请15分钟后再试。' }, 429);
    const admin = await env.DB.prepare(
      'SELECT username, salt, password_hash, version FROM ad_admin WHERE id = 1',
    ).first<Admin>();
    if (!admin) return reply({ message: '管理账号尚未配置，请联系维护者。' }, 503);
    const correct = await passwordMatches(body.password, admin);
    if (
      !correct ||
      (path === '/admin/login' &&
        (body.username as string).trim().toLowerCase() !== admin.username.toLowerCase())
    ) {
      wrongCredentials = true;
      return reply(
        { message: path === '/admin/login' ? '账号或密码不正确。' : '当前密码不正确。' },
        401,
      );
    }
    if (path === '/admin/password') {
      const salt = adRandomToken();
      const result = await env.DB.prepare(
        'UPDATE ad_admin SET salt = ?, password_hash = ?, version = version + 1 WHERE id = 1 AND version = ? AND EXISTS (SELECT 1 FROM ad_sessions WHERE token_hash = ? AND expires > ?) RETURNING version',
      )
        .bind(
          salt,
          await hashAdPassword(body.newPassword as string, salt),
          admin.version,
          session!.token_hash,
          now,
        )
        .first<{ version: number }>();
      // D1 的 changes 包含触发器撤销的会话，不能拿它判断主更新是否成功。
      if (!result) return reply({ message: '登录状态已变化，请重新登录。' }, 409);
      return reply({ ok: true }, 200, cookie('', 0));
    }
    await env.DB.prepare('DELETE FROM ad_sessions WHERE expires <= ?').bind(now).run();
    const token = adRandomToken();
    const result = await env.DB.prepare(
      'INSERT INTO ad_sessions (token_hash, version, expires) SELECT ?, version, ? FROM ad_admin WHERE id = 1 AND version = ?',
    )
      .bind(await digest(token), now + SESSION_SECONDS, admin.version)
      .run();
    if (result.meta.changes !== 1) return reply({ message: '账号已更新，请重新登录。' }, 409);
    return reply({ ok: true }, 200, cookie(token));
  } catch {
    return reply({ message: '暂时无法完成操作，请稍后重试。' }, 503);
  } finally {
    if (reservation && !wrongCredentials) {
      try {
        await env.DB.prepare(
          'UPDATE ad_login_limits SET attempts=attempts-1 WHERE id=? AND resets=? AND attempts>0',
        )
          .bind(reservation.id, reservation.resets)
          .run();
      } catch {
        /* 释放失败时保守保留名额，最多原15分钟，不伪造认证成功。 */
      }
    }
  }
}
