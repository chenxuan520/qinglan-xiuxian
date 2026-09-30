import { TELEMETRY_BLOBS, TELEMETRY_DOUBLES } from '../src/telemetry.ts';

// 查询 Analytics Engine 中的匿名游玩统计。令牌需要 Account Analytics Read 权限，只在本机环境变量中使用。
const token = process.env.CLOUDFLARE_ANALYTICS_TOKEN || process.env.CLOUDFLARE_API_TOKEN;
const args = process.argv.slice(2);
if (args.some((arg) => !/^--days=\d+$/.test(arg))) throw new Error('仅支持 --days=7');
const days = Number(args[0]?.slice(7) ?? 7);
if (days < 1 || days > 90) throw new Error('--days 需为 1–90；数据只保留三个月');
if (!token) {
  console.error(
    '需要环境变量 CLOUDFLARE_ANALYTICS_TOKEN（或 CLOUDFLARE_API_TOKEN），令牌须有 Account Analytics Read 权限。',
  );
  process.exit(1);
}
async function accountId() {
  if (process.env.CLOUDFLARE_ACCOUNT_ID) return process.env.CLOUDFLARE_ACCOUNT_ID;
  const response = await fetch('https://api.cloudflare.com/client/v4/accounts?per_page=5', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const accounts = ((await response.json()) as { result?: { id: string }[] }).result ?? [];
  if (accounts.length !== 1) throw new Error('无法确定账号，请设置 CLOUDFLARE_ACCOUNT_ID');
  return accounts[0].id;
}
const account = await accountId();

const column = Object.fromEntries([
  ...TELEMETRY_BLOBS.map((name, index) => [name, `blob${index + 1}`]),
  ...TELEMETRY_DOUBLES.map((name, index) => [name, `double${index + 1}`]),
]) as Record<(typeof TELEMETRY_BLOBS)[number] | (typeof TELEMETRY_DOUBLES)[number], string>;
const { type, site, version, result } = column;
const { stage, realm, seconds, tribulation, age, fresh } = column;
const table = 'qinglan_events';
// 上线验证写入的记录版本号为 verification，统计时排除。
const recent = `timestamp > NOW() - INTERVAL '${days}' DAY AND ${version} != 'verification'`;
const weight = '_sample_interval';

async function query(sql: string) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/analytics_engine/sql`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: `${sql} FORMAT JSON` },
  );
  const text = await response.text();
  if (!response.ok) throw new Error(`查询失败 ${response.status}：${text.slice(0, 300)}`);
  return (JSON.parse(text) as { data: Record<string, string | number>[] }).data;
}
const num = (value: unknown) => Number(value) || 0;

const overview = await query(
  `SELECT ${site} AS site,
    sumIf(${weight}, ${type} = 'session') AS sessions,
    count(DISTINCT index1) AS players,
    sumIf(${weight}, ${type} = 'session' AND ${fresh} = 1) AS newcomers,
    sumIf(${weight}, ${type} = 'run-start') AS runs,
    sumIf(${weight}, ${type} = 'town') AS towns,
    sumIf(${weight}, ${type} = 'epilogue') AS epilogues
  FROM ${table} WHERE ${recent} GROUP BY site ORDER BY sessions DESC`,
);
console.log(`\n近 ${days} 天概览（按站点）`);
console.table(
  overview.map((row) => ({
    站点: row.site,
    打开次数: num(row.sessions),
    匿名玩家: num(row.players),
    新存档: num(row.newcomers),
    开局: num(row.runs),
    入城: num(row.towns),
    叩门终章: num(row.epilogues),
  })),
);

const stages = await query(
  `SELECT ${stage} AS stage,
    sumIf(${weight}, ${type} = 'run-start') AS starts,
    sumIf(${weight}, ${type} = 'run-end' AND ${result} = 'won') AS won,
    sumIf(${weight}, ${type} = 'run-end' AND ${result} = 'lost') AS lost,
    sumIf(${weight}, ${type} = 'run-end' AND ${result} = 'abandon') AS abandoned,
    sumIf(${weight} * ${seconds}, ${type} = 'run-end') AS seconds,
    sumIf(${weight}, ${type} = 'run-end') AS ended
  FROM ${table}
  WHERE ${recent} AND ${tribulation} = -1 AND (${type} = 'run-start' OR ${type} = 'run-end')
  GROUP BY stage ORDER BY stage`,
);
console.log('\n各境历练（不含天劫）');
console.table(
  stages.map((row) => {
    const ended = num(row.ended);
    return {
      秘境: `第 ${num(row.stage) + 1} 境`,
      开局: num(row.starts),
      通关: num(row.won),
      落败: num(row.lost),
      主动结束: num(row.abandoned),
      通关率: ended ? `${Math.round((num(row.won) / ended) * 100)}%` : '—',
      平均时长: ended ? `${Math.round(num(row.seconds) / ended)} 秒` : '—',
    };
  }),
);

const best = await query(
  `SELECT best, count() AS players FROM (
    SELECT index1, max(${stage}) AS best FROM ${table}
    WHERE ${recent} AND ${type} = 'run-end' AND ${result} = 'won' AND ${tribulation} = -1
    GROUP BY index1
  ) GROUP BY best ORDER BY best`,
);
const players = overview.reduce((sum, row) => sum + num(row.players), 0);
const cleared = best.reduce((sum, row) => sum + num(row.players), 0);
console.log('\n玩家最远通关');
console.table([
  { 最远通关: '尚未通关任何一境', 玩家: Math.max(0, players - cleared) },
  ...best.map((row) => ({ 最远通关: `第 ${num(row.best) + 1} 境`, 玩家: num(row.players) })),
]);

const reasons = await query(
  `SELECT ${result} AS reason, SUM(${weight}) AS count,
    SUM(${weight} * ${realm}) / SUM(${weight}) AS realm, SUM(${weight} * ${age}) / SUM(${weight}) AS age
  FROM ${table} WHERE ${recent} AND ${type} = 'reincarnate' GROUP BY reason ORDER BY count DESC`,
);
const reasonNames: Record<string, string> = {
  lifespan: '寿尽',
  tribulation: '天劫',
  epilogue: '叩门后',
  manual: '主动',
};
console.log('\n轮回原因（境界阶：0 为炼气初期，每 3 阶一个大境界）');
console.table(
  reasons.map((row) => ({
    原因: reasonNames[String(row.reason)] ?? row.reason,
    次数: num(row.count),
    平均境界阶: Number(num(row.realm).toFixed(1)),
    平均年岁: Math.round(num(row.age)),
  })),
);

const versions = await query(
  `SELECT ${version} AS version, sumIf(${weight}, ${type} = 'session') AS sessions
  FROM ${table} WHERE ${recent} GROUP BY version ORDER BY sessions DESC LIMIT 10`,
);
console.log('\n版本分布');
console.table(versions.map((row) => ({ 版本: row.version, 打开次数: num(row.sessions) })));
