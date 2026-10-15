import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newestArtifacts } from './ci-artifacts.ts';
import { validAutoplayReport } from '../src/autoplay-report.ts';

export const AUTOPLAY_PUBLIC_FILES = ['summary.json', 'summary.md'];
export function eligibleAutoplayRun(
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
    run.path === '.github/workflows/autoplay-balance.yml' &&
    run.head_branch === 'master' &&
    run.head_repository?.full_name === repository &&
    run.status === 'completed' &&
    run.conclusion !== 'cancelled' &&
    ['schedule', 'workflow_dispatch'].includes(run.event)
  );
}
export function checkDailyAutoplayReport(directory: string, commit?: string, runId?: number) {
  const report = JSON.parse(readFileSync(join(directory, 'summary.json'), 'utf8'));
  assert.ok(validAutoplayReport(report), '倾向对照摘要损坏');
  assert.equal(report.dirty, false, '正式日报不能来自未提交版本');
  if (commit) assert.equal(report.commit, commit, '日报提交与Actions不符');
  if (runId) assert.equal(report.runId, runId, '日报运行编号与Actions不符');
  for (const file of AUTOPLAY_PUBLIC_FILES)
    assert.ok(readFileSync(join(directory, file)).length > 0, `日报缺少${file}`);
  return report;
}
export function restoreAutoplayReport(repository: string, out = 'dist/autoplay-report') {
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
      `repos/${repository}/actions/artifacts?name=autoplay-daily-report&per_page=100`,
      true,
    ).flatMap((p: any) => p.artifacts),
  );
  for (const artifact of artifacts) {
    if (artifact.workflow_run?.head_branch !== 'master') continue;
    const run = api(`repos/${repository}/actions/runs/${artifact.workflow_run.id}`);
    if (!eligibleAutoplayRun(run, repository)) continue;
    const temp = mkdtempSync(join(tmpdir(), 'qinglan-autoplay-report-'));
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
          'autoplay-daily-report',
          '--dir',
          temp,
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
      checkDailyAutoplayReport(temp, run.head_sha, run.id);
      mkdirSync(out, { recursive: true });
      for (const file of AUTOPLAY_PUBLIC_FILES) cpSync(join(temp, file), join(out, file));
      console.log(`保留最新倾向对照：Actions ${run.id}，源提交 ${run.head_sha}`);
      return;
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  }
  console.log('尚无已完成的正式倾向对照，首轮完成后显示。');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repository = process.env.GITHUB_REPOSITORY;
  assert.ok(repository && /^[\w.-]+\/[\w.-]+$/.test(repository), '缺少合法GITHUB_REPOSITORY');
  if (process.argv[2] === '--check')
    checkDailyAutoplayReport(
      process.argv[3],
      process.env.REPORT_COMMIT,
      Number(process.env.REPORT_RUN) || undefined,
    );
  else restoreAutoplayReport(repository);
}
