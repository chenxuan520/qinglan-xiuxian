import { REALMS, STAGES, pathInfo, spiritRootInfo, treasure } from './data.ts';
import {
  localJourneyAppraisal,
  type JourneyAppraisal,
  type JourneyAppraisalFacts,
} from './journey-appraisal.ts';
import { JOURNEY_APPRAISAL_SETTINGS } from './setting.ts';

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const plain = (value: unknown, min: number, max: number): value is string =>
  typeof value === 'string' &&
  value.length >= min &&
  value.length <= max &&
  /^[\p{Script=Han}\p{Number}，。！？；：、·「」《》“”‘’（）—…]+$/u.test(value);

function fitsFacts(appraisal: JourneyAppraisal, facts: JourneyAppraisalFacts) {
  const text = appraisal.title + appraisal.detail;
  // 成品是人生评语，不向玩家解释摘要、存档缺项或生成过程。
  if (
    /记载|记录|存档|数据|资料|信息|字段|摘要|档案|缘簿|纪事|留白|空白|未载|未录|不详|无从考证/.test(
      text,
    )
  )
    return false;
  if (
    !facts.ties.length &&
    /孑然|孤身|独自|独行|孤独|无人相伴|无人同行|未遇故人|人缘尚缺|(?:未有|没有|不曾|未曾|尚无|暂无|未结|未遇|未见|尚缺|无)[^。！？；]{0,10}(?:牵挂|旧缘|结缘|相逢|相伴|故人|归处|人缘|人间经历)|(?:没有|未有|尚无|暂无)(?:任何|一段|人间)?(?:故事|经历)|(?:牵挂|旧缘|人缘|人间经历|故事)[^。！？；]{0,6}(?:未有|没有|全无|尚缺|缺失|暂无|尚待补全)|(?:故事|经历)[^。！？；]{0,8}(?:补全|补录)/.test(
      text,
    )
  )
    return false;
  const asserted = text.replace(
    /(?:尚未|还未|仍未|未曾|未能|未|不曾|没有|无缘|尚待|待)(?:叩入仙门|证得真仙|修成真仙|证得长生|飞升成仙|成仙|登仙)/g,
    '',
  );
  const has = (id: string) => facts.feats.includes(id);
  const tie = (id: string) => facts.ties.includes(id);
  if (
    facts.stages.length !== STAGES.length &&
    /七境(?:皆|尽|全|已)|(?:踏破|尽破|走遍|通关)七境/.test(text)
  )
    return false;
  if (
    !has('rootless-immortal') &&
    !(facts.root === 'none' && facts.realmIndex === 8) &&
    /凡骨登仙|无灵根.{0,8}(?:成仙|登仙|证得长生|证得真仙)/.test(text)
  )
    return false;
  // 这里只记录当前灵根，不能倒推启程时的资质。
  if (/(?:生来|天生|起初|生而|出生).{0,6}(?:灵根|凡骨|资质)/.test(text)) return false;
  if (!tie('companion-bond') && /道侣|同心旧结|结为伴侣/.test(text)) return false;
  if (!tie('companion-met') && /知己|檐下相逢|春灯相伴/.test(text)) return false;
  if (
    !tie('home-letter-read') &&
    /(?:读过|曾展读|展读过|读罢|读懂|已读|读完).{0,4}家书|家书.{0,4}(?:已读|已展|已阅|读过|读罢|读完)|曾展读故乡家书/.test(
      text,
    )
  )
    return false;
  if (!tie('home-letter-found') && /家书犹存|家书尚待|已得家书|故乡家书仍待|家书在手/.test(text))
    return false;
  if (!tie('home-reunion') && /曾归故里|曾经归乡|曾回故乡|归乡相见/.test(text)) return false;
  if (!has('six-immortals') && /六(?:器|仙|件仙器).{0,6}(?:同御|共鸣|齐鸣|觉醒)/.test(text))
    return false;
  if (
    facts.ending !== 'immortal' &&
    /(?:已|曾|终于|终得|终已)叩(?:入|开)?仙门|叩入仙门|仙门(?:已|终于|业已)(?:开|开启)|已入仙门/.test(
      asserted,
    )
  )
    return false;
  if (
    facts.realmIndex < 8 &&
    (/(?:成仙|登仙|证仙)$/.test(appraisal.title) ||
      /(?:已成|终成|终于成|已证|证得|证就|修成)真仙|真仙(?:已成|已证|得证|之境已证)|(?:已证|证得|终得)长生|长生(?:已证|已经证得|已得|得证)|(?:已|终|终于|业已)成仙|凡骨登仙|飞升成仙/.test(
        asserted,
      ))
  )
    return false;
  if (
    facts.ending !== 'lifespan' &&
    /此(?:世|生)(?:寿终|寿尽|寿元已尽|止于岁月)|寿元(?:已尽|行尽|耗尽)|此身寿终/.test(text)
  )
    return false;
  if (
    facts.ending !== 'tribulation' &&
    /此身止于天劫|此世止于天劫|殒于天劫|天劫殒命|雷声为此世收笔|未能渡过此劫/.test(text)
  )
    return false;
  if (facts.ending === 'ongoing' && /此世落幕|此生落幕|此世已终|此世终章已落/.test(text))
    return false;
  if (!tie('friend-met') && /渔友|渔夫|船头共饮/.test(text)) return false;
  if (!tie('student-met') && /弟子|问路少年|劝少年|为少年送行/.test(text)) return false;
  if (
    !facts.ties.some((id) => id.endsWith('-letter-read')) &&
    /旧信(?:已读|已阅|读过|已展)|读罢旧信/.test(text)
  )
    return false;
  return true;
}

