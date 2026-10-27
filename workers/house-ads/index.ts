import {
  boundedAdJson,
  HOUSE_AD_MAX_BYTES,
  isHouseAdPlacement,
  isHouseAdDevice,
  houseAdDeviceFromUserAgent,
  publicHouseAd,
  houseAdWeight,
  HOUSE_AD_PLACEMENTS,
  validHouseAdConfig,
  weightedHouseAd,
  type HouseAdConfig,
} from '../../src/house-ad-contract.ts';
import { adAdminSession, adAuthAction } from './auth.ts';
import { ADMIN_HTML, ADMIN_SCRIPT, ADMIN_CSS, LOGIN_HTML, LOGIN_SCRIPT } from './admin.ts';
import { adSellerLine } from '../../src/ad-platform-contract.ts';
import { adMetrics, issueAdReceipt, recordAdMetrics, validAdMetricEvent } from './metrics.ts';
import { AD_API_GUIDE, houseAdsOpenApi } from './api.ts';
import { validateCampaignImages } from './images.ts';
import { recordAdLoadDiagnostic, adLoadDiagnostics } from './diagnostics.ts';
import { loginSiteKey } from './turnstile.ts';

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
function publicHeaders(request: Request, configured: string, methods = 'GET'): Headers | null {
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
    result.set('Access-Control-Allow-Methods', methods);
    result.set('Access-Control-Allow-Headers', 'Content-Type');
  }
  return result;
}
async function config(env: HouseAdsWorkerEnv): Promise<HouseAdConfig> {
  const row = await env.DB.prepare(
    'SELECT revision, campaigns, settings FROM ad_config WHERE id = 1',
  ).first<{
    revision: number;
    campaigns: string;
    settings: string;
  }>();
  if (!row) throw new Error('configuration-unavailable');
  const value: unknown = {
    revision: row.revision,
    campaigns: JSON.parse(row.campaigns),
    settings: JSON.parse(row.settings),
  };
  if (!validHouseAdConfig(value)) throw new Error('configuration-invalid');
  return value;
}
async function receiptFor(
  request: Request,
  env: HouseAdsWorkerEnv,
  ad: { id: string; name: string },
  provider: 'house' | 'adsense',
  placement: Parameters<typeof issueAdReceipt>[3],
) {
  const url = new URL(request.url),
    origin = request.headers.get('Origin') ?? url.origin;
  // 本地/CI可读取公开投放，但不混入正式指标；隔离服务可显式配置自己的测试来源。
  if (origin !== env.ADMIN_ORIGIN && !env.ALLOWED_ORIGINS.split(',').includes(origin))
    return undefined;
  try {
    // 只信任边缘提供的地址；缺少绑定/地址或频控异常时仍返回广告，只不写统计。
    const ip = request.headers.get('CF-Connecting-IP')?.trim();
    if (!ip || ip.length > 64 || !env.AD_RECEIPT_LIMITER) return undefined;
    const hash = new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip)),
    );
    const key =
      'qinglan-house-ads:receipt:v1:' +
      Array.from(hash, (b) => b.toString(16).padStart(2, '0')).join('');
    // 两种供给、四个位置、两端及验证请求共用额度，避免切换参数绕过。
    if (!(await env.AD_RECEIPT_LIMITER.limit({ key })).success) return undefined;
    return await issueAdReceipt(
      env.DB,
      ad,
      provider,
      placement,
      origin,
      Date.now(),
      url.searchParams.get('verification') === '1',
    );
  } catch {
    return undefined;
  }
}
function page(body: string, type: string, login = false) {
  const extra = headers();
  extra.set('Content-Type', type);
  extra.set(
    'Content-Security-Policy',
    login
      ? "default-src 'none'; script-src 'self' https://challenges.cloudflare.com; style-src 'self'; img-src https:; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
      : "default-src 'none'; script-src 'self'; style-src 'self'; img-src https:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  );
  return new Response(body, { headers: extra });
}
export const createHouseAdsWorker = (
  fetchImage: typeof fetch = fetch,
  verifyFetch: typeof fetch = fetch,
) =>
  ({
    async fetch(request: Request, env: HouseAdsWorkerEnv): Promise<Response> {
      const url = new URL(request.url);
      const path = url.pathname.replace(/^\/ads(?=\/)/, '');
      if (path === '/api/client-status') {
        const extra = publicHeaders(request, env.ALLOWED_ORIGINS, 'POST');
        if (!extra || !request.headers.get('Origin')) return json({ error: 'origin-denied' }, 403);
        if (request.method === 'OPTIONS')
          return new Response(null, { status: 204, headers: extra });
        if (request.method !== 'POST') return json({ error: 'method-not-allowed' }, 405, extra);
        if (
          ['text/plain', 'application/json'].includes(
            request.headers.get('Content-Type')?.split(';')[0].trim() ?? '',
          )
        )
          await recordAdLoadDiagnostic(request, env);
        return new Response(null, { status: 204, headers: extra });
      }
      if (path === '/v1/preload') {
        const extra = publicHeaders(request, env.ALLOWED_ORIGINS);
        if (!extra) return json({ error: 'origin-denied' }, 403);
        if (request.method !== 'GET') return json({ error: 'method-not-allowed' }, 405, extra);
        const device = url.searchParams.get('device');
        if (!isHouseAdDevice(device)) return json({ error: 'invalid-device' }, 400, extra);
        try {
          const current = await config(env);
          const ads = Object.fromEntries(
            HOUSE_AD_PLACEMENTS.map((placement) => {
              const ad =
                current.settings!.provider === 'house'
                  ? weightedHouseAd(current.campaigns, placement, undefined, device)
                  : null;
              return [placement, ad ? publicHouseAd(ad, device) : null];
            }),
          );
          const images = [
            ...new Set(
              Object.values(ads)
                .filter((ad) => ad !== null)
                .map((ad) => ad.imageUrl),
            ),
          ];
          return json({ images, ads }, 200, extra);
        } catch {
          return json({ error: 'unavailable' }, 503, extra);
        }
      }
      if (path === '/openapi.json' || path === '/api.md') {
        if (request.method !== 'GET') return json({ error: 'method-not-allowed' }, 405);
        return path === '/openapi.json'
          ? json(houseAdsOpenApi(env.ADMIN_ORIGIN))
          : page(AD_API_GUIDE, 'text/markdown; charset=utf-8');
      }
      if (path === '/ads.txt') {
        try {
          const current = await config(env);
          return new Response(adSellerLine(current.settings!), {
            headers: {
              ...Object.fromEntries(headers()),
              'Content-Type': 'text/plain; charset=utf-8',
            },
          });
        } catch {
          return new Response('temporarily unavailable', { status: 503, headers: headers() });
        }
      }
      if (path === '/v1/event') {
        const extra = publicHeaders(request, env.ALLOWED_ORIGINS, 'POST');
        if (!extra || !request.headers.get('Origin')) return json({ error: 'origin-denied' }, 403);
        if (request.method === 'OPTIONS')
          return new Response(null, { status: 204, headers: extra });
        if (request.method !== 'POST') return json({ error: 'method-not-allowed' }, 405, extra);
        if (
          !['application/json', 'text/plain'].includes(
            request.headers.get('Content-Type')?.split(';')[0].trim() ?? '',
          )
        )
          return json({ error: 'invalid-body' }, 400, extra);
        let body: unknown;
        try {
          body = await boundedAdJson(request, 512);
        } catch {
          return json({ error: 'invalid-body' }, 400, extra);
        }
        if (!validAdMetricEvent(body)) return json({ error: 'invalid-event' }, 400, extra);
        try {
          await recordAdMetrics(env.DB, body, request.headers.get('Origin')!);
          return new Response(null, { status: 204, headers: extra });
        } catch {
          return json({ error: 'unavailable' }, 503, extra);
        }
      }
      if (path === '/v1/settings') {
        const extra = publicHeaders(request, env.ALLOWED_ORIGINS);
        if (!extra) return json({ error: 'origin-denied' }, 403);
        if (request.method !== 'GET') return json({ error: 'method-not-allowed' }, 405, extra);
        const placement = url.searchParams.get('placement');
        if (placement !== null && !isHouseAdPlacement(placement))
          return json({ error: 'invalid-placement' }, 400, extra);
        try {
          const current = await config(env);
          let receipt: string | undefined;
          if (current.settings!.provider === 'adsense' && isHouseAdPlacement(placement)) {
            receipt = await receiptFor(
              request,
              env,
              { id: 'google-adsense', name: 'Google AdSense' },
              'adsense',
              placement,
            );
          }
          return json({ settings: current.settings, ...(receipt ? { receipt } : {}) }, 200, extra);
        } catch {
          return json({ error: 'unavailable' }, 503, extra);
        }
      }
      if (path === '/v1/ad') {
        const extra = publicHeaders(request, env.ALLOWED_ORIGINS);
        if (!extra) return json({ error: 'origin-denied' }, 403);
        if (!['GET', 'OPTIONS'].includes(request.method))
          return json({ error: 'method-not-allowed' }, 405, extra);
        if (request.method === 'OPTIONS')
          return new Response(null, { status: 204, headers: extra });
        const placement = url.searchParams.get('placement');
        if (!isHouseAdPlacement(placement)) return json({ error: 'invalid-placement' }, 400, extra);
        const requestedDevice = url.searchParams.get('device');
        const campaign = url.searchParams.get('campaign');
        if (campaign !== null && !/^[a-zA-Z0-9-]{1,64}$/.test(campaign))
          return json({ error: 'invalid-campaign' }, 400, extra);
        if (requestedDevice !== null && !isHouseAdDevice(requestedDevice))
          return json({ error: 'invalid-device' }, 400, extra);
        const device =
          requestedDevice ??
          houseAdDeviceFromUserAgent(
            request.headers.get('User-Agent') ?? '',
            request.headers.get('Sec-CH-UA-Mobile'),
          );
        try {
          const current = await config(env);
          const ad =
            current.settings!.provider === 'house'
              ? campaign
                ? (current.campaigns.find(
                    (ad) =>
                      ad.id === campaign &&
                      ad.enabled &&
                      ad.placements.includes(placement) &&
                      houseAdWeight(ad, device) > 0,
                  ) ?? null)
                : weightedHouseAd(current.campaigns, placement, undefined, device)
              : null;
          let receipt: string | undefined;
          if (ad) {
            receipt = await receiptFor(request, env, ad, 'house', placement);
          }
          return json(
            { ad: ad ? publicHouseAd(ad, device) : null, ...(receipt ? { receipt } : {}) },
            200,
            extra,
          );
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
            headers: {
              ...Object.fromEntries(headers()),
              Location: `${env.ADMIN_ORIGIN}/ads/admin/`,
            },
          });
        return json({ error: 'origin-denied' }, 403);
      }
      if (
        ['/admin/login', '/admin/logout', '/admin/password'].includes(path) &&
        request.method !== 'GET'
      )
        return adAuthAction(request, env, verifyFetch);
      if (request.method === 'GET') {
        if (path === '/admin/login')
          return page(
            LOGIN_HTML.replace('__TURNSTILE_SITE_KEY__', loginSiteKey(env) ?? ''),
            'text/html; charset=utf-8',
            true,
          );
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
          return page(
            LOGIN_HTML.replace('__TURNSTILE_SITE_KEY__', loginSiteKey(env) ?? ''),
            'text/html; charset=utf-8',
            true,
          );
        return json({ error: 'login-required', message: '登录已失效，请重新登录。' }, 401);
      }
      if (request.method === 'GET') {
        if (path === '/admin/') return page(ADMIN_HTML, 'text/html; charset=utf-8');
        if (path === '/admin/diagnostics') {
          const days = Number(url.searchParams.get('days') ?? '7');
          if (![1, 7, 30].includes(days)) return json({ error: 'invalid-window' }, 400);
          try {
            return json({ rows: await adLoadDiagnostics(env.DB, days) });
          } catch {
            return json({ error: 'unavailable' }, 503);
          }
        }
        if (path === '/admin/app.js') return page(ADMIN_SCRIPT, 'text/javascript; charset=utf-8');
        if (path === '/admin/app.css') return page(ADMIN_CSS, 'text/css; charset=utf-8');
        if (path === '/admin/config') {
          try {
            return json(await config(env));
          } catch {
            return json(
              { error: 'unavailable', message: '暂时无法读取投放配置，请稍后重试。' },
              503,
            );
          }
        }
        if (path === '/admin/stats') {
          const days = Number(url.searchParams.get('days') ?? '7');
          if (![1, 7, 30].includes(days)) return json({ error: 'invalid-window' }, 400);
          try {
            const report = await adMetrics(env.DB, days),
              current = await config(env);
            const existing = new Set(
              report.rows.filter((r) => r.provider === 'house').map((r) => r.id),
            );
            const active = new Map(current.campaigns.map((a) => [a.id, a.name]));
            const rows = report.rows.map((r) => ({
              ...r,
              name: r.provider === 'house' ? (active.get(r.id) ?? r.name) : r.name,
              archived: r.provider === 'house' && !active.has(r.id),
            }));
            for (const ad of current.campaigns)
              if (!existing.has(ad.id))
                rows.push({
                  id: ad.id,
                  provider: 'house',
                  name: ad.name,
                  requests: 0,
                  shown: 0,
                  clicked: 0,
                  watched: 0,
                  claimed: 0,
                  archived: false,
                });
            return json({ ...report, rows });
          } catch {
            return json({ error: 'unavailable', message: '暂时无法读取统计，请稍后重试。' }, 503);
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
      const invalidImage = await validateCampaignImages(input.campaigns, fetchImage);
      if (invalidImage)
        return json(
          {
            error: 'invalid-image',
            message: '图片无法访问或不是有效图片，请检查后重试。',
            ...invalidImage,
          },
          400,
        );
      try {
        const settings = input.settings ?? (await config(env)).settings!;
        const result = await env.DB.prepare(
          'UPDATE ad_config SET campaigns = ?, settings = ?, revision = revision + 1, updated_at = ? WHERE id = 1 AND revision = ?',
        )
          .bind(
            JSON.stringify(input.campaigns),
            JSON.stringify(settings),
            new Date().toISOString(),
            input.revision,
          )
          .run();
        if (result.meta.changes !== 1)
          return json(
            {
              error: 'conflict',
              message: '配置已被其他窗口更新。当前编辑内容仍保留，请重新载入最新配置后再修改。',
            },
            409,
          );
        return json({ ...input, settings, revision: input.revision + 1 });
      } catch {
        return json(
          { error: 'save-failed', message: '保存未成功，当前编辑内容仍保留，请稍后重试。' },
          503,
        );
      }
    },
  }) satisfies ExportedHandler<HouseAdsWorkerEnv>;
export default createHouseAdsWorker();
