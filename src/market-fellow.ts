import { FINAL_TRIAL_STAGE, REALMS } from './data.ts';
import { recordChronicle } from './chronicle.ts';
import { realmInfo, type SaveData } from './progress.ts';
import type { MarketCultivator } from './sect-market-data.ts';
import {
  MARKET_FELLOW_SETTINGS,
  type MarketFellowChoice,
  type MarketFellowState,
} from './market-fellow-data.ts';
import { marketFellowLife as life, marketFellowEndedAt as endedAt } from './market-fellow-life.ts';

export interface MarketFellowView {
  title: string;
  name: string;
  phase: string;
  text: string[];
  quote: string;
  actions: Array<{ id: MarketFellowChoice | 'read'; label: string }>;
  knownMemory: string;
  hint: string | null;
  hintKind: 'trade' | 'trail' | null;
  alive: boolean;
  complete: boolean;
}

function available(save: SaveData) {
  return !!save.mortal.population && !!save.mortal.sectMarket && save.cultivation > 0;
}
function canAct(save: SaveData) {
  return (
    available(save) &&
    Number.isFinite(save.age) &&
    save.age >= 15 &&
    save.age + MARKET_FELLOW_SETTINGS.reunionYears > save.age &&
    !save.journeyEnded &&
    !save.pendingReincarnation &&
    !save.mortal.marketSocial?.ambush
  );
}

// 与每次入场换批的十五位来客分开。后继按绝对年岁定位，不为长闭关逐代模拟。
export function marketFellowCharacter(save: SaveData): MarketCultivator | null {
  if (!available(save)) return null;
  const story = save.mortal.marketFellow;
  const alive = !story || save.age < endedAt(story);
  let generation = alive
    ? 0
    : 1 + Math.floor((save.age - endedAt(story)) / MARKET_FELLOW_SETTINGS.successorYears);
  if (!alive && story) {
    const end = endedAt(story);
    const period = MARKET_FELLOW_SETTINGS.successorYears;
    // 用绝对节点修正小数年岁相减的误差，换代瞬间不能仍指向上一位后人。
    if (save.age < end + (generation - 1) * period) generation--;
    else if (save.age >= end + generation * period) generation++;
  }
  const { goldenAt, soulAt } = story ? life(story) : { goldenAt: null, soulAt: null };
  const realmIndex = !alive
    ? 0
    : soulAt !== null && save.age >= soulAt
      ? 3
      : goldenAt !== null && save.age >= goldenAt
        ? 2
        : 1;
  return {
    id: 'market-fellow',
    x: 930,
    y: 1030,
    name: alive ? '沈怀朴' : '沈氏后人',
    role: alive ? '守炉丹修' : '药册传人',
    path: 'dual',
    generation,
    realmIndex,
    realm: REALMS[realmIndex],
    greeting: alive
      ? '药材有生熟，话也有来路。坐一坐，喝杯热茶再往前走。'
      : '您当年的故人已不在了。炉边留着他的药册，旧事是传下来才知道的。',
  };
}

function knownMemory(story: MarketFellowState | undefined, alive: boolean) {
  if (!story) return '';
  const parts = [`你在${story.metAt.toFixed(1)}岁时，于坊市炉边结识了沈怀朴。`];
  if (story.reunionAt !== null)
    parts.push(
      story.reunionAt < endedAt(story)
        ? `${story.reunionAt.toFixed(1)}岁再逢故人，听他谈起安炉与访药的取舍。`
        : `${story.reunionAt.toFixed(1)}岁归来时，只见到守着旧药册的沈氏后人。`,
    );
  if (story.choice)
    parts.push(
      `${story.chosenAt!.toFixed(1)}岁，你${story.chosenAt! < endedAt(story) ? '劝他' : '建议沈氏后人延续旧愿，'}${story.choice === 'stay' ? '留坊安炉' : '外出访药'}。`,
    );
  if (!alive) parts.push(`沈怀朴已在你${endedAt(story).toFixed(1)}岁那年寿尽，此刻说话的是后人。`);
  if (story.completedAt !== null)
    parts.push(`${story.completedAt.toFixed(1)}岁，你读过了这段选择的后续。`);
  return parts.join('');
}

