import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
// 只恢复本仓库 master 的正式每日/手动完整报告，不接收 PR 或分支产物。
const repository = process.env.GITHUB_REPOSITORY;
if (!repository) throw new Error('缺少 GITHUB_REPOSITORY');
const api = (path: string) =>
  JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }));
const artifacts = api(
  `repos/${repository}/actions/artifacts?name=balance-daily-report&per_page=100`,
).artifacts;
let found = false;
for (const artifact of artifacts) {
  if (artifact.expired || artifact.workflow_run.head_branch !== 'master') continue;
  const run = api(`repos/${repository}/actions/runs/${artifact.workflow_run.id}`);
  if (
    run.status !== 'completed' ||
    run.path !== '.github/workflows/balance.yml' ||
    !['schedule', 'workflow_dispatch'].includes(run.event)
  )
    continue;
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
  console.log(`保留每日报告，测试提交 ${run.head_sha}，Actions ${run.id}`);
  found = true;
  break;
}
if (!found) console.log('尚无已完成的正式每日报告；首个每日完整测试完成后生成。');
