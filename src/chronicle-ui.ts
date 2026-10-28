import { spiritPower } from './spirit-power.ts';
import { formatNumber } from './number-format.ts';
import type { SaveData } from './progress.ts';
import { smallIcon } from './icons.ts';
import { chronicleAchievements } from './chronicle-achievements.ts';

export function chronicleEntrance(save: SaveData) {
  const power = spiritPower(save);
  return `<button class="chronicle-link" data-action="chronicle" title="一级满血入场的成长参考，点击查看履历与成就">灵威 ${formatNumber(power.score)} · 仙途履历 →</button>`;
}

export function cultivationChronicleEntrance(save: SaveData) {
  const achievements = chronicleAchievements(save);
  const achieved = achievements.filter((item) => item.achieved).length;
  return `<button class="cultivation-chronicle" data-action="chronicle"><span><strong>仙途履历</strong><small>此世年表 · 修行成就</small></span><span class="cultivation-chronicle-count">成就 ${achieved}/${achievements.length}</span>${smallIcon('arrow')}</button>`;
}
