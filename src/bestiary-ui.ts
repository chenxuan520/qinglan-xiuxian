import {
  regionalEnemyTactics,
  regionalBossSkills,
  regionalSkillDetails,
} from './regional-combat.ts';
import {
  STAGES,
  ENEMIES,
  ENEMY_TACTICS,
  ENEMY_SKILLS,
  STAGE_ENEMIES,
  FINAL_TRIAL_STAGE,
  TRIAL_BOSS_STAGES,
  TRIAL_BOSS_TIMES,
  formatTime,
} from './data.ts';
import { spriteStyle } from './sprites.ts';
import { smallIcon } from './icons.ts';
import type { PanelDefinition } from './panel-host.ts';
export function bestiaryPanel(bestiaryStage: number): PanelDefinition {
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
    body: `<p class="panel-note">不同秘境栖居着不同妖物。各境依次强调冲开藤枝包围、绕开狐火路径、躲避狼群围猎、避开游瘴、寻找控魂者与观察雷路节拍。第七境汇聚历境精英，使用各自的弹幕与落阵招式。普通与精英妖物的地面攻击在施法者附近生成，远程灵弹可见且有射程；妖王保留锁定主角的预警招式。每关分四批加入强敌：前六境按时长 0%、25%、50%、75% 解锁，终关提前到 0:00、0:45、1:30、2:30，后续以新批次为主。第七境「万劫归墟」汇聚历境精英，六位妖王与九天执劫仙尊依次登场；全部击败才能通关并解除成仙瓶颈。</p><div class="guide-tabs bestiary-tabs" role="group" aria-label="秘境妖物分类">${[{ name: '全部', id: -1 }, ...STAGES.map((stage, id) => ({ name: stage.name, id }))].map((stage) => `<button data-action="bestiary-stage" data-id="${stage.id}" class="${bestiaryStage === stage.id ? 'active' : ''}" aria-pressed="${bestiaryStage === stage.id}">${stage.name}</button>`).join('')}</div><div class="bestiary-grid">${ENEMIES.filter(
      (_, index) => bestiaryStage < 0 || STAGE_ENEMIES[bestiaryStage].includes(index),
    )
      .map((e) => {
        const type = ENEMIES.indexOf(e);
        const region = STAGE_ENEMIES.findIndex((pool) => pool.includes(type));
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
        const detail =
          bestiaryStage === FINAL_TRIAL_STAGE && !tactics.regional
            ? behavior[e.behavior]
            : `${tactics.flank ? `包抄 · 两翼绕行，近身合围${skill ? `；${skill.name} · ${skill.hint}` : ''}` : e.behavior === 'shield' ? `护盾 · 亮盾减伤 55%，暗盾时反击；${skill ? skill.name : '近身震地'}` : skill ? `${skill.name} · ${skill.hint}` : behavior[e.behavior]}<small class="enemy-skill">精英：${elite ? `${elite.name} · ${elite.eliteHint}` : behavior[e.behavior]}</small>`;
        return `<article class="enemy-card"><span class="sprite-thumb ${e.sprite >= 8 ? 'extra-sprite' : ''}" style="${spriteStyle(e.sprite)}"></span><div><h3>${e.name}</h3><p class="${bestiaryStage === FINAL_TRIAL_STAGE ? '' : 'enemy-detail'}">${detail}${tactics.deathMiasma ? '<small>倒下后原地留瘴，预警后生效</small>' : ''}${tactics.boundSummons ? '<small>优先击杀召唤者，其护卫随之消散</small>' : ''}</p><small>${bestiaryStage === FINAL_TRIAL_STAGE ? '终关以精英形态出现 · ' : ''}基础气血 ${e.hp} · 伤害 ${e.damage}</small></div></article>`;
      })
      .join(
        '',
      )}</div><h3 class="guide-subheading">历境妖王与执劫仙尊</h3><div class="bestiary-grid">${STAGES.filter(
      (_, index) =>
        bestiaryStage < 0 ||
        (bestiaryStage === FINAL_TRIAL_STAGE && TRIAL_BOSS_STAGES.includes(index)) ||
        index === bestiaryStage,
    )
      .map(
        (stage) =>
          `<article class="enemy-card"><span class="sprite-thumb" style="${spriteStyle(stage.sprite)}"></span><div><h3>${stage.boss}</h3><p>${bestiaryStage === FINAL_TRIAL_STAGE ? `第 ${TRIAL_BOSS_STAGES.indexOf(STAGES.indexOf(stage)) + 1} 劫 · 最早 ${formatTime(TRIAL_BOSS_TIMES[TRIAL_BOSS_STAGES.indexOf(STAGES.indexOf(stage))])} 后现身` : `${stage.name} · ${stage.minutes} 分钟后现身`}</p><small>${(bestiaryStage === FINAL_TRIAL_STAGE ? stage.skills : regionalBossSkills(STAGES.indexOf(stage), stage.skills)).join(' · ')}<br>半血后攻势加快</small></div></article>`,
      )
      .join(
        '',
      )}</div><div class="boss-note">${smallIcon('book')} 前六位首领各有三招，最终仙尊有六招交替施放，半血后攻势加快。冲刺与落地法阵有预警，及时横移；召唤物优先清理。终关第二批阶段开始追击精英追加冲刺，远程怪后期施法更快。</div>`,
    wide: true,
  };
}
