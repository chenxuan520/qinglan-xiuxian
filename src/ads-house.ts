import {
  AD_DURATION_MS,
  type AdPlacement,
  type RewardAdCallbacks,
  type RewardAdContext,
} from './ads.ts';
import { ADS_SETTINGS } from './setting.ts';
import {
  boundedAdJson,
  validHouseAd,
  houseAdDeviceFromUserAgent,
  type HouseAd,
  type HouseAdDevice,
} from './house-ad-contract.ts';
import { adTracker } from './ad-metrics.ts';
import { adReceiptId } from './ad-metrics-contract.ts';

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
export function currentHouseAdDevice(): HouseAdDevice {
  if (typeof navigator === 'undefined') return 'desktop';
  const mobile = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData
    ?.mobile;
  if (houseAdDeviceFromUserAgent(navigator.userAgent, mobile ? '?1' : undefined) === 'mobile')
    return 'mobile';
  // iPad桌面UA及触屏模拟仍按手机渠道；桌面缩窄窗口、手机转屏均不改变渠道。
  return navigator.maxTouchPoints > 0 &&
    (/Macintosh/i.test(navigator.userAgent) ||
      (typeof window !== 'undefined' && window.matchMedia?.('(pointer:coarse)').matches))
    ? 'mobile'
    : 'desktop';
}
export async function requestHouseAd(
  placement: AdPlacement,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
  device = currentHouseAdDevice(),
): Promise<(HouseAd & { receipt?: string; device: HouseAdDevice }) | null> {
  if (
    !ADS_SETTINGS.house.endpoint ||
    signal.aborted ||
    (typeof navigator !== 'undefined' && navigator.onLine === false)
  )
    return null;
  const url = new URL(ADS_SETTINGS.house.endpoint);
  url.searchParams.set('placement', placement);
  url.searchParams.set('device', device);
  const response = await fetcher(url, { signal, credentials: 'omit', cache: 'no-store' });
  if (!response.ok) return null;
  const body = await boundedAdJson(response, 16_000);
  return body && typeof body === 'object' && 'ad' in body && validHouseAd(body.ad)
    ? {
        ...body.ad,
        device,
        ...('receipt' in body && adReceiptId(body.receipt) ? { receipt: body.receipt } : {}),
      }
    : null;
}

// 只在本次广告期间覆盖游戏；结束、取消或故障后释放焦点与原面板。
function coverHouseAd(
  host: HTMLElement,
  content: HTMLElement,
  link: HTMLAnchorElement,
  picture: HTMLPictureElement,
  image: HTMLImageElement,
) {
  const panel = host.closest<HTMLElement>('.result-panel');
  const root = host.closest<HTMLElement>('#modal-root');
  const cancel = panel?.querySelector<HTMLButtonElement>('.result-actions .secondary-button');
  if (!panel || !root || !cancel) throw Error('ad-panel-unavailable');
  const layer = document.createElement('section');
  layer.className = 'house-ad-overlay';
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-modal', 'true');
  layer.setAttribute('aria-label', '广告展示');
  layer.style.cssText =
    'position:fixed;inset:0;z-index:1200;box-sizing:border-box;width:100%;height:100vh;height:100dvh;display:grid;grid-template-rows:minmax(0,1fr) auto;gap:12px;background:#071b18;color:#f2ead0;padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));text-align:center;overscroll-behavior:contain';
  const styles = [content, link, picture, image].map((node) => node.style.cssText);
  content.style.cssText =
    'display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:12px;min-width:0;min-height:0;line-height:1.6';
  link.style.cssText = 'display:flex;min-width:0;min-height:0;overflow:hidden';
  picture.style.cssText = 'display:flex;min-width:0;min-height:0;width:100%;height:100%';
  image.style.cssText = 'display:block;width:100%;height:100%;min-height:0;object-fit:contain';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'secondary-button';
  close.textContent = cancel.textContent;
  close.dataset.action = cancel.dataset.action;
  close.style.cssText = 'justify-self:center;max-width:100%;min-height:44px';
  const visibility = panel.style.visibility,
    inert = panel.inert;
  panel.style.visibility = 'hidden';
  panel.inert = true;
  layer.append(content, close);
  root.append(layer);
  close.focus({ preventScroll: true });
  return () => {
    layer.remove();
    panel.style.visibility = visibility;
    panel.inert = inert;
    [content, link, picture, image].forEach((node, i) => (node.style.cssText = styles[i]));
    if (host.isConnected) host.replaceChildren(content);
  };
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
  let completed = false;
  let uncover = () => {};
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
    uncover();
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
    const track = adTracker(ad.receipt);
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
    link.addEventListener('click', () => {
      if (
        (!signal.aborted || completed) &&
        host.isConnected &&
        image?.complete &&
        image.naturalWidth > 0
      )
        track('clicked');
    });
    image = document.createElement('img');
    image.alt = ad.name;
    image.referrerPolicy = 'no-referrer';
    image.style.cssText =
      'display:block;max-width:100%;max-height:min(26vh,220px);object-fit:contain;margin:auto';
    const status = document.createElement('small');
    status.textContent = '正在加载广告图片…';
    status.style.cssText = 'font-size:12px;letter-spacing:0;line-height:1.6';
    const picture = document.createElement('picture');
    picture.append(image);
    link.append(picture);
    content.append(label, link, status);
    host.replaceChildren(content);
    host.style.cssText =
      'height:auto;min-height:0;margin:12px 0;padding:12px;font-size:14px;letter-spacing:normal';
    uncover = coverHouseAd(host, content, link, picture, image);
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
      image!.src = ad.device === 'mobile' ? (ad.mobileImageUrl ?? ad.imageUrl) : ad.imageUrl;
    });
    if (signal.aborted || !host.isConnected) {
      cleanup();
      return;
    }
    const clock = new HouseAdClock();
    image.onerror = () => {
      cleanup();
      if (!signal.aborted && host.isConnected) callbacks.onFailed('图片广告暂不可用');
    };
    sample = () => {
      if (stopped) return;
      if (signal.aborted || !host.isConnected) {
        cleanup();
        return;
      }
      // picture 换源失败时可能没有派发 error，仍须回退，不能卡住观看。
      if (image!.complete && image!.naturalWidth === 0) {
        cleanup();
        callbacks.onFailed('图片广告暂不可用');
        return;
      }
      const visible =
        document.visibilityState === 'visible' &&
        focused &&
        imageVisible &&
        image!.complete &&
        image!.naturalWidth > 0;
      const seconds = clock.sample(performance.now(), visible);
      if (visible) track('shown');
      context.onProgress(seconds);
      status.textContent = visible
        ? `观看 ${seconds} 秒后返回奖励页；点击图片可另开推广页。`
        : '回到当前页面并显示图片后继续观看。';
      if (clock.remaining === 0) {
        completed = true;
        status.textContent = '观看已完成，可领取奖励；点击图片可另开推广页。';
        cleanup();
        track('watched');
        callbacks.onWatched(() => track('claimed'));
        host
          .closest('.result-panel')
          ?.querySelector<HTMLButtonElement>('.primary-button')
          ?.focus({ preventScroll: true });
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
