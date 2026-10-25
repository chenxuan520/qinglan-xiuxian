import type { SaveData } from './progress.ts';
import {
  HUMAN_STORIES,
  HUMAN_STORY_IDS,
  humanStoryView,
  unreadHumanLetterKeys,
  type HumanStoryId,
} from './human-stories.ts';
import { smithStoryView } from './town-story.ts';
import { TOWN_NPCS } from './town.ts';

export function humanRevisitText(save: SaveData, id: HumanStoryId) {
  if (!save.mortal.humanStories?.[id]) return '';
  const view = humanStoryView(save, id);
  if (!view || view.keepsake || !view.actions.length) return '';
  const place = TOWN_NPCS.find((npc) => npc.id === HUMAN_STORIES[id].npcId)!.place;
  return `可往「${place}」处再访${view.name}，此番返乡可再叙旧。`;
}

// 只提示已相识的旧事；家书须亲自发现，不提前告知家人的寿终。
export function humanRecollection(save: SaveData) {
  const letters = unreadHumanLetterKeys(save).length;
  if (letters) return `人间缘簿有${letters}封旧信待展读。`;
  for (const id of HUMAN_STORY_IDS) {
    const text = humanRevisitText(save, id);
    if (text) return text;
  }
  if (
    save.mortal.smithStory &&
    save.mortal.population &&
    smithStoryView(save.mortal.population, save.age, save.mortal.smithStory).actions.length
  )
    return '炉火未凉，街头匠人处有一段已相识的旧事可续。';
  return '';
}
