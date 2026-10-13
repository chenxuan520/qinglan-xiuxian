import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PUBLIC_FONT_CSS =
  'https://fonts.loli.net/css2?family=Noto+Serif+SC:wght@200..900&display=swap';
export interface BinaryApproval {
  bytes: number;
  sha256: string;
}
export type ApprovedBinaries = Record<string, BinaryApproval>;
export interface RepositoryFile {
  path: string;
  data: Uint8Array;
}

export function isBinary(data: Uint8Array, path = '') {
  if (new TextDecoder().decode(data.subarray(0, 5)) === '%PDF-') return true;
  if (
    /\.(?:woff2?|ttf|otf|eot|ttc|png|jpe?g|webp|gif|avif|ico|bmp|pdf|mp3|wav|ogg|m4a|flac|mp4|webm|mov|zip|gz|br|7z|rar|tar|wasm|exe|dll|so|bin)$/i.test(
      path,
    )
  )
    return true;
  if (data.includes(0) || data.some((byte) => byte < 32 && ![9, 10, 13].includes(byte)))
    return true;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(data);
    return false;
  } catch {
    return true;
  }
}

export function binaryBreaches(files: RepositoryFile[], approved: ApprovedBinaries) {
  const breaches: string[] = [];
  const present = new Set(files.map((file) => file.path));
  for (const { path, data } of files) {
    const approval = approved[path];
    if (!approval && isBinary(data, path)) breaches.push(`禁止新增二进制文件：${path}`);
    if (
      approval &&
      (data.length !== approval.bytes ||
        createHash('sha256').update(data).digest('hex') !== approval.sha256)
    )
      breaches.push(`已批准二进制素材被替换：${path}`);
  }
  const fonts = [...present].filter((path) => /\.(woff2?|ttf|otf|eot|ttc)$/i.test(path));
  if (fonts.length) breaches.push(`禁止提交字体文件：${fonts.join('、')}`);
  for (const { path, data } of files.filter(
    (file) =>
      /\.(css|html)$/i.test(file.path) ||
      (file.path.startsWith('src/') && /\.[cm]?[jt]s$/i.test(file.path)),
  )) {
    const text = new TextDecoder()
      .decode(data)
      .replaceAll(`"${PUBLIC_FONT_CSS}"`, '""')
      .replaceAll(`'${PUBLIC_FONT_CSS}'`, "''");
    if (
      /@font-face\b/i.test(text) ||
      /fonts\.(?:googleapis|gstatic)\.com/i.test(text) ||
      /\bFontFace\s*\(|\bfonts\s*\.\s*add\s*\(/.test(text) ||
      (/\.css$/i.test(path) && /@import\b/i.test(text)) ||
      (/\.html$/i.test(path) &&
        (/<link\b(?=[^>]*\bas\s*=\s*['"]font['"])[^>]*>/i.test(text) ||
          /<link\b(?=[^>]*\brel\s*=\s*['"]stylesheet['"])(?=[^>]*\bhref\s*=\s*['"](?:https?:|\/\/))[^>]*>/i.test(
            text,
          ))) ||
      /https?:\/\/[^\s'"`]+\.(?:woff2?|ttf|otf|eot)(?:[?'"`\s]|$)/i.test(text)
    )
      breaches.push(`禁止新增本地或外部字体加载：${path}`);
  }
  return breaches;
}

interface CommitEvent {
  before?: string;
  after?: string;
  pull_request?: { base?: { sha?: string }; head?: { sha?: string } };
}

export function commitBinaryBreaches(
  cwd: string,
  approved: ApprovedBinaries,
  eventName: string,
  event: CommitEvent,
) {
  const git = (args: string[]) =>
    execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  const policyPath = 'scripts/approved-binaries.json';
  const bootstrap = git(['log', '--reverse', '--format=%H', 'HEAD', '--', policyPath])
    .toString()
    .trim()
    .split('\n')[0];
  if (!bootstrap) return []; // 首次提交前由文件树检查；提交后基线不可增补或删除。
  const canonical = JSON.parse(git(['show', `${bootstrap}:${policyPath}`]).toString());
  const sameApproval = (value: ApprovedBinaries) =>
    JSON.stringify(Object.entries(value).sort()) ===
    JSON.stringify(Object.entries(canonical).sort());
  const before = eventName === 'pull_request' ? event.pull_request?.base?.sha : event.before;
  const after = eventName === 'pull_request' ? event.pull_request?.head?.sha : event.after;
  let range = ['HEAD'];
  if (after && /^[a-f0-9]{40}$/.test(after)) range = [after];
  if (before && /^[a-f0-9]{40}$/.test(before) && !/^0+$/.test(before)) {
    try {
      git(['cat-file', '-e', `${before}^{commit}`]);
      range.push(`^${before}`);
    } catch {
      // 强推或新分支：扫描历史，不能只检查最终文件树。
    }
  }
  const commits = git(['rev-list', ...range])
    .toString()
    .trim()
    .split('\n')
    .filter(Boolean);
  const breaches: string[] = [];
  if (!sameApproval(approved)) breaches.push('禁止修改已批准二进制基线来放行新增素材');
  for (const commit of commits) {
    // 只豁免基线建立时已经存在的历史。旧提交分出的新侧支也必须逐提交检查。
    if (commit !== bootstrap) {
      try {
        git(['merge-base', '--is-ancestor', commit, bootstrap]);
        continue;
      } catch {
        // 本次新增的提交，即使其分支没有继承基线，也不能放过中间二进制。
      }
    }
    let inheritsPolicy = false;
    try {
      git(['merge-base', '--is-ancestor', bootstrap, commit]);
      inheritsPolicy = true;
    } catch {
      // 旧基点上的文本分支可能尚无基线，不把这种情况误报为删除。
    }
    let policy: Buffer | null = null;
    try {
      policy = git(['show', `${commit}:${policyPath}`]);
    } catch {
      if (inheritsPolicy) breaches.push(`提交 ${commit.slice(0, 7)} 删除或损坏了二进制基线`);
    }
    if (policy !== null) {
      try {
        if (!sameApproval(JSON.parse(policy.toString())))
          breaches.push(`提交 ${commit.slice(0, 7)} 禁止修改二进制基线`);
      } catch {
        breaches.push(`提交 ${commit.slice(0, 7)} 删除或损坏了二进制基线`);
      }
    }
    const added = git([
      'diff-tree',
      '--root',
      '-m',
      '--no-renames',
      '--diff-filter=AM',
      '--name-only',
      '-r',
      '-z',
      '--no-commit-id',
      commit,
    ])
      .toString()
      .split('\0')
      .filter(Boolean);
    for (const path of new Set(added)) {
      const data = git(['show', `${commit}:${path}`]);
      const approval = canonical[path];
      if (!approval && isBinary(data, path))
        breaches.push(`提交 ${commit.slice(0, 7)} 禁止新增二进制文件：${path}`);
      if (
        approval &&
        (data.length !== approval.bytes ||
          createHash('sha256').update(data).digest('hex') !== approval.sha256)
      )
        breaches.push(`提交 ${commit.slice(0, 7)} 替换了已批准二进制素材：${path}`);
    }
  }
  return breaches;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const approved: ApprovedBinaries = JSON.parse(
    readFileSync('scripts/approved-binaries.json', 'utf8'),
  );
  const files = execFileSync('git', [
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    '-z',
  ])
    .toString()
    .split('\0')
    .filter((path) => path && existsSync(path))
    .map((path) => ({ path, data: readFileSync(path) }));
  const event: CommitEvent = process.env.GITHUB_EVENT_PATH
    ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
    : {};
  const breaches = [
    ...binaryBreaches(files, approved),
    ...commitBinaryBreaches(process.cwd(), approved, process.env.GITHUB_EVENT_NAME ?? '', event),
  ];
  if (breaches.length) {
    for (const breach of breaches) console.error(breach);
    process.exitCode = 1;
  } else console.log(`二进制门禁通过：仅保留已批准素材，字体文件为 0，新增二进制为 0。`);
}
