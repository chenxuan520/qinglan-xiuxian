import { assetUrl } from './asset-url.ts';
import { FINAL_TRIAL_STAGE, STAGES } from './data.ts';
import { unreadHumanLetterKeys } from './human-stories.ts';
import { SECTS } from './mortal-data.ts';
import { sectRole } from './mortal.ts';
import { realmInfo, type SaveData } from './progress.ts';

export const JOURNEY_MAP_IMAGE = '/assets/journey-map.webp';
export const JOURNEY_MAP_MOBILE_IMAGE = '/assets/journey-map-mobile.webp';

// 百分比坐标对应两幅底图中的地貌；节点、路线与文字独立于插画。
const positions = [
  [12, 79, 25, 13],
  [28, 61, 75, 13],
  [51, 81, 75, 31],
  [77, 75, 25, 31],
  [85, 46, 25, 49],
  [61, 48, 75, 49],
  [37, 24, 75, 68],
  [60, 18, 25, 68],
  [85, 15, 50, 86],
];

function route(save: SaveData, mobile: boolean, immortal: boolean) {
  const offset = mobile ? 2 : 0;
  return `<svg class="journey-route ${mobile ? 'journey-route-mobile' : 'journey-route-wide'}" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${positions
    .slice(1)
    .map((position, i) => {
      const [x, y] = positions[i].slice(offset),
        [nextX, nextY] = position.slice(offset);
      const reached = i < STAGES.length ? i <= save.unlocked : immortal;
      const midX = (x + nextX) / 2;
      return `<path class="${reached ? 'reached' : ''}" d="M ${x} ${y} C ${midX} ${y}, ${midX} ${nextY}, ${nextX} ${nextY}"/>`;
    })
    .join('')}</svg>`;
}

export function journeyMap(save: SaveData, selectedStage: number, mobile = false) {
  const realm = realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE));
  const home = save.mortal.hometown;
  const lastVisit = save.mortal.scenery?.lastVisitAge ?? home?.lastVisitAge ?? 15;
  const homeNote = unreadHumanLetterKeys(save).length
    ? '有故人来信'
    : realm.max
      ? '来处 · 归乡'
      : save.age - lastVisit >= 50
        ? '久未归乡'
        : '烟火人间 · 归乡';
  const member = SECTS.find((sect) => sect.id === save.mortal.member?.id);
  const nodes = [
    { name: '青岚镇', note: homeNote, action: 'mortal-enter', mark: '归', state: 'home' },
    ...STAGES.map((stage, i) => ({
      name: stage.name,
      note: i > save.unlocked ? '尚未抵达' : save.completed.includes(i) ? '已通关' : '可挑战',
      action: 'stage',
      mark: stage.chapter,
      state: `${i > save.unlocked ? 'locked' : 'open'} ${save.completed.includes(i) ? 'cleared' : ''} ${i === selectedStage ? 'selected' : ''}`,
    })),
    {
      name: '仙门',
      note: realm.max ? '叩入仙门' : realm.index >= 7 ? '待成真仙' : '云深处',
      action: 'immortal-gate',
      mark: '仙',
      state: `gate ${realm.max ? 'open' : 'locked'} ${realm.index >= 7 ? 'revealed' : ''}`,
    },
  ];
  return `<div class="section-heading journey-map-heading"><div><span class="section-number">山河</span><h2>仙途山河图</h2></div><span class="muted">七境行迹 · ${save.completed.length} / ${STAGES.length}</span></div>
    <div class="journey-map" role="group" aria-label="仙途山河图，青岚镇、七重秘境与仙门">
      <picture class="journey-map-art"><source media="(max-width: 640px)" srcset="${assetUrl(JOURNEY_MAP_MOBILE_IMAGE)}"/><source media="(min-width: 641px)" srcset="${assetUrl(JOURNEY_MAP_IMAGE)}"/><img src="${assetUrl(mobile ? JOURNEY_MAP_MOBILE_IMAGE : JOURNEY_MAP_IMAGE)}" width="1672" height="941" alt="青岚烟火连着竹海、古墟、冰谷与幽泽，越过云山，远处是雷劫与仙门。" draggable="false"/></picture>
      <span class="journey-map-inscription" aria-hidden="true">一程山水，一世仙途</span>
      ${route(save, false, realm.max)}${route(save, true, realm.max)}
      ${nodes
        .map((node, i) => {
          const [x, y, mobileX, mobileY] = positions[i];
          const locked = node.state.includes('locked');
          const stage = i > 0 && i <= STAGES.length;
          return `<button type="button" class="journey-node ${node.state}" data-action="${node.action}" ${stage ? `data-id="${i - 1}" aria-pressed="${selectedStage === i - 1}"` : ''} ${locked ? 'disabled' : ''} style="--node-x:${x}%;--node-y:${y}%;--mobile-x:${mobileX}%;--mobile-y:${mobileY}%" aria-label="${node.name}，${node.note}${stage && locked ? '，通关前境解锁' : ''}" title="${stage && locked ? '通关前境解锁' : node.note}"><span class="journey-node-seal" aria-hidden="true">${node.mark}</span><span class="journey-node-label"><strong>${node.name}</strong><small>${node.note}${node.state.includes('cleared') ? ' ✓' : ''}</small></span></button>`;
        })
        .join('')}
    </div>
    <div class="journey-map-caption"><button class="journey-prepare-link" data-action="journey-prepare">返回行前准备 <span aria-hidden="true">↑</span></button><button data-action="mortal-enter">${member ? `${member.name} · ${sectRole(save)}` : '散修 · 山河自在'} <span aria-hidden="true">↗</span></button></div>`;
}
