import {
  FINAL_TRIAL_STAGE,
  spiritRootInfo,
  passive,
  allowsSchool,
  treasure,
  rootStarter,
  type CultivationPath,
} from './data.ts';
import { lifespanInfo, realmInfo, tribulationDue, type SaveData } from './progress.ts';
import {
  SECTS,
  SECT_DUES,
  SECT_ROLES,
  MAX_MASTERY,
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
export function masteryBonus(save: SaveData, id: string) {
  return save.mortal.member?.id === id ? (save.mortal.mastery[id] || 0) * MASTERY_PER_LEVEL : 0;
}
export function studyPlan(save: SaveData) {
  const id = save.mortal.member?.id;
  const level = id ? save.mortal.mastery[id] || 0 : 0;
  return {
    level,
    stones: 30 + level * 20,
    years: Math.round(((1 + level * 0.4) / spiritRootInfo(save.spiritRoot).rate) * 10) / 10,
  };
}
function log(save: SaveData, text: string) {
  save.mortal.events.unshift(`人间 ${save.mortal.years.toFixed(1)} 年 · ${text}`);
  save.mortal.events.length = Math.min(6, save.mortal.events.length);
}
function canAct(save: SaveData) {
  return lifespanInfo(save).remaining > 0 && !tribulationDue(save);
}
export function joinSect(save: SaveData, id: string, unfinishedPath?: CultivationPath) {
  const sect = SECTS.find((s) => s.id === id);
  if (
    !canAct(save) ||
    save.mortal.member ||
    !sect ||
    (unfinishedPath !== undefined && unfinishedPath !== sect.school) ||
    save.stones < entryCost(save)
  )
    return false;
  save.stones -= entryCost(save);
  save.path = sect.school;
  if (!allowsSchool(save.path, treasure(save.starter).school))
    save.starter = rootStarter(save.rootElements, save.path);
  const dues = sectDues(save);
  save.mortal.member = {
    id,
    dueAt: dues.stones ? save.mortal.years + dues.years : 0,
    dues: dues.stones,
  };
  log(save, `拜入${SECTS.find((s) => s.id === id)!.name}，本门精研加成已生效。`);
  return true;
}
export function leaveSect(save: SaveData, expelled = false) {
  if (!save.mortal.member) return false;
  if (save.mortal.activity?.kind === 'study') save.mortal.activity = null;
  save.mortal.member = null;
  log(
    save,
    expelled
      ? '供奉不足，已被清退；精研等级保留，加成立即失效。'
      : '已离开宗门；精研等级保留，加成暂停。',
  );
  return true;
}
export function startActivity(save: SaveData, kind: string) {
  if (!canAct(save) || save.mortal.activity) return false;
  if (kind === 'study') {
    const plan = studyPlan(save);
    if (!save.mortal.member || plan.level >= MAX_MASTERY || save.stones < plan.stones) return false;
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
  return true;
}
export function tradeIron(save: SaveData, buy: boolean) {
  if (!canAct(save) || (buy ? save.stones < 30 : save.iron < 1)) return false;
  save.stones += buy ? -30 : 12;
  save.iron += buy ? 1 : -1;
  return true;
}
// 调用方仅传入人间界面处于前台的时间；不使用墙钟，不补算离线收益或供奉。
export function advanceMortal(save: SaveData, seconds: number, random = Math.random) {
  if (!Number.isFinite(seconds) || seconds <= 0 || !canAct(save)) return false;
  const world = save.mortal;
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
      world.activity?.remaining ?? Infinity,
    );
    world.years += step;
    save.age += step;
    remaining -= step;
    if (world.activity) world.activity.remaining -= step;
    // 同时到期先扣供奉，不能用尚未完成的委托收入透支门费。
    if (world.member?.dues && world.years >= world.member.dueAt - 1e-9) {
      const member = world.member;
      if (save.stones < member.dues) leaveSect(save, true);
      else {
        save.stones -= member.dues;
        log(save, `已缴供奉 ${member.dues} 灵石。`);
        const next = sectDues(save);
        member.dueAt += next.years;
        member.dues = next.stones;
      }
      changed = true;
    }
    const activity = world.activity;
    if (activity && activity.remaining <= 1e-9) {
      world.activity = null;
      if (activity.kind === 'study') {
        const id = activity.sect!;
        world.mastery[id] = Math.min(MAX_MASTERY, (world.mastery[id] || 0) + 1);
        log(
          save,
          `${passive(id).name}精研至 ${world.mastery[id]} 阶，本门正向效果 +${Math.round(world.mastery[id] * MASTERY_PER_LEVEL * 100)}%。`,
        );
      } else {
        const job = TOWN_JOBS[activity.kind];
        const stones = activity.kind === 'tea' ? (random() < 0.3 ? 8 : 0) : job.stones;
        save.stones += stones;
        save.iron += job.iron;
        log(
          save,
          `${job.name}结束：${stones || job.iron ? `灵石 +${stones}${job.iron ? `、玄铁 +${job.iron}` : ''}` : '听了一段旧事，未遇机缘'}。`,
        );
      }
      changed = true;
    }
  }
  return changed;
}
