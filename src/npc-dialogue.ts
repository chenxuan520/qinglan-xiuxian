import { type TownPopulation } from './town-population.ts';
import { type TownNpc } from './town.ts';
import type { SmithStory } from './town-story.ts';

export const NPC_DEFAULT_LINES = {
  herbs: '山中草药正当时，可愿帮我采来一篓？',
  tea: '行路辛苦，来听一段茶馆闲谈吧。',
  escort: '镖队正缺人手，愿意护送这一趟吗？',
  market: '灵材有价，买卖随缘。看看可有用得上的？',
  smith: '好铁还得慢火锻，做人做事也是一样。',
  scholar: '书里山河无数，终究还得亲自走一遭。',
  fisher: '今晨水静，鱼倒是不少。道友有空也看看河上风光。',
  farmer: '这一季稻穗饱满，家里又能过个安稳年了。',
  tailor: '衣裳合身，走路也轻快。针脚细些，才耐得住岁月。',
};
const VILLAGER_LINES = [
  '今早邻家的炊烟起得早，说是有远行的人回来了。道友也常回家看看吧。',
  '我去河边替家里捎点东西。日子忙些，心里倒也踏实。',
  '今年雨水好，盼着秋收能多攒些粮。山上的日子，想来也有山上的难处。',
  '集上新到的布料好看，我正挑一块带回去。人间的小欢喜，也不过这些。',
];
export function npcDefaultLine(id: TownNpc['id']) {
  return id.startsWith('villager-')
    ? VILLAGER_LINES[Number(id.slice('villager-'.length)) % VILLAGER_LINES.length]
    : NPC_DEFAULT_LINES[id as keyof typeof NPC_DEFAULT_LINES];
}
export interface NpcMessage {
  role: 'user' | 'assistant';
  content: string;
}
export interface NpcDialogueRequest {
  population: TownPopulation;
  age: number;
  npcId: TownNpc['id'];
  realm: string;
  message: string;
  history: NpcMessage[];
  townRevision?: number;
  smithStory?: SmithStory;
}