export function validJourneyAppraisal(
  value: unknown,
  facts: JourneyAppraisalFacts,
): value is JourneyAppraisal {
  return (
    record(value) &&
    Object.keys(value).sort().join(',') === 'detail,title' &&
    plain(value.title, 2, 10) &&
    /^[\p{Script=Han}]+$/u.test(value.title) &&
    plain(value.detail, 30, JOURNEY_APPRAISAL_SETTINGS.maxDetailLength) &&
    fitsFacts(value as unknown as JourneyAppraisal, facts)
  );
}

export function journeyAppraisalMessages(facts: JourneyAppraisalFacts) {
  const ending = {
    ongoing:
      facts.realmIndex === 8 ? '已成真仙，尚未叩入仙门，此世仍在继续' : '正在修行，此世尚未结束',
    lifespan: '此世已因寿元耗尽落幕',
    tribulation: '此世已殒于天劫',
    immortal: '已证真仙并叩入仙门，此世圆满结束',
  }[facts.ending];
  const messages = [
    {
      role: 'system' as const,
      content: `你为修仙游戏《叩仙门：青岚纪》写给玩家一段个人留影评语。以克制、有温度的中文古风白话回望角色走过的路，像一段完整的题跋，不写资料说明、评语生成过程、人格评分或数据清单。结合此世结局、确实取得的修行成果和已知的人间牵挂，不能因一项成就忽略其他已知经历。人间选择有事实才写，并写出对应意味；道侣与家书同时存在时尽量兼顾。事实未提供就直接省略，不能把缺项写成人生：不得出现「尚无记载」「暂无记录」「缘簿留白」「这页空白也属于真实的此世」等表述，也不提存档、记录、数据、字段、摘要、档案、纪事、留白或空白。缺少牵挂事实不等于孤独、没有故事、没有旧缘或没有归处，不能如此推断；不编造遗憾、爱人、弟子或亲人死亡。\n只输出 JSON 对象，恰好四个字段：title（2至10个汉字的题名）、ending（结局句）、cultivation（修行成果句）、ties（人间牵挂句）。输入的 ties 数组为空时，输出 ties 必须是空字符串，不补任何牵挂句；有牵挂事实时必须写对应句。ending 写结局与意味；cultivation 写具体成果，不重述同一句结局。outcome 仅供辨认状态，groundedReference 仅供事实校对，不照抄参考全文；将事实融成一段短评，避免连续重复相同信息，并保留无灵根或最险历练等具体修行经历。非空段落以中文句末标点结束，合起来自然、有相互呼应，总计30至78字，绝不能超过80字；无牵挂时用结局和修行成果写完整短评，不为了凑字数编造第三段。正文只用中文、数字和中文标点，不输出Markdown、解释、推理或标签。\n只能引用提供的事实。成就id是已达成经历，未列出的成就不能补写。灵根只是当前资质，不能说天生如此。已通关秘境是精确列表，全部七境都有才可说踏破七境。正在修行不能写成此生已落幕，真仙尚未叩门不能写仙门已开；寿尽与天劫殒命不能写成已得长生。没有道侣事实不能写道侣；有相识未结缘只写相逢；旧信尚未读不能说读过。故乡家书展读不代表亲历归乡相见。结局、境界和成就以事实为准。`,
    },
    {
      role: 'user' as const,
      content: JSON.stringify({
        ...facts,
        outcome: ending,
        realm: facts.ascending ? '渡劫' : REALMS[facts.realmIndex],
        currentRoot: spiritRootInfo(facts.root).name,
        pathName: pathInfo(facts.path).name,
        weaponName: treasure(facts.weapon).name,
        clearedStages: facts.stages.map((index) => STAGES[index].name),
        groundedReference: localJourneyAppraisal(facts),
        tieMeaning:
          'home=故乡；letter-found/unread=尚未展读；letter-read=已读；met=仅相识；bond=道侣；friendship=知己；river=劝渔夫远行；harbor=陪他守渡；teach=劝游学少年授业；travel=赠言送行。',
      }),
    },
  ];
  // Qwen3 原生支持的短答开关；不传该模型 schema 不支持的模板参数。
  messages[0].content += '\n/no_think';
  return messages;
}

