import { curioTrainingYears, curioTrainingCost } from './curio-data.ts';
import { ironMarket, ironTradeQuote } from './iron-market.ts';
import { grantMedicine, MEDICINES, townMedicineReward } from './medicine-data.ts';
import { FINAL_TRIAL_STAGE, spiritRootInfo, passive, type CultivationPath } from './data.ts';
import {
  alignStarterWithPath,
  lifespanInfo,
  realmInfo,
  tribulationDue,
  type SaveData,
} from './progress.ts';
import { recordChronicle } from './chronicle.ts';
import {
  SECTS,
  SECT_DUES,
  SECT_ROLES,
  MAX_MASTERY,
  MASTERY_REALMS,
  MASTERY_PER_LEVEL,
  TOWN_JOBS,
  type TownJob,
} from './mortal-data.ts';

export function sectRole(save: SaveData) {
  return save.mortal.member
    ? SECT_ROLES[realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).index]
    : '散修';
}
export function sectDues(save: SaveData) {
  const fee =
    SECT_DUES[realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).index];
  const limit = lifespanInfo(save).limit;
  return { stones: fee.stones, years: Number.isFinite(limit) ? limit / 5 : fee.years };
}
export function entryCost(save: SaveData) {
  return { heaven: 80, variant: 110, dual: 150, triple: 180, quad: 240, five: 300, none: 400 }[
    save.spiritRoot
  ];
}
export function sectDuesPending(save: SaveData) {
  const member = save.mortal.member;
  return !!member?.dues && sectDues(save).stones > 0 && member.dueAt <= save.mortal.years + 1e-9;
}
export function settleSectDues(save: SaveData, decline = false, random = Math.random) {
  if (!sectDuesPending(save)) return false;
  if (decline) return leaveSect(save, true);
  const member = save.mortal.member!;
  member.dues = Math.min(member.dues, sectDues(save).stones);
  if (save.stones < member.dues) return false;
  save.stones -= member.dues;
  log(save, `已补缴供奉 ${member.dues} 灵石。`);
  const next = sectDues(save);
  member.dueAt += next.years;
  member.dues = next.stones;
  completeActivity(save, random);
  resolveActivity(save, random);
  return true;
}
function masteryLimit(save: SaveData) {
  const step = realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).step;
  return MASTERY_REALMS.filter((r) => r.step <= step).length;
}
export function masteryBonus(save: SaveData, id: string) {
  const level = save.mortal.mastery[id] || 0;
  if (save.mortal.member?.id !== id || !level) return 0;
  return Math.min(level, masteryLimit(save)) * MASTERY_PER_LEVEL;
}
export function studyPlan(save: SaveData, withCurio = true) {
  const id = save.mortal.member?.id;
  const level = id ? save.mortal.mastery[id] || 0 : 0;
  const limit = masteryLimit(save);
  const years = Math.round(((1 + level * 0.4) / spiritRootInfo(save.spiritRoot).rate) * 10) / 10;
  const rewardBlocked = masteryRewardPool(level + 1).some(
    (m) => !Number.isSafeInteger((save.medicine.bag[m.id] ?? 0) + 1),
  );
  return {
    level,
    limit,
    reason: rewardBlocked ? '丹囊数量已达上限，请先腾出赐丹空间' : '',
    eligible: level < limit && !rewardBlocked,
    requiredRealm: MASTERY_REALMS[level]?.name ?? '',
    stones: curioTrainingCost(withCurio ? save : undefined, 30 + level * 20),
    years: withCurio ? curioTrainingYears(save, years) : years,
  };
}
function log(save: SaveData, text: string) {
  recordChronicle(save, '人间行迹', text);
  save.mortal.events.unshift(`人间 ${save.mortal.years.toFixed(1)} 年 · ${text}`);
  save.mortal.events.length = Math.min(6, save.mortal.events.length);
}
function canAct(save: SaveData) {
  return (
    !save.journeyEnded &&
    !save.pendingReincarnation &&
    !save.mortal.marketSocial?.ambush &&
    lifespanInfo(save).remaining > 0 &&
    !tribulationDue(save) &&
    !sectDuesPending(save)
  );
}
export function sectEntryMedicinePool(save: SaveData) {
  return MEDICINES.filter((medicine) => {
    const count = save.medicine.bag[medicine.id] ?? 0;
    return (
      medicine.tier === '凡品' &&
      Number.isSafeInteger(count) &&
      count >= 0 &&
      Number.isSafeInteger(count + 1)
    );
  });
}
export function joinSect(
  save: SaveData,
  id: string,
  unfinishedPath?: CultivationPath,
  random = Math.random,
) {
  const sect = SECTS.find((s) => s.id === id);
  if (
    !canAct(save) ||
    save.mortal.member ||
    !sect ||
    (unfinishedPath !== undefined && unfinishedPath !== sect.school) ||
    save.stones < entryCost(save)
  )
    return false;
  // 赠药与入宗一并结算，数量已满的凡品不进入抽取池。
  const gifts = sectEntryMedicinePool(save);
  if (!gifts.length) return false;
  const gift = gifts[Math.floor(random() * gifts.length)];
  if (!gift) return false;
  save.stones -= entryCost(save);
  save.path = sect.school;
  alignStarterWithPath(save);
  const dues = sectDues(save);
  save.mortal.member = {
    id,
    dueAt: dues.stones ? save.mortal.years + dues.years : 0,
    dues: dues.stones,
  };
  const medicine = grantMedicine(save.medicine, gift.id);
  log(
    save,
    `拜入${sect.name}，获赠${medicine}一枚，已收入丹囊${masteryBonus(save, id) > 0 ? '；本门精研加成已生效' : ''}。`,
  );
  if (!Object.hasOwn(save.chronicle.milestones, 'sect')) save.chronicle.milestones.sect = save.age;
  return true;
}
export function leaveSect(save: SaveData, expelled = false) {
  if (!save.mortal.member) return false;
  const name = SECTS.find((s) => s.id === save.mortal.member!.id)!.name;
  if (save.mortal.activity?.kind === 'study') save.mortal.activity = null;
  save.mortal.member = null;
  log(
    save,
    expelled
      ? `供奉不足，已被${name}清退；精研等级保留，加成立即失效。`
      : `已离开${name}；精研等级保留，加成暂停。`,
  );
  return true;
}
export function startActivity(save: SaveData, kind: string, random = Math.random) {
  if (!canAct(save) || save.mortal.activity) return false;
  if (kind === 'study') {
    const plan = studyPlan(save);
    if (!save.mortal.member || !plan.eligible || save.stones < plan.stones) return false;
    save.stones -= plan.stones;
    save.mortal.activity = {
      kind,
      remaining: plan.years,
      total: plan.years,
      sect: save.mortal.member.id,
    };
  } else {
    if (!Object.hasOwn(TOWN_JOBS, kind)) return false;
    const job = kind as TownJob;
    save.mortal.activity = {
      kind: job,
      remaining: TOWN_JOBS[job].years,
      total: TOWN_JOBS[job].years,
      sect: null,
    };
  }
  resolveActivity(save, random);
  return true;
}
export function resolveActivity(save: SaveData, random = Math.random) {
  const activity = save.mortal.activity;
  if (!activity || !canAct(save) || (activity.kind === 'study' && !studyPlan(save).eligible))
    return false;
  if (activity.remaining <= 1e-9) return completeActivity(save, random);
  const age = save.age;
  advanceMortal(save, activity.remaining * 60, random);
  return save.age > age;
}
export function tradeIron(
  save: SaveData,
  buy: boolean,
  quantity = 1,
  period = ironMarket(save).period,
) {
  const quote = ironTradeQuote(save, buy, quantity);
  if (
    !canAct(save) ||
    save.journeyEnded ||
    save.pendingReincarnation ||
    quote.period !== period ||
    quote.reason
  )
    return false;
  save.stones += buy ? -quote.total : quote.total;
  save.iron += buy ? quantity : -quantity;
  if (buy) save.mortal.ironMarket = { period: quote.period, bought: quote.bought + quantity };
  return true;
}
// 城镇前台计时与主动消耗年岁共用边界结算；不使用墙钟，不补算离线时间。
export function advanceMortal(save: SaveData, seconds: number, random = Math.random) {
  if (!Number.isFinite(seconds) || seconds <= 0 || !canAct(save)) return false;
  const world = save.mortal;
  const studyPaused = world.activity?.kind === 'study' && !studyPlan(save).eligible;
  if (world.member && sectDues(save).stones === 0) {
    world.member.dues = 0;
    world.member.dueAt = 0;
  }
  let remaining = Math.min(
    seconds / 60,
    lifespanInfo(save).remaining,
    save.nextTribulationAge > 0 && !save.completed.includes(FINAL_TRIAL_STAGE)
      ? Math.max(0, save.nextTribulationAge - save.age)
      : Infinity,
  );
  let changed = false;
  while (remaining > 1e-10) {
    const step = Math.min(
      remaining,
      world.member?.dues ? Math.max(0, world.member.dueAt - world.years) : Infinity,
      studyPaused ? Infinity : (world.activity?.remaining ?? Infinity),
    );
    world.years += step;
    save.age += step;
    remaining -= step;
    if (world.activity && !studyPaused)
      world.activity.remaining = Math.max(0, world.activity.remaining - step);
    // 同时到期先扣供奉，不能用尚未完成的委托收入透支门费。
    if (world.member?.dues && world.years >= world.member.dueAt - 1e-9) {
      const member = world.member;
      member.dues = Math.min(member.dues, sectDues(save).stones);
      if (save.stones < member.dues) {
        // 停在账期边界，先给广告补缴机会；放弃时才清退，余下时间不推进。
        changed = true;
        break;
      } else {
        save.stones -= member.dues;
        log(save, `已缴供奉 ${member.dues} 灵石。`);
        const next = sectDues(save);
        member.dueAt += next.years;
        member.dues = next.stones;
      }
      changed = true;
    }
    if (completeActivity(save, random)) changed = true;
  }
  return changed;
}

