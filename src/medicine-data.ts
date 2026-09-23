export interface Medicine {
  id: string;
  name: string;
  tier: '凡品' | '灵品' | '珍品';
  years: number;
  desc: string;
  stage: number;
  price: number;
  craftYears: number;
}

export const MEDICINES: Medicine[] = [
  {
    id: 'huanglong',
    name: '黄龙丹',
    tier: '凡品',
    years: 100,
    desc: '法宝伤害 +10%。',
    stage: 0,
    price: 40,
    craftYears: 0,
  },
  {
    id: 'jinsui',
    name: '金髓丸',
    tier: '凡品',
    years: 100,
    desc: '气血上限 +10%。',
    stage: 0,
    price: 40,
    craftYears: 0,
  },
  {
    id: 'yangjing',
    name: '养精丹',
    tier: '凡品',
    years: 100,
    desc: '基础恢复速度 +30%。',
    stage: 0,
    price: 30,
    craftYears: 0,
  },
  {
    id: 'qingling',
    name: '清灵散',
    tier: '凡品',
    years: 100,
    desc: '毒池伤害降低 20%。',
    stage: 0,
    price: 35,
    craftYears: 0,
  },
  {
    id: 'huxin',
    name: '护心丸',
    tier: '凡品',
    years: 100,
    desc: '受到伤害降低 5%。',
    stage: 0,
    price: 45,
    craftYears: 0,
  },
  {
    id: 'bigu',
    name: '辟谷丹',
    tier: '凡品',
    years: 100,
    desc: '气血上限 +5%，基础恢复速度 +15%。',
    stage: 0,
    price: 35,
    craftYears: 0,
  },
  {
    id: 'yingxiang',
    name: '萦香丸',
    tier: '凡品',
    years: 100,
    desc: '移速 +6%，拾取范围 +15%。',
    stage: 0,
    price: 45,
    craftYears: 0,
  },
  {
    id: 'chousui',
    name: '抽髓丸',
    tier: '凡品',
    years: 100,
    desc: '法宝伤害 +18%，气血上限降低 8%。',
    stage: 0,
    price: 50,
    craftYears: 0,
  },
  {
    id: 'heqi',
    name: '合气丹',
    tier: '灵品',
    years: 1000,
    desc: '法宝伤害 +18%。',
    stage: 1,
    price: 0,
    craftYears: 50,
  },
  {
    id: 'zhenyuan',
    name: '真元丹',
    tier: '灵品',
    years: 1000,
    desc: '气血上限 +18%，基础恢复速度 +20%。',
    stage: 1,
    price: 0,
    craftYears: 50,
  },
  {
    id: 'juyuan',
    name: '聚灵丹',
    tier: '灵品',
    years: 1000,
    desc: '法宝攻击冷却缩短 8%。',
    stage: 1,
    price: 0,
    craftYears: 50,
  },
  {
    id: 'jiangchen',
    name: '降尘丹',
    tier: '灵品',
    years: 1000,
    desc: '暴击率 +4 个百分点。',
    stage: 1,
    price: 0,
    craftYears: 50,
  },
  {
    id: 'fenyuan',
    name: '分元丹',
    tier: '灵品',
    years: 1000,
    desc: '法宝范围 +15%。',
    stage: 1,
    price: 0,
    craftYears: 50,
  },
  {
    id: 'lianqi',
    name: '炼气散',
    tier: '灵品',
    years: 1000,
    desc: '法宝持续效果时间 +20%。',
    stage: 1,
    price: 0,
    craftYears: 50,
  },
  {
    id: 'zengyuan',
    name: '增元丹',
    tier: '灵品',
    years: 1000,
    desc: '普通与精英击杀修为 +10%，不增加妖王修为或局内灵气。',
    stage: 1,
    price: 0,
    craftYears: 50,
  },
  {
    id: 'zhiyuan',
    name: '至元丹',
    tier: '灵品',
    years: 1000,
    desc: '受到伤害降低 8%，基础恢复速度 +30%。',
    stage: 1,
    price: 0,
    craftYears: 50,
  },
  {
    id: 'mingqing',
    name: '明清灵水',
    tier: '珍品',
    years: 5000,
    desc: '暴击率 +6 个百分点，对精英与妖王伤害 +15%。',
    stage: 2,
    price: 0,
    craftYears: 500,
  },
  {
    id: 'lingru',
    name: '万年灵乳',
    tier: '珍品',
    years: 10000,
    desc: '法宝攻击冷却缩短 12%，持续效果时间 +20%。',
    stage: 3,
    price: 0,
    craftYears: 500,
  },
  {
    id: 'dingling',
    name: '定灵丹',
    tier: '珍品',
    years: 5000,
    desc: '受到的减速强度减半，魔道功法的负面数值减半，正向效果不变。',
    stage: 2,
    price: 0,
    craftYears: 500,
  },
  {
    id: 'xuling',
    name: '虚灵丹',
    tier: '珍品',
    years: 5000,
    desc: '普通与精英击杀修为 +20%，妖王修为 +30%；不增加局内灵气与通关额外修为。',
    stage: 3,
    price: 0,
    craftYears: 500,
  },
  {
    id: 'xuepo',
    name: '雪魄丸',
    tier: '珍品',
    years: 5000,
    desc: '受到伤害降低 12%，每 8 秒释放寒气，减速周围敌人 2 秒。',
    stage: 3,
    price: 0,
    craftYears: 500,
  },
  {
    id: 'dulong',
    name: '毒龙珠',
    tier: '珍品',
    years: 5000,
    desc: '最终法宝伤害 +30%，气血上限降低 10%。',
    stage: 4,
    price: 0,
    craftYears: 500,
  },
  {
    id: 'wuchang',
    name: '无常丹',
    tier: '珍品',
    years: 5000,
    desc: '毒池伤害降低 40%，不减免其他攻击。',
    stage: 2,
    price: 0,
    craftYears: 500,
  },
  {
    id: 'jiangyun',
    name: '绛云丹',
    tier: '珍品',
    years: 5000,
    desc: '移速 +12%，拾取范围 +50%。',
    stage: 2,
    price: 0,
    craftYears: 500,
  },
  {
    id: 'butian',
    name: '补天丹',
    tier: '珍品',
    years: 0,
    desc: '灵根品质提升一档，新灵根的数量与五行随机生成，不能自选；最高天灵根。',
    stage: 4,
    price: 0,
    craftYears: 0,
  },
  {
    id: 'huiyang',
    name: '回阳水',
    tier: '珍品',
    years: 0,
    desc: '增加当前境界基础寿元的 25%，每世最多两次；长生境界不可服用。',
    stage: 4,
    price: 0,
    craftYears: 0,
  },
  {
    id: 'peiying',
    name: '培婴丹',
    tier: '珍品',
    years: 0,
    desc: '本世气血上限、基础恢复速度各 +5%，每世最多三次。',
    stage: 4,
    price: 0,
    craftYears: 0,
  },
  {
    id: 'jiuqu',
    name: '九曲灵参丹',
    tier: '珍品',
    years: 0,
    desc: '获得当前大境界总修为的 8%，每个大境界限一次；大乘及以上无效，不能跳过成仙关卡。',
    stage: 4,
    price: 0,
    craftYears: 0,
  },
];
export const medicineInfo = (id: string) => MEDICINES.find((m) => m.id === id);
export interface MedicineState {
  bag: Record<string, number>;
  active: Record<string, number>;
  used: Record<string, number>;
  firstClears: number[];
  recipes: string[];
  recipeSeed: number;
  shop: { ids: string[]; refreshAt: number; bought?: Record<string, number> } | null;
}
export const freshMedicine = (random = Math.random): MedicineState => ({
  bag: {},
  active: {},
  used: {},
  firstClears: [],
  recipes: [],
  recipeSeed: Math.floor(random() * 4294967296),
  shop: null,
});
export function validMedicine(value: unknown): value is MedicineState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const s = value as MedicineState;
  const count = (n: unknown) => Number.isSafeInteger(n) && Number(n) >= 0;
  const record = (r: unknown): r is Record<string, number> =>
    !!r && typeof r === 'object' && !Array.isArray(r);
  const validIds = (ids: unknown, common = false): ids is string[] =>
    Array.isArray(ids) &&
    new Set(ids).size === ids.length &&
    ids.every((id) => {
      const m = medicineInfo(id);
      return !!m?.years && (!common || m.tier === '凡品');
    });
  return (
    count(s.recipeSeed) &&
    s.recipeSeed < 4294967296 &&
    validIds(s.recipes) &&
    s.recipes.every((id) => medicineInfo(id)!.tier !== '凡品') &&
    (s.shop === null ||
      (!!s.shop &&
        validIds(s.shop.ids, true) &&
        s.shop.ids.length === 3 &&
        Number.isFinite(s.shop.refreshAt) &&
        s.shop.refreshAt >= 0 &&
        (s.shop.bought === undefined ||
          (record(s.shop.bought) &&
            Object.entries(s.shop.bought).every(
              ([id, n]) => s.shop!.ids.includes(id) && count(n) && n <= 3,
            ))))) &&
    record(s.bag) &&
    record(s.active) &&
    record(s.used) &&
    Object.entries(s.bag).every(([id, n]) => !!medicineInfo(id) && count(n)) &&
    Object.keys(s.active).length <= 3 &&
    Object.entries(s.active).every(
      ([id, n]) => !!medicineInfo(id)?.years && Number.isFinite(n) && n >= 0,
    ) &&
    Object.entries(s.used).every(
      ([id, n]) =>
        count(n) &&
        (id === 'peiying'
          ? n <= 3
          : id === 'huiyang'
            ? n <= 2
            : /^jiuqu-[0-6]$/.test(id) && n <= 1),
    ) &&
    Array.isArray(s.firstClears) &&
    new Set(s.firstClears).size === s.firstClears.length &&
    s.firstClears.every((n) => Number.isInteger(n) && n >= 2 && n <= 6)
  );
}
export const activeMedicines = (s: MedicineState, age: number) =>
  MEDICINES.filter((m) => (s.active[m.id] || 0) > age);
