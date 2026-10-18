type TourModule = typeof import('./interface-tour.ts');
let current: TourModule | null = null;
let pending: Promise<TourModule> | null = null;
let generation = 0;
let attempts = 0;
export let tourActive = false;

async function fetchTour(): Promise<TourModule> {
  if (!attempts++) return import('./interface-tour.ts');
  const base = new URL(import.meta.env.BASE_URL, location.href);
  let path = 'src/interface-tour.ts';
  if (!import.meta.env.DEV) {
    const response = await fetch(new URL(`offline-manifest-${__QINGLAN_BUILD_ID__}.json`, base));
    if (!response.ok) throw Error('tour-manifest-unavailable');
    const manifest = await response.json();
    if (manifest.build !== __QINGLAN_BUILD_ID__ || !Array.isArray(manifest.resources))
      throw Error('tour-manifest-invalid');
    const entry = manifest.resources.find(
      (resource: { path?: unknown }) =>
        typeof resource.path === 'string' &&
        /^assets\/interface-tour-[\w-]+\.js$/.test(resource.path),
    );
    if (!entry) throw Error('tour-module-missing');
    path = entry.path;
  }
  const url = new URL(path, base);
  url.hash = `tour-retry-${attempts}`;
  return import(/* @vite-ignore */ url.href);
}
export function stopInterfaceTour() {
  generation++;
  current?.stopInterfaceTour();
  tourActive = false;
}
export async function startInterfaceTour(ui: HTMLDivElement, modal: HTMLDivElement) {
  if (tourActive) return;
  const button = modal.querySelector<HTMLButtonElement>('[data-action="guide-tour"]');
  if (!button) return;
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
    button.focus({ preventScroll: true });
    tourActive = true;
    current.startInterfaceTour(ui, modal, () => {
      tourActive = false;
    });
  } catch {
    tourActive = false;
    if (generation === request && button.isConnected) {
      button
        .closest('.guide-tour-entry')
        ?.querySelector('p')
        ?.replaceChildren('导览未能载入，请再试一次。你的进度不受影响。');
    }
  } finally {
    button.disabled = false;
    button.innerHTML = label;
  }
}
