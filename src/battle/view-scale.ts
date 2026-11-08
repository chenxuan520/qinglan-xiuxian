// 战斗画面缩放（只影响画面）。竖屏手机（宽 < 700）与横屏手机（高 < 500）按短边留出约 620 世界像素，
// 不比旧版手机缩放 0.76 更大，最小 0.6 以免弹幕过小。平板与电脑沿用原规则。
export function viewScale(width: number, height: number) {
  if (width < 700 || height < 500)
    return Math.min(0.76, Math.max(0.6, Math.min(width, height) / 620));
  return logicScale(width, height);
}

// 战斗逻辑视口缩放：决定妖物刷新圈与远离回收距离（game.viewport），保持旧规则不变。
// 刷新距离直接影响击杀节奏与成长速度，画面放宽不应改变平衡；手机画面比逻辑视口小，妖物仍在画面外刷出。
export function logicScale(width: number, height: number) {
  return width < 700 ? 0.76 : Math.min(1.1, Math.max(0.8, height / 860));
}

// 战斗逻辑视口：默认沿用旧规则；只有可见范围超过旧刷新圈（视口/2+70）时才逐轴外扩，保证妖物至少在画面外 10 像素刷新。
export function battleViewport(width: number, height: number) {
  const view = viewScale(width, height),
    logic = logicScale(width, height);
  return {
    width: Math.max(width / logic, width / view - 120),
    height: Math.max(height / logic, height / view - 120),
  };
}
