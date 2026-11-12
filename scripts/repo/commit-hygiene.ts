import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const docsOnly = (paths: string[]) =>
  paths.length > 0 && paths.every((path) => path === 'AGENTS.md' || path.startsWith('docs/'));

export const docsSubject = (subject: string) => /^docs(?:\([^)]+\))?: \S/.test(subject);

export function checkCommits(commits: { sha: string; subject: string; paths: string[] }[]) {
  const errors: string[] = [];
  const subjects = new Map<string, string[]>();
  for (const commit of commits) {
    const short = commit.sha.slice(0, 7);
    const subject = commit.subject.trim();
    if (!subject) errors.push(`${short} 空提交标题`);
    subjects.set(subject, [...(subjects.get(subject) ?? []), commit.sha]);
    if (docsOnly(commit.paths) && !docsSubject(subject))
      errors.push(`${short} 只改文档但标题不是 docs: 前缀：${subject}`);
  }
  for (const [subject, shas] of subjects)
    if (shas.length > 1)
      errors.push(`重复提交标题「${subject}」：${shas.map((sha) => sha.slice(0, 7)).join(', ')}`);
  return errors;
}

function git(args: string[]) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function commitRange() {
  const before = process.env.GITHUB_EVENT_BEFORE;
  const after = process.env.GITHUB_EVENT_AFTER || 'HEAD';
  const prBase = process.env.PR_BASE;
  const prHead = process.env.PR_HEAD || 'HEAD';
  if (prBase && prHead) return `${prBase}..${prHead}`;
  if (before && !/^0+$/.test(before) && before !== after) return `${before}..${after}`;
  return 'HEAD^..HEAD';
}

function main() {
  const commits = git(['log', '--format=%H%x09%s', commitRange()])
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, ...subject] = line.split('\t');
      return {
        sha,
        subject: subject.join('\t'),
        paths: git(['diff-tree', '--no-commit-id', '--name-only', '-r', '--root', sha])
          .split('\n')
          .filter(Boolean),
      };
    });
  const errors = checkCommits(commits);
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
    return;
  }
  console.log(`提交规范检查通过：${commits.length} 个提交`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
