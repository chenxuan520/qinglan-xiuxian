// 768px 建筑九宫格按各屋檐的完整轮廓取景，避免宽拍卖楼被等宽切片裁掉。
const SIZE = 768;
const FRAMES = [
  [0, 0, 247, 267],
  [247, 0, 280, 267],
  [527, 0, 241, 267],
  [0, 267, 247, 240],
  [247, 267, 280, 240],
  [527, 267, 241, 240],
  [0, 507, 260, 261],
  [260, 507, 269, 261],
  [529, 507, 239, 261],
] as const;

export function marketBuildingArt(index: number) {
  const [x, y, width, height] = FRAMES[index];
  return `background-size:${(SIZE / width) * 100}% ${(SIZE / height) * 100}%;background-position:${(x / (SIZE - width)) * 100}% ${(y / (SIZE - height)) * 100}%`;
}
