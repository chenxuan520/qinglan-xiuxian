import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import {
  BALANCE_SIMULATION_FILES,
  calculateSourceHash,
  readBalanceInput,
  runCommand,
  uploadBalanceReport,
  verifyReportSource,
} from '../../../scripts/balance/upload-balance-report.ts';
import type {
  CommandRunner,
  ImportContext,
} from '../../../scripts/balance/upload-balance-report.ts';
import { prepareImportedReport } from '../../../scripts/balance/balance-import-validation.ts';
import { makeImportedReportFixture } from '../../helpers/balance-import-fixture.ts';

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const clock = () => new Date('2026-11-05T08:00:00.000Z');

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'qinglan-upload-test-'));
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: root, stdio: 'pipe' }).toString().trim();
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  git('init');
  git('checkout', '-B', 'master');
  git('config', 'user.name', 'Upload Test');
  git('config', 'user.email', 'upload-test@example.invalid');
  git('remote', 'add', 'origin', 'git@github.com:owner/qinglan-xiuxian.git');
  write('src/z.ts', 'const z = 1;\n');
  write('src/a/x.ts', 'const x = 2;\n');
  write('src/a.ts', 'const a = 3;\n');
  write('src/中.ts', 'const 中文 = "原始字节";\n');
  for (const file of BALANCE_SIMULATION_FILES) write(file, 'export const value = 1;\n');
  write(
    'scripts/balance/balance-simulation.ts',
    "import { value } from '../simulation-helper.ts';\n",
  );
  write('scripts/simulation-helper.ts', 'export const value = 1;\n');
  const commit = () => {
    git('add', '.');
    git('commit', '-m', 'Add fixture');
    return git('rev-parse', 'HEAD');
  };
  const sourceCommit = commit();
  const raw = {
    commit: sourceCommit,
    currentHash: calculateSourceHash(root, sourceCommit),
    full: true,
    cases: 10080,
    current: [{ key: 'mock-only-sample' }],
    passed: false,
  };
  // 仅用于传输 mock；完整样本的语义验证始终由 prepareImportedReport 执行。
  const input = join(root, 'balance-gate.json');
  writeFileSync(input, JSON.stringify(raw));
  return {
    root,
    git,
    write,
    commit,
    raw,
    input,
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}

function mockGh(f: ReturnType<typeof fixture>, failure?: string) {
  const calls: { args: string[]; payload?: unknown; bytes?: Buffer }[] = [];
  let release: { id: number; draft: boolean; tag_name: string };
  let masterCommit = f.raw.commit;
  let prepareCalls = 0;
  const contexts: ImportContext[] = [];
  const logs: string[] = [];
  const run: CommandRunner = (command, args, options) => {
    if (command === 'git') return runCommand(command, args, options);
    const call: (typeof calls)[number] = { args: [...args] };
    calls.push(call);
    if (args.includes('--input')) {
      const path = args[args.indexOf('--input') + 1];
      assert.equal(statSync(path).mode & 0o777, 0o600);
      const bytes = readFileSync(path);
      if (path.endsWith('.json')) call.payload = JSON.parse(bytes.toString());
      else call.bytes = bytes;
    }
    if (args[0] === 'repo') return Buffer.from('owner/qinglan-xiuxian');
    assert.equal(args[0], 'api');
    const endpoint = args[1];
    if (endpoint.endsWith('/git/ref/heads/master')) return Buffer.from(masterCommit);
    if (endpoint.endsWith('/releases') && args.includes('POST')) {
      if (failure === 'create') throw new Error('secret gh token must not escape');
      const payload = call.payload as { tag_name: string };
      release = { id: 321, draft: true, tag_name: payload.tag_name };
      return Buffer.from(JSON.stringify(release));
    }
    if (endpoint.startsWith('https://uploads.github.com/')) {
      if (failure === 'upload' || failure === 'cleanup' || failure === 'changed-release')
        throw new Error('secret gh token must not escape');
      if (failure === 'upload-json') return Buffer.from('secret gh token must not escape');
      return Buffer.from(
        JSON.stringify({
          id: 654,
          name: 'balance-input.json.gz',
          size: call.bytes!.length,
          state: 'uploaded',
        }),
      );
    }
    if (endpoint.endsWith('/dispatches')) {
      if (failure === 'dispatch') throw new Error('secret gh token must not escape');
      if (failure === 'dispatch-timeout')
        throw Object.assign(new Error('secret gh token: request accepted but response lost'), {
          code: 'ETIMEDOUT',
        });
      return Buffer.alloc(0);
    }
    if (endpoint.endsWith('/releases/321')) {
      if (args.includes('DELETE')) {
        if (failure === 'cleanup') throw new Error('secret gh token must not escape');
        return Buffer.alloc(0);
      }
      return Buffer.from(
        JSON.stringify(failure === 'changed-release' ? { ...release, draft: false } : release),
      );
    }
    assert.fail(`意外 gh 调用：${args.join(' ')}`);
  };
  const prepareReport = (raw: unknown, context: ImportContext) => {
    prepareCalls++;
    assert.deepEqual(raw, f.raw);
    contexts.push(context);
    if (failure === 'validation') throw new Error('完整样本校验失败');
    return { passed: false };
  };
  return {
    calls,
    contexts,
    logs,
    get prepareCalls() {
      return prepareCalls;
    },
    set master(value: string) {
      masterCommit = value;
    },
    options: {
      root: f.root,
      run,
      now: clock,
      prepareReport,
      log: (message: string) => logs.push(message),
    },
  };
}

