import { normalizeLeaderboardName } from '../../src/leaderboard-contract.ts';

type AdminEnv = Pick<LeaderboardEnv, 'DB'> & Partial<Pick<LeaderboardEnv, 'ADMIN_AUTH'>>;
const ORIGIN = 'https://xiuxian.011203.xyz';
const PREFIX = '/leaderboard/admin/';
const reply = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });

// 只把浏览器会话交给既有管理服务核验，不读取账号、密码或广告配置。
export async function leaderboardAdminSession(request: Request, env: AdminEnv) {
  if (request.headers.has('Authorization')) return 403;
  if (!env.ADMIN_AUTH) return 503;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await env.ADMIN_AUTH.fetch(
      new Request(ORIGIN + '/ads/admin/session', {
        headers: { Cookie: request.headers.get('Cookie') ?? '' },
        signal: controller.signal,
        redirect: 'error',
      }),
    );
    void response.body?.cancel().catch(() => {});
    return response.status === 200 ? 200 : response.status === 401 ? 401 : 503;
  } catch {
    return 503;
  } finally {
    clearTimeout(timer);
  }
}

async function body(request: Request): Promise<Record<string, unknown>> {
  if (!request.body) throw Error('invalid');
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });
  let bytes = 0,
    text = '';
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 2048) throw Error('invalid');
      text += decoder.decode(part.value, { stream: true });
    }
    const value: unknown = JSON.parse(text + decoder.decode());
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('invalid');
    return value as Record<string, unknown>;
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export async function leaderboardAdminApi(
  request: Request,
  env: AdminEnv,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(PREFIX)) return null;
  const path = url.pathname.slice(PREFIX.length);
  if (!['entries', 'moderate'].includes(path)) return null;
  if (
    (path === 'entries' && request.method !== 'GET') ||
    (path === 'moderate' && request.method !== 'POST')
  )
    return reply({ error: 'method-not-allowed' }, 405);
  if (
    request.method === 'POST' &&
    (request.headers.get('Origin') !== ORIGIN ||
      !/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') ?? '') ||
      url.search)
  )
    return reply({ error: 'origin-denied' }, 403);
  if (request.headers.has('Origin') && request.headers.get('Origin') !== ORIGIN)
    return reply({ error: 'origin-denied' }, 403);
  const authenticated = await leaderboardAdminSession(request, env);
  if (authenticated !== 200)
    return reply(
      { error: authenticated === 401 ? 'login-required' : 'unavailable' },
      authenticated,
    );
  try {
    if (path === 'entries') {
      const query = url.searchParams.get('q') ?? '';
      if ([...url.searchParams.keys()].some((key) => key !== 'q') || [...query].length > 24)
        return reply({ error: 'invalid-input' }, 400);
      const pattern =
        '%' +
        query
          .normalize('NFKC')
          .toLowerCase()
          .replace(/[\\%_]/g, '\\$&') +
        '%';
      const rows = await env.DB.batch([
        env.DB.prepare(
          `SELECT display_name AS name, score, grade, title, life_mode AS lifeMode,
          ending, updated_at AS updatedAt FROM leaderboard WHERE name_key LIKE ? ESCAPE '\\'
          ORDER BY score DESC, updated_at ASC, name_key ASC LIMIT 100`,
        ).bind(pattern),
        env.DB.prepare(
          `SELECT display_name AS name, blocked_at AS updatedAt FROM leaderboard_blocks
          WHERE name_key LIKE ? ESCAPE '\\' ORDER BY blocked_at DESC, name_key ASC LIMIT 100`,
        ).bind(pattern),
      ]);
      if (rows.some((row) => !row.success)) throw Error('database');
      return reply({ entries: rows[0].results, blocked: rows[1].results });
    }
    let input: Record<string, unknown>;
    try {
      input = await body(request);
    } catch {
      return reply({ error: 'invalid-input' }, 400);
    }
    const name = normalizeLeaderboardName(input.name);
    if (
      !name ||
      Object.keys(input).length !== 4 ||
      !['remove', 'block', 'unblock'].includes(String(input.action)) ||
      typeof input.expectedUpdatedAt !== 'string' ||
      !Number.isFinite(Date.parse(input.expectedUpdatedAt)) ||
      !Number.isSafeInteger(input.expectedScore) ||
      Number(input.expectedScore) < 0
    )
      return reply({ error: 'invalid-input' }, 400);
    // 读取正文后再次核验，失效会话与迟到请求不能继续管理。
    const current = await leaderboardAdminSession(request, env);
    if (current !== 200)
      return reply({ error: current === 401 ? 'login-required' : 'unavailable' }, current);
    const guard = [name.key, input.expectedUpdatedAt, input.expectedScore];
    const now = new Date().toISOString();
    const queries =
      input.action === 'unblock'
        ? [
            env.DB.prepare(
              'DELETE FROM leaderboard_blocks WHERE name_key=? AND blocked_at=? RETURNING name_key',
            ).bind(name.key, input.expectedUpdatedAt),
          ]
        : input.action === 'remove'
          ? [
              env.DB.prepare(
                'DELETE FROM leaderboard WHERE name_key=? AND updated_at=? AND score=? RETURNING name_key',
              ).bind(...guard),
            ]
          : [
              env.DB.prepare(
                `INSERT INTO leaderboard_blocks (name_key, display_name, owner_hash, blocked_at)
            SELECT name_key, display_name, owner_hash, ? FROM leaderboard
            WHERE name_key=? AND updated_at=? AND score=? RETURNING name_key`,
              ).bind(now, ...guard),
              env.DB.prepare(
                `DELETE FROM leaderboard WHERE name_key=? AND updated_at=? AND score=?
            AND EXISTS (SELECT 1 FROM leaderboard_blocks WHERE name_key=? AND blocked_at=?) RETURNING name_key`,
              ).bind(...guard, name.key, now),
            ];
    const results = await env.DB.batch(queries);
    if (results.some((result) => !result.success)) throw Error('database');
    if (!results[0].results.length) return reply({ error: 'conflict' }, 409);
    return reply({ ok: true, action: input.action, name: name.name });
  } catch {
    console.warn(JSON.stringify({ event: 'leaderboard-admin-unavailable', stage: 'database' }));
    return reply({ error: 'unavailable' }, 503);
  }
}
