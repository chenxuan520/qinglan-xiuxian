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
  beads: {
    curio: 'sacred-fragment',
    notice: '梵音护体 · 佛光挡劫',
    desc: '梵圣真片的道纹映入念珠，佛光绕身；每 12 秒可替你挡下一次伤害。',
  },
  brush: {
    curio: 'jade-book',
    notice: '玉书落墨 · 判笔添字',
    desc: '金阙玉书的古字随笔而下，沿目标方向连书四道墨印，依次爆发范围伤害。',
  },
  bloodpool: {
    curio: 'spirit-spring',
    notice: '灵泉入盏 · 血池回春',
    desc: '灵眼之泉的清光注入血盏，血池持续伤敌；命中时每半秒回复最大气血的 0.2%。',
  },
  talisman: {
    curio: 'soul-wood',
    notice: '魂木生息 · 镇魂符更盛',
    desc: '养魂木温养符中魂意，镇魂符可多穿透一只妖物，伤害提高 15%。',
  },
  vortex: {
    curio: 'heaven-house',
    notice: '天机入阵 · 阴阳流转',
    desc: '天机屋的推演之术映入阵盘，阴阳法阵更广，牵引更急。',
  },
};

// 调用者须传入本局已取得的法宝；永久收藏不代表本局已经取得。
export function curioCombo(save: Pick<SaveData, 'curios'>, id: string) {
  const combo = Object.hasOwn(COMBOS, id) ? COMBOS[id] : undefined;
  return combo && ownsCurio(save, combo.curio) ? combo : undefined;
}

export function windThunderCombo(save: Pick<SaveData, 'curios'>, weaponIds: string[]) {
  return (
    ownsCurio(save, 'wind-wings') && weaponIds.some((id) => id === 'fan' || id === 'lightning')
  );
}

export function comboTreasure(
  save: Pick<SaveData, 'curios'>,
  id: string,
  acquired = true,
  evolved = false,
) {
  const item = treasure(id);
  const combo = acquired && !(id === 'brush' && evolved) && curioCombo(save, id);
  return combo ? { ...item, name: combo.name ?? item.name, desc: combo.desc } : item;
}

export function treasureDisplayName(save: Pick<SaveData, 'curios'>, id: string, evolved = false) {
  const item = comboTreasure(save, id);
  return evolved ? item.evolution : item.name;
}
