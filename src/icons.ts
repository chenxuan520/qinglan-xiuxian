import { itemArt } from './item-art.ts';
import { assetUrl } from './asset-url.ts';

export function icon(id: string, color = 'currentColor', cls = '') {
  const art = itemArt(id);
  if (art)
    return `<span class="icon item-art ${cls}" aria-hidden="true" style="background-image:url('${assetUrl(art.src)}');background-size:400% ${art.rows * 100}%;background-position:${(art.column / 3) * 100}% ${(art.row / (art.rows - 1)) * 100}%"></span>`;
  return `<span class="icon ${cls}" aria-hidden="true" style="color:${color}">◇</span>`;
}
export const smallIcon = (id: string) => {
  const paths: Record<string, string> = {
    sound: '<path d="m11 5-6 5H2v4h3l6 5ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
    mute: '<path d="m11 5-6 5H2v4h3l6 5ZM16 9l6 6m0-6-6 6"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    play: '<path d="m8 4 12 8-12 8Z"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    gem: '<path d="m12 2 8 10-8 10-8-10Zm0 0v20M4 12h16"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    book: '<path d="M3 4q5-1 9 3 4-4 9-3v15q-5-1-9 3-4-4-9-3ZM12 7v15"/>',
    refresh: '<path d="M20 7A9 9 0 1 0 21 15M20 2v6h-6"/>',
  };
  return `<svg viewBox="0 0 24 24" class="small-icon" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[id] || paths.gem}</svg>`;
};
