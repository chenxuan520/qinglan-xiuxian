import { FINAL_TRIAL_STAGE, MAX_FORGE_LEVEL, TREASURES } from './data.ts';
import { isCurio, curioName, grantCurio } from './curio-data.ts';
import { medicineInfo } from './medicine-data.ts';
import {
  gainCultivation,
  IMMORTAL_CULTIVATION,
  realmCost,
  syncTribulationClock,
  type SaveData,
} from './progress.ts';
import { realmTitle, recordCurioAchievement } from './chronicle.ts';

export type DebugResourceKind =
  | 'stones'
  | 'iron'
  | 'artifact'
  | 'medicine'
  | 'curio'
  | 'cultivation'
  | 'realm';
export const DEBUG_REALMS = Array.from({ length: 25 }, (_, step) => ({
  id: String(step),
  name: step === 24 ? '渡劫' : realmTitle(step),
  cultivation:
    step === 0
      ? 1
      : Array.from({ length: step }, (_, i) => realmCost(i)).reduce((a, b) => a + b, 0),
}));
export const debugCultivationRemaining = (save: SaveData) =>
  save.completed.includes(FINAL_TRIAL_STAGE)
    ? 0
    : Math.max(0, IMMORTAL_CULTIVATION - save.cultivation);
export interface DebugGrant {
  kind: string;
  id: string;
  quantity: number;
  forge: number;
}
export const debugQuantityLimit = (kind: string) =>
  kind === 'cultivation'
    ? IMMORTAL_CULTIVATION
    : kind === 'stones' || kind === 'iron'
      ? 1000000
      : kind === 'medicine'
        ? 1000
        : 1;

// 只构造副本，持久化成功前不触碰正在游玩的存档。
export function debugGrant(save: SaveData, input: DebugGrant) {
  const next = structuredClone(save);
  const add = (current: number, limit: number) =>
    Number.isSafeInteger(input.quantity) &&
    input.quantity > 0 &&
    input.quantity <= limit &&
    Number.isSafeInteger(current) &&
    current >= 0 &&
    Number.isSafeInteger(current + input.quantity);
  let message: string;
  if (input.kind === 'cultivation' || input.kind === 'realm') {
    const remaining = debugCultivationRemaining(next);
    if (!remaining) return { error: '修为调试最高到渡劫，当前已达上限。' };
    const target = DEBUG_REALMS.find((r) => r.id === input.id);
    const amount =
      input.kind === 'realm' ? (target?.cultivation ?? NaN) - next.cultivation : input.quantity;
    if (
      !Number.isSafeInteger(next.cultivation) ||
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      amount > remaining
    )
      return {
        error:
          input.kind === 'realm'
            ? '请选择高于当前的境界，最高到渡劫。'
            : `请输入有效修为点数，最多可增加 ${remaining.toLocaleString('zh-CN', { useGrouping: false })} 点。`,
      };
    gainCultivation(next, amount);
    syncTribulationClock(next);
    message =
      input.kind === 'realm'
        ? `已达${target!.name} · 永久修为 +${amount.toLocaleString('zh-CN', { useGrouping: false })}`
        : `永久修为 +${amount.toLocaleString('zh-CN', { useGrouping: false })}`;
  } else if (input.kind === 'stones' || input.kind === 'iron') {
    if (!add(next[input.kind], debugQuantityLimit(input.kind)))
      return { error: '请输入有效数量，余额不能超出上限。' };
    next[input.kind] += input.quantity;
    message = `${input.kind === 'stones' ? '灵石' : '玄铁'} +${input.quantity.toLocaleString('zh-CN', { useGrouping: false })}`;
  } else if (input.kind === 'artifact') {
    const t = TREASURES.find((t) => t.id === input.id);
    if (!t || !Number.isInteger(input.forge) || input.forge < 0 || input.forge > MAX_FORGE_LEVEL)
      return { error: '请选择有效法宝和炼器阶数。' };
    if (!next.artifacts.includes(t.id)) next.artifacts.push(t.id);
    next.forge[t.id] = Math.max(next.forge[t.id] || 0, input.forge);
    next.artifactDrops = next.artifactDrops.filter((id) => id !== t.id);
    if (next.mortal.auction)
      next.mortal.auction.releasedArtifacts = next.mortal.auction.releasedArtifacts.filter(
        (id) => id !== t.id,
      );
    message = `${t.name}已收入藏器阁 · 炼器${next.forge[t.id]}阶 · 本命自行选择`;
  } else if (input.kind === 'medicine') {
    const m = medicineInfo(input.id);
    if (!m || !add(next.medicine.bag[m.id] || 0, debugQuantityLimit(input.kind)))
      return { error: '请选择有效丹药和数量，库存不能超出上限。' };
    next.medicine.bag[m.id] = (next.medicine.bag[m.id] || 0) + input.quantity;
    message = `${m.name} +${input.quantity} · 已收入丹囊`;
  } else if (input.kind === 'curio') {
    const id = input.id;
    if (!isCurio(id) || input.quantity !== 1 || !grantCurio(next, id))
      return { error: '每件奇物本世仅可获得一次，数量须为一件。' };
    recordCurioAchievement(next);
    message = `${curioName(id)}已收入行囊 · 持有即生效`;
  } else return { error: '请选择发放类别。' };
  next.factsTampered = true;
  return { next, message };
}
