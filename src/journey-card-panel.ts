import type { SaveData } from './progress.ts';
import { imageDownloadUrl, shareImage } from './image-share.ts';

export class JourneyCardPanel {
  private request: AbortController | null = null;
  private readonly modal: HTMLDivElement;
  private readonly panelFrame: (title: string, subtitle: string, body: string) => void;
  constructor(
    modal: HTMLDivElement,
    panelFrame: (title: string, subtitle: string, body: string) => void,
  ) {
    this.modal = modal;
    this.panelFrame = panelFrame;
  }
  cancel() {
    this.request?.abort();
    this.request = null;
  }
  async show(save: SaveData, reason?: 'lifespan' | 'tribulation') {
    const { modal, panelFrame } = this;
    panelFrame(
      '此世留影',
      '留存此世 · 山海留痕',
      '<div class="journey-card-preview"><p class="panel-note" role="status">正在写下此世评语并生成留影，请稍候……可随时关闭。</p></div>',
    );
    const request = new AbortController();
    this.request = request;
    const host = modal.querySelector<HTMLElement>('.journey-card-preview')!;
    modal.querySelector('.panel')?.scrollTo(0, 0);
    modal.querySelector<HTMLButtonElement>('[data-action="close"]')?.focus({ preventScroll: true });
    try {
      const snapshot = structuredClone(save);
      const { createJourneyCard } = await import('./journey-card.ts');
      if (!host.isConnected) return;
      const url = await createJourneyCard(snapshot, reason, request.signal);
      if (!host.isConnected) return;
      host.innerHTML =
        '<img alt="此世留影纪念卡预览"><div class="save-actions"><button class="primary-button">分享此世</button><a class="secondary-button" download="叩仙门：青岚纪-此世留影.png" target="_blank" rel="noopener" tabindex="0">保存图片</a></div><p class="panel-note" role="status">保存图片会请求浏览器下载；若未出现下载提示，可长按上方图片保存，或通过「分享此世」选择保存到手机。纪念图不能用于恢复存档，二维码不携带存档数据。</p>';
      host.querySelector('img')!.src = url;
      const download = host.querySelector('a')!;
      download.href = url;
      const file = new File(
        [Uint8Array.from(atob(url.split(',')[1]), (char) => char.charCodeAt(0))],
        download.download,
        { type: 'image/png' },
      );
      const status = host.querySelector<HTMLElement>('[role="status"]')!;
      download.onclick = () => {
        try {
          // 文件已准备完成；在此次点击内同步创建下载地址，保留用户激活。
          download.href = imageDownloadUrl(file);
          status.textContent =
            '已请求下载图片，请查看浏览器下载记录。若未出现下载提示，可长按上方图片保存，或通过「分享此世」选择保存到手机。';
        } catch {
          status.textContent =
            '此浏览器无法直接下载图片，请长按上方图片保存，或通过「分享此世」选择保存到手机。';
        }
      };
      const button = host.querySelector('button')!;
      button.onclick = async () => {
        if (button.disabled) return;
        button.disabled = true;
        const result = await shareImage(file);
        if (!host.isConnected) return;
        button.disabled = false;
        if (result === 'save') {
          download.click();
          return;
        }
        status.textContent =
          result === 'shared' ? '已交给系统分享面板。' : '已取消分享，图片仍在，可再次分享或保存。';
      };
    } catch {
      if (!host.isConnected) return;
      host.innerHTML =
        '<p class="panel-note" role="alert">此世留影生成失败，未能生成图片。请重试，或关闭后稍后再来；此世进度不受影响。</p><button class="secondary-button" data-action="journey-card">重新生成</button>';
    } finally {
      if (this.request === request) this.request = null;
    }
  }
}