export function medicineEffects(s: MedicineState, age: number) {
  const has = (id: string) => (s.active[id] || 0) > age;
  return {
    expiresAt: Math.min(Infinity, ...Object.values(s.active).filter((end) => end > age)),
    damage:
      (has('huanglong') ? 1.1 : 1) *
      (has('heqi') ? 1.18 : 1) *
      (has('dulong') ? 1.3 : 1) *
      (has('chousui') ? 1.18 : 1),
    hp:
      (1 + (s.used.peiying || 0) * 0.05) *
      (has('jinsui') ? 1.1 : 1) *
      (has('zhenyuan') ? 1.18 : 1) *
      (has('dulong') ? 0.9 : 1) *
      (has('bigu') ? 1.05 : 1) *
      (has('chousui') ? 0.92 : 1),
    regen:
      (1 + (s.used.peiying || 0) * 0.05) *
      (has('yangjing') ? 1.3 : 1) *
      (has('zhenyuan') ? 1.2 : 1) *
      (has('bigu') ? 1.15 : 1) *
      (has('zhiyuan') ? 1.3 : 1),
    cooldown: (has('juyuan') ? 0.92 : 1) * (has('lingru') ? 0.88 : 1),
    duration: (has('lingru') ? 1.2 : 1) * (has('lianqi') ? 1.2 : 1),
    area: has('fenyuan') ? 1.15 : 1,
    speed: (has('jiangyun') ? 1.12 : 1) * (has('yingxiang') ? 1.06 : 1),
    magnet: (has('jiangyun') ? 1.5 : 1) * (has('yingxiang') ? 1.15 : 1),
    crit: (has('mingqing') ? 0.06 : 0) + (has('jiangchen') ? 0.04 : 0),
    eliteDamage: has('mingqing') ? 1.15 : 1,
    armor: (has('xuepo') ? 0.88 : 1) * (has('huxin') ? 0.95 : 1) * (has('zhiyuan') ? 0.92 : 1),
    frost: has('xuepo'),
    drawback: has('dingling') ? 0.5 : 1,
    poison: (has('wuchang') ? 0.6 : 1) * (has('qingling') ? 0.8 : 1),
    cultivation: (has('xuling') ? 1.2 : 1) * (has('zengyuan') ? 1.1 : 1),
    bossCultivation: has('xuling') ? 1.3 : 1,
  };
}
export function grantMedicine(s: MedicineState, id: string) {
  s.bag[id] = (s.bag[id] || 0) + 1;
  return medicineInfo(id)!.name;
}
export function medicineLoot(
  s: MedicineState,
  stage: number,
  firstClear: boolean,
  finalSovereign: boolean,
  random: () => number,
) {
  const rewards: string[] = [];
  const guarantee = stage >= 2 && firstClear && !s.firstClears.includes(stage);
  if (guarantee) s.firstClears.push(stage);
  const roll = random();
  const permanent =
    (stage === 6 && finalSovereign) || ((stage === 4 || stage === 5) && roll < 0.01);
  const give = (tier: Medicine['tier'], timed: boolean) => {
    const pool = MEDICINES.filter(
      (m) => m.stage <= Math.max(1, stage) && m.tier === tier && !!m.years === timed,
    );
    rewards.push(`${grantMedicine(s, pool[Math.floor(random() * pool.length)].id)} ×1`);
  };
  if (permanent) give('珍品', false);
  if (guarantee || (!permanent && stage >= 2 && roll < 0.16)) give('珍品', true);
  else if (!permanent && roll < (stage >= 2 ? 0.51 : 0.35)) give('灵品', true);
  return rewards;
}
export function townMedicineReward(s: MedicineState, kind: string, random: () => number) {
  if ((kind === 'herbs' && random() < 0.1) || (kind === 'tea' && random() < 0.02)) {
    return `${grantMedicine(s, MEDICINES[Math.floor(random() * 8)].id)} ×1`;
  }
  return '';
}
// 一世只存一个种子，配方按丹药 ID 确定；买方、刷新、换关均不会重抽。
export function medicineFormula(s: MedicineState, id: string) {
  const target = medicineInfo(id);
  if (!target?.years || target.tier === '凡品') return [];
  let seed = (s.recipeSeed ^ Math.imul(MEDICINES.indexOf(target) + 1, 2654435761)) >>> 0;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const pool = MEDICINES.filter((m) => m.tier === (target.tier === '灵品' ? '凡品' : '灵品'));
  const first = pool.splice(Math.floor(next() * pool.length), 1)[0];
  const second = pool[Math.floor(next() * pool.length)];
  return [
    { id: first.id, count: 2 },
    { id: second.id, count: target.tier === '灵品' ? 1 : 2 },
  ];
}
export function refreshMedicineShop(s: MedicineState, age: number, random = Math.random) {
  if (s.shop && age < s.shop.refreshAt) return false;
  const pool = MEDICINES.filter((m) => m.tier === '凡品');
  const ids: string[] = [];
  while (ids.length < 3) ids.push(pool.splice(Math.floor(random() * pool.length), 1)[0].id);
  const old = s.shop;
  s.shop = {
    ids,
    bought: {},
    refreshAt: old ? old.refreshAt + (Math.floor((age - old.refreshAt) / 10) + 1) * 10 : age + 10,
  };
  return true;
}
