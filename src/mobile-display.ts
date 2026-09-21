type FullscreenRoot = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

export class MobileDisplay {
  private wanted = false;
  private ownsFullscreen = false;
  private pending: Promise<void> | null = null;

  constructor(onChange: () => void) {
    const changed = () => {
      if (!this.active) {
        this.wanted = false;
        this.ownsFullscreen = false;
      }
      onChange();
    };
    document.addEventListener('fullscreenchange', changed);
    document.addEventListener('webkitfullscreenchange', changed);
  }

  get active() {
    const doc = document as FullscreenDocument;
    return !!(doc.fullscreenElement || doc.webkitFullscreenElement);
  }

  get available() {
    const root = document.documentElement as FullscreenRoot;
    return !!(root.requestFullscreen || root.webkitRequestFullscreen);
  }

  enter(): Promise<void> {
    if (!matchMedia('(pointer: coarse)').matches) return Promise.resolve();
    this.wanted = true;
    // 在点击调用栈中立即请求全屏，不能延迟到资源加载或下一帧。
    return (this.pending ??= this.acquire().finally(() => {
      this.pending = null;
    }));
  }

  private async acquire() {
    if (!this.active) {
      const root = document.documentElement as FullscreenRoot;
      try {
        if (root.requestFullscreen) await root.requestFullscreen({ navigationUI: 'hide' });
        else if (root.webkitRequestFullscreen) await root.webkitRequestFullscreen();
        else return;
        this.ownsFullscreen = this.active;
      } catch {
        return;
      }
    }
    // 方向由设备与系统设置决定，仅管理本次自动全屏。
    if (!this.wanted) await this.release();
  }

  leave() {
    this.wanted = false;
    return this.release();
  }

  private async release() {
    if (!this.ownsFullscreen || !this.active) return;
    this.ownsFullscreen = false;
    const doc = document as FullscreenDocument;
    try {
      if (doc.exitFullscreen) await doc.exitFullscreen();
      else await doc.webkitExitFullscreen?.();
    } catch {
      // 浏览器可能已自行退出全屏，不影响返回首页。
    }
  }
}
