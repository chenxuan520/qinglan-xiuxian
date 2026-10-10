import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// 按文件保守判断：这些文件中的纯重构也会重算；界面、素材和普通文档不会触发。
export const BALANCE_FILES = new Set([
  'src/data.ts',
  'src/progress.ts',
  'src/game.ts',
  'src/autoplay.ts',
  'src/spirit-power.ts',
  'src/ads.ts',
  'src/medicine.ts',
  'src/medicine-data.ts',
  'src/mortal.ts',
  'src/mortal-data.ts',
  'scripts/balance-policy.ts',
  'scripts/balance-metrics.ts',
  'scripts/balance-simulation.ts',
  'scripts/balance-gate.ts',
  'scripts/balance-ci.ts',
  'scripts/balance-report-diagnostics.ts',
  'scripts/balance-change-trigger.ts',
  'scripts/check-balance-report.ts',
  '.github/workflows/balance.yml',
]);

export function balanceChangedFiles(files: string[]) {
  return [...new Set(files.filter((file) => BALANCE_FILES.has(file)))].sort();
}

interface ChangeEvent {
  before?: string;
  after?: string;
  pull_request?: { base?: { sha?: string }; head?: { sha?: string } };
}

export function detectBalanceChanges(eventName: string, event: ChangeEvent, cwd = process.cwd()) {
  if (eventName !== 'push' && eventName !== 'pull_request')
    return { full: false, files: [], reason: '定时或手动任务按所选模式执行' };
  const git = (args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const before = eventName === 'pull_request' ? event.pull_request?.base?.sha : event.before;
  const after = eventName === 'pull_request' ? event.pull_request?.head?.sha : event.after;
  let files: string[];
  try {
    if (
      !before ||
      !after ||
      /^0+$/.test(before) ||
      !/^[a-f0-9]{40}$/.test(before) ||
      !/^[a-f0-9]{40}$/.test(after)
    )
      throw new Error('没有可用的比较提交');
    // 禁用重命名合并，删除/移走数值文件也要命中其原路径。
    const range = eventName === 'pull_request' ? [`${before}...${after}`] : [before, after];
    files = git(['diff', '--no-renames', '--name-only', '-z', ...range, '--'])
      .split('\0')
      .filter(Boolean);
  } catch {
    // 新分支或强推使旧 SHA 不可读取时，不能把未知范围当成没有数值变化。
    return { full: true, files: [], reason: '比较范围无法读取，保守执行完整矩阵' };
  }
  const changed = balanceChangedFiles(files);
  return {
    full: changed.length > 0,
    files: changed,
    reason: changed.length ? '经验或数值相关文件发生变化' : '没有经验或数值相关文件变化',
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = detectBalanceChanges(
    process.env.GITHUB_EVENT_NAME ?? '',
    JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH!, 'utf8')),
  );
  console.log(
    `${result.reason}；全量重算：${result.full ? '是' : '否'}${result.files.length ? `\n${result.files.join('\n')}` : ''}`,
  );
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `full=${result.full}\n`);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `完整矩阵触发检查：${result.reason}。${result.files.length ? `\n\n${result.files.map((file) => `- \`${file}\``).join('\n')}` : ''}\n`,
    );
}
