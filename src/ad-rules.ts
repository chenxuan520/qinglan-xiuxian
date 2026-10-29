// 游戏与无界面模拟共用观看时长；此文件不加载广告供给或浏览器模块。
export const AD_DURATION_MS = 5000;
export const AD_SECONDS = AD_DURATION_MS / 1000;

export const MAX_LIFESPAN_ADS = 3;
// 按领取时大境界固定本次冷却，大乘与真仙沿用合体时长。
export const SUPPLIES_COOLDOWN_YEARS = [10, 25, 50, 100, 200, 500, 1000, 1000, 1000] as const;
export const validSuppliesReadyAt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
