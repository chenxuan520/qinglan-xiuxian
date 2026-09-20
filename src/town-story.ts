import { townResidents, type TownPopulation } from './town-population.ts';
import type { SaveData } from './progress.ts';
import { recordChronicle } from './chronicle.ts';

export interface SmithStory {
  metAt: number;
  generation: number;
  help: 'iron' | 'bellows';
  legacy: 'harbor' | 'school' | null;
  completed: boolean;
}

export function validSmithStory(value: unknown): value is SmithStory {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const s = value as SmithStory;
  return (
    Number.isFinite(s.metAt) &&
    s.metAt >= 0 &&
    Number.isSafeInteger(s.generation) &&
    s.generation >= 0 &&
    ['iron', 'bellows'].includes(s.help) &&
    [null, 'harbor', 'school'].includes(s.legacy) &&
    typeof s.completed === 'boolean' &&
    (!s.completed || s.legacy !== null)
  );
}

export function smithAt(population: TownPopulation, age: number) {
  return townResidents(population, age).find((npc) => npc.id === 'smith')!;
}

export function smithStoryFits(story: SmithStory, population: TownPopulation, age: number) {
  const generation = smithAt(population, age).generation;
  return (
    story.metAt >= population.since &&
    story.metAt <= age &&
    smithAt(population, story.metAt).generation === story.generation &&
    (!story.legacy || generation > story.generation) &&
    (!story.completed || generation >= story.generation + 2)
  );
}

export function smithStoryView(population: TownPopulation, age: number, story?: SmithStory) {
  const npc = smithAt(population, age);
  if (!story)
    return {
      chapter: 1,
      title: '一 · 炉边初逢',
      text: `${npc.name}守着一口裂了沿的渡船旧钟。山洪冲坏了钟，雾天过河的人便没了信号。他说：“替仙家打剑值钱，可这口钟，总得有人修。”炉旁还摆着一双做给小徒弟的新木屐。`,
      quote: '道友若不赶路，帮我添两块铁；没有也无妨，坐下来拉会儿风箱，陪我说说山外的事。',
      actions: ['iron', 'bellows'],
    };
  const first = smithAt(population, story.metAt);
  const gap = npc.generation - story.generation;
  if (gap === 0)
    return {
      chapter: 1,
      title: '炉火正暖',
      text:
        story.help === 'iron'
          ? `${first.name}把你留下的两枚玄铁打进了钟沿。小徒弟踮脚摸了摸新钟：“等我接了这间铺子，也认得您。”`
          : `你陪${first.name}拉了半晌风箱，听他说起小徒弟第一次打坏锄头的事。临别时，他把你的来访记进了炉边旧账。`,
      quote: '钟修好了。下回从山里回来，记得进来坐坐，我给你留一碗热茶。',
      actions: [],
    };
  const legacy = story.legacy === 'school' ? '学堂' : '渡口';
  if (!story.legacy)
    return {
      chapter: 2,
      title: '二 · 旧账来信',
      text: `${gap === 1 ? `如今掌锤的是${npc.name}，正是当年炉边的小徒弟。` : `${npc.name}从传下来的旧账里找出一封信。与你相识的铁匠和接班的徒弟，都已成为前人的名字。`}“${first.name}临终还说，若那位修士回来，就把这封信交给他。”纸上只有几行：渡口已有新钟，旧钟舍不得熔，请故人替它寻个去处。`,
      quote:
        story.help === 'iron'
          ? '钟沿里还嵌着您当年给的玄铁。那些雾天平安归家的人，多半不知道您的名字。'
          : '旧账写着，您那天没有论道，只陪他拉风箱、聊家常。他说，仙人也肯听凡人的琐事。',
      actions: ['harbor', 'school'],
    };
  if (gap < 2)
    return {
      chapter: 2,
      title: '一口钟的去处',
      text:
        story.legacy === 'school'
          ? '旧钟挂到了学堂檐下。清晨一响，孩子们便抱着书跑进院子；铁匠说，这声音像给铺子添了许多小徒弟。'
          : '旧钟留在了渡口，专为雾夜归船报平安。铁匠送钟回来时，袖上还沾着河边的水汽。',
      quote: '师父留下的东西还有人用，便不算白忙一场。您下次来，再听听它。',
      actions: [],
    };
  if (!story.completed)
    return {
      chapter: 3,
      title: '三 · 钟声犹在',
      text: `${gap === 2 ? '又一代人接过了铁锤。' : '几番人事更迭，炉边的账册已经换了装订。'}${npc.name}从柜底取出一枚小小的旧铜铃：“${first.name}做的。后来的师傅们说，若那位故人再来，便交给他。”${story.legacy === 'school' ? '窗外有人教孩子念书，放学的钟声和你记得的一样。' : '河上有晚归的船，渡口传来一声钟响，岸边的人终于放下了灯。'}`,
      quote:
        '我们留不住人，好在手艺和念想还能往下传。这枚铃不是什么仙家宝物，带在身边，算是记得回家的路。',
      actions: ['remember'],
    };
  return {
    chapter: 3,
    title: '炉火未凉 · 故事已记',
    text: `${first.name}已不在人间。你收下了炉火旧铃，${legacy}仍能听到那口旧钟。记忆里的那双小木屐也旧了，炉火却仍在新人的掌心里亮着。`,
    quote: '前人说过，您是这间铺子的老朋友。山上若清冷，随时回来坐坐。',
    actions: [],
  };
}

