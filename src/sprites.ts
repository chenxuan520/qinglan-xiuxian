import { assetUrl } from './asset-url.ts';

export const SPRITE_ATLASES = [
  { start: 0, columns: 4, url: '/assets/characters.png' },
  { start: 8, columns: 3, url: '/assets/enemies-distinct.png' },
  { start: 14, columns: 4, url: '/assets/enemies-ascended-1.png' },
  { start: 22, columns: 4, url: '/assets/enemies-ascended-2.png' },
  { start: 30, columns: 3, url: '/assets/bosses-six.png' },
  { start: 36, columns: 6, url: '/assets/enemies-ruins.png' },
  { start: 48, columns: 4, url: '/assets/enemies-ice.png' },
  { start: 56, columns: 4, url: '/assets/enemies-marsh.png' },
  { start: 64, columns: 4, url: '/assets/enemies-nether.png' },
  { start: 72, columns: 4, url: '/assets/enemies-heaven.png' },
  { start: 80, columns: 1, url: '/assets/boss-immortal.png' },
];
export function spriteFrame(index: number) {
  const atlas = SPRITE_ATLASES.filter((sheet) => index >= sheet.start).length - 1;
  const sheet = SPRITE_ATLASES[atlas];
  const local = index - sheet.start;
  const columns = sheet.columns;
  if (columns === 1)
    return {
      extra: true,
      atlas,
      local: 0,
      columns,
      rows: 1,
      width: 1024,
      height: 1024,
      x: 0,
      y: 0,
      url: sheet.url,
    };
  const width = 1536 / columns;
  return {
    extra: atlas > 0,
    atlas,
    local,
    columns,
    rows: 2,
    width,
    height: 512,
    x: (local % columns) * width,
    y: Math.floor(local / columns) * 512,
    url: sheet.url,
  };
}
export function spriteStyle(index: number) {
  const f = spriteFrame(index);
  if (f.columns === 1)
    return `--sprite-ratio:1;background-image:url('${assetUrl(f.url)}');background-size:100% 100%;background-position:center`;
  return `--sprite-ratio:${f.width / f.height};background-image:url('${assetUrl(f.url)}');background-size:${f.columns * 100}% 200%;background-position:${((f.local % f.columns) / (f.columns - 1)) * 100}% ${Math.floor(f.local / f.columns) * 100}%`;
}
