import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { availableParallelism } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import {
  selectBenchmarkWeapons,
  weaponBenchmarkPlan,
  weaponCampaignPlan,
  WEAPON_BENCHMARK_PROTOCOL,
} from './weapon-benchmark-policy.ts';
import type { WeaponPlanOptions } from './weapon-benchmark-policy.ts';
import {
  buildWeaponReport,
  verifyWeaponCoverage,
  writeWeaponReport,
} from './weapon-benchmark-report.ts';

export const weaponRepository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const toolFiles = [
  'scripts/weapon-benchmark.ts',
  'scripts/weapon-benchmark-policy.ts',
  'scripts/weapon-benchmark-simulation.ts',
  'scripts/weapon-benchmark-report.ts',
  'src/weapon-report.ts',
  'scripts/balance-simulation.ts',
  'scripts/balance-policy.ts',
];
export interface WeaponOptions extends WeaponPlanOptions {
  workers: number;
  out?: string;
  planOnly: boolean;
  reportOnly: boolean;
}
export function parseWeaponOptions(args: string[]): WeaponOptions {
  const options: WeaponOptions = {
    weapons: selectBenchmarkWeapons(),
    seeds: 10,
    extended: false,
    seedOffset: 0,
    workers: Math.max(1, Math.min(3, availableParallelism() - 1)),
    planOnly: false,
    reportOnly: false,
  };
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    assert.ok(!seen.has(key), `参数重复：${key}`);
    seen.add(key);
    if (key === '--extended') options.extended = true;
    else if (key === '--plan') options.planOnly = true;
    else if (key === '--report-only') options.reportOnly = true;
    else if (['--weapons', '--seeds', '--workers', '--out', '--seed-offset'].includes(key)) {
      const value = args[++i];
      assert.ok(value && !value.startsWith('--'), `缺少参数值：${key}`);
      if (key === '--weapons') options.weapons = selectBenchmarkWeapons(value);
      else if (key === '--out') options.out = resolve(value);
      else {
        assert.match(value, /^\d+$/, `参数须为非负整数：${key}`);
        const n = Number(value);
        if (key === '--seeds') options.seeds = n;
        else if (key === '--workers') options.workers = n;
        else options.seedOffset = n;
      }
    } else throw new Error(`未知参数：${key}`);
  }
  assert.ok(
    Number.isSafeInteger(options.workers) && options.workers >= 1 && options.workers <= 64,
    'worker数须为1～64',
  );
  assert.ok(!(options.planOnly && options.reportOnly), '计划预览与重新汇总不能同时启用');
  if (options.reportOnly) assert.ok(options.out, '重新汇总必须指定--out');
  weaponBenchmarkPlan(options);
  return options;
}
function canonical(path: string): string {
  if (existsSync(path)) return realpathSync(path);
  const parent = dirname(path);
  assert.notEqual(parent, path, '无法解析输出目录');
  return join(canonical(parent), basename(path));
}
export function validateWeaponOutput(path: string, repository = weaponRepository) {
  const target = canonical(resolve(path)),
    repo = canonical(repository);
  const rel = relative(repo, target);
  if (rel === '' || (!rel.startsWith('../') && !isAbsolute(rel)))
    assert.ok(
      rel === 'artifacts' || rel.startsWith('artifacts/'),
      '生成结果只能放仓库忽略的artifacts/或仓库外',
    );
  return target;
}
export function createWeaponOutput(path?: string) {
  if (path) {
    const target = validateWeaponOutput(path);
    assert.ok(
      !existsSync(target) || readdirSync(target).length === 0,
      '输出目录已有内容，请使用新目录，避免混入旧结果',
    );
    mkdirSync(target, { recursive: true });
    return target;
  }
  const parent = validateWeaponOutput(join(weaponRepository, 'artifacts'));
  mkdirSync(parent, { recursive: true });
  return mkdtempSync(join(parent, 'weapon-benchmark-'));
}
function hashFiles(files: string[]) {
  const h = createHash('sha256');
  for (const file of [...files].sort()) {
    h.update(file + '\0').update(readFileSync(join(weaponRepository, file)));
  }
  return h.digest('hex');
}
export function weaponSourceHash() {
  const files = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', 'src', 'package-lock.json'],
    { cwd: weaponRepository, encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter(Boolean);
  return hashFiles([...new Set(files)]);
}
const readLines = (path: string) =>
  readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
export async function runWeaponBenchmark(options: WeaponOptions) {
  const plan = weaponBenchmarkPlan(options),
    campaignPlan = weaponCampaignPlan(options),
    planned = plan.length + campaignPlan.length;
  if (options.planOnly) {
    console.log(
      JSON.stringify(
        {
          协议: WEAPON_BENCHMARK_PROTOCOL,
          主战斗及配对记录: plan.length,
          连续流程: campaignPlan.length,
          总计划: planned,
          并发: options.workers,
        },
        null,
        2,
      ),
    );
    return;
  }
  if (options.reportOnly) {
    const out = validateWeaponOutput(options.out!),
      manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'));
    assert.equal(manifest.sourceHash, weaponSourceHash(), '源代码已变化，拒绝混合版本重新汇总');
    assert.equal(manifest.toolHash, hashFiles(toolFiles), '测评工具已变化，拒绝混合工具版本');
    const complete = JSON.parse(readFileSync(join(out, 'complete.json'), 'utf8'));
    assert.equal(complete.returned, manifest.planned, '原始测试没有完整完成');
    const rows = manifest.shards.flatMap((f: string) => readLines(join(out, f))),
      campaigns = readLines(join(out, 'campaigns.jsonl'));
    verifyWeaponCoverage(rows, manifest.plan);
    verifyCampaigns(campaigns, manifest.campaignPlan);
    const report = buildWeaponReport(rows, campaigns, manifest.options, {
      commit: manifest.commit,
      sourceHash: manifest.sourceHash,
      runId: manifest.runId,
      elapsedSeconds: complete.elapsedSeconds,
      planned: manifest.planned,
      error: null,
    });
    writeWeaponReport(out, report);
    console.log(`已重新汇总：${out}`);
    return;
  }
  const out = createWeaponOutput(options.out),
    started = performance.now(),
    sourceHash = weaponSourceHash(),
    toolHash = hashFiles(toolFiles);
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: weaponRepository,
    encoding: 'utf8',
  }).trim();
  const runId = process.env.GITHUB_RUN_ID ? Number(process.env.GITHUB_RUN_ID) : null;
  assert.ok(runId === null || (Number.isSafeInteger(runId) && runId > 0), '非法Actions运行编号');
  const workerCount = Math.min(options.workers, plan.length),
    shards = Array.from({ length: workerCount }, (_, i) => `samples-${i}.jsonl`);
  const manifest = {
    protocolVersion: WEAPON_BENCHMARK_PROTOCOL,
    generatedAt: new Date().toISOString(),
    commit,
    sourceHash,
    toolHash,
    runId,
    options,
    planned,
    plan,
    campaignPlan,
    shards,
  };
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest));
  writeFileSync(join(out, 'campaigns.jsonl'), '');
  console.log(
    `法宝测评：${options.weapons.length}件，计划${planned}条，${workerCount}个worker；输出 ${out}`,
  );
  const workers: Worker[] = [];
  let done = 0,
    campaigns: any[] = [],
    rows: any[] = [];
  try {
    await Promise.all(
      shards.map(
        (file, index) =>
          new Promise<void>((resolve, reject) => {
            const jobs = plan.filter((_, i) => i % workerCount === index);
            writeFileSync(join(out, file), '');
            const w = new Worker(new URL('./weapon-benchmark-simulation.ts', import.meta.url), {
              workerData: { weaponBenchmark: true, jobs, file: join(out, file) },
            });
            workers.push(w);
            let returned = 0;
            w.on('message', () => {
              returned++;
              done++;
              if (done % 100 === 0 || done === plan.length)
                console.log(
                  `实战/配对 ${done}/${plan.length}，累计${((performance.now() - started) / 60_000).toFixed(1)}分钟`,
                );
            });
            w.on('error', reject);
            w.on('exit', (code) =>
              code === 0 && returned === jobs.length
                ? resolve()
                : reject(
                    new Error(`计算worker未完整返回：${returned}/${jobs.length}，退出码${code}`),
                  ),
            );
          }),
      ),
    );
    rows = shards.flatMap((file) => readLines(join(out, file)));
    verifyWeaponCoverage(rows, plan);
    if (campaignPlan.length) {
      // 正式模拟器自己的worker入口保持原状；在主线程调用，避免导入时误启动另一个worker循环。
      const { simulateCampaign } = await import('./balance-simulation.ts');
      for (const c of campaignPlan) {
        campaigns.push(simulateCampaign(c, 6));
        writeFileSync(
          join(out, 'campaigns.jsonl'),
          campaigns.map((r) => JSON.stringify(r)).join('\n') + '\n',
        );
        if (campaigns.length % 10 === 0)
          console.log(`正式前六关流程 ${campaigns.length}/${campaignPlan.length}`);
      }
      verifyCampaigns(campaigns, campaignPlan);
    }
    assert.equal(weaponSourceHash(), sourceHash, '运行中源代码变化，拒绝发布混合版本');
    assert.equal(hashFiles(toolFiles), toolHash, '运行中测评工具变化，拒绝发布混合结果');
    const elapsedSeconds = (performance.now() - started) / 1000;
    const report = buildWeaponReport(rows, campaigns, options, {
      commit,
      sourceHash,
      runId,
      elapsedSeconds,
      planned,
      error: null,
    });
    writeWeaponReport(out, report);
    writeFileSync(
      join(out, 'complete.json'),
      JSON.stringify({
        returned: report.returned,
        planned,
        elapsedSeconds,
        generatedAt: report.generatedAt,
      }),
    );
    console.log(
      `测评完成：${report.returned}/${planned}，${(elapsedSeconds / 60).toFixed(1)}分钟。报告 ${join(out, 'index.html')}`,
    );
  } catch (error) {
    await Promise.allSettled(workers.map((w) => w.terminate()));
    const message = error instanceof Error ? error.message : String(error);
    const failure = buildWeaponReport([], [], options, {
      commit,
      sourceHash,
      runId,
      elapsedSeconds: (performance.now() - started) / 1000,
      planned,
      error: message,
    });
    writeWeaponReport(out, failure);
    throw error;
  }
}
export function verifyCampaigns(rows: any[], plan: any[]) {
  const key = (c: any) =>
    [c.starter, c.root, c.path, c.device, c.seed, c.profile, c.difficulty].join('/');
  assert.equal(rows.length, plan.length, '连续流程漏样本');
  assert.equal(new Set(rows.map((r) => key(r.case))).size, rows.length, '连续流程重复样本');
  assert.deepEqual(
    rows.map((r) => key(r.case)).sort(),
    plan.map(key).sort(),
    '连续流程存在计划外样本',
  );
  for (const r of rows)
    assert.ok(
      Number.isInteger(r.cleared) &&
        r.cleared >= 0 &&
        r.cleared <= 6 &&
        r.battles.every((b: any) => b.stage < 6),
      '连续流程不能进入第七关',
    );
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await runWeaponBenchmark(parseWeaponOptions(process.argv.slice(2)));
  } catch (error) {
    console.error(`法宝测评失败：${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
