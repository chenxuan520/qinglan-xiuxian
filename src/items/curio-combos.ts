import { ownsCurio, type CurioId } from './curio-data.ts';
import { treasure } from '../core/data.ts';
import type { SaveData } from '../core/progress.ts';

const COMBOS: Record<string, { curio: CurioId; notice: string; desc: string; name?: string }> = {
  sword: {
    curio: 'thunder-bamboo',
    name: '青竹蜂云剑',
    notice: '金雷入剑 · 青竹蜂云剑',
    desc: '九天玄刹化为神雷，煌煌天威以剑引之；伤害提高 20%。',
  },
  fan: {
    curio: 'jade-ruyi',
    notice: '如意随风 · 拾取范围扩大',
    desc: '八荒风起扇底相随，如意一指万宝来归；拾取范围扩大 40%。',
  },
  beads: {
    curio: 'sacred-fragment',
    notice: '梵音护体 · 佛光挡劫',
    desc: '梵圣真文铸我金身，劫火焚天不染纤尘；每 12 秒可替你挡下一次伤害。',
  },
  brush: {
    curio: 'jade-book',
    notice: '玉书落墨 · 判笔添字',
    desc: '金阙玉书古字为凭，一笔四印判尽天刑；沿目标方向连书四道墨印，依次爆发范围伤害。',
  },
  bloodpool: {
    curio: 'spirit-spring',
    notice: '灵泉入盏 · 血池回春',
    desc: '血海翻涌杀伐无休，一泓灵泉化作春流；命中时每半秒回复最大气血的 0.2%。',
  },
  talisman: {
    curio: 'soul-wood',
    notice: '魂木生息 · 镇魂符更盛',
    desc: '魂木养魄千年不散，一符既落百鬼皆寒；镇魂符可多穿透一只妖物，伤害提高 15%。',
  },
  vortex: {
    curio: 'heaven-house',
    notice: '天机入阵 · 阴阳流转',
    desc: '天机推演阴阳流转，方寸之间尽纳大千；阴阳法阵更广，牵引更急。',
  },
};

export const WIND_THUNDER_VERSE =
  '雷鹏振翼风雷相从，一扇挥出万里长空；同持风雷翅时，历练移速由 15% 提高到 20%。';

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
  weaponIds: string[] = [],
) {
  const item = treasure(id);
  const combo = acquired && !(id === 'brush' && evolved) && curioCombo(save, id);
  const verse =
    acquired &&
    (id === 'fan' || id === 'lightning') &&
    windThunderCombo(save, weaponIds.length ? weaponIds : [id])
      ? WIND_THUNDER_VERSE
      : '';
  const desc = [combo ? combo.desc : item.desc, verse].filter(Boolean).join('\n');
  return combo ? { ...item, name: combo.name ?? item.name, desc } : { ...item, desc };
}

export function treasureDisplayName(save: Pick<SaveData, 'curios'>, id: string, evolved = false) {
  const item = comboTreasure(save, id);
  return evolved ? item.evolution : item.name;
}
