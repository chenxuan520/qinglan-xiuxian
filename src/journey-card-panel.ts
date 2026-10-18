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
  async show(save: SaveData, reason?: NonNullable<SaveData['pendingReincarnation']>) {
    const { modal, panelFrame } = this;
    panelFrame(
      '此世留影',
      '留存此世 · 山海留痕',
      '<div class="journey-card-preview"><p class="panel-note" role="status">此世经历正落笔成卷，请稍候……可随时关闭。</p></div>',
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
        '<img alt="此世留影纪念卡预览"><div class="save-actions"><button class="primary-button">分享此世</button><a class="secondary-button" download="叩仙门：青岚纪-此世留影.png" target="_blank" rel="noopener" tabindex="0">保存图片</a></div><p class="panel-note" role="status">点击保存图片；手机也可长按图片，或通过「分享此世」保存。纪念图不能代替存档。</p>';
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
          status.textContent = '请查看下载记录；若没有图片，可长按图片或通过「分享此世」保存。';
        } catch {
          status.textContent = '暂时无法下载，请长按图片或通过「分享此世」保存。';
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
        '<p class="panel-note" role="alert">暂时未能留影，请重试或稍后再来。</p><button class="secondary-button" data-action="journey-card">重新生成</button>';
    } finally {
      if (this.request === request) this.request = null;
    }
  }
}
