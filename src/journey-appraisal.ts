import {
  FINAL_TRIAL_STAGE,
  MAX_FORGE_LEVEL,
  REALMS,
  SPIRIT_ROOTS,
  STAGES,
  TREASURES,
  isCultivationPath,
  treasure,
  type CultivationPath,
  type SpiritRootId,
} from './data.ts';
import { realmInfo, type SaveData } from './progress.ts';

export type JourneyCardEnding = 'ongoing' | 'lifespan' | 'tribulation' | 'immortal';
export interface JourneyAppraisal {
  title: string;
  detail: string;
}
export const JOURNEY_APPRAISAL_FEATS = [
  'forge',
  'three-paths',
  'permanent-medicine',
  'story',
  'collection',
  'level-100',
  'mastery',
  'training-master',
  'six-immortals',
  'five-tribulations',
  'hard-immortal',
  'rootless-immortal',
] as const;
export const JOURNEY_APPRAISAL_TIES = [
  'home-reunion',
  'home-letter-found',
  'home-letter-read',
  'companion-met',
  'companion-bond',
  'companion-friendship',
  'companion-letter-unread',
  'companion-letter-read',
  'friend-met',
  'friend-river',
  'friend-harbor',
  'friend-letter-unread',
  'friend-letter-read',
  'student-met',
  'student-teach',
  'student-travel',
  'student-letter-unread',
  'student-letter-read',
] as const;
export interface JourneyAppraisalFacts {
  ending: JourneyCardEnding;
  realmIndex: number;
  ascending: boolean;
  age: number;
  root: SpiritRootId;
  path: CultivationPath;
  weapon: string;
  forge: number;
  stages: number[];
  tribulations: number;
  feats: string[];
  ties: string[];
}
const FACT_KEYS = [
  'ending',
  'realmIndex',
  'ascending',
  'age',
  'root',
  'path',
  'weapon',
  'forge',
  'stages',
  'tribulations',
  'feats',
  'ties',
];

/** 只发送封闭事实摘要；不包含姓名、日志正文、聊天、完整存档或任意玩家文字。 */
export function journeyAppraisalFacts(
  save: SaveData,
  ending: JourneyCardEnding,
): JourneyAppraisalFacts {
  const realm = realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE));
  const has = (key: string) => Object.hasOwn(save.chronicle.milestones, key);
  const ties: string[] = [];
  const home = save.mortal.hometown;
  if (has('home-reunion')) ties.push('home-reunion');
  if (home?.letterFoundAt != null || home?.letterRead || has('home-letter-read'))
    ties.push('home-letter-found');
  if (home?.letterRead || has('home-letter-read')) ties.push('home-letter-read');
  for (const id of ['companion', 'friend', 'student'] as const) {
    const story = save.mortal.humanStories?.[id];
    if (!story) continue;
    ties.push(`${id}-met`);
    if (story.choice) {
      const choice = `${id}-${story.choice}`;
      if ((JOURNEY_APPRAISAL_TIES as readonly string[]).includes(choice)) ties.push(choice);
    }
    // 与缘簿显示一致：年岁到达真实离世时间才有旧信，不把「遇见」写成「读信」。
    if (save.age >= story.endsAt) ties.push(`${id}-letter-${story.read ? 'read' : 'unread'}`);
  }
  return {
    ending,
    realmIndex: realm.index,
    ascending: realm.ascending,
    age: save.age,
    root: save.spiritRoot,
    path: save.path,
    weapon: save.starter,
    forge: save.forge[save.starter] ?? 0,
    stages: [...new Set(save.completed)].sort((a, b) => a - b),
    tribulations: save.tribulations,
    feats: JOURNEY_APPRAISAL_FEATS.filter(has),
    ties,
  };
}

