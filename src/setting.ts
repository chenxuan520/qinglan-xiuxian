export const GAME_SITE_URL = 'https://xiuxian.011203.xyz/';
// 微信赞赏码是小程序码，二维码库无法重新生成；更换时直接替换这张图片。
export const SUPPORT_CODE_IMAGE = '/assets/support-wechat.webp';

// 激励广告供给。provider='placeholder' 保持占位倒计时（当前线上行为）；
// 接入真实 SDK 时新增对应 RewardAdProvider（src/ads.ts 接口），注册后在此指名启用。
// 任何 provider 不可用（未配置、SDK 加载失败、无库存）都自动回退占位倒计时，不影响游戏。
export const ADS_SETTINGS = {
  // 过审前必须 placeholder：未过审账号的 Placement API 完全静默没有任何回调，会把玩家卡死在广告面板。
  provider: 'placeholder' as 'placeholder' | 'adsense',
  adsense: {
    // AdSense 审核通过后把 pub ID 填入此处；SDK 按需注入，失败全回退占位。
    client: 'ca-pub-9047842625721721',
  },
} as const;

// NPC 相关常量集中在这里；改动后重新构建前端，并部署 npc-ai Worker。
export const NPC_SETTINGS = {
  lifespanMinYears: 50,
  lifespanMaxYears: 70,
} as const;

export const TOWN_SETTINGS = { sceneryChangeYears: 100 } as const;

export const SECT_MARKET_SETTINGS = {
  // 炼气至大乘的基础比例：28%、22%、18%、12%、8%、6%、4%、2%；真仙不来坊市。
  realmWeights: [28, 22, 18, 12, 8, 6, 4, 2],
  // 比玩家低三阶及以上的来访者仅保留普通权重的 1/20，后期不会满街低阶丹药。
  nearbyRealmDistance: 2,
  nearbyRealmWeight: 20,
} as const;

export const NPC_AI_SETTINGS = {
  // 可用构建环境变量 VITE_NPC_AI_URL 覆盖；地址不要带 /chat。
  baseUrl: 'https://qinglan-npc-ai.011203.xyz',
  model: '@cf/zai-org/glm-4.7-flash',
  requestTimeoutMs: 20000,
  inferenceTimeoutMs: 12000,
  maxMessageLength: 200,
  maxReplyLength: 300,
  maxHistoryMessages: 6,
  maxRequestBytes: 8192,
  maxOutputTokens: 512,
  enableThinking: false,
  temperature: 0.7,
} as const;

export const TEA_STORY_SETTINGS = {
  requestMessage: '请讲一回关于问大道、求长生，仙途险恶艰难与人心无情的完整旧闻。',
  maxReplyLength: 900,
  maxOutputTokens: 1400,
  requestTimeoutMs: 60000,
  inferenceTimeoutMs: 50000,
  maxAttempts: 2,
  retryDelayMs: 600,
} as const;

export const TEA_STORY_IMAGE_SETTINGS = {
  model: '@cf/black-forest-labs/flux-1-schnell',
  steps: 4,
  maxImageBytes: 5 * 1024 * 1024,
  tokenTtlSeconds: 300,
  requestTimeoutMs: 40000,
  inferenceTimeoutMs: 28000,
} as const;

// 留影评语复用文字 AI binding，官网优先生成；其他静态站和离线使用组合式兜底。
export const JOURNEY_APPRAISAL_SETTINGS = {
  model: '@cf/qwen/qwen3-30b-a3b-fp8',
  path: '/journey-appraisal',
  requestTimeoutMs: 15000,
  inferenceTimeoutMs: 12000,
  maxOutputTokens: 512,
  maxDetailLength: 80,
  maxRequestBytes: 4096,
  cacheEntries: 16,
} as const;

// 匿名游玩统计经 npc-ai Worker 的 /event 写入 Analytics Engine；只在正式站发送。
export const TELEMETRY_SETTINGS = {
  origins: ['https://xiuxian.011203.xyz', 'https://chenxuan520.github.io'],
  path: '/event',
  idKey: 'qinglan-telemetry-id',
  offKey: 'qinglan-telemetry-off',
  maxEvents: 20,
  flushSize: 10,
  maxRequestBytes: 4096,
} as const;

// 域名绑定、来源白名单和边缘限流绑定属于部署设置，见 workers/npc-ai/wrangler.jsonc。

export const AUCTION_SETTINGS = { years: 0.5, buyerFee: 5, sellerFee: 10 };
export const MARKET_SOCIAL_SETTINGS = {
  debateYears: 1,
  debateInterval: 10,
  requestYears: 0.5,
  inspectYears: 0.5,
  opportunityYears: 0.5,
  invitationYears: 1,
  opportunityInterval: 10,
  maxLoss: 80,
};

// 隐藏物资调试入口，准入与每次发放都以 Worker 的实时答复为准。
export const DEBUG_SETTINGS = {
  path: '/debug/access',
  requestTimeoutMs: 5000,
  taps: 7,
  tapWindowMs: 7000,
} as const;
