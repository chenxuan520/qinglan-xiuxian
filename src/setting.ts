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
  requestTimeoutMs: 14000,
  inferenceTimeoutMs: 12000,
  maxMessageLength: 200,
  maxReplyLength: 300,
  maxHistoryMessages: 6,
  maxRequestBytes: 8192,
  maxOutputTokens: 512,
  enableThinking: false,
  temperature: 0.7,
} as const;

// 域名绑定、来源白名单和边缘限流绑定属于部署设置，见 workers/npc-ai/wrangler.jsonc。
