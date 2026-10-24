// 只在前台自动历练时持有屏幕常亮请求，不写入存档。
export class ScreenAwake {
  private wanted = false;
  private lock: WakeLockSentinel | null = null;
  private pending = false;
  private retryAt = 0;
  private generation = 0;
  private recoverAt = 0;
  private browser: Partial<Pick<Navigator, 'wakeLock'>>;
  private page: Pick<Document, 'visibilityState' | 'addEventListener'>;

  constructor(
    browser: Partial<Pick<Navigator, 'wakeLock'>> = navigator,
    page: Pick<Document, 'visibilityState' | 'addEventListener'> = document,
    orientation: Pick<ScreenOrientation, 'addEventListener'> | undefined = typeof screen ===
    'undefined'
      ? undefined
      : screen.orientation,
  ) {
    this.browser = browser;
    this.page = page;
    const refresh = () => {
      this.generation++;
      this.retryAt = 0;
      this.update();
    };
    for (const event of ['visibilitychange', 'fullscreenchange', 'webkitfullscreenchange'])
      page.addEventListener(event, refresh);
    page.addEventListener('focus', refresh, true);
    orientation?.addEventListener('change', refresh);
  }

  setActive(active: boolean) {
    if (this.wanted !== active) {
      this.wanted = active;
      this.generation++;
      this.retryAt = this.recoverAt = 0;
    }
    this.update();
  }

  private update() {
    if (!this.wanted || this.page.visibilityState !== 'visible') {
      const lock = this.lock;
      this.lock = null;
      if (lock) void lock.release().catch(() => {});
      return;
    }
    if (this.lock && !this.lock.released) return;
    if (!this.browser.wakeLock || this.pending || Date.now() < this.retryAt) return;
    this.pending = true;
    // 系统拒绝或收回常亮时限频重试，切回前台或重新开启可立即申请。
    this.retryAt = Date.now() + 30_000;
    void this.acquire(this.generation);
  }

  private async acquire(generation: number) {
    try {
      const lock = await this.browser.wakeLock!.request('screen');
      if (
        generation !== this.generation ||
        !this.wanted ||
        this.page.visibilityState !== 'visible'
      ) {
        await lock.release();
        return;
      }
      if (lock.released) return;
      this.lock = lock;
      lock.addEventListener(
        'release',
        () => {
          if (this.lock !== lock) return;
          this.lock = null;
          // 系统首次收回时立即补一次；连续收回仍保持限频，避免逐帧请求。
          if (Date.now() >= this.recoverAt) {
            this.recoverAt = Date.now() + 30_000;
            this.retryAt = 0;
          }
          this.update();
        },
        { once: true },
      );
    } catch {
      // 省电策略或浏览器权限可以拒绝常亮，不中断历练。
    } finally {
      this.pending = false;
      if (generation !== this.generation) this.update();
    }
  }
}
