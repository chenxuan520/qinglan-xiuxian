import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newestArtifacts } from './ci-artifacts.ts';
import { validWeaponReport } from '../src/weapon-report.ts';
import { TREASURES } from '../src/data.ts';

export const WEAPON_PUBLIC_FILES = [
  'index.html',
  'summary.json',
  'summary.md',
  'battles.csv',
  'pairs.csv',
];
export function eligibleWeaponRun(
  run: {
    path: string;
    head_branch: string;
    head_repository?: { full_name: string };
    event: string;
    status: string;
    conclusion?: string | null;
  },
  repository: string,
) {
  return (
    run.path === '.github/workflows/weapon-benchmark.yml' &&
    run.head_branch === 'master' &&
    run.head_repository?.full_name === repository &&
    run.status === 'completed' &&
    run.conclusion !== 'cancelled' &&
    ['schedule', 'workflow_dispatch'].includes(run.event)
  );
}
export function checkDailyWeaponReport(directory: string, commit?: string, runId?: number) {
  const report = JSON.parse(readFileSync(join(directory, 'summary.json'), 'utf8'));
  assert.ok(validWeaponReport(report), '法宝日报摘要损坏');
  assert.ok(
    report.options.extended && report.options.seeds === 10 && report.options.seedOffset === 0,
    '正式日报必须使用标准完整测评',
  );
  assert.deepEqual(
    [...report.options.weapons].sort(),
    TREASURES.map((t) => t.id).sort(),
    '正式日报必须覆盖36法宝',
  );
  if (commit) assert.equal(report.commit, commit, '日报提交与Actions不符');
  if (runId) assert.equal(report.runId, runId, '日报运行编号与Actions不符');
  for (const file of WEAPON_PUBLIC_FILES)
    assert.ok(readFileSync(join(directory, file)).length > 0, `日报缺少${file}`);
  return report;
}
export function restoreWeaponReport(repository: string, out = 'dist/weapon-report') {
  const api = (path: string, paginate = false) =>
    JSON.parse(
      execFileSync('gh', ['api', path, ...(paginate ? ['--paginate', '--slurp'] : [])], {
        encoding: 'utf8',
        maxBuffer: 8 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    );
  const artifacts = newestArtifacts<any>(
    api(
      `repos/${repository}/actions/artifacts?name=weapon-daily-report&per_page=100`,
      true,
    ).flatMap((p: any) => p.artifacts),
  );
  for (const artifact of artifacts) {
    if (artifact.workflow_run?.head_branch !== 'master') continue;
    const run = api(`repos/${repository}/actions/runs/${artifact.workflow_run.id}`);
    if (!eligibleWeaponRun(run, repository)) continue;
    const temp = mkdtempSync(join(tmpdir(), 'qinglan-weapon-report-'));
    try {
      execFileSync(
        'gh',
        [
          'run',
          'download',
          String(run.id),
          '--repo',
          repository,
          '--name',
          'weapon-daily-report',
          '--dir',
          temp,
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
      checkDailyWeaponReport(temp, run.head_sha, run.id);
      mkdirSync(out, { recursive: true });
      for (const file of WEAPON_PUBLIC_FILES) cpSync(join(temp, file), join(out, file));
      console.log(`保留最新法宝日报：Actions ${run.id}，源提交 ${run.head_sha}`);
      return;
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  }
  console.log('尚无已完成的正式法宝日报，首轮完成后显示。');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repository = process.env.GITHUB_REPOSITORY;
  assert.ok(repository && /^[\w.-]+\/[\w.-]+$/.test(repository), '缺少合法GITHUB_REPOSITORY');
  if (process.argv[2] === '--check')
    checkDailyWeaponReport(
      process.argv[3],
      process.env.REPORT_COMMIT,
      Number(process.env.REPORT_RUN) || undefined,
    );
  else restoreWeaponReport(repository);
}
