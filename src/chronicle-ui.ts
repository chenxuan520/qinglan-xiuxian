import { chronicleAchievements } from './chronicle.ts';
import { spiritPower } from './spirit-power.ts';
import { formatNumber } from './number-format.ts';
import type { SaveData } from './progress.ts';

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
const ageLabel = (age: number | null | undefined) =>
  age == null
    ? '年岁未载'
    : `${age.toLocaleString('zh-CN', { maximumFractionDigits: 1, useGrouping: false })} 岁`;

export function chronicleEntrance(save: SaveData) {
  const power = spiritPower(save);
  return `<button class="chronicle-link" data-action="chronicle" title="一级满血入场的成长参考，点击查看履历与成就">灵威 ${formatNumber(power.score)} · 仙途履历 →</button>`;
}
export function chronicleContent(save: SaveData) {
  const power = spiritPower(save);
  const achievements = chronicleAchievements(save);
  return `<div class="chronicle-power"><span>此世灵威</span><strong>${formatNumber(power.score)}</strong><p>以当前本命、满血、一级入场为基准，计入灵根、境界、根基、闭关、历劫与本门功法。伤害按一重、未觉醒、非暴击估算，具体招式与敌方减伤另计。</p><div class="chronicle-stats"><span>气血 ${formatNumber(power.hp)}</span><span>本命基础伤害约 ${formatNumber(Math.round(power.weaponDamage))}</span><span>暴击 ${(power.crit * 100).toFixed(1)}%</span><span>移速 ${power.speed.toFixed(1)}</span><span>施法间隔 ×${power.cooldown.toFixed(2)}</span><span>${power.weapon} · 炼器 ${power.forge} 阶</span></div><details><summary>灵威如何评估</summary><p>综合当前输出、生存与身法，只适合在相同本命下比较自身成长，不等于实际秒伤。不同法宝的招式、攻击频率和群攻能力不同，不能只凭灵威排名或预测通关；未装备法宝不计入。</p></details></div><h3 class="guide-subheading">仙途成就 · ${achievements.filter((a) => a.achieved).length} / ${achievements.length}</h3><div class="chronicle-achievements">${achievements.map((a) => `<article class="${a.achieved ? 'achieved' : ''}"><strong>${a.achieved ? '◆' : '◇'} ${a.title}</strong><span>${a.detail}</span><small>${a.achieved ? ageLabel(a.age) : '尚未达成'}</small></article>`).join('')}</div><h3 class="guide-subheading">此世年表</h3><p class="panel-note">按发生顺序倒序记录，保留最近 200 条；成就独立保留。轮回重启此世，导出存档可留作纪念。旧档未记下的年龄显示「年岁未载」。</p><ol class="chronicle-timeline">${save.chronicle.entries.map((entry) => `<li><time>${ageLabel(entry.age)}</time><div><h4>${escape(entry.title)}</h4><p>${escape(entry.detail)}</p></div></li>`).join('')}</ol>`;
}
