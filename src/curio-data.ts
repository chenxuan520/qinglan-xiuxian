// 顺序与已批准的透明九宫格一致。每件奇物本世仅可获得一次。
export const CURIO_IDS = [
  'heaven-bottle',
  'soul-wood',
  'thunder-bamboo',
  'spirit-spring',
  'jade-book',
  'sacred-fragment',
  'wind-wings',
  'heaven-house',
  'jade-ruyi',
] as const;
export type CurioId = (typeof CURIO_IDS)[number];
export const CURIO_NAMES = [
  '掌天瓶',
  '养魂木',
  '金雷竹',
  '灵眼之泉',
  '金阙玉书',
  '梵圣真片',
  '风雷翅',
  '天机屋',
  '玉如意',
];
export const CURIO_VALUES = [120000, 30000, 18000, 18000, 20000, 24000, 12000, 24000, 24000];
export const curioValue = (id: string) => CURIO_VALUES[CURIO_IDS.indexOf(id as CurioId)] ?? 0;
export const isCurio = (id: unknown): id is CurioId =>
  typeof id === 'string' && CURIO_IDS.includes(id as CurioId);
export const curioName = (id: string) => CURIO_NAMES[CURIO_IDS.indexOf(id as CurioId)] ?? '';
export interface CurioState {
  seed: number;
  bag: Partial<Record<CurioId, number>>;
  acquired: CurioId[];
  seeking: Partial<Record<CurioId, number>>;
  soughtAt: number | null;
  consignment: { cycle: number; id: CurioId | null; closed: boolean } | null;
}
export const freshCurios = (seed = 0): CurioState => ({
  seed,
  bag: {},
  acquired: [],
  seeking: {},
  soughtAt: null,
  consignment: null,
});
export function validCurios(value: unknown, age: number, legacy = false): value is CurioState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const s = value as CurioState;
  const amounts = (v: unknown, seeking = false) =>
    !!v &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    Object.entries(v).every(
      ([id, n]) =>
        isCurio(id) &&
        (!seeking || id !== 'heaven-bottle') &&
        Number.isSafeInteger(n) &&
        n >= 0 &&
        (seeking ? n <= 3 : legacy || n <= 1),
    );
  return (
    Number.isSafeInteger(s.seed) &&
    s.seed >= 0 &&
    s.seed <= 0xffffffff &&
    amounts(s.bag) &&
    ((legacy && s.acquired === undefined) ||
      (Array.isArray(s.acquired) &&
        s.acquired.length <= CURIO_IDS.length &&
        new Set(s.acquired).size === s.acquired.length &&
        s.acquired.every(isCurio))) &&
    amounts(s.seeking, true) &&
    (s.soughtAt === null ||
      (Number.isFinite(s.soughtAt) && s.soughtAt >= 15 && s.soughtAt <= age)) &&
    (s.consignment === null ||
      (!!s.consignment &&
        typeof s.consignment === 'object' &&
        Number.isSafeInteger(s.consignment.cycle) &&
        s.consignment.cycle >= 0 &&
        s.consignment.cycle <= curioCycle(age) &&
        (s.consignment.id === null || isCurio(s.consignment.id)) &&
        typeof s.consignment.closed === 'boolean'))
  );
}
export const ownsCurio = (save: { curios: CurioState }, id: CurioId) =>
  (save.curios.bag[id] ?? 0) > 0;
export const acquiredCurio = (save: { curios: CurioState }, id: CurioId) =>
  save.curios.acquired.includes(id) ||
  Object.hasOwn(save.curios.bag, id) ||
  save.curios.seeking[id] === 3;
export function grantCurio(save: { curios: CurioState }, id: string) {
  if (!isCurio(id) || acquiredCurio(save, id)) return false;
  save.curios.bag[id] = 1;
  save.curios.acquired.push(id);
  if (save.curios.consignment?.id === id) {
    save.curios.consignment.id = null;
    save.curios.consignment.closed = true;
  }
  return true;
}
export function curioRoll(seed: number, key: string) {
  let hash = seed;
  for (const c of key) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
  return (hash ^ (hash >>> 16)) >>> 0;
}
export const curioTrainingYears = (save: { curios: CurioState }, years: number) =>
  ownsCurio(save, 'heaven-house') ? Math.max(1, Math.ceil(years * 5 - 1e-9) / 10) : years;
export const curioAlchemy = (save: { curios: CurioState }, years: number) =>
  ownsCurio(save, 'heaven-bottle')
    ? { years: Math.ceil(years - 1e-9) / 10, quantity: 3 }
    : { years, quantity: 1 };
export function bossCurio(
  save: { curios: CurioState; runs: number; completed: number[] },
  stage: number,
  ordinal: number,
  last: boolean,
  alive = true,
  pending: Record<string, number> = {},
) {
  // 独立于战斗随机流与灵根；首通加成只给本关最后一王，终关旧王不重复享用。
  const key = `boss:${save.runs}:${stage}:${ordinal}`;
  const chance =
    (stage === 6 && !last ? 0.02 : 0.04 + stage * 0.01) +
    (last && alive && !save.completed.includes(stage) ? 0.05 : 0);
  if (curioRoll(save.curios.seed, key) / 0x100000000 >= chance) return null;
  const pick = curioRoll(save.curios.seed, `${key}:item`);
  const id = pick % 80 === 0 ? CURIO_IDS[0] : CURIO_IDS[1 + ((pick >>> 8) % 8)];
  return acquiredCurio(save, id) || pending[id] ? null : id;
}

export const curioCycle = (age: number) => Math.max(0, Math.floor((age - 15 + 1e-9) / 10));
export function prepareCurioConsignment(save: { age: number; curios: CurioState }) {
  const cycle = curioCycle(save.age);
  if (save.curios.consignment?.cycle === cycle) {
    if (save.curios.consignment.id && acquiredCurio(save, save.curios.consignment.id)) {
      save.curios.consignment.id = null;
      save.curios.consignment.closed = true;
    }
    return;
  }
  const n = curioRoll(save.curios.seed, `consignment:${cycle}`);
  const id = CURIO_IDS[1 + ((n >>> 8) % 8)];
  save.curios.consignment = {
    cycle,
    id: n % 100 < 35 && !acquiredCurio(save, id) ? id : null,
    closed: false,
  };
}