// 只在玩家明确选择时改存档；看对白、刷新和 AI 回复均不能领取奖励。
export function chooseSmithStory(save: SaveData, choice: string) {
  const population = save.mortal.population;
  if (!population) return false;
  const story = save.mortal.smithStory;
  const view = smithStoryView(population, save.age, story);
  if (!view.actions.includes(choice)) return false;
  let memory: string;
  if (choice === 'iron' || choice === 'bellows') {
    if (choice === 'iron' && save.iron < 2) return false;
    if (choice === 'iron') save.iron -= 2;
    const npc = smithAt(population, save.age);
    save.mortal.smithStory = {
      metAt: save.age,
      generation: npc.generation,
      help: choice,
      legacy: null,
      completed: false,
    };
    memory = `与铁匠${npc.name}修好渡船旧钟，${choice === 'iron' ? '留下两枚玄铁' : '炉边拉风箱，听了一场家常'}。`;
  } else if (story && (choice === 'harbor' || choice === 'school')) {
    story.legacy = choice;
    memory = `故人来信，托付旧钟。你让它${choice === 'harbor' ? '留在渡口，为归船报平安' : '送去学堂，伴孩子们读书'}。`;
  } else if (story && choice === 'remember') {
    story.completed = true;
    const iron = story.help === 'iron' ? 6 : 4;
    save.iron += iron;
    memory = `收下「炉火旧铃」与 ${iron} 枚玄铁。炉火未凉，故人的手艺已传给后人。`;
  } else return false;
  save.mortal.events.unshift(`${save.age.toFixed(1)} 岁 · ${memory}`);
  save.mortal.events.splice(6);
  recordChronicle(save, '青岚旧事', memory, choice === 'remember' ? 'story' : undefined);
  return true;
}

export function smithStoryMemory(
  population: TownPopulation,
  age: number,
  story: SmithStory | undefined,
  npcId: string,
) {
  if (!story)
    return npcId === 'smith'
      ? `你正在修渡船旧钟，初次见面：${smithStoryView(population, age).text} 玩家尚未选择帮忙，不能声称已经收到玄铁或得到帮助。`
      : '';
  const first = smithAt(population, story.metAt);
  if (npcId === 'smith') {
    const view = smithStoryView(population, age, story);
    return `铁匠铺往事《炉火未凉》：修士在${story.metAt.toFixed(1)}岁时结识${first.name}，${story.help === 'iron' ? '捐了两枚玄铁' : '帮忙拉风箱并听他聊家常'}，一起修好渡船旧钟。${view.text} 当前可说：${view.quote} ${story.completed ? '旧铃已经交给修士，不能再次赠送。' : '后续选择与纪念物只能通过故事按钮确认，不可在闲谈中宣称已完成。'}`;
  }
  if (story.legacy && ['tea', 'fisher', 'scholar'].includes(npcId))
    return `镇上流传：修士曾帮铁匠${first.name}修钟。那口旧钟如今${story.legacy === 'school' ? '在学堂，孩子们听钟上学' : '在渡口，为雾夜归船报平安'}。这是听来的旧事，并非你亲历。`;
  return '';
}

export function smithStoryLine(
  population: TownPopulation,
  age: number,
  story: SmithStory | undefined,
  npcId: string,
) {
  if (npcId === 'smith') return smithStoryView(population, age, story).quote;
  if (story?.legacy && ['tea', 'fisher', 'scholar'].includes(npcId))
    return story.legacy === 'school'
      ? '学堂那口旧钟，据说是一位修士替故人留下的。如今孩子们听着它念书，倒比挂在仙山上热闹。'
      : '渡口那口旧钟，据说是一位修士替故人留下的。雾夜里一响，岸上的人便知道船回来了。';
  return '';
}
