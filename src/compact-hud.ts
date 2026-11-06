export const COMPACT_HUD_QUERY =
  '(pointer: coarse) and (max-width: 650px) and (orientation: portrait)';

let owner: Window | undefined;
let factory: Window['matchMedia'] | undefined;
let media: MediaQueryList | undefined;

export function compactHud(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  if (owner !== window || factory !== window.matchMedia || !media) {
    owner = window;
    factory = window.matchMedia;
    media = window.matchMedia(COMPACT_HUD_QUERY);
  }
  return media.matches;
}
