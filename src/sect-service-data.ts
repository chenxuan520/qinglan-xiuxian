import { PASSIVES } from './data.ts';

// 卡片只加载专长简介；报价、结算和表单随坊中事务模块按需加载。
export const SECT_SPECIALTIES: Record<string, { title: string; text: string }> = {
  power: {
    title: '剑阁代寻',
    text: '寻访本门配方或本命同五行法宝，少付酬金、增加机会；可能落空，寻得后收入收藏。',
  },
  haste: { title: '星盘推演', text: '多付灵石，缩短本门精研年岁。' },
  area: { title: '乾坤换丹', text: '以余丹折值，跨品级换取合用的时效丹。' },
  guard: { title: '金身苦修', text: '淬体少花灵石，耗时加倍。' },
  duration: { title: '药庐代炼', text: '沿用已知丹方与原料，加价换取更快成丹。' },
  crit: { title: '观丹辨方', text: '持有样丹即可折价参悟其丹方，需花年岁。' },
  magnet: { title: '聚材修习', text: '玄铁可折抵部分根基修习灵石，多花些年岁。' },
  spirit: { title: '静室参悟', text: '本门精研费用更低，耗时加倍。' },
  blood: { title: '血池炼体', text: '淬体费用更低，耗时为通常三倍。' },
  frenzy: {
    title: '魔器代寻',
    text: '寻访本门配方或本命同五行法宝，少付酬金、增加机会；可能落空，寻得后收入收藏。',
  },
  abyss: { title: '幽府易丹', text: '偏重护持、御器与延时之丹，可跨品级折换。' },
  bone: { title: '旧器供研', text: '非本命法宝抵价连续精研，差额补灵石；用不完抵价则保留法宝。' },
  devour: { title: '余丹养躯', text: '一份时效丹抵价连续淬体，差额补灵石；用不完抵价则保留丹药。' },
  curse: { title: '咒丹互易', text: '以同品级余丹，低折损换取攻伐与破妄之丹。' },
  soul: { title: '玄铁炼影', text: '玄铁可折抵更多身法费用，耗时加倍。' },
  forbidden: { title: '逆命悟道', text: '悟道费用更低，耗时为通常四倍。' },
};

export interface SectServiceState {
  lastAt: number | null;
  receipts: { sect: string; at: number; text: string }[];
}
export function validSectServices(value: unknown, age: number): value is SectServiceState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const s = value as SectServiceState;
  const at = (n: unknown): n is number =>
    typeof n === 'number' && Number.isFinite(n) && n >= 15 && n <= age;
  return (
    (s.lastAt === null || at(s.lastAt)) &&
    Array.isArray(s.receipts) &&
    s.receipts.length <= 6 &&
    s.receipts.every(
      (r) =>
        r &&
        PASSIVES.some((p) => p.id === r.sect) &&
        at(r.at) &&
        typeof r.text === 'string' &&
        r.text.length > 0 &&
        r.text.length <= 600,
    )
  );
}
