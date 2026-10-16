import { spiritPower } from './spirit-power.ts';
import { formatNumber } from './number-format.ts';
import type { SaveData } from './progress.ts';

export function chronicleEntrance(save: SaveData) {
  const power = spiritPower(save);
  return `<button class="chronicle-link" data-action="chronicle" title="一级满血入场的成长参考，点击查看履历与成就">灵威 ${formatNumber(power.score)} · 仙途履历 →</button>`;
}
