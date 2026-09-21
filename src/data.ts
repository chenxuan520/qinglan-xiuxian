export const SPIRIT_ROOTS = [
  {
    id: 'heaven',
    name: '天灵根',
    rate: 1,
    chance: 5,
    count: 1,
    damageBonus: 15,
    baseHp: 100,
    baseRegen: 0.18,
    baseCrit: 0.07,
    baseSpeed: 175,
    powerPerLevel: 2,
  },
  {
    id: 'variant',
    name: '异灵根',
    rate: 0.85,
    chance: 10,
    count: 1,
    damageBonus: 12,
    baseHp: 95,
    baseRegen: 0.16,
    baseCrit: 0.07,
    baseSpeed: 175,
    powerPerLevel: 1.8,
  },
  {
    id: 'dual',
    name: '普通灵根',
    rate: 0.7,
    chance: 15,
    count: 2,
    damageBonus: 8,
    baseHp: 90,
    baseRegen: 0.14,
    baseCrit: 0.05,
    baseSpeed: 160,
    powerPerLevel: 1.6,
  },
  {
    id: 'triple',
    name: '普通灵根',
    rate: 0.55,
    chance: 25,
    count: 3,
    damageBonus: 6,
    baseHp: 90,
    baseRegen: 0.14,
    baseCrit: 0.05,
    baseSpeed: 160,
    powerPerLevel: 1.6,
  },
  {
    id: 'quad',
    name: '伪灵根',
    rate: 0.4,
    chance: 25,
    count: 4,
    damageBonus: 4,
    baseHp: 85,
    baseRegen: 0.12,
    baseCrit: 0.03,
    baseSpeed: 150,
    powerPerLevel: 1.4,
  },
  {
    id: 'five',
    name: '伪灵根',
    rate: 0.3,
    chance: 10,
    count: 5,
    damageBonus: 3,
    baseHp: 85,
    baseRegen: 0.12,
    baseCrit: 0.03,
    baseSpeed: 150,
    powerPerLevel: 1.4,
  },
  {
    id: 'none',
    name: '无灵根',
    rate: 0.2,
    chance: 10,
    count: 0,
    damageBonus: 0,
    baseHp: 80,
    baseRegen: 0.1,
    baseCrit: 0.01,
    baseSpeed: 140,
    powerPerLevel: 1.2,
  },
] as const;
export type SpiritRootId = (typeof SPIRIT_ROOTS)[number]['id'];
export const spiritRootInfo = (id: string) =>
  SPIRIT_ROOTS.find((r) => r.id === id) ?? SPIRIT_ROOTS[0];
export function rollSpiritRoot(random: () => number = Math.random): SpiritRootId {
  let roll = random() * 100;
  for (const root of SPIRIT_ROOTS) {
    roll -= root.chance;
    if (roll < 0) return root.id;
  }
  return 'none';
}

export const ELEMENTS = [
  { id: 'metal', name: '金', color: '#e8d69c' },
  { id: 'wood', name: '木', color: '#9fe2b1' },
  { id: 'water', name: '水', color: '#a9ddf3' },
  { id: 'fire', name: '火', color: '#f3a887' },
  { id: 'earth', name: '土', color: '#d7bc94' },
] as const;
export type ElementId = (typeof ELEMENTS)[number]['id'];
export const elementInfo = (id: ElementId) => ELEMENTS.find((e) => e.id === id)!;
export function rootElementsFor(
  root: SpiritRootId,
  existing: unknown = [],
  random: () => number = Math.random,
): ElementId[] {
  const count = spiritRootInfo(root).count;
  const valid = Array.isArray(existing)
    ? existing.filter((id): id is ElementId => ELEMENTS.some((e) => e.id === id))
    : [];
  const result = [...new Set(valid)].slice(0, count);
  const pool = ELEMENTS.map((e) => e.id).filter((id) => !result.includes(id));
  while (result.length < count) result.push(...pool.splice(Math.floor(random() * pool.length), 1));
  return result;
}
export function weaponRootBonus(root: SpiritRootId, elements: ElementId[], weapon: Treasure) {
  return elements.includes(weapon.element) ? spiritRootInfo(root).damageBonus / 100 : 0;
}

export type WeaponKind =
  | 'sword'
  | 'orbit'
  | 'lightning'
  | 'pulse'
  | 'poison'
  | 'ice'
  | 'fire'
  | 'fan'
  | 'blade'
  | 'arrow'
  | 'meteor'
  | 'chain'
  | 'vortex'
  | 'talisman'
  | 'pearl'
  | 'dragon'
  | 'qin'
  | 'brush'
  | 'pagoda'
  | 'banner'
  | 'cauldron'
  | 'flute'
  | 'beads'
  | 'compass'
  | 'umbrella'
  | 'spear'
  | 'scythe'
  | 'nail'
  | 'coffin'
  | 'whip'
  | 'skull'
  | 'bloodpool'
  | 'nest'
  | 'shard'
  | 'axe'
  | 'sand';
export const ROOT_STARTERS: Record<ElementId, [WeaponKind, WeaponKind]> = {
  metal: ['sword', 'nail'],
  wood: ['orbit', 'poison'],
  water: ['ice', 'bloodpool'],
  fire: ['lightning', 'fire'],
  earth: ['pagoda', 'vortex'],
};
export const rootStarter = (elements: ElementId[], path: CultivationPath) =>
  ROOT_STARTERS[elements[0] ?? 'metal'][path === 'demonic' ? 1 : 0];
