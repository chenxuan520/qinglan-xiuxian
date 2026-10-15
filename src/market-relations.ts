import { marketSocialRoll } from './market-social-data.ts';
import { REALM_LIFESPANS } from './data.ts';
import type { SaveData } from './progress.ts';
import {
  marketCultivators,
  marketIdentity,
  isMarketTraderId,
  MARKET_CULTIVATORS,
  type MarketCultivatorId,
  type SectMarketState,
} from './sect-market-data.ts';
import { MAX_MARKET_CONTACTS, type MarketIdentity } from './market-relations-data.ts';

const same = (a: MarketIdentity, b: MarketIdentity) =>
  a.birthVisit === b.birthVisit && a.slot === b.slot;
export function marketContact(save: SaveData, id: MarketCultivatorId) {
  const state = save.mortal.sectMarket;
  if (!state || !isMarketTraderId(id)) return undefined;
  const identity = marketIdentity(state, id);
  return save.mortal.marketRelations?.contacts.find((c) => same(c, identity));
}
export function rememberMarketContact(save: SaveData, id: MarketCultivatorId) {
  const state = save.mortal.sectMarket,
    population = save.mortal.population;
  if (!state || !population || !isMarketTraderId(id)) return undefined;
  const contacts = (save.mortal.marketRelations ??= { contacts: [] }).contacts;
  let contact = marketContact(save, id);
  if (!contact) {
    const npc = marketCultivators(population, state).find((n) => n.id === id)!;
    contact = {
      ...marketIdentity(state, id),
      realmIndex: npc.realmIndex,
      metAt: save.age,
      seenAt: save.age,
      lastVisit: state.visit,
      goodwill: 0,
      grudge: 0,
      dead: false,
      tradeVisit: 0,
    };
    contacts.push(contact);
    if (contacts.length > MAX_MARKET_CONTACTS) {
      const protectedIdentities = [
        ...MARKET_CULTIVATORS.map((n) => marketIdentity(state, n.id)),
        ...(state.returning ?? []).map((r) => ({ birthVisit: r.birthVisit, slot: r.birthSlot })),
        ...(save.mortal.marketSocial?.ambush ? [save.mortal.marketSocial.ambush.identity] : []),
      ];
      const oldest = contacts
        .filter((c) => c !== contact && !protectedIdentities.some((i) => same(c, i)))
        .sort(
          (a, b) =>
            Number(a.goodwill >= 2 || a.grudge > 0) - Number(b.goodwill >= 2 || b.grudge > 0) ||
            a.seenAt - b.seenAt ||
            a.lastVisit - b.lastVisit,
        )[0];
      contacts.splice(contacts.indexOf(oldest), 1);
    }
  }
  contact.seenAt = save.age;
  contact.lastVisit = state.visit;
  return contact;
}
export function rememberMarketTrade(save: SaveData, id: MarketCultivatorId) {
  const contact = rememberMarketContact(save, id);
  if (!contact || contact.dead || contact.tradeVisit === save.mortal.sectMarket!.visit) return;
  contact.tradeVisit = save.mortal.sectMarket!.visit;
  if (contact.aidVisit === contact.tradeVisit) return;
  contact.goodwill = Math.min(3, contact.goodwill + 1);
}
export function rememberMarketAid(save: SaveData, id: MarketCultivatorId) {
  const contact = rememberMarketContact(save, id);
  const visit = save.mortal.sectMarket!.visit;
  if (!contact || contact.dead || contact.aidVisit === visit) return;
  contact.aidAt = save.age;
  contact.aidVisit = visit;
  if (contact.tradeVisit !== visit) contact.goodwill = Math.min(3, contact.goodwill + 1);
}
export function rememberMarketAmbush(
  save: SaveData,
  id: MarketCultivatorId,
  outcome: 'victory' | 'escaped' | 'defeat',
) {
  const contact = rememberMarketContact(save, id);
  if (!contact) return;
  if (outcome === 'victory') contact.dead = true;
  else contact.grudge = Math.min(3, contact.grudge + 1);
}
export function returningMarketContact(
  save: SaveData,
  visit: number,
): SectMarketState['returning'] {
  if (visit % 3 !== 0) return undefined;
  const eligible = save.mortal.marketRelations?.contacts.filter(
    (c) =>
      !c.dead &&
      c.lastVisit < visit - 1 &&
      (c.goodwill > 0 || c.grudge > 0) &&
      save.age - c.metAt < REALM_LIFESPANS[c.realmIndex] * 0.6,
  );
  if (!eligible?.length) return undefined;
  const seed = ((save.mortal.population?.seed ?? 0) + Math.imul(visit, 2654435761)) >>> 0;
  const contact = eligible[seed % eligible.length];
  return [
    {
      slot: MARKET_CULTIVATORS[(seed >>> 8) % MARKET_CULTIVATORS.length].id,
      birthVisit: contact.birthVisit,
      birthSlot: contact.slot,
      realmIndex: contact.realmIndex,
    },
  ];
}
export function marketKnownMemory(save: SaveData, id: MarketCultivatorId) {
  const c = marketContact(save, id);
  if (!c) return '';
  if (c.dead) return '这名劫修已经身死，不会再来坊市。';
  return [
    c.birthVisit < save.mortal.sectMarket!.visit
      ? '旧识重逢，你认得这张面孔。'
      : '此番相识，彼此已留过名字。',
    c.tradeVisit ? '曾经当面公平交易，对方愿意提醒你核对凭据与退路。' : '',
    c.aidAt !== undefined ? '你曾在坊中切实相助，这份情谊当事人记在心里。' : '',
    c.debateGiftAt !== undefined ? '这位旧识已赠过一份凡品丹药答谢相助，本世不再重复回礼。' : '',
    c.grudge ? '你认出先前伏击你的劫修。旧怨尚在，私下赴约尤其危险；可留在坊市，直接作别。' : '',
  ]
    .filter(Boolean)
    .join('');
}

