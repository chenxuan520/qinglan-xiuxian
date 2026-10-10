import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { balanceChangedFiles, detectBalanceChanges } from '../scripts/balance-change-trigger.ts';
import { checkReportDiagnostics } from '../scripts/check-balance-report.ts';
import { eligibleBalanceReportRun } from '../scripts/ci-artifacts.ts';
import { renderReport } from '../scripts/balance-report.ts';

test('纯界面/文档不触发全量，经验与实际判定文件触发', () => {
  assert.deepEqual(balanceChangedFiles(['src/style.css', 'src/guide.ts', 'docs/gameplay.md']), []);
  assert.deepEqual(
    balanceChangedFiles([
      'src/data.ts',
      'src/progress.ts',
      'src/ads.ts',
      'scripts/balance-metrics.ts',
      'src/data.ts',
    ]),
    ['scripts/balance-metrics.ts', 'src/ads.ts', 'src/data.ts', 'src/progress.ts'],
  );
  for (const event of ['schedule', 'workflow_dispatch'])
    assert.equal(detectBalanceChanges(event, {}).full, false);
  for (const event of [
    {},
    { before: '0'.repeat(40), after: '1'.repeat(40) },
    { before: 'bad', after: '1'.repeat(40) },
    { before: '1'.repeat(40), after: '2'.repeat(40) },
  ])
    assert.equal(detectBalanceChanges('push', event).full, true);
});

function temporaryRepository() {
  const cwd = mkdtempSync(join(tmpdir(), 'qinglan-ci-changes-'));
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-b', 'master');
  git('config', 'user.name', 'CI verification');
  git('config', 'user.email', 'ci@example.invalid');
  mkdirSync(join(cwd, 'src'));
  writeFileSync(join(cwd, 'src/data.ts'), '经验=1');
  writeFileSync(join(cwd, 'src/guide.ts'), '玩法说明');
  const commit = () => {
    git('add', '.');
    git('commit', '-m', 'Add test fixture');
    return git('rev-parse', 'HEAD');
  };
  const base = commit();
  return { cwd, git, commit, base };
}

test('真实 git push 检测多次提交、数值新增及移走原路径，CLI 输出触发标志', () => {
  const r = temporaryRepository();
  try {
    writeFileSync(join(r.cwd, 'src/guide.ts'), '更新说明');
    const ui = r.commit();
    assert.equal(detectBalanceChanges('push', { before: r.base, after: ui }, r.cwd).full, false);
    writeFileSync(join(r.cwd, 'src/data.ts'), '经验=2');
    const numeric = r.commit();
    assert.deepEqual(
      detectBalanceChanges('push', { before: r.base, after: numeric }, r.cwd).files,
      ['src/data.ts'],
    );
    renameSync(join(r.cwd, 'src/data.ts'), join(r.cwd, 'src/other.ts'));
    const moved = r.commit();
    assert.deepEqual(detectBalanceChanges('push', { before: numeric, after: moved }, r.cwd).files, [
      'src/data.ts',
    ]);
    writeFileSync(join(r.cwd, 'src/progress.ts'), '境界=1');
    const added = r.commit();
    assert.deepEqual(detectBalanceChanges('push', { before: moved, after: added }, r.cwd).files, [
      'src/progress.ts',
    ]);
    const event = join(r.cwd, 'event.json'),
      output = join(r.cwd, 'output');
    writeFileSync(event, JSON.stringify({ before: moved, after: added }));
    execFileSync(
      process.execPath,
      ['--experimental-strip-types', join(process.cwd(), 'scripts/balance-change-trigger.ts')],
      {
        cwd: r.cwd,
        env: {
          ...process.env,
          GITHUB_EVENT_NAME: 'push',
          GITHUB_EVENT_PATH: event,
          GITHUB_OUTPUT: output,
          GITHUB_STEP_SUMMARY: '',
        },
        stdio: 'pipe',
      },
    );
    assert.equal(readFileSync(output, 'utf8'), 'full=true\n');
  } finally {
    rmSync(r.cwd, { recursive: true, force: true });
  }
});

test('PR 按共同祖先识别自己的改动，不因主分支后来变更数值而误触发', () => {
  const r = temporaryRepository();
  try {
    r.git('checkout', '-b', 'feature');
    writeFileSync(join(r.cwd, 'src/guide.ts'), 'PR 说明');
    const head = r.commit();
    r.git('checkout', 'master');
    writeFileSync(join(r.cwd, 'src/data.ts'), '主分支经验=2');
    const base = r.commit();
    assert.equal(
      detectBalanceChanges(
        'pull_request',
        { pull_request: { base: { sha: base }, head: { sha: head } } },
        r.cwd,
      ).full,
      false,
    );
    r.git('checkout', 'feature');
    writeFileSync(join(r.cwd, 'src/data.ts'), 'PR 经验=3');
    const numeric = r.commit();
    assert.deepEqual(
      detectBalanceChanges(
        'pull_request',
        { pull_request: { base: { sha: base }, head: { sha: numeric } } },
        r.cwd,
      ).files,
      ['src/data.ts'],
    );
  } finally {
    rmSync(r.cwd, { recursive: true, force: true });
  }
});

const diagnostic = (passed: boolean, severities: string[]) => ({
  schemaVersion: 1,
  scope: 'whole-run',
  passed,
  counts: {
    error: severities.filter((s) => s === 'error').length,
    warning: severities.filter((s) => s === 'warning').length,
  },
  items: severities.map((severity) => ({ severity })),
});

