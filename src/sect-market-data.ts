import { MEDICINES } from './medicine-data.ts';
import { REALMS, type CultivationPath } from './data.ts';
import type { TownPopulation } from './town-population.ts';

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
    realmOffset: 1,
    x: 580,
    y: 550,
    greeting: '这一炉药香还没散。道友若有余丹，我们可以各取所需；只想歇脚聊聊，也欢迎。',
  },
  {
    id: 'market-disciple',
    role: '游历剑修',
    path: 'orthodox' as CultivationPath,
    realmOffset: 0,
    x: 1010,
    y: 565,
    greeting: '宗门之外，山河自有道理。我刚从山中归来，带了些丹药，也听到几桩修行见闻。',
  },
  {
    id: 'market-wanderer',
    role: '魔道散修',
    path: 'demonic' as CultivationPath,
    realmOffset: -1,
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
    const realmIndex = marketCultivatorRealm(visit, npc.id);
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
export function marketMedicinePool(state: SectMarketState, id: MarketCultivatorId) {
  const realm = marketCultivatorRealm(state, id);
  const tier = realm === 0 ? '凡品' : realm < 3 ? '灵品' : '珍品';
  const stage = realm === 0 ? 0 : Math.max(1, Math.min(6, realm - 1));
  return MEDICINES.filter(
    (m) => m.tier === tier && m.stage <= stage && (m.years > 0 || realm >= 6),
  );
}
export function marketCultivatorRealm(
  visit: Pick<SectMarketState, 'realmIndex'>,
  id: MarketCultivatorId,
) {
  const offset = MARKET_CULTIVATORS.find((npc) => npc.id === id)!.realmOffset;
  return Math.max(0, Math.min(REALMS.length - 1, visit.realmIndex + offset));
}
export function marketRelation(npcRealm: number, playerRealm: number) {
  return npcRealm > playerRealm ? '前辈' : npcRealm === playerRealm ? '道友' : '蝼蚁';
}
export function marketLocalReply(npc: MarketCultivator, message: string, playerRealm: number) {
  if (/丹|药|换|买|卖/.test(message))
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
