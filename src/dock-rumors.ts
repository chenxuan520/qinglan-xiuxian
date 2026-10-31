import { acquiredCurio, curioName, curioRoll, forecastCurioConsignment } from './curio-data.ts';
import { forecastPermanentMedicine } from './auction-trade.ts';
import { medicineInfo } from './medicine-data.ts';
import type { SaveData } from './progress.ts';

export type DockRumorKey =
  | 'ranking'
  | 'immortal'
  | 'ambush'
  | 'bottle'
  | 'rootless'
  | 'lu-boatman'
  | 'ruyi'
  | 'zhehuo'
  | 'night-boat'
  | 'fishing'
  | 'forecast-curio'
  | 'forecast-medicine';
export interface DockRumor {
  key: DockRumorKey;
  text: string;
  href?: string;
}

const ranking: DockRumor = {
  key: 'ranking',
  text: '下游有座山上祭着一面幡，收的全是修士的名号。听说道行越深，名字挂得越高，也不知图个什么。',
  href: 'https://xiuxian.011203.xyz/leaderboard/',
};
const rumors: DockRumor[] = [
  {
    key: 'immortal',
    text: '老辈人说，久不归乡的修士回来，街上偶尔会多出个面生的人。肯上前搭话的，总能捎点什么走。',
  },
  {
    key: 'ambush',
    text: '坊里有人请你去城外看货，多半没安好心。前些年有个修士去了，船上就再没见过他。',
  },
  {
    key: 'bottle',
    text: '上游有个修士喝醉了，说世上有只瓶子能装下一片天。旁人都笑他，他自己倒不笑。',
  },
  {
    key: 'rootless',
    text: '都说没有灵根修不成仙。可我在船上载过一位，自称当年就是个凡骨。',
  },
  {
    key: 'lu-boatman',
    text: '早年这码头上有户船工姓陆，儿子后来修成了仙。最后一回来，只在石阶上坐了一会儿，送了渡口一个少年一样东西，就再没见过他。',
  },
  {
    key: 'ruyi',
    text: '听说有一柄玉如意，边上磨出了浅痕。后来流到哪儿去了，谁也说不清。',
  },
  {
    key: 'zhehuo',
    text: '落霞古墟里有条旧道，叫折火道。早年有人拿着带封签的旧匣子四处卖，说里头是仙丹。买的人，后来大多后悔了。',
  },
  {
    key: 'night-boat',
    text: '有时候夜里，码头会多出一条船，不点灯，也不说从哪儿来。天亮前就走了。有人说上去换过东西，换了什么，他不肯讲。',
  },
  {
    key: 'fishing',
    text: '渔夫说这条河什么都钓得上来，几十年前谁失手掉下去的东西，也算在里头。就是得有耐性陪他坐着。',
  },
];

export function dockRumorPool(save: SaveData): DockRumor[] {
  const pool = rumors
    .filter((rumor) => rumor.key !== 'bottle' || !acquiredCurio(save, 'heaven-bottle'))
    .map((rumor) => ({ ...rumor }));
  const age = save.mortal.scenery?.lastVisitAge ?? save.age;
  const curio = forecastCurioConsignment({ age, curios: save.curios });
  if (curio) {
    const span =
      curio.years <= 15
        ? '十来年'
        : curio.years <= 35
          ? '二三十年'
          : curio.years <= 70
            ? '五六十年'
            : curio.years <= 150
              ? '百来年'
              : '两三百年';
    pool.push({
      key: 'forecast-curio',
      text: `船上有个跑拍卖的伙计说，再过${span}，坊里拍卖会会有人寄拍一件${curioName(curio.id)}。地字场、天字场才摆得出来，得是够格进场的修士才见得着。`,
    });
  }
  const medicine = forecastPermanentMedicine(save);
  if (medicine) {
    const span =
      medicine.visits === 1 ? '下回开市' : medicine.visits <= 3 ? '再开两三回市' : '过些回开市';
    const name = Object.hasOwn(save.medicine.bag, medicine.id)
      ? medicineInfo(medicine.id)!.name
      : '一枚说不上名字的珍品丹';
    pool.push({
      key: 'forecast-medicine',
      text: `坊里的人说，${span}，天字场会有人寄拍${name}。天字场只放合体以上的修士进去。`,
    });
  }
  return pool;
}

// 入镇年岁固定本次抽选；闲逛与关开面板不调用随机源或写入存档。
export function dockRumors(save: SaveData, rankingEnabled: boolean): DockRumor[] {
  const age = save.mortal.scenery?.lastVisitAge ?? save.age;
  const seed = curioRoll(save.mortal.population?.seed ?? 0, `dock-rumors:${age}`);
  const pool = dockRumorPool(save).sort((a, b) => curioRoll(seed, a.key) - curioRoll(seed, b.key));
  return rankingEnabled ? [{ ...ranking }, ...pool.slice(0, 2)] : pool.slice(0, 3);
}
