import type { SaveData } from './progress.ts';
import { marketContact } from './market-relations.ts';
import { marketRequest } from './market-social.ts';
import { auctionItemName } from './auction-items.ts';
import {
  marketCultivators,
  isMarketTraderId,
  type MarketCultivatorId,
  type MarketTraderId,
} from './sect-market-data.ts';

const ECHO_LINES = {
  victory:
    '坊中人声未歇，你却记得坊外那场生死。劫修已经伏诛，眼前的笑脸仍须一张张辨清；那条僻路上的事，旁人未必知晓。',
  escaped:
    '又见坊市灯火，你想起从那场追杀中挣出的退路。失去的灵石尚能再挣，下回听人催你离开人多处，便先看清归途。',
  fraud: '摊前仍有人把货色夸得天花乱坠。你想起上回付出的灵石，目光先落在了封签与交割凭据上。',
  exposed: '你记得亲手核过的封签与凭据。眼前的买卖仍要逐件验看，前一桩的结论，不能替下一桩作保。',
  gift: '行囊中添过的那件东西，让你记得坊市也有不负约的相逢。真机缘与好听话混在人声里，仍得亲自辨认。',
} as const;

/** 玩家自己记得的往事，不能当作街上传闻或无关修士的见闻。 */
export function marketWorldEcho(save: SaveData) {
  if (save.pendingReincarnation || save.journeyEnded || save.mortal.marketSocial?.ambush)
    return undefined;
  const entry = save.mortal.marketSocial?.logs.find(
    (log) => log.at <= save.age && Object.hasOwn(ECHO_LINES, log.kind),
  );
  if (!entry) return undefined;
  const kind = entry.kind as keyof typeof ECHO_LINES;
  return { kind, at: entry.at, title: '行过方知', text: ECHO_LINES[kind] };
}

/** 熟人只介绍眼下仍挂牌的真实求购；完成或离场即失效，不编造持货人。 */
export function marketFriendLead(save: SaveData, id: MarketCultivatorId) {
  const state = save.mortal.sectMarket;
  const contact = marketContact(save, id);
  if (
    !state ||
    !save.mortal.population ||
    !isMarketTraderId(id) ||
    state.absent?.includes(id) ||
    !contact ||
    contact.dead ||
    contact.goodwill < 2 ||
    contact.grudge > 0 ||
    contact.birthVisit >= state.visit ||
    save.mortal.marketSocial?.visit !== state.visit ||
    save.mortal.marketSocial.ambush ||
    save.pendingReincarnation ||
    save.journeyEnded
  )
    return undefined;
  for (const npc of marketCultivators(save.mortal.population, state)) {
    if (
      npc.id === id ||
      state.absent?.includes(npc.id as MarketTraderId) ||
      save.mortal.marketSocial.fulfilled.includes(npc.id)
    )
      continue;
    const request = marketRequest(save, npc.id);
    if (!request) continue;
    const item = `${auctionItemName(request)}${request.kind === 'artifact' ? `（至少${request.minimumLevel}阶，按${request.forgeLevel}阶估价）` : ''} ×${request.quantity}`;
    return {
      npcId: npc.id as MarketTraderId,
      name: npc.name,
      kind: request.kind,
      id: request.id,
      quantity: request.quantity,
      forgeLevel: request.forgeLevel,
      minimumLevel: request.minimumLevel,
      price: request.price,
      title: '旧识指路',
      text: `「${npc.name}眼下正求购${item}，挂牌${request.price}灵石。你若恰有余物，可以当面问问；带什么去，价钱就按那份货重新核对。」`,
    };
  }
  return undefined;
}
