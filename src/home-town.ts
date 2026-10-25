import type { SaveData } from './progress.ts';
import { smallIcon } from './icons.ts';
import { humanRecollection } from './human-recollection.ts';

export function lastVisitText(age: number, lastAge?: number, visited = false) {
  if (lastAge === undefined) return visited ? '曾经到访' : '尚未到访';
  const years = Math.floor(Math.max(0, age - lastAge) * 10 + 1e-7) / 10;
  return `距上次进入 ${years.toLocaleString('zh-CN', { useGrouping: false })} 年`;
}

export function homeTownEntrance(save: SaveData) {
  const memory = humanRecollection(save);
  return `<button class="home-town-entry" data-action="mortal-enter" aria-label="青岚镇：游历小镇、走访宗门与坊市"><span class="home-town-art" aria-hidden="true"><span></span><span></span><span></span></span><span class="home-town-copy"><small>山下烟火 · 人间游历</small><strong>青岚镇</strong><span>逛小镇 · 访宗门 · 入坊市</span><small>${lastVisitText(save.age, save.mortal.scenery?.lastVisitAge)}</small>${memory ? `<small class="human-recollection">${memory}</small>` : ''}</span><span class="home-town-link">入镇游历 ${smallIcon('arrow')}</span></button>`;
}
