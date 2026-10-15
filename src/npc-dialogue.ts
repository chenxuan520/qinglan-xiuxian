import { type TownPopulation } from './town-population.ts';
import { type TownNpc } from './town.ts';
import type { SmithStory } from './town-story.ts';
import type { HometownState, ParentId } from './hometown.ts';
import {
  MARKET_CULTIVATORS,
  isMarketCultivatorId,
  type MarketCultivatorId,
  type SectMarketState,
  type MarketTraderId,
  isMarketTraderId,
  marketCharacters,
  marketIdentity,
  marketLocalReply,
} from './sect-market-data.ts';
import { MAX_FORGE_LEVEL, REALMS, TREASURES } from './data.ts';
import { medicineInfo } from './medicine-data.ts';
import type { MarketTradeMotiveKind } from './market-trade-motives.ts';

export interface MarketDialogueTrade {
  motive: MarketTradeMotiveKind;
  friend: boolean;
  wantedMedicineIds: string[];
  wantedWeaponIds: string[];
  lead: {
    npcId: MarketTraderId;
    kind: 'medicine' | 'artifact';
    id: string;
    quantity: number;
    forgeLevel: number;
    minimumLevel: number;
    price: number;
  } | null;
}

export const NPC_DEFAULT_LINES = {
  herbs: '山中草药正当时，可愿帮我采来一篓？',
  tea: '行路辛苦，来听一段茶馆闲谈吧。',
  escort: '镖队正缺人手，愿意护送这一趟吗？',
  market: '灵材有价，买卖随缘。看看可有用得上的？',
  smith: '好铁还得慢火锻，做人做事也是一样。',
  scholar: '书里山河无数，终究还得亲自走一遭。',
  fisher: '今晨水静，鱼倒是不少。道友有空也看看河上风光。',
  farmer: '这一季稻穗饱满，家里又能过个安稳年了。',
  tailor: '衣裳合身，走路也轻快。针脚细些，才耐得住岁月。',
  father: '山外怎么样？回来就好。',
  mother: '路远，记得添衣。',
};
const VILLAGER_LINES = [
  '今早邻家的炊烟起得早，说是有远行的人回来了。道友也常回家看看吧。',
  '我去河边替家里捎点东西。日子忙些，心里倒也踏实。',
  '今年雨水好，盼着秋收能多攒些粮。山上的日子，想来也有山上的难处。',
  '集上新到的布料好看，我正挑一块带回去。人间的小欢喜，也不过这些。',
];
export function npcDefaultLine(id: TownNpc['id'] | ParentId | MarketCultivatorId) {
  if (isMarketCultivatorId(id))
    return (
      MARKET_CULTIVATORS.find((npc) => npc.id === id)?.greeting ??
      '我来坊市看看器物，也听听山外的见闻。道友慢慢逛，买东西记得验明来路。'
    );
  return id.startsWith('villager-')
    ? VILLAGER_LINES[Number(id.slice('villager-'.length)) % VILLAGER_LINES.length]
    : NPC_DEFAULT_LINES[id as keyof typeof NPC_DEFAULT_LINES];
}
export interface NpcMessage {
  role: 'user' | 'assistant';
  content: string;
}
export const MARKET_DIALOGUE_EVENTS = [
  'exchange',
  'debate',
  'request',
  'declined',
  'exposed',
  'fraud',
  'gift',
  'ambush',
  'victory',
  'escaped',
  'defeat',
] as const;
export const MARKET_DIALOGUE_CLUES = [
  'higher-realm',
  'sect-backing',
  'old-grudge',
  'known-trader',
  'suspicious-seal',
  'upfront-fee',
  'marked-up-price',
  'secluded-road',
  'bloodstain',
  'pressed-departure',
  'claimed-sect',
] as const;
export interface MarketDialogueContact {
  birthVisit: number;
  slot: MarketTraderId;
  metAt: number;
  seenAt: number;
  lastVisit: number;
  tradeVisit: number;
  aidAt?: number;
  goodwill: number;
  grudge: number;
}
export interface MarketDialogueContext {
  contact: MarketDialogueContact | null;
  events: Array<(typeof MARKET_DIALOGUE_EVENTS)[number]>;
  trade?: MarketDialogueTrade;
  risk: {
    kind: 'goods' | 'deposit' | 'haggle' | 'invitation';
    inspection: 'unexamined' | 'no-flaw-found' | 'fraud-exposed' | 'overpriced';
    resolved: boolean;
    realmDelta: number;
    sectProtection: boolean;
    level: '谨慎' | '危险' | '凶险';
    clues: Array<(typeof MARKET_DIALOGUE_CLUES)[number]>;
  } | null;
}
export type MarketDialogueVisit = Pick<SectMarketState, 'visit' | 'realmIndex'> & {
  absent?: MarketTraderId[];
  returning?: Array<{
    slot: MarketTraderId;
    birthVisit: number;
    birthSlot: MarketTraderId;
    realmIndex: number;
  }>;
};
export interface NpcDialogueRequest {
  mode?: 'tea-story';
  population: TownPopulation;
  age: number;
  npcId: TownNpc['id'] | ParentId | MarketCultivatorId;
  marketVisit?: MarketDialogueVisit;
  marketContext?: MarketDialogueContext;
  realm: string;
  message: string;
  history: NpcMessage[];
  townRevision?: number;
  smithStory?: SmithStory;
  hometown?: HometownState;
}

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length &&
  Object.keys(value).every((key) => keys.includes(key));
