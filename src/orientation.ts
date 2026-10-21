export type OrientationPreference = 'system' | 'portrait' | 'landscape';
export const ORIENTATION_KEY = 'qinglan-screen-orientation';
const choices = [
  ['system', '跟随系统'],
  ['portrait', '竖屏'],
  ['landscape', '横屏'],
] as const;
type OrientationAPI = {
  type?: string;
  lock?: (mode: 'portrait' | 'landscape') => Promise<void>;
  unlock?: () => void;
};
const orientationAPI = () =>
  (typeof screen === 'undefined' ? undefined : screen.orientation) as OrientationAPI | undefined;

export class Orientation {
  private preference: OrientationPreference = 'system';
  private owned: OrientationPreference = 'system';
  private pending: Promise<boolean> | null = null;
  private request = 0;
  private expiredRequest = 0;
  private latestActive: () => boolean;
  private status?: HTMLElement;

  private readonly active: () => boolean;
  private readonly enter: () => Promise<void>;
  private readonly leave: () => Promise<boolean | void>;

  constructor(
    active: () => boolean = () => false,
    enter: () => Promise<void> = () => Promise.resolve(),
    leave: () => Promise<boolean | void> = () => Promise.resolve(),
  ) {
    this.active = active;
    this.latestActive = active;
    this.enter = enter;
    this.leave = leave;
    try {
      const stored = localStorage.getItem(ORIENTATION_KEY);
      if (stored === 'portrait' || stored === 'landscape') this.preference = stored;
    } catch {
      // 缺省或无法读取时沿用系统，不影响游戏存档。
    }
  }

  get selected() {
    return this.preference;
  }

  select(value: string) {
    if (!choices.some(([id]) => id === value)) return false;
    try {
      localStorage.setItem(ORIENTATION_KEY, value);
    } catch {
      return false;
    }
    this.preference = value as OrientationPreference;
    return true;
  }

  apply(active: () => boolean = this.active): Promise<boolean> {
    this.latestActive = active;
    if (this.pending) return this.pending;
    const request = ++this.request;
    let timer: ReturnType<typeof setTimeout>;
    const work = this.synchronize(active, request);
    const deadline = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => {
        if (this.current(request)) {
          this.expiredRequest = request;
          this.release(true);
        }
        resolve(false);
      }, 2000);
    });
    const pending = Promise.race([work, deadline]).finally(() => {
      clearTimeout(timer);
      if (this.pending === pending) this.pending = null;
    });
    return (this.pending = pending);
  }

  private current(request: number) {
    return request === this.request && request !== this.expiredRequest;
  }

  private matches(mode: 'portrait' | 'landscape', api = orientationAPI()) {
    return (
      (!api?.type || api.type.startsWith(mode)) &&
      (typeof matchMedia === 'undefined' || matchMedia(`(orientation: ${mode})`).matches)
    );
  }

  private async reconcileLate(): Promise<boolean> {
    const mode = this.latestActive() ? this.preference : 'system';
    if (mode === 'system') {
      this.release(true);
      return true;
    }
    // 旧请求可能只晚报成功，也可能真的又转了屏；保留正确的新锁，只修复实际偏离。
    if (this.matches(mode)) {
      this.owned = mode;
      return true;
    }
    this.owned = 'system';
    const pending = this.apply(this.latestActive);
    const request = this.request;
    const applied = await pending;
    if (!applied && request === this.request) {
      const restored = await this.leave();
      if (request === this.request && this.status?.isConnected)
        this.status.textContent =
          restored === false
            ? '显示尚未还原，请重新选择跟随系统。'
            : this.preference === 'system'
              ? '当前跟随系统方向。'
              : '当前浏览器无法锁定方向，已还原显示；可选择跟随系统。';
    }
    return applied;
  }

  private async synchronize(active: () => boolean, request: number): Promise<boolean> {
    for (;;) {
      const mode = active() ? this.preference : 'system';
      if (mode === 'system') {
        this.release();
        return true;
      }
      if (this.owned === mode) return true;
      const api = orientationAPI();
      if (!api?.lock) {
        this.release(true);
        return false;
      }
      try {
        await api.lock(mode);
        if (!this.current(request)) return this.reconcileLate();
        this.owned = mode;
        // 不只信任lock的Promise；部分WebView全屏后仍维持相反方向。
        const matches = () => this.matches(mode, api);
        const until = Date.now() + 500;
        while (
          this.current(request) &&
          active() &&
          this.preference === mode &&
          !matches() &&
          Date.now() < until
        )
          await new Promise((resolve) => setTimeout(resolve, 25));
        if (!this.current(request)) return this.reconcileLate();
        if (active() && this.preference === mode && !matches()) {
          this.release(true);
          return false;
        }
      } catch {
        if (!this.current(request)) return true;
        if ((active() ? this.preference : 'system') !== mode) continue;
        this.release(true);
        return false;
      }
      // 选择或全屏状态在等待期间变化时，继续同步最新意图。
    }
  }

  release(force = false) {
    if (this.owned === 'system' && !force) return;
    this.owned = 'system';
    try {
      orientationAPI()?.unlock?.();
    } catch {
      // 浏览器退出全屏可能已经解除方向锁。
    }
  }

  mount(host: HTMLElement) {
    if (!host.isConnected || !matchMedia('(pointer: coarse)').matches) return;
    host.hidden = false;
    host.innerHTML = `<div class="settings-section-heading"><h3>屏幕方向</h3></div><label class="settings-build-field">手机显示<select id="display-orientation" aria-label="手机屏幕方向">${choices.map(([id, name]) => `<option value="${id}" ${id === this.preference ? 'selected' : ''}>${name}</option>`).join('')}</select></label><p>默认跟随系统，选择竖屏或横屏可锁定方向。此选择在本机保留。</p><p class="panel-note" data-orientation-status role="status">部分浏览器不支持方向锁定，仍会跟随系统。</p>`;
    const input = host.querySelector<HTMLSelectElement>('select')!;
    const status = host.querySelector<HTMLElement>('[data-orientation-status]')!;
    this.status = status;
    input.onchange = () => {
      if (!host.isConnected) return;
      if (!this.select(input.value)) {
        input.value = this.preference;
        status.textContent = '方向设置尚未保存，请重试。';
        return;
      }
      const selected = this.preference;
      status.textContent = selected === 'system' ? '当前跟随系统方向。' : '正在调整屏幕方向…';
      if (selected === 'system' || !orientationAPI()?.lock) {
        // 一些浏览器的全屏会隐式横屏；无锁定能力时不进入全屏，跟随系统须可直接恢复。
        this.release(true);
        void this.leave().then((restored) => {
          if (!host.isConnected || this.preference !== selected) return;
          status.textContent =
            restored === false
              ? '显示尚未还原，请重新选择跟随系统。'
              : selected === 'system'
                ? '当前跟随系统方向。'
                : '当前浏览器无法锁定方向，已还原显示；可选择跟随系统。';
        });
        return;
      }
      // 在选择事件内直接申请全屏，保留用户激活；锁方向等待全屏成功后执行。
      const entry = this.enter();
      void entry
        .then(() => this.apply())
        .then(async (applied) => {
          if (!host.isConnected || this.preference !== selected) return;
          const locked = applied && this.active();
          const restored = locked || (await this.leave());
          if (!host.isConnected || this.preference !== selected) return;
          status.textContent = locked
            ? `已锁定${selected === 'portrait' ? '竖屏' : '横屏'}。`
            : restored === false
              ? '显示尚未还原，请重新选择跟随系统。'
              : '当前浏览器无法锁定方向，已还原显示；可选择跟随系统。';
        });
    };
  }
}