export function validJourneyAppraisalFacts(value: unknown): value is JourneyAppraisalFacts {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const f = value as JourneyAppraisalFacts;
  const keys = Object.keys(value);
  const uniqueList = (list: unknown, allowed: readonly unknown[]): list is string[] =>
    Array.isArray(list) &&
    list.length <= allowed.length &&
    new Set(list).size === list.length &&
    list.every((item) => allowed.includes(item));
  if (
    keys.length !== FACT_KEYS.length ||
    !keys.every((key) => FACT_KEYS.includes(key)) ||
    !['ongoing', 'lifespan', 'tribulation', 'immortal'].includes(f.ending) ||
    !Number.isInteger(f.realmIndex) ||
    f.realmIndex < 0 ||
    f.realmIndex >= REALMS.length ||
    typeof f.ascending !== 'boolean' ||
    !Number.isFinite(f.age) ||
    f.age < 0 ||
    !SPIRIT_ROOTS.some((root) => root.id === f.root) ||
    !isCultivationPath(f.path) ||
    !TREASURES.some((weapon) => weapon.id === f.weapon) ||
    !Number.isInteger(f.forge) ||
    f.forge < 0 ||
    f.forge > MAX_FORGE_LEVEL ||
    !uniqueList(
      f.stages,
      STAGES.map((_, index) => index),
    ) ||
    !Number.isSafeInteger(f.tribulations) ||
    f.tribulations < 0 ||
    !uniqueList(f.feats, JOURNEY_APPRAISAL_FEATS) ||
    !uniqueList(f.ties, JOURNEY_APPRAISAL_TIES)
  )
    return false;
  if (
    (f.ending === 'immortal' && f.realmIndex !== 8) ||
    (f.realmIndex === 8 && !f.stages.includes(FINAL_TRIAL_STAGE)) ||
    (f.ascending && (f.realmIndex !== 7 || f.stages.includes(FINAL_TRIAL_STAGE))) ||
    (f.feats.some((feat) => ['rootless-immortal', 'hard-immortal'].includes(feat)) &&
      f.realmIndex !== 8) ||
    (f.feats.includes('five-tribulations') && f.tribulations < 5) ||
    (f.ties.includes('home-letter-read') && !f.ties.includes('home-letter-found'))
  )
    return false;
  for (const [id, options] of [
    ['companion', ['bond', 'friendship']],
    ['friend', ['river', 'harbor']],
    ['student', ['teach', 'travel']],
  ] as const) {
    if (options.every((choice) => f.ties.includes(`${id}-${choice}`))) return false;
    if (f.ties.includes(`${id}-letter-read`) && f.ties.includes(`${id}-letter-unread`))
      return false;
    if (f.ties.some((tie) => tie.startsWith(`${id}-`)) && !f.ties.includes(`${id}-met`))
      return false;
  }
  return true;
}

function appraisalTitle(f: JourneyAppraisalFacts) {
  const feat = (id: string) => f.feats.includes(id);
  const tie = (id: string) => f.ties.includes(id);
  const home = tie('home-letter-read') || tie('home-reunion');
  const bond = tie('companion-bond');
  const allStages = STAGES.every((_, index) => f.stages.includes(index));
  if (f.ending === 'tribulation') return '一念问天';
  if (feat('rootless-immortal')) return '凡骨登仙';
  if (feat('hard-immortal')) return '逆境问道';
  if (f.ending === 'immortal')
    return home ? '仙心有归处' : bond ? '长生有旧灯' : allStages ? '七境问长生' : '此世叩仙门';
  if (f.ending === 'lifespan')
    return bond
      ? '此生有归灯'
      : home
        ? '山海有归途'
        : f.realmIndex >= 3
          ? '修得一程山海'
          : '此生曾问道';
  if (f.realmIndex === 8) return '长生已证';
  if (f.realmIndex >= 7) return '仙关在望';
  if (bond) return '问道有归灯';
  if (home) return '行远仍知归';
  if (feat('six-immortals')) return '六器曾共鸣';
  if (f.realmIndex >= 3 && ['none', 'quad', 'five'].includes(f.root)) return '拙根亦向上';
  if (f.stages.length) return '山海初留名';
  return f.realmIndex >= 1 ? '道心渐有成' : '青岚初问道';
}