export function marketFriendClue(
  save: SaveData,
  kind: 'goods' | 'deposit' | 'haggle' | 'invitation',
) {
  const friend = save.mortal.marketRelations?.contacts
    .filter((c) => !c.dead && c.goodwill >= 2 && c.grudge === 0)
    .sort((a, b) => b.seenAt - a.seenAt)[0];
  if (!friend || !save.mortal.population || !save.mortal.sectMarket) return '';
  const name = marketCultivators(save.mortal.population, {
    ...save.mortal.sectMarket,
    visit: friend.birthVisit,
    returning: undefined,
    absent: undefined,
  }).find((n) => n.id === friend.slot)!.name;
  const advice =
    kind === 'goods'
      ? '先看封签是否重贴，再对照瓶上药号与交货凭据；隔瓶闻香，辨不清真药。'
      : kind === 'deposit'
        ? '先问清收货人和当面交割的凭据，别拿路费垫款当成对方会收货的保证。'
        : kind === 'invitation'
          ? '先问清接应人、约定处与折返的路；自称宗门有人照应，也须查验凭据。临时改道便先停步。'
          : '先到药铺对一对同品药价，别把卖家口中的稀罕当成真正的品级。';
  return `旧识${name}曾提醒过你：${advice}`;
}

// 入场时固定本批事实；后来的交易、突破或入宗不改写已看到的凭据与核验结论。
export function prepareMarketOpportunity(save: SaveData) {
  const state = save.mortal.sectMarket,
    population = save.mortal.population;
  if (!state || !population || state.opportunityHonest !== undefined) return;
  const roll = (key: string) => marketSocialRoll(population, state.visit, key);
  const id = MARKET_CULTIVATORS[roll('opportunity-owner') % 3].id;
  const invitation = roll(`opportunity-kind:${id}`) % 4 === 3;
  const npc = marketCultivators(population, state).find((n) => n.id === id);
  const contact = marketContact(save, id);
  const threat =
    invitation && npc
      ? Math.max(
          10,
          Math.min(
            75,
            40 +
              (contact?.grudge ?? 0) * 15 -
              (contact?.goodwill ?? 0) * 5 -
              (npc.realmIndex < state.realmIndex ? 15 : 0) -
              (save.mortal.member ? 15 : 0),
          ),
        )
      : 40;
  state.opportunityHonest = roll(`opportunity-truth:${id}`) % 100 >= threat;
}