export interface Treasure {
  school: School;
  element: ElementId;
  id: WeaponKind;
  name: string;
  mark: string;
  color: string;
  tag: string;
  desc: string;
  evolution: string;
  passive: string;
  damage: number;
  cooldown: number;
}
export const TREASURES: Treasure[] = [
  {
    id: 'sword',
    element: 'metal',
    school: 'orthodox',
    name: '青霄剑',
    mark: '剑',
    color: '#e8d69c',
    tag: '御剑 · 穿透',
    desc: '飞剑自动索敌，贯穿沿途妖物；升阶增加剑数与伤害。',
    evolution: '万剑归宗',
    passive: 'power',
    damage: 24,
    cooldown: 0.85,
  },
  {
    id: 'orbit',
    element: 'wood',
    school: 'orthodox',
    name: '青莲灯',
    mark: '莲',
    color: '#9fe2c2',
    tag: '环绕 · 护体',
    desc: '青莲绕身，持续绞杀近身妖物；升阶增加莲花数量。',
    evolution: '九品莲台',
    passive: 'area',
    damage: 17,
    cooldown: 0.65,
  },
  {
    id: 'lightning',
    element: 'fire',
    school: 'orthodox',
    name: '九霄雷符',
    mark: '雷',
    color: '#c9b5ff',
    tag: '雷法 · 群攻',
    desc: '天雷轰击附近妖物，波及周围；升阶增加落雷数。',
    evolution: '紫霄天劫',
    passive: 'haste',
    damage: 38,
    cooldown: 2.2,
  },
  {
    id: 'pulse',
    element: 'metal',
    school: 'orthodox',
    name: '东皇钟',
    mark: '钟',
    color: '#edc77f',
    tag: '音波 · 击退',
    desc: '洪钟震出环形冲击，将附近妖物击退。',
    evolution: '太一神钟',
    passive: 'guard',
    damage: 30,
    cooldown: 3,
  },
  {
    id: 'poison',
    element: 'wood',
    school: 'demonic',
    name: '万毒葫',
    mark: '葫',
    color: '#bcda80',
    tag: '毒法 · 持续',
    desc: '在妖群中播撒毒雾，持续腐蚀踏入其中的妖物。',
    evolution: '蚀骨万毒域',
    passive: 'duration',
    damage: 11,
    cooldown: 3.5,
  },
  {
    id: 'ice',
    element: 'water',
    school: 'orthodox',
    name: '玄冰镜',
    mark: '镜',
    color: '#a9ddf3',
    tag: '寒冰 · 控制',
    desc: '寒光冻结身旁妖物，使其移动速度大幅降低。',
    evolution: '万里霜天',
    passive: 'area',
    damage: 22,
    cooldown: 3.2,
  },
  {
    id: 'fire',
    element: 'fire',
    school: 'demonic',
    name: '离火珠',
    mark: '火',
    color: '#f3a887',
    tag: '离火 · 爆裂',
    desc: '射出炽热火球，命中时爆裂灼烧一片妖物。',
    evolution: '焚天业火',
    passive: 'power',
    damage: 32,
    cooldown: 1.6,
  },
  {
    id: 'fan',
    element: 'wood',
    school: 'orthodox',
    name: '芭蕉扇',
    mark: '扇',
    color: '#addec2',
    tag: '风法 · 扇射',
    desc: '朝妖群挥出扇形风刃，覆盖宽阔战线。',
    evolution: '九天罡风',
    passive: 'haste',
    damage: 19,
    cooldown: 1.6,
  },
  {
    id: 'blade',
    element: 'metal',
    school: 'demonic',
    name: '血月轮',
    mark: '轮',
    color: '#e7a1a4',
    tag: '飞刃 · 回旋',
    desc: '血色月轮盘旋而出，贯穿后飞回身边。',
    evolution: '修罗血月',
    passive: 'duration',
    damage: 24,
    cooldown: 2,
  },
  {
    id: 'arrow',
    element: 'metal',
    school: 'orthodox',
    name: '追星弓',
    mark: '弓',
    color: '#e8dda3',
    tag: '远程 · 暴击',
    desc: '迅疾灵箭锁定最近妖物，暴击率额外提升。',
    evolution: '陨日逐星',
    passive: 'crit',
    damage: 40,
    cooldown: 1.15,
  },
  {
    id: 'meteor',
    element: 'earth',
    school: 'orthodox',
    name: '番天印',
    mark: '印',
    color: '#d7b18a',
    tag: '重击 · 范围',
    desc: '灵印自高空落下，对妖群造成高额范围伤害。',
    evolution: '山河社稷',
    passive: 'area',
    damage: 65,
    cooldown: 4.5,
  },
  {
    id: 'chain',
    element: 'wood',
    school: 'demonic',
    name: '缚妖索',
    mark: '索',
    color: '#e3c680',
    tag: '连锁 · 禁锢',
    desc: '金索在妖物间弹射，以灵力束缚目标。',
    evolution: '天罗地网',
    passive: 'duration',
    damage: 23,
    cooldown: 2,
  },
  {
    id: 'vortex',
    element: 'earth',
    school: 'demonic',
    name: '阴阳盘',
    mark: '卦',
    color: '#bccfdf',
    tag: '法阵 · 牵引',
    desc: '布下阴阳法阵，将周围妖物缓缓拉入阵心。',
    evolution: '混元无极阵',
    passive: 'magnet',
    damage: 12,
    cooldown: 4,
  },
  {
    id: 'talisman',
    element: 'fire',
    school: 'demonic',
    name: '镇魂幡',
    mark: '幡',
    color: '#c4a5e8',
    tag: '符咒 · 环射',
    desc: '向四周发出镇魂符，阻截多个方向的妖潮。',
    evolution: '幽冥万魂',
    passive: 'spirit',
    damage: 23,
    cooldown: 2.4,
  },
  {
    id: 'pearl',
    element: 'water',
    school: 'orthodox',
    name: '沧海珠',
    mark: '珠',
    color: '#95d4e0',
    tag: '灵水 · 弹射',
    desc: '灵珠命中后跳向附近目标，连续打击妖物。',
    evolution: '四海潮生',
    passive: 'magnet',
    damage: 25,
    cooldown: 1.5,
  },
  {
    id: 'dragon',
    element: 'fire',
    school: 'orthodox',
    name: '游龙尺',
    mark: '龙',
    color: '#ecd297',
    tag: '龙息 · 游走',
    desc: '放出游龙灵气，蜿蜒穿过妖群并击退目标。',
    evolution: '太虚龙吟',
    passive: 'crit',
    damage: 33,
    cooldown: 2.2,
  },
  {
    id: 'qin',
    element: 'water',
    school: 'orthodox',
    name: '镇岳古琴',
    mark: '琴',
    color: '#b8e4ce',
    tag: '音律 · 声浪',
    desc: '拨出不断扩散的穿透音波，扇形覆盖前方妖潮。',
    evolution: '太古镇魂曲',
    passive: 'area',
    damage: 18,
    cooldown: 1.8,
  },
  {
    id: 'brush',
    element: 'water',
    school: 'demonic',
    name: '判天笔',
    mark: '笔',
    color: '#e7d8ae',
    tag: '符墨 · 连阵',
    desc: '沿目标方向连书三道墨印，依次爆发范围伤害。',
    evolution: '万象天书',
    passive: 'spirit',
    damage: 30,
    cooldown: 3.1,
  },
  {
    id: 'pagoda',
    element: 'earth',
    school: 'orthodox',
    name: '七宝玲珑塔',
    mark: '塔',
    color: '#f1d39a',
    tag: '镇守 · 灵塔',
    desc: '在身侧立起灵塔，持续锁定附近妖物降下镇压灵光。',
    evolution: '三十三天塔',
    passive: 'duration',
    damage: 23,
    cooldown: 4.8,
  },
  {
    id: 'banner',
    element: 'earth',
    school: 'demonic',
    name: '五行阵旗',
    mark: '旗',
    color: '#a9dca5',
    tag: '法阵 · 三才',
    desc: '在周围布下三才阵点，交错爆发并减速阵内妖物。',
    evolution: '五方封天阵',
    passive: 'area',
    damage: 15,
    cooldown: 4.2,
  },
  {
    id: 'cauldron',
    element: 'earth',
    school: 'orthodox',
    name: '神农鼎',
    mark: '鼎',
    color: '#c9da98',
    tag: '丹道 · 药域',
    desc: '展开药火领域灼烧近敌，命中妖物时少量回复气血。',
    evolution: '百草万灵鼎',
    passive: 'duration',
    damage: 12,
    cooldown: 4.2,
  },
  {
    id: 'flute',
    element: 'wood',
    school: 'orthodox',
    name: '玉清笛',
    mark: '笛',
    color: '#94dcd5',
    tag: '音律 · 追踪',
    desc: '放出悠长灵音，飞行时不断转向附近妖物。',
    evolution: '九天引凤曲',
    passive: 'haste',
    damage: 24,
    cooldown: 1.7,
  },
  {
    id: 'beads',
    element: 'wood',
    school: 'orthodox',
    name: '菩提念珠',
    mark: '珠',
    color: '#ead494',
    tag: '佛法 · 弹射',
    desc: '念珠从身周散出，命中后弹向附近尚未击中的妖物。',
    evolution: '大日菩提轮',
    passive: 'spirit',
    damage: 17,
    cooldown: 2.3,
  },
  {
    id: 'compass',
    element: 'metal',
    school: 'orthodox',
    name: '定星罗盘',
    mark: '盘',
    color: '#aebeea',
    tag: '星术 · 十字',
    desc: '投射四向星线，贯穿长距离直线路径上的妖物。',
    evolution: '周天定星仪',
    passive: 'area',
    damage: 32,
    cooldown: 2.8,
  },
  {
    id: 'umbrella',
    element: 'water',
    school: 'orthodox',
    name: '玄天伞',
    mark: '伞',
    color: '#b9dceb',
    tag: '护体 · 拦截',
    desc: '震退近敌并消解身边的敌方灵弹，消解后放出反击光束。',
    evolution: '乾坤万法伞',
    passive: 'guard',
    damage: 27,
    cooldown: 3.4,
  },
  {
    id: 'spear',
    element: 'metal',
    school: 'orthodox',
    name: '破军枪',
    mark: '枪',
    color: '#e0bf86',
    tag: '枪意 · 贯穿',
    desc: '凝出高速长枪，贯穿整列妖物，适合击破厚重目标。',
    evolution: '诛仙破军枪',
    passive: 'crit',
    damage: 43,
    cooldown: 1.9,
  },
  {
    id: 'scythe',
    element: 'metal',
    school: 'demonic',
    name: '摄魂镰',
    mark: '镰',
    color: '#c0a4de',
    tag: '近战 · 斩杀',
    desc: '横扫前方半圆，气血低于三成的目标受到额外伤害。',
    evolution: '九幽夺命镰',
    passive: 'crit',
    damage: 38,
    cooldown: 2.1,
  },
  {
    id: 'nail',
    element: 'metal',
    school: 'demonic',
    name: '追魂钉',
    mark: '钉',
    color: '#d39ab5',
    tag: '暗器 · 速射',
    desc: '连续射出细小追魂钉，快速追踪并集中打击单个目标。',
    evolution: '七煞索命钉',
    passive: 'haste',
    damage: 13,
    cooldown: 0.85,
  },
  {
    id: 'coffin',
    element: 'earth',
    school: 'demonic',
    name: '葬天棺',
    mark: '棺',
    color: '#b897b2',
    tag: '冥术 · 延迟',
    desc: '在目标脚下显化冥棺，延迟重击后留下持续伤害的冥土。',
    evolution: '万劫葬仙棺',
    passive: 'duration',
    damage: 63,
    cooldown: 4.6,
  },
  {
    id: 'whip',
    element: 'fire',
    school: 'demonic',
    name: '赤炼鞭',
    mark: '鞭',
    color: '#eead88',
    tag: '鞭法 · 牵引',
    desc: '鞭影贯穿前方，拉近命中的普通妖物并使其减速。',
    evolution: '赤练锁天鞭',
    passive: 'area',
    damage: 30,
    cooldown: 1.8,
  },
  {
    id: 'skull',
    element: 'earth',
    school: 'demonic',
    name: '白骨髅',
    mark: '骨',
    color: '#d7cfb9',
    tag: '召唤 · 骨灵',
    desc: '从周围召出骨灵，缓慢追踪妖群并穿透多个目标。',
    evolution: '万骨幽冥王',
    passive: 'spirit',
    damage: 25,
    cooldown: 2.7,
  },
  {
    id: 'bloodpool',
    element: 'water',
    school: 'demonic',
    name: '化血盏',
    mark: '盏',
    color: '#db8298',
    tag: '血法 · 汲取',
    desc: '在妖群中形成血池，持续伤敌并少量回复自身气血。',
    evolution: '无边血海',
    passive: 'duration',
    damage: 10,
    cooldown: 4.3,
  },
  {
    id: 'nest',
    element: 'wood',
    school: 'demonic',
    name: '万蛊巢',
    mark: '蛊',
    color: '#b2c788',
    tag: '蛊术 · 伏击',
    desc: '在目标附近布下多枚蛊卵，先后破壳毒爆并减速妖物。',
    evolution: '万蛊噬天巢',
    passive: 'magnet',
    damage: 25,
    cooldown: 3.3,
  },
  {
    id: 'shard',
    element: 'metal',
    school: 'demonic',
    name: '裂魂镜',
    mark: '镜',
    color: '#c6a2de',
    tag: '镜术 · 分裂',
    desc: '射出穿魂镜片，首次命中会向两侧分裂出次级镜片。',
    evolution: '千影碎魂镜',
    passive: 'power',
    damage: 23,
    cooldown: 1.8,
  },
  {
    id: 'axe',
    element: 'metal',
    school: 'demonic',
    name: '开天斧',
    mark: '斧',
    color: '#d9ac89',
    tag: '重兵 · 震地',
    desc: '在前方砸下巨斧，短暂蓄势后爆发并击退一片妖物。',
    evolution: '盘古开天钺',
    passive: 'power',
    damage: 70,
    cooldown: 3.7,
  },
  {
    id: 'sand',
    element: 'earth',
    school: 'demonic',
    name: '星河砂',
    mark: '砂',
    color: '#b7cce9',
    tag: '星术 · 落星',
    desc: '在目标附近洒下数团星砂，错时落下轰击分散妖群。',
    evolution: '无尽星河',
    passive: 'magnet',
    damage: 26,
    cooldown: 3.2,
  },
];
export type School = 'orthodox' | 'demonic';
export type CultivationPath = School | 'dual';
export const CULTIVATION_PATHS = [
  {
    id: 'orthodox',
    name: '正道',
    color: '#b9dfbc',
    desc: '正道法宝与功法；气血上限 +12%，持续回血速度 +20%。',
  },
  {
    id: 'demonic',
    name: '魔道',
    color: '#dca4b9',
    desc: '魔道法宝与功法；法宝伤害 +12%，擅长爆发与汲取。',
  },
  {
    id: 'dual',
    name: '兼修',
    color: '#ded3a0',
    desc: '正魔法宝与功法自由搭配，无额外路线加成。',
  },
] as const;
export const isCultivationPath = (value: unknown): value is CultivationPath =>
  CULTIVATION_PATHS.some((path) => path.id === value);
