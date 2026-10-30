import {
  createFactsSeal,
  validFactsSeal,
  verifyFactsSeal,
} from '../../src/leaderboard-integrity.ts';
import {
  LEADERBOARD_LIMIT,
  LEADERBOARD_MAX_BYTES,
  LEADERBOARD_VERSION,
  normalizeLeaderboardName,
  type LeaderboardEntry,
} from '../../src/leaderboard-contract.ts';
import { parseLeaderboardFacts, scoreLeaderboardFacts } from './score.ts';
import { leaderboardAdminApi } from './admin-api.ts';
import { leaderboardPage } from './page.ts';

export type LeaderboardWorkerEnv = Pick<LeaderboardEnv, 'DB' | 'SUBMIT_LIMITER'> &
  Partial<Pick<LeaderboardEnv, 'ADMIN_AUTH' | 'LEGACY_SEAL_UNTIL'>>;
const ORIGIN = 'https://xiuxian.011203.xyz';
const PATH = '/api/leaderboard';
export const OWNER_COOKIE = '__Host-qinglan-rank-owner';
const PUBLIC_COLUMNS = 'display_name, score, grade, title, life_mode, ending, updated_at';
interface RankingRow {
  display_name: string;
  score: number;
  grade: string;
  title: string;
  life_mode: LeaderboardEntry['lifeMode'];
  ending: LeaderboardEntry['ending'];
  updated_at: string;
  owner_hash?: string;
  ahead?: number;
}
const entry = (row: RankingRow): LeaderboardEntry => ({
  name: row.display_name,
  score: row.score,
  grade: row.grade,
  title: row.title,
  lifeMode: row.life_mode,
  ending: row.ending,
  updatedAt: row.updated_at,
});
function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers },
  });
}
function error(code: string, message: string, status: number, headers?: Record<string, string>) {
  return json({ error: code, message }, status, headers);
}
async function digest(value: string) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))),
    (n) => n.toString(16).padStart(2, '0'),
  ).join('');
}
function ownerCookie(request: Request) {
  const values = (request.headers.get('Cookie') ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(OWNER_COOKIE + '='))
    .map((part) => part.slice(OWNER_COOKIE.length + 1));
  return values.length === 1 && /^[a-f0-9]{64}$/.test(values[0]) ? values[0] : null;
}
function newOwnerCookie() {
  const owner = Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
    n.toString(16).padStart(2, '0'),
  ).join('');
  return `${OWNER_COOKIE}=${owner}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=31536000`;
}
async function boundedJson(request: Request): Promise<unknown> {
  const length = request.headers.get('Content-Length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > LEADERBOARD_MAX_BYTES))
    throw Error('body-limit');
  if (!request.body) throw Error('empty-body');
  const reader = request.body.getReader(),
    decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });
  let bytes = 0,
    body = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > LEADERBOARD_MAX_BYTES) {
        await reader.cancel();
        throw Error('body-limit');
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
    return JSON.parse(body);
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

async function submit(request: Request, env: LeaderboardWorkerEnv) {
  if (
    request.headers.get('Origin') !== ORIGIN ||
    !/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') ?? '')
  ) {
    return error('invalid-input', '请从官网提交排名。', 400);
  }
  // Cloudflare overwrites this header at its edge. Raw addresses are never stored or logged.
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip || !env.SUBMIT_LIMITER) return error('unavailable', '排名暂时不可用，请稍后再试。', 503);
  try {
    if (!(await env.SUBMIT_LIMITER.limit({ key: await digest(ip) })).success) {
      return error('rate-limited', '提交较频繁，请稍后再试。', 429, { 'Retry-After': '60' });
    }
  } catch {
    console.warn(JSON.stringify({ event: 'leaderboard-unavailable', stage: 'rate-limit' }));
    return error('unavailable', '排名暂时不可用，请稍后再试。', 503);
  }
  let body: unknown;
  try {
    body = await boundedJson(request);
  } catch {
    return error('invalid-input', '排名资料格式不正确。', 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return error('invalid-input', '排名资料格式不正确。', 400);
  const fields = body as Record<string, unknown>;
  const name = normalizeLeaderboardName(fields.name);
  const hasSeal = Object.hasOwn(fields, 'seal');
  const transitionEnd = Date.parse(env.LEGACY_SEAL_UNTIL ?? '');
  const remaining = transitionEnd - Date.now();
  // 默认严格；显式部署过渡期最长1小时、到期自动收紧，不形成永久无摘要入口。
  const inTransition = remaining > 0 && remaining <= 3600000;
  const legacyTransition = !hasSeal && inTransition;
  const previousFacts = fields.facts;
  const previous =
    inTransition &&
    validFactsSeal(fields.seal) &&
    fields.seal.v === 1 &&
    !!previousFacts &&
    typeof previousFacts === 'object' &&
    !Array.isArray(previousFacts) &&
    !Object.hasOwn(previousFacts, 'inheritanceValue');
  // 先限制事实的固定结构，避免对恶意深层JSON递归规范化。校验过程不读写数据库。
  const facts = parseLeaderboardFacts(
    previous
      ? {
          ...previousFacts,
          inheritanceValue: (previousFacts as Record<string, unknown>).inherited ? 100 : 0,
        }
      : fields.facts,
  );
  if (!facts) return error('invalid-input', '排名资料格式不正确。', 400);
  const sealValid =
    hasSeal &&
    (previous
      ? createFactsSeal(previousFacts, 1).h === (fields.seal as { h: string }).h
      : verifyFactsSeal(fields.facts, fields.seal));
  if (
    Object.keys(fields).length !== (hasSeal ? 4 : 3) ||
    fields.version !== LEADERBOARD_VERSION ||
    !name ||
    (!sealValid && !legacyTransition)
  )
    return error('invalid-input', '排名资料格式不正确。', 400);
  const score = scoreLeaderboardFacts(facts);
  if (
    !Number.isSafeInteger(score.total) ||
    score.total < 0 ||
    !Number.isFinite(score.permanentPower)
  ) {
    return error('invalid-input', '排名资料超出有效范围。', 400);
  }
  const owner = ownerCookie(request);
  // Establish the browser capability before claiming a name. A lost first response cannot lock it.
  if (!owner)
    return error('identity-required', '正在准备匿名署名，请重试。', 428, {
      'Set-Cookie': newOwnerCookie(),
    });
  const ownerHash = await digest(owner),
    submissionHash = createFactsSeal(facts).h;
  const now = new Date().toISOString();
  const results = await env.DB.batch<RankingRow>([
    env.DB.prepare(
      `WITH owned AS (
        SELECT name_key, display_name FROM leaderboard WHERE owner_hash=?
        ORDER BY score DESC, updated_at ASC, name_key ASC LIMIT 1
      ), identity AS (
        SELECT COALESCE((SELECT name_key FROM owned), ?) AS name_key,
          COALESCE((SELECT display_name FROM owned), ?) AS display_name
      )
      INSERT INTO leaderboard
      (name_key, display_name, owner_hash, score, grade, title, life_mode, ending, submission_hash, created_at, updated_at)
      SELECT identity.name_key, identity.display_name, ?, ?, ?, ?, ?, ?, ?, ?, ?
      FROM identity WHERE (SELECT COUNT(*) FROM
        (SELECT 1 FROM leaderboard WHERE score>=? AND name_key<>identity.name_key LIMIT 100))<100
      AND NOT EXISTS (SELECT 1 FROM leaderboard_blocks WHERE name_key=identity.name_key OR owner_hash=?)
      ON CONFLICT(name_key) DO UPDATE SET display_name=excluded.display_name, score=excluded.score,
        grade=excluded.grade, title=excluded.title, life_mode=excluded.life_mode, ending=excluded.ending,
        submission_hash=excluded.submission_hash, updated_at=excluded.updated_at
      WHERE leaderboard.owner_hash=excluded.owner_hash AND excluded.score>leaderboard.score
      RETURNING ${PUBLIC_COLUMNS}`,
    ).bind(
      ownerHash,
      name.key,
      name.name,
      ownerHash,
      score.total,
      score.grade,
      score.tier,
      facts.lifeMode,
      facts.ending,
      submissionHash,
      now,
      now,
      score.total,
      ownerHash,
    ),
    env.DB.prepare(
      `SELECT ${PUBLIC_COLUMNS}, owner_hash,
      (SELECT COUNT(*) FROM leaderboard AS ahead WHERE ahead.score>current.score
        OR (ahead.score=current.score AND ahead.updated_at<current.updated_at)
        OR (ahead.score=current.score AND ahead.updated_at=current.updated_at AND ahead.name_key<current.name_key)) AS ahead
      FROM leaderboard AS current WHERE current.owner_hash=? OR current.name_key=?
      ORDER BY (current.owner_hash=?) DESC, current.score DESC, current.updated_at ASC, current.name_key ASC LIMIT 1`,
    ).bind(ownerHash, name.key, ownerHash),
  ]);
  if (results.some((result) => !result.success)) throw Error('database-result');
  const blocked = await env.DB.prepare(
    `SELECT 1 FROM leaderboard_blocks WHERE name_key=COALESCE(
      (SELECT name_key FROM leaderboard WHERE owner_hash=? ORDER BY score DESC, updated_at ASC, name_key ASC LIMIT 1), ?)
      OR owner_hash=? LIMIT 1`,
  )
    .bind(ownerHash, name.key, ownerHash)
    .all();
  if (!blocked.success) throw Error('database-result');
  if (blocked.results.length) return error('blocked', '暂时无法使用此署名提交排名。', 403);
  const row = results[1].results[0];
  if (!row) return error('not-qualified', '道果尚未进入前百，可待修行有成后再留名。', 409);
  if (row.owner_hash !== ownerHash)
    return error('name-taken', '这个姓名已有署名，请换一个姓名。', 409);
  if (row.ahead === undefined || row.ahead >= LEADERBOARD_LIMIT)
    return error('not-qualified', '道果尚未进入前百，可待修行有成后再留名。', 409);
  return json({
    version: LEADERBOARD_VERSION,
    status: results[0].results.length ? 'saved' : 'unchanged',
    entry: entry(row),
  });
}

export default {
  async fetch(
    request: Request,
    env: LeaderboardWorkerEnv,
    ctx?: Pick<ExecutionContext, 'waitUntil'>,
  ): Promise<Response> {
    const url = new URL(request.url);
    if (url.origin !== ORIGIN) return error('invalid-input', '接口不存在。', 404);
    if (url.pathname === '/leaderboard' || url.pathname.startsWith('/leaderboard/')) {
      const admin = await leaderboardAdminApi(request, env);
      if (admin) {
        if (request.method === 'POST' && admin.ok && typeof caches !== 'undefined')
          await caches.default.delete(new Request(ORIGIN + PATH)).catch(() => {});
        return admin;
      }
      return await leaderboardPage(request, env);
    }
    const personal = request.method === 'GET' && url.search === '?self=1';
    if (url.pathname !== PATH || (url.search && !personal))
      return error('invalid-input', '接口不存在。', 404);
    if (request.method !== 'GET' && request.method !== 'POST')
      return error('invalid-input', '请求方式不支持。', 405, { Allow: 'GET, POST' });
    try {
      if (request.method === 'POST') return await submit(request, env);
      const cache = !personal && ctx && typeof caches !== 'undefined' ? caches.default : null;
      const cacheKey = new Request(ORIGIN + PATH);
      if (cache) {
        try {
          const cached = await cache.match(cacheKey);
          if (cached) return cached;
        } catch {
          /* A cache outage must not make the public board unavailable. */
        }
      }
      const result = await env.DB.prepare(
        `SELECT ${PUBLIC_COLUMNS} FROM leaderboard ORDER BY score DESC, updated_at ASC, name_key ASC LIMIT ?`,
      )
        .bind(LEADERBOARD_LIMIT)
        .all<RankingRow>();
      if (!result.success) throw Error('database-result');
      const entries = result.results.map(entry);
      let self: LeaderboardEntry | null = null;
      const owner = personal ? ownerCookie(request) : null;
      if (owner) {
        const own = await env.DB.prepare(
          `SELECT ${PUBLIC_COLUMNS} FROM leaderboard WHERE owner_hash=?
          ORDER BY score DESC, updated_at ASC, name_key ASC LIMIT 1`,
        )
          .bind(await digest(owner))
          .all<RankingRow>();
        if (!own.success) throw Error('database-result');
        if (own.results[0]) self = entry(own.results[0]);
      }
      const response = json(
        {
          version: LEADERBOARD_VERSION,
          limit: LEADERBOARD_LIMIT,
          minimumScore: entries.length === LEADERBOARD_LIMIT ? entries.at(-1)!.score : 0,
          entries,
          ...(personal ? { self } : {}),
        },
        200,
        personal
          ? { 'Cache-Control': 'no-store', Vary: 'Cookie' }
          : { 'Cache-Control': 'public, max-age=30, s-maxage=30' },
      );
      if (cache && ctx) ctx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => {}));
      return response;
    } catch {
      // Fixed reason codes only: never record names, facts, raw IPs, capabilities, or DB exceptions.
      console.warn(
        JSON.stringify({ event: 'leaderboard-unavailable', stage: 'database-or-score' }),
      );
      return error('unavailable', '排名暂时不可用，请稍后再试。', 503);
    }
  },
} satisfies ExportedHandler<LeaderboardWorkerEnv>;
