import { ADS_SETTINGS } from './setting.ts';
import { AD_METRIC, adReceiptId } from './ad-metrics-contract.ts';

export function adTracker(receipt: unknown, fetcher: typeof fetch = fetch) {
  let flags = 0;
  return (kind: keyof typeof AD_METRIC) => {
    if (!adReceiptId(receipt) || !ADS_SETTINGS.house.endpoint) return;
    const next = flags | AD_METRIC[kind] | (kind === 'claimed' ? 5 : 1);
    if (next === flags) return;
    flags = next;
    // 统计完全独立于奖励；simple request + keepalive，不携带管理Cookie、不阻塞跳转或保存。
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const url = new URL(ADS_SETTINGS.house.endpoint);
      url.pathname = url.pathname.replace(/\/ad$/, '/event');
      const controller = new AbortController();
      timer = setTimeout(() => controller.abort(), 4000);
      void fetcher(url, {
        method: 'POST',
        credentials: 'omit',
        cache: 'no-store',
        keepalive: true,
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({ receipt, flags }),
        signal: controller.signal,
      })
        .catch(() => {})
        .finally(() => clearTimeout(timer));
    } catch {
      clearTimeout(timer);
      /* 不把打点故障变成玩家操作失败。 */
    }
  };
}
