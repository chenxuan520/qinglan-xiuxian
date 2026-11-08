import { createHash } from 'node:crypto';
import { BALANCE_PROTOCOL, caseKey } from './balance-policy.ts';
import type { BalanceCase } from './balance-policy.ts';
import { verifyCoverage } from './balance-metrics.ts';
import type { CampaignSample } from './balance-simulation.ts';

export interface SimulationError {
  case: BalanceCase;
  key: string;
  error: string;
}

export interface SimulationRun {
  results: CampaignSample[];
  errors: SimulationError[];
}

export interface ShardIdentity {
  commit: string;
  currentHash: string;
  executionHash: string;
}

export interface RunnerCapacity {
  node: string;
  platform: string;
  architecture: string;
  cpuModel: string;
  logicalCpus: number;
  availableCpus: number;
  cpuQuota: string | null;
}

export interface BalanceShard extends ShardIdentity, SimulationRun {
  shardProtocol: 1;
  balanceProtocol: number;
  index: number;
  count: number;
  planHash: string;
  planCount: number;
  caseKeys: string[];
  stageCount: 7;
  full: true;
  acceptance: true;
  currentOnly: true;
  startedAt: number;
  finishedAt: number;
  jobs: number;
  runner: RunnerCapacity;
}

function planKeys(cases: BalanceCase[]) {
  const keys = cases.map(caseKey);
  if (!keys.length || new Set(keys).size !== keys.length)
    throw new Error('分片计划不能为空或含重复样本');
  return keys;
}

export function shardPlanHash(cases: BalanceCase[]) {
  return createHash('sha256')
    .update(JSON.stringify(planKeys(cases).sort()))
    .digest('hex');
}

export function selectShardCases(cases: BalanceCase[], index: number, count: number) {
  if (
    !Number.isSafeInteger(index) ||
    !Number.isSafeInteger(count) ||
    count < 1 ||
    count > cases.length ||
    index < 0 ||
    index >= count
  )
    throw new Error('分片编号或分片总数无效');
  planKeys(cases);
  // 打散种子、路线与设备的排列关联，避免固定余数分片集中到同一类慢样本。
  return cases
    .map((c) => ({ c, rank: createHash('sha256').update(caseKey(c)).digest('hex') }))
    .sort((a, b) =>
      a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : caseKey(a.c).localeCompare(caseKey(b.c)),
    )
    .filter((_row, position) => position % count === index)
    .map(({ c }) => c);
}

function validateRun(run: SimulationRun, cases: BalanceCase[]) {
  if (!Array.isArray(run.results) || !Array.isArray(run.errors))
    throw new Error('分片缺少原始样本或异常列表');
  const expected = new Map(cases.map((c) => [caseKey(c), c]));
  const actual = new Set<string>();
  const failed = new Set<string>();
  for (const row of [...run.results, ...run.errors]) {
    const target = row && expected.get(row.key);
    if (
      !target ||
      !row.case ||
      actual.has(row.key) ||
      Object.entries(target).some(([key, value]) => row.case[key as keyof BalanceCase] !== value)
    )
      throw new Error('分片含未知、重复或身份不符的样本');
    actual.add(row.key);
    if ('error' in row) {
      if (typeof row.error !== 'string') throw new Error('分片异常记录无效');
      failed.add(row.key);
    }
  }
  if (actual.size !== cases.length) throw new Error(`分片样本缺失：${actual.size}/${cases.length}`);
  if (run.results.some((row) => row.stop === 'won' && !row.complete))
    throw new Error('全量分片不能用成功的前六关前缀冒充七关路线');
  const validCases = cases.filter((c) => !failed.has(caseKey(c)));
  if (validCases.length) verifyCoverage(run.results, validCases);
  else if (run.results.length) throw new Error('分片异常集合与结果不一致');
  for (const row of run.results) validateFullCampaign(row);
}

// JSON 跨作业交接时不能只核对样本身份；防止截断路线被改成失败后混入完整报告。
function validateFullCampaign(row: CampaignSample) {
  const preparationStops = new Set([
    'expired',
    'tribulation-lost',
    'tribulation-timeout',
    'supplies-budget',
    'supplies-cooldown',
    'boundary-budget',
    'years-budget',
    'study-budget',
    'study-lifespan',
    'activity-budget',
  ]);
  let stage = 0,
    attempt = 1;
  for (const battle of row.battles) {
    if (
      battle.stage !== stage ||
      battle.attempt !== attempt ||
      !Number.isSafeInteger(battle.maxAliveBosses) ||
      battle.maxAliveBosses < 0
    )
      throw new Error(`完整路线的战斗顺序或妖王计数无效：${row.key}`);
    if (battle.state === 'won') {
      stage++;
      attempt = 1;
    } else {
      attempt++;
      if (battle.state !== 'lost' && battle !== row.battles.at(-1))
        throw new Error(`完整路线在终止后仍有战斗：${row.key}`);
    }
  }
  if (row.seconds + 0.04 < row.battles.reduce((n, b) => n + b.seconds, 0))
    throw new Error(`完整路线总耗时小于实际战斗耗时：${row.key}`);
  const last = row.battles.at(-1);
  if (
    row.complete
      ? row.stop !== 'won' || last?.stage !== 6 || last.state !== 'won'
      : !preparationStops.has(row.stop) &&
        (!last || last.state === 'won' || row.stop !== last.state)
  )
    throw new Error(`完整路线终止原因与战斗记录不一致：${row.key}`);
}

