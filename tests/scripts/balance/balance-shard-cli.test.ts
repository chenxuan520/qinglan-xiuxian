import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { balanceCases, caseKey } from '../../../scripts/balance/balance-policy.ts';
import { summarize } from '../../../scripts/balance/balance-metrics.ts';

test('隔离CLI夹具：八片原样落盘并合并，真正执行旧验收，混合源码不能生成报告', () => {
  const repository = fileURLToPath(new URL('../../..', import.meta.url));
  const root = mkdtempSync(join(tmpdir(), 'qinglan-shard-cli-'));
  try {
    cpSync(join(repository, 'src'), join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'package.json'), '{"type":"module"}');
    const scripts = join(root, 'scripts/balance');
    mkdirSync(scripts, { recursive: true });
    for (const name of [
      'balance-gate.ts',
      'balance-worker.ts',
      'balance-shards.ts',
      'balance-policy.ts',
      'balance-metrics.ts',
    ])
      cpSync(join(repository, 'scripts/balance', name), join(scripts, name));
    // 此夹具只验证进程/参数/文件交接，缩小的是隔离副本的计划，不提供生产跳样本开关。
    const cases = balanceCases(true)
      .filter(
        (c) =>
          c.root === 'heaven' &&
          c.path === 'orthodox' &&
          c.device === 'phone' &&
          c.profile === 'bare' &&
          c.difficulty === 0,
      )
      .slice(0, 8);
    assert.equal(cases.length, 8);
    const policyPath = join(scripts, 'balance-policy.ts');
    const policy = readFileSync(policyPath, 'utf8');
    const start = policy.indexOf('export function balanceCases('),
      end = policy.indexOf('\nexport function caseKey', start);
    assert.ok(start >= 0 && end > start);
    writeFileSync(
      policyPath,
      policy.slice(0, start) +
        `export function balanceCases() { return ${JSON.stringify(cases)}; }\n` +
        policy.slice(end),
    );
    writeFileSync(
      join(scripts, 'balance-simulation.ts'),
      `
      import { caseKey } from './balance-policy.ts';
      export function simulateFarm() { throw Error('此裸开荒夹具不包含farm'); }
      export function growthShape() { return []; }
      export function simulateCampaign(c) { return {
        case:c,key:caseKey(c),complete:false,cleared:0,stop:'lost',seconds:1,adSeconds:0,cultivation:0,
        ads:{supplies:0,borrow:0,revive:0},battles:[{stage:0,attempt:1,state:'lost',seconds:1,
          entryStep:0,exitStep:0,cultivation:0,at90:null,trials:[],maxAliveBosses:0,
          firstClearCultivation:0,bosses:[]}]
      }; }
    `,
    );
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.invalid',
        'commit',
        '-qm',
        'fixture',
      ],
      { cwd: root },
    );
    const cli = [
      '--experimental-strip-types',
      join(scripts, 'balance-gate.ts'),
      '--full',
      '--acceptance',
      '--current-only',
      '--jobs=1',
    ];
    const run = (args: string[]) =>
      spawnSync(process.execPath, [...cli, ...args], {
        cwd: root,
        encoding: 'utf8',
        timeout: 20000,
      });
    const directory = join(root, 'artifacts/shards');
    for (let index = 0; index < 8; index++) {
      const result = run([
        `--shard=${index}/8`,
        `--report=${join(directory, `shard-${index}.json`)}`,
      ]);
      assert.equal(result.status, 0, result.stdout + result.stderr);
    }
    const reportPath = join(root, 'artifacts/merged.json');
    const merged = run([
      `--merge-shards=${directory}`,
      '--shard-count=8',
      `--report=${reportPath}`,
    ]);
    // 全部夹具路线都失败且不足真实门槛，保留原门禁应使CLI失败，不能只合并就假绿。
    assert.equal(merged.status, 1, merged.stdout + merged.stderr);
    assert.ok(existsSync(reportPath));
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    assert.equal(report.cases, 8);
    assert.equal(report.passed, false);
    assert.ok(report.targetFailures.length > 0);
    assert.equal(report.current.length, 8);
    assert.deepEqual(
      report.current.map((r: { key: string }) => r.key).sort(),
      cases.map(caseKey).sort(),
    );
    assert.deepEqual(report.currentMetrics, summarize(report.current, cases));
    assert.equal(report.execution.kind, 'sharded');
    assert.equal(report.execution.shards.length, 8);
    assert.ok(report.execution.shards.every((s: { jobs: number }) => s.jobs === 1));
    const shardPath = join(directory, 'shard-0.json');
    const shard = JSON.parse(readFileSync(shardPath, 'utf8'));
    shard.executionHash = '0'.repeat(64);
    writeFileSync(shardPath, JSON.stringify(shard));
    const invalidPath = join(root, 'artifacts/invalid.json');
    const invalid = run([
      `--merge-shards=${directory}`,
      '--shard-count=8',
      `--report=${invalidPath}`,
    ]);
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /版本、源码或测试计划不一致/);
    assert.equal(existsSync(invalidPath), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