const integer = (value: unknown, min: number, max = Number.MAX_SAFE_INTEGER) =>
  Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;

export function validMarketDialogueVisit(value: unknown): value is MarketDialogueVisit {
  if (!record(value)) return false;
  if (
    !Object.keys(value).every((key) =>
      ['visit', 'realmIndex', 'returning', 'absent', 'openedAt', 'exchanged'].includes(key),
    ) ||
    !integer(value.visit, 1) ||
    !integer(value.realmIndex, 0, 8)
  )
    return false;
  if (
    value.absent !== undefined &&
    !(
      Array.isArray(value.absent) &&
      value.absent.length <= 1 &&
      value.absent.every(isMarketTraderId)
    )
  )
    return false;
  if (
    value.openedAt !== undefined &&
    !(typeof value.openedAt === 'number' && Number.isFinite(value.openedAt) && value.openedAt >= 0)
  )
    return false;
  if (
    value.exchanged !== undefined &&
    !(
      Array.isArray(value.exchanged) &&
      value.exchanged.length <= 3 &&
      new Set(value.exchanged).size === value.exchanged.length &&
      value.exchanged.every(isMarketTraderId)
    )
  )
    return false;
  if (value.returning === undefined) return true;
  return (
    Array.isArray(value.returning) &&
    value.returning.length <= 1 &&
    value.returning.every(
      (entry) =>
        record(entry) &&
        exactKeys(entry, ['slot', 'birthVisit', 'birthSlot', 'realmIndex']) &&
        isMarketTraderId(entry.slot) &&
        isMarketTraderId(entry.birthSlot) &&
        integer(entry.birthVisit, 1, Number(value.visit) - 1) &&
        integer(entry.realmIndex, 0, 7),
    )
  );
}
export function npcPlayerRealm(realm: string) {
  return realm === '渡劫' ? 7 : REALMS.findIndex((name) => realm.startsWith(name));
}