export function extractJourneyAppraisal(
  output: unknown,
  facts: JourneyAppraisalFacts,
  onReject?: (reason: string) => void,
) {
  const reject = (reason: string) => {
    onReject?.(reason);
    return null;
  };
  if (!record(output)) return reject('envelope');
  let content = output.response;
  if (Array.isArray(output.choices)) {
    const choice = output.choices[0];
    if (!record(choice) || !record(choice.message)) return reject('choice');
    if (choice.finish_reason === 'length') return reject('truncated');
    content = choice.message.content;
  }
  if (typeof content !== 'string') return reject(`content-${typeof content}`);
  if (content.length > 2048) return reject('content-length');
  try {
    // 少数模型仍给 JSON 加单层代码围栏；只解包完整 JSON，不接受额外说明。
    const trimmed = content.trim();
    const fenced = trimmed.match(/^```(?:json)?\s*(\{[\s\S]*\})\s*```$/);
    const parsed: unknown = JSON.parse(fenced?.[1] ?? trimmed);
    if (!record(parsed) || Object.keys(parsed).sort().join(',') !== 'cultivation,ending,ties,title')
      return reject('fields');
    for (const key of ['ending', 'cultivation', 'ties']) {
      if (typeof parsed[key] !== 'string') return reject(`section-${key}-type`);
      parsed[key] = (parsed[key] as string).replace(/\s/g, '');
      if (key === 'ties' && !facts.ties.length) {
        if (parsed[key] !== '') return reject('section-ties-unexpected');
        continue;
      }
      if (!plain(parsed[key], 4, 64)) return reject(`section-${key}-format`);
      // 非空段落偶尔省略句末或以逗号收尾，由此处统一落句。
      if (!/[。！？]$/.test(parsed[key] as string))
        parsed[key] = (parsed[key] as string).replace(/[，；：、]+$/, '') + '。';
      if (!plain(parsed[key], 4, 64) || !/[\p{Script=Han}]/u.test(parsed[key] as string))
        return reject(`section-${key}-format`);
    }
    if (typeof parsed.title === 'string') parsed.title = parsed.title.replace(/\s/g, '');
    const appraisal = {
      title: parsed.title,
      detail: `${parsed.ending}${parsed.cultivation}${parsed.ties}`,
    };
    if (!plain(appraisal.title, 2, 10) || !/^[\p{Script=Han}]+$/u.test(appraisal.title))
      return reject('title-format');
    if (!plain(appraisal.detail, 30, JOURNEY_APPRAISAL_SETTINGS.maxDetailLength))
      return reject('detail-format');
    return validJourneyAppraisal(appraisal, facts) ? appraisal : reject('facts');
  } catch {
    return reject('json');
  }
}
