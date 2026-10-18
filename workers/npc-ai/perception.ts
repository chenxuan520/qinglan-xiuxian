import { marketReplyRevealsRealm, type NpcDialogueRequest } from '../../src/npc-dialogue.ts';
import { REALMS } from '../../src/data.ts';
import {
  isMarketCultivatorId,
  marketCharacters,
  marketLocalReply,
} from '../../src/sect-market-data.ts';

function reportedFacts(input: NpcDialogueRequest) {
  return [input.message, ...input.history.filter((m) => m.role === 'user').map((m) => m.content)]
    .flatMap((message) => message.split(/[。！？；，]/))
    .filter((line) => !/[?？]|吗|是否|是不是|怎么|如何/.test(line))
    .flatMap((line) => {
      const fact = line
        .trim()
        .match(
          /^我(?:如今|已经|已|昨日|刚|前日|近来|最近)?(?:成功)?(突破|进阶|修至|练成)(?:了)?(.*)$/,
        );
      if (fact) return [{ action: fact[1], object: fact[2], text: line }];
      const realm = line
        .trim()
        .match(/^我(?:如今|现在|已经|已)?(?:的境界(?:是|为)|(?:已)?是)(.*)$/);
      return realm && REALMS.some((name) => realm[1].includes(name))
        ? [{ action: '是', object: realm[1], text: line }]
        : [];
    });
}

function unsupportedJudgment(input: NpcDialogueRequest, reply: string, unreadableRealm: boolean) {
  const facts = reportedFacts(input);
  let player = /我/.test(input.message) && /修为|境界|精进|进境|突破|气息/.test(input.message);
  for (const piece of reply.split(/[。！？；，]/)) {
    const line = piece.trim();
    const other = /你|您|前辈|小友|道友|孩子|这(?:身|气息|灵光)|眉宇/.test(line);
    const subject = line.replace(/^(?:这位)?(?:前辈|道友|小友|孩子)[：:\s]*/, '');
    if (
      /^(?:我|在下|晚辈|老朽|贫道|小可)/.test(subject) &&
      !/你|您|前辈|小友|道友|孩子/.test(subject)
    )
      player = false;
    else if (other) player = true;
    if (!player) continue;
    const attributed =
      /听(?:你|您|前辈|小友|道友|孩子)(?:说|提)|(?:你|您|前辈|小友|道友|孩子)(?:说|提到|自述|告诉)/.test(
        line,
      );
    const inference = /似乎|似是|似在|怕是|想必|看来|可见|看得出|看出来/.test(line);
    const quoted =
      attributed &&
      !inference &&
      facts.some(
        (fact) =>
          line.includes(fact.action) &&
          ['突破', '进阶', '修至', '练成']
            .filter((action) => line.includes(action))
            .every((action) => action === fact.action) &&
          REALMS.filter((realm) => line.includes(realm)).every((realm) =>
            fact.text.includes(realm),
          ) &&
          (fact.action !== '练成' || (!!fact.object && line.includes(fact.object))),
      );
    if (quoted) continue;
    if (attributed && /突破|进阶|修至|练成/.test(line)) return true;
    // 祝愿、假设、建议不是对当前修为的断言。
    if (
      /^(?:愿|祝|盼|希望|只盼|还望|但愿|若|倘若|等|待)|^(?:你|您|前辈|小友|道友|孩子)(?:若|要|应当|应该|可以|可先|须|不妨)/.test(
        line,
      )
    )
      continue;
    const cultivation = /修为|境界|精进|进境|突破|心法|功法|根基|气息|灵光|灵力|法力/.test(line);
    const judgment =
      inference ||
      /未见明显|明显精进|比(?:往日|从前|之前|上次|上回|先前)|又有.{0,8}(?:精进|长进|进境)|(?:更|更加).{0,8}(?:深厚|凝实|凝练|精进)|(?:已|已经|刚|才).{0,8}(?:突破|进阶|修至|练成)|(?:修为|境界|气息).{0,8}(?:大有|大增|大涨|提升|长进|凝实|凝练)|练成了|突破了|已至|已达|已是/.test(
        line,
      );
    if (
      (cultivation && judgment) ||
      (unreadableRealm && REALMS.some((realm) => line.includes(realm)))
    )
      return true;
  }
  return false;
}

// 按分句检查是谁的修为、依据从何而来；一处自述不能豁免其余猜测。
export function guardDialogueReply(input: NpcDialogueRequest, reply: string) {
  if (input.mode === 'tea-story') return reply;
  const perceptionQuestion =
    /(?:看(?:得|不)?出|看透|看穿|察觉|判断|瞧(?:得|不)?出)/.test(input.message) &&
    /你.{0,4}(?:看|瞧|察|判)|(?:看|瞧|察觉|判断).{0,6}(?:我|本人|在下)/.test(input.message) &&
    /我|本人|在下/.test(input.message) &&
    /修为|境界|精进|进境|突破|心法|功法|气息|根基/.test(input.message);
  if (isMarketCultivatorId(input.npcId)) {
    const npc = marketCharacters(input.population, input.marketVisit!).find(
      (n) => n.id === input.npcId,
    )!;
    const playerRealm =
      input.realm === '渡劫'
        ? REALMS.indexOf('大乘')
        : REALMS.findIndex((realm) => input.realm.startsWith(realm));
    const senior = npc.realmIndex < playerRealm;
    if (marketReplyRevealsRealm(input, reply)) return marketLocalReply(npc, '境界', playerRealm);
    // 观察能力由游戏设定决定，明确问能否看透时不让模型自行猜答案。
    if (perceptionQuestion) return marketLocalReply(npc, '你看得出我的精进吗？', playerRealm);
    if (!input.history.length && input.message === '有位修士来到你跟前，请以自己的身份打个招呼。') {
      const address = senior ? '前辈' : npc.realmIndex === playerRealm ? '道友' : '小友';
      return `${address}请了。我是${npc.role}，${npc.roaming ? '今日来逛市访友，正看看沿街的器物。' : '今日在这里设摊，你若想聊聊，便坐下来歇一歇。'}`;
    }
    const narration = reply.startsWith(npc.name) && /打量|思量|心中|暗自|眯眼/.test(reply);
    if (unsupportedJudgment(input, reply, senior) || narration)
      return marketLocalReply(npc, '你看得出我的精进吗？', playerRealm);
    return senior ? reply.replace(/^(这位)?道友/, '$1前辈') : reply;
  }
  if (!perceptionQuestion && !unsupportedJudgment(input, reply, true)) return reply;
  return input.npcId === 'father' || input.npcId === 'mother'
    ? '孩子，修行上的事我不懂。你愿意说，我就听；只盼你平安。'
    : '道友，仙家的修为我看不透。你愿意说说近况，我便听一听。';
}
