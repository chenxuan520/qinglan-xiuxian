import { TELEMETRY_BLOBS, TELEMETRY_DOUBLES } from './telemetry.ts';

export const MONITOR_ENDPOINT = 'https://qinglan-npc-ai.011203.xyz/monitor/stats';
export const BALANCE_REPORT_URL = 'https://chenxuan520.github.io/qinglan-xiuxian/balance-report/';
export const MONITOR_DAYS = [1, 7, 30, 90] as const;
export const MONITOR_SITES = {
  all: '全部站点',
  main: '官网',
  pages: 'GitHub Pages',
} as const;
export type MonitorFilter = {
  days: (typeof MONITOR_DAYS)[number];
  site: keyof typeof MONITOR_SITES;
};
export type MonitorRow = Record<string, string | number>;
export const MONITOR_COLUMNS = {
  overview: [
    'events',
    'browsers',
    'sessions',
    'fresh',
    'starts',
    'ends',
    'towns',
    'epilogues',
    'errors',
    'sampleMax',
  ],
  sites: ['site', 'browsers', 'sessions', 'fresh', 'starts', 'towns', 'epilogues', 'errors'],
  days: ['day', 'sessions', 'starts', 'won', 'errors'],
  stages: [
    'stage',
    'difficulty',
    'starts',
    'won',
    'lost',
    'abandoned',
    'ends',
    'seconds',
    'levels',
    'levelCount',
    'kills',
    'killCount',
  ],
  roots: ['root', 'starts', 'won', 'lost', 'abandoned', 'ends', 'seconds'],
  paths: ['path', 'starts', 'won', 'lost', 'abandoned', 'ends', 'seconds'],
  best: ['best', 'browsers'],
  realms: ['realm', 'browsers'],
  reasons: ['reason', 'count', 'realm', 'age'],
  versions: ['version', 'sessions', 'starts', 'errors'],
  errors: ['site', 'version', 'summary', 'count', 'last'],
  tribulations: ['tribulation', 'starts', 'won', 'lost', 'abandoned', 'ends', 'seconds'],
} as const;
export type MonitorSection = keyof typeof MONITOR_COLUMNS;
export type MonitorData = {
  schemaVersion: 1;
  generatedAt: string;
  filter: MonitorFilter;
  sections: Record<MonitorSection, { rows: MonitorRow[]; error?: string }>;
};

export function monitorFilter(params: URLSearchParams): MonitorFilter | null {
  if ([...params.keys()].some((key) => !['days', 'site'].includes(key))) return null;
  if (params.getAll('days').length > 1 || params.getAll('site').length > 1) return null;
  const day = params.get('days') ?? '7';
  const site = params.get('site') ?? 'all';
  if (!MONITOR_DAYS.some((n) => String(n) === day) || !Object.hasOwn(MONITOR_SITES, site))
    return null;
  return { days: Number(day) as MonitorFilter['days'], site: site as MonitorFilter['site'] };
}

