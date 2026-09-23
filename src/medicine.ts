import { rootElementsFor, spiritRootInfo, elementInfo, type SpiritRootId } from './data.ts';
import {
  attuneSpiritRoot,
  gainCultivation,
  lifespanInfo,
  realmCost,
  realmInfo,
  syncTribulationClock,
  tribulationDue,
  type SaveData,
} from './progress.ts';
import { advanceMortal, sectDues, sectDuesPending } from './mortal.ts';
import {
  activeMedicines,
  grantMedicine,
  medicineInfo,
  medicineFormula,
  refreshMedicineShop,
} from './medicine-data.ts';
import { recordChronicle } from './chronicle.ts';

export function medicineUseReason(save: SaveData, id: string, unfinished = false, quantity = 1) {
  const m = medicineInfo(id);
  if (!m) return '丹药不存在';
  if (unfinished) return '请先结束当前历练，再在战前服用';
  if (save.journeyEnded) return '此世仙途已结束';
  if (lifespanInfo(save).remaining <= 0 || tribulationDue(save) || sectDuesPending(save))
    return '请先处理寿元、天劫或宗门供奉';
  if (!(save.medicine.bag[id] > 0)) return '尚未获得';
  if (!Number.isSafeInteger(quantity) || quantity < 1) return '服用数量须为正整数';
  if (quantity > save.medicine.bag[id]) return '丹药数量不足';
  if (!m.years && quantity !== 1) return '本世珍品须逐份服用';
  if (id === 'butian' && save.spiritRoot === 'heaven') return '已是天灵根';
  if (
    id === 'huiyang' &&
    (!Number.isFinite(lifespanInfo(save).base) || (save.medicine.used.huiyang || 0) >= 2)
  )
    return '已长生或本世两次已用尽';
  if (id === 'peiying' && (save.medicine.used.peiying || 0) >= 3) return '本世三次已用尽';
  const major = realmInfo(save.cultivation).index;
  if (id === 'jiuqu' && (major >= 7 || save.medicine.used[`jiuqu-${major}`]))
    return major >= 7 ? '大乘及以上不可服用' : '当前大境界已经服用';
  if (
    m.years &&
    !((save.medicine.active[id] || 0) > save.age) &&
    activeMedicines(save.medicine, save.age).length >= 3
  )
    return '三种药效已满，可先散去一种';
  return '';
}
export function useMedicine(
  save: SaveData,
  id: string,
  unfinished = false,
  quantity = 1,
  random = Math.random,
) {
  const reason = medicineUseReason(save, id, unfinished, quantity);
  if (reason) return { ok: false, message: reason };
  const m = medicineInfo(id)!;
  let message = `${m.name}已服用`;
  if (m.years) {
    for (const [key, end] of Object.entries(save.medicine.active))
      if (end <= save.age) delete save.medicine.active[key];
    // 同药只累加时长，保留未耗尽的药效，不叠加强度。
    save.medicine.active[id] =
      Math.max(save.age, save.medicine.active[id] || 0) + m.years * quantity;
    message = `${m.name}已服用 ${quantity} 份，药效延长 ${m.years * quantity} 年`;
  } else if (id === 'butian') {
    const upgrades: Record<SpiritRootId, SpiritRootId[]> = {
      none: ['quad', 'five'],
      quad: ['dual', 'triple'],
      five: ['dual', 'triple'],
      dual: ['variant'],
      triple: ['variant'],
      variant: ['heaven'],
      heaven: [],
    };
    const pool = upgrades[save.spiritRoot];
    const root = pool[Math.floor(random() * pool.length)];
    attuneSpiritRoot(save, root, rootElementsFor(root, [], random));
    message = `补天有成 · ${spiritRootInfo(root).name} · ${save.rootElements.map((e) => elementInfo(e).name).join('、')}灵根`;
  } else if (id === 'huiyang') {
    const years = Math.round(lifespanInfo(save).base * 0.25);
    save.lifespanBonus += years;
    save.medicine.used.huiyang = (save.medicine.used.huiyang || 0) + 1;
    message += `，寿元增加 ${years} 年`;
  } else if (id === 'peiying') {
    save.medicine.used.peiying = (save.medicine.used.peiying || 0) + 1;
    message += '，本世气血与基础恢复各 +5%';
  } else if (id === 'jiuqu') {
    const major = realmInfo(save.cultivation).index;
    const amount = Math.floor(
      (realmCost(major * 3) + realmCost(major * 3 + 1) + realmCost(major * 3 + 2)) * 0.08,
    );
    save.medicine.used[`jiuqu-${major}`] = 1;
    gainCultivation(save, amount);
    syncTribulationClock(save);
    message += `，修为 +${amount}`;
  }
  save.medicine.bag[id] -= quantity;
  recordChronicle(save, '丹药入体', `${message}。`);
  if (!m.years)
    recordChronicle(save, '丹成造化', `首次服用本世珍品${m.name}。`, 'permanent-medicine');
  return { ok: true, message };
}
export function buyMedicine(save: SaveData, id: string) {
  const m = medicineInfo(id);
  refreshMedicineShop(save.medicine, save.age);
  if (
    !m ||
    !save.medicine.shop!.ids.includes(id) ||
    (save.medicine.shop!.bought?.[id] || 0) >= 3 ||
    m.tier !== '凡品' ||
    save.journeyEnded ||
    save.stones < m.price ||
    lifespanInfo(save).remaining <= 0 ||
    tribulationDue(save) ||
    sectDuesPending(save)
  )
    return false;
  save.stones -= m.price;
  const bought = (save.medicine.shop!.bought ??= {});
  bought[id] = (bought[id] || 0) + 1;
  grantMedicine(save.medicine, id);
  return true;
}
export const medicineCraftStones = (id: string) =>
  ({ 凡品: 10, 灵品: 40, 珍品: 100 })[medicineInfo(id)!.tier];
