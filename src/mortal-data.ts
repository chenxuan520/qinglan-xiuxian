import { PASSIVES } from './data.ts';
import { validTownPopulation, type TownPopulation } from './town-population.ts';
import { validTownScenery, type TownScenery } from './town-history.ts';
import { validSmithStory, smithStoryFits, type SmithStory } from './town-story.ts';
import { validTownImmortal, type TownImmortal } from './town-immortal.ts';
import { validHumanStories, type HumanStories } from './human-stories.ts';

export const SECTS = PASSIVES.map((manual, index) => ({
  id: manual.id,
  name: [
    '太玄剑宗',
    '周天星宫',
    '乾坤道院',
    '金刚禅院',
    '长生谷',
    '破妄山庄',
    '纳灵阁',
    '紫府仙宫',
    '血煞宫',
    '天魔宗',
    '九幽门',
    '白骨山',
    '噬魂殿',
    '厄运教',
    '拘魂楼',
    '逆命宗',
  ][index],
  motto: [
    '剑意藏锋，一念破万法。',
    '观星推演，万法皆循周天。',
    '袖藏乾坤，咫尺亦是天地。',
    '金身不动，万劫不摧。',
    '草木长青，道法生生不息。',
    '明镜照心，窥破一线生机。',
    '海纳百川，聚八荒之灵。',
    '紫府开明，神魂与天地通。',
    '以血为契，锋芒愈盛。',
    '舍身入魔，绝境即是生门。',
    '九幽深处，冥寒侵骨。',
    '白骨铸甲，以伤还伤。',
    '吞噬残魂，续我魔躯。',
    '咒印既落，厄运难逃。',
    '锁尽游魂，化作修行薪火。',
    '逆天改命，险中争一线仙机。',
  ][index],
  school: manual.school,
  art: index % 8,
}));

export const MAX_MASTERY = 10;
export const MASTERY_REALMS = [
  { step: 2, name: '炼气后期' },
  { step: 3, name: '筑基初期' },
  { step: 6, name: '金丹初期' },
  { step: 9, name: '元婴初期' },
  { step: 12, name: '化神初期' },
  { step: 15, name: '炼虚初期' },
  { step: 18, name: '合体初期' },
  { step: 21, name: '大乘初期' },
  { step: 23, name: '大乘后期' },
  { step: 24, name: '真仙' },
];
export const MASTERY_PER_LEVEL = 0.03;
export const SECT_ROLES = [
  '外门杂役',
  '外门弟子',
  '内门弟子',
  '真传弟子',
  '宗门执事',
  '宗门长老',
  '掌门',
  '太上长老',
  '开宗老祖',
];
export const MAX_SECT_DUES = 500;
export const SECT_DUES = [
  { years: 20, stones: 50 },
  { years: 50, stones: 100 },
  { years: 100, stones: 150 },
  { years: 200, stones: 200 },
  { years: 400, stones: 300 },
  { years: 1000, stones: 400 },
  { years: 2000, stones: 450 },
  { years: 5000, stones: MAX_SECT_DUES },
  { years: 0, stones: 0 },
];
export const TOWN_JOBS = {
  herbs: { name: '药铺采药', years: 1, stones: 18, iron: 0, desc: '替城中药铺采集山间药草。' },
  escort: { name: '镖局护送', years: 2, stones: 40, iron: 1, desc: '护送凡人商队，换些修行资粮。' },
  tea: {
    name: '茶馆听书',
    years: 0.5,
    stones: 0,
    iron: 0,
    desc: '听一回问道长生的仙途旧闻，半载闲谈，偶遇愿赠资粮的有缘人。',
  },
};
export type TownJob = keyof typeof TOWN_JOBS;
export interface MortalState {
  years: number;
  population?: TownPopulation;
  scenery?: TownScenery;
  smithStory?: SmithStory;
  immortal?: TownImmortal | null;
  humanStories?: HumanStories;
  member: { id: string; dueAt: number; dues: number } | null;
  mastery: Record<string, number>;
  activity: {
    kind: TownJob | 'study';
    remaining: number;
    total: number;
    sect: string | null;
  } | null;
  events: string[];
}
export function freshMortal(): MortalState {
  return { years: 0, member: null, mastery: {}, activity: null, events: [] };
}
export function validMortal(value: unknown, age = 15): value is MortalState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const s = value as MortalState;
  const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  const sect = (id: unknown) => SECTS.some((s) => s.id === id);
  return (
    number(s.years) &&
    (s.immortal == null || validTownImmortal(s.immortal, age)) &&
    (s.population === undefined || validTownPopulation(s.population)) &&
    (s.humanStories === undefined || validHumanStories(s.humanStories, s.population, age)) &&
    (s.scenery === undefined || validTownScenery(s.scenery)) &&
    (s.smithStory === undefined ||
      (validSmithStory(s.smithStory) &&
        !!s.population &&
        smithStoryFits(s.smithStory, s.population, age))) &&
    (s.member === null ||
      (!!s.member &&
        sect(s.member.id) &&
        number(s.member.dueAt) &&
        Number.isSafeInteger(s.member.dues) &&
        (s.member.dues === 0
          ? s.member.dueAt === 0
          : s.member.dues > 0 && s.member.dueAt >= s.years))) &&
    !!s.mastery &&
    typeof s.mastery === 'object' &&
    !Array.isArray(s.mastery) &&
    Object.entries(s.mastery).every(
      ([id, level]) => sect(id) && Number.isInteger(level) && level >= 0 && level <= MAX_MASTERY,
    ) &&
    (s.activity === null ||
      (!!s.activity &&
        number(s.activity.remaining) &&
        (s.activity.remaining > 0 ||
          (!!s.member?.dues &&
            s.member.dueAt <= s.years + 1e-9 &&
            s.activity.remaining >= -1e-9)) &&
        number(s.activity.total) &&
        s.activity.remaining <= s.activity.total &&
        (s.activity.kind === 'study'
          ? s.activity.sect === s.member?.id && (s.mastery[s.activity.sect!] || 0) < MAX_MASTERY
          : Object.hasOwn(TOWN_JOBS, s.activity.kind) && s.activity.sect === null))) &&
    Array.isArray(s.events) &&
    s.events.length <= 6 &&
    s.events.every((e) => typeof e === 'string' && e.length <= 160)
  );
}