function factsSeed(f: JourneyAppraisalFacts) {
  // 相同事实不因刷新或先后顺序换词；不写入存档，也不使用 Math.random。
  const canonical = JSON.stringify({
    ending: f.ending,
    realmIndex: f.realmIndex,
    ascending: f.ascending,
    age: f.age,
    root: f.root,
    path: f.path,
    weapon: f.weapon,
    forge: f.forge,
    tribulations: f.tribulations,
    stages: [...f.stages].sort((a, b) => a - b),
    feats: [...f.feats].sort(),
    ties: [...f.ties].sort(),
  });
  let seed = 2166136261;
  for (const char of canonical) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  return seed >>> 0;
}

function endingWords(f: JourneyAppraisalFacts, pick: (words: readonly string[]) => string) {
  if (f.ending === 'tribulation')
    return {
      full: pick([
        '此身止于天劫，曾向苍天问道的脚步仍有回响。',
        '雷声为此世收笔，这一程向天而行的心意已留下。',
        '仙关前未能渡过此劫，走过的山海仍有你的来路。',
      ]),
      compact: '此世止于天劫，问道的心意仍有回响。',
      brief: '天劫收笔，问道留痕。',
    };
  if (f.ending === 'lifespan')
    return {
      full: pick([
        '寿元行尽，向长生迈过的脚步仍在此世留下回响。',
        '此世止于岁月，问道途中亲见的山海已落在笔间。',
        '长生未得，岁月已为这一程求道写下最后一笔。',
      ]),
      compact: '此世止于岁月，求道的一程仍有来路。',
      brief: '此世寿终，问道留痕。',
    };
  if (f.ending === 'immortal')
    return {
      full: pick([
        '仙门已开，此世求长生的一程终于有了回音。',
        '你已叩入仙门，山海间求长生的脚步走到了此处。',
        '真仙之境已证，此世终于写下叩入仙门的终章。',
      ]),
      compact: '仙门已开，求长生的一程终于有了回音。',
      brief: '已叩仙门，长生得证。',
    };
  if (f.realmIndex === 8)
    return {
      full: pick([
        '长生已经证得，此世还待你亲手写下仙门后的篇章。',
        '真仙已成，叩门之前，这一程仍能添上新的山海。',
        '仙途已越天关，尚未落幕的此世还留着新的去处。',
      ]),
      compact: '长生已证，此世仍待你写下新的篇章。',
      brief: '长生已证，此世未竟。',
    };
  if (f.ascending)
    return {
      full: pick([
        '修为已抵渡劫，仙关在前，此世仍待亲身闯过。',
        '问道已至天关，待渡的天劫还留着最后的问句。',
        '长生近在仙关，此世求道的一程尚未写到终章。',
      ]),
      compact: '修为已抵渡劫，仙关仍待亲身闯过。',
      brief: '仙关待渡，此世未竟。',
    };
  return {
    full: pick([
      '此世仍在修行，长生未有定论，前路尚待亲行。',
      '这一程尚未收笔，求长生的路还在向山海延伸。',
      '仙途仍在脚下，此世的下一页还等你自己写下。',
    ]),
    compact: '此世尚未收笔，求长生的路仍在延伸。',
    brief: '仙途未竟，仍待亲行。',
  };
}