export const pathInfo = (path: CultivationPath) => CULTIVATION_PATHS.find((p) => p.id === path)!;
export const allowsSchool = (path: CultivationPath, school: School) =>
  path === 'dual' || path === school;
export interface Passive {
  id: string;
  name: string;
  mark: string;
  desc: string;
  color: string;
  school: School;
}
export const DEMONIC_COUNTERPARTS: Record<string, string> = {
  power: 'blood',
  haste: 'frenzy',
  area: 'abyss',
  guard: 'bone',
  duration: 'devour',
  crit: 'curse',
  magnet: 'soul',
  spirit: 'forbidden',
};
export const PASSIVES: Passive[] = [
  {
    id: 'power',
    school: 'orthodox',
    name: '太玄剑经',
    mark: '玄',
    desc: '每重法宝伤害 +12%',
    color: '#e5d095',
  },
  {
    id: 'haste',
    school: 'orthodox',
    name: '周天星诀',
    mark: '星',
    desc: '每重施法间隔 -7%',
    color: '#bdb1e7',
  },
  {
    id: 'area',
    school: 'orthodox',
    name: '乾坤道法',
    mark: '坤',
    desc: '每重法术范围 +12%',
    color: '#a8d8bd',
  },
  {
    id: 'guard',
    school: 'orthodox',
    name: '金刚不坏',
    mark: '罡',
    desc: '每重气血上限 +20，承受伤害 -6%',
    color: '#e2c286',
  },
  {
    id: 'duration',
    school: 'orthodox',
    name: '长生真经',
    mark: '生',
    desc: '每重法术持续时间 +18%，每秒回复气血 +0.2',
    color: '#b8d794',
  },
  {
    id: 'crit',
    school: 'orthodox',
    name: '破妄心诀',
    mark: '心',
    desc: '每重暴击率 +7%，移动速度 +3%',
    color: '#e4a6a1',
  },
  {
    id: 'magnet',
    school: 'orthodox',
    name: '吞天纳灵',
    mark: '灵',
    desc: '每重拾取范围 +28%，灵气获取 +8%；自动吸取附近掉落',
    color: '#9fd9db',
  },
  {
    id: 'spirit',
    school: 'orthodox',
    name: '紫府仙经',
    mark: '府',
    desc: '每重灵气获取 +15%，法宝伤害 +4%',
    color: '#c7b0e8',
  },

  {
    id: 'blood',
    name: '血煞真经',
    mark: '血',
    desc: '每重法宝伤害 +18%，承受伤害 +3%',
    color: '#dc8e9c',
    school: 'demonic',
  },
  {
    id: 'frenzy',
    name: '天魔解体',
    mark: '魔',
    desc: '每重施法间隔 -8%，气血上限 -2%；气血低于一半时，每重施法间隔额外 -2%、移动速度 +4%',
    color: '#d698bc',
    school: 'demonic',
  },
  {
    id: 'abyss',
    name: '九幽冥典',
    mark: '幽',
    desc: '每重法术范围 +16%，命中减速 0.15 秒，最终伤害 -2%',
    color: '#bca6de',
    school: 'demonic',
  },
  {
    id: 'bone',
    name: '白骨魔功',
    mark: '骨',
    desc: '每重气血上限 +18%，移动速度 -1%；受伤时骨刺反击，每重基础伤害为最大气血的 12%',
    color: '#dbcfb9',
    school: 'demonic',
  },
  {
    id: 'devour',
    name: '噬魂大法',
    mark: '噬',
    desc: '每重斩妖回复气血 0.18 + 最大气血的 0.02%，法术持续时间 +20%，自然恢复速度 -4%',
    color: '#c29bd9',
    school: 'demonic',
  },
  {
    id: 'curse',
    name: '厄运咒',
    mark: '咒',
    desc: '每重暴击率 +8%，暴击伤害倍率 +0.12，承受伤害 +1.5%',
    color: '#dca3b4',
    school: 'demonic',
  },
  {
    id: 'soul',
    name: '拘魂秘术',
    mark: '魂',
    desc: '每重灵气获取 +10%，施法间隔 +1%；首重拘取周围 160 像素内斩妖灵气，之后每重范围 +50 像素',
    color: '#aaaedc',
    school: 'demonic',
  },
  {
    id: 'forbidden',
    name: '逆命魔典',
    mark: '逆',
    desc: '每重灵气获取 +18%，法宝伤害 +8%，承受伤害 +1.5%',
    color: '#d7a2b6',
    school: 'demonic',
  },
];
export function evolutionPassives(t: Treasure, path: CultivationPath = 'dual') {
  return [t.passive, DEMONIC_COUNTERPARTS[t.passive]].filter((id) =>
    allowsSchool(path, passive(id).school),
  );
}
export const REALMS = ['炼气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '真仙'];
export const REALM_VERSES: Record<string, string> = {
  炼气: '一息引灵 · 初叩仙途',
  筑基: '道基初定 · 凡骨渐蜕',
  金丹: '金丹照命 · 始知春短',
  元婴: '婴成紫府 · 回首千秋',
  化神: '神游天地 · 一念山河',
  炼虚: '虚中问道 · 不逐浮尘',
  合体: '身与道合 · 万象归心',
  大乘: '岁月无侵 · 大道未尽',
  渡劫: '雷叩仙关 · 生死一念',
  真仙: '长生已证 · 犹念人间',
};
export const REALM_LIFESPANS = [100, 250, 500, 1000, 2000, 5000, 10000, Infinity, Infinity];
export const STAGE_YEARS_PER_MINUTE = [10, 25, 50, 100, 200, 500, 1000];
export const FINAL_TRIAL_STAGE = 6;
export function tribulationRules(round: number) {
  const tier = Math.min(4, Math.max(0, round - 1));
  const extra = Math.max(0, round - 5);
  return {
    hp: [5000, 8000, 12000, 20000, 40000][tier] * (1 + extra * 0.35),
    damage: Math.min(0.65, [0.25, 0.28, 0.32, 0.38, 0.55][tier] + extra * 0.025),
    warning: Math.max(0.55, [1.2, 1.1, 1, 0.85, 0.7][tier] - extra * 0.015),
    interval: Math.max(1.2, [3.4, 3.1, 2.8, 2.4, 1.8][tier] - extra * 0.035),
    opening: Math.max(0.65, [2.8, 2.5, 2.2, 1.8, 1][tier] - extra * 0.025),
    openingDamage: [0.26, 0.24, 0.22, 0.18, 0.03][tier],
  };
}
export const TRIAL_BOSS_STAGES = [0, 1, 2, 3, 4, 5, 6];
export const TRIAL_BOSS_TIMES = [60, 120, 180, 240, 300, 360, 420];
export const TRIAL_ENEMY_TIMES = [0, 45, 90, 150];
// 固定秘境强度，不随玩家境界或灵威追涨；普通怪的伤害增幅低于精英与妖王。
export const STAGE_COMBAT_SCALING = [
  { hp: 1, damage: 1 },
  { hp: 1.08, damage: 1.08 },
  { hp: 1.16, damage: 1.16, elite: { hp: 1.25, damage: 1.2, speed: 1.08 } },
  { hp: 1.25, damage: 1.24, elite: { hp: 1.35, damage: 1.3, speed: 1.12 } },
  { hp: 1.35, damage: 1.32, elite: { hp: 1.45, damage: 1.4, speed: 1.16 } },
  { hp: 1.45, damage: 1.42, elite: { hp: 1.55, damage: 1.5, speed: 1.2 } },
  { hp: 1.35, damage: 1.35 },
];
export const STAGES = [
  {
    name: '青岚竹海',
    terrain: '/assets/terrain.webp',
    subtitle: '竹影藏灵 · 初入仙途',
    chapter: '壹',
    minutes: 3,
    color: '#9fc6aa',
    boss: '苍木妖王',
    skills: ['万木囚笼', '荆棘散射', '唤醒山灵'],
    sprite: 30,
    reward: 100,
    description: '古道生苔，青岚漫野。于竹海深处，踏出问道的第一步。',
  },
  {
    name: '落霞古墟',
    terrain: '/assets/terrain-ruins.webp',
    subtitle: '古阵余烬 · 妖影渐生',
    chapter: '贰',
    minutes: 3,
    color: '#d6b784',
    boss: '赤炎狐王',
    skills: ['九尾炎扇', '焚天火径', '赤焰轮舞'],
    sprite: 31,
    reward: 160,
    description: '夕照古墟，离火未熄。疾行的狐妖在残垣间伺机而动。',
  },
  {
    name: '玄冰幽谷',
    terrain: '/assets/terrain-ice.webp',
    subtitle: '千载寒霜 · 冰魄凝心',
    chapter: '叁',
    minutes: 4,
    color: '#a8cfdc',
    boss: '霜魄狼王',
    skills: ['踏雪突袭', '霜牙连射', '玄冰牢狱'],
    sprite: 32,
    reward: 240,
    description: '冰魄凝谷，寒意入骨。穿过狼群，寻得幽谷中的一线生机。',
  },
  {
    name: '万毒深泽',
    terrain: '/assets/terrain-marsh.webp',
    subtitle: '瘴云蔽日 · 万物归寂',
    chapter: '肆',
    minutes: 4,
    color: '#bcc895',
    boss: '玄甲毒君',
    skills: ['五毒瘴池', '蚀骨毒矢', '万蛊复生'],
    sprite: 33,
    reward: 340,
    description: '幽泽瘴气千重，毒灵四伏。唯有攻守兼备，方能涉水而归。',
  },
  {
    name: '九幽冥府',
    terrain: '/assets/terrain-nether.webp',
    subtitle: '百鬼夜行 · 一剑镇魂',
    chapter: '伍',
    minutes: 5,
    color: '#baa2d0',
    boss: '九幽冥主',
    skills: ['百鬼夜行', '摄魂灵轮', '六道鬼牢'],
    sprite: 34,
    reward: 460,
    description: '幽冥之门洞开，万千魂影涌现。执剑守心，莫入迷途。',
  },
  {
    name: '太虚天境',
    terrain: '/assets/terrain-heaven.webp',
    subtitle: '雷劫淬身 · 问道长生',
    chapter: '陆',
    minutes: 5,
    color: '#e0d7b2',
    boss: '太虚劫灵',
    skills: ['十字天雷', '太虚星环', '陨星天罚'],
    sprite: 35,
    reward: 600,
    description: '九天雷动，太虚无垠。历过重重天劫，叩问长生之门。',
  },
  {
    name: '万劫归墟',
    terrain: '/assets/terrain-trial.webp',
    subtitle: '仙尊问劫 · 大乘破关',
    chapter: '柒',
    minutes: 7,
    color: '#c8b981',
    boss: '九天执劫仙尊',
    skills: ['诛仙雷轮', '五方劫雷', '八荒封天', '天罡剑潮', '金阙天兵', '踏云雷袭'],
    sprite: 80,
    reward: 1200,
    description:
      '终极试炼，全员精英。六位妖王每分钟依次复临，第七分钟九天执劫仙尊降临。尽破七劫，修为达标即可渡劫飞升、成就真仙。建议大乘、炼器与完整搭配后挑战。',
  },
];
export const DIFFICULTIES = [
  {
    name: '初入仙途',
    label: '从容修行',
    hp: 0.85 * 1.03,
    damage: 0.72 * 1.02,
    amount: 0.9,
    reward: 1,
  },
  { name: '问道试炼', label: '妖潮渐涌', hp: 1.12 * 1.03, damage: 1.02, amount: 1.13, reward: 1.5 },
  {
    name: '天劫降临',
    label: '险中求道',
    hp: 1.9 * 1.03,
    damage: 1.45 * 1.02,
    amount: 1.35,
    reward: 2.2,
  },
];
export const ENEMIES = [
  {
    name: '赤伞菇妖',
    sprite: 1,
    hp: 24,
    speed: 48,
    damage: 8,
    radius: 15,
    behavior: 'chase',
    xp: 3,
  },
  {
    name: '青鬃灵狼',
    sprite: 2,
    hp: 32,
    speed: 94,
    damage: 10,
    radius: 17,
    behavior: 'chase',
    xp: 4,
  },
  {
    name: '碧火游魂',
    sprite: 3,
    hp: 28,
    speed: 56,
    damage: 9,
    radius: 14,
    behavior: 'ranged',
    xp: 4,
  },
  {
    name: '逐影妖狐',
    sprite: 5,
    hp: 42,
    speed: 71,
    damage: 12,
    radius: 17,
    behavior: 'dash',
    xp: 5,
  },
  {
    name: '玄甲石龟',
    sprite: 7,
    hp: 140,
    speed: 32,
    damage: 15,
    radius: 23,
    behavior: 'tank',
    xp: 8,
  },
  {
    name: '紫袍咒师',
    sprite: 6,
    hp: 58,
    speed: 42,
    damage: 12,
    radius: 17,
    behavior: 'ranged',
    xp: 7,
  },
  {
    name: '赤焰爆菇',
    sprite: 8,
    hp: 30,
    speed: 80,
    damage: 17,
    radius: 15,
    behavior: 'explode',
    xp: 5,
  },
  {
    name: '霜牙妖狼',
    sprite: 9,
    hp: 64,
    speed: 83,
    damage: 14,
    radius: 20,
    behavior: 'dash',
    xp: 7,
  },
  {
    name: '摄魂使',
    sprite: 10,
    hp: 95,
    speed: 35,
    damage: 13,
    radius: 20,
    behavior: 'summon',
    xp: 10,
  },
  {
    name: '剧毒妖灵',
    sprite: 11,
    hp: 44,
    speed: 63,
    damage: 12,
    radius: 17,
    behavior: 'poison',
    xp: 6,
  },
  {
    name: '苍木树卫',
    sprite: 4,
    hp: 200,
    speed: 37,
    damage: 19,
    radius: 27,
    behavior: 'tank',
    xp: 12,
  },
  {
    name: '金尾幻狐',
    sprite: 12,
    hp: 80,
    speed: 107,
    damage: 13,
    radius: 19,
    behavior: 'dash',
    xp: 8,
  },

  {
    name: '冰晶螯虫',
    sprite: 14,
    hp: 72,
    speed: 72,
    damage: 13,
    radius: 17,
    behavior: 'chase',
    xp: 7,
  },
  {
    name: '玄霜鹤灵',
    sprite: 15,
    hp: 66,
    speed: 52,
    damage: 14,
    radius: 18,
    behavior: 'volley',
    xp: 8,
  },
  {
    name: '寒铁傀儡',
    sprite: 16,
    hp: 170,
    speed: 35,
    damage: 18,
    radius: 24,
    behavior: 'shield',
    xp: 12,
  },
  {
    name: '雪魄镜妖',
    sprite: 17,
    hp: 85,
    speed: 38,
    damage: 15,
    radius: 19,
    behavior: 'nova',
    xp: 10,
  },
  {
    name: '碧甲毒蝎',
    sprite: 18,
    hp: 95,
    speed: 66,
    damage: 15,
    radius: 20,
    behavior: 'poison',
    xp: 9,
  },
  {
    name: '瘴囊蟾蜍',
    sprite: 19,
    hp: 110,
    speed: 42,
    damage: 18,
    radius: 21,
    behavior: 'explode',
    xp: 10,
  },
  {
    name: '翡翠妖螳',
    sprite: 20,
    hp: 80,
    speed: 88,
    damage: 16,
    radius: 20,
    behavior: 'dash',
    xp: 10,
  },
  {
    name: '盘香蛇母',
    sprite: 21,
    hp: 115,
    speed: 35,
    damage: 15,
    radius: 23,
    behavior: 'summon',
    xp: 12,
  },
  {
    name: '冥骨剑卒',
    sprite: 22,
    hp: 98,
    speed: 72,
    damage: 17,
    radius: 20,
    behavior: 'chase',
    xp: 11,
  },
  {
    name: '锁狱刑卫',
    sprite: 23,
    hp: 200,
    speed: 38,
    damage: 21,
    radius: 26,
    behavior: 'shield',
    xp: 16,
  },
  {
    name: '白无常',
    sprite: 24,
    hp: 108,
    speed: 42,
    damage: 17,
    radius: 21,
    behavior: 'volley',
    xp: 13,
  },
  {
    name: '噬心夜叉',
    sprite: 25,
    hp: 90,
    speed: 94,
    damage: 18,
    radius: 20,
    behavior: 'dash',
    xp: 12,
  },
  {
    name: '金甲天将',
    sprite: 26,
    hp: 140,
    speed: 62,
    damage: 19,
    radius: 24,
    behavior: 'dash',
    xp: 15,
  },
  {
    name: '星羽凰灵',
    sprite: 27,
    hp: 105,
    speed: 60,
    damage: 17,
    radius: 21,
    behavior: 'volley',
    xp: 14,
  },
  {
    name: '太古钟灵',
    sprite: 28,
    hp: 220,
    speed: 32,
    damage: 21,
    radius: 25,
    behavior: 'nova',
    xp: 18,
  },
  {
    name: '虚空星君',
    sprite: 29,
    hp: 130,
    speed: 38,
    damage: 19,
    radius: 23,
    behavior: 'summon',
    xp: 16,
  },
];
// 地域进阶种沿用基础行为，拥有独立立绘和随秘境提升的基础数值。
for (const region of [
  {
    stage: 1,
    sprite: 36,
    names: [
      '熔岩菇兵',
      '赤铜战獒',
      '陶面炎灵',
      '赤砂灵狐',
      '古殿铜龟',
      '黄符祭师',
      '爆炎陶俑',
      '裂焰剑齿兽',
      '铜铃祭司',
      '烟尾砂蝎',
      '赤陶戟卫',
      '流金风狐',
    ],
  },
  {
    stage: 2,
    sprite: 48,
    names: [
      '冰冠菇灵',
      '玄冰战狼',
      '寒晶魄火',
      '雪尾灵狐',
      '冰岳玄龟',
      '霜袍巫师',
      '裂冰妖核',
      '提灯雪巫',
    ],
  },
  {
    stage: 3,
    sprite: 56,
    names: [
      '瘴孢菇妖',
      '荆棘沼獒',
      '紫瘴怨灵',
      '藤尾妖狐',
      '苔甲鳄龟',
      '瘴袍毒巫',
      '爆孢妖囊',
      '万蛊祭司',
    ],
  },
  {
    stage: 4,
    sprite: 64,
    names: [
      '白骨菇鬼',
      '冥火骨獒',
      '无面幽魂',
      '幽月冥狐',
      '负碑冥龟',
      '赤袍咒鬼',
      '爆魂冥瓮',
      '引魂灯使',
    ],
  },
  {
    stage: 5,
    sprite: 72,
    names: [
      '金纹仙菇',
      '银霆天狼',
      '曜日星灵',
      '流云天狐',
      '金阙玄龟',
      '御星法使',
      '裂雷灵核',
      '星轮召灵使',
    ],
  },
]) {
  const archetypes =
    region.stage === 1 ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] : [0, 1, 2, 3, 4, 5, 6, 8];
  region.names.forEach((name, index) => {
    const base = ENEMIES[archetypes[index]];
    ENEMIES.push({
      ...base,
      name,
      sprite: region.sprite + index,
      hp: Math.round(base.hp * (1 + region.stage * 0.3)),
      damage: Math.round(base.damage * (1 + region.stage * 0.08)),
      xp: Math.round(base.xp * (1 + region.stage * 0.15)),
    });
  });
}
// 每三种为一批：基础兵种、突袭兵种、强敌、压轴兵种。
export const STAGE_ENEMIES = [
  [0, 1, 2, 3, 5, 6, 4, 7, 9, 8, 10, 11],
  [28, 29, 30, 31, 33, 34, 32, 35, 37, 36, 38, 39],
  [40, 41, 42, 43, 12, 46, 44, 45, 13, 14, 15, 47],
  [48, 49, 50, 51, 53, 54, 52, 16, 17, 18, 19, 55],
  [56, 57, 58, 59, 61, 62, 60, 20, 23, 21, 22, 63],
  [64, 65, 66, 67, 69, 70, 24, 25, 68, 26, 27, 71],
  [65, 66, 59, 67, 61, 62, 69, 24, 25, 27, 63, 71],
];
export const ENEMY_SKILLS = {
  ranged: {
    name: '灵弹狙击',
    hint: '直线灵弹，横移避开',
    eliteHint: '直线灵弹，横移避开',
  },
  volley: { name: '裂羽散射', hint: '三枚扇形灵弹，穿过间隙', eliteHint: '五枚扇形灵弹，留意侧翼' },
  nova: { name: '灵轮震荡', hint: '八枚灵弹向外扩散', eliteHint: '十枚灵弹环射，保持距离' },
  dash: {
    name: '蓄势扑杀',
    hint: '锁定直线后扑击，侧向避让',
    eliteHint: '锁定直线后扑击，侧向避让',
  },
  stomp: { name: '撼地重击', hint: '近身蓄力震地，离开红圈', eliteHint: '原地及前方连续震击' },
  summon: { name: '唤卫护阵', hint: '召来两名护卫，优先击杀', eliteHint: '召来三名护卫，优先击杀' },
  roots: { name: '青藤缠足', hint: '藤阵伤害并短暂减速', eliteHint: '双阵缠足，移速降低 25%' },
  firepath: { name: '离火封路', hint: '两段火径，侧向脱离', eliteHint: '三段火径封路，侧向脱离' },
  frost: { name: '寒霜凝阵', hint: '寒阵伤害并短暂减速', eliteHint: '双阵夹击，移速降低 25%' },
  miasma: { name: '瘴池蔓延', hint: '预警后留下持续毒池', eliteHint: '双池封路，绕开毒圈' },
  soul: { name: '摄魂交射', hint: '两侧灵弹向前交汇', eliteHint: '四道交叉灵弹，穿过间隙' },
  storm: {
    name: '引雷落印',
    hint: '落雷锁定旧位置，及时离开',
    eliteHint: '三处错时落雷，持续移动',
  },
};
export type EnemySkill = keyof typeof ENEMY_SKILLS;
// 前六境法师保留弹道攻击；重甲近身震地，追击精英蓄势扑杀。
export const ENEMY_TACTICS = ENEMIES.map((enemy) => {
  const flank = enemy.behavior === 'chase' && /狼|獒|剑卒/.test(enemy.name);
  const skills: Record<string, EnemySkill | null> = {
    chase: null,
    ranged: 'ranged',
    dash: 'dash',
    tank: 'stomp',
    shield: 'stomp',
    explode: null,
    summon: 'summon',
    poison: 'ranged',
    volley: 'volley',
    nova: 'nova',
  };
  const skill = skills[enemy.behavior];
  const eliteSkill = enemy.behavior === 'chase' ? 'dash' : skill;
  return { flank, skill, eliteSkill };
});
export function enemyWave(stage: number, seconds: number) {
  if (stage === FINAL_TRIAL_STAGE)
    return TRIAL_ENEMY_TIMES.filter((time) => time <= Math.max(0, seconds)).length - 1;
  return Math.min(3, Math.floor((Math.max(0, seconds) / (STAGES[stage].minutes * 60)) * 4));
}
export function enemyRoster(stage: number, seconds: number) {
  const count = stage === 0 && seconds < 20 ? 1 : (enemyWave(stage, seconds) + 1) * 3;
  return STAGE_ENEMIES[stage].slice(0, count);
}
export const MAX_WEAPONS = 6;
export const MAX_PASSIVES = 4;
export const MAX_WEAPON_LEVEL = 6;
export const MAX_RUN_LEVEL = 100;
export const MAX_REVIVES = 1;
export const MAX_FORGE_LEVEL = 10;
export const AD_SUPPLIES = { stones: 300, iron: 30 };
export const MAX_PASSIVE_LEVEL = 5;
export const TAU = Math.PI * 2;
export const treasure = (id: string) => TREASURES.find((t) => t.id === id)!;
export const passive = (id: string) => PASSIVES.find((p) => p.id === id)!;
export const xpNeeded = (level: number) =>
  Math.round((12 + level * 6 + level ** 1.45 * 2) * (1 + Math.max(0, level - 60) ** 2 / 180));
export const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0')}`;
