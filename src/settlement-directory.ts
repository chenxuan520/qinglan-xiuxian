import type { SaveData } from './progress.ts';
import { TOWN_JOBS } from './mortal-data.ts';
import { TOWN_NPCS } from './town.ts';
import { MEDICINES } from './medicine-data.ts';
import { MARKET_BUILDINGS, MARKET_VENUES } from './sect-market-data.ts';
import { sectMarketOpen } from './sect-market.ts';
import { marketShopQuote, MARKET_SHOP_YEARS, SALVAGE_RATE } from './market-shop.ts';
import { venueWork, venueActionReason, venueStamp, venueCooldown } from './market-venues.ts';
import { AUCTION_SETTINGS } from './setting.ts';

interface Place {
  name: string;
  use: string;
  cost: string;
  status?: string;
}

export function settlementPlaces(save: SaveData, market = false, unfinished = false): Place[] {
  if (!market)
    return [
      ...(save.mortal.hometown
        ? [{ name: '青岚故居', use: '回家叙话，看看旧居', cost: '交谈不另耗年岁' }]
        : []),
      ...TOWN_NPCS.filter((npc) => !npc.id.startsWith('villager-')).map((npc) => {
        const job = TOWN_JOBS[npc.id as keyof typeof TOWN_JOBS];
        const use: Record<string, string> = {
          herbs: '购买凡品丹药，也可采药赚取灵石',
          tea: '听仙途旧闻，翻阅案头旧书',
          escort: '护送商队，赚取灵石与玄铁',
          market: '按当期行情买卖玄铁',
          smith: '与匠人叙话',
          scholar: '向游学人讲讲山外',
          fisher: '船头歇脚，与渔夫闲谈',
          farmer: '听听田间近况',
          tailor: '檐下闲谈，说些家常',
        };
        return {
          name: npc.place,
          use: use[npc.id],
          cost: job
            ? `${npc.id === 'herbs' ? '采药' : npc.id === 'tea' ? '听书' : '护送'}${job.years}年／次 · ${job.stones ? `报酬${job.stones}灵石${job.iron ? `、${job.iron}玄铁` : ''}${npc.id === 'herbs' ? '；买丹另看明价，不另耗年岁' : ''}` : '不收灵石，赠礼随缘；翻阅旧书不耗年岁'}`
            : npc.id === 'market'
              ? '买卖不另耗年岁，价格与额度见货商报价'
              : '闲谈不另耗年岁',
        };
      }),
    ];
  const entry = !sectMarketOpen(save)
    ? '踏入炼气后开放'
    : !save.mortal.sectMarket || !save.mortal.auction
      ? '入坊后查看当期事务'
      : '';
  const shopStatus = (id: 'medicine' | 'stalls' | 'caravan') => {
    if (entry) return entry;
    const choices =
      id === 'medicine'
        ? MEDICINES.filter((m) => m.years && save.medicine.bag[m.id] >= 2).flatMap((from) =>
            MEDICINES.filter((to) => to.years && to.tier === from.tier && to.id !== from.id).map(
              (to) => `${from.id}@${to.id}`,
            ),
          )
        : id === 'stalls'
          ? save.artifacts.filter((id) => id !== save.starter && save.forge[id] > 0)
          : ['0', '1', '2'];
    if (!choices.length)
      return id === 'medicine' ? '尚无两份同名时效丹可供调剂' : '尚无已炼器的非本命法宝可拆';
    const quotes = choices.map((choice) => marketShopQuote(save, id, choice, unfinished));
    return quotes.some((q) => !q.reason) ? '眼下有可办理的选择，入铺后择物' : quotes[0].reason;
  };
  const work = venueWork(save);
  const descriptions: Record<(typeof MARKET_VENUES)[number]['id'], Omit<Place, 'name'>> = {
    medicine: {
      use: '余丹调剂：两份同名时效丹换一份同品丹',
      cost: `${MARKET_SHOP_YEARS}年 · 不收灵石 · 办毕后隔十年再换`,
      status: shopStatus('medicine'),
    },
    artifacts: {
      use: '指名寻访法宝、奇物，查看公开求购',
      cost: '法宝寻访一年，奇物寻访十年；按件报价，落空不退费',
      status: entry || venueCooldown(save, 'work') || '先看所寻物品的门槛、机会与报价',
    },
    forum: {
      use: '交流本命心得、抄录或互授丹方；化神后可讲法',
      cost: '一年 · 普通交流免费，抄方和讲法另计 · 每十年择一办理',
      status: entry || '丹方与讲题取决于本批修士及双方所学',
    },
    office: {
      use: `${work.title}；化神后还可托人寻物`,
      cost: `托付${work.years}年 · 报酬${work.stones}灵石、${work.iron}玄铁 · 与法宝寻访共用十年间隔`,
      status:
        entry || venueActionReason(save, 'work', venueStamp(save), unfinished) || '眼下可承接托付',
    },
    guests: {
      use: '查访本批来客，处理真正重逢旧识的求助',
      cost: '查访免费；求助耗时半年，代付费用另列',
      status: entry || '是否有托付，以当前重逢旧识为准',
    },
    stalls: {
      use: `拆解非本命法宝，返还累计炼器玄铁的${SALVAGE_RATE * 100}%`,
      cost: `${MARKET_SHOP_YEARS}年／件 · 不返灵石，法宝与炼器阶数一并失去`,
      status: shopStatus('stalls'),
    },
    caravan: {
      use: '购买成丹货单，入囊后自行服用',
      cost: `${MARKET_SHOP_YEARS}年 · 按货单明价 · 办毕后隔十年再买`,
      status: shopStatus('caravan'),
    },
  };
  return [
    ...MARKET_VENUES.map((venue) => ({
      name: MARKET_BUILDINGS[venue.building].label,
      ...descriptions[venue.id],
    })),
    {
      name: MARKET_BUILDINGS[1].label,
      use: '竞买丹药、法宝等拍品，也可寄拍闲置物',
      cost: `单场${AUCTION_SETTINGS.years}年，价款、佣金和会场资格在参拍前明示`,
      status: entry || '先看当前会场与拍品，再决定是否参拍',
    },
  ];
}

export function settlementDirectory(save: SaveData, market = false, unfinished = false) {
  return `<p class="panel-note">先看此行所需，再入街巷。查看不耗年岁；实际办理仍需留足寿元与到期供奉。</p><div class="human-memories">${settlementPlaces(
    save,
    market,
    unfinished,
  )
    .map(
      (place) =>
        `<article><h3>${place.name}</h3><p>${place.use}</p><small>${place.cost}</small>${place.status ? `<p class="panel-note">${place.status}</p>` : ''}</article>`,
    )
    .join('')}</div>`;
}
