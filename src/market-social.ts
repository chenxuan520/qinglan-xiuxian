import { isCurio, grantCurio, ownsCurio } from './curio-data.ts';
import { trainingEffect } from './training.ts';
import { debateQuote } from './market-debate.ts';
import { FINAL_TRIAL_STAGE, TREASURES, treasure, spiritRootInfo, pathInfo } from './data.ts';
import { MEDICINES, medicineInfo } from './medicine-data.ts';
import {
  forgeDamageBonus,
  recordCollectionAchievement,
  realmInfo,
  type SaveData,
} from './progress.ts';
import { advanceMortal } from './mortal.ts';
import { recordChronicle } from './chronicle.ts';
import {
  marketCultivators,
  marketMedicinePool,
  MARKET_CULTIVATORS,
  isMarketTraderId,
  marketIdentity,
  type MarketCultivatorId,
} from './sect-market-data.ts';
import {
  marketSocialRoll,
  marketDisposition,
  validMarketAmbush,
  type MarketSocialLog,
} from './market-social-data.ts';
import {
  auctionReason,
  auctionValue,
  auctionDues,
  prepareAuction,
  auctionSellReason,
  releaseAuctionItem,
  auctionItemName,
} from './auction.ts';
import { freeStarter, type AuctionItem } from './auction-data.ts';
import {
  marketContact,
  prepareMarketOpportunity,
  rememberMarketContact,
  rememberMarketTrade,
  rememberMarketAmbush,
} from './market-relations.ts';
import { initialAmbushSnapshot } from './market-ambush-data.ts';
import { MARKET_SOCIAL_SETTINGS } from './setting.ts';
import { marketInvitationReward } from './market-opportunities.ts';
import { marketTradeMotive } from './market-trade-motives.ts';