const FEAT_WORDS: Record<(typeof JOURNEY_APPRAISAL_FEATS)[number], readonly string[]> = {
  forge: ['炼器已臻十阶', '炉火炼成十阶', '法宝曾炼至十阶'],
  'three-paths': ['三道皆曾通关', '正魔兼修皆有成', '三道历练皆留痕'],
  'permanent-medicine': ['珍丹曾入体', '本世曾服珍丹', '珍丹留下造化'],
  story: ['炉火旧事已圆', '曾续起炉火旧缘', '人间炉火留了痕'],
  collection: ['万宝已归藏', '三十六宝归藏', '诸宝皆入珍藏'],
  'level-100': ['百级曾归真', '百级修行曾亲证', '百级历练已亲证'],
  mastery: ['宝典精研十阶', '宗门宝典已精研', '一部宝典研至十阶'],
  'training-master': ['三元皆修成', '三元修至二十阶', '淬体悟道身法皆成'],
  'six-immortals': ['六器曾齐鸣', '曾同御六件仙器', '六件仙器曾共鸣'],
  'five-tribulations': ['五劫皆渡过', '五次天劫已亲渡', '五劫留下修行印'],
  'hard-immortal': ['最险历练亦证仙', '逆最险历练成仙', '最险仙途已走过'],
  'rootless-immortal': ['无灵根亦证仙', '无灵根也证真仙', '无灵根曾证长生'],
};
const FEAT_PRIORITY = [
  'rootless-immortal',
  'hard-immortal',
  'six-immortals',
  'five-tribulations',
  'three-paths',
  'training-master',
  'mastery',
  'collection',
  'level-100',
  'forge',
  'permanent-medicine',
  'story',
] as const;
const ROOT_WORDS: Record<SpiritRootId, string> = {
  heaven: '眼下天灵根在身',
  variant: '眼下异灵根在身',
  dual: '眼下双系灵根相生',
  triple: '眼下三系灵根交映',
  quad: '眼下四系薄根并存',
  five: '眼下五系薄根并存',
  none: '眼下虽无灵根',
};

function cultivationWords(f: JourneyAppraisalFacts, pick: (words: readonly string[]) => string) {
  const feats = FEAT_PRIORITY.filter((id) => f.feats.includes(id));
  if (feats.length) {
    const selected = feats.slice(0, 3);
    const both = selected.includes('rootless-immortal') && selected.includes('hard-immortal');
    const words = both
      ? ['无灵根亦于最险历练证仙', ...selected.slice(2).map((id) => pick(FEAT_WORDS[id]))]
      : selected.map((id) => pick(FEAT_WORDS[id]));
    return {
      full: `${words.join('、')}，皆为此身亲证。`,
      compact: `${words.join('、')}。`,
    };
  }
  const root = ROOT_WORDS[f.root];
  const realm = REALMS[f.realmIndex];
  const allStages = STAGES.every((_, index) => f.stages.includes(index));
  const stage = allStages
    ? '七境皆破'
    : f.stages.length
      ? `${'一二三四五六七'[f.stages.length - 1]}境已破`
      : null;
  const forge = f.forge ? `${treasure(f.weapon).name}已炼${f.forge}阶` : null;
  const tribulations = f.tribulations
    ? f.tribulations > 99
      ? '多次天劫已亲渡'
      : `已历${f.tribulations}次天劫`
    : null;
  const evidence = [stage, forge, tribulations].filter((text): text is string => text !== null);
  if (evidence.length) {
    const compactEvidence = [
      stage,
      f.forge ? `本命已炼${f.forge === 10 ? '十' : '一二三四五六七八九'[f.forge - 1]}阶` : null,
      f.tribulations ? '天劫曾渡过' : null,
    ].filter((text): text is string => text !== null);
    return {
      full: `${root}，${evidence.slice(0, 2).join('、')}，修行已有实迹。`,
      compact: `${root}，${compactEvidence.slice(0, 2).join('、')}。`,
    };
  }
  return {
    full: pick([
      `${root}，修至${realm}，新的成果仍待亲证。`,
      `${root}，${realm}是眼下所至，前路尚待磨砺。`,
      `${root}，此身修在${realm}，问道仍需慢慢积累。`,
    ]),
    compact: `${root}，${realm}之后仍待积累。`,
  };
}

