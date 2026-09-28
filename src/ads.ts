// 激励广告位：复活、自选灵根、物资补给、借寿共用同一套占位实现。
// 日后接入真实广告 SDK 时，替换本模块的播放时长与占位 Markup，
// 并让 main.ts 的 startAdCountdown / adCompleted 改走 SDK 回调；
// 各领取点的奖励发放（复活、灵根洗练、AD_SUPPLIES、借寿）保持不变。
export const AD_DURATION_MS = 5000;
export const AD_SECONDS = AD_DURATION_MS / 1000;
// 接入真实 SDK 或加次数限制时，按广告位区分单元与额度。
export type AdPlacement = 'revive' | 'reward-root' | 'reward-supplies' | 'lifespan';
export const AD_PLACEHOLDER_HTML = '<div class="revive-ad">广告位招租</div>';
