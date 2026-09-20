import { TOWN_NPCS, type TownNpc } from './town.ts';
import { NPC_SETTINGS } from './setting.ts';

// 小型中文词库组合，不引入运行时网络请求或整套假数据依赖。
const SURNAMES = [
  ...'赵钱孙李周吴郑王冯陈蒋沈韩杨朱秦许何吕张孔曹严华金魏陶姜戚谢邹苏潘葛范彭鲁韦马苗方任袁柳史唐薛雷贺倪汤滕殷罗毕郝邬安常乐于傅齐康',
];
const GIVEN_NAMES = (
  '长安 永宁 守仁 怀信 景明 云生 清和 知秋 望舒 清禾 嘉禾 云舟 ' +
  '春生 秋实 冬青 平安 百川 远山 松年 竹青 文安 行舟 安之 南星 ' +
  '向晚 小满 立春 谷雨 怀谷 念慈 如玉 采薇 知夏 书宁 若兰 玉棠 ' +
  '素月 晴川 沐风 云归 见山 闻溪 怀瑾 明轩 仲平 长庚 敬之 守拙 ' +
  '怀远 安民 乐山 修竹 清泉 景行 归鸿 望山 庭柏 玉笙 问柳 照溪 ' +
  '闻笛 听澜 星河 秋白'
).split(' ');
const NAME_COUNT = SURNAMES.length * GIVEN_NAMES.length;

export interface TownPopulation {
  seed: number;
  since: number;
}
export type TownResident = TownNpc & {
  name: string;
  generation: number;
  arrivedAt: number;
  leavesAt: number;
  tint: number;
};

export function freshTownPopulation(age: number, random = Math.random): TownPopulation {
  return { seed: Math.floor(random() * 0x100000000), since: age };
}
export function validTownPopulation(value: unknown): value is TownPopulation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const p = value as TownPopulation;
  return (
    Number.isSafeInteger(p.seed) &&
    p.seed >= 0 &&
    p.seed < 0x100000000 &&
    typeof p.since === 'number' &&
    Number.isFinite(p.since) &&
    p.since >= 0
  );
}
function hash(seed: number, key: string) {
  let value = seed;
  for (const char of key) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  value ^= value >>> 16;
  return value >>> 0;
}
export function townResidents(
  population: TownPopulation,
  age: number,
  npcs: readonly TownNpc[] = TOWN_NPCS,
): TownResident[] {
  const elapsed = Math.max(0, age - population.since);
  const period = (NPC_SETTINGS.lifespanMinYears + NPC_SETTINGS.lifespanMaxYears) / 2;
  const variation =
    Math.floor((NPC_SETTINGS.lifespanMaxYears - NPC_SETTINGS.lifespanMinYears) / 2) + 1;
  const namesPerNpc = Math.floor(NAME_COUNT / TOWN_NPCS.length);
  return npcs.map((npc, index) => {
    const offset = hash(population.seed, `${npc.id}:offset`) % variation;
    // 相邻换代节点相隔 60 + (0…10) - (0…10) 年，始终为 50–70 年。
    // 直接定位当前一代，万年闭关也不逐代循环或生成历史人物。
    const boundary = (generation: number) =>
      generation === 0
        ? 0
        : generation * period -
          offset +
          (hash(population.seed, `${npc.id}:${generation}`) % variation);
    let generation = Math.floor(elapsed / period);
    // 用绝对节点比较，避免小数年岁相减后在换代瞬间落回上一代。
    if (generation > 0 && age < population.since + boundary(generation)) generation--;
    else if (age >= population.since + boundary(generation + 1)) generation++;
    // 各位置使用交错的姓名序列：同镇不重名，也不会因别人换代而改名。
    const variant =
      (hash(population.seed, npc.id) + (generation % namesPerNpc) * 137) % namesPerNpc;
    const nameIndex = variant * TOWN_NPCS.length + index;
    const name =
      SURNAMES[Math.floor(nameIndex / GIVEN_NAMES.length)] +
      GIVEN_NAMES[nameIndex % GIVEN_NAMES.length];
    return {
      ...npc,
      name,
      generation,
      arrivedAt: population.since + boundary(generation),
      leavesAt: population.since + boundary(generation + 1),
      tint: ((hash(population.seed, `${npc.id}:tint`) + generation * 3) % 9) * 8 - 32,
    };
  });
}
