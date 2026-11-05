import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const UPLOAD_LIMITS = { compressed: 64 * 1024 ** 2, expanded: 512 * 1024 ** 2 };
export const BALANCE_SIMULATION_FILES = [
  'scripts/balance-gate.ts',
  'scripts/balance-simulation.ts',
  'scripts/balance-policy.ts',
  'scripts/balance-metrics.ts',
];
const workflow = 'balance-import.yml';
const assetName = 'balance-input.json.gz';
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const commitPattern = /^[a-f0-9]{40}$/i;

export type CommandRunner = (
  command: 'git' | 'gh',
  args: string[],
  options: { cwd: string; input?: Buffer },
) => Buffer;

// 不转发命令异常的 stdout/stderr，避免 gh 的认证或服务端响应进入日志。
export const runCommand: CommandRunner = (command, args, options) => {
  try {
    return execFileSync(command, args, {
      ...options,
      maxBuffer: 64 * 1024 ** 2,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    throw new Error(`${command} ${args[0]} 执行失败`);
  }
};

type GitFile = { mode: string; bytes: Buffer };

function gitFiles(root: string, commit: string, run: CommandRunner) {
  if (!commitPattern.test(commit)) throw new Error('源提交必须是完整的 40 位十六进制 SHA');
  const entries = run('git', ['ls-tree', '-rz', '--full-tree', commit, '--', 'src', 'scripts'], {
    cwd: root,
  })
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map((entry) => {
      const match = /^(\d+) blob ([a-f0-9]{40})\t([\s\S]+)$/.exec(entry);
      if (!match) throw new Error('源树包含不支持的文件类型');
      return { mode: match[1], oid: match[2], path: match[3] };
    });
  const batch = run('git', ['cat-file', '--batch'], {
    cwd: root,
    input: Buffer.from(entries.map((entry) => entry.oid + '\n').join('')),
  });
  let offset = 0;
  const files = new Map<string, GitFile>();
  for (const entry of entries) {
    const newline = batch.indexOf(10, offset);
    const header = batch.subarray(offset, newline).toString('ascii');
    const match = /^([a-f0-9]{40}) blob (\d+)$/.exec(header);
    if (!match || match[1] !== entry.oid) throw new Error('无法读取完整源树');
    const start = newline + 1;
    const end = start + Number(match[2]);
    if (end >= batch.length || batch[end] !== 10) throw new Error('源树文件字节不完整');
    files.set(entry.path, { mode: entry.mode, bytes: batch.subarray(start, end) });
    offset = end + 1;
  }
  return files;
}

function hashSourceFiles(files: Map<string, GitFile>) {
  // 与 balance-gate.ts 一致：逐层 localeCompare，路径后紧接原始文件字节。
  const tree = new Map<string, Map<string, string>>();
  for (const path of files.keys()) {
    if (!path.startsWith('src/')) continue;
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) {
      const parent = parts.slice(0, i).join('/');
      if (!tree.has(parent)) tree.set(parent, new Map());
      tree.get(parent)!.set(parts[i], parts.slice(0, i + 1).join('/'));
    }
  }
  if (!tree.has('src')) throw new Error('源提交缺少完整 src 树');
  const hash = createHash('sha256');
  function visit(directory: string) {
    for (const [, path] of [...tree.get(directory)!].sort(([a], [b]) => a.localeCompare(b))) {
      if (tree.has(path)) visit(path);
      else {
        const file = files.get(path)!;
        if (!/^100(644|755)$/.test(file.mode)) throw new Error('src 不允许符号链接');
        hash.update(path);
        hash.update(file.bytes);
      }
    }
  }
  visit('src');
  return hash.digest('hex');
}

/** 从 Git 对象计算，既不信调用者提供的 hash，也不读取可能已修改的工作树。 */
export function calculateSourceHash(root: string, commit: string, run = runCommand) {
  return hashSourceFiles(gitFiles(root, commit, run));
}

function simulationDependencies(files: Map<string, GitFile>) {
  const dependencies = new Set<string>();
  function visit(path: string) {
    if (dependencies.has(path)) return;
    const file = files.get(path);
    if (!file || !/^100(644|755)$/.test(file.mode))
      throw new Error(`模拟依赖缺失或类型不支持：${path}`);
    dependencies.add(path);
    // src 已整体比较；脚本的相对导入继续追踪，新增 helper 同样受版本核验。
    if (path.startsWith('src/')) return;
    for (const match of file.bytes
      .toString('utf8')
      .matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)['"](\.[^'"]+)['"]/g)) {
      const dependency = posix.normalize(posix.join(posix.dirname(path), match[1]));
      if (!dependency.startsWith('src/') && !dependency.startsWith('scripts/'))
        throw new Error('模拟依赖超出 src/scripts');
      visit(dependency);
    }
  }
  BALANCE_SIMULATION_FILES.forEach(visit);
  return dependencies;
}

