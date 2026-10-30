import type { EnemySkill } from './data.ts';

export const ENEMY_SKILLS = {
  ranged: {
    name: '灵弹狙击',
    hint: '蓄势后定向发弹，横移避开',
    eliteHint: '蓄势后定向发弹，横移避开',
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
  roots: {
    name: '青藤缠足',
    hint: '藤阵命中后3秒暂难拾取',
    eliteHint: '双阵藤缠，3秒暂难拾取掉落',
  },
  firepath: { name: '离火封路', hint: '两段火径，侧向脱离', eliteHint: '三段火径封路，侧向脱离' },
  frost: { name: '寒霜凝阵', hint: '寒阵伤害并短暂减速', eliteHint: '双阵夹击，移速降低 25%' },
  miasma: {
    name: '瘴池蔓延',
    hint: '预警后留下毒池，命中后3秒无法回复',
    eliteHint: '双池封路，毒伤命中后3秒无法回复',
  },
  soul: {
    name: '摄魂交射',
    hint: '两侧魂弹交汇，命中短暂封禁法宝',
    eliteHint: '四道魂弹交叉，命中短暂封禁法宝',
  },
  storm: {
    name: '引雷落印',
    hint: '自身前方布下雷印，离开预警圈',
    eliteHint: '近身三印错时落雷，观察先后次序',
  },
  firecharge: {
    name: '焰迹扑杀',
    hint: '蓄势扑击，短火痕留在行进路径',
    eliteHint: '扑击路径留下三段火痕，绕开回头路',
  },
  thundercharge: {
    name: '踏雷突袭',
    hint: '近处突袭沿扑击路线留雷痕，侧移避开，触雷短暂禁锢',
    eliteHint: '近处突袭的雷痕在扑击后生效，触雷短暂禁锢，勿沿原路追击',
  },
  firebolt: {
    name: '熔火飞弹',
    hint: '蓄势发射慢速火弹，横移避开',
    eliteHint: '两枚火弹扇射，横移避开',
  },
  frostbolt: {
    name: '凝霜飞弹',
    hint: '霜弹命中短暂减速，避开弹道',
    eliteHint: '三枚霜弹扇射，减速后有间隔保护',
  },
  gapring: {
    name: '缺月星环',
    hint: '有缺口的环形灵弹，从空隙穿过',
    eliteHint: '星环更密，仍保留连续缺口',
  },
};

export function regionalSkillDetails(
  skill: EnemySkill,
  original: { name: string; hint: string; eliteHint: string },
) {
  return (
    (
      {
        roots: {
          name: '青藤横生',
          hint: '藤枝封路并使你3秒暂难拾取，击杀施法者可散阵',
          eliteHint: '双枝封路，藤缠期间3秒暂难拾取',
        },
        frost: {
          name: '凝霜冰棱',
          hint: '直线冰棱命中后短暂减速，侧移避开',
          eliteHint: '双道冰棱夹击，命中移速降低25%，中间留有空隙',
        },
        miasma: {
          name: '游瘴吐息',
          hint: '瘴云沿箭头漂移，毒伤命中后3秒无法回复',
          eliteHint: '游瘴持续漂移，命中后3秒无法回复，绕开行进路径',
        },
        storm: {
          name: '错拍雷织',
          hint: '两道雷路依次落下，命中短暂禁锢；先避亮起的一道',
          eliteHint: '交错雷路依次生效，命中短暂禁锢，趁落雷间隙换位',
        },
        firebolt: {
          ...original,
          hint: '火球命中后短暂灼烧，侧移避开弹道',
          eliteHint: '双火球扇射，命中后短暂灼烧',
        },
        firecharge: {
          ...original,
          hint: '扑杀路线留下短时火痕，换一条路走',
          eliteHint: '扑杀路线燃起火痕，绕开回头路',
        },
      } as Partial<Record<EnemySkill, typeof original>>
    )[skill] ?? original
  );
}