test('Warning 不失败，Error/未通过/协议损坏和虚报计数均失败', () => {
  assert.deepEqual(checkReportDiagnostics(diagnostic(true, ['warning'])), { error: 0, warning: 1 });
  for (const raw of [
    null,
    {},
    diagnostic(false, []),
    diagnostic(true, ['error']),
    diagnostic(true, ['unknown']),
    { ...diagnostic(true, []), schemaVersion: 2 },
    { ...diagnostic(true, []), scope: 'filtered' },
    { ...diagnostic(true, ['error']), counts: { error: 0, warning: 0 } },
    { ...diagnostic(true, []), counts: { error: -1, warning: 0 } },
  ])
    assert.throws(() => checkReportDiagnostics(raw));
});

test('CLI 对 Error 返回失败但保留已生成日报与 JSON；缺文件或坏 JSON 也不能绿灯', () => {
  const root = mkdtempSync(join(tmpdir(), 'qinglan-ci-report-error-'));
  const run = (file: string) =>
    spawnSync(
      process.execPath,
      ['--experimental-strip-types', 'scripts/check-balance-report.ts', file],
      { encoding: 'utf8' },
    );
  try {
    const input = join(root, 'input.json');
    writeFileSync(
      input,
      JSON.stringify({ passed: false, current: [], targetFailures: ['天灵根通关率不达标'] }),
    );
    renderReport(input, root);
    const json = join(root, 'diagnostics.json');
    const failed = run(json);
    assert.equal(failed.status, 1);
    assert.ok(failed.stderr.includes('::error::'));
    assert.ok(readFileSync(join(root, 'index.html'), 'utf8').includes('未通过'));
    assert.ok(readFileSync(join(root, 'results.json'), 'utf8').includes('天灵根通关率不达标'));
    assert.equal(run(join(root, 'missing.json')).status, 1);
    writeFileSync(json, '{bad json');
    assert.equal(run(json).status, 1);
    writeFileSync(json, JSON.stringify(diagnostic(true, ['warning'])));
    assert.equal(run(json).status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('后续游戏发布接受可信 master push 全量报告，失败结果不会被当作无效来源', () => {
  const repo = 'chenxuan520/qinglan-xiuxian';
  const run = {
    path: '.github/workflows/balance.yml',
    head_branch: 'master',
    head_repository: { full_name: repo },
    status: 'completed',
    event: 'push',
    conclusion: 'failure',
  };
  assert.equal(eligibleBalanceReportRun(run, repo), true);
  for (const event of ['schedule', 'workflow_dispatch'])
    assert.equal(eligibleBalanceReportRun({ ...run, event }, repo), true);
  for (const patch of [
    { event: 'pull_request' },
    { head_branch: 'feature' },
    { head_repository: { full_name: 'fork/other' } },
    { path: '.github/workflows/evil.yml' },
    { status: 'in_progress' },
  ])
    assert.equal(eligibleBalanceReportRun({ ...run, ...patch }, repo), false);
});

test('正式恢复脚本选中新失败 push 日报，跳过外仓并保留失败展示', () => {
  const root = mkdtempSync(join(tmpdir(), 'qinglan-ci-restore-push-'));
  try {
    const executable = join(root, 'gh');
    writeFileSync(
      executable,
      `#!${process.execPath}
const fs=require('node:fs'),path=require('node:path'),args=process.argv.slice(2);
const repo=process.env.GITHUB_REPOSITORY;
const artifacts=[{id:33,created_at:'2026-10-10T14:00:00Z'},{id:22,created_at:'2026-10-10T13:00:00Z'},{id:11,created_at:'2026-10-10T12:00:00Z'}].map(a=>({...a,expired:false,workflow_run:{id:a.id,head_branch:'master'}}));
if(args[0]==='api'){
 if(args[1].includes('/actions/artifacts?'))process.stdout.write(JSON.stringify([{artifacts}]));
 else{const id=Number(args[1].split('/').pop());process.stdout.write(JSON.stringify({id,path:'.github/workflows/balance.yml',head_branch:'master',head_repository:{full_name:id===33?'fork/evil':repo},event:id===11?'schedule':'push',status:'completed',conclusion:id===22?'failure':'success',head_sha:String(id).slice(0,1).repeat(40)}));}
}else if(args[0]==='run'&&args[1]==='download'){
 fs.appendFileSync(path.join(__dirname,'downloads'),args[2]+'\\n');
 const out=args[args.indexOf('--dir')+1];fs.mkdirSync(out,{recursive:true});
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({commit:args[2].slice(0,1).repeat(40),passed:false,current:[],targetFailures:['前六关目标未通过']}));
}else process.exit(1);
`,
    );
    chmodSync(executable, 0o755);
    execFileSync(
      process.execPath,
      ['--experimental-strip-types', join(process.cwd(), 'scripts/restore-balance-report.ts')],
      {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${root}:${process.env.PATH}`,
          GITHUB_REPOSITORY: 'chenxuan520/qinglan-xiuxian',
        },
        stdio: 'pipe',
      },
    );
    assert.equal(readFileSync(join(root, 'downloads'), 'utf8'), '22\n');
    const result = JSON.parse(readFileSync(join(root, 'dist/balance-report/results.json'), 'utf8'));
    assert.equal(result.commit, '2'.repeat(40));
    assert.equal(result.passed, false);
    assert.ok(
      readFileSync(join(root, 'dist/balance-report/index.html'), 'utf8').includes('未通过'),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
