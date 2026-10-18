import { smallIcon } from './icons.ts';

export type PanelLocation = {
  name: string;
  scroll: number;
  action?: string;
  id?: string;
  openDetails: string[];
};
export class PanelHost {
  private readonly modal: HTMLDivElement;
  private readonly ui: HTMLDivElement;
  constructor(modal: HTMLDivElement, ui: HTMLDivElement) {
    this.modal = modal;
    this.ui = ui;
  }
  remember(panel: string): PanelLocation {
    const { modal } = this;
    const section = modal.querySelector<HTMLElement>('.panel');
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return {
      name: panel,
      scroll: section?.scrollTop ?? 0,
      action: focused?.dataset.action,
      id: focused?.dataset.id,
      openDetails: [
        ...(section?.querySelectorAll<HTMLElement>('details[open][data-disclosure]') ?? []),
      ].map((detail) => detail.dataset.disclosure!),
    };
  }
  restore(location: PanelLocation, render: () => void) {
    const { modal, ui } = this;
    const panel = location.name;

    modal.innerHTML = '';
    if (panel) render();
    const section = modal.querySelector<HTMLElement>('.panel');
    section?.querySelectorAll<HTMLDetailsElement>('details[data-disclosure]').forEach((detail) => {
      detail.open = location.openDetails.includes(detail.dataset.disclosure!);
    });
    if (section) section.scrollTop = location.scroll;
    [...(section ?? ui).querySelectorAll<HTMLButtonElement>('button[data-action]')]
      .find(
        (button) => button.dataset.action === location.action && button.dataset.id === location.id,
      )
      ?.focus({ preventScroll: true });
  }
  frame(panel: string, title: string, subtitle: string, body: string, wide = false) {
    const { modal } = this;
    const existing = modal.querySelector<HTMLElement>('.panel-shell > .panel');
    const focused =
      document.activeElement instanceof HTMLElement ? document.activeElement.dataset : {};
    const samePanel = existing?.dataset.panel === panel;
    const scroll = samePanel ? existing.scrollTop : 0;
    const openDetails = samePanel ? this.remember(panel).openDetails : [];
    if (!existing)
      modal.innerHTML =
        '<div class="modal-backdrop"><div class="panel-shell" role="dialog" aria-modal="true"><div class="panel-actions"></div><section></section></div></div>';
    const shell = modal.querySelector<HTMLElement>('.panel-shell')!;
    shell.className = `panel-shell ${wide ? 'wide-panel-shell' : ''} ${panel === 'arsenal' || panel === 'guide' || panel === 'bestiary' ? 'tabbed-panel-shell' : ''}`;
    shell.setAttribute('aria-label', title);
    shell.querySelector('.panel-actions')!.innerHTML =
      `<button class="round-button panel-close" data-action="close" aria-label="${panel === 'treasure-detail' ? '返回法宝列表' : '关闭'}">${smallIcon('close')}</button>`;
    const section = modal.querySelector<HTMLElement>('section')!;
    section.className = `panel ${wide ? 'wide-panel' : ''} ${panel === 'arsenal' || panel === 'guide' || panel === 'bestiary' ? 'tabbed-panel' : ''}`;
    section.setAttribute('aria-label', title);
    section.dataset.panel = panel;
    section.innerHTML = `<div class="panel-heading"><div><div class="eyebrow">${subtitle}</div><h2>${title}</h2></div></div>${body}`;
    section.querySelectorAll<HTMLDetailsElement>('details[data-disclosure]').forEach((detail) => {
      detail.open = openDetails.includes(detail.dataset.disclosure!);
    });
    section.scrollTop = scroll;
    if (samePanel) {
      section.scrollTop = scroll;
      [...shell.querySelectorAll<HTMLButtonElement>('button')]
        .find(
          (button) => button.dataset.action === focused.action && button.dataset.id === focused.id,
        )
        ?.focus({ preventScroll: true });
    } else shell.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  }
}

export interface PanelDefinition {
  title: string;
  subtitle: string;
  body: string;
  wide?: boolean;
}
export type PanelParts = [string, string, string, boolean?];
