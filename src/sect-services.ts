import { curioAlchemy, curioTrainingYears, curioTrainingCost, ownsCurio } from './curio-data.ts';
import { treasure } from './data.ts';
import {
  trainingCost,
  trainingYears,
  syncTribulationClock,
  recordTrainingMastery,
  type SaveData,
} from './progress.ts';
import { SECTS, MAX_MASTERY } from './mortal-data.ts';
import { advanceMortal, resolveActivity, studyPlan, masteryRewardPool } from './mortal.ts';
import { MEDICINES, medicineFormula, medicineInfo, grantMedicine } from './medicine-data.ts';
import { medicineCraftStones, medicineRecipePrice } from './medicine.ts';
import { auctionItemName, auctionValue, releaseAuctionItem } from './auction-items.ts';
import type { AuctionItem } from './auction-data.ts';
import { marketTradeMedicineAllowed } from './market-trade-motives.ts';
import { venueRealm, venueStamp } from './market-venues.ts';
import { seekingOptions, seekingQuote, seekArtifact } from './artifact-seeking.ts';
import { serviceDues, serviceReason } from './service-preflight.ts';
import { SECT_SPECIALTIES } from './sect-service-data.ts';
import { recordChronicle } from './chronicle.ts';

export const trainingName = { vitality: '淬体', power: '悟道', speed: '身法' };
type Training = keyof typeof trainingName;
export interface SectChoice {
  id: string;
  label: string;
}
export interface ServiceQuote {
  stones: number;
  years: number;
  iron: number;
  reserve: number;
  reason: string;
  give: AuctionItem[];
  receive?: string;
  receiveCount?: number;
  recipe?: string;
  train?: Training;
  study?: boolean;
  levels?: number;
  studyYears?: number[];
  seek?: string;
  detail: string;
}
const pill = (id: string, quantity = 1): AuctionItem => ({
  kind: 'medicine',
  id,
  quantity,
  forgeLevel: 0,
});
const gear = (save: SaveData, id: string): AuctionItem => ({
  kind: 'artifact',
  id,
  quantity: 1,
  forgeLevel: save.forge[id] || 0,
});
const roundYears = (years: number) => Math.max(0, Math.ceil(years * 10 - 1e-9) / 10);
// 抵价只使用一次，以最少的连续阶数足额抵费；上限容纳不下就保留物品。
function offeringSteps(credit: number, plans: { stones: number; years: number }[]) {
  const steps: typeof plans = [];
  let total = 0;
  for (const plan of plans) {
    steps.push({ ...plan, years: roundYears(plan.years) });
    total += plan.stones;
    if (total >= credit) break;
  }
  return { steps, total, fits: total >= credit };
}
export const sectServiceTier = (save: SaveData) =>
  venueRealm(save) >= 5 ? 2 : venueRealm(save) >= 4 ? 1 : 0;
const exchangeRatio = (id: string, tier: number) =>
  id === 'area' ? [1.12, 1.1, 1.08][tier] : id === 'abyss' ? [1.08, 1.06, 1.05][tier] : 1.03;
const ownedPills = (save: SaveData) =>
  MEDICINES.filter((m) => m.years > 0 && save.medicine.bag[m.id] > 0);
const tradeTargets = (save: SaveData) =>
  MEDICINES.filter(
    (m) =>
      m.years > 0 && m.stage <= save.unlocked && marketTradeMedicineAllowed(m, venueRealm(save)),
  );
