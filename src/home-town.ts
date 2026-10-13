import { smallIcon } from './icons.ts';

export function homeTownEntrance() {
  return `<button class="home-town-entry" data-action="mortal-enter" aria-label="青岚镇：游历小镇、走访宗门与坊市"><span class="home-town-art" aria-hidden="true"><span></span><span></span><span></span></span><span class="home-town-copy"><small>山下烟火 · 人间游历</small><strong>青岚镇</strong><span>逛小镇 · 访宗门 · 入坊市</span></span><span class="home-town-link">入镇游历 ${smallIcon('arrow')}</span></button>`;
}