/** 只传当前真人的一份封闭摘要；公开物品用合法 ID，不接受自由姓名、正文、背包或隐藏真假。 */
export function validMarketDialogueContext(
  value: unknown,
  input: Pick<NpcDialogueRequest, 'population' | 'age' | 'npcId' | 'marketVisit' | 'realm'>,
): value is MarketDialogueContext {
  if (
    typeof input.realm !== 'string' ||
    !isMarketCultivatorId(input.npcId) ||
    input.npcId === 'market-fellow' ||
    !validMarketDialogueVisit(input.marketVisit) ||
    !marketCharacters(input.population, input.marketVisit).some((npc) => npc.id === input.npcId) ||
    !record(value) ||
    !exactKeys(value, [
      'contact',
      'events',
      'risk',
      ...(value.trade === undefined ? [] : ['trade']),
    ])
  )
    return false;
  const c = value.contact;
  if (c !== null) {
    if (!record(c) || !isMarketTraderId(input.npcId)) return false;
    const identity = marketIdentity(input.marketVisit, input.npcId);
    const age = (n: unknown) =>
      typeof n === 'number' && Number.isFinite(n) && n >= input.population.since && n <= input.age;
    if (
      !exactKeys(c, [
        'birthVisit',
        'slot',
        'metAt',
        'seenAt',
        'lastVisit',
        'tradeVisit',
        ...(c.aidAt === undefined ? [] : ['aidAt']),
        'goodwill',
        'grudge',
      ]) ||
      !isMarketTraderId(c.slot) ||
      c.birthVisit !== identity.birthVisit ||
      c.slot !== identity.slot ||
      !age(c.metAt) ||
      !age(c.seenAt) ||
      Number(c.seenAt) < Number(c.metAt) ||
      !integer(c.lastVisit, identity.birthVisit, input.marketVisit.visit) ||
      !(c.tradeVisit === 0 || integer(c.tradeVisit, identity.birthVisit, Number(c.lastVisit))) ||
      (c.aidAt !== undefined && (!age(c.aidAt) || Number(c.aidAt) < Number(c.metAt))) ||
      !integer(c.goodwill, 0, 3) ||
      !integer(c.grudge, 0, 3)
    )
      return false;
  }
  const list = (items: unknown, allowed: readonly string[]) =>
    Array.isArray(items) &&
    items.length <= allowed.length &&
    new Set(items).size === items.length &&
    items.every((item) => typeof item === 'string' && allowed.includes(item));
  if (!list(value.events, MARKET_DIALOGUE_EVENTS)) return false;
  if (value.trade !== undefined && !validMarketDialogueTrade(value.trade, input, c)) return false;
  const risk = value.risk;
  if (risk === null) return true;
  if (!record(risk) || !isMarketTraderId(input.npcId)) return false;
  const npc = marketCharacters(input.population, input.marketVisit).find(
    (n) => n.id === input.npcId,
  )!;
  const playerRealm = npcPlayerRealm(input.realm);
  return (
    exactKeys(risk, [
      'kind',
      'inspection',
      'resolved',
      'realmDelta',
      'sectProtection',
      'level',
      'clues',
    ]) &&
    ['goods', 'deposit', 'haggle', 'invitation'].includes(String(risk.kind)) &&
    ['unexamined', 'no-flaw-found', 'fraud-exposed', 'overpriced'].includes(
      String(risk.inspection),
    ) &&
    (risk.inspection !== 'overpriced' || risk.kind === 'haggle') &&
    (risk.kind !== 'haggle' ||
      !['no-flaw-found', 'fraud-exposed'].includes(String(risk.inspection))) &&
    typeof risk.resolved === 'boolean' &&
    playerRealm >= 0 &&
    integer(risk.realmDelta, -8, 7) &&
    risk.realmDelta === npc.realmIndex - playerRealm &&
    typeof risk.sectProtection === 'boolean' &&
    ['谨慎', '危险', '凶险'].includes(String(risk.level)) &&
    list(risk.clues, MARKET_DIALOGUE_CLUES)
  );
}

function validMarketDialogueTrade(
  value: unknown,
  input: Pick<NpcDialogueRequest, 'population' | 'npcId' | 'marketVisit'>,
  contact: unknown,
): value is MarketDialogueTrade {
  if (
    !isMarketTraderId(input.npcId) ||
    !record(value) ||
    !exactKeys(value, ['motive', 'friend', 'wantedMedicineIds', 'wantedWeaponIds', 'lead']) ||
    !['cultivation', 'recovery', 'longevity', 'journey'].includes(String(value.motive)) ||
    typeof value.friend !== 'boolean'
  )
    return false;
  const friend = !!(
    record(contact) &&
    Number(contact.goodwill) >= 2 &&
    contact.grudge === 0 &&
    Number(contact.birthVisit) < input.marketVisit!.visit
  );
  if (value.friend !== friend) return false;
  const ids = (items: unknown, max: number, valid: (id: string) => boolean) =>
    Array.isArray(items) &&
    items.length <= max &&
    new Set(items).size === items.length &&
    items.every((id) => typeof id === 'string' && valid(id));
  if (
    !ids(value.wantedMedicineIds, 3, (id) => !!medicineInfo(id)) ||
    !ids(value.wantedWeaponIds, 2, (id) => TREASURES.some((t) => t.id === id))
  )
    return false;
  const lead = value.lead;
  if (lead === null) return true;
  return (
    friend &&
    record(lead) &&
    exactKeys(lead, ['npcId', 'kind', 'id', 'quantity', 'forgeLevel', 'minimumLevel', 'price']) &&
    isMarketTraderId(lead.npcId) &&
    lead.npcId !== input.npcId &&
    marketCharacters(input.population, input.marketVisit!).some((npc) => npc.id === lead.npcId) &&
    typeof lead.id === 'string' &&
    integer(lead.quantity, 1, 3) &&
    integer(lead.forgeLevel, 0, MAX_FORGE_LEVEL) &&
    integer(lead.minimumLevel, 0, Number(lead.forgeLevel)) &&
    integer(lead.price, 1, 64000) &&
    (lead.kind === 'medicine'
      ? !!medicineInfo(lead.id) && lead.forgeLevel === 0 && lead.minimumLevel === 0
      : lead.kind === 'artifact' && lead.quantity === 1 && TREASURES.some((t) => t.id === lead.id))
  );
}

