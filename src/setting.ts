export const GAME_SITE_URL = 'https://xiuxian.011203.xyz/';

// NPC 相关常量集中在这里；改动后重新构建前端，并部署 npc-ai Worker。
export const NPC_SETTINGS = {
  lifespanMinYears: 50,
  lifespanMaxYears: 70,
} as const;

export const TOWN_SETTINGS = { sceneryChangeYears: 100 } as const;

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

// 域名绑定、来源白名单和边缘限流绑定属于部署设置，见 workers/npc-ai/wrangler.jsonc。
