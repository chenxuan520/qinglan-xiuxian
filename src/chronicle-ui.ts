import { chronicleAchievements } from './chronicle.ts';
import { spiritPower } from './spirit-power.ts';
import type { SaveData } from './progress.ts';

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
const ageLabel = (age: number | null | undefined) =>
  age == null ? '年岁未载' : `${age.toLocaleString('zh-CN', { maximumFractionDigits: 1 })} 岁`;

export function chronicleEntrance(save: SaveData) {
  const power = spiritPower(save);
  return `<button class="chronicle-link" data-action="chronicle" title="一级满血入场的成长参考，点击查看履历与成就">灵威 ${power.score.toLocaleString('zh-CN')} · 仙途履历 →</button>`;
}
export function chronicleContent(save: SaveData) {
  const power = spiritPower(save);
  const achievements = chronicleAchievements(save);
  return `<div class="chronicle-power"><span>此世灵威</span><strong>${power.score.toLocaleString('zh-CN')}</strong><p>以当前本命、满血、一级入场为基准，计入灵根、境界、根基、闭关、历劫与本门功法。</p><div class="chronicle-stats"><span>气血 ${power.hp}</span><span>伤害倍率 ×${power.damage.toFixed(2)}</span><span>暴击 ${(power.crit * 100).toFixed(1)}%</span><span>移速 ${power.speed.toFixed(1)}</span><span>施法间隔 ×${power.cooldown.toFixed(2)}</span><span>${power.weapon} · 炼器 ${power.forge} 阶</span></div><details><summary>灵威如何评估</summary><p>以输出增益与生存能力的几何平均为主，身法为辅。输出计入伤害倍率、期望暴击、冷却、范围、持续、本命炼器和五行共鸣；生存计入气血、十秒基础回复与承伤倍率。它适合在相同本命下比较自身成长，不等于实际秒伤；不计法宝基础伤害、基础攻击间隔、多目标命中与特殊机制，不能据此给不同法宝排名或预测通关，也不包含未装备法宝。</p></details></div><h3 class="guide-subheading">仙途成就 · ${achievements.filter((a) => a.achieved).length} / ${achievements.length}</h3><div class="chronicle-achievements">${achievements.map((a) => `<article class="${a.achieved ? 'achieved' : ''}"><strong>${a.achieved ? '◆' : '◇'} ${a.title}</strong><span>${a.detail}</span><small>${a.achieved ? ageLabel(a.age) : '尚未达成'}</small></article>`).join('')}</div><h3 class="guide-subheading">此世年表</h3><p class="panel-note">按发生顺序倒序记录，保留最近 200 条；成就独立保留。轮回重启此世，导出存档可留作纪念。旧档未记下的年龄显示「年岁未载」。</p><ol class="chronicle-timeline">${save.chronicle.entries.map((entry) => `<li><time>${ageLabel(entry.age)}</time><div><h4>${escape(entry.title)}</h4><p>${escape(entry.detail)}</p></div></li>`).join('')}</ol>`;
}
