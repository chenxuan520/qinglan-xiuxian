import { resourceFailureContent } from './resource-panel.ts';
import { resourceFailed } from './update-check.ts';
import { retryModule } from './module-source.ts';
import { markFirstTourSeen } from './first-run-tour.ts';
type TourModule = typeof import('./interface-tour.ts');
let current: TourModule | null = null;
let pending: Promise<TourModule> | null = null;
let generation = 0;
let attempts = 0;
const failedEntries = new WeakMap<Element, string>();
export let tourActive = false;

async function fetchTour(): Promise<TourModule> {
  if (!attempts++) return import('./interface-tour.ts');
  return retryModule<TourModule>('interface-tour', 'tour', attempts);
}
export function stopInterfaceTour() {
  generation++;
  current?.stopInterfaceTour();
  tourActive = false;
}
export async function startAutomaticInterfaceTour(
  ui: HTMLDivElement,
  modal: HTMLDivElement,
  valid: () => boolean,
  begin: () => boolean = () => true,
  roots?: Parameters<TourModule['startInterfaceTour']>[4],
) {
  if (tourActive || !valid()) return false;
  const request = ++generation;
  try {
    current ??= await (pending ??= fetchTour().finally(() => {
      pending = null;
    }));
    if (generation !== request || !valid() || !begin()) return false;
    tourActive = true;
    current.startInterfaceTour(
      ui,
      modal,
      () => {
        tourActive = false;
      },
      true,
      roots,
    );
    return true;
  } catch {
    resourceFailed(true);
    tourActive = false;
    return false;
  }
}
export async function startInterfaceTour(ui: HTMLDivElement, modal: HTMLDivElement) {
  if (tourActive) return;
  const button = modal.querySelector<HTMLButtonElement>('[data-action="guide-tour"]');
  if (!button) return;
  const host = button.closest('.guide-tour-entry');
  const originalEntry = host ? (failedEntries.get(host) ?? host.innerHTML) : '';
  const request = ++generation;
  button.disabled = true;
  const label = button.innerHTML;
  button.textContent = '正在准备导览…';
  try {
    current ??= await (pending ??= fetchTour().finally(() => {
      pending = null;
    }));
    if (generation !== request || !button.isConnected || document.hidden) return;
    button.disabled = false;
    button.innerHTML = label;
    if (host && failedEntries.has(host)) {
      host.innerHTML = originalEntry;
      failedEntries.delete(host);
    }
    (host?.querySelector<HTMLButtonElement>('[data-action="guide-tour"]') ?? button).focus({
      preventScroll: true,
    });
    tourActive = true;
    markFirstTourSeen();
    current.startInterfaceTour(ui, modal, () => {
      tourActive = false;
    });
  } catch {
    resourceFailed(true);
    tourActive = false;
    if (generation === request && button.isConnected) {
      if (host) {
        failedEntries.set(host, originalEntry);
        host.innerHTML = resourceFailureContent(
          'guide-tour',
          '导览未能载入，请再试一次。你的进度不受影响。',
          '重试导览',
        );
      }
    }
  } finally {
    button.disabled = false;
    button.innerHTML = label;
  }
}
