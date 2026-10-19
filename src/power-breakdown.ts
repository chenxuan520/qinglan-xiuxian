import { CURIO_IDS, curioName, ownsCurio } from './curio-data.ts';
import {
  FINAL_TRIAL_STAGE,
  passive,
  spiritRootInfo,
  treasure,
  type CultivationPath,
} from './data.ts';
import { activeMedicines, medicineEffects } from './medicine-data.ts';
import { masteryBonus } from './mortal.ts';
import { realmInfo, type SaveData } from './progress.ts';
import { spiritPower } from './spirit-power.ts';

export const powerAttributes = [
  { key: 'weaponDamage', label: '本命单次基础伤害', unit: '', betterLow: false },
  { key: 'hp', label: '气血上限', unit: '', betterLow: false },
  { key: 'speed', label: '移速', unit: ' 像素/秒', betterLow: false },
  { key: 'cooldown', label: '施法间隔', unit: ' 倍', betterLow: true },
  { key: 'crit', label: '暴击率', unit: '', betterLow: false },
  { key: 'criticalDamage', label: '暴击伤害', unit: ' 倍', betterLow: false },
  { key: 'armor', label: '承伤比例', unit: '', betterLow: true },
  { key: 'regen', label: '每秒回血', unit: '', betterLow: false },
  { key: 'killHeal', label: '每次斩妖回血', unit: '', betterLow: false },
  { key: 'area', label: '招式范围', unit: ' 倍', betterLow: false },
  { key: 'duration', label: '持续时间', unit: ' 倍', betterLow: false },
  { key: 'magnet', label: '拾取范围', unit: ' 像素', betterLow: false },
  { key: 'xp', label: '灵气获取', unit: ' 倍', betterLow: false },
  { key: 'eliteDamage', label: '精英与妖王额外增伤', unit: ' 倍', betterLow: false },
  { key: 'poisonDamage', label: '毒伤承伤比例', unit: '', betterLow: true },
] as const;
export type PowerAttribute = (typeof powerAttributes)[number]['key'];

function snapshot(save: SaveData, path?: CultivationPath) {
  const power = spiritPower(save, path),
    weapon = treasure(power.weaponId),
    medicine = medicineEffects(save.medicine, save.age);
  return {
    ...power,
    weaponCooldown: weapon.cooldown * power.cooldown,
    eliteDamage: power.eliteDamage,
    poisonDamage: medicine.poison * power.armor,
  };
}

// 沿用真实入场计算，逐项移除后比较；不另抄伤害公式，不写档或推进时间。
export function powerBreakdown(save: SaveData) {
  const current = snapshot(save);
  const sources: { id: string; name: string; detail: string; without: SaveData }[] = [];
  const add = (id: string, name: string, detail: string, change: (copy: SaveData) => void) => {
    const without = structuredClone(save);
    // 与预览实际装备保持一致，包括路线不符时选用的入门本命。
    without.starter = current.weaponId;
    if (!without.artifacts.includes(current.weaponId)) without.artifacts.push(current.weaponId);
    change(without);
    sources.push({ id, name, detail, without });
  };
  if (save.cultivation > 0)
    add(
      'realm',
      '境界修为',
      realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).name,
      (s) => {
        s.cultivation = 0;
        s.completed = [];
      },
    );
  add('affinity', '五行契合', `${treasure(current.weaponId).name} · 本命五行加成`, (s) => {
    s.rootElements = [];
  });
  for (const [key, name] of [
    ['power', '悟道'],
    ['vitality', '淬体'],
    ['speed', '身法'],
  ] as const)
    if (save.training[key])
      add(key, name, `${save.training[key]}阶`, (s) => {
        s.training[key] = 0;
      });
  if (save.forge[current.weaponId])
    add('forge', '本命炼器', `${save.forge[current.weaponId]}阶`, (s) => {
      s.forge[current.weaponId] = 0;
    });
  if (current.path !== 'dual')
    add('path', '修行路线', current.path === 'orthodox' ? '正道' : '魔道', (s) => {
      s.path = 'dual';
    });
  if (save.mortal.member)
    add(
      'sect',
      '本门功法',
      `${passive(save.mortal.member.id).name}一重 · 精研正向效果 +${Math.round(masteryBonus(save, save.mortal.member.id) * 100)}%`,
      (s) => {
        s.mortal.member = null;
      },
    );
  if (Object.values(save.retreatBonus).some(Boolean))
    add('retreat', '闭关积累', '本世闭关收获', (s) => {
      s.retreatBonus = { vitality: 0, power: 0, speed: 0 };
    });
  if (save.tribulations)
    add('tribulations', '历劫道果', `${save.tribulations}次天劫`, (s) => {
      s.tribulations = 0;
    });
  if (save.medicine.used.peiying)
    add('peiying', '培婴丹药力', `本世已服${save.medicine.used.peiying}枚`, (s) => {
      s.medicine.used.peiying = 0;
    });
  for (const medicine of activeMedicines(save.medicine, save.age))
    add(
      `medicine:${medicine.id}`,
      medicine.name,
      `药效尚余${Number((save.medicine.active[medicine.id] - save.age).toFixed(1))}年`,
      (s) => {
        delete s.medicine.active[medicine.id];
      },
    );
  for (const id of CURIO_IDS)
    if (ownsCurio(save, id))
      add(`curio:${id}`, curioName(id), '随身奇物', (s) => {
        delete s.curios.bag[id];
      });
  const rows = sources
    .map(({ id, name, detail, without }) => {
      const base = snapshot(without, id === 'path' ? 'dual' : current.path);
      const changes = powerAttributes.flatMap((attribute) => {
        const delta = current[attribute.key] - base[attribute.key];
        if (Math.abs(delta) < 1e-8) return [];
        return [
          { key: attribute.key, delta, before: base[attribute.key], after: current[attribute.key] },
        ];
      });
      return { id, name, detail, changes };
    })
    .filter((row) => row.changes.length);
  return { current, root: spiritRootInfo(save.spiritRoot), rows };
}
