import { DEBUG_SETTINGS } from './setting.ts';
import type { DebugHost } from './debug-panel.ts';

type DebugModule = Pick<typeof import('./debug-panel.ts'), 'openDebugPanel'>;
export class DebugEntry {
  private button: HTMLElement | null = null;
  private taps = 0;
  private since = 0;
  private busy = false;
  private readonly host: DebugHost;
  private readonly load: () => Promise<DebugModule>;
  private readonly now: () => number;
  constructor(host: DebugHost, load: () => Promise<DebugModule>, now = () => Date.now()) {
    this.host = host;
    this.load = load;
    this.now = now;
  }
  async tap(button: HTMLElement | null) {
    if (!button?.isConnected || !this.host.canOpen() || this.busy) return;
    const now = this.now();
    if (button !== this.button || now - this.since > DEBUG_SETTINGS.tapWindowMs) {
      this.button = button;
      this.taps = 0;
      this.since = now;
    }
    if (++this.taps < DEBUG_SETTINGS.taps) return;
    this.taps = 0;
    this.busy = true;
    const current = () => button.isConnected && this.host.canOpen();
    try {
      const module = await this.load();
      if (current()) await module.openDebugPanel(this.host, current);
    } catch {
      if (current()) this.host.toast('调试面板暂时无法载入，请重试。');
    } finally {
      this.busy = false;
    }
  }
}
