import { STANDALONE } from './build-mode.ts';
import { ADS_SETTINGS, TELEMETRY_SETTINGS } from './setting.ts';
import { GAME_VERSION } from './version.ts';
import { houseAdDeviceFromUserAgent, type HouseAdPlacement } from './house-ad-contract.ts';
import { validAdLoadDiagnostic, type AdLoadDiagnostic } from './ad-load-contract.ts';

// 一次播放只报告一次故障，不发送地址、完整UA、存档、广告链接或管理凭据。
export class AdLoadTrace {
  stage: AdLoadDiagnostic['stage'] = 'platform-module';
  code: AdLoadDiagnostic['code'] = 'unavailable';
  status = 0;
  empty = false;
  silent = false;
  private readonly started = performance.now();
  private reported = false;
  at(stage: AdLoadDiagnostic['stage']) {
    this.stage = stage;
    this.status = 0;
    this.code = 'unavailable';
  }
  report(placement: HouseAdPlacement, fetcher: typeof fetch = fetch) {
    if (
      this.reported ||
      this.empty ||
      this.silent ||
      STANDALONE ||
      typeof window === 'undefined' ||
      typeof navigator === 'undefined' ||
      !TELEMETRY_SETTINGS.origins.some((origin) => origin === window.location?.origin) ||
      new URLSearchParams(window.location.search).get('verification') === '1' ||
      GAME_VERSION === 'dev' ||
      GAME_VERSION.endsWith('-dirty') ||
      !ADS_SETTINGS.house.endpoint
    )
      return;
    this.reported = true;
    const ua = navigator.userAgent;
    const body: AdLoadDiagnostic = {
      version: GAME_VERSION,
      placement,
      device: houseAdDeviceFromUserAgent(
        ua,
        (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile
          ? '?1'
          : undefined,
      ),
      browser: /Via\//i.test(ua)
        ? 'via'
        : /Firefox/i.test(ua)
          ? 'firefox'
          : /Chrome|Chromium|Edg/i.test(ua)
            ? 'chromium'
            : /Safari/i.test(ua)
              ? 'safari'
              : 'other',
      stage: this.stage,
      code: this.code,
      status: this.status,
      elapsed: Math.min(60_000, Math.max(0, Math.round(performance.now() - this.started))),
    };
    if (!validAdLoadDiagnostic(body)) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const url = new URL('/api/client-status', ADS_SETTINGS.house.endpoint);
      void fetcher(url, {
        method: 'POST',
        credentials: 'omit',
        cache: 'no-store',
        keepalive: true,
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
        .catch(() => {})
        .finally(() => clearTimeout(timer));
    } catch {
      clearTimeout(timer);
    }
  }
}
