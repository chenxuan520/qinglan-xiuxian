import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// 上传产物之后执行；失败不会阻止后续 always() 的报告发布作业。
export function checkReportDiagnostics(raw: unknown) {
  if (!raw || typeof raw !== 'object') throw new Error('诊断报告缺失或结构无效');
  const report = raw as {
    schemaVersion?: number;
    scope?: string;
    passed?: boolean;
    counts?: { error?: number; warning?: number };
    items?: { severity?: string }[];
  };
  if (
    report.schemaVersion !== 1 ||
    report.scope !== 'whole-run' ||
    typeof report.passed !== 'boolean' ||
    !Array.isArray(report.items) ||
    !report.counts
  )
    throw new Error('诊断报告缺失或结构无效');
  const error = report.items.filter((item) => item?.severity === 'error').length;
  const warning = report.items.filter((item) => item?.severity === 'warning').length;
  if (
    report.items.length !== error + warning ||
    report.counts.error !== error ||
    report.counts.warning !== warning
  )
    throw new Error('诊断等级或计数不一致');
  if (!report.passed || error > 0)
    throw new Error(
      `完整平衡测试未通过：Error ${error}，Warning ${warning}；请查看日报产物和 CI 日志`,
    );
  return { error, warning };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const file = process.argv[2] ?? 'artifacts/balance-daily-report/diagnostics.json';
    const result = checkReportDiagnostics(JSON.parse(readFileSync(file, 'utf8')));
    console.log(
      `完整平衡测试通过：Error ${result.error}，Warning ${result.warning}；Warning 仅作观察提示。`,
    );
  } catch (error) {
    console.error(
      `::error::${error instanceof Error ? error.message : '完整平衡测试诊断无法验收'}`,
    );
    process.exitCode = 1;
  }
}
