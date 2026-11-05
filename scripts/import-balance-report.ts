import { createHash } from 'node:crypto';
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareImportedReport } from './balance-import-validation.ts';
import { renderReport } from './balance-report.ts';
import {
  readBalanceInput,
  runCommand,
  UPLOAD_LIMITS,
  verifyReportSource,
} from './upload-balance-report.ts';
import type { CommandRunner } from './upload-balance-report.ts';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export interface ImportInput {
  repository: string;
  releaseId: string;
  assetId: string;
  sha256: string;
  actorId?: string;
}
interface ReceiverOptions {
  root?: string;
  run?: CommandRunner;
  now?: () => Date;
  runId?: string;
  output?: string;
  inputOutput?: string;
}
function validateInput(input: ImportInput) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(input.repository)) throw new Error('仓库名称无效');
  if (![input.releaseId, input.assetId].every((id) => /^[1-9]\d{0,15}$/.test(id)))
    throw new Error('Release 或 asset 编号无效');
  if (!/^[a-f0-9]{64}$/.test(input.sha256)) throw new Error('输入 SHA-256 无效');
  if (input.actorId !== undefined && !/^[1-9]\d{0,15}$/.test(input.actorId))
    throw new Error('上传者身份无效');
}
function transport(input: ImportInput, root: string, run: CommandRunner) {
  validateInput(input);
  const api = (path: string) =>
    JSON.parse(run('gh', ['api', path], { cwd: root }).toString('utf8'));
  const base = `repos/${input.repository}/releases/${input.releaseId}`;
  const release = api(base);
  if (
    String(release.id) !== input.releaseId ||
    release.draft !== true ||
    (input.actorId !== undefined && String(release.author?.id) !== input.actorId) ||
    !/^balance-local-input-\d+-[a-f0-9]{16}$/.test(release.tag_name) ||
    !Array.isArray(release.assets) ||
    release.assets.length !== 1
  )
    throw new Error('只接受本工具创建、仅含一个输入附件的临时草稿');
  const asset = release.assets[0];
  if (
    String(asset.id) !== input.assetId ||
    asset.name !== 'balance-input.json.gz' ||
    asset.state !== 'uploaded' ||
    asset.content_type !== 'application/gzip' ||
    !Number.isSafeInteger(asset.size) ||
    asset.size < 1 ||
    asset.size > UPLOAD_LIMITS.compressed
  )
    throw new Error('临时输入附件身份、类型或大小无效');
  return { release, asset, base };
}

/** 输入只作为数据处理；校验完成前不生成可发布产物。 */
export function receiveImportedReport(input: ImportInput, options: ReceiverOptions = {}) {
  const root = options.root ?? repository;
  const run = options.run ?? runCommand;
  const { asset } = transport(input, root, run);
  const bytes = run(
    'gh',
    [
      'api',
      `repos/${input.repository}/releases/assets/${input.assetId}`,
      '--header',
      'Accept: application/octet-stream',
    ],
    { cwd: root },
  );
  if (
    bytes.length !== asset.size ||
    bytes.length > UPLOAD_LIMITS.compressed ||
    createHash('sha256').update(bytes).digest('hex') !== input.sha256
  )
    throw new Error('附件字节数或 SHA-256 不匹配');
  const temporary = mkdtempSync(join(tmpdir(), 'qinglan-balance-import-'));
  try {
    const source = join(temporary, 'balance-input.json.gz');
    writeFileSync(source, bytes, { mode: 0o600 });
    const { raw } = readBalanceInput(source);
    const masterCommit = run(
      'gh',
      ['api', `repos/${input.repository}/git/ref/heads/master`, '--jq', '.object.sha'],
      { cwd: root },
    )
      .toString('utf8')
      .trim();
    // 接收工作流拉取完整历史；master 若在排队期间前进，仍以接收时版本核验。
    run('git', ['fetch', 'origin', 'master'], { cwd: root });
    const identity = verifyReportSource(raw, { root, masterCommit, run });
    const report = prepareImportedReport(raw, {
      ...identity,
      importedAt: (options.now ?? (() => new Date()))().toISOString(),
      inputSha256: input.sha256,
      runId: options.runId,
    });
    const normalized = join(temporary, 'validated.json');
    writeFileSync(normalized, JSON.stringify(report));
    const output = options.output ?? join(root, 'artifacts/balance-daily-report');
    renderReport(normalized, output);
    const rendered = JSON.parse(readFileSync(join(output, 'results.json'), 'utf8'));
    if (!rendered.origin || rendered.origin.inputSha256 !== input.sha256)
      throw new Error('生成报告未保留导入来源');
    // 原始压缩字节独立保留供核对输入摘要，不混入公开站点或规范化结果。
    const inputOutput = options.inputOutput ?? join(root, 'artifacts/balance-local-input');
    mkdirSync(inputOutput, { recursive: true });
    writeFileSync(join(inputOutput, 'balance-input.json.gz'), bytes, { mode: 0o600 });
    return { output, passed: rendered.passed === true };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

// 仅在报告 artifact 已保存后调用；身份变化或附件变化时保留草稿供人工检查。
export function cleanupImportedInput(input: ImportInput, options: ReceiverOptions = {}) {
  const root = options.root ?? repository;
  const run = options.run ?? runCommand;
  const { base } = transport(input, root, run);
  run('gh', ['api', base, '--method', 'DELETE'], { cwd: root });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const input = {
    repository: process.env.GITHUB_REPOSITORY ?? '',
    releaseId: process.env.IMPORT_RELEASE_ID ?? '',
    assetId: process.env.IMPORT_ASSET_ID ?? '',
    sha256: process.env.IMPORT_SHA256 ?? '',
    actorId: process.env.GITHUB_ACTOR_ID,
  };
  if (!input.actorId) throw new Error('接收器需要 GitHub Actions 上传者身份');
  if (process.argv[2] === '--cleanup') cleanupImportedInput(input);
  else {
    const result = receiveImportedReport(input, { runId: process.env.GITHUB_RUN_ID });
    if (process.env.GITHUB_OUTPUT)
      appendFileSync(process.env.GITHUB_OUTPUT, `passed=${result.passed}\n`);
    console.log(`本地完整结果已校验并生成报告：${result.output}`);
  }
}
