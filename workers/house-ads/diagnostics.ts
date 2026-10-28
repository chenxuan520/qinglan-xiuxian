import { validAdLoadDiagnostic } from '../../src/ad-load-contract.ts';
import { boundedAdJson } from '../../src/house-ad-contract.ts';

export const AD_DIAGNOSTIC_MAX_VERSIONS = 16;
export const AD_DIAGNOSTIC_MAX_ROWS = 1000;

export async function recordAdLoadDiagnostic(request: Request, env: HouseAdsEnv) {
  // 与receipt分开限流；无地址/绑定或异常一律静默放弃，不阻塞游戏。
  try {
    const ip = request.headers.get('CF-Connecting-IP')?.trim();
    if (!ip || ip.length > 64 || !env.AD_DIAGNOSTIC_LIMITER) return;
    const hash = new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip)),
    );
    const key =
      'qinglan-house-ads:load:v1:' +
      Array.from(hash, (b) => b.toString(16).padStart(2, '0')).join('');
    if (!(await env.AD_DIAGNOSTIC_LIMITER.limit({ key })).success) return;
    const body = await boundedAdJson(request, 512);
    if (!validAdLoadDiagnostic(body) || body.version === 'dev' || body.version.endsWith('-dirty'))
      return;
    const now = new Date().toISOString();
    const day = now.slice(0, 10);
    const group = [
      day,
      body.version,
      body.placement,
      body.device,
      body.browser,
      body.stage,
      body.code,
      body.status,
    ];
    await env.DB.prepare(
      `INSERT INTO ad_load_diagnostics (day,version,placement,device,browser,stage,code,status,elapsed_total,last_seen)
      SELECT ?,?,?,?,?,?,?,?,?,? WHERE
      EXISTS (SELECT 1 FROM ad_load_diagnostics WHERE day=? AND version=? AND placement=? AND device=? AND browser=? AND stage=? AND code=? AND status=?)
      OR ((SELECT count(*) FROM ad_load_diagnostics WHERE day=?) < ? AND
        (EXISTS (SELECT 1 FROM ad_load_diagnostics WHERE day=? AND version=?) OR
         (SELECT count(DISTINCT version) FROM ad_load_diagnostics WHERE day=?) < ?))
      ON CONFLICT (day,version,placement,device,browser,stage,code,status) DO UPDATE SET count=count+1,elapsed_total=elapsed_total+excluded.elapsed_total,last_seen=excluded.last_seen`,
    )
      .bind(
        ...group,
        body.elapsed,
        now,
        ...group,
        day,
        AD_DIAGNOSTIC_MAX_ROWS,
        day,
        body.version,
        day,
        AD_DIAGNOSTIC_MAX_VERSIONS,
      )
      .run();
    await env.DB.prepare('DELETE FROM ad_load_diagnostics WHERE day < ?')
      .bind(new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10))
      .run();
  } catch {
    /* 诊断故障不影响广告、奖励或玩家操作。 */
  }
}
export async function adLoadDiagnostics(db: D1Database, days: number) {
  return (
    await db
      .prepare('SELECT * FROM ad_load_diagnostics WHERE day >= ? ORDER BY last_seen DESC LIMIT 500')
      .bind(new Date(Date.now() - (days - 1) * 86400_000).toISOString().slice(0, 10))
      .all()
  ).results;
}
