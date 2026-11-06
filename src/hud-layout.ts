import { compactHud } from './compact-hud.ts';

// 信息栏只在尺寸或视口变化时测量，避免每次刷新气血、年岁后同步触发布局。
export class HudLayout {
  private readonly root: HTMLElement;
  private timer: HTMLElement | null = null;
  private boss: HTMLElement | null = null;
  private hud: HTMLElement | null = null;
  private notice: HTMLElement | null = null;
  private prompt: HTMLElement | null = null;
  private compact = false;
  private bossVisible = false;
  private noticeVisible = false;
  private promptVisible = false;
  private observer: ResizeObserver | null = null;
  private pending: number | null = null;
  private width = 0;
  private height = 0;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  reset() {
    this.observer?.disconnect();
    this.observer = null;
    if (this.pending !== null) cancelAnimationFrame(this.pending);
    this.pending = null;
    this.timer = this.boss = null;
    this.hud = this.notice = this.prompt = null;
    if (this.compact) {
      this.root.style.removeProperty('--battle-notice-space');
      this.root.style.removeProperty('--battle-prompt-space');
    }
    this.compact = this.bossVisible = this.noticeVisible = this.promptVisible = false;
  }

  update() {
    const compact = compactHud();
    const timer = this.root.querySelector<HTMLElement>('.stage-timer');
    const boss = this.root.querySelector<HTMLElement>('#boss-bar');
    const hud = compact ? this.root.querySelector<HTMLElement>('.game-hud') : null;
    const notice = compact ? this.root.querySelector<HTMLElement>('#notice') : null;
    const prompt = compact ? this.root.querySelector<HTMLElement>('#cache-prompt') : null;
    if (!timer || !boss || (compact && !hud)) return;
    if (
      timer !== this.timer ||
      boss !== this.boss ||
      compact !== this.compact ||
      hud !== this.hud ||
      notice !== this.notice ||
      prompt !== this.prompt
    ) {
      this.reset();
      this.timer = timer;
      this.boss = boss;
      this.compact = compact;
      this.hud = hud;
      this.notice = notice;
      this.prompt = prompt;
      if (typeof ResizeObserver !== 'undefined') {
        this.observer = new ResizeObserver(() => this.schedule());
        const elements = [timer, boss, hud ?? this.root.querySelector('.game-hud')];
        if (compact) elements.push(notice, prompt);
        for (const el of elements) if (el) this.observer.observe(el);
      }
      this.schedule();
    }
    if (compact) {
      // 通知用 visible 类，守匣用 hidden；读显隐属性不会同步触发布局。
      const noticeVisible = !!notice && !notice.hidden && notice.classList.contains('visible');
      const promptVisible = !!prompt && !prompt.hidden;
      const bossVisible = !boss.hidden;
      if (
        bossVisible !== this.bossVisible ||
        noticeVisible !== this.noticeVisible ||
        promptVisible !== this.promptVisible
      ) {
        this.bossVisible = bossVisible;
        this.noticeVisible = noticeVisible;
        this.promptVisible = promptVisible;
        this.schedule();
      }
    }
    if (
      window.innerWidth !== this.width ||
      window.innerHeight !== this.height ||
      (!this.observer && !compact)
    )
      this.schedule();
    this.width = window.innerWidth;
    this.height = window.innerHeight;
  }

  private schedule() {
    if (this.pending !== null || !this.timer) return;
    this.pending = requestAnimationFrame(() => {
      this.pending = null;
      const timer = this.timer;
      const boss = this.boss;
      if (!timer?.isConnected || !boss?.isConnected || !this.root.contains(timer)) return;
      const anchor = this.compact ? this.hud : timer;
      if (!anchor?.isConnected) return;
      // 先读取两处位置，再写入定位变量；妖王栏可能因计时栏移位，再核对一帧。
      const timerBottom = `${Math.ceil(anchor.getBoundingClientRect().bottom)}px`;
      const infoBottom = boss.hidden
        ? timerBottom
        : `${Math.ceil(boss.getBoundingClientRect().bottom)}px`;
      const noticeHeight =
        this.compact &&
        this.notice?.isConnected &&
        !this.notice.hidden &&
        this.notice.classList.contains('visible')
          ? this.notice.getBoundingClientRect().height
          : 0;
      const promptHeight =
        this.compact && this.prompt?.isConnected && !this.prompt.hidden
          ? this.prompt.getBoundingClientRect().height
          : 0;
      const timerMoved = this.root.style.getPropertyValue('--battle-timer-bottom') !== timerBottom;
      if (timerMoved) this.root.style.setProperty('--battle-timer-bottom', timerBottom);
      if (this.root.style.getPropertyValue('--battle-info-bottom') !== infoBottom)
        this.root.style.setProperty('--battle-info-bottom', infoBottom);
      if (this.compact) {
        for (const [name, height] of [
          ['--battle-notice-space', noticeHeight],
          ['--battle-prompt-space', promptHeight],
        ] as const) {
          const space = `${height > 0 ? Math.ceil(height) + 8 : 0}px`;
          if (this.root.style.getPropertyValue(name) !== space)
            this.root.style.setProperty(name, space);
        }
      }
      if (timerMoved && !boss.hidden) this.schedule();
    });
  }
}
