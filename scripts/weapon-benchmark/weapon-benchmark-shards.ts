// 仅协调 CI 分片，所有实战、计划、统计与公开报告继续使用原测评工具。
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { cpus, availableParallelism } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createWeaponOutput,
  parseWeaponOptions,
  runWeaponBenchmark,
  validateWeaponOutput,
  verifyCampaigns,
  weaponRepository,
  weaponSourceHash,
  weaponToolHash,
} from './weapon-benchmark.ts';
import {
  weaponBenchmarkPlan,
  weaponCaseKey,
  weaponCampaignPlan,
  WEAPON_BENCHMARK_PROTOCOL,
} from './weapon-benchmark-policy.ts';
import {
  buildWeaponReport,
  verifyWeaponCoverage,
  writeWeaponReport,
} from './weapon-benchmark-report.ts';
import type { WeaponOptions } from './weapon-benchmark.ts';
import { caseKey } from '../balance/balance-policy.ts';
import { verifyCoverage } from '../balance/balance-metrics.ts';

export const WEAPON_CI_SHARDS = 8;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function weaponShardOptions(options: WeaponOptions, index: number, count: number) {
  assert.ok(
    Number.isSafeInteger(count) && count > 0 && count <= options.weapons.length,
    '分片总数无效',
  );
  assert.ok(Number.isSafeInteger(index) && index >= 0 && index < count, '分片编号无效');
  // 同一法宝的自然、配对、复验与连续流程归到同片；完整计划仍从原策略生成。
  const ranked = options.weapons
    .map((id) => {
      const single = { ...options, weapons: [id] };
      return { id, weight: weaponBenchmarkPlan(single).length + weaponCampaignPlan(single).length };
    })
    .sort((a, b) => b.weight - a.weight || hash(a.id).localeCompare(hash(b.id)));
  const groups = Array.from({ length: count }, () => ({
    weapons: [] as typeof options.weapons,
    weight: 0,
  }));
  for (const item of ranked) {
    const lightest = groups.reduce((a, b) => (a.weight <= b.weight ? a : b));
    lightest.weapons.push(item.id);
    lightest.weight += item.weight;
  }
  const selected = new Set(groups[index].weapons);
  return { ...options, weapons: options.weapons.filter((id) => selected.has(id)) };
}

export function weaponPlanHash(options: WeaponOptions) {
  return hash({ plan: weaponBenchmarkPlan(options), campaigns: weaponCampaignPlan(options) });
}

function identity() {
  const runId = process.env.GITHUB_RUN_ID ? Number(process.env.GITHUB_RUN_ID) : null;
  assert.ok(runId === null || (Number.isSafeInteger(runId) && runId > 0), '非法Actions运行编号');
  return {
    commit: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: weaponRepository,
      encoding: 'utf8',
    }).trim(),
    sourceHash: weaponSourceHash(),
    toolHash: weaponToolHash(),
    runId,
  };
}
const readJson = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const readLines = (file: string): any[] =>
  readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));

