import {
  HOMETOWN_HOUSE,
  TOWN_BUILDINGS,
  TOWN_NPCS,
  TOWN_PROPS,
  type TownNpc,
  type TownPoint,
} from './town.ts';
import { TOWN_SETTINGS } from './setting.ts';

export interface TownScenery {
  lastVisitAge: number;
  revision: number;
  since?: number;
}
export function validTownScenery(value: unknown): value is TownScenery {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const state = value as TownScenery;
  return (
    Number.isFinite(state.lastVisitAge) &&
    state.lastVisitAge >= 0 &&
    Number.isSafeInteger(state.revision) &&
    state.revision >= 0 &&
    (state.since === undefined ||
      (Number.isFinite(state.since) && state.since >= 0 && state.since <= state.lastVisitAge))
  );
}
// 只在实际入城时调用。买卖、重绘、加载重试均不推进城景，也不改上次入城时间。
export function townVisit(previous: TownScenery | undefined, age: number): TownScenery {
  return {
    lastVisitAge: age,
    revision: previous?.revision ?? 0,
    since: previous?.since ?? previous?.lastVisitAge ?? age,
  };
}
export function townLayout(seed: number, revision: number) {
  if (!revision)
    return {
      buildings: TOWN_BUILDINGS,
      props: TOWN_PROPS,
      npcs: TOWN_NPCS as readonly TownNpc[],
      vacantLots: [] as Array<{ x: number; y: number }>,
    };

  let state = (seed ^ Math.imul(revision, 2654435761)) >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  // 沿三条长街的 21 块宅地迁位；河道、码头与道路保留，作为久别后的地标。
  const offset = (((seed % 20) + ((revision - 1) % 20) * 7) % 20) + 1;
  const plots = TOWN_BUILDINGS.map((building, index) => {
    const plot = TOWN_BUILDINGS[index < 21 ? (index + offset) % 21 : index];
    return {
      ...building,
      x: plot.x + Math.round(random() * 10 - 5),
      y: plot.y + Math.round(random() * 12 - 6),
      tint: Math.round(random() * 28 - 14),
    };
  });
  const occupied = new Set<number>();
  const npcs: TownNpc[] = TOWN_NPCS.map((npc) => {
    if (npc.id.startsWith('villager-') || npc.id === 'fisher') return { ...npc };
    const index = TOWN_BUILDINGS.findIndex((b) => b.x === npc.x && b.y + 110 === npc.y);
    occupied.add(index);
    return { ...npc, x: plots[index].x, y: plots[index].y + 110 };
  });
  const homes = plots.map((_, i) => i).filter((i) => !occupied.has(i));
  for (let i = homes.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [homes[i], homes[j]] = [homes[j], homes[i]];
  }
  const vacant = new Set(homes.slice(0, 3));
  const vacantLots = plots.filter((_, i) => vacant.has(i)).map((b) => ({ x: b.x, y: b.y }));
  const buildings = plots.flatMap((b, i) =>
    vacant.has(i)
      ? []
      : [
          {
            ...b,
            art: occupied.has(i) ? b.art : [2, 3, 5, 6, 7][Math.floor(random() * 5)],
          },
        ],
  );
  const props = TOWN_PROPS.map((p) => {
    // 栈桥与渔船仍在水上；树、摊棚、井台在安全地块内移位。
    if (p.art === 3 || p.art === 4) return { ...p };
    return {
      ...p,
      x: p.x + Math.round(random() * 100 - 50),
      y: p.y + Math.round(random() * 60 - 30),
      size: Math.round(p.size * (0.85 + random() * 0.25)),
    };
  });
  for (const lot of vacantLots)
    props.push({ x: lot.x - 55, y: lot.y - 95, art: 0, size: 180, rotation: 0 });
  return { buildings, props, npcs, vacantLots };
}

