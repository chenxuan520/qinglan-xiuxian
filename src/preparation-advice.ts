import { MAX_FORGE_LEVEL, treasure } from './data.ts';
import {
  forgeCost,
  forgeDamageBonus,
  lifespanInfo,
  trainingCost,
  trainingYears,
  tribulationDue,
  type SaveData,
} from './progress.ts';
import { sectDuesPending } from './mortal.ts';
import { MEDICINES } from './medicine-data.ts';
import { medicineUseReason } from './medicine.ts';
import { trainingStepText } from './training-preview.ts';

// 只读当前行囊与正式报价；不推断败因、不代替玩家购买或服药。
export function preparationAdvice(save: SaveData, unfinished = false) {
  if (
    unfinished ||
    save.tribulationReturn ||
    save.journeyEnded ||
    save.pendingReincarnation ||
    save.mortal.marketSocial?.ambush ||
    sectDuesPending(save) ||
    tribulationDue(save) ||
    lifespanInfo(save).remaining <= 0
  )
    return null;
  const level = save.forge[save.starter] || 0;
  const cost = forgeCost(level, save);
  if (
    save.artifacts.includes(save.starter) &&
    level < MAX_FORGE_LEVEL &&
    save.stones >= cost.stones &&
    save.iron >= cost.iron
  ) {
    const gain = ((1 + forgeDamageBonus(level + 1)) / (1 + forgeDamageBonus(level)) - 1) * 100;
    return {
      kind: 'forge' as const,
      action: 'treasure',
      id: save.starter,
      label: '查看本命炼器',
      text: `现有资粮可将${treasure(save.starter).name}炼至${level + 1}阶：${cost.stones}灵石、${cost.iron}玄铁，不耗年岁；同等搭配下此宝伤害较当前提升${gain.toFixed(1)}%。`,
    };
  }
  const years = trainingYears(save);
  const kinds = (['vitality', 'power', 'speed'] as const)
    .filter(
      (kind) => save.training[kind] < 20 && save.stones >= trainingCost(save.training[kind], save),
    )
    .sort((a, b) => save.training[a] - save.training[b]);
  const kind = kinds[0];
  if (kind && lifespanInfo(save).remaining > years + 1e-9) {
    const names = { vitality: '淬体', power: '悟道', speed: '身法' };
    return {
      kind: 'training' as const,
      action: 'cultivation',
      id: '',
      label: '查看根基修习',
      text: `现有灵石可将${names[kind]}修至${save.training[kind] + 1}阶：同等搭配下${trainingStepText(save, kind)}；花费${trainingCost(save.training[kind], save)}灵石、${years}年。可在洞府比较后再选；药效仍随修习年岁流逝。`,
    };
  }
  const medicines = MEDICINES.filter(
    (m) =>
      m.years > 0 && !(save.medicine.active[m.id] > save.age) && !medicineUseReason(save, m.id),
  );
  if (medicines.length)
    return {
      kind: 'medicine' as const,
      action: 'medicine',
      id: '',
      label: '查看丹囊药效',
      text: `丹囊有${medicines.length}种尚未生效、可在战前服用的时效丹。先看药效与持续年岁，再按本次行程取舍。`,
    };
  return null;
}

export function preparationAdviceContent(save: SaveData, unfinished = false, settlement = false) {
  const advice = preparationAdvice(save, unfinished);
  if (!advice) return '';
  return `<div class="panel-note preparation-advice" aria-label="行前可备"><strong>行前可备</strong><p>${advice.text}</p>${settlement ? '<small>返回首页后可查看准备，也可直接继续历练。</small>' : `<button class="secondary-button" data-action="${advice.action}"${advice.id ? ` data-id="${advice.id}"` : ''}>${advice.label} →</button>`}</div>`;
}
