import { TOWN_BUILDINGS, TOWN_NPCS, TOWN_PROPS, type TownNpc } from './town.ts';
import { TOWN_SETTINGS } from './setting.ts';

export interface TownScenery {
  lastVisitAge: number;
  revision: number;
}
export function validTownScenery(value: unknown): value is TownScenery {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const state = value as TownScenery;
  return (
    Number.isFinite(state.lastVisitAge) &&
    state.lastVisitAge >= 0 &&
    Number.isSafeInteger(state.revision) &&
    state.revision >= 0
  );
}
// 只在实际入城时调用。买卖、重绘、加载重试均不推进城景，也不改上次入城时间。
export function townVisit(previous: TownScenery | undefined, age: number): TownScenery {
  return {
    lastVisitAge: age,
    revision: previous
      ? previous.revision + Number(age - previous.lastVisitAge >= TOWN_SETTINGS.sceneryChangeYears)
      : 0,
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
