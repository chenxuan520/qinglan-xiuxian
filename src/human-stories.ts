import { recordChronicle } from './chronicle.ts';
import type { SaveData } from './progress.ts';
import { townResidents, type TownPopulation } from './town-population.ts';

export const HUMAN_STORIES = {
  companion: {
    npcId: 'tailor',
    title: '檐下春灯',
    years: 2,
    meet: '借檐避雨 · 说些家常',
    opening:
      '一场急雨把你留在布铺檐下。掌店的裁缝已经独自打理这间铺子多年，见你衣袖被山石划破，便搬来一张矮凳，一边补衣，一边问起山外的天气。没有问仙家能活多久，只问你赶了这么远的路，晚饭可曾吃过。',
    quote: '先坐一坐吧。雨总有停的时候，衣裳也不能一直破着。',
    waiting:
      '布铺檐下多了一张你熟悉的矮凳。闲时说起米价与新布，听的人总比说的人耐心；有时一句话也没有，两个人各做各的事，竟也能坐到天黑。',
    turning:
      '又逢雨季。对方收起针线，第一次认真问起你的去处：“我没有灵根，大约走不到你要去的地方。可若你愿意，人间这几十年，我们能不能一道过？”灯下没有誓言，只有两碗还热着的饭。',
    choices: [
      { id: 'bond', label: '愿结道侣 · 共度人间岁月' },
      { id: 'friendship', label: '珍重此缘 · 只作一生知己' },
    ],
  },
  friend: {
    npcId: 'fisher',
    title: '江上故人',
    years: 3,
    meet: '坐上船头 · 共饮一杯',
    opening:
      '渔夫在船头摆了两只粗瓷杯，见你经过，便把另一只推过来。酒是自酿的，喝起来有些涩。你说山上风雪，他说昨夜哪处鱼多，说到兴起，谁也没再提仙凡二字。',
    quote: '会飞也好，会撑船也好，歇脚的时候，不都是坐着么？',
    waiting:
      '那只缺了口的酒盏一直放在船篷里。你再来时，渔夫不问境界，只把杯子洗一洗，问上一句：“这一趟，走得可还顺当？”',
    turning:
      '渔夫年轻时想顺流看看大江，后来有了家，便一直守着这段河。如今孩子能掌舵了，他又提起旧愿。走或留下，都舍不得；他难得问你，若换作是你，会如何选。',
    choices: [
      { id: 'river', label: '劝他远行 · 去看一回大江' },
      { id: 'harbor', label: '陪他守渡 · 此处也有好山水' },
    ],
  },
  student: {
    npcId: 'scholar',
    title: '纸上远山',
    years: 8,
    meet: '停步答疑 · 讲讲山外',
    opening:
      '一个十八九岁的游学少年摊着旧地图，山川画得密密麻麻，却有许多地方只是听来的名字。他认出你的行装，追着问仙山多高，又小声补了一句：“像我这样没有灵根的人，也能去看看么？”',
    quote: '先生，我不求飞得多高，只是不想一辈子都不知道，山那边是什么。',
    waiting:
      '少年开始把听来的故事和亲眼见过的地方分开记录。他也会怯，也会为盘缠发愁，书页却一页页厚起来。你偶尔回来，便听他认真讲起最近走过的一段小路。',
    turning:
      '昔日的少年已经长大，带着几册亲笔的山川笔记来见你。有人请他留下教书，也有人约他去更远的地方。他笑说当年那个问题，到如今仍未问完，想再听听你的意思。',
    choices: [
      { id: 'teach', label: '劝他授业 · 把远山讲给后来人' },
      { id: 'travel', label: '赠言送行 · 亲眼去看这天地' },
    ],
  },
};
export type HumanStoryId = keyof typeof HUMAN_STORIES;
export interface HumanStory {
  metAt: number;
  endsAt: number;
  choice: string | null;
  chosenAt: number | null;
  visitedAt: number | null;
  ended: boolean;
  read: boolean;
}
export type HumanStories = Partial<Record<HumanStoryId, HumanStory>>;
export const HUMAN_STORY_IDS = Object.keys(HUMAN_STORIES) as HumanStoryId[];
export function isHumanStoryId(id: string): id is HumanStoryId {
  return Object.hasOwn(HUMAN_STORIES, id);
}
function personAt(population: TownPopulation, age: number, id: HumanStoryId) {
  return townResidents(population, age).find((npc) => npc.id === HUMAN_STORIES[id].npcId)!;
}
export function validHumanStories(
  value: unknown,
  population: TownPopulation | undefined,
  age: number,
): value is HumanStories {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !population) return false;
  return Object.entries(value).every(([id, story]) => {
    if (!isHumanStoryId(id) || !story || typeof story !== 'object' || Array.isArray(story))
      return false;
    const s = story as HumanStory;
    if (
      !Number.isFinite(s.metAt) ||
      s.metAt < population.since ||
      s.metAt > age ||
      (id === 'companion' && s.metAt < 18)
    )
      return false;
    const first = personAt(population, s.metAt, id);
    const config = HUMAN_STORIES[id];
    return (
      s.endsAt === first.leavesAt &&
      (s.choice === null
        ? s.chosenAt === null
        : config.choices.some((c) => c.id === s.choice) &&
          typeof s.chosenAt === 'number' &&
          Number.isFinite(s.chosenAt) &&
          s.chosenAt >= s.metAt + config.years &&
          s.chosenAt <= age &&
          s.chosenAt < s.endsAt) &&
      (s.visitedAt === null ||
        (s.chosenAt !== null &&
          typeof s.visitedAt === 'number' &&
          Number.isFinite(s.visitedAt) &&
          s.visitedAt >= s.chosenAt + 5 &&
          s.visitedAt <= age &&
          s.visitedAt < s.endsAt)) &&
      typeof s.ended === 'boolean' &&
      (!s.ended || age >= s.endsAt) &&
      typeof s.read === 'boolean' &&
      (!s.read || s.ended)
    );
  });
}

