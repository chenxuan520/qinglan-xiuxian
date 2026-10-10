// GitHub 的内部 artifact 编号与数组位置不能代替生成时间。
export function newestArtifacts<T extends { created_at: string; expired?: boolean }>(
  artifacts: readonly T[],
): T[] {
  return artifacts
    .filter((a) => !a.expired && Number.isFinite(Date.parse(a.created_at)))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

// 报告即使失败也保留最新结果；只接受本仓库 master 的正式全量产物。
export function eligibleBalanceReportRun(
  run: {
    path: string;
    head_branch: string;
    head_repository?: { full_name: string };
    event: string;
    status: string;
  },
  repository: string,
) {
  return (
    run.path === '.github/workflows/balance.yml' &&
    run.head_branch === 'master' &&
    run.head_repository?.full_name === repository &&
    run.status === 'completed' &&
    ['schedule', 'workflow_dispatch', 'push'].includes(run.event)
  );
}
