import { recordChronicle, recordCurioAchievement } from './chronicle.ts';
import {
  acquiredCurio,
  curioName,
  curioValue,
  grantCurio,
  ownsCurio,
} from '../items/curio-data.ts';
import { MAX_FORGE_LEVEL, TREASURES, treasure } from '../core/data.ts';
import { grantMedicine } from '../items/medicine-data.ts';
import type { SaveData } from '../core/progress.ts';
import { commitSaveAction, type SaveActionHost } from '../core/save-action.ts';
import type { TownResident } from '../town/town-population.ts';

export interface NovelResonanceShell extends SaveActionHost {
  readonly panel: string;
  readonly inTown: boolean;
  readonly townNpc: TownResident | null;
  readonly townScene: { readonly nearbyNpc?: { readonly id: string } } | null;
  readonly document?: { getElementById?(id: string): { innerHTML: string } | null };
  readonly showTownEvent: (npc: TownResident) => void;
  readonly townStatus: (save: SaveData) => string;
}

export function meetTownImmortal(
  save: SaveData,
  npcId: string,
  name: string,
  pendingCurios: Record<string, number> = {},
) {
  const encounter = save.mortal.immortal;
  if (!encounter || encounter.npcId !== npcId || encounter.claimed || save.journeyEnded)
    return false;
  const curio = encounter.curioId;
  // 已在其他机缘中取得（包括待结历练）的奇物不再发放，改赠入镇时已固定的丹药。
  const canGiftCurio = curio && !acquiredCurio(save, curio) && !pendingCurios[curio];
  if (!canGiftCurio && !Number.isSafeInteger((save.medicine.bag[encounter.medicineId] || 0) + 1))
    return false;
  let gift: string;
  if (canGiftCurio && grantCurio(save, curio)) {
    gift = curioName(curio);
    recordCurioAchievement(save);
  } else {
    delete encounter.curioId;
    gift = grantMedicine(save.medicine, encounter.medicineId);
  }
  encounter.claimed = true;
  const memory = `游历青岚镇，与${name}闲谈，方知仙人也恋人间烟火。获赠${gift}一份，记下一场街巷仙缘。`;
  recordChronicle(save, '市井逢仙', memory);
  save.mortal.events.unshift(`${save.age.toFixed(1)} 岁 · ${memory}`);
  save.mortal.events.splice(6);
  return true;
}

export const NOVEL_TEA_ARTIFACTS = ['sword', 'lightning', 'umbrella'] as const;
export const NOVEL_RESONANCE_MILESTONES = {
  tea: 'novel-tea-resonance',
  dock: 'novel-dock-resonance',
} as const;
export const NOVEL_RESONANCE_FALLBACK_IRON = 15;
export type NovelResonanceKind = keyof typeof NOVEL_RESONANCE_MILESTONES;

export function hasNovelResonanceClaimed(save: SaveData, kind: NovelResonanceKind) {
  return Object.hasOwn(save.chronicle.milestones, NOVEL_RESONANCE_MILESTONES[kind]);
}

export function canTriggerNovelResonance(save: SaveData, kind: NovelResonanceKind) {
  if (save.journeyEnded || save.pendingReincarnation || hasNovelResonanceClaimed(save, kind))
    return false;
  return kind === 'tea'
    ? NOVEL_TEA_ARTIFACTS.every((id) => save.artifacts.includes(id))
    : ownsCurio(save, 'jade-ruyi');
}

export function novelResonanceTarget(
  save: SaveData,
  kind: NovelResonanceKind,
): { id: string; name: string; level: number } | null {
  if (kind === 'tea') {
    let best: { id: string; name: string; level: number } | null = null;
    for (const id of NOVEL_TEA_ARTIFACTS) {
      if (!save.artifacts.includes(id)) return null;
      const level = save.forge[id] || 0;
      if (level < MAX_FORGE_LEVEL && (!best || level < best.level))
        best = { id, name: treasure(id).name, level };
    }
    return best;
  }
  if (save.artifacts.includes(save.starter)) {
    const level = save.forge[save.starter] || 0;
    if (level < MAX_FORGE_LEVEL)
      return { id: save.starter, name: treasure(save.starter).name, level };
  }
  let best: { id: string; name: string; level: number } | null = null;
  for (const item of TREASURES) {
    if (!save.artifacts.includes(item.id)) continue;
    const level = save.forge[item.id] || 0;
    if (level < MAX_FORGE_LEVEL && (!best || level < best.level))
      best = { id: item.id, name: item.name, level };
  }
  return best;
}