export function readWeaponShards(
  directory: string,
  options: WeaponOptions,
  expected: ReturnType<typeof identity>,
  count = WEAPON_CI_SHARDS,
) {
  const descriptors = readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((file) => file.isFile() && file.name === 'shard.json')
    .map((file) => join(file.parentPath, file.name));
  assert.equal(descriptors.length, count, '法宝测评分片缺失或重复');
  const indexes = new Set<number>(),
    rows: any[] = [],
    campaigns: any[] = [];
  let startedAt = Infinity,
    workers = 0;
  const planHash = weaponPlanHash(options);
  const shards = [];
  for (const file of descriptors) {
    const shard = readJson(file),
      root = dirname(file);
    assert.equal(shard.shardProtocol, 1, '未知法宝分片协议');
    assert.equal(shard.count, count, '分片总数不符');
    assert.equal(shard.planHash, planHash, '完整测试计划不符');
    for (const [key, value] of Object.entries(expected))
      assert.equal(shard[key], value, `分片${key}不符`);
    assert.ok(!indexes.has(shard.index), '法宝测评分片编号重复');
    const subset = weaponShardOptions(options, shard.index, count);
    indexes.add(shard.index);
    const manifest = readJson(join(root, 'manifest.json')),
      complete = readJson(join(root, 'complete.json'));
    for (const [key, value] of Object.entries(expected))
      assert.equal(manifest[key], value, `原始清单${key}不符`);
    assert.equal(manifest.protocolVersion, WEAPON_BENCHMARK_PROTOCOL);
    const plan = weaponBenchmarkPlan(subset),
      campaignPlan = weaponCampaignPlan(subset);
    assert.deepEqual(manifest.plan, plan, '实战/配对计划不符');
    assert.deepEqual(manifest.campaignPlan, campaignPlan, '连续流程计划不符');
    assert.deepEqual(manifest.options.weapons, subset.weapons, '法宝分配不符');
    for (const key of ['seeds', 'extended', 'seedOffset'])
      assert.equal(manifest.options[key], options[key as keyof WeaponOptions]);
    assert.ok(
      Number.isSafeInteger(manifest.options.workers) && manifest.options.workers > 0,
      'worker记录无效',
    );
    const planned = plan.length + campaignPlan.length;
    assert.equal(manifest.planned, planned);
    assert.equal(complete.planned, planned);
    assert.equal(complete.returned, planned);
    assert.ok(
      Number.isFinite(complete.elapsedSeconds) && complete.elapsedSeconds >= 0,
      '运行时间无效',
    );
    assert.ok(
      Number.isFinite(shard.startedAt) &&
        Number.isFinite(shard.finishedAt) &&
        shard.startedAt >= 0 &&
        shard.finishedAt >= shard.startedAt &&
        shard.finishedAt <= Date.now() + 300000,
      '分片时间无效',
    );
    assert.ok(
      shard.runner &&
        typeof shard.runner.node === 'string' &&
        typeof shard.runner.cpuModel === 'string' &&
        Number.isSafeInteger(shard.runner.availableCpus) &&
        shard.runner.availableCpus > 0,
      '分片计算资源记录无效',
    );
    assert.ok(
      Array.isArray(manifest.shards) &&
        manifest.shards.length === Math.min(manifest.options.workers, plan.length),
      '原始文件列表无效',
    );
    assert.equal(new Set(manifest.shards).size, manifest.shards.length, '原始文件重复');
    const part = manifest.shards.flatMap((name: string) => {
      assert.match(name, /^samples-\d+\.jsonl$/, '非法原始文件路径');
      return readLines(join(root, name));
    });
    const flows = readLines(join(root, 'campaigns.jsonl'));
    verifyWeaponCoverage(part, plan);
    verifyCampaigns(flows, campaignPlan);
    const expectedJobs = new Map(plan.map((job) => [weaponCaseKey(job), job]));
    for (const row of part) {
      const job = row.job ?? row;
      const target = expectedJobs.get(weaponCaseKey(job))!;
      for (const [key, value] of Object.entries(target))
        assert.equal(job[key], value, '样本计划身份类型不符');
      const observations =
        job.kind === 'pair'
          ? [
              [row.candidate, target],
              [row.reference, { ...target, weapon: job.reference }],
            ]
          : [[row, target]];
      for (const [observation, expectedJob] of observations) {
        for (const [key, value] of Object.entries(expectedJob))
          assert.equal(observation[key], value, '实战观测与计划身份不符');
        assert.equal(observation.entry.root, expectedJob.root, '实战入场灵根不符');
      }
    }
    if (campaignPlan.length) {
      verifyCoverage(flows, campaignPlan);
      const expectedCases = new Map(campaignPlan.map((c) => [caseKey(c), c]));
      for (const row of flows)
        assert.deepEqual(row.case, expectedCases.get(caseKey(row.case)), '连续流程身份不符');
    }
    rows.push(...part);
    campaigns.push(...flows);
    startedAt = Math.min(startedAt, shard.startedAt);
    workers += Math.min(manifest.options.workers, plan.length);
    shards.push({
      index: shard.index,
      workers: manifest.options.workers,
      runner: shard.runner,
      startedAt: shard.startedAt,
      finishedAt: shard.finishedAt,
    });
  }
  const plan = weaponBenchmarkPlan(options),
    campaignPlan = weaponCampaignPlan(options);
  verifyWeaponCoverage(rows, plan);
  verifyCampaigns(campaigns, campaignPlan);
  // 按原单机执行器的文件分组顺序排列；统一统计原始记录，不平均各片的统计值。
  const positions = new Map(plan.map((job, index) => [weaponCaseKey(job), index]));
  rows.sort((a, b) => {
    const x = positions.get(weaponCaseKey(a.job ?? a))!,
      y = positions.get(weaponCaseKey(b.job ?? b))!;
    return (x % workers) - (y % workers) || x - y;
  });
  const flowPositions = new Map(campaignPlan.map((c, index) => [caseKey(c), index]));
  campaigns.sort(
    (a, b) => flowPositions.get(caseKey(a.case))! - flowPositions.get(caseKey(b.case))!,
  );
  return { rows, campaigns, startedAt, workers, shards };
}