export function createBalanceShard(
  plan: BalanceCase[],
  index: number,
  count: number,
  identity: ShardIdentity,
  run: SimulationRun,
  startedAt: number,
  finishedAt: number,
  jobs: number,
  runner: RunnerCapacity,
): BalanceShard {
  const selected = selectShardCases(plan, index, count);
  validateRun(run, selected);
  if (
    !Number.isFinite(startedAt) ||
    !Number.isFinite(finishedAt) ||
    startedAt < 0 ||
    finishedAt < startedAt ||
    finishedAt > Date.now() + 5 * 60 * 1000 ||
    !Number.isSafeInteger(jobs) ||
    jobs < 1
  )
    throw new Error('分片时间或并发记录无效');
  if (
    !runner ||
    ![runner.node, runner.platform, runner.architecture, runner.cpuModel].every(
      (v) => typeof v === 'string',
    ) ||
    !Number.isSafeInteger(runner.logicalCpus) ||
    runner.logicalCpus < 0 ||
    !Number.isSafeInteger(runner.availableCpus) ||
    runner.availableCpus < 1 ||
    (runner.cpuQuota !== null && typeof runner.cpuQuota !== 'string')
  )
    throw new Error('分片计算资源记录无效');
  return {
    shardProtocol: 1,
    balanceProtocol: BALANCE_PROTOCOL,
    ...identity,
    index,
    count,
    planHash: shardPlanHash(plan),
    planCount: plan.length,
    caseKeys: selected.map(caseKey),
    stageCount: 7,
    full: true,
    acceptance: true,
    currentOnly: true,
    startedAt,
    finishedAt,
    jobs,
    runner,
    results: run.results,
    errors: run.errors,
  };
}

export function mergeBalanceShards(
  input: unknown[],
  plan: BalanceCase[],
  count: number,
  identity: ShardIdentity,
) {
  selectShardCases(plan, 0, count);
  if (input.length !== count) throw new Error(`全量分片缺失：${input.length}/${count}`);
  const planHash = shardPlanHash(plan);
  const indexes = new Set<number>();
  const results: CampaignSample[] = [];
  const errors: SimulationError[] = [];
  let startedAt = Infinity;
  let finishedAt = 0;
  const shards: Pick<BalanceShard, 'index' | 'jobs' | 'runner' | 'startedAt' | 'finishedAt'>[] = [];
  for (const value of input) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('全量分片格式无效');
    const shard = value as BalanceShard;
    if (
      shard.shardProtocol !== 1 ||
      shard.balanceProtocol !== BALANCE_PROTOCOL ||
      shard.stageCount !== 7 ||
      shard.full !== true ||
      shard.acceptance !== true ||
      shard.currentOnly !== true ||
      shard.commit !== identity.commit ||
      shard.currentHash !== identity.currentHash ||
      shard.executionHash !== identity.executionHash ||
      shard.planHash !== planHash ||
      shard.planCount !== plan.length ||
      shard.count !== count
    )
      throw new Error('全量分片的版本、源码或测试计划不一致');
    if (
      !Number.isSafeInteger(shard.index) ||
      shard.index < 0 ||
      shard.index >= count ||
      indexes.has(shard.index)
    )
      throw new Error('全量分片编号无效或重复');
    indexes.add(shard.index);
    const checked = createBalanceShard(
      plan,
      shard.index,
      count,
      identity,
      shard,
      shard.startedAt,
      shard.finishedAt,
      shard.jobs,
      shard.runner,
    );
    if (JSON.stringify(shard.caseKeys) !== JSON.stringify(checked.caseKeys))
      throw new Error('全量分片的样本分配不一致');
    results.push(...shard.results);
    errors.push(...shard.errors);
    startedAt = Math.min(startedAt, shard.startedAt);
    finishedAt = Math.max(finishedAt, shard.finishedAt);
    shards.push({
      index: shard.index,
      jobs: shard.jobs,
      runner: shard.runner,
      startedAt: shard.startedAt,
      finishedAt: shard.finishedAt,
    });
  }
  const run = {
    results: results.sort((a, b) => a.key.localeCompare(b.key)),
    errors: errors.sort((a, b) => a.key.localeCompare(b.key)),
  };
  validateRun(run, plan);
  return { ...run, startedAt, finishedAt, shards: shards.sort((a, b) => a.index - b.index) };
}
