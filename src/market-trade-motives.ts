import { TREASURES, type WeaponKind } from './data.ts';
import { MEDICINES, type Medicine } from './medicine-data.ts';
import type { SaveData } from './progress.ts';
import {
  isMarketTraderId,
  MARKET_CULTIVATORS,
  marketCultivatorRealm,
  marketIdentity,
  type MarketCultivatorId,
} from './sect-market-data.ts';
import { marketContact } from './market-relations.ts';
import { marketSocialRoll } from './market-social-data.ts';

export type MarketTradeMotiveKind = 'cultivation' | 'recovery' | 'longevity' | 'journey';
export interface MarketTradeMotive {
  kind: MarketTradeMotiveKind;
  title: string;
  disclosure: string;
  preferredMedicineIds: string[];
  preferredWeaponIds: WeaponKind[];
  friend: boolean;
  friendText: string;
}
const medicineNeeds: Record<MarketTradeMotiveKind, readonly string[]> = {
  cultivation: ['zengyuan', 'xuling'],
  recovery: ['yangjing', 'bigu', 'zhenyuan', 'zhiyuan', 'peiying'],
  longevity: ['huiyang'],
  journey: ['yingxiang', 'huxin', 'qingling', 'jiangyun', 'wuchang', 'xuepo'],
};

export function marketTradeMedicineAllowed(medicine: Medicine, realm: number) {
  return (
    medicine.stage <= (realm === 0 ? 0 : Math.max(1, Math.min(6, realm - 1))) &&
    (medicine.years > 0 || realm >= 6)
  );
}
// 动机来自当事人自己的话，绑定实际身份；没有读取玩家库存或暗中揣测他人寿数。
export function marketTradeMotive(
  save: SaveData,
  id: MarketCultivatorId,
): MarketTradeMotive | undefined {
  const state = save.mortal.sectMarket,
    population = save.mortal.population;
  if (
    !state ||
    !population ||
    !isMarketTraderId(id) ||
    state.absent?.includes(id) ||
    save.journeyEnded ||
    save.pendingReincarnation
  )
    return undefined;
  const contact = marketContact(save, id);
  if (contact?.dead) return undefined;
  const identity = marketIdentity(state, id),
    realm = marketCultivatorRealm(population, state, id),
    kinds: MarketTradeMotiveKind[] = ['recovery', 'journey'];
  if (realm >= 1) kinds.push('cultivation');
  if (realm >= 6) kinds.push('longevity');
  const kind =
      kinds[
        marketSocialRoll(population, identity.birthVisit, `trade-purpose:${identity.slot}`) %
          kinds.length
      ],
    available = MEDICINES.filter(
      (medicine) =>
        medicineNeeds[kind].includes(medicine.id) && marketTradeMedicineAllowed(medicine, realm),
    ),
    preferredMedicineIds = available
      .sort(
        (a, b) =>
          b.stage - a.stage ||
          medicineNeeds[kind].indexOf(a.id) - medicineNeeds[kind].indexOf(b.id),
      )
      .slice(0, 3)
      .map((medicine) => medicine.id),
    role = MARKET_CULTIVATORS.find((npc) => npc.id === identity.slot)!,
    artifacts = TREASURES.filter((t) => role.path === 'dual' || t.school === role.path),
    offset = marketSocialRoll(population, identity.birthVisit, `travel-gear:${identity.slot}`),
    preferredWeaponIds: WeaponKind[] =
      kind === 'journey'
        ? [artifacts[offset % artifacts.length].id, artifacts[(offset + 5) % artifacts.length].id]
        : [],
    wanted = preferredMedicineIds
      .map((medicineId) => MEDICINES.find((m) => m.id === medicineId)!.name)
      .join('、'),
    weapons = preferredWeaponIds
      .map((weaponId) => TREASURES.find((t) => t.id === weaponId)!.name)
      .join('、'),
    friend = !!(
      contact &&
      identity.birthVisit < state.visit &&
      contact.goodwill >= 2 &&
      contact.grudge === 0
    ),
    titles: Record<MarketTradeMotiveKind, string> = {
      cultivation: '破境前历练',
      recovery: '伤后调养',
      longevity: '访药续命',
      journey: '备物远行',
    },
    disclosures: Record<MarketTradeMotiveKind, string> = {
      cultivation: `「修行遇了关隘，我打算入山历练，正寻${wanted}，盼能多积些修为。」`,
      recovery: `「前次出山带了些伤，眼下要紧的是调养。若有${wanted}，我们好商量。」`,
      longevity: `「寿数渐紧，我此行只为寻${wanted}。余下的丹药，愿拿来相换。」`,
      journey: `「过些时日还要远行，想备${wanted}；${weapons}若有合适的，也愿相换。」`,
    };
  return {
    kind,
    title: titles[kind],
    disclosure: disclosures[kind],
    preferredMedicineIds,
    preferredWeaponIds,
    friend,
    friendText: friend
      ? '故交留货：重逢仍为你留着同样的余丹；合用之物可搭配低阶余丹补差，优先按更接近的估值相换。'
      : '',
  };
}
