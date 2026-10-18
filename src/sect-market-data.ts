import { MEDICINES } from './medicine-data.ts';
import { REALMS, type CultivationPath } from './data.ts';
import type { TownPopulation } from './town-population.ts';
import { SECT_MARKET_SETTINGS } from './setting.ts';
import type { MarketIdentity } from './market-relations-data.ts';

export const MARKET_WIDTH = 2000;
export const MARKET_HEIGHT = 1400;
export const MARKET_START = { x: 1000, y: 790 };
export const MARKET_BUILDINGS = [
  { x: 600, y: 590, art: 0, label: '丹药铺' },
  { x: 1000, y: 400, art: 1, label: '拍卖行' },
  { x: 1400, y: 590, art: 2, label: '法器阁' },
  { x: 520, y: 1220, art: 4, label: '论道院' },
  { x: 220, y: 520, art: 7, label: '执事堂' },
  { x: 1780, y: 520, art: 6, label: '会客馆' },
  { x: 240, y: 1000, art: 3, label: '散修摊' },
  { x: 1760, y: 1000, art: 8, label: '游商摊' },
] as const;
export const MARKET_VENUES = [
  { id: 'medicine', building: 0, x: 600, y: 670, hint: '余丹与换物' },
  { id: 'artifacts', building: 2, x: 1400, y: 670, hint: '法器与求购' },
  { id: 'forum', building: 3, x: 520, y: 1300, hint: '听道 · 互证 · 主持' },
  { id: 'office', building: 4, x: 220, y: 600, hint: '托付与寻物' },
  { id: 'guests', building: 5, x: 1780, y: 600, hint: '旧识与求助' },
  { id: 'stalls', building: 6, x: 240, y: 1080, hint: '散修见闻' },
  { id: 'caravan', building: 7, x: 1760, y: 1080, hint: '来客与货讯' },
] as const;
export type MarketVenueId = (typeof MARKET_VENUES)[number]['id'];
export const MARKET_LANES = [
  [140, 620, 1720, 170],
  [850, 480, 300, 850],
  [380, 1250, 1240, 100],
  [150, 550, 220, 590],
  [1650, 550, 220, 590],
  [660, 750, 140, 580],
  [1180, 750, 140, 580],
  [300, 1050, 500, 100],
  [1300, 1050, 400, 100],
] as const;
export const MARKET_CULTIVATORS = [
  {
    id: 'market-alchemist',
    role: '行脚丹修',
    path: 'dual' as CultivationPath,
    x: 660,
    y: 730,
    greeting: '这一炉药香还没散。道友若有余丹，我们可以各取所需；只想歇脚聊聊，也欢迎。',
  },
  {
    id: 'market-disciple',
    role: '游历剑修',
    path: 'orthodox' as CultivationPath,
    x: 1340,
    y: 730,
    greeting: '宗门之外，山河自有道理。我刚从山中归来，带了些丹药，也听到几桩修行见闻。',
  },
  {
    id: 'market-wanderer',
    role: '魔道散修',
    path: 'demonic' as CultivationPath,
    x: 1060,
    y: 1250,
    greeting: '出身不同，求道的路却都不好走。这里只论互通有无，不问你拜在哪一门。',
  },
] as const;
export type MarketTraderId = (typeof MARKET_CULTIVATORS)[number]['id'];
export type MarketVisitorId = `market-visitor-${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11}`;
export type MarketCultivatorId = MarketTraderId | MarketVisitorId | 'market-fellow';
export interface MarketCultivator {
  id: MarketCultivatorId;
  x: number;
  y: number;
  role: string;
  path: CultivationPath;
  greeting: string;
  roaming?: boolean;
  name: string;
  generation: number;
  realm: string;
  realmIndex: number;
}
export function isMarketTraderId(id: unknown): id is MarketTraderId {
  return MARKET_CULTIVATORS.some((npc) => npc.id === id);
}
export function isMarketCultivatorId(id: unknown): id is MarketCultivatorId {
  return (
    id === 'market-fellow' ||
    isMarketTraderId(id) ||
    (typeof id === 'string' && /^market-visitor-(?:[0-9]|1[01])$/.test(id))
  );
}
export interface SectMarketState {
  openedAt: number;
  visit: number;
  realmIndex: number;
  returning?: {
    slot: MarketTraderId;
    birthVisit: number;
    birthSlot: MarketTraderId;
    realmIndex: number;
  }[];
  absent?: MarketTraderId[];
  opportunityHonest?: boolean;
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
    (s.returning === undefined ||
      (Array.isArray(s.returning) &&
        s.returning.length <= 1 &&
        s.returning.every(
          (r) =>
            !!r &&
            isMarketTraderId(r.slot) &&
            isMarketTraderId(r.birthSlot) &&
            Number.isSafeInteger(r.birthVisit) &&
            r.birthVisit > 0 &&
            r.birthVisit < s.visit &&
            Number.isInteger(r.realmIndex) &&
            r.realmIndex >= 0 &&
            r.realmIndex <= 7,
        ))) &&
    (s.opportunityHonest === undefined || typeof s.opportunityHonest === 'boolean') &&
    (s.absent === undefined ||
      (Array.isArray(s.absent) && s.absent.length <= 1 && s.absent.every(isMarketTraderId))) &&
    Array.isArray(s.exchanged) &&
    s.exchanged.length <= MARKET_CULTIVATORS.length &&
    new Set(s.exchanged).size === s.exchanged.length &&
    s.exchanged.every(isMarketTraderId)
  );
}
export function marketIdentity(
  state: Pick<SectMarketState, 'visit' | 'returning'>,
  id: MarketTraderId,
): MarketIdentity {
  const returning = state.returning?.find((r) => r.slot === id);
  return returning
    ? { birthVisit: returning.birthVisit, slot: returning.birthSlot }
    : { birthVisit: state.visit, slot: id };
}
export function marketCultivators(
  population: TownPopulation,
  visit: Pick<SectMarketState, 'visit' | 'realmIndex' | 'returning' | 'absent'>,
): MarketCultivator[] {
  const surnames = '沈陆谢林顾江柳宋';
  const names = ['清和', '行舟', '望舒', '知秋', '怀瑾', '听澜', '远山', '云归'];
  return MARKET_CULTIVATORS.filter((position) => !visit.absent?.includes(position.id)).map(
    (position) => {
      const identity = marketIdentity(visit, position.id);
      const index = MARKET_CULTIVATORS.findIndex((n) => n.id === identity.slot);
      const npc = MARKET_CULTIVATORS[index];
      const generation = identity.birthVisit - 1;
      const offset = (population.seed + Math.imul(generation + 1, 2654435761)) >>> 0;
      const realmIndex = marketCultivatorRealm(population, visit, position.id);
      return {
        ...npc,
        id: position.id,
        x: position.x,
        y: position.y,
        generation,
        realmIndex,
        realm: REALMS[realmIndex],
        name:
          surnames[(offset + index * 3) % surnames.length] +
          names[((offset >>> 4) + index * 5) % names.length],
      };
    },
  );
}
const VISITOR_ROLES = [
  '采药散修',
  '巡游剑修',
  '行脚符师',
  '游历丹师',
  '护镖修士',
  '闭关归客',
  '御兽弟子',
  '寻宝散修',
  '炼器学徒',
  '远游刀客',
  '访友门人',
  '古卷藏家',
] as const;
export function marketVisitors(
  population: TownPopulation,
  visit: Pick<SectMarketState, 'visit' | 'realmIndex' | 'returning' | 'absent'>,
): MarketCultivator[] {
  const traders = marketCultivators(population, visit);
  const used = new Set(traders.map((n) => n.name));
  const names = [
    '照溪',
    '归鸿',
    '听泉',
    '怀川',
    '青衫',
    '竹音',
    '映雪',
    '辞月',
    '临风',
    '砚秋',
    '知微',
    '长宁',
    '若尘',
    '望岳',
    '寒松',
    '行歌',
  ];
  const offset = (population.seed + Math.imul(visit.visit, 2654435761)) >>> 0;
  return VISITOR_ROLES.map((role, index) => {
    const id = `market-visitor-${index}` as MarketVisitorId;
    let part = (offset + index * 5) % names.length;
    let name = '陆沈谢顾林江宋柳'[(offset + index * 3) % 8] + names[part];
    while (used.has(name)) {
      part = (part + 1) % names.length;
      name = '陆沈谢顾林江宋柳'[(offset + index * 3) % 8] + names[part];
    }
    used.add(name);
    const realmIndex = marketCultivatorRealm(population, visit, id);
    return {
      id,
      role,
      name,
      realmIndex,
      realm: REALMS[realmIndex],
      generation: visit.visit - 1,
      path: (['orthodox', 'dual', 'demonic'] as const)[index % 3],
      x: 0,
      y: 0,
      roaming: true,
      greeting: [
        '我正去前头看看新到的器物，道友一同慢慢逛便是。',
        '在山中待得久了，来坊市听听各处的消息。交易先验货，别被好听话蒙住。',
        '好药难求，修行也要讲火候。今日来看看丹铺，顺道访一位旧识。',
      ][index % 3],
    };
  });
}
export function marketCharacters(
  population: TownPopulation,
  visit: Pick<SectMarketState, 'visit' | 'realmIndex' | 'returning' | 'absent'>,
) {
  return [...marketCultivators(population, visit), ...marketVisitors(population, visit)];
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
  visit: Pick<SectMarketState, 'visit' | 'realmIndex' | 'returning' | 'absent'>,
  id: MarketCultivatorId,
) {
  const returning = visit.returning?.find((r) => r.slot === id);
  if (returning) return returning.realmIndex;
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
// 真实境界用于结算；展示时只能辨识同阶及以下的修为。
export function marketRealmLabel(
  npc: Pick<MarketCultivator, 'realm' | 'realmIndex'>,
  playerRealm: number,
) {
  return npc.realmIndex > playerRealm ? '修为难测' : npc.realm;
}
export function marketLocalReply(npc: MarketCultivator, message: string, playerRealm: number) {
  if (npc.roaming && /论道|丹|药|换|求购/.test(message))
    return '今日只来逛市访友，若要论道或互换，可去丹药铺、法器阁和散修小院找设摊的道友。';
  if (/论道|请教|指点/.test(message))
    return '论道需静心一年，相隔十个游戏年可有所获。可交流御器心得、抄录或互授丹方；是否赠药，还看故交情分。';
  if (/委托|求购/.test(message))
    return '求购有明示的物品和报酬，当面交货，半年便结清。若有人催你先垫路费，或邀你去僻处，先核验再决定。';
  if (/骗|险|劫|机缘/.test(message))
    return '话说得好听，未必有真货。看封签，问凭据，辨来路；私下机缘可核验或作别。普通拍卖照明示规则，闲聊不扣物资。';
  if (/拍卖|竞拍|买|卖/.test(message))
    return '坊市中央有拍卖行，可竞拍丹药和法宝，也可委托出售余物。每场花半年，报价、手续费和成交以拍卖行按钮为准；闲聊不会扣钱或换物。';
  if (/丹|药|换/.test(message))
    return '互通有无，要先看看你我各自带了什么。下方列着我愿换出的丹药，丹药、法宝或搭配余丹的组合都可商量，按相近估值互换，这批只换一次。';
  if (/精进|进境|进展|突破/.test(message) && /我|看(?:得|不)?出|看穿|察觉/.test(message))
    return npc.realmIndex < playerRealm
      ? '前辈的修为，我看不透，也不敢妄评。若愿指点一二，晚辈洗耳恭听。'
      : '只凭一面，难知你这一程如何精进。不妨说说近来修行的难处，我们再慢慢谈。';
  if (/境界|修为|前辈|道友|蝼蚁/.test(message))
    return npc.realmIndex > playerRealm
      ? '小友莫急，修行深浅非一眼可辨，先走稳眼前这一程。'
      : `我如今修至${npc.realm}。${npc.realmIndex === playerRealm ? '你我同一大境界，不妨互通见闻。' : '前辈的修为我看不透，晚辈不敢妄评。'}`;
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