export async function weaponShardMain(args: string[]) {
  assert.equal(args.length, 4, '使用 --shard INDEX/8 --out DIR 或 --merge DIR --out DIR');
  const [mode, value, outKey, outValue] = args;
  assert.ok(mode === '--shard' || mode === '--merge', '未知法宝CI模式');
  assert.equal(outKey, '--out');
  assert.ok(outValue);
  const options = parseWeaponOptions(['--extended']),
    expected = identity();
  assert.equal(
    weaponBenchmarkPlan(options).length + weaponCampaignPlan(options).length,
    10400,
    'CI必须运行原完整10400计划',
  );
  if (mode === '--shard') {
    assert.match(value, /^[0-7]\/8$/, '法宝CI须为0～7号八分片');
    const index = Number(value.split('/')[0]),
      startedAt = Date.now();
    const subset = {
      ...weaponShardOptions(options, index, WEAPON_CI_SHARDS),
      out: validateWeaponOutput(outValue),
    };
    console.log(
      `法宝CI分片${index + 1}/8；资源 ${JSON.stringify({ availableCpus: availableParallelism(), cpuModel: cpus()[0]?.model ?? 'unavailable', node: process.version })}`,
    );
    await runWeaponBenchmark(subset);
    assert.deepEqual(identity(), expected, '分片期间提交、源码或工具改变');
    writeFileSync(
      join(subset.out, 'shard.json'),
      JSON.stringify({
        shardProtocol: 1,
        index,
        count: WEAPON_CI_SHARDS,
        ...expected,
        planHash: weaponPlanHash(options),
        startedAt,
        finishedAt: Date.now(),
        runner: {
          node: process.version,
          cpuModel: cpus()[0]?.model ?? 'unavailable',
          availableCpus: availableParallelism(),
        },
      }),
    );
  } else {
    const out = createWeaponOutput(outValue),
      startedAt = Date.now();
    try {
      const merged = readWeaponShards(resolve(value), options, expected);
      assert.deepEqual(identity(), expected, '合并期间提交、源码或工具改变');
      const report = buildWeaponReport(
        merged.rows,
        merged.campaigns,
        { ...options, workers: merged.workers },
        {
          commit: expected.commit,
          sourceHash: expected.sourceHash,
          runId: expected.runId,
          elapsedSeconds: (Date.now() - merged.startedAt) / 1000,
          planned: 10400,
          error: null,
        },
      );
      writeWeaponReport(out, report);
      writeFileSync(join(out, 'execution.json'), JSON.stringify({ shards: merged.shards }));
      console.log(
        `法宝CI完整合并：${report.returned}/10400；${merged.workers}个模拟worker，报告 ${out}`,
      );
    } catch (error) {
      writeWeaponReport(
        out,
        buildWeaponReport([], [], options, {
          commit: expected.commit,
          sourceHash: expected.sourceHash,
          runId: expected.runId,
          elapsedSeconds: (Date.now() - startedAt) / 1000,
          planned: 10400,
          error: String(error),
        }),
      );
      throw error;
    }
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  weaponShardMain(process.argv.slice(2)).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
