export const SPRITE_ATLASES = [
  { start: 0, columns: 4, url: '/assets/characters.png' },
  { start: 8, columns: 3, url: '/assets/enemies-distinct.png' },
  { start: 14, columns: 4, url: '/assets/enemies-ascended-1.png' },
  { start: 22, columns: 4, url: '/assets/enemies-ascended-2.png' },
  { start: 30, columns: 3, url: '/assets/bosses-six.png' },
];
export function spriteFrame(index: number) {
  const atlas = SPRITE_ATLASES.filter((sheet) => index >= sheet.start).length - 1;
  const sheet = SPRITE_ATLASES[atlas];
  const local = index - sheet.start;
  const columns = sheet.columns;
  const width = 1536 / columns;
  return {
    extra: atlas > 0,
    atlas,
    local,
    columns,
    width,
    height: 512,
    x: (local % columns) * width,
    y: Math.floor(local / columns) * 512,
    url: sheet.url,
  };
}
export function spriteStyle(index: number) {
  const f = spriteFrame(index);
  return `background-image:url('${f.url}');background-size:${f.columns * 100}% 200%;background-position:${((f.local % f.columns) / (f.columns - 1)) * 100}% ${Math.floor(f.local / f.columns) * 100}%`;
}