function keepsake(id: HumanStoryId, story: HumanStory) {
  return id === 'companion'
    ? story.choice === 'bond'
      ? '同心旧结'
      : '青线书签'
    : id === 'friend'
      ? '缺口酒盏'
      : '山河手记';
}
function sharedDays(id: HumanStoryId, story: HumanStory) {
  if (id === 'companion')
    return story.choice === 'bond'
      ? '你们在布铺后的小院点起了一盏灯。你仍会远行，对方也仍有自己的生计；相见时一起吃饭，别离时互道平安。仙途之外，你终于有了一处可以说“回来”的地方。'
      : '对方听完，安静地点了点头，仍把热饭推到你面前。此后不谈婚约，见面照样聊家常；有些情意，不必换一个称呼才能长久。';
  if (id === 'friend')
    return story.choice === 'river'
      ? '渔夫终于沿着大江走了一趟。归来时晒黑了许多，说江上风浪比想的凶，日出也比想的好看。那只酒盏还是旧的，杯里的故事却换了新。'
      : '他没有离开渡口，倒把船修得更结实了些。每天送人过河，看熟客带着孩子来，再看孩子长成大人。他说，原来守着一条河，也能见到这么多远方。';
  return story.choice === 'teach'
    ? '他在镇上开了间小小学馆。课上不只教字，也教孩子认路、看星、分清亲见与传闻。窗边挂着当年的旧地图，空白处正被一只只小手慢慢填满。'
    : '他背起书箱走了许多地方，也曾病过、困顿过。每次回来，先讲路上遇见的人，再讲山有多高。你发现，那个只会问你的少年，已能向你讲述另一种天地。';
}
function letter(id: HumanStoryId, story: HumanStory) {
  if (id === 'companion')
    return [
      story.choice === 'bond'
        ? '与你结缘那日，我便知道，我们能走在一起的路没有你的一生那么长。可这些年，我开过铺，种过花，也曾等到你推门回来。我的一生，并不只有等待。'
        : story.choice === 'friendship'
          ? '你肯把我当作知己，听我说那些针头线脑的小事，我一直记着。世人说仙凡有别，我却觉得，能一起好好吃顿饭的人，便不算隔得太远。'
          : '不知这封信到你手中时，山上的雪化了没有。后来也有许多人来檐下躲雨，我偶尔会想起，曾有一个远行的人，肯坐下来听我说一下午闲话。',
      story.visitedAt !== null
        ? '那年灯下，你笨手笨脚地替我穿针，弄了半晌还说线太细。我笑了许久。如今想来，我最愿意记住的，正是这样一个无事的晚上。'
        : '去年春天，我把院里的梨树挪到了墙边，给新来的小徒弟留了张桌子。花开时落了一纸白，我原想画给你看，后来觉得，还是等你亲眼来看才好。',
      story.choice === 'bond'
        ? '同心结放在信里了，针脚有些旧，你莫嫌。往后仍去走你的路，看你想看的山河。哪一日遇见好景色，替我多看一眼便是。'
        : '留一枚青线书签给你。仙家的书想来很厚，读倦了也记得歇歇。人间曾有一个人，愿你每一程都平安。',
    ];
  if (id === 'friend')
    return [
      story.choice === 'river'
        ? '那年听你的，往大江走了一回。风浪不小，也没见到什么神仙，却在一个清早看见水天全成了金色。只为那一眼，我就觉得走得值。'
        : story.choice === 'harbor'
          ? '听你的，守着渡口过了一辈子。年轻时总嫌这段河短，后来才知道，每一个渡过去的人，都有自己的远路。我也算送了许多程。'
          : '这些年仍在河上讨生活，遇见过大鱼，也挨过空网。日子有好有坏，倒都实在。船头那顿酒，我一直记着。',
      story.visitedAt !== null
        ? '后来那回共饮，你说山上也有不顺心的事。我本想劝两句，想想还是给你添了酒。如今我倒觉得，朋友有时不必什么都能帮上。'
        : '你不来时，我也常把两只杯子摆着。有过路人就一起喝，没有，便听听河水。别笑，这辈子能多认得几个朋友，已经很好。',
      '缺口那只酒盏留给你。新杯子家里有的是，这只就别扔了。下回见到宽阔的江，替我把杯举一举；不必倒酒，我年轻时舍不得，如今也舍不得。',
    ];
  return [
    story.choice === 'teach'
      ? '先生，学馆已经换过三次屋顶了。第一批孩子如今也有了孩子，有人走出去，有人留下教书。我没有见遍天下，却借他们的来信，看见了许多远方。'
      : story.choice === 'travel'
        ? '先生，当年那张地图上的地方，我走了大半。纸上看着很近，脚下才知有多远。最难忘的倒不是名山，是病中给我一碗粥的陌生人。'
        : '先生，后来我去过几处地方，也做了些平常事。没成为仙人，倒没有觉得这一生白过。当年您肯停步回答，我才敢真的迈出第一步。',
    story.visitedAt !== null
      ? '重逢那日，我终于也能把您没见过的景色讲给您听。那时才觉得，所谓受教，也许不只是跟在前人身后，而是各走一程，再互相说说。'
      : '有一年，一个孩子问我，凡人能不能去看看山外。我把当年您说过的话，照原样讲给了他。说完才发现，自己也到了被人称作先生的年纪。',
    '这册山河手记托后人留给您。写得不算好，却都尽力分清了亲见与传闻。若以后又遇见一个问路的少年，也请您像那年一样，多停一会儿。',
  ];
}