function tiesWords(f: JourneyAppraisalFacts, pick: (words: readonly string[]) => string) {
  const tie = (id: string) => f.ties.includes(id);
  const groups: string[] = [];
  if (tie('home-letter-read'))
    groups.push(pick(['家书已经展读', '家书里的叮嘱已读', '曾展读故乡家书']));
  else if (tie('home-letter-found'))
    groups.push(pick(['家书尚待展读', '故乡家书仍待打开', '已得家书尚未展读']));
  else if (tie('home-reunion'))
    groups.push(pick(['曾归乡与亲人相见', '故里曾有重逢', '曾回青岚见亲人']));
  for (const id of ['companion', 'friend', 'student'] as const) {
    if (!tie(`${id}-met`)) continue;
    const base =
      id === 'companion'
        ? tie('companion-bond')
          ? pick(['道侣共过人间岁月', '曾与道侣共度春秋', '人间曾结道侣之缘'])
          : tie('companion-friendship')
            ? pick(['春灯下曾作知己', '曾留下一生知己之缘', '檐下曾与知己相谈'])
            : pick(['檐下曾有相逢', '布铺檐下曾避雨相识', '春灯下结过一段缘'])
        : id === 'friend'
          ? tie('friend-river')
            ? pick(['曾劝渔友远行', '曾送渔友去看大江', '曾劝渔友去看大江'])
            : tie('friend-harbor')
              ? pick(['曾陪渔友守渡', '曾劝渔友留在渡口', '曾与渔友谈起守渡'])
              : pick(['江上曾与渔友共饮', '船头曾有一杯相逢', '曾在船头结识渔友'])
          : tie('student-teach')
            ? pick(['曾劝少年授业', '曾劝问路少年留下授业', '远山曾托付少年讲给后来人'])
            : tie('student-travel')
              ? pick(['曾送少年远游', '曾为问路少年赠言送行', '曾劝少年亲眼去看山海'])
              : pick(['曾为少年停步答疑', '曾与问路少年谈起远山', '纸上远山曾有一场问答']);
    const letter = tie(`${id}-letter-read`)
      ? '，旧信已读'
      : tie(`${id}-letter-unread`)
        ? '，旧信未展'
        : '';
    groups.push(`${base}${letter}`);
  }
  // 缺少牵挂事实就不写这一段，不能把数据缺项当作角色的人生。
  if (!groups.length) return { full: '', compact: '' };
  const compact = groups.map((_, i) => {
    // 压缩仅换成同义短句，不删掉整组牵挂，也不把未展旧信写成已读。
    if (i === 0 && (tie('home-letter-found') || tie('home-reunion')))
      return tie('home-letter-read')
        ? '家书已读'
        : tie('home-letter-found')
          ? '家书未展'
          : '故里曾重逢';
    const id = (['companion', 'friend', 'student'] as const).filter((id) => tie(`${id}-met`))[
      i - Number(tie('home-letter-found') || tie('home-reunion'))
    ];
    const base =
      id === 'companion'
        ? tie('companion-bond')
          ? '道侣共春秋'
          : tie('companion-friendship')
            ? '知己伴春灯'
            : '檐下曾相逢'
        : id === 'friend'
          ? tie('friend-river')
            ? '曾劝渔友远行'
            : tie('friend-harbor')
              ? '曾陪渔友守渡'
              : '江上曾共饮'
          : tie('student-teach')
            ? '曾劝少年授业'
            : tie('student-travel')
              ? '曾送少年远游'
              : '少年曾问路';
    const letter = tie(`${id}-letter-read`) ? '信已读' : tie(`${id}-letter-unread`) ? '信未展' : '';
    return letter ? `${base}，${letter}` : base;
  });
  return {
    full: `${groups.join('；')}，皆是问道之外的此世来路。`,
    compact: `${compact.join('；')}。`,
  };
}

/** 三类事实有则参与落笔；缺项省略，过长时只换同义短句，不凑字数。 */
export function localJourneyAppraisal(f: JourneyAppraisalFacts): JourneyAppraisal {
  let seed = factsSeed(f);
  const pick = (words: readonly string[]) => {
    seed = Math.imul(seed ^ (seed >>> 13), 1597334677) >>> 0;
    return words[seed % words.length];
  };
  const ending = endingWords(f, pick);
  const cultivation = cultivationWords(f, pick);
  const ties = tiesWords(f, pick);
  const parts = [ending.full, cultivation.full, ties.full];
  for (const [index, compact] of [
    [2, ties.compact],
    [1, cultivation.compact],
    [0, ending.compact],
    [0, ending.brief],
  ] as const)
    if (parts.join('').length > 78) parts[index] = compact;
  return { title: appraisalTitle(f), detail: parts.join('') };
}