// 旧版迁城布局作为固定基底保留；新岁月只改变原址房舍，不再搬动整条街。
export function townSceneryLayout(seed: number, scenery?: TownScenery, hometown = false) {
  const base = townLayout(seed, scenery?.revision ?? 0);
  const era = Math.floor(
    (scenery && scenery.since !== undefined ? scenery.lastVisitAge - scenery.since : 0) /
      TOWN_SETTINGS.sceneryChangeYears,
  );
  const buildings: Array<
    (typeof TOWN_BUILDINGS)[number] & { condition?: 'weathered' | 'renewed'; caption?: string }
  > = base.buildings.map((b) =>
    hometown && b.x === HOMETOWN_HOUSE.x && b.y === HOMETOWN_HOUSE.y
      ? { ...b, caption: '故居' }
      : b,
  );
  if (!era) return { ...base, buildings, era };
  const key = (p: TownPoint) => `${p.x},${p.y}`;
  const oldVacant = new Set(base.vacantLots.map(key));
  const plots = [...base.buildings, ...base.vacantLots.map((p) => ({ ...p, art: 3, tint: 0 }))];
  const shops = new Set(base.npcs.map((n) => `${n.x},${n.y - 110}`));
  if (hometown) shops.add(key(HOMETOWN_HOUSE));
  const changingLots = new Set(
    (base.vacantLots.length
      ? base.vacantLots
      : plots
          .filter((p) => !shops.has(key(p)))
          .sort((a, b) => Math.hypot(a.x - 1740, a.y - 1250) - Math.hypot(b.x - 1740, b.y - 1250))
          .slice(0, 3)
    ).map(key),
  );
  const vacantLots: TownPoint[] = [];
  buildings.length = 0;
  for (const [index, plot] of plots.entries()) {
    const home = hometown && key(plot) === key(HOMETOWN_HOUSE);
    const vacant = oldVacant.has(key(plot));
    const turns = Math.floor((era + (index % 4)) / 4);
    if (!turns) {
      if (vacant) vacantLots.push({ x: plot.x, y: plot.y });
      else buildings.push(home ? { ...plot, caption: '故居' } : plot);
      continue;
    }
    const phase = (turns + (vacant ? 2 : 0)) % 3;
    const changing = changingLots.has(key(plot));
    if (changing && phase === 2) {
      vacantLots.push({ x: plot.x, y: plot.y });
      continue;
    }
    const rebuilds = Math.floor((turns + (vacant ? 2 : 0)) / 3);
    const paint = Math.floor((turns + 1) / 3);
    const art = changing && rebuilds ? [7, 5, 6][(seed + rebuilds - 1) % 3] : plot.art;
    buildings.push({
      ...plot,
      art,
      tint: plot.tint + (paint ? [-32, 24, 48, -16][(seed + index + paint) % 4] : 0),
      condition: phase === 1 ? 'weathered' : 'renewed',
      ...(changing ? { caption: phase === 1 ? (art === 3 ? '旧居' : '旧铺') : '新铺' } : {}),
      ...(home ? { caption: '故居' } : {}),
    });
  }
  // 旧空院中的点缀树随原址重建移除，其余老树、井台、渡口保持原位。
  const props = base.props.filter(
    (p) =>
      !base.vacantLots.some(
        (lot) =>
          p.x === lot.x - 55 &&
          p.y === lot.y - 95 &&
          !vacantLots.some((next) => key(next) === key(lot)),
      ),
  );
  return { buildings, props, npcs: base.npcs, vacantLots, era };
}

export function townReturnMemory(
  seed: number,
  previous: TownScenery | undefined,
  current: TownScenery,
  hometown = false,
) {
  if (!previous) return '';
  const before = townSceneryLayout(seed, previous, hometown);
  const after = townSceneryLayout(seed, current, hometown);
  if (before.era === after.era) return '';
  const same = (a: TownPoint, b: TownPoint) => a.x === b.x && a.y === b.y;
  const address = (p: TownPoint) =>
    `${p.y < 900 ? '北街' : p.y < 1500 ? '河畔长街' : p.y < 2000 ? '南街' : '镇南'}${p.x < 1740 ? '西' : '东'}侧`;
  const notes: string[] = [];
  const colors: string[] = [];
  for (const lot of after.vacantLots)
    if (!before.vacantLots.some((old) => same(old, lot)))
      notes.push(`${address(lot)}一处旧屋已歇用，只留下空院。`);
  for (const b of after.buildings) {
    const old = before.buildings.find((old) => same(old, b));
    if (!old) notes.push(`${address(b)}的空院重新起了铺面，旧址已有新铺开张。`);
    else if (old.art !== b.art) notes.push(`${address(b)}的旧址已换了铺面，不复当年模样。`);
    else if (old.condition !== b.condition || old.tint !== b.tint)
      colors.push(
        b.condition === 'weathered'
          ? `${address(b)}一处屋舍木色暗淡，已有岁月痕迹。`
          : `${address(b)}一处屋舍重新修缮，墙色焕然一新。`,
      );
  }
  const changes = [...new Set([...notes, ...colors])].slice(0, 2);
  if (!changes.length) return '';
  const years = Math.floor(current.lastVisitAge - previous.lastVisitAge);
  return `${years ? `阔别 ${years} 年。` : '再入青岚。'}${changes.join('')}老街与渡口仍在。`;
}