export function sectServiceChoices(save: SaveData): SectChoice[] {
  const id = save.mortal.member?.id;
  if (!id) return [];
  if (id === 'power' || id === 'frenzy')
    return seekingOptions(save, true).map((t) => ({ id: t.id, label: t.name }));
  if (['haste', 'spirit'].includes(id)) return [{ id: 'study', label: '本门功法精研一阶' }];
  if (['guard', 'blood', 'forbidden'].includes(id)) {
    const kind = id === 'forbidden' ? 'power' : 'vitality';
    return [{ id: kind, label: `${trainingName[kind]}一阶` }];
  }
  if (['magnet', 'soul'].includes(id))
    return (id === 'soul' ? (['speed'] as const) : (['vitality', 'power', 'speed'] as const)).map(
      (kind) => ({ id: kind, label: `${trainingName[kind]}一阶` }),
    );
  if (id === 'duration' || id === 'crit')
    return MEDICINES.filter(
      (m) =>
        m.years > 0 &&
        m.tier !== '凡品' &&
        m.stage <= save.unlocked &&
        (id === 'duration'
          ? save.medicine.recipes.includes(m.id)
          : !save.medicine.recipes.includes(m.id) && save.medicine.bag[m.id] > 0),
    ).map((m) => ({
      id: m.id,
      label: id === 'duration' ? `代炼${m.name}一份` : `参悟${m.name}丹方（样丹保留）`,
    }));
  if (id === 'bone')
    return save.artifacts
      .filter((t) => t !== save.starter && auctionValue(gear(save, t)) > 0)
      .map((t) => ({
        id: t,
        label: `${treasure(t).name} · 炼器${save.forge[t] || 0}阶，献出后消失`,
      }));
  if (id === 'devour')
    return ownedPills(save).map((m) => ({ id: m.id, label: `献出${m.name}一份，按抵价连修淬体` }));
  if (['area', 'abyss', 'curse'].includes(id)) {
    const narrow =
      id === 'abyss'
        ? ['fenyuan', 'lianqi', 'dingling', 'huxin', 'zhiyuan', 'xuepo']
        : ['huanglong', 'chousui', 'heqi', 'jiangchen', 'mingqing', 'dulong', 'dingling'];
    return ownedPills(save).flatMap((from) =>
      tradeTargets(save)
        .filter(
          (to) =>
            to.id !== from.id &&
            (id === 'area' || narrow.includes(to.id)) &&
            (id !== 'curse' || from.tier === to.tier),
        )
        .filter((to) => {
          const input = auctionValue(pill(from.id)),
            output = auctionValue(pill(to.id));
          return (
            Math.ceil((output * exchangeRatio(id, sectServiceTier(save))) / input) * input * 100 <=
            output * 135
          );
        })
        .map((to) => ({ id: `${from.id}@${to.id}`, label: `${from.name} → ${to.name}一份` })),
    );
  }
  return [];
}
export function sectServiceQuote(save: SaveData, choice: string, unfinished = false): ServiceQuote {
  const id = save.mortal.member?.id ?? '',
    tier = sectServiceTier(save);
  const q: ServiceQuote = {
    stones: 0,
    years: 0,
    iron: 0,
    reserve: 0,
    give: [],
    detail: '',
    reason: '',
  };
  if (!sectServiceChoices(save).some((o) => o.id === choice)) {
    q.reason = '暂无符合条件的事项，请先选择';
    return q;
  }
  const study = studyPlan(save, false);
  const time = trainingYears(save, false);
  if (id === 'power' || id === 'frenzy') {
    const seek = seekingQuote(save, choice, true, unfinished);
    Object.assign(q, { stones: seek.price, years: seek.years, reason: seek.reason, seek: choice });
    q.detail = `此行寻得机会${seek.chance}%，可能落空，费用不退、不保底；行情十年一换。寻得后零阶入藏，本命不变。与执事堂托付、寻物共用办毕后十年间隔。`;
  } else if (['haste', 'spirit', 'bone'].includes(id)) {
    q.study = true;
    q.stones = Math.ceil(
      study.stones * (id === 'haste' ? 1.5 : id === 'spirit' ? [0.8, 0.75, 0.7][tier] : 1),
    );
    q.years = curioTrainingYears(
      save,
      study.years * (id === 'haste' ? [0.6, 0.5, 0.4][tier] : id === 'spirit' ? 2 : 1.2),
    );
    if (!study.eligible)
      q.reason =
        study.reason ||
        (study.level >= MAX_MASTERY ? '本门精研已满' : `精研需${study.requiredRealm}`);
    if (id === 'bone') {
      q.give = [gear(save, choice)];
      const credit = Math.floor(auctionValue(q.give[0]) * [0.8, 0.85, 0.9][tier]);
      const plans = Array.from({ length: Math.max(0, study.limit - study.level) }, (_, i) => {
        const plan = studyPlan(
          {
            ...save,
            mortal: { ...save.mortal, mastery: { ...save.mortal.mastery, bone: study.level + i } },
          },
          false,
        );
        return {
          stones: curioTrainingCost(save, plan.stones),
          years: curioTrainingYears(save, plan.years * 1.2),
        };
      });
      const batch = offeringSteps(credit, plans);
      q.levels = batch.fits ? batch.steps.length : 0;
      q.studyYears = batch.steps.map((p) => p.years);
      q.years = q.studyYears.reduce((a, b) => a + b, 0);
      q.stones = Math.max(0, batch.total - credit);
      q.reason ||= batch.fits ? '' : '本境可精研费用不足以用完抵价，请换低价法宝或突破后再来';
      q.detail = `献出${auctionItemName(q.give[0])}及其炼器阶数，估值${auctionValue(q.give[0])}灵石、折抵${credit}灵石。${batch.fits ? `连续精研${q.levels}阶至${study.level + q.levels}阶，总费${batch.total}灵石，补${q.stones}灵石；抵价全数使用。五阶、十阶赐丹照常领取。` : '当前境界容纳不下全部抵价，本次不交出法宝、不扣费用。'}`;
    } else q.detail = '完成后本门功法精研提升一阶；五阶赠灵品丹药一颗，十阶赠限时珍品丹药一颗。';
  } else if (id === 'duration') {
    const m = medicineInfo(choice)!;
    q.stones = Math.ceil(medicineCraftStones(choice) * 1.5);
    const brew = curioAlchemy(save, m.craftYears * [0.6, 0.5, 0.4][tier]);
    q.years = brew.years;
    q.receiveCount = brew.quantity;
    q.give = medicineFormula(save.medicine, choice).map((i) => pill(i.id, i.count));
    q.receive = choice;
    q.detail = `依本世已知丹方备齐一份原料；本次成丹${q.receiveCount}枚。额外灵石只换取更短年岁。`;
  } else if (id === 'crit') {
    const m = medicineInfo(choice)!;
    q.stones = Math.ceil(medicineRecipePrice(choice) * 0.5);
    q.years = (m.tier === '灵品' ? 3 : 15) * [1, 5 / 6, 2 / 3][tier];
    q.recipe = choice;
    q.detail = '样丹保留，习得这颗丹药的本世丹方；仍需备齐原料、灵石和年岁才能炼丹。';
  } else if (['area', 'abyss', 'curse'].includes(id)) {
    const [from, to] = choice.split('@');
    const ratio = exchangeRatio(id, tier);
    const count = Math.ceil((auctionValue(pill(to)) * ratio) / auctionValue(pill(from)));
    q.give = [pill(from, count)];
    q.receive = to;
    q.years = id === 'abyss' ? 1 : 0.5;
    q.detail = `按拍卖统一估值折换，所得一份；交出价值至少为所得的${Math.round(ratio * 100)}%，不找零，珍品永久丹不参与。估值差超过35%的组合不列入报价。`;
  } else {
    q.train = (
      id === 'devour' || id === 'blood' || id === 'guard'
        ? 'vitality'
        : id === 'forbidden'
          ? 'power'
          : choice
    ) as Training;
    const cost = trainingCost(save.training[q.train]);
    q.stones = cost;
    q.years =
      time *
      (id === 'guard' || id === 'soul' ? 2 : id === 'blood' ? 3 : id === 'forbidden' ? 4 : 1.5);
    q.years = curioTrainingYears(save, q.years);
    if (id === 'guard') q.stones = Math.ceil(cost * [0.8, 0.75, 0.7][tier]);
    if (id === 'blood' || id === 'forbidden') q.stones = Math.ceil(cost * [0.65, 0.6, 0.55][tier]);
    if (id === 'magnet' || id === 'soul') {
      const worth = [14, 15, 16][tier];
      q.iron = Math.floor((cost * (id === 'soul' ? 0.7 : 0.5)) / worth);
      q.stones = cost - q.iron * worth;
      q.detail = `每枚玄铁折${worth}灵石，至多抵${id === 'soul' ? 70 : 50}%本次费用；不足一枚的部分用灵石。`;
    }
    if (id === 'devour') {
      q.give = [pill(choice)];
      const credit = Math.floor(auctionValue(q.give[0]) * [0.75, 0.8, 0.85][tier]);
      const level = save.training[q.train];
      const batch = offeringSteps(
        credit,
        Array.from({ length: 20 - level }, (_, i) => ({
          stones: trainingCost(level + i, save),
          years: curioTrainingYears(save, time * 1.5),
        })),
      );
      q.levels = batch.fits ? batch.steps.length : 0;
      q.stones = Math.max(0, batch.total - credit);
      q.years = batch.steps.reduce((a, p) => a + p.years, 0);
      q.reason ||= batch.fits ? '' : '余下淬体费用不足以用完抵价，请换低价余丹';
      q.detail = `献出一份${auctionItemName(q.give[0])}，估值${auctionValue(q.give[0])}灵石、折抵${credit}灵石。${batch.fits ? `连续淬体${q.levels}阶至${level + q.levels}阶，总费${batch.total}灵石，补${q.stones}灵石；抵价全数使用。` : '余下阶数容纳不下全部抵价，本次不交丹、不扣费用。'}药效不自动服用。`;
    }
    if (save.training[q.train] >= 20) q.reason = `${trainingName[q.train]}已修至二十阶`;
    q.detail += `根基至多二十阶${id === 'devour' ? '' : '，只提升一阶'}。`;
  }
  // 献物按已打折的逐阶费用足额抵价；其他专长在自身报价后只折减一次灵石，玄铁不变。
  if (q.study || q.train) {
    if (id !== 'bone' && id !== 'devour') q.stones = curioTrainingCost(save, q.stones);
    if (ownsCurio(save, 'heaven-house')) q.detail += '天机屋：不耗年岁，所需灵石减少30%。';
  }
  // 年岁以十分之一年报价和结算，向上取整避免比明示时间更长。
  q.years = roundYears(q.years);
  q.reserve = serviceDues(save, q.years);
  if (q.study) {
    const rewards = [5, 10].filter((n) => study.level < n && study.level + (q.levels ?? 1) >= n);
    if (
      rewards.some((n) =>
        masteryRewardPool(n).some((m) => !Number.isSafeInteger((save.medicine.bag[m.id] || 0) + 1)),
      )
    )
      q.reason ||= '丹囊数量已达上限，请先腾出赐丹空间';
  }
  const last = save.mortal.sectServices?.lastAt;
  q.reason ||=
    venueRealm(save) < 1
      ? '筑基后开放本门专长'
      : serviceReason(save, q.years, unfinished) ||
        (last != null && save.age < last + 10 - 1e-9
          ? `十年共办一桩，再过${Math.ceil((last + 10 - save.age - 1e-9) * 10) / 10}年`
          : '') ||
        (q.give.some((i) => i.kind === 'medicine' && (save.medicine.bag[i.id] || 0) < i.quantity)
          ? '所需丹药数量不足'
          : '') ||
        (q.receive &&
        !Number.isSafeInteger((save.medicine.bag[q.receive] || 0) + (q.receiveCount ?? 1))
          ? '丹囊数量已达上限'
          : '');
  return q;
}
export function sectServiceStamp(save: SaveData) {
  return `${save.mortal.member?.id}:${venueStamp(save)}:${save.mortal.sectServices?.lastAt ?? ''}`;
}
// 调用方 clone→execute→writeSave→apply，存储失败不消耗资源与额度。
export function executeSectService(
  save: SaveData,
  choice: string,
  stamp: string,
  unfinished = false,
) {
  const q = sectServiceQuote(save, choice, unfinished);
  if (
    stamp !== sectServiceStamp(save) ||
    q.reason ||
    save.iron < q.iron ||
    save.stones < q.stones + q.reserve
  )
    return undefined;
  const id = save.mortal.member!.id,
    age = save.age;
  syncTribulationClock(save);
  let seekingResult: string | undefined;
  if (q.seek) {
    seekingResult = seekArtifact(save, q.seek, venueStamp(save), true, unfinished);
    if (!seekingResult) return undefined;
  } else {
    save.stones -= q.stones;
    save.iron -= q.iron;
    q.give.forEach((i) => releaseAuctionItem(save, i));
    if (q.study) {
      for (const years of q.studyYears ?? [q.years]) {
        save.mortal.activity = { kind: 'study', remaining: years, total: years, sect: id };
        resolveActivity(save);
        if (save.mortal.activity) return undefined;
      }
    } else advanceMortal(save, q.years * 60);
    if (Math.abs(save.age - age - q.years) > 1e-7 || (q.study && save.mortal.activity))
      return undefined;
    if (q.train) {
      save.training[q.train] += q.levels ?? 1;
      recordTrainingMastery(save);
    }
    if (q.receive)
      for (let n = 0; n < (q.receiveCount ?? 1); n++) grantMedicine(save.medicine, q.receive);
    if (q.recipe) save.medicine.recipes.push(q.recipe);
  }
  const label = sectServiceChoicesLabel(save, q, choice);
  const text = `${SECTS.find((s) => s.id === id)!.name}·${SECT_SPECIALTIES[id].title}：${seekingResult ?? `${label}，花费${q.stones}灵石${q.iron ? `、${q.iron}玄铁` : ''}、${q.years}年${q.reserve ? `，另缴供奉${q.reserve}灵石` : ''}。`}`;
  const state = (save.mortal.sectServices ??= { lastAt: null, receipts: [] });
  state.lastAt = save.age;
  state.receipts.unshift({ sect: id, at: save.age, text });
  state.receipts.length = Math.min(6, state.receipts.length);
  recordChronicle(save, '宗门专长', text);
  return text;
}
function sectServiceChoicesLabel(save: SaveData, q: ServiceQuote, choice: string) {
  return q.seek
    ? `寻访${treasure(q.seek).name}`
    : q.train
      ? `${trainingName[q.train]}提升${q.levels ?? 1}阶至${save.training[q.train]}阶`
      : q.study
        ? `本门精研提升${q.levels ?? 1}阶至${save.mortal.mastery[save.mortal.member!.id]}阶${q.give.length ? `，献出${auctionItemName(q.give[0])}` : ''}`
        : q.recipe
          ? `习得${medicineInfo(q.recipe)!.name}丹方`
          : `获得${medicineInfo(q.receive ?? choice)!.name}${q.receiveCount ?? 1}份`;
}
