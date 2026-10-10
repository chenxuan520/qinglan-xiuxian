import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newestArtifacts } from './ci-artifacts.ts';
import {
  performanceSource,
  type PerformanceKind,
  type PerformanceSnapshot,
} from '../src/monitor-performance.ts';

export function eligiblePerformanceRun(
  run: {
    path: string;
    head_branch: string;
    head_repository?: { full_name: string };
    event: string;
    status: string;
  },
  repository: string,
  render: boolean,
) {
  return (
    run.path === '.github/workflows/balance.yml' &&
    run.head_branch === 'master' &&
    run.head_repository?.full_name === repository &&
    (render
      ? ['schedule', 'workflow_dispatch'].includes(run.event)
      : run.status === 'completed' && ['push', 'workflow_dispatch'].includes(run.event))
  );
}

export function restorePerformance(
  repository: string,
  outDir = 'dist/monitor',
  localChecks?: { commit: string; runId: number; directory: string },
) {
  mkdirSync(outDir, { recursive: true });
  rmSync(join(outDir, 'render-frame.png'), { force: true });
  const api = (path: string, paginate = false) =>
    JSON.parse(
      execFileSync('gh', ['api', path, ...(paginate ? ['--paginate', '--slurp'] : [])], {
        encoding: 'utf8',
        maxBuffer: 8 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    );
  const sources = Object.fromEntries(
    (['render', 'simulation', 'size'] as const).map((kind) => [
      kind,
      performanceSource(kind, null, null, null),
    ]),
  ) as PerformanceSnapshot['sources'];
  for (const [name, kinds] of [
    ['perf-render', ['render']],
    ['perf-checks', ['simulation', 'size']],
  ] as [string, PerformanceKind[]][]) {
    if (name === 'perf-checks' && localChecks) {
      for (const kind of kinds) {
        const input = JSON.parse(
          readFileSync(
            join(
              localChecks.directory,
              kind === 'simulation' ? 'perf-sim/report.json' : 'size-check/report.json',
            ),
            'utf8',
          ),
        );
        sources[kind] = performanceSource(kind, input, localChecks.commit, localChecks.runId);
        if (sources[kind].state === 'unavailable')
          throw new Error('本次性能摘要结构不完整，拒绝发布。');
      }
      continue;
    }
    // 不把网络/权限故障伪装成从未采样；发布步骤失败，保持上次完整部署。
    const artifacts = newestArtifacts(
      api(`repos/${repository}/actions/artifacts?name=${name}&per_page=100`, true).flatMap(
        (page: {
          artifacts: {
            created_at: string;
            expired: boolean;
            workflow_run: { id: number; head_branch: string };
          }[];
        }) => page.artifacts,
      ),
    );
    for (const artifact of artifacts) {
      if (artifact.expired || artifact.workflow_run?.head_branch !== 'master') continue;
      const run = api(`repos/${repository}/actions/runs/${artifact.workflow_run.id}`);
      if (!eligiblePerformanceRun(run, repository, name === 'perf-render')) continue;
      const temporary = mkdtempSync(join(tmpdir(), 'qinglan-monitor-perf-'));
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
            name,
            '--dir',
            temporary,
          ],
          { stdio: ['ignore', 'pipe', 'pipe'] },
        );
        for (const kind of kinds) {
          const path =
            kind === 'render'
              ? 'report.json'
              : `${kind === 'simulation' ? 'perf-sim' : 'size-check'}/report.json`;
          let input: unknown = null;
          try {
            input = JSON.parse(readFileSync(join(temporary, path), 'utf8'));
          } catch {
            /* 旧产物缺数据时显示未提供，不冒充成功。 */
          }
          sources[kind] = performanceSource(kind, input, run.head_sha, run.id);
        }
        console.log(`保留性能摘要 ${name}：Actions ${run.id}，源提交 ${run.head_sha}`);
      } finally {
        rmSync(temporary, { recursive: true, force: true });
      }
      break;
    }
  }
  const snapshot: PerformanceSnapshot = {
    schemaVersion: 1,
    publishedAt: new Date().toISOString(),
    sources,
  };
  writeFileSync(join(outDir, 'performance.json'), JSON.stringify(snapshot));
  return snapshot;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository || !/^[\w.-]+\/[\w.-]+$/.test(repository))
    throw new Error('缺少合法的 GITHUB_REPOSITORY');
  const local =
    process.env.MONITOR_LOCAL_CHECKS === '1'
      ? {
          commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
          runId: Number(process.env.GITHUB_RUN_ID),
          directory: 'artifacts',
        }
      : undefined;
  if (local && !Number.isSafeInteger(local.runId)) throw new Error('缺少 Actions 任务编号');
  restorePerformance(repository, 'dist/monitor', local);
}
