import { MEDICINES } from './medicine-data.ts';
import { REALMS, type CultivationPath } from './data.ts';
import type { TownPopulation } from './town-population.ts';
import { SECT_MARKET_SETTINGS } from './setting.ts';

export const MARKET_WIDTH = 1600;
export const MARKET_HEIGHT = 1100;
export const MARKET_START = { x: 800, y: 620 };
export const MARKET_BUILDINGS = [
  { x: 270, y: 330, art: 0, school: 'orthodox' },
  { x: 1330, y: 330, art: 0, school: 'demonic' },
] as const;
export const MARKET_CULTIVATORS = [
  {
    id: 'market-alchemist',
    role: '行脚丹修',
    path: 'dual' as CultivationPath,
    x: 580,
    y: 550,
    greeting: '这一炉药香还没散。道友若有余丹，我们可以各取所需；只想歇脚聊聊，也欢迎。',
  },
  {
    id: 'market-disciple',
    role: '游历剑修',
    path: 'orthodox' as CultivationPath,
    x: 1010,
    y: 565,
    greeting: '宗门之外，山河自有道理。我刚从山中归来，带了些丹药，也听到几桩修行见闻。',
  },
  {
    id: 'market-wanderer',
    role: '魔道散修',
    path: 'demonic' as CultivationPath,
    x: 810,
    y: 890,
    greeting: '出身不同，求道的路却都不好走。这里只论互通有无，不问你拜在哪一门。',
  },
] as const;
export type MarketCultivatorId = (typeof MARKET_CULTIVATORS)[number]['id'];
export type MarketCultivator = (typeof MARKET_CULTIVATORS)[number] & {
  name: string;
  generation: number;
  realm: string;
  realmIndex: number;
};
export function isMarketCultivatorId(id: unknown): id is MarketCultivatorId {
  return MARKET_CULTIVATORS.some((npc) => npc.id === id);
}
export interface SectMarketState {
  openedAt: number;
  visit: number;
  realmIndex: number;
  exchanged: MarketCultivatorId[];
}
export function validSectMarket(value: unknown, age: number): value is SectMarketState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const s = value as SectMarketState;
  return (
    Number.isFinite(s.openedAt) &&
    s.openedAt >= 0 &&
    s.openedAt <= age &&
    Number.isSafeInteger(s.visit) &&
    s.visit >= 1 &&
    Number.isInteger(s.realmIndex) &&
    s.realmIndex >= 0 &&
    s.realmIndex < REALMS.length &&
    Array.isArray(s.exchanged) &&
    s.exchanged.length <= MARKET_CULTIVATORS.length &&
    new Set(s.exchanged).size === s.exchanged.length &&
    s.exchanged.every(isMarketCultivatorId)
  );
}
export function marketCultivators(
  population: TownPopulation,
  visit: Pick<SectMarketState, 'visit' | 'realmIndex'>,
): MarketCultivator[] {
  const generation = visit.visit - 1;
  const surnames = '沈陆谢林顾江柳宋';
  const names = ['清和', '行舟', '望舒', '知秋', '怀瑾', '听澜', '远山', '云归'];
  return MARKET_CULTIVATORS.map((npc, index) => {
    const offset = (population.seed + Math.imul(generation + 1, 2654435761)) >>> 0;
    const realmIndex = marketCultivatorRealm(population, visit, npc.id);
    return {
      ...npc,
      generation,
      realmIndex,
      realm: REALMS[realmIndex],
      name:
        surnames[(offset + index * 3) % surnames.length] +
        names[((offset >>> 4) + index * 5) % names.length],
    };
  });
}
export function marketMedicinePool(
  population: TownPopulation,
  state: SectMarketState,
  id: MarketCultivatorId,
) {
  const realm = marketCultivatorRealm(population, state, id);
  const tier = realm === 0 ? '凡品' : realm < 3 ? '灵品' : '珍品';
  const stage = realm === 0 ? 0 : Math.max(1, Math.min(6, realm - 1));
  return MEDICINES.filter(
    (m) => m.tier === tier && m.stage <= stage && (m.years > 0 || realm >= 6),
  );
}
export function marketCultivatorRealm(
  population: TownPopulation,
  visit: Pick<SectMarketState, 'visit' | 'realmIndex'>,
  id: MarketCultivatorId,
) {
  // 每位来访者独立抽取；人口种子与访次使界面、携药、读档及 Worker 身份一致。
  // 远低于玩家的境界降权，但不固定为玩家±一阶，不在交谈或重绘时重抽。
  let hash = population.seed;
  for (const char of `sect-market:${id}:${visit.visit}`)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
  hash ^= hash >>> 16;
  const commonFloor = Math.max(
    0,
    Math.min(7, visit.realmIndex) - SECT_MARKET_SETTINGS.nearbyRealmDistance,
  );
  const weights = SECT_MARKET_SETTINGS.realmWeights.map((weight, realm) =>
    realm < commonFloor ? weight : weight * SECT_MARKET_SETTINGS.nearbyRealmWeight,
  );
  let roll = (hash >>> 0) % weights.reduce<number>((sum, weight) => sum + weight, 0);
  for (let realm = 0; realm < weights.length; realm++) {
    roll -= weights[realm];
    if (roll < 0) return realm;
  }
  return weights.length - 1;
}
export function marketRelation(npcRealm: number, playerRealm: number) {
  return npcRealm > playerRealm ? '前辈' : npcRealm === playerRealm ? '道友' : '蝼蚁';
}
export function marketLocalReply(npc: MarketCultivator, message: string, playerRealm: number) {
  if (/论道|请教|指点/.test(message))
    return '论道需静心一年，相隔十个游戏年可有所获。你的灵根、路线和本命各有取舍，丹方或余丹以坐而论道的结果为准。';
  if (/委托|求购/.test(message))
    return '求购有明示的物品和报酬，当面交货，半年便结清。若有人催你先垫路费，或邀你去僻处，先核验再决定。';
  if (/骗|险|劫|机缘/.test(message))
    return '话说得好听，未必有真货。看封签，问凭据，辨来路；私下机缘可核验或作别。普通拍卖照明示规则，闲聊不扣物资。';
  if (/拍卖|竞拍|买|卖/.test(message))
    return '坊市中央有拍卖行，可竞拍丹药和法宝，也可委托出售余物。每场花半年，报价、手续费和成交以拍卖行按钮为准；闲聊不会扣钱或换物。';
  if (/丹|药|换/.test(message))
    return '互通有无，要先看看你我各自带了什么。下方列着我愿换出的丹药，两份同品级、同类余丹可换一份，这批只换一次。';
  if (/境界|修为|前辈|道友|蝼蚁/.test(message))
    return `我如今修至${npc.realm}。${npc.realmIndex > playerRealm ? '小友莫急，先走稳眼前这一程。' : npc.realmIndex === playerRealm ? '你我同一大境界，各有所得，不妨互通见闻。' : '前辈走得更远，我还得慢慢磨砺。'}`;
  if (/门|正道|魔道|身份|是谁|谁啊/.test(message))
    return `我是${npc.role}，在这里暂歇一程。${npc.path === 'demonic' ? '求道手段虽不同，今日相逢只论互通有无。' : npc.path === 'orthodox' ? '山门教人根基，游历教人取舍。' : '炼丹讲究火候，修行也是如此。'}`;
  const lines = [
    npc.greeting,
    '山路上的风雨各不相同。修行有快慢，行囊轻些，道心稳些，总能再走一程。',
    '往来修士各有见闻，听一段别人的路，也能照见自己的取舍。道友是从哪一程山水归来？',
  ];
  const variant = [...message].reduce((sum, char) => sum + char.charCodeAt(0), npc.generation);
  return lines[variant % lines.length];
}
