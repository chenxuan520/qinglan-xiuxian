import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { availableParallelism, cpus, tmpdir } from 'node:os';
import { basename, relative, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import {
  BALANCE_PROTOCOL,
  BALANCE_REFERENCE,
  balanceCases,
  caseKey,
  LIMITS,
} from './balance-policy.ts';
import type { BalanceCase } from './balance-policy.ts';
import {
  acceptanceFailures,
  bossReadiness,
  compareMetrics,
  growthReadiness,
  rootClearRows,
  summarize,
  verifyCoverage,
} from './balance-metrics.ts';
import { growthShape, simulateFarm } from './balance-simulation.ts';
import type { CampaignSample } from './balance-simulation.ts';
import { createBalanceShard, mergeBalanceShards, selectShardCases } from './balance-shards.ts';
import type { RunnerCapacity, SimulationError } from './balance-shards.ts';
import type { AutoplayBuild } from '../../src/battle/autoplay-build.ts';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
function sourceHash(root: string) {
  const hash = createHash('sha256');
  function visit(directory: string, prefix: string) {
    for (const item of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const relative = `${prefix}/${item.name}`;
      if (item.isDirectory()) visit(join(directory, item.name), relative);
      else {
        hash.update(relative);
        hash.update(readFileSync(join(directory, item.name)));
      }
    }
  }
  visit(join(root, 'src'), 'src');
  return hash.digest('hex');
}
export function executionHash(root = repository) {
  const hash = createHash('sha256');
  for (const name of [
    'balance-gate.ts',
    'balance-worker.ts',
    'balance-shards.ts',
    'balance-policy.ts',
    'balance-metrics.ts',
    'balance-simulation.ts',
  ]) {
    hash.update(name);
    hash.update(readFileSync(join(root, 'scripts/balance', name)));
  }
  return hash.digest('hex');
}

function runnerCapacity(): RunnerCapacity {
  const models = cpus();
  let cpuQuota: string | null = null;
  try {
    cpuQuota = readFileSync('/sys/fs/cgroup/cpu.max', 'utf8').trim();
  } catch {
    // 非 cgroup v2 或非 Linux 环境没有此观测值，不以主机逻辑核数冒充配额。
  }
  return {
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    cpuModel: models[0]?.model ?? 'unavailable',
    logicalCpus: models.length,
    availableCpus: availableParallelism(),
    cpuQuota,
  };
}

function readShardFiles(directory: string): unknown[] {
  const files = readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
  return files.map((file) => JSON.parse(readFileSync(file, 'utf8')));
}
export async function runCases(
  cases: BalanceCase[],
  root: string,
  jobs: number,
  label: string,
  stageCount = 7,
  autoplayBuild?: AutoplayBuild,
) {
  if (!Number.isInteger(stageCount) || stageCount < 1 || stageCount > 7)
    throw new Error('模拟关卡数必须为 1–7');
  if (!Number.isSafeInteger(jobs) || jobs < 1) throw new Error('并发数必须为正整数');
  const results: CampaignSample[] = [];
  const errors: SimulationError[] = [];
  const received = new Set<string>();
  let next = 0;
  const workers: Worker[] = [];
  const started = Date.now();
  let last = started;
  function preserveRaw(error: unknown) {
    const directory = mkdtempSync(join(tmpdir(), 'qinglan-balance-failed-'));
    const file = join(directory, 'samples.json');
    writeFileSync(file, JSON.stringify({ label, cases, results, errors }));
    console.error(`模拟/覆盖校验失败，原始样本已保留：${file}`);
    return error;
  }
  try {
    await Promise.all(
      Array.from(
        { length: Math.min(jobs, cases.length) },
        () =>
          new Promise<void>((complete, reject) => {
            const worker = new Worker(new URL('./balance-worker.ts', import.meta.url), {
              // 空批次兼容历史模拟器；实际样本由空闲 worker 逐条领取。
              workerData: { root, cases: [], farms: false, stageCount, autoplayBuild },
              execArgv: ['--experimental-strip-types'],
            });
            workers.push(worker);
            let assigned: BalanceCase | undefined;
            function dispatch() {
              assigned = cases[next++];
              worker.postMessage(assigned ?? null);
            }
            worker.on('message', (result: CampaignSample | SimulationError) => {
              if (!assigned || result?.key !== caseKey(assigned)) {
                reject(new Error(`worker 返回非当前任务结果：${result?.key}`));
                return;
              }
              if (received.has(result.key)) {
                reject(new Error(`重复 worker 结果：${result.key}`));
                return;
              }
              received.add(result.key);
              if ('error' in result) errors.push(result);
              else results.push(result);
              if (Date.now() - last > 15000 || received.size === cases.length) {
                console.log(
                  `${label} ${received.size}/${cases.length}，异常 ${errors.length}，${((Date.now() - started) / 1000).toFixed(1)} 秒`,
                );
                last = Date.now();
              }
              dispatch();
            });
            worker.on('error', reject);
            worker.on('exit', (code) => {
              if (code !== 0) reject(new Error(`模拟 worker 退出 ${code}`));
              else if (assigned) reject(new Error(`worker 样本缺失：${caseKey(assigned)}`));
              else complete();
            });
            dispatch();
          }),
      ),
    );
  } catch (error) {
    await Promise.all(workers.map((worker) => worker.terminate()));
    throw preserveRaw(error);
  }
  try {
    if (received.size !== cases.length)
      throw new Error(`worker 样本缺失：${received.size}/${cases.length}`);
    const failed = new Set(errors.map((e) => e.key));
    const expected = new Set(cases.map(caseKey));
    if (errors.some((e) => caseKey(e.case) !== e.key || !expected.has(e.key)))
      throw new Error('未知异常样本');
    const validCases = cases.filter((c) => !failed.has(caseKey(c)));
    if (results.some((r) => r.cleared > stageCount || r.battles.some((b) => b.stage >= stageCount)))
      throw new Error('模拟超出要求的关卡范围');
    if (validCases.length) verifyCoverage(results, validCases);
    else if (results.length) throw new Error('异常集合与结果不一致');
  } catch (error) {
    throw preserveRaw(error);
  }
  return { results: results.sort((a, b) => a.key.localeCompare(b.key)), errors };
}
function parseArgs(args: string[]) {
  const options = {
    full: false,
    growth: false,
    acceptance: false,
    currentOnly: false,
    jobs: availableParallelism(),
    report: join(repository, 'artifacts/balance-gate.json'),
    shard: undefined as { index: number; count: number } | undefined,
    mergeShards: undefined as string | undefined,
    shardCount: 8,
  };
  const seen = new Set<string>();
  for (const arg of args) {
    const key = arg.split('=')[0];
    if (seen.has(key)) throw new Error(`重复参数：${key}`);
    seen.add(key);
    if (arg === '--full') options.full = true;
    else if (arg === '--current-only') options.currentOnly = true;
    else if (arg === '--growth-targets') options.growth = true;
    else if (arg === '--acceptance') {
      options.acceptance = true;
      options.full = true;
    } else if (/^--jobs=[1-9]\d*$/.test(arg)) options.jobs = Number(arg.slice(7));
    else if (/^--shard=\d+\/[1-9]\d*$/.test(arg)) {
      const [index, count] = arg.slice(8).split('/').map(Number);
      options.shard = { index, count };
    } else if (arg.startsWith('--merge-shards=') && arg.slice(15))
      options.mergeShards = resolve(arg.slice(15));
    else if (/^--shard-count=[1-9]\d*$/.test(arg)) options.shardCount = Number(arg.slice(14));
    else if (arg.startsWith('--report=') && arg.slice(9)) options.report = resolve(arg.slice(9));
    else
      throw new Error(
        `未知参数：${arg}。仅支持 --full、--acceptance、--current-only、--growth-targets、--jobs=N、--report=路径、--shard=编号/总数、--merge-shards=目录、--shard-count=N`,
      );
  }
  if (options.shard && options.mergeShards) throw new Error('分片运行与分片合并不能同时指定');
  if (
    (options.shard || options.mergeShards) &&
    (!options.full || !options.acceptance || !options.currentOnly)
  )
    throw new Error('分片仅支持完整矩阵的当前独立验收：--full --acceptance --current-only');
  if (seen.has('--shard-count') && !options.mergeShards)
    throw new Error('--shard-count 仅用于合并分片');
  if (!Number.isSafeInteger(options.jobs) || !Number.isSafeInteger(options.shardCount))
    throw new Error('并发数与分片总数必须为有效整数');
  const artifactRoot = join(repository, 'artifacts');
  if (
    !options.report.startsWith(artifactRoot + '/') &&
    !options.report.startsWith(resolve(tmpdir()) + '/')
  )
    throw new Error('报告只能写入仓库 artifacts/ 或系统临时目录');
  if (existsSync(options.report) && !options.report.startsWith(artifactRoot + '/'))
    throw new Error('拒绝覆盖 artifacts 以外的现有文件');
  return options;
}
function sourceFile(root: string, name: string): string {
  const directory = join(root, 'src');
  const direct = join(directory, name);
  if (existsSync(direct)) return direct;
  const matches = readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name === name)
    .map((entry) => join(entry.parentPath, entry.name));
  if (matches.length > 1) throw new Error(`源码路径不唯一：${name}`);
  return matches[0] ?? direct;
}
export function prepareBalanceReference(currentOnly: boolean, root = repository) {
  if (currentOnly) return null;
  const reference = mkdtempSync(join(tmpdir(), 'qinglan-balance-reference-'));
  try {
    const archive = execFileSync('git', ['archive', BALANCE_REFERENCE, 'src'], {
      cwd: root,
      maxBuffer: 32 * 1024 * 1024,
    });
    execFileSync('tar', ['-xf', '-', '-C', reference], { input: archive });
    mkdirSync(join(reference, 'scripts/balance'), { recursive: true });
    writeFileSync(join(reference, 'package.json'), '{"type":"module"}');
    for (const name of ['balance-simulation.ts', 'balance-policy.ts']) {
      const target = join(reference, 'scripts/balance', name);
      const content = readFileSync(join(root, 'scripts/balance', name), 'utf8').replace(
        /((?:from\s*|import\s*)['"])(\.\.\/\.\.\/src\/[^'"]+)(['"])/g,
        (_match, prefix, path, suffix) => {
          const file = resolve(dirname(target), path);
          const actual = existsSync(file) ? file : sourceFile(reference, basename(path));
          return prefix + relative(dirname(target), actual).split('\\').join('/') + suffix;
        },
      );
      writeFileSync(target, content);
    }
    return reference;
  } catch (error) {
    rmSync(reference, { recursive: true, force: true });
    throw error;
  }
}
export async function main(args: string[]) {
  const options = parseArgs(args);
  const started = Date.now();
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repository,
    encoding: 'utf8',
  }).trim();
  const reference = prepareBalanceReference(options.currentOnly);
  try {
    const currentHash = sourceHash(repository),
      referenceHash = reference ? sourceHash(reference) : undefined;
    const coreFiles = [
      'data.ts',
      'game.ts',
      'enemy-stats.ts',
      'game-validation.ts',
      'boss-followup.ts',
      'progress.ts',
      'autoplay.ts',
      'medicine.ts',
      'medicine-data.ts',
      'mortal.ts',
      'mortal-data.ts',
      'ads.ts',
    ];
    const coreChanged =
      reference !== null &&
      coreFiles.some(
        (file) =>
          !existsSync(sourceFile(reference, file)) ||
          !readFileSync(sourceFile(repository, file)).equals(
            readFileSync(sourceFile(reference, file)),
          ),
      );
    if (coreChanged) {
      options.full = true;
      options.acceptance = true;
      console.log('战斗/成长核心相对已确认版本改变，自动强制完整目标门禁。');
    }
    const cases = balanceCases(options.full);
    console.log(
      `平衡门禁：${cases.length} 条路线，${options.full ? '20 样本/组、三个难度' : '全部本命快速覆盖、初入仙途'}；裸开荒一试即停，其余 5 次/关、${LIMITS.battleSeconds} 秒/局；${options.currentOnly ? '当前独立验收（不执行历史对照）' : `对照 ${BALANCE_REFERENCE.slice(0, 7)}`}`,
    );
    const identity = { commit, currentHash, executionHash: executionHash() };
    const capacity = runnerCapacity();
    console.log(`模拟资源：${JSON.stringify({ ...capacity, requestedJobs: options.jobs })}`);
    if (options.shard) {
      const { index, count } = options.shard;
      const selected = selectShardCases(cases, index, count);
      const workerCount = Math.min(options.jobs, selected.length);
      console.log(
        `完整矩阵分片 ${index + 1}/${count}：${selected.length} 条，${workerCount} 个 worker`,
      );
      const run = await runCases(selected, repository, options.jobs, `分片 ${index + 1}/${count}`);
      if (sourceHash(repository) !== currentHash || executionHash() !== identity.executionHash)
        throw new Error('分片期间源码发生变化，不能合并为正式报告');
      const shard = createBalanceShard(
        cases,
        index,
        count,
        identity,
        run,
        started,
        Date.now(),
        workerCount,
        capacity,
      );
      mkdirSync(dirname(options.report), { recursive: true });
      writeFileSync(options.report, JSON.stringify(shard), {
        flag: options.report.startsWith(join(repository, 'artifacts') + '/') ? 'w' : 'wx',
      });
      console.log(`分片 ${index + 1}/${count} 已保存；完整验收将在全部分片合并后执行。`);
      return;
    }
    const merged = options.mergeShards
      ? mergeBalanceShards(readShardFiles(options.mergeShards), cases, options.shardCount, identity)
      : undefined;
    const currentRun = merged ?? (await runCases(cases, repository, options.jobs, '当前'));
    const reportStarted = merged ? Math.min(started, merged.startedAt) : started;
    if (merged)
      console.log(
        `已合并 ${options.shardCount}/${options.shardCount} 片，共 ${currentRun.results.length + currentRun.errors.length}/${cases.length} 条，继续原完整验收。`,
      );
    // 产品源码逐字节相同才复用同一确定性实测，数值改变必须真的运行旧引擎对照。
    const reuse = currentHash === referenceHash;
    const referenceRun =
      reuse || options.currentOnly
        ? currentRun
        : await runCases(cases, reference!, options.jobs, '对照');
    const current = currentRun.results,
      before = referenceRun.results;
    const currentMetrics = summarize(current, cases),
      referenceMetrics = summarize(before, cases);
    const regressionFailures = options.currentOnly
      ? []
      : compareMetrics(currentMetrics, referenceMetrics);
    const bossFailures = bossReadiness(current);
    const readinessFailures = growthReadiness(current, growthShape());
    const targetFailures = acceptanceFailures(current, currentRun.errors, false);
    const groupFailures = acceptanceFailures(current, currentRun.errors).filter(
      (f) => !targetFailures.includes(f),
    );
    // 刷首关也用真实同一存档重复结算，首通礼包只可发放一次。
    const farmCases = cases.filter(
      (c) =>
        c.profile === 'earned' &&
        c.difficulty === 0 &&
        c.seed === 41 &&
        ['sword', 'nail'].includes(c.starter),
    );
    const farms = farmCases.map((c) => simulateFarm(c));
    const referenceModule =
      reuse || options.currentOnly
        ? null
        : await import(
            pathToFileURL(join(reference!, 'scripts/balance/balance-simulation.ts')).href
          );
    const beforeFarms =
      reuse || options.currentOnly ? farms : farmCases.map((c) => referenceModule.simulateFarm(c));
    for (const [index, farm] of farms.entries()) {
      if (farm.battles.filter((b) => b.firstClearCultivation > 0).length > 1)
        regressionFailures.push(`首通修为重复领取：${caseLabel(farm.case)}`);
      const old = beforeFarms[index];
      const rewardRate = (rows: typeof farm.battles) => {
        const seconds = rows.reduce((n, b) => n + b.seconds, 0);
        return seconds
          ? rows.reduce((n, b) => n + b.cultivation - b.firstClearCultivation, 0) / seconds
          : 0;
      };
      const a = rewardRate(farm.battles),
        b = rewardRate(old.battles);
      if (Math.abs(a - b) > Math.abs(b) * LIMITS.growth + 0.01)
        regressionFailures.push(`首关重刷修为效率变化过大：${caseLabel(farm.case)} ${b} → ${a}`);
    }
    const failures = [
      ...(sourceHash(repository) === currentHash
        ? []
        : ['模拟期间产品源码发生变化，结果不可用于发布；必须重跑']),
      ...currentRun.errors.map((e) => `${e.key}：模拟/恢复异常 ${e.error}`),
      ...(reuse || options.currentOnly
        ? []
        : referenceRun.errors.map((e) => `${e.key}：对照模拟异常 ${e.error}`)),
      ...regressionFailures,
      ...(options.growth || options.acceptance ? readinessFailures : []),
      ...(options.acceptance ? targetFailures : []),
    ];
    const report = {
      commit,
      generatedAt: new Date().toISOString(),
      elapsedSeconds: (Date.now() - reportStarted) / 1000,
      execution: merged
        ? { kind: 'sharded', count: options.shardCount, shards: merged.shards }
        : { kind: 'single-runner', jobs: Math.min(options.jobs, cases.length), runner: capacity },
      failures,
      bossFailures,
      groupFailures,
      targets: '前六关；终关仅记录，不以旧成仙目标阻断',
      comparison: options.currentOnly
        ? '当前完整矩阵独立验收，历史差异另行研究'
        : '真实旧引擎双向对照',
      protocol: BALANCE_PROTOCOL,
      reference: BALANCE_REFERENCE,
      currentHash,
      referenceHash,
      referenceReused: reuse,
      coreChanged,
      full: options.full,
      cases: cases.length,
      limits: LIMITS,
      currentMetrics,
      referenceMetrics: options.currentOnly ? undefined : referenceMetrics,
      current,
      simulationErrors: currentRun.errors,
      referenceErrors: options.currentOnly ? [] : referenceRun.errors,
      ...(reuse || options.currentOnly ? {} : { before }),
      farms,
      beforeFarms: options.currentOnly ? undefined : beforeFarms,
      regressionFailures,
      readinessFailures,
      targetFailures,
      growthTargetsRequired: options.growth || options.acceptance,
      acceptanceRequired: options.acceptance,
      passed: failures.length === 0,
    };
    mkdirSync(dirname(options.report), { recursive: true });
    writeFileSync(options.report, JSON.stringify(report), {
      flag: options.report.startsWith(join(repository, 'artifacts') + '/') ? 'w' : 'wx',
    });
    console.table(
      rootClearRows(currentMetrics).map((row) => ({
        ...row,
        ...(options.currentOnly
          ? {}
          : { reference: `${((referenceMetrics[row.group].rate ?? 0) * 100).toFixed(1)}%` }),
      })),
    );
    console.log(
      `修为目标检查：${readinessFailures.length ? '未达标（独立于现有版本回归基线）' : '通过'}；报告 ${options.report}`,
    );
    for (const failure of failures.slice(0, 30)) console.error(failure);
    if (failures.length > 30) console.error(`另有 ${failures.length - 30} 个失败，见完整报告`);
    if (failures.length) throw new Error(`平衡门禁失败 ${failures.length} 项`);
    console.log(
      `${options.currentOnly ? '当前完整目标门禁' : '回归门禁'}通过 ${current.length}/${cases.length}；固定种子自动策略样本不等于真人胜率。`,
    );
  } finally {
    if (reference) rmSync(reference, { recursive: true, force: true });
  }
}
function caseLabel(c: BalanceCase) {
  return `${c.root}/${c.path}/${c.starter}/${c.device}`;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
