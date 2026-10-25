// 每项成就一枚专属印记，只在履历展开时随正文载入。
const drawings = {
  // 绳结与垂穗：一段尘缘。
  story: '<path d="m24 11 8 8-8 8-8-8Zm0 10 8 8-8 8-8-8ZM18 33l-3 5m15-5 3 5M24 8v5"/>',
  // 葫芦收丹，丹丸自成一轮。
  'permanent-medicine':
    '<path d="M20 10h8m-6 0v4c-6 1-7 8-2 10-10 5-9 14 4 14s14-9 4-14c5-2 4-9-2-10v-4M18 29q6 3 12 0"/><circle cx="24" cy="32" r="2"/><path d="m33 12 2-3m0 9h3"/>',
  // 三颗奇珍，托于一瓣莲台。
  'curio-three':
    '<path d="m24 9 4 5-4 5-4-5Zm-11 8 3 4-3 4-3-4Zm22 0 3 4-3 4-3-4ZM11 29q5 10 13 5 8 5 13-5-7-1-13 5-6-6-13-5ZM24 23v11m-7 5h14"/>',
  // 开卷与中缝玉印：一脉真传。
  mastery:
    '<path d="M11 13q7-2 13 3 6-5 13-3v21q-7-2-13 3-6-5-13-3ZM24 16v21m-9-18 5 1m-5 5 5 1m8-6 5-1m-5 7 5-1"/><path d="m24 8 3 3-3 3-3-3Z"/>',
  // 三路汇于同心，三端各有来处。
  'three-paths':
    '<circle cx="24" cy="25" r="4"/><path d="M24 11v10m-2-8 2-2 2 2M12 33l9-6m-6 7-3-1 1-3m23 3-9-6m8 3 1 3-3 1M17 13q-9 6-8 15m29 0q1-9-8-15M16 39q8 4 16 0"/>',
  // 层峦与峰顶星芒：百炼登高。
  'level-100':
    '<path d="m9 35 9-13 6 7 5-9 10 15Zm8 3h14M18 22l2 10m9-12-2 12"/><path d="m24 8 1.5 5.5L31 15l-5.5 1.5L24 22l-1.5-5.5L17 15l5.5-1.5Z"/>',
  // 宝匣收器，匣上悬珠。
  collection:
    '<path d="m12 24 12 5 12-5v12l-12 5-12-5Zm0 0 4-7 8 4 8-4 4 7M24 29v12M17 18V9m-3 3h6m10 8 5-8m-7 1 6 3"/><circle cx="24" cy="13" r="3"/>',
  // 六柄仙剑环列，同御一心。
  'six-immortals': `${[0, 60, 120, 180, 240, 300]
    .map(
      (angle) => `<path transform="rotate(${angle} 24 24)" d="m24 8 2 4-2 7-2-7Zm-3 12h6m-3 0v3"/>`,
    )
    .join('')}<circle cx="24" cy="24" r="5"/>`,
  // 锤与炉火：千锻成器。
  forge:
    '<path d="m15 10 13 5-3 7-13-5Zm5 10-6 14m11-9c-1 5-5 6-5 11 0 4 3 5 6 5 7 0 10-6 5-12 0 4-3 4-3 7 0-4-4-5-3-11ZM10 38h5"/>',
  // 三环合一：淬体、悟道与身法。
  'training-master':
    '<circle cx="24" cy="18" r="8"/><circle cx="18" cy="29" r="8"/><circle cx="30" cy="29" r="8"/><path d="m24 21 4 6-4 6-4-6Z"/>',
  // 五枚劫印环护中央雷纹。
  'five-tribulations':
    '<path d="m25 15-8 12h6l-1 9 9-14h-7Z"/><circle cx="24" cy="8" r="2"/><circle cx="39" cy="19" r="2"/><circle cx="33" cy="37" r="2"/><circle cx="15" cy="37" r="2"/><circle cx="9" cy="19" r="2"/>',
  // 剑锋破开雷云：逆天改命。
  'hard-immortal':
    '<path d="M9 18q-1-6 5-6 2-6 8-3m9 2q6-2 7 4l2 3h-8M12 22l6 4-5 7m24-12-6 4 4 7M24 12l3 7-3 14-3-14Zm-6 21h12m-6 0v7m-3 0h6"/>',
  // 一点心火守于盾中：一命证道。
  'one-life-clear':
    '<path d="M24 9q-7 5-13 5v10q0 9 13 16 13-7 13-16V14q-6 0-13-5Z"/><path d="M25 17c0 5-7 6-7 12a6 6 0 0 0 12 0c0-3-2-6-4-7 1 4-2 5-3 6 1-4 1-6 2-11Z"/>',
  // 凡石作阶，云上开门。
  'rootless-immortal':
    '<path d="M16 31V13l8-4 8 4v18M20 29V16l4-2 4 2v13m-7 3h6m-9 4h12m-15 4h18M9 29q-3-4 2-5m26 5q3-4-2-5"/>',
  // 八方道印与重环：万古独尊。
  peerless:
    '<path d="M15 8h18l7 7v18l-7 7H15l-7-7V15Z"/><circle cx="24" cy="24" r="12"/><path d="m24 12 3 7 7-3-3 7 5 1-5 3 3 7-7-3-3 5-3-5-7 3 3-7-5-3 5-1-3-7 7 3Z"/><circle cx="24" cy="24" r="3"/>',
} as const;

export function achievementArt(id: string, achieved: boolean) {
  if (!Object.hasOwn(drawings, id)) return '';
  const frame = 'M14 3h20l11 11v20L34 45H14L3 34V14Z';
  return `<svg class="achievement-art" data-achievement-icon="${id}" data-achieved="${achieved}" width="28" height="28" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" style="flex-shrink:0"><path d="${frame}" fill="currentColor" fill-opacity="${achieved ? '.1' : '.025'}" stroke-opacity="${achieved ? '.8' : '.4'}"/><g opacity="${achieved ? 1 : '.7'}">${drawings[id as keyof typeof drawings]}</g></svg>`;
}