function marketDialogueLead(input: NpcDialogueRequest) {
  const lead = input.marketContext?.trade?.lead;
  if (!lead) return '';
  const npc = marketCharacters(input.population, input.marketVisit!).find(
    (n) => n.id === lead.npcId,
  );
  if (!npc) return '';
  const item =
    lead.kind === 'medicine'
      ? medicineInfo(lead.id)!.name
      : `${TREASURES.find((t) => t.id === lead.id)!.name}（至少${lead.minimumLevel}阶，按${lead.forgeLevel}阶估价）`;
  return `${npc.name}眼下求购${item} ×${lead.quantity}，挂牌${lead.price}灵石。是否交货、实际报价，以他当面的求购为准`;
}

export function marketAsksForLead(message: string) {
  return /求购|收购|余物|卖给|指路|门路|谁.{0,8}(?:要|收|买)|(?:上次|刚才|那位|他).{0,12}(?:还收|还要|还买)/.test(
    message,
  );
}

const TRADE_MOTIVE_MEMORY: Record<MarketTradeMotiveKind, string> = {
  cultivation:
    '你自己说修行遇到关隘，正为入山历练备药、多积修为；没有承诺服药立即突破或闭关获得药效',
  recovery: '你自己说前次出山带伤，如今要调养；这是当事人自述，不是玩家看穿前辈伤势',
  longevity: '你自己说寿数渐紧，正访药续命；没有提供具体年岁或余寿，不能编造倒计时',
  journey: '你自己说即将远行，正备护身之物与丹药；没有额外护送任务',
};

function marketDialogueTradeMemory(input: NpcDialogueRequest) {
  const trade = input.marketContext?.trade;
  if (!trade) return '没有公开的备物用途与求购指引，不编造所需品种、同行或货源。';
  const medicines = trade.wantedMedicineIds.map((id) => medicineInfo(id)!.name);
  const weapons = trade.wantedWeaponIds.map((id) => TREASURES.find((t) => t.id === id)!.name);
  return `${TRADE_MOTIVE_MEMORY[trade.motive]}。当面说想要的物品：${[...medicines, ...weapons].join('、') || '没有具体物品'}。${trade.friend ? '你们确有多次公平往来，重逢时可介绍眼下公开的求购；留货与报价以界面规则为准，不在闲聊里承诺免费赠物、赊账或额外折扣。' : '还未形成故交，不能声称专门留货、欠人情或愿意赊账。'}${trade.lead ? `当前仍有效的指引：${marketDialogueLead(input)}。` : '当前没有可介绍的求购，不沿用聊天历史里的旧求购。'}`;
}

