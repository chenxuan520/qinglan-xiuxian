import { bossSkills, bossSkillCooldown } from './boss-skills.ts';
import { ENEMY_SKILLS, regionalSkillDetails } from './regional-skill-info.ts';
import { regionalEnemyTactics } from './regional-combat.ts';
import {
  STAGES,
  DIFFICULTIES,
  TRIAL_BOSS_CAP,
  TRIAL_BOSS_BUFFER_SECONDS,
  ENEMIES,
  ENEMY_TACTICS,
  STAGE_ENEMIES,
  FINAL_TRIAL_STAGE,
  TRIAL_BOSS_STAGES,
  TRIAL_BOSS_TIMES,
  formatTime,
} from './data.ts';
import { spriteStyle } from './sprites.ts';
import { bestiaryEnemyStats } from './bestiary-stats.ts';
import { enemyCombatStats } from './enemy-stats.ts';
import { formatNumber } from './number-format.ts';
import { smallIcon } from './icons.ts';
import { BOSS_LORE } from './bestiary-lore.ts';
import type { PanelDefinition } from './panel-host.ts';
import { freshBestiarySeen, type BestiarySeen } from './bestiary-seen.ts';
function numberRange(values: readonly number[]) {
  const shown = values.map(formatNumber);
  return shown[0] === shown[1] ? shown[0] : shown.join('～');
}
function statLine(
  label: string,
  stats: { hp: readonly number[]; damage: readonly number[] },
  known = true,
) {
  if (!known)
    return `<small class="enemy-stats"><b>${label}</b><br>气血 ???<br>触碰伤害 ???</small>`;
  return `<small class="enemy-stats"><b>${label}</b><br>气血 约${numberRange(stats.hp)}<br>触碰伤害 约${numberRange(stats.damage)}</small>`;
}
const bossHints = [
  '六处环形藤阵、七发荆棘扇射与三名山灵召唤，留意藤圈间隙；木心生长2.4秒后成阵，可提前击碎。',
  '九发火扇、五点火径与十六发火弹环射，离开火圈并穿过弹幕间隙；回焰短暂停留后沿原路折返。',
  '单次蓄势扑击、快慢三层冰牙与八点冰牢，横移躲扑击，留意冰圈先后；两头猎狼从侧翼绕行后蓄势合扑，另有重新锁向的两段连扑。',
  '五处固定瘴池、五道毒矢与四名护卫召唤，另有三团持续6秒的漂移毒瘴；绕开毒池，清灵散可减伤。',
  '四名护卫召唤、二十发摄魂环弹与六点鬼牢，留意中央落阵；魂弹命中封宝1秒；魂影沿你刚走过的路线逆行；还会瞬移留下三具假影，假影不提供收获。',
  '十字天雷分两拍落下、二十二发星环与五点陨雷，观察圆形预警后换位；三颗星珠绕行后错拍向外飞出。',
];
const trialBossHints = bossHints
  .map(
    (hint, id) =>
      hint + (id === 3 ? '还会放出一团向前漂移的追云。' : id === 4 ? '远处也可能瞬移追近。' : ''),
  )
  .concat('环弹、雷阵、围阵、剑潮、召唤与冲刺，半血后部分弹幕更密。');
