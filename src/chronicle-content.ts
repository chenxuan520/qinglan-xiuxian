import { achievementArt } from './achievement-art.ts';
import { chronicleAchievements, chronicleEntryTitle } from './chronicle-achievements.ts';
import { journeyScore, AD_PENALTIES } from './journey-score.ts';
import { marketFellowRecordText } from './market-fellow-data.ts';
import { spiritPower } from './spirit-power.ts';
import { formatNumber } from './number-format.ts';
import { powerDetailsContent } from './power-details-ui.ts';
import type { SaveData } from './progress.ts';
export { AchievementNotices } from './achievement-notices.ts';

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
const ageLabel = (age: number | null | undefined) =>
  age == null
    ? '年岁未载'
    : `${age.toLocaleString('zh-CN', { maximumFractionDigits: 1, useGrouping: false })} 岁`;

function journeyScoreSection(save: SaveData) {
  const score = journeyScore(save);
  const adDetails = [
    score.adUsage.root
      ? `自选灵根 ${score.adUsage.root} 次（-${score.adUsage.root * AD_PENALTIES.root}）`
      : '',
    score.adUsage.lifespan
      ? `向天借寿 ${score.adUsage.lifespan} 次（-${score.adUsage.lifespan * AD_PENALTIES.lifespan}）`
      : '',
    score.adUsage.revive
      ? `复生 ${score.adUsage.revive} 次（-${score.adUsage.revive * AD_PENALTIES.revive}）`
      : '',
    score.adUsage.supplies
      ? `仙缘补给 ${score.adUsage.supplies} 次（-${score.adUsage.supplies * AD_PENALTIES.supplies}）`
      : '',
  ].filter(Boolean);
  const clarityText =
    score.adCount === 0
      ? `全程未借外缘 · 道心无瑕 ×${score.clarityFactor.toFixed(2)}`
      : `本世假借外缘 ${score.adCount} 次 · 系数 ×${score.clarityFactor.toFixed(2)}`;
  const clarityValue =
    score.clarityDelta > 0
      ? `+${score.clarityDelta}（×${score.clarityFactor.toFixed(2)}）`
      : score.clarityDelta < 0
        ? `${score.clarityDelta}（×${score.clarityFactor.toFixed(2)}）`
        : `0（×${score.clarityFactor.toFixed(2)}）`;
  return `<div class="chronicle-power chronicle-score"><span>此世道果 · 道果品第：${score.tier}（${score.grade}）</span><strong>${score.total}</strong><p>综合永久灵威、灵根资质、仙途成就与破境里程碑凝成此世道果；假借外缘重定灵根、续命、复生或领取补给会折损道果并降低道心澄明系数。</p><div class="chronicle-stats"><span>道基底蕴 +${score.powerScore}</span><span>拙根逆命 +${score.rootBonus}</span><span>仙途证道 +${score.achievementScore}</span><span>假借外缘 -${score.adPenalty}</span><span>道心澄明 ×${score.clarityFactor.toFixed(2)}</span></div><details data-disclosure="journey-score-details"><summary>查看此世道果构成</summary><dl class="power-origin-list"><div class="power-origin"><dt>道基底蕴<small>永久入场灵威 ${formatNumber(score.permanentPower)}（不含限时丹药）</small></dt><dd><span class="power-gain">+${score.powerScore}</span></dd></div><div class="power-origin"><dt>拙根逆命<small>按本世最顺遂资质「${score.effectiveRoot.name}」折算 · 逆命加成 +${Math.round(score.reverseRate * 100)}%</small></dt><dd><span class="${score.rootBonus > 0 ? 'power-gain' : ''}">+${score.rootBonus}</span></dd></div><div class="power-origin"><dt>仙途证道<small>踏破 ${score.stageCount} 境（+${score.stageScore}）· 达成 ${score.achieved.length} 项仙途成就（+${score.featScore}）</small></dt><dd><span class="${score.achievementScore > 0 ? 'power-gain' : ''}">+${score.achievementScore}</span></dd></div><div class="power-origin"><dt>假借外缘<small>${adDetails.length ? adDetails.join(' · ') : '本世未借外力重定灵根、续命、复生或补给'}</small></dt><dd><span class="${score.adPenalty > 0 ? 'power-loss' : ''}">-${score.adPenalty}</span></dd></div><div class="power-origin"><dt>道心澄明<small>${clarityText} · 折算前道果 ${score.rawScore}</small></dt><dd><span class="${score.clarityDelta > 0 ? 'power-gain' : score.clarityDelta < 0 ? 'power-loss' : ''}">${clarityValue}</span></dd></div></dl></details></div>`;
}

export function chronicleContent(save: SaveData) {
  const power = spiritPower(save);
  const achievements = chronicleAchievements(save);
  return `<div class="chronicle-power"><span>此世灵威</span><strong>${formatNumber(power.score)}</strong><p>以当前本命、满血、一级入场为基准，计入灵根、境界、根基、闭关、历劫与本门功法。伤害按一重、未觉醒、非暴击估算，具体招式与敌方减伤另计。</p><div class="chronicle-stats"><span>气血 ${formatNumber(power.hp)}</span><span>本命基础伤害约 ${formatNumber(Math.round(power.weaponDamage))}</span><span>暴击 ${(power.crit * 100).toFixed(1)}%</span><span>移速 ${power.speed.toFixed(1)}</span><span>施法间隔 ×${power.cooldown.toFixed(2)}</span><span>${power.weapon} · 炼器 ${power.forge} 阶</span></div>${powerDetailsContent(save)}<details data-disclosure="power-estimate"><summary>灵威如何评估</summary><p>综合当前输出、生存与身法，只适合在相同本命下比较自身成长，不等于实际秒伤。不同法宝的招式、攻击频率和群攻能力不同，不能只凭灵威排名或预测通关；未装备法宝不计入。</p></details></div>${journeyScoreSection(save)}<h3 class="guide-subheading">仙途成就 · ${achievements.filter((a) => a.achieved).length} / ${achievements.length}</h3><div class="chronicle-achievements">${achievements.map((a) => `<article class="${a.achieved ? 'achieved' : ''}"><strong style="display:flex;align-items:center;gap:4px">${achievementArt(a.id, a.achieved)}<span>${a.title}</span></strong><span>${a.detail}</span><small>${a.achieved ? ageLabel(a.age) : '尚未达成'}</small></article>`).join('')}</div><div class="chronicle-timeline-heading"><h3 class="guide-subheading">此世年表</h3><button class="secondary-button journey-card-entry" data-action="journey-card">生成留影</button></div><p class="panel-note">近来的修行往事记于此，新的经历排在前面；轮回后另起一卷。</p><ol class="chronicle-timeline">${save.chronicle.entries
    .filter((entry) => entry.title !== '通关成仙补录')
    .map(
      (entry) =>
        `<li><time>${ageLabel(entry.age)}</time><div><h4>${escape(chronicleEntryTitle(entry.title))}</h4><p>${escape((entry.title === '炉边故人' ? marketFellowRecordText(entry.detail) : entry.detail).replace('旧档未记录的达成年岁留白，此后经历按实际年岁记下。', ''))}</p></div></li>`,
    )
    .join('')}</ol>`;
}