export function claimNovelResonance(save: SaveData, kind: string) {
  if (kind !== 'tea' && kind !== 'dock') return false;
  if (!canTriggerNovelResonance(save, kind)) return false;
  const target = novelResonanceTarget(save, kind);
  let detail: string;
  if (target) {
    const nextLevel = target.level + 1;
    save.forge[target.id] = nextLevel;
    if (nextLevel === MAX_FORGE_LEVEL)
      recordChronicle(save, '炉火纯青', '首次将法宝炼至十阶。', 'forge');
    detail =
      kind === 'tea'
        ? `携青霄剑、九霄雷符与玄天伞入听雨茶馆，偶遇听书的老器匠替你校准器脉，${target.name}炼器升至 ${nextLevel} 阶。`
        : `携玉如意行至青岚码头，老船客认出玉柄浅痕，取出旧藏精铁助你打磨器物，${target.name}炼器升至 ${nextLevel} 阶。`;
  } else {
    save.iron += NOVEL_RESONANCE_FALLBACK_IRON;
    detail =
      kind === 'tea'
        ? `携十阶圆满的青霄剑、九霄雷符与玄天伞入听雨茶馆，老器匠赞叹器脉已成，赠玄铁 ${NOVEL_RESONANCE_FALLBACK_IRON} 枚。`
        : `携玉如意行至青岚码头，老船客认出玉柄浅痕，赠旧藏玄铁 ${NOVEL_RESONANCE_FALLBACK_IRON} 枚。`;
  }
  recordChronicle(
    save,
    kind === 'tea' ? '旧器同途' : '渡口旧玉',
    detail,
    NOVEL_RESONANCE_MILESTONES[kind],
  );
  save.mortal.events.unshift(`${save.age.toFixed(1)} 岁 · ${detail}`.slice(0, 160));
  save.mortal.events.splice(6);
  return true;
}

export function handleNovelResonance(shell: NovelResonanceShell, id?: string) {
  if (
    shell.panel !== 'town-event' ||
    !shell.inTown ||
    shell.game ||
    (id !== 'tea' && id !== 'dock')
  )
    return false;
  const npcId = id === 'tea' ? 'tea' : 'fisher';
  if (
    shell.townNpc?.id === npcId &&
    shell.townScene?.nearbyNpc?.id === npcId &&
    commitSaveAction(shell, (next) => claimNovelResonance(next, id)) === true
  ) {
    shell.showTownEvent(shell.townNpc);
    const status = shell.document?.getElementById?.('town-status');
    if (status) status.innerHTML = shell.townStatus(shell.save);
    shell.toast(shell.save.mortal.events[0]);
  }
  return true;
}