// 固定查询白名单，浏览器不能指定 SQL、数据集或列。列顺序与写入协议共用。
export function monitorQueries(filter: MonitorFilter): Record<MonitorSection, string> {
  const c = Object.fromEntries([
    ...TELEMETRY_BLOBS.map((name, i) => [name, `blob${i + 1}`]),
    ...TELEMETRY_DOUBLES.map((name, i) => [name, `double${i + 1}`]),
  ]);
  const {
    type,
    site,
    version,
    root,
    path,
    result,
    detail,
    stage,
    difficulty,
    realm,
    seconds,
    level,
    kills,
    tribulation,
    age,
    fresh,
  } = c;
  // 函数也可能被脚本调用，不能仅依赖 HTTP 层校验。
  if (!monitorFilter(new URLSearchParams({ days: String(filter.days), site: filter.site })))
    throw new Error('invalid-filter');
  const host = filter.site === 'main' ? 'xiuxian.011203.xyz' : 'chenxuan520.github.io';
  const recent = `timestamp > NOW() - INTERVAL '${filter.days}' DAY AND ${version} != 'verification'${filter.site === 'all' ? '' : ` AND ${site} = '${host}'`}`;
  const w = '_sample_interval',
    table = 'qinglan_events';
  const count = (kind: string, name: string) => `sumIf(${w}, ${type} = '${kind}') AS ${name}`;
  const base = [
    count('session', 'sessions'),
    `sumIf(${w}, ${type} = 'session' AND ${fresh} = 1) AS fresh`,
    count('run-start', 'starts'),
    count('town', 'towns'),
    count('epilogue', 'epilogues'),
    count('error', 'errors'),
  ].join(', ');
  const outcomes = `${count('run-start', 'starts')}, ${count('run-end', 'ends')}, ${['won', 'lost'].map((r) => `sumIf(${w}, ${type} = 'run-end' AND ${result} = '${r}') AS ${r}`).join(', ')}, sumIf(${w}, ${type} = 'run-end' AND ${result} = 'abandon') AS abandoned, sumIf(${w} * ${seconds}, ${type} = 'run-end') AS seconds`;
  const battles = `${recent} AND ${tribulation} = -1 AND (${type} = 'run-start' OR ${type} = 'run-end')`;
  return {
    overview: `SELECT SUM(${w}) AS events, count(DISTINCT index1) AS browsers, ${base}, ${count('run-end', 'ends')}, max(${w}) AS sampleMax FROM ${table} WHERE ${recent}`,
    sites: `SELECT ${site} AS site, count(DISTINCT index1) AS browsers, ${base} FROM ${table} WHERE ${recent} GROUP BY site ORDER BY sessions DESC`,
    days: `SELECT toDate(timestamp + INTERVAL '8' HOUR) AS day, ${count('session', 'sessions')}, ${count('run-start', 'starts')}, sumIf(${w}, ${type} = 'run-end' AND ${result} = 'won' AND ${tribulation} = -1) AS won, ${count('error', 'errors')} FROM ${table} WHERE ${recent} GROUP BY day ORDER BY day`,
    stages: `SELECT ${stage} AS stage, ${difficulty} AS difficulty, ${outcomes}, sumIf(${w} * ${level}, ${type} = 'run-end' AND ${level} >= 0) AS levels, sumIf(${w}, ${type} = 'run-end' AND ${level} >= 0) AS levelCount, sumIf(${w} * ${kills}, ${type} = 'run-end' AND ${kills} >= 0) AS kills, sumIf(${w}, ${type} = 'run-end' AND ${kills} >= 0) AS killCount FROM ${table} WHERE ${battles} GROUP BY stage, difficulty ORDER BY stage, difficulty`,
    roots: `SELECT ${root} AS root, ${outcomes} FROM ${table} WHERE ${battles} GROUP BY root ORDER BY starts DESC`,
    paths: `SELECT ${path} AS path, ${outcomes} FROM ${table} WHERE ${battles} GROUP BY path ORDER BY starts DESC`,
    best: `SELECT best, count() AS browsers FROM (SELECT index1, max(${stage}) AS best FROM ${table} WHERE ${recent} AND ${type} = 'run-end' AND ${result} = 'won' AND ${tribulation} = -1 GROUP BY index1) GROUP BY best ORDER BY best`,
    realms: `SELECT realm, count() AS browsers FROM (SELECT index1, max(${realm}) AS realm FROM ${table} WHERE ${recent} AND ${realm} >= 0 GROUP BY index1) GROUP BY realm ORDER BY realm`,
    reasons: `SELECT ${result} AS reason, SUM(${w}) AS count, SUM(${w} * ${realm}) / SUM(${w}) AS realm, SUM(${w} * ${age}) / SUM(${w}) AS age FROM ${table} WHERE ${recent} AND ${type} = 'reincarnate' GROUP BY reason ORDER BY count DESC`,
    versions: `SELECT ${version} AS version, ${count('session', 'sessions')}, ${count('run-start', 'starts')}, ${count('error', 'errors')} FROM ${table} WHERE ${recent} GROUP BY version ORDER BY sessions DESC LIMIT 100`,
    errors: `SELECT ${site} AS site, ${version} AS version, ${detail} AS summary, SUM(${w}) AS count, max(timestamp) AS last FROM ${table} WHERE ${recent} AND ${type} = 'error' GROUP BY site, version, summary ORDER BY last DESC LIMIT 100`,
    tribulations: `SELECT ${tribulation} AS tribulation, ${outcomes} FROM ${table} WHERE ${recent} AND ${tribulation} >= 0 AND (${type} = 'run-start' OR ${type} = 'run-end') GROUP BY tribulation ORDER BY tribulation`,
  };
}

const stringColumns = new Set([
  'site',
  'root',
  'path',
  'day',
  'reason',
  'version',
  'summary',
  'last',
]);
export function monitorRows(section: MonitorSection, input: unknown): MonitorRow[] {
  if (!Array.isArray(input) || input.length > 200) throw new Error('invalid-data');
  return input.map((row) => {
    if (!row || typeof row !== 'object') throw new Error('invalid-row');
    const output: MonitorRow = {};
    for (const key of MONITOR_COLUMNS[section]) {
      const value = (row as Record<string, unknown>)[key];
      if (stringColumns.has(key)) {
        if (typeof value !== 'string') throw new Error('invalid-string');
        output[key] = value.slice(0, 180);
      } else {
        if (typeof value !== 'number' && typeof value !== 'string')
          throw new Error('invalid-number');
        const number = Number(value);
        if (!Number.isFinite(number) || (section !== 'stages' && number < 0))
          throw new Error('invalid-number');
        output[key] = number;
      }
    }
    return output;
  });
}

export function validMonitorData(input: unknown): input is MonitorData {
  if (!input || typeof input !== 'object') return false;
  const data = input as MonitorData;
  if (
    data.schemaVersion !== 1 ||
    !Number.isFinite(Date.parse(data.generatedAt)) ||
    !data.filter ||
    !data.sections
  )
    return false;
  if (
    !monitorFilter(new URLSearchParams({ days: String(data.filter.days), site: data.filter.site }))
  )
    return false;
  try {
    for (const key of Object.keys(MONITOR_COLUMNS) as MonitorSection[]) {
      const section = data.sections[key];
      if (!section || (section.error !== undefined && typeof section.error !== 'string'))
        return false;
      monitorRows(key, section.rows);
    }
    return true;
  } catch {
    return false;
  }
}
