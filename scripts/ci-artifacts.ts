// GitHub 的内部 artifact 编号与数组位置不能代替生成时间。
export function newestArtifacts<T extends { created_at: string; expired?: boolean }>(
  artifacts: readonly T[],
): T[] {
  return artifacts
    .filter((a) => !a.expired && Number.isFinite(Date.parse(a.created_at)))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}