function reportIdentity(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('报告必须是 JSON 对象');
  const report = raw as {
    commit?: unknown;
    currentHash?: unknown;
    full?: unknown;
    current?: unknown;
  };
  if (typeof report.commit !== 'string' || !commitPattern.test(report.commit))
    throw new Error('报告 commit 必须是完整的 40 位十六进制 SHA');
  if (typeof report.currentHash !== 'string' || !/^[a-f0-9]{64}$/i.test(report.currentHash))
    throw new Error('报告 currentHash 必须是 SHA-256');
  if (report.full !== true || !Array.isArray(report.current))
    throw new Error('只接受 full 为 true 且 current 为数组的原生 balance-gate 报告');
  return { commit: report.commit.toLowerCase(), currentHash: report.currentHash.toLowerCase() };
}

export function verifyReportSource(
  raw: unknown,
  {
    root,
    masterCommit,
    run = runCommand,
  }: { root: string; masterCommit: string; run?: CommandRunner },
) {
  const identity = reportIdentity(raw);
  if (!commitPattern.test(masterCommit)) throw new Error('master 提交无效');
  try {
    run('git', ['merge-base', '--is-ancestor', identity.commit, masterCommit], { cwd: root });
  } catch {
    throw new Error('报告源提交不是本仓库 master 的祖先；请先同步 master 及其历史');
  }
  const original = gitFiles(root, identity.commit, run);
  const current = gitFiles(root, masterCommit, run);
  const expectedHash = hashSourceFiles(original);
  if (expectedHash !== identity.currentHash)
    throw new Error('报告 currentHash 与原提交 src 不匹配');
  if (hashSourceFiles(current) !== expectedHash)
    throw new Error('报告源码与当前 master src 不一致');
  const dependencies = new Set([
    ...simulationDependencies(original),
    ...simulationDependencies(current),
    ...[...original.keys(), ...current.keys()].filter((path) => path.startsWith('src/')),
  ]);
  for (const path of dependencies) {
    const before = original.get(path);
    const after = current.get(path);
    if (!before || !after || before.mode !== after.mode || !before.bytes.equals(after.bytes))
      throw new Error(`报告与当前 master 的模拟依赖不一致：${path}`);
  }
  return { commit: identity.commit, currentHash: expectedHash };
}

export function readBalanceInput(path: string, limits = UPLOAD_LIMITS) {
  const size = statSync(path);
  if (!size.isFile() || size.size > limits.expanded) throw new Error('输入文件无效或超过解压上限');
  if (path.endsWith('.gz') && size.size > limits.compressed)
    throw new Error('输入 gzip 超过传输上限');
  let bytes = readFileSync(path);
  const compressed = bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (compressed || path.endsWith('.gz')) {
    if (bytes.length > limits.compressed) throw new Error('输入 gzip 超过传输上限');
    try {
      bytes = gunzipSync(bytes, { maxOutputLength: limits.expanded });
    } catch {
      throw new Error('gzip 损坏或超过解压上限');
    }
  }
  let json: string;
  try {
    json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('输入不是有效 UTF-8');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('输入不是有效 JSON');
  }
  reportIdentity(raw);
  const gzip = gzipSync(bytes);
  if (gzip.length > limits.compressed) throw new Error('压缩后的报告超过传输上限');
  return { raw, gzip, inputSha256: sha256(gzip), expandedBytes: bytes.length };
}

export interface ImportContext {
  commit: string;
  currentHash: string;
  importedAt: string;
  inputSha256: string;
}

export interface UploadOptions {
  root?: string;
  run?: CommandRunner;
  prepareReport?: (raw: unknown, context: ImportContext) => unknown | Promise<unknown>;
  now?: () => Date;
  log?: (message: string) => void;
}