const EVENT_MEMORY: Record<(typeof MARKET_DIALOGUE_EVENTS)[number], string> = {
  exchange: '本批按界面完成过互换',
  debate: '本批坐而论道已经结算',
  request: '本批当面交货已经结清',
  declined: '本批私下邀约已被婉拒',
  exposed: '本批玩家已亲自核验过机缘',
  fraud: '本批已经实际受骗',
  gift: '本批私下机缘已经交付所得',
  ambush: '本批已经实际遭遇劫修伏击',
  victory: '本批劫修遭遇已经取胜',
  escaped: '本批已经从劫修遭遇撤离',
  defeat: '本批劫修遭遇已经落败',
};
const CLUE_MEMORY: Record<(typeof MARKET_DIALOGUE_CLUES)[number], string> = {
  'higher-realm': '邀约修士已在明面表现出较高境界',
  'sect-backing': '玩家目前有在籍宗门的照应，但这不等于坊外没有致命风险',
  'old-grudge': '双方已有实际嫌隙',
  'known-trader': '双方此前确有当面交易，不据此保证下一次私约安全',
  'suspicious-seal': '封签叠有新旧两层纸，隔瓶难辨药香',
  'upfront-fee': '先垫路费的要求已明示，收货凭据尚未拿出',
  'marked-up-price': '凡品丹药的卖价高于药铺明示参考价',
  'secluded-road': '邀约处偏僻，玩家可以拒绝赴约',
  bloodstain: '邀约修士袖口可见旧血迹',
  'pressed-departure': '邀约修士当面催促尽快动身',
  'claimed-sect':
    '邀约修士自称与宗门相熟、坊外有人照应；只是当面说法，尚未核实，不能当作真实身份或安全保证',
};
export function marketDialogueMemory(input: NpcDialogueRequest) {
  const context = input.marketContext;
  if (!context) return '未提供真人往来记录；不能把上一批同位置修士的故事当成自己的记忆。';
  const c = context.contact;
  const memory = c
    ? [
        c.birthVisit < input.marketVisit!.visit
          ? '你与玩家确曾在此前来访时相识，此次是同一个人的重逢；只记得下列已证实往来。'
          : '你与玩家的相识只记录在当前来访中；不能说成久别重逢。',
        ...(c.tradeVisit > 0
          ? ['你们曾实际完成过当面交易，但未提供具体货品，不能编造货品、数量或价钱。']
          : []),
        ...(c.aidAt !== undefined
          ? [
              '玩家曾在坊中实际相助或指点，你记得这份人情；未提供具体事由，不编造送药、修炼进境或第三人的隐情。',
            ]
          : []),
        ...(c.goodwill > 0 ? ['你们有过友善往来，不能据此保证今后的交易没有风险。'] : []),
        ...(c.grudge > 0
          ? [
              '你们之间已有嫌隙，可以戒备或言语试探；没有明确事件时不编造谁先动手，也不在闲谈中扣物资或开战。',
            ]
          : []),
      ].join('')
    : '没有与你这个真人有关的旧识记录；即便位置或名字相似，也不能继承其他人的记忆。';
  const events =
    context.events.map((kind) => EVENT_MEMORY[kind]).join('；') || '没有当批已完成事件。';
  const r = context.risk;
  const risk = r
    ? `当面可见的私下机缘为${{ goods: '低价转丹', deposit: '先垫路费的求购', haggle: '卖方加价卖药', invitation: '坊外赴约' }[r.kind]}，${r.resolved ? '此事已经结束' : '玩家尚可自行取舍'}，界面风险为${r.level}。${r.clues.map((clue) => CLUE_MEMORY[clue]).join('；')}。${{ unexamined: '尚未核验，不能断言这次是真是假。', 'no-flaw-found': '玩家已核验，暂未见破绽；不能把未见破绽说成绝对安全。', 'fraud-exposed': '玩家已核验并查明骗局，可以承认已公开的破绽。', overpriced: '玩家已核对药铺价格，此次加价已经明示。' }[r.inspection]}`
    : '目前没有当面私下机缘线索，不编造邀约、埋伏或交易结果。';
  return `${memory}\n已发生事件：${events}\n当面风险：${risk}\n备物缘由与熟人指路：${marketDialogueTradeMemory(input)}\n往来记录没有玩家此前境界、精进速度或修炼方法；重逢不等于看得出前辈精进。其他人的私下伏击、死亡或骗术不在你的已知记录中，不能说成亲眼所见或全坊皆知；玩家自己提起时，只能回应其自述，不自行添设证人、报复或结算。`;
}

