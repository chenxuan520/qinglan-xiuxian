import type { SaveData } from './progress.ts';
import { completedAchievements } from './chronicle.ts';

// 年表保留原有记录，展示时与当前成就名称一致。
export function chronicleEntryTitle(title: string) {
  switch (title) {
    case '一命通关':
      return '生死证道';
    case '百级归真':
      return '百炼归真';
    case '仙门有道':
      return '一脉真传';
    case '逆境问道':
    case '逆天证道':
      return '逆天改命';
    default:
      return title;
  }
}

export function chronicleAchievements(save: SaveData) {
  const definitions: Array<{
    id: string;
    title: string;
    detail: string;
    verse: string;
    difficulty: number;
  }> = [
    {
      id: 'forge',
      difficulty: 102,
      title: '炉火纯青',
      detail: '一件法宝炼器十阶',
      verse: '十年炉火，淬得贯日寒芒。',
    },
    {
      id: 'three-paths',
      difficulty: 70,
      title: '三道皆证',
      detail: '同一世以正道、魔道、兼修各通关一次',
      verse: '玄魔两忘，过山片尘不染。',
    },
    {
      id: 'permanent-medicine',
      difficulty: 30,
      title: '丹成造化',
      detail: '首次服用本世珍品丹药',
      verse: '丹成九转，偷得岁月宽平。',
    },
    {
      id: 'story',
      difficulty: 10,
      title: Object.hasOwn(save.chronicle.milestones, 'story') ? '尘缘初结' : '未遇之缘',
      detail: '留下一段人间旧事',
      verse: '一饭之温，足慰千秋远客。',
    },
    {
      id: 'collection',
      difficulty: 95,
      title: '万宝归藏',
      detail: '收齐三十六件法宝',
      verse: '天下奇兵，尽入袖中。',
    },
    {
      id: 'level-100',
      difficulty: 80,
      title: '百炼归真',
      detail: '单局达到一百级',
      verse: '千回吐纳，铅华散尽见真我。',
    },
    {
      id: 'mastery',
      difficulty: 60,
      title: '一脉真传',
      detail: '一部宗门宝典精研十阶',
      verse: '青灯照卷，尽得正法真传。',
    },
    {
      id: 'training-master',
      difficulty: 105,
      title: '三元归一',
      detail: '淬体、悟道与身法皆修至二十阶',
      verse: '身同金石，一纵风雷跨山海。',
    },
    {
      id: 'six-immortals',
      difficulty: 100,
      title: '六仙同御',
      detail: '单局同时觉醒六件仙器',
      verse: '六器齐鸣，神光照彻八荒。',
    },
    {
      id: 'five-tribulations',
      difficulty: 110,
      title: '五劫不灭',
      detail: '累计渡过五次天劫',
      verse: '劫雷五度，九天难灭此身。',
    },
    {
      id: 'hard-immortal',
      difficulty: 120,
      title: '逆天改命',
      detail: '以天劫降临难度成就真仙',
      verse: '天威如狱，孤舟亦破万重浪。',
    },
    {
      id: 'rootless-immortal',
      difficulty: 140,
      title: '凡骨登仙',
      detail: '以无灵根成就真仙',
      verse: '五行未许，亦教苍天俯首。',
    },
    {
      id: 'curio-three',
      difficulty: 50,
      title: '奇珍有缘',
      detail: '本世先后获得三件不同奇物',
      verse: '世外遗珍，袖底自藏乾坤。',
    },
    {
      id: 'peerless',
      difficulty: 150,
      title: '万古独尊',
      detail: '未受传承遗物，达成本世其余十四项仙途成就',
      verse: '不假前人片瓦，独步万古云霄。',
    },
    {
      id: 'one-life-clear',
      title: '生死证道',
      detail: '以极限模式一命踏破七境，成就真仙',
      verse: '孤锋一命，斩尽七境方回头。',
      difficulty: 130,
    },
  ];
  return definitions
    .sort((a, b) => a.difficulty - b.difficulty)
    .map((a) => ({
      ...a,
      achieved:
        a.id === 'peerless'
          ? completedAchievements(save)
          : Object.hasOwn(save.chronicle.milestones, a.id),
      age: save.chronicle.milestones[a.id],
    }));
}
