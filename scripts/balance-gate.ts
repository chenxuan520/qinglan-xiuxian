import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
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
interface SimulationError {
  case: BalanceCase;
  key: string;
  error: string;
}

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
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
export async function runCases(
  cases: BalanceCase[],
  root: string,
  jobs: number,
  label: string,
  stageCount = 7,
) {
  if (!Number.isInteger(stageCount) || stageCount < 1 || stageCount > 7)
    throw new Error('模拟关卡数必须为 1–7');
  const results: CampaignSample[] = [];
  const errors: SimulationError[] = [];
  const received = new Set<string>();
  const batches = Array.from({ length: jobs }, () => [] as BalanceCase[]);
  cases.forEach((c, i) => batches[i % jobs].push(c));
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
      batches
        .filter((batch) => batch.length)
        .map(
          (batch) =>
            new Promise<void>((complete, reject) => {
              const worker = new Worker(
                pathToFileURL(join(root, 'scripts/balance-simulation.ts')),
                {
                  workerData: { cases: batch, farms: false, stageCount },
                  execArgv: ['--experimental-strip-types'],
                },
              );
              workers.push(worker);
              worker.on('message', (result: CampaignSample | SimulationError) => {
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
              });
              worker.on('error', reject);
              worker.on('exit', (code) =>
                code === 0 ? complete() : reject(new Error(`模拟 worker 退出 ${code}`)),
              );
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
    jobs: Math.min(4, availableParallelism()),
    report: join(repository, 'artifacts/balance-gate.json'),
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
    } else if (/^--jobs=[1-9]\d*$/.test(arg)) options.jobs = Math.min(8, Number(arg.slice(7)));
    else if (arg.startsWith('--report=') && arg.slice(9)) options.report = resolve(arg.slice(9));
    else
      throw new Error(
        `未知参数：${arg}。仅支持 --full、--acceptance、--current-only、--growth-targets、--jobs=N、--report=路径`,
      );
  }
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
export async function main(args: string[]) {
  const options = parseArgs(args);
  const started = Date.now();
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repository,
    encoding: 'utf8',
  }).trim();
  const reference = mkdtempSync(join(tmpdir(), 'qinglan-balance-reference-'));
  try {
    const archive = execFileSync('git', ['archive', BALANCE_REFERENCE, 'src'], {
      cwd: repository,
      maxBuffer: 32 * 1024 * 1024,
    });
    execFileSync('tar', ['-xf', '-', '-C', reference], { input: archive });
    mkdirSync(join(reference, 'scripts'));
    writeFileSync(join(reference, 'package.json'), '{"type":"module"}');
    for (const name of ['balance-simulation.ts', 'balance-policy.ts'])
      cpSync(join(repository, 'scripts', name), join(reference, 'scripts', name));
    const currentHash = sourceHash(repository),
      referenceHash = sourceHash(reference);
    const coreFiles = [
      'data.ts',
      'game.ts',
      'progress.ts',
      'autoplay.ts',
      'medicine.ts',
      'medicine-data.ts',
      'mortal.ts',
      'mortal-data.ts',
      'ads.ts',
    ];
    const coreChanged = coreFiles.some(
      (file) =>
        !readFileSync(join(repository, 'src', file)).equals(
          readFileSync(join(reference, 'src', file)),
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
    const currentRun = await runCases(cases, repository, options.jobs, '当前');
    // 产品源码逐字节相同才复用同一确定性实测，数值改变必须真的运行旧引擎对照。
    const reuse = currentHash === referenceHash;
    const referenceRun =
      reuse || options.currentOnly
        ? currentRun
        : await runCases(cases, reference, options.jobs, '对照');
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
        : await import(pathToFileURL(join(reference, 'scripts/balance-simulation.ts')).href);
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
      elapsedSeconds: (Date.now() - started) / 1000,
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
    rmSync(reference, { recursive: true, force: true });
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
