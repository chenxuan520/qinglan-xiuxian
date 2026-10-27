import {
  boundedAdJson,
  HOUSE_AD_MAX_BYTES,
  isHouseAdPlacement,
  publicHouseAd,
  validHouseAdConfig,
  type HouseAdConfig,
} from '../../src/house-ad-contract.ts';
import { adAdminSession, adAuthAction } from './auth.ts';
import { ADMIN_HTML, ADMIN_SCRIPT, ADMIN_CSS, LOGIN_HTML, LOGIN_SCRIPT } from './admin.ts';

// 登录账号与密码校验值由D1维护，不写入公开仓库。
export type HouseAdsWorkerEnv = HouseAdsEnv;
const headers = () =>
  new Headers({
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
const json = (body: unknown, status = 200, extra = headers()) => {
  extra.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), { status, headers: extra });
};
function publicHeaders(request: Request, configured: string): Headers | null {
  const result = headers(),
    origin = request.headers.get('Origin');
  if (origin) {
    try {
      const url = new URL(origin);
      if (
        url.origin !== origin ||
        !(
          configured.split(',').includes(origin) ||
          (['http:', 'https:'].includes(url.protocol) &&
            ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
        )
      )
        return null;
    } catch {
      return null;
    }
    result.set('Access-Control-Allow-Origin', origin);
    result.set('Vary', 'Origin');
    result.set('Access-Control-Allow-Methods', 'GET');
  }
  return result;
}
async function config(env: HouseAdsWorkerEnv): Promise<HouseAdConfig> {
  const row = await env.DB.prepare('SELECT revision, campaigns FROM ad_config WHERE id = 1').first<{
    revision: number;
    campaigns: string;
  }>();
  if (!row) throw new Error('configuration-unavailable');
  const value: unknown = { revision: row.revision, campaigns: JSON.parse(row.campaigns) };
  if (!validHouseAdConfig(value)) throw new Error('configuration-invalid');
  return value;
}
function page(body: string, type: string) {
  const extra = headers();
  extra.set('Content-Type', type);
  extra.set(
    'Content-Security-Policy',
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src https:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  );
  return new Response(body, { headers: extra });
}
export default {
  async fetch(request: Request, env: HouseAdsWorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/ads(?=\/)/, '');
    if (path === '/v1/ad') {
      const extra = publicHeaders(request, env.ALLOWED_ORIGINS);
      if (!extra) return json({ error: 'origin-denied' }, 403);
      if (!['GET', 'OPTIONS'].includes(request.method))
        return json({ error: 'method-not-allowed' }, 405, extra);
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: extra });
      const placement = url.searchParams.get('placement');
      if (!isHouseAdPlacement(placement)) return json({ error: 'invalid-placement' }, 400, extra);
      try {
        const current = await config(env);
        const choices = current.campaigns.filter(
          (ad) => ad.enabled && ad.placements.includes(placement),
        );
        const ad = choices.length
          ? choices[crypto.getRandomValues(new Uint32Array(1))[0] % choices.length]
          : null;
        return json({ ad: ad ? publicHouseAd(ad) : null }, 200, extra);
      } catch {
        return json({ error: 'unavailable', ad: null }, 503, extra);
      }
    }
    if (path === '/' || path === '/admin') {
      return new Response(null, {
        status: 302,
        headers: { ...Object.fromEntries(headers()), Location: `${env.ADMIN_ORIGIN}/ads/admin/` },
      });
    }
    if (!path.startsWith('/admin/')) return json({ error: 'not-found' }, 404);
    if (url.origin !== env.ADMIN_ORIGIN) {
      if (request.method === 'GET' && ['/admin/', '/admin/login'].includes(path))
        return new Response(null, {
          status: 302,
          headers: { ...Object.fromEntries(headers()), Location: `${env.ADMIN_ORIGIN}/ads/admin/` },
        });
      return json({ error: 'origin-denied' }, 403);
    }
    if (
      ['/admin/login', '/admin/logout', '/admin/password'].includes(path) &&
      request.method !== 'GET'
    )
      return adAuthAction(request, env);
    if (request.method === 'GET') {
      if (path === '/admin/login') return page(LOGIN_HTML, 'text/html; charset=utf-8');
      if (path === '/admin/login.js') return page(LOGIN_SCRIPT, 'text/javascript; charset=utf-8');
      if (path === '/admin/app.css') return page(ADMIN_CSS, 'text/css; charset=utf-8');
      if (path === '/admin/app.js') return page(ADMIN_SCRIPT, 'text/javascript; charset=utf-8');
    }
    let authenticated = false;
    try {
      authenticated = !!(await adAdminSession(request, env));
    } catch {
      return json({ error: 'unavailable', message: '暂时无法验证登录，请稍后重试。' }, 503);
    }
    if (!authenticated) {
      if (path === '/admin/' && request.method === 'GET')
        return page(LOGIN_HTML, 'text/html; charset=utf-8');
      return json({ error: 'login-required', message: '登录已失效，请重新登录。' }, 401);
    }
    if (request.method === 'GET') {
      if (path === '/admin/') return page(ADMIN_HTML, 'text/html; charset=utf-8');
      if (path === '/admin/app.js') return page(ADMIN_SCRIPT, 'text/javascript; charset=utf-8');
      if (path === '/admin/app.css') return page(ADMIN_CSS, 'text/css; charset=utf-8');
      if (path === '/admin/config') {
        try {
          return json(await config(env));
        } catch {
          return json({ error: 'unavailable', message: '暂时无法读取投放配置，请稍后重试。' }, 503);
        }
      }
      return json({ error: 'not-found' }, 404);
    }
    if (path !== '/admin/config' || request.method !== 'PUT')
      return json({ error: 'method-not-allowed' }, 405);
    if (
      request.headers.get('Origin') !== url.origin ||
      request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json'
    ) {
      return json({ error: 'request-denied', message: '请在管理页面内保存配置。' }, 403);
    }
    let input: unknown;
    try {
      input = await boundedAdJson(request, HOUSE_AD_MAX_BYTES);
    } catch {
      return json({ error: 'invalid-body', message: '配置内容无效或过大，请检查后重试。' }, 400);
    }
    if (!validHouseAdConfig(input))
      return json(
        {
          error: 'invalid-config',
          message:
            '请填写广告名称、有效的 HTTPS 图片和跳转链接，并选择投放位置；最多保留20条广告。',
        },
        400,
      );
    try {
      const result = await env.DB.prepare(
        'UPDATE ad_config SET campaigns = ?, revision = revision + 1, updated_at = ? WHERE id = 1 AND revision = ?',
      )
        .bind(JSON.stringify(input.campaigns), new Date().toISOString(), input.revision)
        .run();
      if (result.meta.changes !== 1)
        return json(
          {
            error: 'conflict',
            message: '配置已被其他窗口更新。当前编辑内容仍保留，请重新载入最新配置后再修改。',
          },
          409,
        );
      return json({ ...input, revision: input.revision + 1 });
    } catch {
      return json(
        { error: 'save-failed', message: '保存未成功，当前编辑内容仍保留，请稍后重试。' },
        503,
      );
    }
  },
} satisfies ExportedHandler<HouseAdsWorkerEnv>;