export function medicineCraftReason(save: SaveData, id: string, unfinished = false) {
  const m = medicineInfo(id);
  if (!m || !m.years) return '此药无方可炼，只待机缘';
  if (m.tier === '凡品') return '凡品无需炼制，可向药铺购买';
  if (!save.medicine.recipes.includes(id)) return '尚未购得药方';
  if (unfinished) return '请先结束当前历练';
  if (save.journeyEnded) return '此世仙途已结束';
  if (save.unlocked < m.stage) return `探索第 ${m.stage + 1} 境后解锁配方`;
  if (tribulationDue(save) || sectDuesPending(save) || save.mortal.activity)
    return '请先处理人间待办、供奉或天劫';
  if (lifespanInfo(save).remaining <= m.craftYears + 1e-9) return '余下寿元不足，不能开炉';
  if (save.nextTribulationAge && save.nextTribulationAge <= save.age + m.craftYears + 1e-9)
    return '天劫将至，不能开炉';
  if (
    medicineFormula(save.medicine, id).some(
      (item) => (save.medicine.bag[item.id] || 0) < item.count,
    )
  )
    return '配方所需丹药不足';
  const dues = save.mortal.member?.dues ? save.mortal.member : null;
  // 开炉前预留其间到期的供奉，保证炼制一次结清，不产生现实等待。
  let reserve = 0;
  if (dues && dues.dueAt <= save.mortal.years + m.craftYears) {
    const next = sectDues(save);
    if (next.stones > 0)
      reserve =
        Math.min(dues.dues, next.stones) +
        Math.floor((save.mortal.years + m.craftYears - dues.dueAt) / next.years) * next.stones;
  }
  if (save.stones < medicineCraftStones(id) + reserve)
    return reserve ? '灵石不足以支付炼制和期间供奉' : '炼制灵石不足';
  return '';
}
export function craftMedicine(save: SaveData, id: string, unfinished = false) {
  const reason = medicineCraftReason(save, id, unfinished);
  if (reason) return { ok: false, message: reason };
  const m = medicineInfo(id)!;
  syncTribulationClock(save);
  save.stones -= medicineCraftStones(id);
  for (const item of medicineFormula(save.medicine, id)) save.medicine.bag[item.id] -= item.count;
  advanceMortal(save, m.craftYears * 60);
  grantMedicine(save.medicine, id);
  const message = `炼成${m.name}，消耗 ${m.craftYears} 年`;
  recordChronicle(save, '开炉得丹', `${message}。`);
  return { ok: true, message };
}

export const medicineRecipePrice = (id: string) => (medicineInfo(id)?.tier === '灵品' ? 80 : 200);
export function buyMedicineRecipe(save: SaveData, id: string) {
  const m = medicineInfo(id);
  if (
    !m?.years ||
    m.tier === '凡品' ||
    save.unlocked < m.stage ||
    save.medicine.recipes.includes(id) ||
    save.stones < medicineRecipePrice(id) ||
    save.journeyEnded ||
    lifespanInfo(save).remaining <= 0 ||
    tribulationDue(save) ||
    sectDuesPending(save)
  )
    return false;
  save.stones -= medicineRecipePrice(id);
  save.medicine.recipes.push(id);
  return true;
}
