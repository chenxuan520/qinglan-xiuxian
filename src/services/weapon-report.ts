import { FINAL_TRIAL_STAGE, ROOT_STARTERS, TREASURES } from '../core/data.ts';
// 每日法宝测评的公开摘要；不包含逐帧记录或本地文件路径。
export const WEAPON_REPORT_URL = 'https://chenxuan520.github.io/qinglan-xiuxian/weapon-report/';
export const WEAPON_REPORT_PROTOCOL = 1;
export const WEAPON_BENCHMARK_STAGES = [0, 1, 2, 3, 4, 5, 6] as const;
export const WEAPON_BENCHMARK_ROOTS = ['heaven', 'dual', 'triple'] as const;
export const FOCUSED_WEAPONS = [
  'orbit',
  'chain',
  'banner',
  'ice',
  'pagoda',
  'cauldron',
  'talisman',
  'flute',
];
export const REPLICATED_WEAPONS = ['orbit', 'chain', 'banner', 'ice', 'pagoda', 'cauldron'];
export function expectedWeaponCounts(options: {
  weapons: string[];
  seeds: number;
  extended: boolean;
}) {
  const natural =
    options.seeds * WEAPON_BENCHMARK_STAGES.length * WEAPON_BENCHMARK_ROOTS.length * 2;
  const pairs = options.seeds * 12;
  return {
    natural: options.weapons.length * natural,
    pairs: options.weapons.length * pairs,
    focused: options.extended
      ? options.weapons.filter((id) => FOCUSED_WEAPONS.includes(id)).length * natural
      : 0,
    replicated: options.extended
      ? options.weapons.filter((id) => REPLICATED_WEAPONS.includes(id)).length * pairs
      : 0,
    campaigns: options.extended
      ? Object.values(ROOT_STARTERS)
          .flat()
          .filter((id) => options.weapons.includes(id)).length * 8
      : 0,
  };
}
export interface WeaponBattleStats {
  n: number;
  wins: number;
  lost: number;
  timeout: number;
  censored: number;
  arrived: number;
  evolved: number;
  at6Seconds: number | null;
  evolveSeconds: number | null;
  ownShare: number | null;
  bossKilled: number;
  bossUnresolved: number;
  bossSeconds: number | null;
  observedSeconds: number | null;
  remainingHp: number | null;
}
export interface WeaponPairStats {
  n: number;
  selfChecks: number;
  clusters: number;
  candidate: WeaponBattleStats;
  reference: WeaponBattleStats;
  winDifference: number | null;
  winCI: [number, number] | null;
  survivalDifference: number | null;
  survivalCI: [number, number] | null;
}
export interface WeaponReport {
  schemaVersion: 1;
  protocolVersion: number;
  state: 'complete' | 'failed';
  generatedAt: string;
  commit: string;
  sourceHash: string;
  runId: number | null;
  elapsedSeconds: number;
  error: string | null;
  planned: number;
  returned: number;
  counts: {
    natural: number;
    pairs: number;
    actualSimulations: number;
    focused: number;
    replicated: number;
    campaigns: number;
  };
  options: {
    seeds: number;
    extended: boolean;
    weapons: string[];
    seedOffset: number;
    workers: number;
  };
  weapons: {
    id: string;
    name: string;
    school: string;
    natural: WeaponBattleStats;
    stages: { stage: number; stats: WeaponBattleStats }[];
    groups: { root: string; device: string; stage: number; stats: WeaponBattleStats }[];
    pairs: { evolved: boolean; stats: WeaponPairStats }[];
    pairGroups: { evolved: boolean; dimension: string; label: string; stats: WeaponPairStats }[];
    focused: WeaponBattleStats | null;
    replicated: { evolved: boolean; stats: WeaponPairStats }[];
  }[];
  campaigns: { root: string; n: number; clearedSix: number }[];
}
export interface RankedWeapon {
  weapon: WeaponReport['weapons'][number];
  wins: number;
  n: number;
  rate: number;
  margin: number;
  pairNet: number | null;
  relativeKillTime: number | null;
}
const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b),
    n = sorted.length;
  return n % 2 ? sorted[Math.floor(n / 2)] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
};
// 与 autoplayInterval 同为 Wilson 95% 区间，但这里只要半宽（百分点）且 n=0 返回 0；
// 返回值语义与那边的 [0,1] 夹取不同，故不复用。
const wilsonMargin = (wins: number, n: number) => {
  if (!n) return 0;
  const p = wins / n,
    z = 1.96,
    z2 = z * z,
    denominator = 1 + z2 / n;
  return Math.round(((z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denominator) * 100);
};
// 排序只看前六关；终关统一境界零资源入场，几乎无法通关，仅列出参考。
export function rankWeapons(weapons: WeaponReport['weapons']): RankedWeapon[] {
  const order = new Map<string, number>(TREASURES.map((treasure, index) => [treasure.id, index]));
  const scoredStages = WEAPON_BENCHMARK_STAGES.filter((stage) => stage < FINAL_TRIAL_STAGE);
  const stageMedians = new Map<number, number>();
  for (const stage of scoredStages) {
    const value = median(
      weapons
        .map((weapon) => weapon.stages.find((entry) => entry.stage === stage)?.stats.bossSeconds)
        .filter((seconds): seconds is number => seconds != null && seconds > 0),
    );
    if (value !== null) stageMedians.set(stage, value);
  }
  return weapons
    .map((weapon) => {
      const stages = scoredStages.map((stage) =>
        weapon.stages.find((entry) => entry.stage === stage),
      );
      const wins = stages.reduce((sum, entry) => sum + (entry?.stats.wins ?? 0), 0);
      const n = stages.reduce((sum, entry) => sum + (entry?.stats.n ?? 0), 0);
      const rate = n ? wins / n : 0;
      const pairNets = weapon.pairs
        .map((pair) => pair.stats.winDifference)
        .filter((value): value is number => value != null);
      const relative = stages
        .map((entry) => {
          const seconds = entry?.stats.bossSeconds,
            base = entry ? stageMedians.get(entry.stage) : undefined;
          return seconds != null && base ? seconds / base : null;
        })
        .filter((value): value is number => value != null);
      return {
        weapon,
        wins,
        n,
        rate,
        margin: wilsonMargin(wins, n),
        pairNet: pairNets.length ? pairNets.reduce((a, b) => a + b, 0) / pairNets.length : null,
        relativeKillTime: relative.length
          ? relative.reduce((a, b) => a + b, 0) / relative.length
          : null,
      };
    })
    .sort(
      (a, b) =>
        (a.n === 0 ? 1 : 0) - (b.n === 0 ? 1 : 0) ||
        b.rate - a.rate ||
        (a.relativeKillTime === null ? 1 : 0) - (b.relativeKillTime === null ? 1 : 0) ||
        (a.relativeKillTime ?? 0) - (b.relativeKillTime ?? 0) ||
        (order.get(a.weapon.id) ?? Number.MAX_SAFE_INTEGER) -
          (order.get(b.weapon.id) ?? Number.MAX_SAFE_INTEGER),
    );
}
export function weaponTotal(wins: number, n: number, margin?: number) {
  const value = `${wins}/${n}（${n ? Math.round((wins / n) * 100) : 0}%${margin === undefined ? '' : ` ±${margin}`}）`;
  return value;
}
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const count = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const number = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const optionalNumber = (v: unknown) => v === null || number(v);
function battle(v: unknown): v is WeaponBattleStats {
  if (!object(v)) return false;
  return (
    [
      'n',
      'wins',
      'lost',
      'timeout',
      'censored',
      'arrived',
      'evolved',
      'bossKilled',
      'bossUnresolved',
    ].every((k) => count(v[k])) &&
    [
      'at6Seconds',
      'evolveSeconds',
      'ownShare',
      'bossSeconds',
      'observedSeconds',
      'remainingHp',
    ].every((k) => optionalNumber(v[k])) &&
    ['at6Seconds', 'evolveSeconds', 'bossSeconds', 'observedSeconds'].every(
      (k) => v[k] === null || Number(v[k]) >= 0,
    ) &&
    ['ownShare', 'remainingHp'].every(
      (k) => v[k] === null || (Number(v[k]) >= 0 && Number(v[k]) <= 100 + 1e-8),
    ) &&
    (v.wins as number) + (v.lost as number) + (v.timeout as number) + (v.censored as number) ===
      v.n &&
    (v.arrived as number) <= (v.n as number) &&
    (v.bossKilled as number) + (v.bossUnresolved as number) >= (v.arrived as number) &&
    (v.evolved as number) <= (v.n as number)
  );
}
function pair(v: unknown): v is WeaponPairStats {
  if (!object(v)) return false;
  const interval = (x: unknown) =>
    x === null || (Array.isArray(x) && x.length === 2 && x.every(number) && x[0] <= x[1]);
  return (
    count(v.n) &&
    count(v.selfChecks) &&
    count(v.clusters) &&
    v.clusters <= v.n &&
    battle(v.candidate) &&
    battle(v.reference) &&
    v.candidate.n === v.n &&
    v.reference.n === v.n &&
    optionalNumber(v.winDifference) &&
    optionalNumber(v.survivalDifference) &&
    interval(v.winCI) &&
    interval(v.survivalCI) &&
    (v.n > 0
      ? v.clusters > 0 &&
        number(v.winDifference) &&
        Math.abs(v.winDifference) <= 100 &&
        number(v.survivalDifference) &&
        Math.abs(v.survivalDifference) <= 105 + 1e-6
      : v.winDifference === null &&
        v.survivalDifference === null &&
        v.winCI === null &&
        v.survivalCI === null)
  );
}
export function validWeaponReport(input: unknown): input is WeaponReport {
  if (!object(input) || !object(input.counts) || !object(input.options)) return false;
  return (
    input.schemaVersion === 1 &&
    input.protocolVersion === WEAPON_REPORT_PROTOCOL &&
    ['complete', 'failed'].includes(String(input.state)) &&
    typeof input.generatedAt === 'string' &&
    Number.isFinite(Date.parse(input.generatedAt)) &&
    typeof input.commit === 'string' &&
    /^[a-f0-9]{40}$/.test(input.commit) &&
    typeof input.sourceHash === 'string' &&
    /^[a-f0-9]{64}$/.test(input.sourceHash) &&
    (input.runId === null || (count(input.runId) && input.runId > 0)) &&
    number(input.elapsedSeconds) &&
    input.elapsedSeconds >= 0 &&
    (input.error === null || typeof input.error === 'string') &&
    count(input.planned) &&
    input.planned > 0 &&
    count(input.returned) &&
    input.returned <= input.planned &&
    ['natural', 'pairs', 'actualSimulations', 'focused', 'replicated', 'campaigns'].every((k) =>
      count((input.counts as Record<string, unknown>)[k]),
    ) &&
    ['natural', 'pairs', 'focused', 'replicated', 'campaigns'].reduce(
      (sum, k) => sum + Number((input.counts as Record<string, unknown>)[k]),
      0,
    ) === input.returned &&
    count(input.options.seeds) &&
    input.options.seeds > 0 &&
    input.options.seeds <= 100 &&
    typeof input.options.extended === 'boolean' &&
    count(input.options.seedOffset) &&
    count(input.options.workers) &&
    input.options.workers > 0 &&
    Array.isArray(input.options.weapons) &&
    input.options.weapons.length > 0 &&
    input.options.weapons.length <= 36 &&
    input.options.weapons.every((x) => typeof x === 'string') &&
    new Set(input.options.weapons).size === input.options.weapons.length &&
    Array.isArray(input.weapons) &&
    input.weapons.length <= 36 &&
    input.weapons.every(
      (w) =>
        object(w) &&
        typeof w.id === 'string' &&
        typeof w.name === 'string' &&
        ['orthodox', 'demonic'].includes(String(w.school)) &&
        battle(w.natural) &&
        Array.isArray(w.stages) &&
        w.stages.every((g) => object(g) && count(g.stage) && battle(g.stats)) &&
        Array.isArray(w.groups) &&
        w.groups.every(
          (g) =>
            object(g) &&
            typeof g.root === 'string' &&
            typeof g.device === 'string' &&
            count(g.stage) &&
            battle(g.stats),
        ) &&
        Array.isArray(w.pairs) &&
        w.pairs.every((g) => object(g) && typeof g.evolved === 'boolean' && pair(g.stats)) &&
        Array.isArray(w.pairGroups) &&
        w.pairGroups.every(
          (g) =>
            object(g) &&
            typeof g.evolved === 'boolean' &&
            typeof g.dimension === 'string' &&
            typeof g.label === 'string' &&
            pair(g.stats),
        ) &&
        (w.focused === null || battle(w.focused)) &&
        Array.isArray(w.replicated) &&
        w.replicated.every((g) => object(g) && typeof g.evolved === 'boolean' && pair(g.stats)),
    ) &&
    Array.isArray(input.campaigns) &&
    input.campaigns.every(
      (g) =>
        object(g) &&
        typeof g.root === 'string' &&
        count(g.n) &&
        count(g.clearedSix) &&
        g.clearedSix <= g.n,
    ) &&
    (input.state !== 'complete' ||
      (input.returned === input.planned &&
        input.error === null &&
        (() => {
          const options = input.options as unknown as WeaponReport['options'];
          const expected = expectedWeaponCounts(options),
            counts = input.counts as Record<string, unknown>,
            legacyNatural = options.weapons.length * options.seeds * 12,
            legacyFocused = options.extended
              ? options.weapons.filter((id) => FOCUSED_WEAPONS.includes(id)).length *
                options.seeds *
                12
              : 0;
          // 兼容旧版三关两灵根报告：自然/定向培养为 seeds×12，配对与连战不变。
          return (
            ((counts.natural === expected.natural && counts.focused === expected.focused) ||
              (counts.natural === legacyNatural && counts.focused === legacyFocused)) &&
            counts.pairs === expected.pairs &&
            counts.replicated === expected.replicated &&
            counts.campaigns === expected.campaigns
          );
        })() &&
        input.weapons.length === input.options.weapons.length &&
        new Set(input.weapons.map((w) => w.id)).size === input.weapons.length &&
        input.weapons.every((w) =>
          (input.options as Record<string, unknown[]>).weapons.includes(w.id),
        ) &&
        input.weapons.reduce((s, w) => s + w.natural.n, 0) === input.counts.natural &&
        input.weapons.reduce((s, w) => s + (w.focused?.n ?? 0), 0) === input.counts.focused &&
        input.weapons.reduce(
          (s, w) =>
            s +
            w.pairs.reduce(
              (n: number, p: { stats: WeaponPairStats }) => n + p.stats.n + p.stats.selfChecks,
              0,
            ),
          0,
        ) === input.counts.pairs &&
        input.weapons.reduce(
          (s, w) =>
            s +
            w.replicated.reduce(
              (n: number, p: { stats: WeaponPairStats }) => n + p.stats.n + p.stats.selfChecks,
              0,
            ),
          0,
        ) === input.counts.replicated &&
        input.campaigns.reduce((s, c) => s + c.n, 0) === input.counts.campaigns))
  );
}
