export type TownPoint = { x: number; y: number };
export const TOWN_WIDTH = 3600;
export const TOWN_HEIGHT = 2500;
export const TOWN_START = { x: 1740, y: 1250 };
const STREET_ENDS = [870, 1740, 2580, 3150];
const STREET_ROWS = [
  [560, 750, 590, 680],
  [1160, 1320, 1150, 1250],
  [1790, 1870, 1700, 1810],
  [2340, 2420, 2290, 2370],
];
function townStreetY(row: number, x: number) {
  return STREET_ROWS[row][STREET_ENDS.findIndex((right) => x <= right)];
}
export const TOWN_NPCS = [
  { id: 'herbs', role: '药铺先生', place: '百草堂', x: 1120, y: townStreetY(0, 1120), art: 0 },
  { id: 'tea', role: '茶馆掌柜', place: '听雨茶馆', x: 2010, y: townStreetY(0, 2010), art: 1 },
  { id: 'escort', role: '镖局教头', place: '青岚镖局', x: 580, y: townStreetY(1, 580), art: 2 },
  { id: 'market', role: '坊市货商', place: '灵材坊市', x: 2370, y: townStreetY(1, 2370), art: 3 },
  { id: 'smith', role: '铁匠', place: '街头匠人', x: 1100, y: townStreetY(2, 1100), art: 4 },
  { id: 'scholar', role: '书生', place: '访学游人', x: 1440, y: townStreetY(0, 1440), art: 5 },
  { id: 'fisher', role: '渔夫', place: '青岚码头', x: 3070, y: 1250, art: 6 },
  { id: 'farmer', role: '农人', place: '赶集镇民', x: 2790, y: townStreetY(2, 2790), art: 7 },
  { id: 'tailor', role: '裁缝', place: '布衣手艺人', x: 2810, y: townStreetY(0, 2810), art: 8 },
  ...[0, 1, 2].flatMap((row) =>
    [340, 1230, 2160, 2880].map((x, col) => ({
      id: `villager-${row * 4 + col}` as const,
      role: ['街坊', '赶路村民', '邻里乡亲', '赶集村民'][col],
      place: ['北街', '河畔长街', '南街'][row],
      x,
      y: townStreetY(row, x) + 35,
      art: (row * 3 + col) % 9,
    })),
  ),
] as const;
export type TownNpc = Omit<(typeof TOWN_NPCS)[number], 'x' | 'y'> & TownPoint;
// 地图由可复用图集和坐标摆放构成；扩建时同步增加街道与建筑坐标。
export const TOWN_STREETS = [
  // 各段在宅地间折转；主街较宽，南侧宅前窄巷也接入路网。
  ...STREET_ROWS.flatMap((ys, row) =>
    ys.flatMap((y, col) => {
      const left = col ? STREET_ENDS[col - 1] : 100;
      const halfWidth = [70, 95, 65, 55][row];
      const streets = [[left, y - halfWidth, STREET_ENDS[col], y + halfWidth]];
      if (col) {
        const turnWidth = row === 1 && col === 2 ? 110 : [70, 90, 60][col - 1];
        streets.push([
          left - turnWidth,
          Math.min(ys[col - 1], y),
          left + turnWidth,
          Math.max(ys[col - 1], y),
        ]);
      }
      return streets;
    }),
  ),
  [790, 140, 910, 560],
  [825, 560, 945, 1160],
  [800, 1160, 910, 1790],
  [820, 1790, 940, 2410],
  [1650, 100, 1810, 750],
  [1700, 750, 1840, 1320],
  [1630, 1320, 1770, 1870],
  [1670, 1870, 1820, 2480],
  [2500, 180, 2620, 590],
  [2540, 590, 2650, 1150],
  [2490, 1150, 2610, 1700],
  [2520, 1700, 2640, 2400],
  [3020, 200, 3180, 2440],
  [3150, 600, 3510, 700],
  [3150, 1200, 3510, 1300],
  [3150, 1800, 3510, 1900],
];
export const TOWN_BUILDINGS = [
  [280, 600, 1120, 1440, 2010, 2330, 2810],
  [260, 580, 1150, 1470, 2050, 2370, 2850],
  [300, 620, 1100, 1420, 2010, 2330, 2790],
  [270, 590, 1140, 1460, 2030, 2350, 2830],
].flatMap((xs, row) =>
  xs.map((x, col) => ({
    x,
    y: townStreetY(row, x) - 110,
    art: [
      [3, 3, 0, 5, 1, 3, 8],
      [3, 2, 7, 3, 3, 7, 6],
      [3, 7, 4, 3, 5, 3, 7],
      [3, 3, 3, 2, 3, 3, 6],
    ][row][col],
    tint: (((row + col) % 3) - 1) * 8,
  })),
);
export const TOWN_PROPS = [
  ...[425, 1015, 1615, 2150].flatMap((y) =>
    [100, 970, 1960, 2940].map((x) => ({ x, y, art: 0, size: 200, rotation: 0 })),
  ),
  ...[650, 1250, 1850].flatMap((y) => [
    { x: 1735, y: y - 115, art: 2, size: 185, rotation: 0 },
    { x: 3290, y, art: 4, size: 390, rotation: 90 },
  ]),
  ...[980, 1570, 2140].map((y) => ({ x: 3470, y, art: 3, size: 265, rotation: 0 })),
  ...[1350, 2200, 2830].map((x) => ({ x, y: 1410, art: 1, size: 200, rotation: 0 })),
  ...[400, 1330, 2250].map((x) => ({ x, y: 2090, art: 5, size: 210, rotation: 0 })),
];
export function townWalkable(p: TownPoint) {
  return TOWN_STREETS.some(
    ([left, top, right, bottom]) => p.x >= left && p.x <= right && p.y >= top && p.y <= bottom,
  );
}
export function moveInTown(position: TownPoint, input: TownPoint, seconds: number) {
  const length = Math.hypot(input.x, input.y);
  if (!length || !Number.isFinite(seconds) || seconds <= 0) return { ...position };
  const distance = (180 * Math.min(seconds, 0.05)) / Math.max(1, length);
  const next = { ...position };
  if (townWalkable({ x: next.x + input.x * distance, y: next.y })) next.x += input.x * distance;
  if (townWalkable({ x: next.x, y: next.y + input.y * distance })) next.y += input.y * distance;
  return next;
}
export function townNpcPosition(npc: TownNpc, seconds = 0): TownPoint {
  if (!npc.id.startsWith('villager-')) return { x: npc.x, y: npc.y };
  const index = Number(npc.id.slice('villager-'.length));
  return { x: npc.x + Math.sin(seconds / (5 + (index % 4)) + index) * 100, y: npc.y };
}
export function nearbyTownNpc(
  position: TownPoint,
  seconds?: number,
  npcs: readonly TownNpc[] = TOWN_NPCS,
) {
  const distance = (npc: TownNpc) => {
    const point = seconds === undefined ? npc : townNpcPosition(npc, seconds);
    return Math.hypot(point.x - position.x, point.y - position.y);
  };
  return npcs.filter((npc) => distance(npc) <= 115).sort((a, b) => distance(a) - distance(b))[0];
}
export function townClockRunning(
  inTown: boolean,
  ready: boolean,
  visible: boolean,
  focused: boolean,
  panel: string,
) {
  return inTown && ready && visible && focused && !panel;
}
