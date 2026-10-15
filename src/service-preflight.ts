import { FINAL_TRIAL_STAGE } from './data.ts';
import { lifespanInfo, tribulationDue, type SaveData } from './progress.ts';
import { sectDues, sectDuesPending } from './mortal.ts';

export function serviceDues(save: SaveData, years: number) {
  const member = save.mortal.member,
    next = sectDues(save);
  if (!member?.dues || !next.stones || member.dueAt > save.mortal.years + years + 1e-9) return 0;
  return (
    Math.min(member.dues, next.stones) +
    Math.max(0, Math.floor((save.mortal.years + years - member.dueAt + 1e-9) / next.years)) *
      next.stones
  );
}
export function serviceReason(save: SaveData, years: number, unfinished = false) {
  if (unfinished) return '请先结束未完成的历练';
  if (save.journeyEnded || save.pendingReincarnation) return '此世仙途已结束';
  if (save.mortal.marketSocial?.ambush) return '请先处理劫修遭遇';
  if (save.mortal.activity || sectDuesPending(save) || tribulationDue(save))
    return '请先处理待办、供奉或天劫';
  if (lifespanInfo(save).remaining <= years + 1e-9) return '余下寿元不足，不能办理';
  if (
    !save.completed.includes(FINAL_TRIAL_STAGE) &&
    save.nextTribulationAge > 0 &&
    save.nextTribulationAge <= save.age + years + 1e-9
  )
    return '天劫将至，不能办理';
  return '';
}
