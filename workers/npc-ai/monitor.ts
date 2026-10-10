import {
  monitorFilter,
  monitorQueries,
  monitorRows,
  validMonitorData,
  type MonitorData,
  type MonitorSection,
} from '../../src/monitor-protocol.ts';

export type MonitorEnv = {
  MONITOR_PUBLIC?: string;
  ANALYTICS_READ_TOKEN?: string;
  ANALYTICS_ACCOUNT_ID?: string;
  MONITOR_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
};
type Dependencies = {
  fetch: typeof fetch;
  cache?: Pick<Cache, 'match' | 'put'>;
  now: () => number;
};
const TTL = 300_000;

export async function monitorResponse(
  request: Request,
  env: MonitorEnv,
  headers: Headers,
  dependencies?: Dependencies,
) {
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (env.MONITOR_PUBLIC !== 'true') return json({ message: '公开监控已关闭。' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'GET') return json({ message: '仅支持 GET 查询。' }, 405);
  const filter = monitorFilter(new URL(request.url).searchParams);
  if (!filter) return json({ message: '仅支持 1、7、30、90 天及预设站点筛选。' }, 400);
  if (!env.ANALYTICS_READ_TOKEN || !/^[a-f0-9]{32}$/.test(env.ANALYTICS_ACCOUNT_ID ?? ''))
    return json({ message: '统计查询服务尚未配置。' }, 503);
  if (!env.MONITOR_LIMITER) return json({ message: '统计限流服务尚未配置。' }, 503);
  let allowed: boolean;
  try {
    allowed = (
      await env.MONITOR_LIMITER.limit({
        key: `monitor:${request.headers.get('CF-Connecting-IP') || 'unknown'}`,
      })
    ).success;
  } catch {
    return json({ message: '统计限流服务暂时不可用，请稍后重试。' }, 503);
  }
  if (!allowed) {
    headers.set('Retry-After', '60');
    return json({ message: '查询过于频繁，请一分钟后重试。' }, 429);
  }
  const deps = dependencies ?? {
    fetch: fetch.bind(globalThis),
    now: Date.now,
    cache: caches.default,
  };
  const key = new Request(
    `https://monitor-cache.invalid/v1/${env.ANALYTICS_ACCOUNT_ID}/${filter.days}/${filter.site}`,
  );
  try {
    const cached = await deps.cache?.match(key);
    if (cached) {
      const data = (await cached.json()) as MonitorData;
      const age = deps.now() - Date.parse(data.generatedAt);
      if (
        validMonitorData(data) &&
        data.filter.days === filter.days &&
        data.filter.site === filter.site &&
        age >= 0 &&
        age < TTL
      )
        return json(data);
    }
  } catch {
    /* 缓存不可用时仍可查询；不复用旧 CORS 响应头。 */
  }
  const sections = {} as MonitorData['sections'];
  const entries = Object.entries(monitorQueries(filter)) as [MonitorSection, string][];
  // 每批四条，保持在 Worker 六个并发连接以内。个别失败不会冒充零记录。
  for (let i = 0; i < entries.length; i += 4) {
    await Promise.all(
      entries.slice(i, i + 4).map(async ([section, sql]) => {
        try {
          const response = await deps.fetch(
            `https://api.cloudflare.com/client/v4/accounts/${env.ANALYTICS_ACCOUNT_ID}/analytics_engine/sql`,
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${env.ANALYTICS_READ_TOKEN}` },
              body: `${sql} FORMAT JSON`,
              signal: AbortSignal.timeout(8_000),
            },
          );
          if (!response.ok) {
            console.warn(
              JSON.stringify({
                event: 'monitor-query-failure',
                section,
                upstreamStatus: response.status,
              }),
            );
            await response.body?.cancel();
            throw new Error('upstream');
          }
          const body = (await response.json()) as { data?: unknown };
          sections[section] = { rows: monitorRows(section, body.data) };
        } catch (error) {
          if (
            error instanceof Error &&
            ['TypeError', 'TimeoutError', 'SyntaxError'].includes(error.name)
          )
            console.warn(
              JSON.stringify({ event: 'monitor-query-failure', section, errorName: error.name }),
            );
          // 不返回上游正文、SQL、账号、令牌或匿名编号。
          sections[section] = { rows: [], error: '该项统计暂时无法读取，请稍后重试。' };
        }
      }),
    );
  }
  const data: MonitorData = {
    schemaVersion: 1,
    filter,
    generatedAt: new Date(deps.now()).toISOString(),
    sections,
  };
  if (Object.values(sections).every((s) => !s.error)) {
    try {
      await deps.cache?.put(
        key,
        Response.json(data, { headers: { 'Cache-Control': 'public, max-age=300' } }),
      );
    } catch {
      /* 缓存失败不影响查询。 */
    }
  }
  return json(data, Object.values(sections).every((s) => s.error) ? 502 : 200);
}