export function prepareMarketSocial(save: SaveData) {
  const market = save.mortal.sectMarket;
  if (!market || !save.mortal.population) return false;
  save.mortal.marketSocial ??= {
    visit: market.visit,
    fulfilled: [],
    used: [],
    inspected: [],
    lastDebateAt: null,
    lastOpportunityAt: null,
    ambush: null,
    logs: [],
  };
  const s = save.mortal.marketSocial;
  if (s.visit !== market.visit) {
    if (s.ambush) return false;
    s.visit = market.visit;
    s.fulfilled = [];
    s.used = [];
    s.inspected = [];
  }
  prepareMarketOpportunity(save);
  prepareAuction(save);
  return true;
}
function roll(save: SaveData, key: string) {
  return marketSocialRoll(save.mortal.population!, save.mortal.sectMarket!.visit, key);
}
function npc(save: SaveData, id: MarketCultivatorId) {
  return marketCultivators(save.mortal.population!, save.mortal.sectMarket!).find(
    (n) => n.id === id,
  )!;
}
export function marketSocialReason(
  save: SaveData,
  id: MarketCultivatorId,
  visit: number,
  years: number,
  artifact = false,
  unfinished = false,
) {
  if (
    !isMarketTraderId(id) ||
    !save.mortal.marketSocial ||
    save.mortal.marketSocial.visit !== visit
  )
    return '来访修士已更换，请重新交谈';
  if (save.mortal.marketSocial.ambush) return '请先处理尚未结束的劫修遭遇';
  if (
    save.mortal.sectMarket?.absent?.includes(id as (typeof MARKET_CULTIVATORS)[number]['id']) ||
    marketContact(save, id)?.dead
  )
    return '这名劫修已经身死，无法再交谈';
  return auctionReason(save, visit, artifact, unfinished, years);
}
function log(save: SaveData, id: MarketCultivatorId, kind: MarketSocialLog['kind'], text: string) {
  rememberMarketContact(save, id);
  const record = { visit: save.mortal.sectMarket!.visit, npcId: id, at: save.age, kind, text };
  save.mortal.marketSocial!.logs.unshift(record);
  save.mortal.marketSocial!.logs.splice(12);
  save.mortal.events.unshift(`${save.age.toFixed(1)} 岁 · ${text}`.slice(0, 160));
  save.mortal.events.splice(6);
  recordChronicle(
    save,
    kind === 'debate' ? '坊间论道' : kind === 'request' ? '同道委托' : '坊间见闻',
    text,
  );
  return record;
}
export function debateReason(
  save: SaveData,
  id: MarketCultivatorId,
  visit: number,
  choice?: string,
) {
  const r = marketSocialReason(save, id, visit, MARKET_SOCIAL_SETTINGS.debateYears);
  if (r) return r;
  const last = save.mortal.marketSocial!.lastDebateAt;
  if (last !== null && save.age < last + MARKET_SOCIAL_SETTINGS.debateInterval - 1e-9)
    return `再历 ${Math.ceil((last + MARKET_SOCIAL_SETTINGS.debateInterval - save.age - 1e-9) * 10) / 10} 年可论道有所获`;
  if (choice !== undefined) {
    const quote = debateQuote(save, id, choice);
    if (!quote) return '丹方或互授条件已变化，请重新查看';
    if (save.stones < quote.price + auctionDues(save, MARKET_SOCIAL_SETTINGS.debateYears))
      return '灵石不足，请备足抄录费与到期供奉';
    if (quote.kind === 'medicine' && !Number.isSafeInteger((save.medicine.bag[quote.id] || 0) + 1))
      return '丹囊数量已达上限';
  }
  return '';
}
export function debateReward(save: SaveData, id: MarketCultivatorId) {
  return debateQuote(save, id)!;
}
export function debateMarket(
  save: SaveData,
  id: MarketCultivatorId,
  visit: number,
  choice = 'talk',
) {
  if (debateReason(save, id, visit, choice)) return undefined;
  const reward = debateQuote(save, id, choice)!;
  const n = npc(save, id);
  const player = realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).index;
  const root = spiritRootInfo(save.spiritRoot);
  const item = treasure(save.starter);
  const opening =
    n.realmIndex > player
      ? '前辈点破你修行中的取舍'
      : n.realmIndex === player
        ? '你们互证所得，各有所悟'
        : '你听他述说初入道途的困顿，也重新审视了自己的根基';
  const advice =
    save.path === 'orthodox'
      ? '正道护住根基，法宝与功法相辅，才经得住长路。'
      : save.path === 'demonic'
        ? '魔道催发威力也有代价，贪强一时，未必守得住气血。'
        : '正魔兼修须知取舍，功法有限，先让本命与配套功法成形。';
  const rootLine =
    save.spiritRoot === 'heaven'
      ? '天赋虽好，也别凭资质轻看下一重秘境。'
      : save.spiritRoot === 'none'
        ? '凡躯问道，护住气血与退路，再靠淬体与备药补足根基。'
        : '灵根各有长短，顺着所长立本命，备药与淬体也能补其不足。';
  advanceMortal(save, MARKET_SOCIAL_SETTINGS.debateYears * 60);
  save.stones -= reward.price;
  if (reward.kind === 'recipe') {
    save.medicine.recipes.push(reward.id);
    rememberMarketTrade(save, id);
    if (reward.exchange) {
      const contact = rememberMarketContact(save, id)!;
      (contact.taughtRecipes ??= []).push(reward.exchange);
    }
  } else if (reward.kind === 'medicine') {
    save.medicine.bag[reward.id] = (save.medicine.bag[reward.id] || 0) + 1;
    rememberMarketContact(save, id)!.debateGiftAt = save.age;
  }
  save.mortal.marketSocial!.lastDebateAt = save.age;
  const text = `与${n.name}论道一年，${opening}。${root.name} · ${pathInfo(save.path).name} · 本命${item.name}。${rootLine}${advice}${reward.kind === 'recipe' ? `${reward.exchange ? `向对方讲授${medicineInfo(reward.exchange)!.name}丹方，互授` : `支付${reward.price}灵石抄录`}所得为${medicineInfo(reward.id)!.name}丹方，本世材料组合不变，未领取成品丹药。` : reward.kind === 'medicine' ? `旧识以${medicineInfo(reward.id)!.name}一份答谢当年相助，已收入丹囊；本人本世不再重复赠送。` : '此番交流修行取舍，未获赠丹药或丹方，修为与属性不变。'}`;
  return log(save, id, 'debate', text);
}
export function marketRequest(save: SaveData, id: MarketCultivatorId) {
  if (
    !save.mortal.sectMarket ||
    !save.mortal.population ||
    save.mortal.sectMarket.absent?.includes(id as (typeof MARKET_CULTIVATORS)[number]['id'])
  )
    return undefined;
  const seed = roll(save, 'request-owner');
  if (MARKET_CULTIVATORS[seed % 3].id !== id) return undefined;
  const motive = marketTradeMotive(save, id);
  if (!motive) return undefined;
  const n = npc(save, id);
  const medicine =
    motive.kind !== 'journey' ||
    !motive.preferredWeaponIds.length ||
    roll(save, `request-kind:${id}`) % 2 === 0;
  let item: AuctionItem;
  if (medicine) {
    const pool = motive.preferredMedicineIds.map((medicine) => medicineInfo(medicine)!);
    const m = pool[roll(save, `request-item:${id}`) % pool.length];
    item = {
      kind: 'medicine',
      id: m.id,
      quantity: 1 + (roll(save, `request-count:${id}`) % 3),
      forgeLevel: 0,
    };
  } else {
    const pool = motive.preferredWeaponIds.map((weapon) => treasure(weapon));
    const t = pool[roll(save, `request-item:${id}`) % pool.length];
    item = {
      kind: 'artifact',
      id: t.id,
      quantity: 1,
      forgeLevel: Math.min(3, Math.max(freeStarter(t.id) ? 1 : 0, n.realmIndex - 2)),
    };
  }
  const minimumLevel = item.forgeLevel;
  if (item.kind === 'artifact') item.forgeLevel = Math.max(minimumLevel, save.forge[item.id] || 0);
  const identity = marketIdentity(
    save.mortal.sectMarket!,
    id as (typeof MARKET_CULTIVATORS)[number]['id'],
  );
  const disposition = marketDisposition(
    save.mortal.population!,
    identity.birthVisit,
    identity.slot,
  );
  const playerRealm = realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).index;
  const coerced = disposition === '强横' && n.realmIndex > playerRealm;
  const baseRatio = coerced
    ? 70
    : disposition === '精明'
      ? 78
      : 85 + (roll(save, `request-price:${id}`) % 11);
  const needBonus = motive.kind === 'recovery' || motive.kind === 'longevity' ? 4 : 2;
  const ratio = coerced
    ? baseRatio
    : Math.min(motive.friend ? 98 : 95, baseRatio + needBonus + (motive.friend ? 3 : 0));
  const budget = 1000 * (n.realmIndex + 1) ** 2;
  const basePrice = Math.min(budget, Math.floor((auctionValue(item) * baseRatio) / 100));
  const price = Math.min(budget, Math.floor((auctionValue(item) * ratio) / 100));
  const priceText = coerced
    ? '他仗着境界压低收货价，你可以拒绝，不必因威压交货。'
    : price === budget
      ? '他此行携带的灵石有限，以眼前明示的收货价为准；是否交货由你取舍。'
      : motive.friend && price > basePrice
        ? '故交愿为合用之物再添一点报酬；仍以眼前明示的收货价为准。'
        : price > basePrice
          ? '此物正合他眼下所需，收货价比他通常的报价略高；是否交货由你取舍。'
          : '此物正合他眼下所需，按眼前明示的收货价结算；是否交货由你取舍。';
  return {
    ...item,
    kind: item.kind as 'medicine' | 'artifact',
    minimumLevel,
    price,
    motiveTitle: motive.title,
    motiveText: motive.disclosure,
    priceText,
  };
}
export function marketWorldScene(save: SaveData, id: MarketCultivatorId) {
  const n = npc(save, id);
  const player = realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).index;
  const identity = marketIdentity(
    save.mortal.sectMarket!,
    id as (typeof MARKET_CULTIVATORS)[number]['id'],
  );
  const mood = marketDisposition(save.mortal.population!, identity.birthVisit, identity.slot);
  const scenes =
    n.realmIndex > player
      ? [
          '他的威压拂过衣袖，你下意识收紧行囊。对方随口说的价钱，低阶修士也未必敢争；先看明示报价，守住退路。',
          '他谈起一名散修为取宝孤身赴约，最后连护身法器都没带回来。你望了眼自己的行囊，知道好听的话不等于可靠的凭据。',
          '对方目光掠过你腰间法宝，却没有先说货在何处。境界悬殊时，独自赴约更须小心；可以核验，也可以婉拒。',
        ]
      : n.realmIndex < player
        ? [
            '见你靠近，他先把露在袖口的丹瓶藏好，才低声见礼。修士并非都敢把身家摆出来，低阶者尤其如此。',
            '他原先话说得很满，察觉你的气息后便收敛了些。坊市中的客气，常常也要看彼此境界。',
            '他提起有人仗着高阶强买强卖，自己只敢找熟人结伴交易。你更强，也不必因此轻信每一张笑脸。',
          ]
        : [
            '你们口称道友，手却都没离开护身法宝。一样的大境界，并不代表知道对方藏着多少手段。',
            '他说上次有人把收货说成垫路费，灵石交出后，承诺便成了一句空话。你决定先看凭据，再谈信任。',
            '他提醒你，露财易招觊觎，独行易受试探。交易时留在明处，疑点多时宁可作别。',
          ];
  const ending =
    mood === '强横' && n.realmIndex > player
      ? '他的话中带着逼迫，报价也可能有意压低；你仍可拒绝。'
      : mood === '虚浮'
        ? '他说起货色时格外夸张，价钱和品级仍须自己核对。'
        : '';
  return scenes[roll(save, `world:${id}`) % scenes.length] + ending;
}
export function requestReason(
  save: SaveData,
  id: MarketCultivatorId,
  visit: number,
  expectedLevel: number,
  unfinished = false,
) {
  const offer = marketRequest(save, id);
  if (!offer) return '这位修士本批暂无求购';
  const r = marketSocialReason(
    save,
    id,
    visit,
    MARKET_SOCIAL_SETTINGS.requestYears,
    offer.kind === 'artifact',
    unfinished,
  );
  if (r) return r;
  if (save.mortal.marketSocial!.fulfilled.includes(id)) return '本批委托已完成';
  if (offer.forgeLevel !== expectedLevel) return '法宝炼器阶数已变化，请重新查看';
  const sale = auctionSellReason(
    save,
    offer,
    visit,
    unfinished,
    MARKET_SOCIAL_SETTINGS.requestYears,
  );
  if (sale) return sale;
  if (!Number.isSafeInteger(save.stones + offer.price)) return '灵石余额已达上限';
  return '';
}
export function fulfillMarketRequest(
  save: SaveData,
  id: MarketCultivatorId,
  visit: number,
  expectedLevel: number,
  unfinished = false,
) {
  if (requestReason(save, id, visit, expectedLevel, unfinished)) return undefined;
  const offer = marketRequest(save, id)!;
  releaseAuctionItem(save, offer);
  advanceMortal(save, MARKET_SOCIAL_SETTINGS.requestYears * 60);
  save.stones += offer.price;
  save.mortal.marketSocial!.fulfilled.push(id);
  rememberMarketTrade(save, id);
  return log(
    save,
    id,
    'request',
    `替${npc(save, id).name}备齐${offer.kind === 'medicine' ? medicineInfo(offer.id)!.name : treasure(offer.id).name} ×${offer.quantity}，${offer.kind === 'artifact' ? `炼器${offer.forgeLevel}阶一并交付，` : ''}实收 ${offer.price} 灵石。交货已耗半年，无额外佣金。`,
  );
}
export function marketOpportunity(save: SaveData, id: MarketCultivatorId) {
  if (
    !isMarketTraderId(id) ||
    !save.mortal.sectMarket ||
    !save.mortal.population ||
    save.mortal.sectMarket.absent?.includes(id as (typeof MARKET_CULTIVATORS)[number]['id'])
  )
    return undefined;
  if (MARKET_CULTIVATORS[roll(save, 'opportunity-owner') % 3].id !== id) return undefined;
  const kind = (['goods', 'deposit', 'haggle', 'invitation'] as const)[
    roll(save, `opportunity-kind:${id}`) % 4
  ];
  const risk = marketOpportunityRisk(save, id);
  const honest =
    save.mortal.sectMarket.opportunityHonest ?? roll(save, `opportunity-truth:${id}`) % 100 >= 40;
  const pool = marketMedicinePool(save.mortal.population!, save.mortal.sectMarket!, id).filter(
    (m) => m.years > 0,
  );
  const m =
    kind === 'haggle'
      ? MEDICINES.filter((m) => m.tier === '凡品')[roll(save, `opportunity-item:${id}`) % 8]
      : pool[roll(save, `opportunity-item:${id}`) % pool.length];
  const invitation =
    kind === 'invitation'
      ? marketInvitationReward(save.mortal.population, save.mortal.sectMarket, id, true)
      : undefined;
  const item: AuctionItem = invitation?.item ?? {
    kind: 'medicine',
    id: m.id,
    quantity: 1,
    forgeLevel: 0,
  };
  const goodsPrice = Math.max(15, Math.floor(auctionValue(item) * 0.9));
  const cost =
    kind === 'invitation'
      ? Math.min(MARKET_SOCIAL_SETTINGS.maxLoss, Math.max(1, Math.floor(save.stones * 0.1)))
      : kind === 'deposit'
        ? 20 + (roll(save, `opportunity-price:${id}`) % 41)
        : kind === 'haggle'
          ? Math.min(80, Math.ceil(m.price * 1.6))
          : goodsPrice;
  return {
    kind,
    honest,
    risk,
    item,
    title:
      invitation?.title ??
      (kind === 'goods'
        ? '低价转让一炉丹'
        : kind === 'deposit'
          ? '先垫路费的求购'
          : '卖家的好价钱'),
    purpose: invitation?.purpose ?? '',
    cost,
    deposit: Math.min(MARKET_SOCIAL_SETTINGS.maxLoss, cost),
    price: Math.floor(auctionValue(item) * 0.9),
    n: npc(save, id),
  };
}
export function opportunityReason(
  save: SaveData,
  id: MarketCultivatorId,
  visit: number,
  action: 'inspect' | 'accept' | 'decline',
  unfinished = false,
) {
  if (!['inspect', 'accept', 'decline'].includes(action)) return '不支持的机缘操作';
  const o = marketOpportunity(save, id);
  if (!o) return '此处暂无坊间机缘';
  const years =
    action === 'decline'
      ? 0
      : action === 'inspect'
        ? MARKET_SOCIAL_SETTINGS.inspectYears
        : o.kind === 'invitation'
          ? MARKET_SOCIAL_SETTINGS.invitationYears
          : MARKET_SOCIAL_SETTINGS.opportunityYears;
  const r = marketSocialReason(
    save,
    id,
    visit,
    years,
    o.kind === 'invitation' || o.item.kind === 'artifact',
    unfinished,
  );
  if (r) return r;
  const s = save.mortal.marketSocial!;
  if (s.used.includes(id)) return '这桩机缘已经结束';
  if (action === 'inspect' && s.inspected.includes(id)) return '已经查看过了';
  if (action === 'accept') {
    if (s.inspected.includes(id) && !o.honest && o.kind !== 'haggle')
      return '疑点已坐实，这桩交易不可信';
    if (
      s.lastOpportunityAt !== null &&
      save.age < s.lastOpportunityAt + MARKET_SOCIAL_SETTINGS.opportunityInterval - 1e-9
    )
      return `坊间机缘收获相隔十年，尚需 ${Math.ceil((s.lastOpportunityAt + MARKET_SOCIAL_SETTINGS.opportunityInterval - save.age - 1e-9) * 10) / 10} 年`;
    if (save.stones < o.cost + auctionDues(save, years)) return '请备足明示费用及期间供奉';
    if (o.kind === 'deposit' && o.honest && (save.medicine.bag[o.item.id] || 0) < 1)
      return '对方求购的丹药库存不足';
    if (
      (o.kind === 'goods' || o.kind === 'haggle' || (o.kind === 'invitation' && o.honest)) &&
      o.item.kind === 'medicine' &&
      !Number.isSafeInteger((save.medicine.bag[o.item.id] || 0) + o.item.quantity)
    )
      return '丹囊数量已达上限';
    if (
      o.item.kind === 'curio' &&
      isCurio(o.item.id) &&
      !Number.isSafeInteger((save.curios.bag[o.item.id] ?? 0) + 1)
    )
      return '奇物数量已达上限';
    if (o.kind === 'deposit' && o.honest && !Number.isSafeInteger(save.stones + o.price))
      return '灵石余额已达上限';
  }
  return '';
}
export function chooseMarketOpportunity(
  save: SaveData,
  id: MarketCultivatorId,
  visit: number,
  action: 'inspect' | 'accept' | 'decline',
  unfinished = false,
) {
  if (opportunityReason(save, id, visit, action, unfinished)) return undefined;
  const o = marketOpportunity(save, id)!;
  const s = save.mortal.marketSocial!;
  if (action === 'decline') {
    s.used.push(id);
    return log(save, id, 'declined', `你婉拒了${o.n.name}的私下邀约，仍留在坊市。`);
  }
  if (action === 'inspect') {
    advanceMortal(save, MARKET_SOCIAL_SETTINGS.inspectYears * 60);
    s.inspected.push(id);
    return log(
      save,
      id,
      'exposed',
      o.kind === 'haggle'
        ? `你查了价，${medicineInfo(o.item.id)!.name}只是凡品，药铺参考价${medicineInfo(o.item.id)!.price}灵石；对方却开价${o.cost}。`
        : o.honest
          ? `你花半年${o.item.kind === 'artifact' ? '核对器纹与寄存凭据' : '验看封签、当面核实凭据'}，这桩${o.kind === 'invitation' ? '坊外邀约' : '交易'}未见破绽；具体交付仍以界面为准。`
          : o.kind === 'goods'
            ? '封签重贴，瓶中无药香，丹丸一捻便散。所谓好丹，不过掺灰泥丸。'
            : o.kind === 'deposit'
              ? '你追问收货凭据，对方只催你先垫路费，既不验货也说不出接应者，分明是骗取垫款。'
              : '你在约定处外围看到陌生脚印与暗藏的兵刃，那是一场伏击，许诺的宝物只是诱饵。',
    );
  }
  const years =
    o.kind === 'invitation'
      ? MARKET_SOCIAL_SETTINGS.invitationYears
      : MARKET_SOCIAL_SETTINGS.opportunityYears;
  const paid = o.kind === 'goods' && !o.honest ? o.deposit : o.cost;
  save.stones -= paid;
  advanceMortal(save, years * 60);
  s.used.push(id);
  s.lastOpportunityAt = save.age;
  if (o.kind === 'invitation' && !o.honest) {
    const root = spiritRootInfo(save.spiritRoot);
    const playerRealm = realmInfo(
      save.cultivation,
      save.completed.includes(FINAL_TRIAL_STAGE),
    ).index;
    const ratio = Math.max(0.5, Math.min(2.7, 1.28 ** (o.n.realmIndex - playerRealm)));
    const stats = {
      hp: Math.round(
        (root.baseHp +
          trainingEffect(save.training.vitality) * 5 * (ownsCurio(save, 'soul-wood') ? 1.15 : 1)) *
          (ownsCurio(save, 'sacred-fragment') ? 1.2 : 1),
      ),
      damage: (7 + root.rate * 8) * (1 + forgeDamageBonus(save.forge[save.starter] || 0)),
      enemyHp: 90 * ratio,
      enemyDamage: 16 * ratio * (ownsCurio(save, 'jade-ruyi') ? 0.9 : 1),
      speed: root.baseSpeed,
    };
    s.ambush = {
      visit,
      npcId: id,
      at: save.age,
      held: o.cost,
      identity: marketIdentity(
        save.mortal.sectMarket!,
        id as (typeof MARKET_CULTIVATORS)[number]['id'],
      ),
      npc: { ...o.n },
      stats,
      loot: marketAmbushLoot(save, id),
      snapshot: initialAmbushSnapshot(stats),
      revivesUsed: 0,
    };
    return log(
      save,
      id,
      'ambush',
      `${o.n.name}将你引到僻处，忽然拔刃相向。${o.cost}灵石已暂扣。击杀可夺回并取得其随身物，欲撤离须走到左侧退路；气血耗尽便是身死。`,
    );
  }
  if (o.kind === 'deposit' && o.honest) {
    save.medicine.bag[o.item.id] -= 1;
    save.stones += o.cost + o.price;
    return log(
      save,
      id,
      'request',
      `凭据与当面交货相符。售出${medicineInfo(o.item.id)!.name}，垫款${o.cost}已退回，另实收${o.price}灵石。`,
    );
  }
  if (o.honest || o.kind === 'haggle') {
    const ownedLevel = save.artifacts.includes(o.item.id) ? save.forge[o.item.id] || 0 : -1;
    receiveMarketItem(save, o.item);
    recordCollectionAchievement(save);
    if (o.kind === 'invitation') save.stones += o.cost;
    return log(
      save,
      id,
      'gift',
      `${o.kind === 'invitation' ? '赴约一年，对方如约交付，暂扣灵石全数返还。' : `花费${o.cost}灵石。`}${auctionItemName(o.item)}${o.item.kind === 'artifact' ? `（炼器${o.item.forgeLevel}阶）已收入藏器阁${ownedLevel >= o.item.forgeLevel ? `；同名法宝不重复收录，保留原有炼器${ownedLevel}阶` : '，本命未改变'}` : o.item.kind === 'curio' ? '已收入行囊，持有即获其助益' : ` ×${o.item.quantity} 已收入丹囊`}${o.kind === 'haggle' ? '；这笔要价比药铺更高，吃了些价差。' : ''}。`,
    );
  }
  return log(
    save,
    id,
    'fraud',
    o.kind === 'goods'
      ? `你拿到掺灰泥丸，无法服用，已弃去。损失先付的${paid}灵石，余款未付；封签与药香的疑点，原来都是破绽。`
      : `${o.n.name}收了${o.cost}灵石便推诿不再收货。所谓路费，是一笔骗取的垫款；你的丹药仍在丹囊。`,
  );
}
function receiveMarketItem(save: SaveData, item: AuctionItem) {
  if (item.kind === 'curio') {
    grantCurio(save, item.id);
    return;
  }
  if (item.kind === 'medicine')
    save.medicine.bag[item.id] = (save.medicine.bag[item.id] || 0) + item.quantity;
  else {
    if (!save.artifacts.includes(item.id)) save.artifacts.push(item.id);
    save.artifactDrops = save.artifactDrops.filter((id) => id !== item.id);
    save.forge[item.id] = Math.max(save.forge[item.id] || 0, item.forgeLevel);
    if (save.mortal.auction)
      save.mortal.auction.releasedArtifacts = save.mortal.auction.releasedArtifacts.filter(
        (id) => id !== item.id,
      );
  }
}
export const MARKET_RISK_CLUES = {
  'secluded-road': '约定处在坊外僻路，离开了坊市的公开照应。',
  bloodstain: '对方袖口有旧血迹，却不肯多谈来路。',
  'claimed-sect': '他自称与附近宗门相熟，称坊外自有人照应；口头名号不是凭据，仍须核验。',
  'pressed-departure': '对方催你独行赴约，迟迟不说接应者是谁。',
  'higher-realm': '对方修为难测，若翻脸，正面应战凶险。',
  'sect-backing': '你佩着在籍宗门信物，对方有所顾忌；离坊后仍不能指望宗门立刻救援。',
  'old-grudge': '这正是曾伏击你的劫修，旧怨未消，私下邀约尤须提防。',
  'known-trader': '你们曾公平交割，但一次好交易并不能替这次邀约作保。',
} as const;
export type MarketRiskClue = keyof typeof MARKET_RISK_CLUES;
export function marketOpportunityRisk(save: SaveData, id: MarketCultivatorId) {
  const n = npc(save, id);
  const realmDelta =
    n.realmIndex - realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).index;
  const contact = marketContact(save, id),
    sectProtection = !!save.mortal.member;
  const clueCodes: MarketRiskClue[] = ['secluded-road', 'bloodstain'];
  if (roll(save, `opportunity-sect-claim:${id}`) % 3 === 0) clueCodes.push('claimed-sect');
  if (roll(save, `opportunity-clue:${id}`) % 2) clueCodes.push('pressed-departure');
  if (realmDelta > 0) clueCodes.push('higher-realm');
  if (sectProtection) clueCodes.push('sect-backing');
  if (contact?.grudge) clueCodes.push('old-grudge');
  if (contact?.goodwill) clueCodes.push('known-trader');
  const level: '谨慎' | '危险' | '凶险' =
    realmDelta >= 2 || contact?.grudge ? '凶险' : realmDelta > 0 ? '危险' : '谨慎';
  return {
    realmDelta,
    sectProtection,
    level,
    clueCodes,
    clues: clueCodes.map((c) => MARKET_RISK_CLUES[c]),
  };
}
export function marketAmbushLoot(save: SaveData, id: MarketCultivatorId): AuctionItem[] {
  const n = npc(save, id);
  const medicines = marketMedicinePool(save.mortal.population!, save.mortal.sectMarket!, id);
  const medicine = medicines[roll(save, `ambush-carried-medicine:${id}`) % medicines.length];
  const loot: AuctionItem[] = [{ kind: 'medicine', id: medicine.id, quantity: 1, forgeLevel: 0 }];
  if (roll(save, `ambush-carried-artifact:${id}`) % 4 === 0) {
    const pool = TREASURES.filter(
      (t) => t.school === (n.path === 'demonic' ? 'demonic' : 'orthodox'),
    );
    const t = pool[roll(save, `ambush-artifact:${id}`) % pool.length];
    const cap = Math.min(4, Math.max(1, Math.floor(n.realmIndex / 2)));
    loot.push({
      kind: 'artifact',
      id: t.id,
      quantity: 1,
      forgeLevel: roll(save, `ambush-forge:${id}`) % (cap + 1),
    });
  }
  return loot;
}
export function settleMarketAmbush(save: SaveData, outcome: 'victory' | 'escaped' | 'defeat') {
  const a = save.mortal.marketSocial?.ambush;
  if (
    !a ||
    a.snapshot.outcome !== outcome ||
    !validMarketAmbush(a, save.age, save.mortal.sectMarket!, save.mortal.marketSocial!)
  )
    return undefined;
  if (outcome === 'defeat') {
    const previous = save.mortal.marketSocial!.logs.find(
      (l) => l.visit === a.visit && l.npcId === a.npcId && l.kind === 'defeat',
    );
    if (previous) return previous;
    rememberMarketAmbush(save, a.npcId, outcome);
    return log(
      save,
      a.npcId,
      'defeat',
      `你倒在${a.npc.name}的刃下，坊外的归路沉入夜色。此世的行迹与旧物，仍可留作一纸记载。`,
    );
  }
  if (outcome === 'victory') {
    if (
      !Number.isSafeInteger(save.stones + a.held) ||
      a.loot.some(
        (l) =>
          l.kind === 'medicine' &&
          !Number.isSafeInteger((save.medicine.bag[l.id] || 0) + l.quantity),
      )
    )
      return undefined;
    save.stones += a.held;
    for (const item of a.loot) receiveMarketItem(save, item);
    recordCollectionAchievement(save);
  }
  rememberMarketAmbush(save, a.npcId, outcome);
  save.mortal.marketSocial!.ambush = null;
  const lootText = a.loot
    .map(
      (l) =>
        `${l.kind === 'medicine' ? medicineInfo(l.id)!.name : treasure(l.id).name}${l.kind === 'artifact' ? `（炼器${l.forgeLevel}阶）` : ''} ×${l.quantity}`,
    )
    .join('、');
  const result = log(
    save,
    a.npcId,
    outcome,
    outcome === 'victory'
      ? `你击杀劫修${a.npc.name}，取回暂扣的${a.held}灵石，并从其随身行囊取得${lootText}，已收入收藏与丹囊。此人不会再出现在坊市。`
      : `你甩开${a.npc.name}的追击，从退路回到坊市。损失暂扣的${a.held}灵石，法宝与丹药仍在行囊；对方记下这段旧怨。`,
  );
  if (outcome === 'victory')
    save.mortal.sectMarket!.absent = [a.npcId as (typeof MARKET_CULTIVATORS)[number]['id']];
  return result;
}