export function humanStoryView(save: SaveData, id: HumanStoryId) {
  const population = save.mortal.population;
  if (!population || (id === 'companion' && save.age < 18)) return null;
  const config = HUMAN_STORIES[id];
  const story = save.mortal.humanStories?.[id];
  const person = personAt(population, story?.metAt ?? save.age, id);
  const base = {
    title: config.title,
    name: person.name,
    letter: [] as string[],
    keepsake: null as string | null,
  };
  if (!story)
    return {
      ...base,
      phase: '初逢',
      text: config.opening,
      quote: config.quote,
      actions: [{ id: 'meet', label: config.meet }],
    };
  if (save.age >= story.endsAt)
    return {
      ...base,
      phase: '旧信犹温',
      keepsake: keepsake(id, story),
      letter: letter(id, story),
      text: `${person.name}已在你${story.endsAt.toFixed(1)}岁那年走完凡人的一生。${id === 'companion' ? '布铺换了新主人，檐下的矮凳却还在。' : id === 'friend' ? '渡口仍有船来往，掌舵的已是后来人。' : '旧地图已被仔细裱好，后来读书的人，仍知道写下它的那个名字。'}一封留给你的信，随一件旧物保存至今。`,
      quote: '信与旧物已收入缘簿。迟归的人，也有来处可寻。',
      actions: story.read ? [] : [{ id: 'read', label: '展信记下 · 珍藏此缘' }],
    };
  if (!story.choice)
    return {
      ...base,
      phase: '渐成相知',
      text: save.age >= story.metAt + config.years ? config.turning : config.waiting,
      quote: '人间的日子，也随着你的历练与闭关一同向前。',
      actions: save.age >= story.metAt + config.years ? config.choices : [],
    };
  return {
    ...base,
    phase: id === 'companion' ? (story.choice === 'bond' ? '此世道侣' : '一生知己') : '各有归处',
    text: sharedDays(id, story),
    quote:
      story.visitedAt !== null
        ? id === 'companion'
          ? '那年灯下共坐的一晚，往后也会有人记得。'
          : id === 'friend'
            ? '那日不谈仙凡，只尽一杯。'
            : '昔日问路的人，已能与你互道山河。'
        : '若从山外回来，记得去见一见故人。',
    actions:
      story.visitedAt === null && save.age >= story.chosenAt! + 5
        ? [
            {
              id: 'visit',
              label:
                id === 'companion'
                  ? '灯下共坐 · 过个寻常夜晚'
                  : id === 'friend'
                    ? '再饮一杯 · 说说这些年'
                    : '听他讲述 · 互道山河',
            },
          ]
        : [],
  };
}

