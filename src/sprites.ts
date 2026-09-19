export function spriteFrame(index: number) {
  const extra = index >= 8;
  const local = extra ? index - 8 : index;
  const columns = extra ? 3 : 4;
  const width = extra ? 512 : 384;
  return {
    extra,
    local,
    columns,
    width,
    height: 512,
    x: (local % columns) * width,
    y: Math.floor(local / columns) * 512,
    url: extra ? '/assets/enemies-distinct.png' : '/assets/characters.png',
  };
}
export function spriteStyle(index: number) {
  const f = spriteFrame(index);
  return `background-image:url('${f.url}');background-size:${f.columns * 100}% 200%;background-position:${((f.local % f.columns) / (f.columns - 1)) * 100}% ${Math.floor(f.local / f.columns) * 100}%`;
}