export function novelResonanceContent(save: SaveData, npcId: string) {
  const kind: NovelResonanceKind | null =
    npcId === 'tea' ? 'tea' : npcId === 'fisher' || npcId === 'dock' ? 'dock' : null;
  if (!kind) return '';
  const claimed = hasNovelResonanceClaimed(save, kind);
  if (!claimed && !canTriggerNovelResonance(save, kind)) return '';
  if (kind === 'tea') {
    const target = novelResonanceTarget(save, 'tea');
    return `<section class="town-story" aria-label="旧器同途" data-novel-resonance="tea"><span class="eyebrow">书外回响 · ${claimed ? '此世已记' : '旧器同途'}</span><h3>剑雷伞之约</h3><p>${
      claimed
        ? '窗边那位常来听《不系舟》的老器匠朝你的行囊点了点头。剑、符与伞的器脉已校妥当，这一程旧器知音的机缘已记在心头。'
        : '窗边那位常来听《不系舟》的老器匠停下茶盏，目光落在你随身的青霄剑、九霄雷符与玄天伞上。他笑着说，当年从青岚走出去的那位陆姓前辈，也是靠这三样器物一步步走过风雨——剑要常养，符板裂过一寸也肯细细接回，伞骨带伤仍替行路人遮住余波。'
    }</p><blockquote>${
      claimed
        ? '器脉已正，剩下的风雨，便由道友自己去走。'
        : '临场聚出的器式随周天散去，肯把实器留在身边慢慢磨的人不多。来，我替你再校一分器脉。'
    }</blockquote>${
      claimed
        ? '<small>此世已在听雨茶馆结下这段旧器机缘，可在仙途履历中查阅。</small>'
        : `<div class="story-choices"><button class="secondary-button" data-action="novel-resonance" data-id="tea">${
            target
              ? `请老匠校器 · ${target.name}炼器 +1 阶（${target.level} → ${target.level + 1} 阶）`
              : `收下炉边余铁 · 玄铁 +${NOVEL_RESONANCE_FALLBACK_IRON}`
          }</button></div><small>不耗年岁与灵石 · 本世仅此一次。</small>`
    }</section>`;
  }
  const target = novelResonanceTarget(save, 'dock');
  const inheritanceEntry = save.chronicle.entries.find((e) => e.title === '薪火相传');
  const inheritedRuyi =
    (save.birthInheritance?.kind === 'curio' && save.birthInheritance.id === 'jade-ruyi') ||
    (Object.hasOwn(save.chronicle.milestones, 'birth-inheritance') &&
      (inheritanceEntry
        ? inheritanceEntry.detail.includes('玉如意')
        : save.inheritanceValue === curioValue('jade-ruyi') &&
          save.curios.acquired[0] === 'jade-ruyi'));
  return `<section class="town-story" aria-label="渡口旧玉" data-novel-resonance="dock"><span class="eyebrow">渡口回响 · ${claimed ? '此世已记' : '温玉重逢'}</span><h3>渡口旧玉</h3><p>${
    claimed
      ? '歇脚的老船客望着河面，朝你腰间的玉如意笑了笑。渡口旧玉的机缘已收下，岸边早市依旧热闹。'
      : inheritedRuyi
        ? '船头一位歇脚的老船客瞥见你随身的玉如意，认出玉柄弧线上那道摩挲多年的浅痕。他轻声感叹，早年那位姓陆的船工之子临入仙门前，也是在这级石阶上将玉如意交到后来人手中——如今前人所赠之物仍在护持新程。他从舱底取出一匣早年替山上器作运货留下的精铁与磨石，愿助你打磨随身法宝。'
        : '船头一位歇脚的老船客瞥见你腰间的玉如意，忍不住凑近看了看玉柄弧线上那道摩挲多年的浅痕。他叹道，早年码头上有户姓陆的船工，儿子修成真仙离界前，曾在石阶上将这样一柄玉如意留给问路的少年。他从舱底取出一匣早年替山上器作运货留下的精铁与磨石，愿助你打磨随身法宝。'
  }</p><blockquote>${
    claimed
      ? '玉有旧痕，路是新的。道友慢走。'
      : '大家都说不知道那块玉后来流落到了哪里，原来还在走它该走的路。'
  }</blockquote>${
    claimed
      ? '<small>此世已在青岚码头结下这段旧玉机缘，可在仙途履历中查阅。</small>'
      : `<div class="story-choices"><button class="secondary-button" data-action="novel-resonance" data-id="dock">${
          target
            ? `借旧石打磨 · ${target.name}炼器 +1 阶（${target.level} → ${target.level + 1} 阶）`
            : `收下舱底旧铁 · 玄铁 +${NOVEL_RESONANCE_FALLBACK_IRON}`
        }</button></div><small>不耗年岁与灵石 · 本世仅此一次。</small>`
  }</section>`;
}