/** 离线与模型失实回退共用；风险与往来只引用同一份当前真人事实。 */
export function marketDialogueLocalReply(input: NpcDialogueRequest) {
  const npc = marketCharacters(input.population, input.marketVisit!).find(
    (n) => n.id === input.npcId,
  );
  if (!npc) return '此处已无人应声。';
  const playerRealm = npcPlayerRealm(input.realm);
  const context = input.marketContext;
  if (/精进|进境|进展|突破|境界|修为/.test(input.message))
    return marketLocalReply(npc, input.message, playerRealm);
  const address =
    npc.realmIndex < playerRealm ? '前辈' : npc.realmIndex === playerRealm ? '道友' : '小友';
  const riskQuestion = /骗|险|劫|机缘|邀|赴约|真假|核验|凭据|可信|信任/.test(input.message);
  if (context?.risk?.inspection === 'fraud-exposed' && riskQuestion)
    return `${address}，你已当面查出这桩机缘的破绽，别再为好听话垫款。普通拍卖、互换照各自明示规则，不与这桩私下邀约混为一谈。`;
  if (context?.risk?.kind === 'invitation' && !context.risk.resolved && riskQuestion)
    return `${address}，私下赴约可能遇劫修，战败会身陨。撤离须实际走到左侧退路并拉开距离，稳住两息；胜负、复活与所得都由历练界面结算，闲聊不能保命。`;
  if (context?.risk && riskQuestion) {
    if (context.risk.inspection === 'no-flaw-found')
      return `${address}，你已当面核验，眼下未见破绽。凭据仍须与实际交付对上，没查出问题也不是替往后的交易作保。`;
    if (context.risk.kind === 'goods')
      return `${address}，封签叠着新旧两层纸，隔瓶难辨药香。尚未核验，不能断言真假；可先验丹、核对来路，也可直接作别。`;
    if (context.risk.kind === 'deposit')
      return `${address}，收货凭据尚未拿出，却先要你垫路费。尚未核验便先付钱，风险要自己担；可核实接应者与凭据，也可婉拒。`;
    if (context.risk.kind === 'haggle')
      return `${address}，这份凡品的卖价高于药铺明示参考价，价差摆在眼前。是否成交由你自己取舍，闲聊不扣灵石，也不替你买药。`;
  }
  const trade = context?.trade;
  if (
    trade &&
    marketAsksForLead(input.message) &&
    !/你.{0,8}(?:求购|收购|要什么)/.test(input.message)
  )
    return trade.lead
      ? `${address}，${marketDialogueLead(input)}。`
      : `${address}，眼下没有我能替你指明的求购。旧消息未必还作数，到各摊前看看当面的物品与报价再作打算。`;
  if (trade && /你.{0,6}(?:要|需|寻|备|买)|为何|为什么|打算|用途|所需/.test(input.message)) {
    const purpose: Record<MarketTradeMotiveKind, string> = {
      cultivation: '修行遇了关隘，我想备药入山历练，多积些修为',
      recovery: '前次出山带了些伤，如今要紧的是调养',
      longevity: '寿数渐紧，此行只为访药续命',
      journey: '过些时日要远行，想先备好路上的丹药与护身之物',
    };
    const wanted = [
      ...trade.wantedMedicineIds.map((id) => medicineInfo(id)!.name),
      ...trade.wantedWeaponIds.map((id) => TREASURES.find((t) => t.id === id)!.name),
    ].join('、');
    return `${address}，${purpose[trade.motive]}。${wanted ? `正寻${wanted}，若有余物，可按当面列出的组合商量。` : '是否相换，仍按当面列出的货色与报价。'}`;
  }
  if (
    context?.contact?.grudge &&
    /认得|记得|见过|近来|招呼|你我|上次|恩怨|敌意/.test(input.message)
  )
    return `${address}，你我之间已有嫌隙，这话我记着。买卖还须看当面的凭据，闲聊既不算成交，也不能替谁抹去旧账。`;
  if (
    context?.contact?.aidAt !== undefined &&
    /相助|帮忙|指点|讲法|人情|记得|你我|上次/.test(input.message)
  )
    return `${address}，先前在坊中承过你的帮助，这份人情我记得。今日的事仍按眼前凭据说，不拿旧情替谁作保。`;
  if (context?.contact?.tradeVisit && /认得|记得|见过|近来|招呼|你我|上次|交易/.test(input.message))
    return `${address}，你我曾按当面报价做过交易，这段往来我记得。今日货色仍须验明，熟识也不是省去凭据的理由。`;
  if (
    context?.contact &&
    context.contact.birthVisit < input.marketVisit!.visit &&
    /认得|记得|见过|近来|招呼|你我|上次/.test(input.message)
  )
    return `${address}，先前在坊市确曾相识，今日又碰面了。说说当下的见闻便好，你这一程的修行，我不凭重逢妄下断语。`;
  return marketLocalReply(npc, input.message, playerRealm);
}
