import { ownsCurio, type CurioId } from './curio-data.ts';
import { treasure } from './data.ts';
import type { SaveData } from './progress.ts';

const COMBOS: Record<string, { curio: CurioId; notice: string; desc: string; name?: string }> = {
  sword: {
    curio: 'thunder-bamboo',
    name: '青竹蜂云剑',
    notice: '金雷入剑 · 青竹蜂云剑',
    desc: '金雷竹细叶炼入剑身，飞剑出则如蜂群，挟金雷而去；伤害提高 20%。',
  },
  fan: {
    curio: 'jade-ruyi',
    notice: '如意随风 · 拾取范围扩大',
    desc: '扇风过处，连远处的灵物也被轻轻送到手边；拾取范围扩大 40%。',
  },
  talisman: {
    curio: 'soul-wood',
    notice: '魂木生息 · 镇魂符更盛',
    desc: '养魂木温养符中魂意，镇魂符可多穿透一只妖物，伤害提高 15%。',
  },
};

// 调用者须传入本局已取得的法宝；永久收藏不代表本局已经取得。
export function curioCombo(save: Pick<SaveData, 'curios'>, id: string) {
  const combo = Object.hasOwn(COMBOS, id) ? COMBOS[id] : undefined;
  return combo && ownsCurio(save, combo.curio) ? combo : undefined;
}

export function comboTreasure(save: Pick<SaveData, 'curios'>, id: string, acquired = true) {
  const item = treasure(id);
  const combo = acquired && curioCombo(save, id);
  return combo ? { ...item, name: combo.name ?? item.name, desc: combo.desc } : item;
}

export function treasureDisplayName(save: Pick<SaveData, 'curios'>, id: string, evolved = false) {
  const item = comboTreasure(save, id);
  return evolved ? item.evolution : item.name;
}
