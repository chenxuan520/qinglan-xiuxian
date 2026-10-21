export type OrientationPreference = 'system' | 'portrait' | 'landscape';
export const ORIENTATION_KEY = 'qinglan-screen-orientation';
const choices = [
  ['system', '跟随系统'],
  ['portrait', '竖屏'],
  ['landscape', '横屏'],
] as const;
type OrientationAPI = {
  lock?: (mode: 'portrait' | 'landscape') => Promise<void>;
  unlock?: () => void;
};
const orientationAPI = () =>
  (typeof screen === 'undefined' ? undefined : screen.orientation) as OrientationAPI | undefined;

export class Orientation {
  private preference: OrientationPreference = 'system';
  private owned: OrientationPreference = 'system';
  private pending: Promise<boolean> | null = null;

  private readonly active: () => boolean;
  private readonly enter: () => Promise<void>;

  constructor(
    active: () => boolean = () => false,
    enter: () => Promise<void> = () => Promise.resolve(),
  ) {
    this.active = active;
    this.enter = enter;
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
    return (this.pending ??= this.synchronize(active).finally(() => {
      this.pending = null;
    }));
  }

  private async synchronize(active: () => boolean) {
    for (;;) {
      const mode = active() ? this.preference : 'system';
      if (mode === 'system') {
        this.release();
        return true;
      }
      if (this.owned === mode) return true;
      const api = orientationAPI();
      if (!api?.lock) {
        this.release();
        return false;
      }
      try {
        await api.lock(mode);
        this.owned = mode;
      } catch {
        if ((active() ? this.preference : 'system') !== mode) continue;
        this.release();
        return false;
      }
      // 选择或全屏状态在等待期间变化时，继续同步最新意图。
    }
  }

  release() {
    if (this.owned === 'system') return;
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
    input.onchange = () => {
      if (!host.isConnected) return;
      if (!this.select(input.value)) {
        input.value = this.preference;
        status.textContent = '方向设置尚未保存，请重试。';
        return;
      }
      const selected = this.preference;
      status.textContent = selected === 'system' ? '当前跟随系统方向。' : '正在调整屏幕方向…';
      // 在选择事件内直接申请全屏，保留用户激活；锁方向等待全屏成功后执行。
      const entry = selected === 'system' ? Promise.resolve() : this.enter();
      void entry
        .then(() => this.apply())
        .then((applied) => {
          if (!host.isConnected || this.preference !== selected) return;
          status.textContent =
            selected === 'system'
              ? '当前跟随系统方向。'
              : applied && this.active()
                ? `已锁定${selected === 'portrait' ? '竖屏' : '横屏'}。`
                : '当前浏览器无法锁定方向，可旋转设备或选择跟随系统。';
        });
    };
  }
}