export function masteryRewardPool(level: number) {
  const tier = level === 5 ? '灵品' : level === MAX_MASTERY ? '珍品' : null;
  return MEDICINES.filter((m) => m.tier === tier && m.years > 0);
}

function completeActivity(save: SaveData, random: () => number) {
  const world = save.mortal;
  const activity = world.activity;
  if (
    activity &&
    (activity.kind !== 'study' || studyPlan(save).eligible) &&
    activity.remaining <= 1e-9
  ) {
    world.activity = null;
    if (activity.kind === 'study') {
      const id = activity.sect!;
      world.mastery[id] = Math.min(MAX_MASTERY, (world.mastery[id] || 0) + 1);
      let reward = '';
      if (world.mastery[id] === 5 || world.mastery[id] === 10) {
        const pool = masteryRewardPool(world.mastery[id]);
        const tier = pool[0].tier;
        const name = grantMedicine(save.medicine, pool[Math.floor(random() * pool.length)].id);
        reward = `宗门赐下${tier}「${name}」一颗，已收入丹囊。`;
      }
      log(
        save,
        `${passive(id).name}精研至 ${world.mastery[id]} 阶，本门正向效果 +${Math.round(world.mastery[id] * MASTERY_PER_LEVEL * 100)}%。${reward}`,
      );
      if (world.mastery[id] === MAX_MASTERY)
        recordChronicle(save, '一脉真传', `${passive(id).name}已精研至十阶。`, 'mastery');
    } else {
      const job = TOWN_JOBS[activity.kind];
      const stones = activity.kind === 'tea' ? (random() < 0.3 ? 8 : 0) : job.stones;
      save.stones += stones;
      save.iron += job.iron;
      const medicine = townMedicineReward(save.medicine, activity.kind, random);
      log(
        save,
        `${job.name}结束：${stones || job.iron ? `灵石 +${stones}${job.iron ? `、玄铁 +${job.iron}` : ''}` : '听了一段旧事'}${medicine ? `、${medicine}` : ''}。`,
      );
    }
    return true;
  }
  return false;
}
