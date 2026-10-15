import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AUTOPLAY_BUILDS,
  type AutoplayBuild,
  type AutoplayBuildMode,
} from '../src/autoplay-build.ts';
import { ROOT_STARTERS, treasure } from '../src/data.ts';
import { type BalanceCase } from './balance-policy.ts';
import { runCases } from './balance-gate.ts';
import { verifyCoverage } from './balance-metrics.ts';
import type { CampaignSample } from './balance-simulation.ts';
import {
  autoplayInterval,
  validAutoplayReport,
  type AutoplayReport,
} from '../src/autoplay-report.ts';

// 独立固定配对测试，不把培养倾向乘入840快检或10,080全量矩阵。
export const AUTOPLAY_SAMPLE_COUNT = 40;
export const AUTOPLAY_STAGE_COUNT = 6;
export const AUTOPLAY_CUSTOM_TARGETS: [string, string] = ['ice', 'skull'];
export function autoplayCases(): BalanceCase[] {
  const starters = Object.values(ROOT_STARTERS).flat();
  return Array.from({ length: AUTOPLAY_SAMPLE_COUNT }, (_, i) => ({
    root: 'dual',
    path: 'dual',
    starter: starters[i % starters.length],
    device: 'phone',
    profile: 'bare',
    difficulty: 0,
    seed: 41 * (i + 1),
  }));
}
export function autoplayBuild(mode: AutoplayBuildMode): AutoplayBuild {
  return { mode, targets: mode === 'custom' ? [...AUTOPLAY_CUSTOM_TARGETS] : ['', ''] };
}
export interface AutoplayModeResult {
  mode: AutoplayBuildMode;
  rows: CampaignSample[];
}
export function checkAutoplayResults(groups: AutoplayModeResult[], cases = autoplayCases()) {
  assert.equal(groups.length, AUTOPLAY_BUILDS.length, '培养倾向样本缺失');
  assert.equal(new Set(groups.map((g) => g.mode)).size, groups.length, '培养倾向重复');
  for (const group of groups) {
    assert.ok(
      AUTOPLAY_BUILDS.some((mode) => mode.id === group.mode),
      '未知培养倾向',
    );
    verifyCoverage(group.rows, cases);
    for (const row of group.rows) {
      assert.ok(['won', 'lost', 'expired'].includes(row.stop), `异常停止：${row.key} ${row.stop}`);
      assert.ok(
        row.battles.length > 0 && row.battles.length <= AUTOPLAY_STAGE_COUNT,
        '关卡样本范围错误',
      );
      assert.equal(row.stop, row.battles.at(-1)!.state, '停止原因与最后战况不一致');
      if (row.stop === 'won')
        assert.equal(row.battles.length, AUTOPLAY_STAGE_COUNT, '全胜样本漏跑关卡');
      assert.equal(row.complete, false, '前六关测试不能声称已经成仙');
      assert.ok(
        row.battles.every(
          (battle, index) =>
            battle.stage === index &&
            battle.attempt === 1 &&
            ['won', 'lost', 'expired'].includes(battle.state),
        ),
        '应当连续闯关且一试即停',
      );
      assert.equal(
        row.cleared,
        row.battles.filter((battle) => battle.state === 'won').length,
        '胜场记录不一致',
      );
      assert.ok(
        row.battles.slice(0, -1).every((battle) => battle.state === 'won'),
        '失败后不能继续闯关',
      );
      assert.equal(row.ads.supplies + row.ads.borrow + row.ads.revive, 0, '无辅助样本不能观看广告');
    }
  }
}
export function summarizeAutoplay(groups: AutoplayModeResult[], cases = autoplayCases()) {
  checkAutoplayResults(groups, cases);
  const baseline = new Map(
    groups
      .find((g) => g.mode === 'default')!
      .rows.map((row) => [row.key, row.cleared >= AUTOPLAY_STAGE_COUNT]),
  );
  return AUTOPLAY_BUILDS.map((mode) => {
    const group = groups.find((g) => g.mode === mode.id)!;
    const won = group.rows.filter((row) => row.cleared >= AUTOPLAY_STAGE_COUNT).length;
    const improved = group.rows.filter(
      (row) => row.cleared >= AUTOPLAY_STAGE_COUNT && !baseline.get(row.key),
    ).length;
    const regressed = group.rows.filter(
      (row) => row.cleared < AUTOPLAY_STAGE_COUNT && baseline.get(row.key),
    ).length;
    return {
      mode: mode.id,
      name: mode.name,
      samples: cases.length,
      won,
      rate: won / cases.length,
      interval95: autoplayInterval(won, cases.length),
      improved,
      regressed,
      stageClears: Array.from(
        { length: AUTOPLAY_STAGE_COUNT },
        (_, stage) => group.rows.filter((row) => row.cleared > stage).length,
      ),
    };
  });
}
export function autoplaySummary(
  groups: AutoplayModeResult[],
  elapsed: number,
  cases = autoplayCases(),
) {
  const summaries = summarizeAutoplay(groups, cases);
  const percent = (n: number) => `${(n * 100).toFixed(1)}%`;
  return [
    '# 自动历练培养倾向独立小测试',
    '',
    `五种倾向各${cases.length}条，共${cases.length * AUTOPLAY_BUILDS.length}条；实跑${elapsed.toFixed(1)}秒。`,
    '固定双灵根、兼修、手机场地、初入仙途；无广告、药物、根基、炼器或宗门辅助。',
    '同一批开局配对比较：十种入门本命均匀轮换，每种四个种子；从第一关连续闯前六关，失败即停。',
    `指定法宝固定为${AUTOPLAY_CUSTOM_TARGETS.map((id) => treasure(id).name).join('＋')}，该项只代表这组目标。`,
    '',
    '| 培养倾向 | 通过/样本 | 前六关连通率 | 95%区间 | 比默认多过/少过的配对 |',
    '| --- | --- | --- | --- | --- |',
    ...summaries.map(
      (s) =>
        `| ${s.name} | ${s.won}/${s.samples} | ${percent(s.rate)} | ${s.interval95.map(percent).join('～')} | ${s.improved}/${s.regressed} |`,
    ),
    '',
    '配对为同一初始条件与种子，操作不同后随机进程可能分叉。40次小样本用于观察取舍，小幅差距需扩样确认；区间描述本测试种子抽样的不确定性，不代表真人胜率。',
    '每种模式独立执行全部样本；异常、漏样本或重复样本使命令失败，不因某种倾向胜率较低而调整游戏或放宽门禁。',
  ].join('\n');
}
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function git(args: string[]) {
  return execFileSync('git', args, { cwd: repository, encoding: 'utf8' }).trim();
}
export function autoplaySourceHash() {
  const files = git([
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    'src',
    'scripts',
    'package.json',
    'package-lock.json',
  ])
    .split('\n')
    .filter(Boolean);
  const hash = createHash('sha256');
  for (const file of [...new Set(files)].sort())
    hash.update(file + '\0').update(readFileSync(join(repository, file)));
  return hash.digest('hex');
}
export function writeAutoplayReport(directory: string, report: AutoplayReport, summary: string) {
  assert.ok(validAutoplayReport(report), '培养倾向报告完整性校验失败');
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'summary.json'), JSON.stringify(report, null, 2));
  writeFileSync(join(directory, 'summary.md'), summary + '\n');
}
export async function runAutoplayBalance() {
  const cases = autoplayCases(),
    groups: AutoplayModeResult[] = [];
  const directory = mkdtempSync(join(tmpdir(), 'qinglan-autoplay-balance-'));
  const out = join(repository, 'artifacts/autoplay-balance');
  const started = performance.now();
  const commit = git(['rev-parse', 'HEAD']),
    sourceHash = autoplaySourceHash();
  const dirty = !!git(['status', '--porcelain']);
  const runId = process.env.GITHUB_RUN_ID ? Number(process.env.GITHUB_RUN_ID) : null;
  assert.ok(runId === null || (Number.isSafeInteger(runId) && runId > 0), '非法Actions运行编号');
  let returned = 0;
  const meta = () => ({
    schemaVersion: 1 as const,
    generatedAt: new Date().toISOString(),
    commit,
    sourceHash,
    dirty,
    runId,
    elapsedSeconds: (performance.now() - started) / 1000,
    planned: 200 as const,
    returned,
  });
  console.log(`独立培养倾向测试：40个配对开局 × 5种倾向，固定2 worker。\n原始记录：${directory}`);
  try {
    for (const mode of AUTOPLAY_BUILDS) {
      const result = await runCases(
        cases,
        repository,
        2,
        mode.name,
        AUTOPLAY_STAGE_COUNT,
        autoplayBuild(mode.id),
      );
      writeFileSync(join(directory, `${mode.id}.json`), JSON.stringify(result));
      returned += result.results.length;
      assert.equal(result.errors.length, 0, `${mode.name}出现技术异常，见原始记录`);
      groups.push({ mode: mode.id, rows: result.results });
    }
    assert.equal(autoplaySourceHash(), sourceHash, '运行期间代码变化，拒绝混合版本');
    assert.equal(git(['rev-parse', 'HEAD']), commit, '运行期间提交变化，拒绝混合版本');
    const report: AutoplayReport = {
      ...meta(),
      state: 'complete',
      error: null,
      rows: summarizeAutoplay(groups).map(
        ({ mode, samples, won, improved, regressed, stageClears }) => ({
          mode,
          samples,
          won,
          improved,
          regressed,
          stageClears,
        }),
      ),
    };
    const summary = autoplaySummary(groups, report.elapsedSeconds);
    writeAutoplayReport(out, report, summary);
    console.log('\n' + summary + `\n公开摘要：${out}`);
    return { directory, groups, report };
  } catch (error) {
    const message = '模拟异常、样本不完整或源代码在运行期间变化，详见 Actions 日志。';
    writeAutoplayReport(
      out,
      { ...meta(), state: 'failed', error: message, rows: [] },
      `# 培养倾向小测试失败\n\n${message}\n\n已返回 ${returned}/200 条；源提交 ${commit}。`,
    );
    throw error;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length) {
    if (args.length !== 1 || args[0] !== '--plan')
      throw new Error('小测试只支持 --plan，不接受全量或额外维度参数');
    console.log(
      `固定${AUTOPLAY_SAMPLE_COUNT}个配对开局，${AUTOPLAY_BUILDS.length}种倾向，共${AUTOPLAY_SAMPLE_COUNT * AUTOPLAY_BUILDS.length}条前六关连续流程；双灵根、兼修、手机、初入、无辅助；固定2 worker。`,
    );
  } else await runAutoplayBalance();
}
