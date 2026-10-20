import { resourceFailureContent } from './resource-panel.ts';
import { resourceFailed } from './update-check.ts';
import type { SaveData } from './progress.ts';
import type { SharingAction } from './sharing.ts';

export class JourneyCardPanel {
  private request: AbortController | null = null;
  private dispose: (() => void) | null = null;
  private readonly modal: HTMLDivElement;
  private readonly panelFrame: (title: string, subtitle: string, body: string) => void;
  private readonly track: (action: SharingAction) => void;
  constructor(
    modal: HTMLDivElement,
    panelFrame: (title: string, subtitle: string, body: string) => void,
    track: (action: SharingAction) => void = () => {},
  ) {
    this.modal = modal;
    this.panelFrame = panelFrame;
    this.track = track;
  }
  cancel() {
    this.request?.abort();
    this.request = null;
    this.dispose?.();
    this.dispose = null;
  }
  async show(save: SaveData, reason?: NonNullable<SaveData['pendingReincarnation']>) {
    this.cancel();
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
    let loaded = false;
    try {
      const snapshot = structuredClone(save);
      const { createJourneyCard, mountJourneyCardActions } = await import('./journey-card.ts');
      if (!host.isConnected || request.signal.aborted) return;
      loaded = true;
      const blob = await createJourneyCard(snapshot, reason, request.signal);
      if (!host.isConnected || request.signal.aborted) return;
      this.dispose = mountJourneyCardActions(host, blob, this.track);
    } catch (error) {
      if (request.signal.aborted) return;
      console.error('此世留影生成失败', error);
      resourceFailed(true);
      if (!host.isConnected) return;
      host.innerHTML = loaded
        ? resourceFailureContent('journey-card', '暂时未能留影，请重试或稍后再来。', '重新生成')
        : resourceFailureContent(
            'refresh-game',
            '留影暂未准备好，请重新加载后再试。',
            '重新加载',
            false,
          );
    } finally {
      if (this.request === request) this.request = null;
    }
  }
}
