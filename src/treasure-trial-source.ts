import { ModuleSource, retryModule } from './module-source.ts';
import { resourceFailureContent } from './resource-panel.ts';

type TrialModule = typeof import('./treasure-trial-ui.ts');

export class TreasureTrialSource extends ModuleSource<TrialModule> {
  active = false;
  private generation = 0;
  private entries = new WeakMap<HTMLElement, string>();

  constructor(
    fetchModule: (attempt: number) => Promise<TrialModule> = (attempt) =>
      attempt
        ? retryModule('treasure-trial-ui', 'treasure-trial', attempt)
        : import('./treasure-trial-ui.ts'),
  ) {
    super(fetchModule);
  }

  stop() {
    this.generation++;
    this.current?.stopTreasureTrial();
    this.active = false;
  }

  async open(ui: HTMLDivElement, modal: HTMLDivElement, treasureId: string, valid: () => boolean) {
    if (this.active || !valid()) return;
    const entry = modal.querySelector<HTMLElement>('[data-treasure-trial-entry]');
    const button = entry?.querySelector<HTMLButtonElement>('[data-action="treasure-trial"]');
    if (!entry || !button || button.disabled) return;
    const original = this.entries.get(entry) ?? entry.innerHTML;
    const label = button.innerHTML;
    const request = ++this.generation;
    button.disabled = true;
    button.textContent = '正在准备试演…';
    try {
      const module = await this.load();
      if (request !== this.generation || !button.isConnected || !valid() || document.hidden) return;
      entry.innerHTML = original;
      this.entries.delete(entry);
      entry.querySelector<HTMLButtonElement>('[data-action="treasure-trial"]')?.focus({
        preventScroll: true,
      });
      this.active = true;
      module.startTreasureTrial(
        ui,
        modal,
        treasureId,
        () => {
          if (request === this.generation) this.active = false;
        },
        valid,
      );
    } catch {
      if (request !== this.generation) return;
      this.active = false;
      if (entry.isConnected && valid()) {
        this.entries.set(entry, original);
        entry.innerHTML = resourceFailureContent(
          'treasure-trial',
          '试演暂未准备好，请重试。',
          '重新试演',
        );
      }
    } finally {
      button.disabled = false;
      button.innerHTML = label;
    }
  }
}

export const treasureTrialSource = new TreasureTrialSource();