test('源 hash 精确复现 gate 的逐目录 localeCompare、路径和文件字节算法', () => {
  const f = fixture();
  try {
    const hash = createHash('sha256');
    function visit(directory: string, prefix: string) {
      for (const item of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
        a.name.localeCompare(b.name),
      )) {
        const path = `${prefix}/${item.name}`;
        if (item.isDirectory()) visit(join(directory, item.name), path);
        else {
          hash.update(path);
          hash.update(readFileSync(join(directory, item.name)));
        }
      }
    }
    visit(join(f.root, 'src'), 'src');
    assert.equal(f.raw.currentHash, hash.digest('hex'));
    f.write('src/z.ts', '未提交源码不可信');
    assert.equal(calculateSourceHash(f.root, f.raw.commit), f.raw.currentHash);
  } finally {
    f.dispose();
  }
});

test('允许原提交之后仅文档/CI变化；src、模拟根文件或递归helper变化拒绝', () => {
  const f = fixture();
  try {
    f.write('docs/readme.md', '文档变化');
    f.write('.github/workflows/balance-import.yml', 'CI 变化');
    f.write('scripts/balance/upload-balance-report.ts', '传输工具不参与模拟');
    const docsCommit = f.commit();
    assert.deepEqual(verifyReportSource(f.raw, { root: f.root, masterCommit: docsCommit }), {
      commit: f.raw.commit,
      currentHash: f.raw.currentHash,
    });
    for (const path of ['src/z.ts', ...BALANCE_SIMULATION_FILES, 'scripts/simulation-helper.ts']) {
      const before = readFileSync(join(f.root, path), 'utf8');
      f.write(path, before + '\n// changed\n');
      const changed = f.commit();
      assert.throws(
        () => verifyReportSource(f.raw, { root: f.root, masterCommit: changed }),
        /不一致/,
      );
      f.write(path, before);
      f.commit();
    }
  } finally {
    f.dispose();
  }
});

test('dry-run 本地验证并预览：不调用gh、不建临时上传文件、不改输入或源码', async () => {
  const f = fixture();
  try {
    const mock = mockGh(f);
    const before = readFileSync(f.input);
    const status = f.git('status', '--porcelain');
    const result = await uploadBalanceReport([f.input, '--dry-run'], mock.options);
    assert.equal(result.dryRun, true);
    assert.equal(mock.calls.length, 0);
    assert.equal(mock.prepareCalls, 1);
    assert.equal(mock.contexts[0].inputSha256, result.sha256);
    assert.equal(mock.contexts[0].commit, f.raw.commit);
    assert.equal(mock.contexts[0].currentHash, f.raw.currentHash);
    assert.equal(mock.contexts[0].importedAt, clock().toISOString());
    assert.deepEqual(readFileSync(f.input), before);
    assert.equal(f.git('status', '--porcelain'), status);
    assert.match(mock.logs[0], /master 使用本地引用/);
  } finally {
    f.dispose();
  }
});

