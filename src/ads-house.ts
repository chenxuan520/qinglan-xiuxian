import {
  AD_DURATION_MS,
  type AdPlacement,
  type RewardAdCallbacks,
  type RewardAdContext,
} from './ads.ts';
import { ADS_SETTINGS } from './setting.ts';
import { boundedAdJson, validHouseAd, type HouseAd } from './house-ad-contract.ts';

// 只累计图片已显示、前台有焦点且图片在视口内的时间；恢复后的长计时空洞不补算。
export class HouseAdClock {
  remaining = AD_DURATION_MS;
  private previous: number | null = null;
  private visible = false;
  sample(now: number, visible: boolean) {
    if (this.previous !== null && this.visible)
      this.remaining = Math.max(
        0,
        this.remaining - Math.max(0, Math.min(250, now - this.previous)),
      );
    this.previous = now;
    this.visible = visible;
    return Math.ceil(this.remaining / 1000);
  }
}
export async function requestHouseAd(
  placement: AdPlacement,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<HouseAd | null> {
  if (
    !ADS_SETTINGS.house.endpoint ||
    signal.aborted ||
    (typeof navigator !== 'undefined' && navigator.onLine === false)
  )
    return null;
  const url = new URL(ADS_SETTINGS.house.endpoint);
  url.searchParams.set('placement', placement);
  const response = await fetcher(url, { signal, credentials: 'omit', cache: 'no-store' });
  if (!response.ok) return null;
  const body = await boundedAdJson(response, 16_000);
  return body && typeof body === 'object' && 'ad' in body && validHouseAd(body.ad) ? body.ad : null;
}

export async function playHouseAd(
  placement: AdPlacement,
  callbacks: RewardAdCallbacks,
  context: RewardAdContext,
) {
  const { host, signal } = context;
  let timer: ReturnType<typeof setInterval> | undefined;
  let observer: IntersectionObserver | undefined;
  let image: HTMLImageElement | undefined;
  let imageVisible = false;
  let stopped = false;
  let focused = typeof document !== 'undefined' && document.hasFocus();
  let sample = () => {};
  const focus = () => {
    focused = true;
    sample();
  };
  const blur = () => {
    sample();
    focused = false;
    sample();
  };
  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    observer?.disconnect();
    signal.removeEventListener('abort', cleanup);
    document.removeEventListener('visibilitychange', sample);
    window.removeEventListener('focus', focus);
    window.removeEventListener('blur', blur);
    if (image) image.onload = image.onerror = null;
  };
  signal.addEventListener('abort', cleanup, { once: true });
  try {
    const ad = await requestHouseAd(placement, signal);
    if (signal.aborted || !host.isConnected) {
      cleanup();
      return;
    }
    if (!ad) throw Error('no-ad');
    const content = document.createElement('div');
    content.style.cssText = 'display:grid;gap:8px;width:100%;text-align:center';
    const label = document.createElement('small');
    label.textContent = `广告 · ${ad.name}`;
    label.style.cssText = 'font-size:12px;letter-spacing:0;overflow-wrap:anywhere';
    const link = document.createElement('a');
    link.href = ad.targetUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', `打开推广页：${ad.name}`);
    image = document.createElement('img');
    image.alt = ad.name;
    image.referrerPolicy = 'no-referrer';
    image.style.cssText =
      'display:block;max-width:100%;max-height:min(26vh,220px);object-fit:contain;margin:auto';
    const status = document.createElement('small');
    status.textContent = '正在加载广告图片…';
    status.style.cssText = 'font-size:12px;letter-spacing:0;line-height:1.6';
    link.append(image);
    content.append(label, link, status);
    host.replaceChildren(content);
    host.style.cssText =
      'height:auto;min-height:0;margin:12px 0;padding:12px;font-size:14px;letter-spacing:normal';
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        image!.src = '';
        reject(new Error('cancelled'));
      };
      const done = (error?: Error) => {
        signal.removeEventListener('abort', abort);
        image!.onload = image!.onerror = null;
        if (error) reject(error);
        else resolve();
      };
      image!.onload = () => done();
      image!.onerror = () => done(new Error('image-unavailable'));
      signal.addEventListener('abort', abort, { once: true });
      image!.src = ad.imageUrl;
    });
    if (signal.aborted || !host.isConnected) {
      cleanup();
      return;
    }
    const clock = new HouseAdClock();
    sample = () => {
      if (stopped) return;
      if (signal.aborted || !host.isConnected) {
        cleanup();
        return;
      }
      const visible = document.visibilityState === 'visible' && focused && imageVisible;
      const seconds = clock.sample(performance.now(), visible);
      context.onProgress(seconds);
      status.textContent = visible
        ? `观看 ${seconds} 秒后可领取；点击图片可另开推广页。`
        : '回到当前页面并显示图片后继续观看。';
      if (clock.remaining === 0) {
        status.textContent = '观看已完成，可领取奖励；点击图片可另开推广页。';
        cleanup();
        callbacks.onWatched();
      }
    };
    document.addEventListener('visibilitychange', sample);
    window.addEventListener('focus', focus);
    window.addEventListener('blur', blur);
    // 原生交集同时计算视口和滚动祖先的裁剪，不能把面板外的图片算作观看。
    observer = new IntersectionObserver(
      ([entry]) => {
        imageVisible = entry.isIntersecting && entry.intersectionRatio >= 0.5;
        sample();
      },
      { threshold: [0, 0.5, 1] },
    );
    observer.observe(image);
    callbacks.onStarted?.();
    sample();
    if (!stopped) timer = setInterval(sample, 100);
  } catch {
    cleanup();
    if (!signal.aborted && host.isConnected) callbacks.onFailed('图片广告暂不可用');
  }
}