function remember(save: SaveData, id: HumanStoryId, detail: string) {
  recordChronicle(save, HUMAN_STORIES[id].title, detail);
  save.mortal.events.unshift(`${save.age.toFixed(1)} 岁 · ${detail}`);
  save.mortal.events.splice(6);
}
// 只检查三段已结识的旧事；年龄来自既有总年岁，不新增计时器或逐代循环。
export function syncHumanStories(save: SaveData) {
  let changed = false;
  for (const id of HUMAN_STORY_IDS) {
    const story = save.mortal.humanStories?.[id];
    if (!story || story.ended || save.age < story.endsAt || !save.mortal.population) continue;
    story.ended = true;
    const name = personAt(save.mortal.population, story.metAt, id).name;
    remember(
      save,
      id,
      `${name}在你${story.endsAt.toFixed(1)}岁那年辞世，留下一封旧信与「${keepsake(id, story)}」，已收入人间缘簿。`,
    );
    changed = true;
  }
  return changed;
}
export function chooseHumanStory(save: SaveData, id: HumanStoryId, choice: string) {
  if (save.journeyEnded || !isHumanStoryId(id)) return false;
  const view = humanStoryView(save, id);
  if (!view?.actions.some((action) => action.id === choice)) return false;
  const config = HUMAN_STORIES[id];
  if (choice === 'meet') {
    const person = personAt(save.mortal.population!, save.age, id);
    (save.mortal.humanStories ??= {})[id] = {
      metAt: save.age,
      endsAt: person.leavesAt,
      choice: null,
      chosenAt: null,
      visitedAt: null,
      ended: false,
      read: false,
    };
    remember(
      save,
      id,
      `与${person.name}${id === 'companion' ? '在布铺檐下避雨相识' : id === 'friend' ? '在船头共饮，结识一位凡人朋友' : '谈起山外天地，为问路的少年停了步'}。`,
    );
  } else {
    syncHumanStories(save);
    const story = save.mortal.humanStories![id]!;
    if (choice === 'read') {
      story.read = true;
      remember(save, id, `读过${view.name}留下的信，将「${keepsake(id, story)}」珍藏于此世缘簿。`);
    } else if (choice === 'visit') {
      story.visitedAt = save.age;
      remember(
        save,
        id,
        `再访${view.name}，${id === 'companion' ? '灯下共坐，度过一个寻常夜晚' : id === 'friend' ? '共饮一杯，谈起这些年的聚散' : '听昔日少年讲述亲历的山河'}。`,
      );
    } else {
      story.choice = choice;
      story.chosenAt = save.age;
      const label = config.choices.find((action) => action.id === choice)!.label;
      remember(save, id, `${view.name}与你谈起往后，你选择「${label}」。`);
    }
  }
  return true;
}

// 作为实际呈现给玩家的第一句固定对白，也随聊天历史发送；不需改动 AI 服务协议。
export function humanStoryGreeting(save: SaveData, npcId: string) {
  const id = HUMAN_STORY_IDS.find((id) => HUMAN_STORIES[id].npcId === npcId);
  if (!id || !save.mortal.humanStories?.[id]) return '';
  const story = save.mortal.humanStories[id]!;
  const view = humanStoryView(save, id)!;
  if (save.age >= story.endsAt)
    return `我是后来接手这里的人，并非您当年的故人${view.name}。前人留下的信和${view.keepsake}都替您收好了，这些旧事，是传下来才知道的。`;
  const later: Record<string, string> = {
    bond: '后来我们结为道侣，我虽是凡人，也愿与您共度这些年。',
    friendship: '我们说好只作知己，这份情意，我一直珍重。',
    river: '听您的劝，我去看过大江了。风浪很大，可那一回日出，实在值得。',
    harbor: '听您的劝，我留在了渡口。每天送人往来，也见了许多不同的日子。',
    teach: '听您的劝，我留下教书了。如今也有孩子来问我，山外是什么模样。',
    travel: '听您的劝，我带着书箱走了许多地方。这回轮到我，给您讲讲路上的事。',
  };
  return `还记得您${story.metAt.toFixed(1)}岁那年，我们${id === 'companion' ? '在布铺檐下避雨相识' : id === 'friend' ? '在船头共饮' : '谈起山外天地'}。${story.choice ? later[story.choice] : '再见到您，真好。'}`;
}
