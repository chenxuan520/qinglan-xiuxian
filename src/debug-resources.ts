import { MAX_FORGE_LEVEL, TREASURES } from './data.ts';
import { isCurio, curioName } from './curio-data.ts';
import { medicineInfo } from './medicine-data.ts';
import type { SaveData } from './progress.ts';

export type DebugResourceKind = 'stones' | 'iron' | 'artifact' | 'medicine' | 'curio';
export interface DebugGrant {
  kind: string;
  id: string;
  quantity: number;
  forge: number;
}
export const debugQuantityLimit = (kind: string) =>
  kind === 'stones' || kind === 'iron' ? 1000000 : kind === 'medicine' ? 1000 : 99;

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
  if (input.kind === 'stones' || input.kind === 'iron') {
    if (!add(next[input.kind], debugQuantityLimit(input.kind)))
      return { error: '请输入有效数量，余额不能超出上限。' };
    next[input.kind] += input.quantity;
    message = `${input.kind === 'stones' ? '灵石' : '玄铁'} +${input.quantity.toLocaleString('zh-CN')}`;
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
    if (!isCurio(id) || !add(next.curios.bag[id] || 0, debugQuantityLimit(input.kind)))
      return { error: '请选择有效奇物和数量，库存不能超出上限。' };
    next.curios.bag[id] = (next.curios.bag[id] || 0) + input.quantity;
    message = `${curioName(id)} +${input.quantity} · 持有即生效，同名不叠加`;
  } else return { error: '请选择发放类别。' };
  return { next, message };
}
