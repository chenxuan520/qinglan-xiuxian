// 战斗画面缩放。竖屏手机（宽 < 700）与横屏手机（高 < 500）按短边留出约 620 世界像素，
// 让两侧远程妖物（施法距离 360）尽量落在画面内；不比旧版手机缩放 0.76 更大，最小 0.6 以免弹幕过小。
// 平板与电脑沿用原规则。
export function viewScale(width: number, height: number) {
  if (width < 700 || height < 500)
    return Math.min(0.76, Math.max(0.6, Math.min(width, height) / 620));
  return Math.min(1.1, Math.max(0.8, height / 860));
}