export function bestiaryPanel(
  bestiaryStage: number,
  difficulty = 0,
  completed: readonly number[] = [],
  seen: BestiarySeen = freshBestiarySeen(),
): PanelDefinition {
  if (!DIFFICULTIES[difficulty]) difficulty = 0;
  const behavior: Record<string, string> = {
    chase: '追击 · 保持距离',
    ranged: '远程 · 侧向躲避灵弹',
    dash: '突袭 · 避开冲刺预警',
    tank: '重甲 · 持续输出',
    explode: '自爆 · 离开红圈',
    summon: '召唤 · 优先击杀',
    poison: '毒域 · 避开地面毒圈',
    volley: '散射 · 穿过弹幕间隙',
    nova: '环射 · 保持距离，寻找缺口',
    shield: '护盾 · 亮盾时减伤 55%，暗盾时集中攻击',
  };
  return {
    title: '知妖性，方能破万劫',
    subtitle: '妖物志',
    body: `<p class="panel-note">未遇到的妖物仅显示轮廓，姓名与数值在遭遇后揭示；技能见闻可提前查看。</p><p class="panel-note">数值按「${DIFFICULTIES[difficulty].name}」列出。气血为妖物出场时的满血，伤害为减伤前的触碰伤害；灵弹、法阵与自爆按各自招式计算，实际承伤还受你的护体与减伤影响。</p><div class="medicine-tabs" role="group" aria-label="妖物数值难度">${DIFFICULTIES.map((d, index) => `<button data-action="bestiary-difficulty" data-id="${index}" aria-pressed="${index === difficulty}">${d.name}</button>`).join('')}</div><p class="panel-note">${bestiaryStage < 0 ? '全部页按原生秘境，从本类解锁时列至妖王登场；终关列至5:00压力顶峰。前六境妖王战中后续出场的妖物仍会继续增强，终关强化形态见「万劫归墟」。' : bestiaryStage === FINAL_TRIAL_STAGE ? '终关全部为精英，数值从本类解锁时起列至5:00压力顶峰，之后不再提高。' : '数值从本类解锁时起列至妖王登场，普通与精英按同一时段对照。妖王战中后续出场的妖物仍会继续增强。'}</p><details><summary>出场与招式说明</summary><p class="panel-note">前六境按妖王登场前已过时间的0%、25%、50%、75%分四批解锁，首境前20秒只有${seen.enemies.includes(0) ? ENEMIES[0].name : '???'}。终关四批分别在0:00、0:45、1:30、2:30解锁。守匣守卫可能提前出现，气血为同一时刻对应精英的七成，不计入常规形态范围。普通与精英按同一时段对照，并非每种精英都会在该时段自然出现。已有妖物不会随时间重新增加气血。普通与精英的地面攻击只在自身附近生成，远程灵弹有射程；妖王可锁定你的脚下落阵。</p></details><div class="guide-tabs bestiary-tabs" role="group" aria-label="秘境妖物分类">${[{ name: '全部', id: -1 }, ...STAGES.map((stage, id) => ({ name: stage.name, id }))].map((stage) => `<button data-action="bestiary-stage" data-id="${stage.id}" class="${bestiaryStage === stage.id ? 'active' : ''}" aria-pressed="${bestiaryStage === stage.id}">${stage.name}</button>`).join('')}</div><div class="bestiary-grid">${ENEMIES.filter(
      (_, index) => bestiaryStage < 0 || STAGE_ENEMIES[bestiaryStage].includes(index),
    )
      .map((e) => {
        const type = ENEMIES.indexOf(e);
        const known = seen.enemies.includes(type);
        const region =
          bestiaryStage >= 0
            ? bestiaryStage
            : STAGE_ENEMIES.findIndex((pool) => pool.includes(type));
        const regional = region < FINAL_TRIAL_STAGE || ENEMY_TACTICS[type].regional;
        const tactics =
          bestiaryStage === FINAL_TRIAL_STAGE
            ? ENEMY_TACTICS[type]
            : regionalEnemyTactics(region, type, ENEMY_TACTICS[type], e.behavior);
        const skill =
          tactics.skill &&
          (bestiaryStage === FINAL_TRIAL_STAGE
            ? ENEMY_SKILLS[tactics.skill]
            : regionalSkillDetails(tactics.skill, ENEMY_SKILLS[tactics.skill]));
        const elite =
          tactics.eliteSkill &&
          (bestiaryStage === FINAL_TRIAL_STAGE
            ? ENEMY_SKILLS[tactics.eliteSkill]
            : regionalSkillDetails(tactics.eliteSkill, ENEMY_SKILLS[tactics.eliteSkill]));
        let detail =
          bestiaryStage === FINAL_TRIAL_STAGE && !tactics.regional
            ? behavior[e.behavior]
            : `${tactics.flank ? `包抄 · 两翼绕行，近身合围${skill ? `；${skill.name} · ${skill.hint}` : ''}` : e.behavior === 'shield' ? `护盾 · 亮盾减伤 55%，暗盾时反击；${skill ? `${skill.name} · ${skill.hint}` : '近身震地'}` : skill ? `${skill.name} · ${skill.hint}` : behavior[e.behavior]}<small class="enemy-skill">精英：${elite ? `${elite.name} · ${elite.eliteHint}` : behavior[e.behavior]}</small>`;
        if (!regional) {
          detail =
            e.behavior === 'chase'
              ? '追击，0:45后追加蓄势冲刺，侧移避开路线'
              : e.behavior === 'summon'
                ? '唤来两名护卫，优先清理召唤者'
                : e.behavior === 'volley'
                  ? '三发扇射，穿过弹道间隙'
                  : e.behavior === 'nova'
                    ? '八向环射，寻找弹幕缺口'
                    : e.behavior === 'tank'
                      ? '重甲近身震地，离开落点预警'
                      : e.behavior === 'poison'
                        ? '在自身前方留下毒池，绕开毒圈'
                        : behavior[e.behavior];
        }
        if (e.behavior === 'explode' && !detail.includes('自爆'))
          detail += '<small>近身仍会自爆，及时远离</small>';
        const normal = bestiaryEnemyStats(region, difficulty, type)!;
        const eliteStats = bestiaryEnemyStats(region, difficulty, type, true)!;
        return `<article class="enemy-card" data-enemy-type="${type}"><span aria-hidden="true" class="sprite-thumb ${e.sprite >= 8 ? 'extra-sprite' : ''}${known ? '' : ' is-unseen'}" style="${spriteStyle(e.sprite)}"></span><div><h3>${known ? e.name : '???'}</h3><p class="${bestiaryStage === FINAL_TRIAL_STAGE ? '' : 'enemy-detail'}">${detail}${tactics.deathMiasma ? '<small>倒下后原地留瘴，预警后生效</small>' : ''}${tactics.boundSummons ? '<small>优先击杀召唤者，其护卫随之消散</small>' : ''}</p><small>${STAGES[region].name} · 最早 ${known ? formatTime(normal.first) : '???'} 解锁</small>${region === FINAL_TRIAL_STAGE ? '' : statLine('普通形态', normal, known)}${statLine(region === FINAL_TRIAL_STAGE ? '精英形态' : '同刻精英对照', eliteStats, known)}</div></article>`;
      })
      .join(
        '',
      )}</div><h3 class="guide-subheading">历境妖王与执劫仙尊</h3><div class="bestiary-grid">${STAGES.filter(
      (_, index) =>
        bestiaryStage < 0 ||
        (bestiaryStage === FINAL_TRIAL_STAGE && TRIAL_BOSS_STAGES.includes(index)) ||
        index === bestiaryStage,
    )
      .map((stage) => {
        const bossStage = STAGES.indexOf(stage);
        const known = seen.bosses.includes(bossStage) || completed.includes(bossStage);
        const arena = bestiaryStage === FINAL_TRIAL_STAGE ? FINAL_TRIAL_STAGE : bossStage;
        const trial = arena === FINAL_TRIAL_STAGE;
        const time = trial
          ? TRIAL_BOSS_TIMES[TRIAL_BOSS_STAGES.indexOf(bossStage)]
          : stage.minutes * 60;
        const stats = enemyCombatStats(arena, difficulty, time, 10, false, true, bossStage);
        return `<article class="enemy-card" data-boss-stage="${bossStage}"><span aria-hidden="true" class="sprite-thumb${known ? '' : ' is-unseen'}" style="${spriteStyle(stage.sprite)}"></span><div><h3>${known ? stage.boss : '???'}</h3><p>${trial ? `第 ${TRIAL_BOSS_STAGES.indexOf(bossStage) + 1} 劫 · 最早 ${known ? formatTime(time) : '???'} 后现身` : `${stage.name} · ${known ? formatTime(time) : '???'} 后现身`}</p><small>${bossSkills(bossStage, trial).join(' · ')}<br>${trial ? trialBossHints[bossStage] : bossHints[bossStage]}</small>${statLine('妖王', { hp: [stats.hp], damage: [stats.damage] }, known)}<p class="boss-lore" aria-label="妖王来历">${completed.includes(bossStage) ? BOSS_LORE[bossStage] : '击败后可见来历'}</p></div></article>`;
      })
      .join(
        '',
      )}</div><div class="boss-note">${smallIcon('book')} 前六境与终关的六位旧王各有不同的圆阵、弹幕与特色招式，仙尊有六招。每轮随机轮换，远离妖王时还会招来追袭。终关旧王出招间隔${bossSkillCooldown(0, true, false)}秒、半血${bossSkillCooldown(0, true, true)}秒；仙尊${bossSkillCooldown(6, true, false)}秒、半血${bossSkillCooldown(6, true, true)}秒，冲锋保留完整蓄势。双王独立施法，危险区可重叠。终关首王最早1:00出现，此后至少间隔45秒；同时最多${TRIAL_BOSS_CAP}王，满额时顺延并留${TRIAL_BOSS_BUFFER_SECONDS}秒缓冲，全部击败才通关。</div>`,
    wide: true,
  };
}