test('上传严格先创建draft，再上传gzip，最后向master派发且仅三个字符串inputs', async () => {
  const f = fixture();
  try {
    const mock = mockGh(f);
    f.write('docs/update.md', '后续文档变化');
    mock.master = f.commit();
    const result = await uploadBalanceReport([f.input], mock.options);
    assert.equal(result.dryRun, false);
    assert.equal(result.releaseId, '321');
    assert.equal(result.assetId, '654');
    assert.equal(mock.prepareCalls, 1);
    const mutations = mock.calls.filter((call) => call.args.includes('POST'));
    assert.equal(mutations.length, 3);
    assert.match(mutations[0].args[1], /\/releases$/);
    const release = mutations[0].payload as Record<string, unknown>;
    assert.match(release.tag_name as string, /^balance-local-input-\d+-[a-f0-9]{16}$/);
    assert.equal(release.name, release.tag_name);
    assert.equal(release.draft, true);
    assert.equal(release.prerelease, false);
    assert.equal(release.target_commitish, result.masterCommit);
    assert.match(
      mutations[1].args[1],
      /^https:\/\/uploads\.github\.com\/repos\/owner\/qinglan-xiuxian\/releases\/321\/assets\?name=balance-input.json.gz$/,
    );
    assert.ok(mutations[1].args.includes('Content-Type: application/gzip'));
    assert.deepEqual(gunzipSync(mutations[1].bytes!), readFileSync(f.input));
    assert.equal(sha256(mutations[1].bytes!), result.sha256);
    assert.equal(mock.contexts[0].inputSha256, result.sha256);
    assert.match(mutations[2].args[1], /\/actions\/workflows\/balance-import.yml\/dispatches$/);
    assert.deepEqual(mutations[2].payload, {
      ref: 'master',
      inputs: { release_id: '321', asset_id: '654', sha256: result.sha256 },
    });
    assert.ok(!mock.calls.some((call) => call.args.includes('DELETE')));
    assert.ok(mock.logs.some((line) => /draft release #321/.test(line)));
    assert.ok(mock.logs.some((line) => /gh run list .*--branch master/.test(line)));
    for (const call of mutations)
      assert.ok(!existsSync(call.args[call.args.indexOf('--input') + 1]));
    assert.equal(result.sourceCommit, f.raw.commit);
    assert.notEqual(result.masterCommit, f.raw.commit);
  } finally {
    f.dispose();
  }
});

test('已有gzip先解压校验再统一压缩；checksum对应实际传输gzip且参数路径不执行shell', async () => {
  const f = fixture();
  try {
    const original = readFileSync(f.input);
    const suspicious = join(f.root, 'report $(touch OWNED); `touch OWNED2` "quote".json.gz');
    writeFileSync(suspicious, gzipSync(original, { level: 1 }));
    const data = readBalanceInput(suspicious);
    assert.deepEqual(data.gzip, gzipSync(original));
    const mock = mockGh(f);
    await uploadBalanceReport([suspicious], mock.options);
    const upload = mock.calls.find((call) => call.bytes);
    assert.deepEqual(upload!.bytes, data.gzip);
    assert.equal(sha256(upload!.bytes!), data.inputSha256);
    assert.ok(mock.calls.every((call) => !call.args.includes(suspicious)));
    assert.ok(!existsSync(join(f.root, 'OWNED')));
    assert.ok(!existsSync(join(f.root, 'OWNED2')));
    assert.deepEqual(gunzipSync(readFileSync(suspicious)), original);
  } finally {
    f.dispose();
  }
});

for (const failure of [
  'upload',
  'upload-json',
  'dispatch',
  'dispatch-timeout',
  'cleanup',
  'changed-release',
  'create',
]) {
  const dispatchAttempted = failure.startsWith('dispatch');
  test(`${failure}失败${dispatchAttempted ? '保留草稿并提示查看Actions' : '只清理本次仍为draft的release'}，错误不泄漏gh内容`, async () => {
    const f = fixture();
    try {
      const mock = mockGh(f, failure);
      await assert.rejects(uploadBalanceReport([f.input], mock.options), (error: Error) => {
        assert.ok(!error.message.includes('secret gh token'));
        if (failure === 'upload' || failure === 'upload-json')
          assert.match(error.message, /已清理本次 draft #321/);
        if (dispatchAttempted) {
          assert.match(error.message, /可能已被 GitHub 接收，已保留本次临时草稿 draft #321/);
          assert.match(
            error.message,
            /Actions：https:\/\/github.com\/owner\/qinglan-xiuxian\/actions\/workflows\/balance-import.yml/,
          );
          assert.match(
            error.message,
            /临时草稿：https:\/\/github.com\/owner\/qinglan-xiuxian\/releases/,
          );
        }
        if (failure === 'cleanup' || failure === 'changed-release')
          assert.match(error.message, /未能安全清理/);
        return true;
      });
      const deletes = mock.calls.filter((call) => call.args.includes('DELETE'));
      assert.equal(
        deletes.length,
        failure === 'create' || failure === 'changed-release' || dispatchAttempted ? 0 : 1,
      );
      if (dispatchAttempted) {
        assert.ok(mock.calls.some((call) => call.args[1]?.endsWith('/dispatches')));
        assert.ok(!mock.calls.some((call) => call.args[1]?.endsWith('/releases/321')));
      }
      for (const call of deletes)
        assert.deepEqual(call.args, [
          'api',
          'repos/owner/qinglan-xiuxian/releases/321',
          '--method',
          'DELETE',
        ]);
      assert.ok(!mock.calls.some((call) => /\/tags\//.test(call.args[1] ?? '')));
      assert.equal(mock.logs.length, 0);
      for (const call of mock.calls.filter((call) => call.args.includes('--input')))
        assert.ok(!existsSync(call.args[call.args.indexOf('--input') + 1]));
    } finally {
      f.dispose();
    }
  });
}

test('原生报告语义校验失败不创建release，失败日报不被上传器擅自放行', async () => {
  const f = fixture();
  try {
    const mock = mockGh(f, 'validation');
    await assert.rejects(uploadBalanceReport([f.input], mock.options), /完整样本校验失败/);
    assert.equal(mock.prepareCalls, 1);
    assert.ok(!mock.calls.some((call) => call.args.includes('POST')));
  } finally {
    f.dispose();
  }
});

test('默认入口实际调用约定的纯校验模块，错误protocol与缺失完整样本不能创建release', async () => {
  const f = fixture();
  try {
    const mock = mockGh(f);
    const { prepareReport: _mockValidator, ...options } = mock.options;
    await assert.rejects(uploadBalanceReport([f.input], options), /本地完整报告校验失败/);
    assert.equal(mock.prepareCalls, 0);
    assert.ok(!mock.calls.some((call) => call.args.includes('POST')));
  } finally {
    f.dispose();
  }
});

test('空current加完整10080条显式错误交给prepare生成红报告，缺错误或全空仍由prepare拒绝', async () => {
  const f = fixture();
  try {
    const report = {
      ...makeImportedReportFixture(),
      commit: f.raw.commit,
      currentHash: f.raw.currentHash,
      passed: false,
    };
    report.simulationErrors = report.current.map(({ case: c, key }) => ({
      case: c,
      key,
      error: '合成技术异常，仅供本地结构测试',
    }));
    report.current = [];
    writeFileSync(f.input, JSON.stringify(report));
    const mock = mockGh(f);
    let validationCalls = 0;
    const options = {
      ...mock.options,
      prepareReport: (raw: unknown, context: ImportContext) => {
        validationCalls++;
        const imported = prepareImportedReport(raw, context);
        assert.equal(imported.passed, false);
        assert.equal(imported.current?.length, 0);
        assert.equal(imported.simulationErrors?.length, 10080);
        return imported;
      },
    };
    const result = await uploadBalanceReport([f.input, '--dry-run'], options);
    assert.equal(result.dryRun, true);
    assert.equal(validationCalls, 1);
    assert.equal(mock.calls.length, 0);

    for (const simulationErrors of [report.simulationErrors.slice(0, -1), []]) {
      writeFileSync(f.input, JSON.stringify({ ...report, simulationErrors }));
      await assert.rejects(uploadBalanceReport([f.input], options), /未完整覆盖 10080/);
    }
    assert.equal(validationCalls, 3);
    assert.ok(!mock.calls.some((call) => call.args.includes('POST')));
  } finally {
    f.dispose();
  }
});

test('JSON和gzip中的损坏UTF-8在任何gh命令或prepare前拒绝，不静默替换字节', async () => {
  const f = fixture();
  try {
    const broken = Buffer.concat([
      Buffer.from(JSON.stringify(f.raw).slice(0, -1) + ',"note":"'),
      Buffer.from([0xc3, 0x28]),
      Buffer.from('"}'),
    ]);
    assert.doesNotThrow(() => JSON.parse(broken.toString('utf8')));
    for (const [name, bytes] of [
      ['broken.json', broken],
      ['broken.json.gz', gzipSync(broken)],
    ] as const) {
      const input = join(f.root, name);
      writeFileSync(input, bytes);
      const mock = mockGh(f);
      await assert.rejects(uploadBalanceReport([input], mock.options), /输入不是有效 UTF-8/);
      assert.equal(mock.prepareCalls, 0);
      assert.equal(mock.calls.length, 0);
    }
  } finally {
    f.dispose();
  }
});

test('空报告、坏JSON/gzip、短commit、伪hash、快检报告均不上传', async () => {
  const f = fixture();
  try {
    for (const input of [
      'null',
      '{',
      '{}',
      JSON.stringify({ ...f.raw, current: null }),
      JSON.stringify({ ...f.raw, commit: '726acaa' }),
      JSON.stringify({ ...f.raw, commit: '--upload-pack=evil' }),
      JSON.stringify({ ...f.raw, currentHash: 'f'.repeat(64) }),
      JSON.stringify({ ...f.raw, full: false }),
    ]) {
      writeFileSync(f.input, input);
      const mock = mockGh(f);
      await assert.rejects(uploadBalanceReport([f.input], mock.options));
      assert.equal(mock.prepareCalls, 0);
      assert.ok(!mock.calls.some((call) => call.args.includes('POST')));
    }
    const gzip = join(f.root, 'bad.gz');
    writeFileSync(gzip, Buffer.from([0x1f, 0x8b, 0, 1, 2]));
    assert.throws(() => readBalanceInput(gzip), /gzip 损坏/);
  } finally {
    f.dispose();
  }
});

test('未合入master的源提交或master模拟依赖改变均不上传', async () => {
  const f = fixture();
  try {
    f.git('checkout', '-b', 'other');
    f.write('docs/branch.md', '另一分支');
    const other = f.commit();
    f.git('checkout', 'master');
    writeFileSync(f.input, JSON.stringify({ ...f.raw, commit: other }));
    const first = mockGh(f);
    await assert.rejects(uploadBalanceReport([f.input], first.options), /不是本仓库 master 的祖先/);
    assert.ok(!first.calls.some((call) => call.args.includes('POST')));
    writeFileSync(f.input, JSON.stringify(f.raw));
    f.write('scripts/simulation-helper.ts', 'export const value = 2;\n');
    const second = mockGh(f);
    second.master = f.commit();
    await assert.rejects(uploadBalanceReport([f.input], second.options), /模拟依赖不一致/);
    assert.ok(!second.calls.some((call) => call.args.includes('POST')));
  } finally {
    f.dispose();
  }
});

test('传输上限按压缩/解压体积分别计算，maxOutputLength阻止高膨胀gzip', () => {
  const f = fixture();
  try {
    writeFileSync(f.input, JSON.stringify({ ...f.raw, padding: 'x'.repeat(20000) }));
    const limits = { compressed: 2048, expanded: 30000 };
    const data = readBalanceInput(f.input, limits);
    assert.ok(data.expandedBytes > limits.compressed);
    assert.ok(data.gzip.length < limits.compressed);
    assert.throws(() => readBalanceInput(f.input, { ...limits, expanded: 1000 }), /解压上限/);
    const compressed = join(f.root, 'large.json.gz');
    writeFileSync(compressed, data.gzip);
    assert.throws(
      () => readBalanceInput(compressed, { compressed: 2048, expanded: 1000 }),
      /gzip 损坏或超过解压上限/,
    );
    assert.throws(
      () => readBalanceInput(compressed, { ...limits, compressed: 10 }),
      /gzip 超过传输上限/,
    );
    assert.throws(
      () => readBalanceInput(f.input, { ...limits, compressed: 10 }),
      /压缩后的报告超过传输上限/,
    );
  } finally {
    f.dispose();
  }
});

test('未知、重复或额外参数在任何命令执行前拒绝', async () => {
  for (const args of [[], ['--bad'], ['a.json', 'b.json'], ['a.json', '--dry-run', '--dry-run']]) {
    let called = false;
    await assert.rejects(
      uploadBalanceReport(args, {
        run: () => {
          called = true;
          throw new Error();
        },
      }),
      /用法/,
    );
    assert.equal(called, false);
  }
});