export async function uploadBalanceReport(args: string[], options: UploadOptions = {}) {
  let dryRun = false;
  let input: string | undefined;
  for (const arg of args) {
    if (arg === '--dry-run' && !dryRun) dryRun = true;
    else if (!arg.startsWith('--') && !input) input = arg;
    else throw new Error('用法：npm run balance:upload -- <balance-gate.json 或 .gz> [--dry-run]');
  }
  if (!input)
    throw new Error('用法：npm run balance:upload -- <balance-gate.json 或 .gz> [--dry-run]');
  const root = options.root ?? repository;
  const run = options.run ?? runCommand;
  const log = options.log ?? console.log;
  const now = (options.now ?? (() => new Date()))();
  const data = readBalanceInput(resolve(root, input));
  const git = (args: string[]) => run('git', args, { cwd: root }).toString('utf8').trim();
  const gh = (args: string[]) => {
    try {
      return run('gh', args, { cwd: root }).toString('utf8').trim();
    } catch {
      throw new Error(`gh ${args[0]} 执行失败（请检查仓库授权及网络）`);
    }
  };
  const ghJson = (args: string[]): Record<string, unknown> => {
    const response = gh(args);
    try {
      const value = JSON.parse(response);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
      return value;
    } catch {
      throw new Error('GitHub 返回无效 JSON 对象');
    }
  };
  let repo: string;
  let masterCommit: string;
  if (dryRun) {
    const remote = git(['remote', 'get-url', 'origin']);
    const match =
      /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/.exec(
        remote,
      );
    if (!match) throw new Error('无法从 origin 确认 GitHub owner/name');
    repo = match[1];
    try {
      masterCommit = git(['rev-parse', '--verify', 'refs/remotes/origin/master^{commit}']);
    } catch {
      masterCommit = git(['rev-parse', '--verify', 'refs/heads/master^{commit}']);
    }
  } else {
    repo = gh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']);
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('gh 返回的仓库 owner/name 无效');
    masterCommit = gh(['api', `repos/${repo}/git/ref/heads/master`, '--jq', '.object.sha']);
  }
  const identity = verifyReportSource(data.raw, { root, masterCommit, run });
  const prepare =
    options.prepareReport ?? (await import('./balance-import-validation.ts')).prepareImportedReport;
  await prepare(data.raw, {
    ...identity,
    importedAt: now.toISOString(),
    inputSha256: data.inputSha256,
  });
  const preview = {
    repository: repo,
    masterCommit,
    sourceCommit: identity.commit,
    currentHash: identity.currentHash,
    assetName,
    compressedBytes: data.gzip.length,
    expandedBytes: data.expandedBytes,
    sha256: data.inputSha256,
    workflow,
    ref: 'master',
  };
  if (dryRun) {
    log(`dry-run 校验完成（master 使用本地引用；正式上传会重查远端）：${JSON.stringify(preview)}`);
    return { ...preview, dryRun: true };
  }

  const temporary = mkdtempSync(join(tmpdir(), 'qinglan-balance-upload-'));
  const tag = `balance-local-input-${now.getTime()}-${randomBytes(8).toString('hex')}`;
  const runsUrl = `https://github.com/${repo}/actions/workflows/${workflow}`;
  let releaseId: string | undefined;
  let dispatchAttempted = false;
  const request = (name: string, payload: unknown) => {
    const path = join(temporary, name);
    writeFileSync(path, JSON.stringify(payload), { mode: 0o600 });
    return path;
  };
  const id = (value: unknown) => {
    if (!Number.isSafeInteger(value) || (value as number) < 1)
      throw new Error('GitHub 返回无效编号');
    return String(value);
  };
  try {
    const release = ghJson([
      'api',
      `repos/${repo}/releases`,
      '--method',
      'POST',
      '--input',
      request('release.json', {
        tag_name: tag,
        target_commitish: masterCommit,
        name: tag,
        body: '本地完整平衡报告临时传输；导入工作流保留报告 artifact 后清理。',
        draft: true,
        prerelease: false,
      }),
    ]);
    if (release.draft !== true || release.tag_name !== tag)
      throw new Error('创建的 release 不是预期 draft');
    releaseId = id(release.id);
    const assetPath = join(temporary, assetName);
    writeFileSync(assetPath, data.gzip, { mode: 0o600 });
    const asset = ghJson([
      'api',
      `https://uploads.github.com/repos/${repo}/releases/${releaseId}/assets?name=${assetName}`,
      '--method',
      'POST',
      '--header',
      'Content-Type: application/gzip',
      '--input',
      assetPath,
    ]);
    const assetId = id(asset.id);
    if (asset.name !== assetName || asset.size !== data.gzip.length || asset.state !== 'uploaded')
      throw new Error('上传 asset 不完整或名称无效');
    const dispatchRequest = request('dispatch.json', {
      ref: 'master',
      inputs: { release_id: releaseId, asset_id: assetId, sha256: data.inputSha256 },
    });
    // 请求报错或超时也可能已启动接收任务；尝试派发后不能再删除其输入。
    dispatchAttempted = true;
    gh([
      'api',
      `repos/${repo}/actions/workflows/${workflow}/dispatches`,
      '--method',
      'POST',
      '--input',
      dispatchRequest,
    ]);
    log(`已暂存到 draft release #${releaseId}，asset #${assetId}；导入完成后由工作流清理。`);
    log(
      `查看运行：${runsUrl}（gh run list --repo ${repo} --workflow ${workflow} --branch master）`,
    );
    return { ...preview, dryRun: false, releaseId, assetId, runsUrl };
  } catch (error) {
    let cleanup = '';
    if (releaseId && dispatchAttempted) {
      cleanup = `；派发请求可能已被 GitHub 接收，已保留本次临时草稿 draft #${releaseId}。请查看 Actions：${runsUrl} 和临时草稿：https://github.com/${repo}/releases`;
    } else if (releaseId) {
      try {
        const release = ghJson(['api', `repos/${repo}/releases/${releaseId}`]);
        if (String(release.id) !== releaseId || release.draft !== true || release.tag_name !== tag)
          throw new Error('release 身份或 draft 状态已改变');
        gh(['api', `repos/${repo}/releases/${releaseId}`, '--method', 'DELETE']);
        cleanup = `；已清理本次 draft #${releaseId}`;
      } catch {
        cleanup = `；本次 draft #${releaseId} 未能安全清理，请检查仓库 Releases`;
      }
    }
    throw new Error(`${error instanceof Error ? error.message : '上传或派发失败'}${cleanup}`);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  uploadBalanceReport(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : '本地报告上传失败');
    process.exitCode = 1;
  });
}
