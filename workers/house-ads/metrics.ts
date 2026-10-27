import type { HouseAdPlacement } from '../../src/house-ad-contract.ts';
import { adReceiptId, validAdMetricFlags } from '../../src/ad-metrics-contract.ts';

type DB = HouseAdsEnv['DB'];
export const adDay = (now = Date.now()) => new Date(now + 8 * 3600000).toISOString().slice(0, 10);
export async function issueAdReceipt(
  db: DB,
  ad: { id: string; name: string },
  provider: 'house' | 'adsense',
  placement: HouseAdPlacement,
  origin: string,
  now = Date.now(),
  verification = false,
) {
  const seconds = Math.floor(now / 1000),
    id = crypto.randomUUID();
  await db.prepare('DELETE FROM ad_receipts WHERE expires < ?').bind(seconds).run();
  await db
    .prepare(
      'INSERT INTO ad_receipts (id, ad_id, ad_name, provider, placement, day, origin, expires, verification) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(
      id,
      ad.id,
      ad.name,
      provider,
      placement,
      adDay(now),
      origin,
      seconds + 86400,
      verification ? 1 : 0,
    )
    .run();
  return id;
}
export function validAdMetricEvent(body: unknown): body is { receipt: string; flags: number } {
  return (
    !!body &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    Object.keys(body).length === 2 &&
    'receipt' in body &&
    adReceiptId(body.receipt) &&
    'flags' in body &&
    validAdMetricFlags(body.flags)
  );
}
export async function recordAdMetrics(
  db: DB,
  body: { receipt: string; flags: number },
  origin: string,
  now = Date.now(),
) {
  // flags累计置位，触发器只计新增位；并发、重复和迟到报告不会重复或倒扣。
  await db
    .prepare(
      'UPDATE ad_receipts SET flags = flags | ? WHERE id = ? AND origin = ? AND expires > ? AND (provider != ? OR (? & 2) = 0) AND (flags | ?) != flags',
    )
    .bind(
      body.flags,
      body.receipt,
      origin,
      Math.floor(now / 1000),
      'adsense',
      body.flags,
      body.flags,
    )
    .run();
}
type MetricRow = {
  id: string;
  provider: string;
  name: string;
  requests: number;
  shown: number;
  clicked: number;
  watched: number;
  claimed: number;
};
export async function adMetrics(db: DB, days: number, now = Date.now()) {
  const from = adDay(now - (days - 1) * 86400000),
    to = adDay(now);
  const result = await db
    .prepare(
      'SELECT ad_id AS id, provider, (SELECT ad_name FROM ad_daily_metrics n WHERE n.ad_id = m.ad_id AND n.provider = m.provider ORDER BY n.day DESC LIMIT 1) AS name, SUM(requests) AS requests, SUM(shown) AS shown, SUM(clicked) AS clicked, SUM(watched) AS watched, SUM(claimed) AS claimed FROM ad_daily_metrics m WHERE day >= ? AND day <= ? GROUP BY ad_id, provider ORDER BY requests DESC, ad_id',
    )
    .bind(from, to)
    .all<MetricRow>();
  return { from, to, timezone: 'Asia/Shanghai', rows: result.results };
}