function outcome(story: MarketFellowState, alive: boolean, realm: string, readable: boolean) {
  const chosenAlive = story.chosenAt! < endedAt(story);
  const interrupted = chosenAlive && life(story).goldenAt === null;
  const stay = story.choice === 'stay';
  const experience = stay
    ? '一批重贴封签的药曾送到炉前。他们没有只闻瓶外药香，而是当面开瓶、核对原料和交货凭据，才拦下混进真药的泥丸。'
    : '药路上曾有人把临时改道说成捷径。他们先在公开渡口核对接应者和退路，发现约定之外的埋伏，便放弃那一炉便宜药。';
  const result = interrupted
    ? `沈怀朴未及圆愿，便在你${endedAt(story).toFixed(1)}岁那年寿尽。旧信里只留下刚开始整理的几页笔记，没有那场未能走成的十年之约。后人循着你当年${stay ? '留坊安炉' : '外出访药'}的建议，将未尽的事接了下去，药册上终于添了新的见闻。`
    : chosenAlive
      ? alive
        ? stay
          ? '沈怀朴留在坊市，替往来丹修验药，把认得的药性一页页记下。炉旁渐渐多了几位肯认真学的人。他翻开新写的药册，说：“留下来，也遇得见许多远方。”'
          : '沈怀朴从外地归来，袍角添了补丁，药册却厚了许多。他找到过好药，也空手走过几段山路：“这一趟最值钱的，是知道哪条路该回头。”'
        : stay
          ? '后人取出沈怀朴留下的药册。听从你当年的建议后，他守炉验药，把辨认药材和交货凭据的办法传给后来人。如今炉火仍在，书页间还压着当年的封签。'
          : '后人展平沈怀朴寄回的路书。听从你当年的建议后，他外出访药，将沿途渡口、接应人和退路逐一记下。人已经不在，走过的路仍能提醒后来者。'
      : stay
        ? '后人按你重访时的建议，整理旧炉与药册，开了一处当面验药的小摊。旧页里的疏漏用新见闻补齐，沈怀朴未决的心愿，在后来人手里有了归处。'
        : '后人按你重访时的建议，带着旧药册访过几处药山，将新见闻寄回坊市。沈怀朴留下的空白，在后来人的脚步里渐渐有了答案。';
  const progress = alive
    ? !readable
      ? '岁月又在药册上添了新页。再说起初逢时的疑问，他仍肯把不懂的地方留白，慢慢去问。'
      : realm === '元婴'
        ? '多年访药与修持之后，他已修至元婴。再说起初逢时的疑问，仍肯把不懂的地方留白，慢慢去问。'
        : '十年修持与亲历，终于让他结成金丹。你们各自走过一段路，如今又在炉边相逢。'
    : '';
  return {
    text: [result, ...(progress ? [progress] : []), experience],
    hint: stay
      ? '沈氏药册：封签与香气只能作线索；当面核对实物、原料和交货凭据，再决定是否付钱。'
      : '沈氏路书：私下邀约先核对接应人、约定处与退路；临时改道或催你独行时，先停一步。',
  };
}

