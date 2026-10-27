import {
  AD_DURATION_MS,
  type AdPlacement,
  type RewardAdCallbacks,
  type RewardAdContext,
} from './ads.ts';
import { ADS_SETTINGS } from './setting.ts';
import {
  validHouseAd,
  houseAdDeviceFromUserAgent,
  type HouseAd,
  type HouseAdDevice,
} from './house-ad-contract.ts';
import { adTracker } from './ad-metrics.ts';
import { adReceiptId } from './ad-metrics-contract.ts';
import { adLoadJson } from './ad-load-request.ts';
import { AdLoadTrace } from './ad-load-diagnostics.ts';
import { takePreparedAd } from './ad-preload-cache.ts';

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
  trace?: AdLoadTrace,
  usePrepared = true,
  campaign?: string,
): Promise<(HouseAd & { receipt?: string; device: HouseAdDevice; preloaded?: boolean }) | null> {
  if (
    !ADS_SETTINGS.house.endpoint ||
    signal.aborted ||
    (typeof navigator !== 'undefined' && navigator.onLine === false)
  )
    return null;
  if (usePrepared && fetcher === fetch) {
    const prepared = takePreparedAd(placement, device);
    if (prepared) return { ...prepared, device, preloaded: true };
  }
  const url = new URL(ADS_SETTINGS.house.endpoint);
  url.searchParams.set('placement', placement);
  url.searchParams.set('device', device);
  if (campaign) url.searchParams.set('campaign', campaign);
  trace?.at('creative');
  const body = await adLoadJson(url, signal, 16_000, fetcher, trace);
  if (trace && body && typeof body === 'object' && 'ad' in body) {
    if (body.ad === null) trace.empty = true;
    else if (!validHouseAd(body.ad)) trace.code = 'schema';
  } else if (trace && body) trace.code = 'schema';
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
    'position:fixed;inset:0;z-index:1200;box-sizing:border-box;width:100%;height:100vh;height:100dvh;display:grid;grid-template-rows:minmax(0,1fr);background:#071b18;color:#f2ead0;padding:max(12px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(12px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));text-align:center;overscroll-behavior:contain';
  const styles = [content, link, picture, image].map((node) => node.style.cssText);
  content.style.cssText =
    'display:grid;grid-template-rows:auto minmax(0,1fr) 44px;gap:8px;min-width:0;min-height:0;line-height:1.6';
  link.style.cssText = 'display:flex;min-width:0;min-height:0;overflow:hidden';
  picture.style.cssText = 'display:flex;min-width:0;min-height:0;width:100%;height:100%';
  image.style.cssText = 'display:block;width:100%;height:100%;min-height:0;object-fit:contain';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'secondary-button';
  close.textContent = '×';
  close.setAttribute('aria-label', cancel.textContent ?? '关闭广告');
  close.dataset.action = cancel.dataset.action;
  close.style.cssText =
    'position:absolute;right:max(12px,env(safe-area-inset-right));bottom:max(12px,env(safe-area-inset-bottom));width:44px;height:44px;min-height:44px;padding:0;font:24px system-ui;border-radius:50%';
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
    const ad = await requestHouseAd(
      placement,
      signal,
      fetch,
      currentHouseAdDevice(),
      context.trace,
    );
    if (signal.aborted || !host.isConnected) {
      cleanup();
      return;
    }
    if (!ad) throw Error('no-ad');
    let verified = !ad.preloaded;
    let sink = adTracker(ad.receipt),
      pending = !!ad.preloaded;
    const queued: Parameters<typeof sink>[0][] = [];
    const track = (kind: Parameters<typeof sink>[0]) => {
      if (pending) queued.push(kind);
      else sink(kind);
    };
    if (ad.preloaded) {
      const receiptTrace = new AdLoadTrace();
      // 先显示已经备好的图片；新凭条在后台申请，不让统计拖慢播放。
      void requestHouseAd(placement, signal, fetch, ad.device, receiptTrace, false, ad.id)
        .then((fresh) => {
          if (signal.aborted || stopped || !host.isConnected) return;
          pending = false;
          if (
            fresh?.id === ad.id &&
            fresh.imageUrl === ad.imageUrl &&
            fresh.mobileImageUrl === ad.mobileImageUrl &&
            fresh.targetUrl === ad.targetUrl
          ) {
            sink = adTracker(fresh.receipt);
            verified = true;
            queued.forEach(sink);
            sample();
          } else {
            if (context.trace) {
              context.trace.at('creative');
              context.trace.code = receiptTrace.code;
              context.trace.status = receiptTrace.status;
              context.trace.empty = receiptTrace.empty;
              context.trace.silent = !!fresh;
            }
            cleanup();
            callbacks.onFailed('广告投放已更新');
          }
          queued.length = 0;
        })
        .catch(() => {
          pending = false;
          queued.length = 0;
        });
    }
    const content = document.createElement('div');
    content.style.cssText = 'display:grid;gap:8px;width:100%;text-align:center';
    const label = document.createElement('small');
    label.textContent = '广告';
    label.style.cssText = 'font:12px system-ui;letter-spacing:0;justify-self:start;opacity:.65';
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
    status.textContent = '加载中…';
    status.style.cssText =
      'font:14px/44px system-ui;letter-spacing:0;padding:0 52px;white-space:nowrap';
    const picture = document.createElement('picture');
    picture.append(image);
    link.append(picture);
    content.append(label, link, status);
    host.replaceChildren(content);
    host.style.cssText =
      'height:auto;min-height:0;margin:12px 0;padding:12px;font-size:14px;letter-spacing:normal';
    uncover = coverHouseAd(host, content, link, picture, image);
    context.trace?.at('image');
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
      if (context.trace) context.trace.code = 'network';
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
        if (context.trace) context.trace.code = 'invalid';
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
      status.textContent = visible ? `${seconds} 秒` : '已暂停';
      if (clock.remaining === 0 && verified) {
        completed = true;
        cleanup();
        host.replaceChildren();
        host.hidden = true;
        host.style.display = 'none';
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
    if (context.trace?.stage === 'image') context.trace.code = 'network';
    cleanup();
    if (!signal.aborted && host.isConnected) callbacks.onFailed('图片广告暂不可用');
  }
}
