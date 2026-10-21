import { ModuleSource, retryModule } from './module-source.ts';
import type { Orientation } from './orientation.ts';

type FullscreenRoot = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

const mobile = () => matchMedia('(pointer: coarse)').matches;

export class MobileDisplay {
  private wanted = false;
  private owns = false;
  private task: Promise<void> | null = null;
  private mode = new ModuleSource<Orientation>(async (attempt) => {
    const module = attempt
      ? await retryModule<typeof import('./orientation.ts')>('orientation', 'screen', attempt)
      : await import('./orientation.ts');
    return new module.Orientation(
      () => this.wanted && this.active,
      () => this.enter(),
      () => this.leave(),
    );
  });

  async mount(host: HTMLElement) {
    if (!mobile()) return;
    try {
      (await this.mode.load()).mount(host);
    } catch {
      host.hidden = false;
      host.textContent = '请重开设置。';
    }
  }

  constructor(onChange: () => void) {
    const changed = () => {
      if (!this.active) {
        this.wanted = false;
        this.owns = false;
        this.mode.current?.release();
      }
      onChange();
    };
    for (const event of ['fullscreenchange', 'webkitfullscreenchange'])
      document.addEventListener(event, changed);
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
    if (!mobile()) return Promise.resolve();
    this.wanted = true;
    // 在点击调用栈中立即请求全屏，不能延迟到资源加载或下一帧。
    return (this.task ??= this.acquire().finally(() => {
      this.task = null;
    }));
  }

  private async acquire() {
    if (!this.active) {
      const root = document.documentElement as FullscreenRoot;
      try {
        if (root.requestFullscreen) await root.requestFullscreen({ navigationUI: 'hide' });
        else if (root.webkitRequestFullscreen) await root.webkitRequestFullscreen();
        else return;
        this.owns = true;
      } catch {
        return;
      }
    }
    if (!this.wanted) await this.exit();
    else
      try {
        if (!(await (await this.mode.load()).apply())) await this.exit();
      } catch {
        // 方向设置加载失败不阻断入场；下次明确操作可重试。
      }
  }

  leave() {
    this.wanted = false;
    return this.exit();
  }

  private async exit() {
    this.mode.current?.release();
    if (!this.owns) return !this.active;
    const doc = document as FullscreenDocument;
    try {
      if (doc.exitFullscreen) await doc.exitFullscreen();
      else await doc.webkitExitFullscreen?.();
    } catch {
      // 浏览器可能已自行退出全屏，不影响返回首页。
    }
    if (!this.active) this.owns = false;
    return !this.active;
  }
}
