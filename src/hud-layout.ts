// 信息栏只在尺寸或视口变化时测量，避免每次刷新气血、年岁后同步触发布局。
export class HudLayout {
  private readonly root: HTMLElement;
  private timer: HTMLElement | null = null;
  private boss: HTMLElement | null = null;
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
  }

  update() {
    const timer = this.root.querySelector<HTMLElement>('.stage-timer');
    const boss = this.root.querySelector<HTMLElement>('#boss-bar');
    if (!timer || !boss) return;
    if (timer !== this.timer || boss !== this.boss) {
      this.reset();
      this.timer = timer;
      this.boss = boss;
      if (typeof ResizeObserver !== 'undefined') {
        this.observer = new ResizeObserver(() => this.schedule());
        for (const el of [timer, boss, this.root.querySelector('.game-hud')])
          if (el) this.observer.observe(el);
      }
      this.schedule();
    }
    if (window.innerWidth !== this.width || window.innerHeight !== this.height || !this.observer)
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
      // 先读取两处位置，再写入定位变量；妖王栏可能因计时栏移位，再核对一帧。
      const timerBottom = `${Math.ceil(timer.getBoundingClientRect().bottom)}px`;
      const infoBottom = boss.hidden
        ? timerBottom
        : `${Math.ceil(boss.getBoundingClientRect().bottom)}px`;
      const timerMoved = this.root.style.getPropertyValue('--battle-timer-bottom') !== timerBottom;
      if (timerMoved) this.root.style.setProperty('--battle-timer-bottom', timerBottom);
      if (this.root.style.getPropertyValue('--battle-info-bottom') !== infoBottom)
        this.root.style.setProperty('--battle-info-bottom', infoBottom);
      if (timerMoved && !boss.hidden) this.schedule();
    });
  }
}
