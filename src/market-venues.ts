import { FINAL_TRIAL_STAGE, treasure } from './data.ts';
import { realmInfo, recordCollectionAchievement, type SaveData } from './progress.ts';
import { advanceMortal } from './mortal.ts';
import { auctionDues, auctionReason } from './auction.ts';
import { auctionItemName, auctionValue } from './auction-items.ts';
import { MEDICINES } from './medicine-data.ts';
import { debateMarket, debateReason } from './market-social.ts';
import {
  marketCultivators,
  marketIdentity,
  marketMedicinePool,
  type MarketTraderId,
} from './sect-market-data.ts';
import { marketContact, rememberMarketAid } from './market-relations.ts';
import { marketInvitationReward } from './market-opportunities.ts';
import { marketSocialRoll } from './market-social-data.ts';
import { recordChronicle } from './chronicle.ts';

export const venueRealm = (save: SaveData) =>
  realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).index;
export function venuePeople(save: SaveData) {
  return save.mortal.population && save.mortal.sectMarket
    ? marketCultivators(save.mortal.population, save.mortal.sectMarket).filter(
        (n) => !marketContact(save, n.id)?.dead,
      )
    : [];
}
export function venueStamp(save: SaveData) {
  return `${save.mortal.sectMarket?.visit}:${venueRealm(save)}:${Math.floor(save.age / 10)}`;
}
export function venueWork(save: SaveData) {
  const rank = venueRealm(save);
  return rank < 2
    ? {
        title: '护送药囊',
        years: 2,
        stones: 40,
        iron: 1,
        text: '药铺请人将一批封好的药囊送到邻近驻地，走坊市巡守照看的官道；报酬交割前已封存。',
      }
    : rank < 4
      ? {
          title: '交割压阵',
          years: 1,
          stones: 40,
          iron: 1,
          text: '一场法器交割请你在场见证。先对数量与封签，再由双方按约交货；不替任何一方强买强卖。',
        }
      : {
          title: '主持调停',
          years: 1,
          stones: 40,
          iron: 1,
          text: '两家铺面愿到执事堂对单，请你主持当面调停。只按凭据结清争议，不替任何一方讨取额外财物。',
        };
}
export function venueSeekOffers(save: SaveData) {
  if (venueRealm(save) < 4) return [];
  return venuePeople(save).map((npc) => {
    const item = {
      ...marketInvitationReward(save.mortal.population!, save.mortal.sectMarket!, npc.id)!.item,
      quantity: 1,
    };
    return { npc, item, price: Math.ceil(auctionValue(item) * 1.15) };
  });
}
export function venueHostTopics(save: SaveData, id: MarketTraderId) {
  const n = venuePeople(save).find((n) => n.id === id);
  if (!n || n.realmIndex >= venueRealm(save) || venueRealm(save) < 4) return [];
  const allowed = marketMedicinePool(save.mortal.population!, save.mortal.sectMarket!, id);
  return [
    { id: 'weapon', name: `${treasure(save.starter).name}的御器取舍` },
    ...MEDICINES.filter(
      (m) => save.medicine.recipes.includes(m.id) && allowed.some((a) => a.id === m.id),
    ).map((m) => ({ id: m.id, name: `${m.name}丹方` })),
  ];
}
export function venueFavor(save: SaveData) {
  const people = venuePeople(save);
  const friend = people.find((n) => {
    const c = marketContact(save, n.id);
    return c && c.goodwill > 0 && !c.grudge && c.birthVisit < save.mortal.sectMarket!.visit;
  });
  const other = people.find((n) => n.id !== friend?.id);
  if (!friend || !other) return undefined;
  const identity = marketIdentity(save.mortal.sectMarket!, friend.id as MarketTraderId);
  const roll = marketSocialRoll(
    save.mortal.population!,
    identity.birthVisit,
    `favor:${identity.slot}:${Math.floor(save.age / 10)}`,
  );
  const medicine = marketMedicinePool(
    save.mortal.population!,
    save.mortal.sectMarket!,
    friend.id,
  ).filter((m) => m.years > 0)[0];
  return {
    friend,
    other,
    medicine,
    mistaken: roll % 3 === 0,
    price: auctionValue({ kind: 'medicine', id: medicine.id, quantity: 1, forgeLevel: 0 }),
  };
}
export function venueCooldown(save: SaveData, kind: 'work' | 'favor') {
  const at = kind === 'work' ? save.mortal.marketVenues?.workAt : save.mortal.marketVenues?.favorAt;
  return at != null && save.age < at + 10 - 1e-9
    ? `再过${Math.ceil((at + 10 - save.age - 1e-9) * 10) / 10}年可再办一桩`
    : '';
}
export function venueActionReason(
  save: SaveData,
  choice: string,
  stamp: string,
  unfinished = false,
) {
  if (venueStamp(save) !== stamp) return '这桩事项已变化，请重新查看';
  const parts = choice.split('@');
  const [kind, id, topic] = parts;
  if (parts.length !== ({ work: 1, seek: 2, host: 3, favor: 2, debate: 2 }[kind] ?? 0))
    return '事项无法识别';
  const people = venuePeople(save);
  if (kind === 'debate')
    return people.some((n) => n.id === id)
      ? debateReason(save, id as MarketTraderId, save.mortal.sectMarket!.visit)
      : '这位修士已经离场';
  const seek = kind === 'seek' ? venueSeekOffers(save).find((o) => o.npc.id === id) : undefined;
  const host = kind === 'host' ? people.find((n) => n.id === id) : undefined;
  const favor = kind === 'favor' ? venueFavor(save) : undefined;
  if (kind === 'seek' && !seek) return '化神后可托人寻物，物品须以当前报价为准';
  if (
    kind === 'host' &&
    (!host || !venueHostTopics(save, host.id as MarketTraderId).some((t) => t.id === topic))
  )
    return '尚无符合条件的主讲题目或后学';
  if (kind === 'favor' && (!favor || !['check', 'pay', 'mediate'].includes(id)))
    return '眼下没有这桩旧识求助';
  if (kind === 'favor' && id === 'mediate' && venueRealm(save) < favor!.other.realmIndex)
    return '对方修为更高，可先请当值见证核验';
  if (!['work', 'seek', 'host', 'favor'].includes(kind) || (kind === 'work' && id))
    return '事项无法识别';
  if (
    seek?.item.kind === 'artifact' &&
    save.artifacts.includes(seek.item.id) &&
    (save.forge[seek.item.id] || 0) >= seek.item.forgeLevel
  )
    return '已收藏且现有炼器阶数不低于此物，无需重复寻访';
  const years = kind === 'work' ? venueWork(save).years : kind === 'favor' ? 0.5 : 1;
  const price = seek?.price ?? (kind === 'host' ? 30 : favor && id === 'pay' ? favor.price : 0);
  const reason = auctionReason(
    save,
    save.mortal.sectMarket?.visit ?? 0,
    seek?.item.kind === 'artifact',
    unfinished,
    years,
  );
  if (reason) return reason;
  if (unfinished && ['work', 'favor'].includes(kind))
    return '请先结束未完成的历练，再处理托付与求助';
  if (kind === 'host') {
    const reason = debateReason(save, host!.id, save.mortal.sectMarket!.visit);
    if (reason) return reason;
  } else {
    const reason = venueCooldown(save, kind === 'favor' ? 'favor' : 'work');
    if (reason) return reason;
  }
  if (save.stones < price + auctionDues(save, years)) return '灵石不足，请先备足价款与到期供奉';
  if (
    seek?.item.kind === 'medicine' &&
    !Number.isSafeInteger((save.medicine.bag[seek.item.id] || 0) + 1)
  )
    return '丹囊数量已达上限';
  if (
    kind === 'work' &&
    (!Number.isSafeInteger(save.stones + 40) || !Number.isSafeInteger(save.iron + 1))
  )
    return '物资数量已达上限';
  return '';
}
// 调用方只对克隆档执行，完整写入后才向游戏应用。看报价和关闭界面均不结算。
export function executeVenue(save: SaveData, choice: string, stamp: string, unfinished = false) {
  if (venueActionReason(save, choice, stamp, unfinished)) return undefined;
  const [kind, id, topic] = choice.split('@');
  if (kind === 'debate')
    return debateMarket(save, id as MarketTraderId, save.mortal.sectMarket!.visit)?.text;
  const state = (save.mortal.marketVenues ??= { workAt: null, favorAt: null, receipts: [] });
  let text: string;
  if (kind === 'work') {
    const work = venueWork(save);
    advanceMortal(save, work.years * 60);
    save.stones += work.stones;
    save.iron += work.iron;
    state.workAt = save.age;
    text = `在执事堂${work.title}，按凭据完成交割，实收${work.stones}灵石、${work.iron}玄铁。`;
  } else if (kind === 'seek') {
    const offer = venueSeekOffers(save).find((o) => o.npc.id === id)!;
    advanceMortal(save, 60);
    save.stones -= offer.price;
    if (offer.item.kind === 'medicine')
      save.medicine.bag[offer.item.id] = (save.medicine.bag[offer.item.id] || 0) + 1;
    else {
      if (!save.artifacts.includes(offer.item.id)) save.artifacts.push(offer.item.id);
      save.forge[offer.item.id] = Math.max(save.forge[offer.item.id] || 0, offer.item.forgeLevel);
      save.artifactDrops = save.artifactDrops.filter((id) => id !== offer.item.id);
      if (save.mortal.auction)
        save.mortal.auction.releasedArtifacts = save.mortal.auction.releasedArtifacts.filter(
          (id) => id !== offer.item.id,
        );
      recordCollectionAchievement(save);
    }
    state.workAt = save.age;
    text = `托执事堂向${offer.npc.name}寻得${auctionItemName(offer.item)}一份，实付${offer.price}灵石（已含寻访酬金）。物品收入收藏，不改本命或已服药效。`;
  } else if (kind === 'host') {
    const npc = venuePeople(save).find((n) => n.id === id)!;
    const subject = venueHostTopics(save, npc.id as MarketTraderId).find((t) => t.id === topic)!;
    advanceMortal(save, 60);
    save.stones -= 30;
    save.mortal.marketSocial!.lastDebateAt = save.age;
    rememberMarketAid(save, npc.id);
    text = `在论道院开席讲法一年，以「${subject.name}」指点${npc.name}，支出30灵石茶水场地费。对方记下这份指点，未凭一席话骤然突破。`;
  } else {
    const favor = venueFavor(save)!;
    const senior = venueRealm(save) >= favor.other.realmIndex;
    advanceMortal(save, 30);
    if (id === 'pay') {
      save.stones -= favor.price;
      text = `为旧识${favor.friend.name}垫付${favor.price}灵石，按明示估值当面取回${favor.medicine.name}交给他；丹药不进入你的丹囊，这笔资助不承诺返还。`;
    } else {
      text = favor.mistaken
        ? `替${favor.friend.name}核对交割凭据，原来是他记错了付讫的批次。你请他向${favor.other.name}说明原委，旧识也不能只凭一面之词。`
        : `${senior && id === 'mediate' ? '你请双方当面依单交割' : '你请当值见证调出封签与交货单'}，查明${favor.friend.name}确已付清，${favor.other.name}按约放行丹药；没有额外索财。`;
    }
    rememberMarketAid(save, favor.friend.id);
    state.favorAt = save.age;
  }
  state.receipts.unshift({ kind: kind as 'work' | 'seek' | 'host' | 'favor', at: save.age, text });
  state.receipts.splice(6);
  save.mortal.events.unshift(`${save.age.toFixed(1)}岁 · ${text}`.slice(0, 160));
  save.mortal.events.splice(6);
  recordChronicle(
    save,
    kind === 'host' ? '开席讲法' : kind === 'favor' ? '为故交出面' : '坊市托付',
    text,
  );
  return text;
}
