import type { SaveData } from './progress.ts';
import { completedAchievements } from './chronicle.ts';

export function chronicleAchievements(save: SaveData) {
  const definitions: Array<{ id: string; title: string; detail: string; difficulty: number }> = [
    { id: 'forge', difficulty: 102, title: '炉火纯青', detail: '一件法宝炼器十阶' },
    {
      id: 'three-paths',
      difficulty: 70,
      title: '三道皆证',
      detail: '同一世以正道、魔道、兼修各通关一次',
    },
    { id: 'permanent-medicine', difficulty: 30, title: '丹成造化', detail: '首次服用本世珍品丹药' },
    {
      id: 'story',
      difficulty: 10,
      title: Object.hasOwn(save.chronicle.milestones, 'story') ? '炉火长明' : '未遇之缘',
      detail: '留下一段人间旧事',
    },
    { id: 'collection', difficulty: 95, title: '万宝归藏', detail: '收齐三十六件法宝' },
    { id: 'level-100', difficulty: 80, title: '百级归真', detail: '单局达到一百级' },
    { id: 'mastery', difficulty: 60, title: '仙门有道', detail: '一部宗门宝典精研十阶' },
    {
      id: 'training-master',
      difficulty: 105,
      title: '三元归一',
      detail: '淬体、悟道与身法皆修至二十阶',
    },
    { id: 'six-immortals', difficulty: 100, title: '六仙同御', detail: '单局同时觉醒六件仙器' },
    { id: 'five-tribulations', difficulty: 110, title: '五劫不灭', detail: '累计渡过五次天劫' },
    { id: 'hard-immortal', difficulty: 120, title: '逆境问道', detail: '以天劫降临难度成就真仙' },
    { id: 'rootless-immortal', difficulty: 140, title: '凡骨登仙', detail: '以无灵根成就真仙' },
    { id: 'curio-three', difficulty: 50, title: '奇珍有缘', detail: '本世先后获得三件不同奇物' },
    { id: 'peerless', difficulty: 150, title: '万古独尊', detail: '达成本世其余十四项仙途成就' },
    {
      id: 'one-life-clear',
      title: '一命通关',
      detail: '以极限模式一命踏破七境，成就真仙',
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