export function marketFellowView(save: SaveData): MarketFellowView | null {
  const npc = marketFellowCharacter(save);
  if (!npc) return null;
  const story = save.mortal.marketFellow;
  const alive = npc.generation === 0;
  const base: MarketFellowView = {
    title: '炉边故人',
    name: npc.name,
    phase: '炉边初识',
    text: [],
    quote: npc.greeting,
    actions: [],
    knownMemory: knownMemory(story, alive),
    hint: null,
    hintKind: null,
    alive,
    complete: story?.completedAt != null,
  };
  if (!story || save.age < story.metAt + MARKET_FELLOW_SETTINGS.reunionYears)
    return {
      ...base,
      text: [
        '沈怀朴将一本旧药册从炉边挪开，给你腾了个落座的地方。他在坊市替人看药，闲下来也惦记山外的草木。你们说起各自走过的路，记住了彼此的名字。',
        '他正攒着几页未辨清的药性，想再看几年，再定往后是留坊安炉，还是外出访药。此后若顺路回来，炉边仍有一处落脚地。',
      ],
    };
  if (story.choice === null)
    return {
      ...base,
      phase: alive ? '一炉两路' : '旧愿待续',
      text: alive
        ? [
            '沈怀朴认出了你，取来那本旧药册。几年的观察已添了许多新页，他却还拿不定主意：留在坊市，能替更多来客验药；外出访药，也许能辨清册中那些空白。',
            '“各有各的好，也各有要舍下的。”他把茶续上，想听听你的意思。',
          ]
        : [
            `炉边坐着的是沈氏后人。沈怀朴已在你${endedAt(story).toFixed(1)}岁那年寿尽，旧药册却还存着。对方知道你曾来过，这些旧事是药册和家中传言留下的，并非亲历。`,
            '药册末页仍记着安炉与访药两种心愿。后人准备接着做一点事，想请你替后来人选一条起步的路。',
          ],
      actions:
        story.reunionAt === null
          ? []
          : [
              { id: 'stay', label: alive ? '劝他留坊安炉' : '建议后人留坊安炉' },
              { id: 'travel', label: alive ? '劝他外出访药' : '建议后人外出访药' },
            ],
    };
  if (save.age < story.chosenAt! + MARKET_FELLOW_SETTINGS.outcomeYears)
    return {
      ...base,
      phase: '山河待回音',
      text: [
        story.chosenAt! < endedAt(story)
          ? alive
            ? story.choice === 'stay'
              ? '沈怀朴已经定下留坊的打算，开始整理旧炉和验药笔记。这些事还须慢慢做，你再来时，他仍会请你坐一坐。'
              : '沈怀朴已定下访药的打算，正备齐行囊、核对药路，短暂回坊也会在炉边歇脚。一程山河尚未走完，待往后再听他的见闻。'
            : '沈怀朴未及圆愿便已寿尽，后人正在整理他留下的几页笔记，并接着完成未尽之事。页页旧事需要辨明，下一次相逢再将整理出的见闻说给你听。'
          : '后人已照你的建议接续旧愿。安炉与访药都须亲历年月，待药册添上新页，再向你讲述这一程。',
      ],
    };
  const result = outcome(
    story,
    alive,
    npc.realm,
    npc.realmIndex <= realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).index,
  );
  return {
    ...base,
    phase: base.complete ? '一炉有归' : alive ? '故人回音' : '旧信待展',
    text: result.text,
    quote: '认识一个人，靠一程程来往；辨一桩交易，也须看当下的凭据。',
    actions: base.complete
      ? []
      : [{ id: 'read', label: alive ? '听完这一程见闻' : '读过旧信与药册' }],
    hint: base.complete ? result.hint : null,
    hintKind: base.complete ? (story.choice === 'stay' ? 'trade' : 'trail') : null,
  };
}

function remember(save: SaveData, detail: string) {
  recordChronicle(save, '炉边故人', detail);
  save.mortal.events.unshift(`${save.age.toFixed(1)} 岁 · ${detail}`.slice(0, 160));
  save.mortal.events.splice(6);
}

// 调用者在独立存档副本上交谈，成功写入后再应用；函数不保存、不推进年岁或结算奖励。
export function meetMarketFellow(save: SaveData) {
  if (!canAct(save)) return false;
  if (!save.mortal.marketFellow) {
    save.mortal.marketFellow = {
      metAt: save.age,
      reunionAt: null,
      choice: null,
      chosenAt: null,
      completedAt: null,
    };
    remember(save, '在坊市炉边结识丹修沈怀朴，听他谈起还未走过的药路。');
    return true;
  }
  const story = save.mortal.marketFellow;
  if (story.reunionAt !== null || save.age < story.metAt + MARKET_FELLOW_SETTINGS.reunionYears)
    return false;
  story.reunionAt = save.age;
  remember(
    save,
    save.age < endedAt(story)
      ? '再逢沈怀朴，他谈起留坊安炉与外出访药的取舍。'
      : '迟归坊市，得知沈怀朴已经寿尽；守着旧药册的后人请你谈谈如何接续旧愿。',
  );
  return true;
}

export function chooseMarketFellow(save: SaveData, choice: string, visit: number) {
  if (!canAct(save) || save.mortal.sectMarket!.visit !== visit) return false;
  const view = marketFellowView(save);
  if (!view?.actions.some((action) => action.id === choice)) return false;
  const story = save.mortal.marketFellow!;
  if (choice === 'read') {
    story.completedAt = save.age;
    remember(
      save,
      `读过${view.alive ? '沈怀朴这一程的见闻' : '沈氏后人留存的旧信与药册'}，记下${story.choice === 'stay' ? '当面验药、核对交货凭据' : '核对接应人与退路，遇临时改道先停步'}的提醒。`,
    );
  } else {
    story.choice = choice as MarketFellowChoice;
    story.chosenAt = save.age;
    remember(
      save,
      `${view.alive ? '劝沈怀朴' : '建议沈氏后人接续旧愿，'}${choice === 'stay' ? '留坊安炉，将验药所得传给来客' : '外出访药，亲自辨清药册中的空白'}。`,
    );
  }
  return true;
}
