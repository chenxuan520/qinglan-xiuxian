import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { refreshReport } from './balance-report.ts';
import { eligibleBalanceReportRun, newestArtifacts } from './ci-artifacts.ts';
// 只恢复本仓库 master 的每日/手动/数值 push 完整报告，不接收 PR 或分支产物。
const repository = process.env.GITHUB_REPOSITORY;
if (!repository) throw new Error('缺少 GITHUB_REPOSITORY');
const api = (path: string) =>
  JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }));
const artifacts = newestArtifacts<{
  created_at: string;
  expired: boolean;
  workflow_run: { id: number; head_branch: string };
}>(
  JSON.parse(
    execFileSync(
      'gh',
      [
        'api',
        `repos/${repository}/actions/artifacts?name=balance-daily-report&per_page=100`,
        '--paginate',
        '--slurp',
      ],
      { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
    ),
  ).flatMap(
    (page: {
      artifacts: {
        created_at: string;
        expired: boolean;
        workflow_run: { id: number; head_branch: string };
      }[];
    }) => page.artifacts,
  ),
);
let found = false;
for (const artifact of artifacts) {
  if (artifact.expired || artifact.workflow_run.head_branch !== 'master') continue;
  const run = api(`repos/${repository}/actions/runs/${artifact.workflow_run.id}`);
  if (!eligibleBalanceReportRun(run, repository)) continue;
  const target = resolve('dist/balance-report');
  mkdirSync(target, { recursive: true });
  execFileSync(
    'gh',
    [
      'run',
      'download',
      String(run.id),
      '--repo',
      repository,
      '--name',
      'balance-daily-report',
      '--dir',
      target,
    ],
    { stdio: 'inherit' },
  );
  refreshReport(target);
  console.log(`保留每日报告，测试提交 ${run.head_sha}，Actions ${run.id}`);
  found = true;
  break;
}
if (!found) console.log('尚无已完成的正式每日报告；首个每日完整测试完成后生成。');
