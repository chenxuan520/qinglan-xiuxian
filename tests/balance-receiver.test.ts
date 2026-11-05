import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { cleanupImportedInput, receiveImportedReport } from '../scripts/import-balance-report.ts';
import { calculateSourceHash, runCommand } from '../scripts/upload-balance-report.ts';
import type { CommandRunner } from '../scripts/upload-balance-report.ts';
import { makeImportedReportFixture } from './helpers/balance-import-fixture.ts';

const root = resolve('.');
const commit = runCommand('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim();
const sourceHash = calculateSourceHash(root, commit);
function transportFixture(raw: unknown = {}) {
  const bytes = gzipSync(Buffer.from(JSON.stringify(raw)));
  const input = {
    repository: 'owner/qinglan-xiuxian',
    releaseId: '123',
    assetId: '456',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    actorId: '42',
  };
  const release = {
    id: 123,
    author: { id: 42 },
    draft: true,
    tag_name: 'balance-local-input-1793894400000-0123456789abcdef',
    assets: [
      {
        id: 456,
        name: 'balance-input.json.gz',
        content_type: 'application/gzip',
        state: 'uploaded',
        size: bytes.length,
      },
    ],
  };
  const calls: string[][] = [];
  const run: CommandRunner = (command, args, options) => {
    if (command === 'git') {
      if (args[0] === 'fetch') return Buffer.alloc(0);
      return runCommand(command, args, options);
    }
    calls.push([...args]);
    if (args.includes('DELETE')) return Buffer.alloc(0);
    if (args[1].endsWith('/releases/123')) return Buffer.from(JSON.stringify(release));
    if (args[1].endsWith('/releases/assets/456')) return bytes;
    if (args[1].endsWith('/git/ref/heads/master')) return Buffer.from(commit);
    throw new Error(`unexpected mock gh endpoint ${args[1]}`);
  };
  return { input, bytes, release, calls, run };
}

test('接收器拒绝越权传输、身份变更和摘要不符，不改写原报告、不删除输入', () => {
  const output = mkdtempSync(join(tmpdir(), 'qinglan-import-rejected-'));
  writeFileSync(join(output, 'index.html'), 'previous report');
  try {
    const variants = [
      (f: ReturnType<typeof transportFixture>) => {
        f.input.repository = 'bad/repo/path';
      },
      (f: ReturnType<typeof transportFixture>) => {
        f.input.releaseId = '../123';
      },
      (f: ReturnType<typeof transportFixture>) => {
        f.release.draft = false;
      },
      (f: ReturnType<typeof transportFixture>) => {
        f.release.author.id = 43;
      },
      (f: ReturnType<typeof transportFixture>) => {
        f.release.tag_name = 'ordinary-release';
      },
      (f: ReturnType<typeof transportFixture>) => {
        f.release.assets[0].id = 999;
      },
      (f: ReturnType<typeof transportFixture>) => {
        f.release.assets[0].size++;
      },
      (f: ReturnType<typeof transportFixture>) => {
        f.input.sha256 = 'a'.repeat(64);
      },
    ];
    for (const mutate of variants) {
      const f = transportFixture();
      mutate(f);
      assert.throws(() => receiveImportedReport(f.input, { root, run: f.run, output }));
      assert.equal(readFileSync(join(output, 'index.html'), 'utf8'), 'previous report');
      assert.equal(
        f.calls.some((args) => args.includes('DELETE')),
        false,
      );
    }
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

test('源码相符但缺少完整样本的输入不能生成或覆盖日报', () => {
  const output = mkdtempSync(join(tmpdir(), 'qinglan-import-incomplete-'));
  writeFileSync(join(output, 'index.html'), 'previous report');
  try {
    const f = transportFixture({ commit, currentHash: sourceHash, full: true, current: [{}] });
    assert.throws(() => receiveImportedReport(f.input, { root, run: f.run, output }), /protocol/);
    assert.equal(readFileSync(join(output, 'index.html'), 'utf8'), 'previous report');
    assert.equal(
      f.calls.some((args) => args.includes('DELETE')),
      false,
    );
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

test('完整合成结构经真实校验和渲染，保留来源/原始时间，失败仍生成红色；清理独立执行', () => {
  const output = mkdtempSync(join(tmpdir(), 'qinglan-import-received-'));
  try {
    const raw = { ...makeImportedReportFixture(), commit, currentHash: sourceHash };
    raw.passed = false;
    raw.failures = ['合成失败记录（不是全量实测）'];
    const f = transportFixture(raw);
    const received = receiveImportedReport(f.input, {
      root,
      output,
      run: f.run,
      now: () => new Date('2026-11-05T13:30:00Z'),
      runId: '789',
      inputOutput: join(output, 'input-copy'),
    });
    assert.equal(received.passed, false);
    assert.deepEqual(readFileSync(join(output, 'input-copy/balance-input.json.gz')), f.bytes);
    const report = JSON.parse(readFileSync(join(output, 'results.json'), 'utf8'));
    assert.equal(report.current.length, 10080);
    assert.equal(report.generatedAt, raw.generatedAt);
    assert.equal(report.elapsedSeconds, raw.elapsedSeconds);
    assert.deepEqual(report.current, raw.current);
    assert.deepEqual(report.farms, raw.farms);
    assert.deepEqual(report.origin, {
      kind: 'local-import',
      importedAt: '2026-11-05T13:30:00.000Z',
      inputSha256: f.input.sha256,
      sourceVerified: true,
      workflowRunId: '789',
    });
    assert.match(readFileSync(join(output, 'index.html'), 'utf8'), /本地导入 · 源码已校验/);
    const diagnostics = JSON.parse(readFileSync(join(output, 'diagnostics.json'), 'utf8'));
    assert.ok(diagnostics.counts.error > 0);
    assert.equal(
      f.calls.some((args) => args.includes('DELETE')),
      false,
    );
    cleanupImportedInput(f.input, { root, run: f.run });
    assert.equal(f.calls.filter((args) => args.includes('DELETE')).length, 1);
    f.release.draft = false;
    assert.throws(() => cleanupImportedInput(f.input, { root, run: f.run }));
    assert.equal(f.calls.filter((args) => args.includes('DELETE')).length, 1);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});
