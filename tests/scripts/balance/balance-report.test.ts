import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  renderReport,
  reportHtml,
  refreshReport,
} from '../../../scripts/balance/balance-report.ts';
import { balanceCases, caseKey } from '../../../scripts/balance/balance-policy.ts';
import type { CampaignSample } from '../../../scripts/balance/balance-simulation.ts';
test('本地来源与导入时间独立展示，刷新保留真实测试版本、时间及来源JSON', () => {
  const root = mkdtempSync(join(tmpdir(), 'qinglan-report-local-origin-'));
  const origin = {
    kind: 'local-import' as const,
    importedAt: '2026-11-05T16:00:00Z',
    inputSha256: 'b'.repeat(64),
    sourceVerified: true as const,
    workflowRunId: '12345',
  };
  const report = {
    commit: 'a'.repeat(40),
    generatedAt: '2026-11-04T16:00:00Z',
    elapsedSeconds: 3600,
    current: [],
    passed: false,
    origin,
  };
  try {
    const input = join(root, 'input.json');
    writeFileSync(input, JSON.stringify(report));
    renderReport(input, root);
    refreshReport(root);
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    assert.match(html, /数据来源：本地导入 · 源码已校验/);
    assert.match(html, /生成时间（北京时间）：2026-11-05 00:00:00/);
    assert.match(html, /导入时间（北京时间）：2026-11-06 00:00:00/);
    const result = JSON.parse(readFileSync(join(root, 'results.json'), 'utf8'));
    const diagnostics = JSON.parse(readFileSync(join(root, 'diagnostics.json'), 'utf8'));
    assert.deepEqual(result.origin, origin);
    assert.deepEqual(diagnostics.origin, origin);
    assert.equal(result.commit, report.commit);
    assert.equal(result.generatedAt, report.generatedAt);
    assert.equal(result.elapsedSeconds, report.elapsedSeconds);
    assert.doesNotMatch(reportHtml({ current: [] }), /数据来源：本地导入/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('报告生成时间固定北京时间，跨日与零点正确，原始时间戳保持不变', () => {
  for (const [generatedAt, expected] of [
    ['2026-11-02T22:36:46.031Z', '2026-11-03 06:36:46'],
    ['2026-11-02T16:00:00Z', '2026-11-03 00:00:00'],
    ['2026-11-03T06:36:46+08:00', '2026-11-03 06:36:46'],
    ['invalid', '未知'],
    [undefined, '未知'],
  ]) {
    const report = { generatedAt };
    assert.ok(reportHtml(report).includes(`生成时间（北京时间）：${expected}<br>`));
    assert.equal(report.generatedAt, generatedAt);
  }
});
test('日报计划分母固定10080，失败/缺失不能显示通过，动态错误按文本转义', () => {
  const html = reportHtml({
    commit: 'abc',
    generatedAt: '2026-10-10',
    current: [],
    passed: false,
    error: '<img onerror="alert(1)" src=x>',
  });
  assert.ok(html.includes('返回 0/10080'));
  assert.ok(html.includes('未通过'));
  assert.ok(html.includes('&lt;img onerror=&quot;'));
  assert.ok(!html.includes('<img onerror='));
  assert.ok(html.includes('0/120'));
  assert.ok(html.includes('第七关只展示实测'));
  assert.ok(html.includes('<button id="refresh-report" type="button">刷新报告</button>'));
  assert.ok(html.includes('未击杀观测中位'));
  assert.ok(html.includes('value="maxed"'));
  for (const [id, label] of [
    ['dual', '双灵根'],
    ['triple', '三灵根'],
    ['quad', '四灵根'],
    ['five', '五灵根'],
  ])
    assert.ok(html.includes(`<option value="${id}">${label}</option>`));
});
test('报告生成只允许临时或忽略目录；模拟无文件也生成如实失败日报', () => {
  const root = mkdtempSync(join(tmpdir(), 'qinglan-report-test-'));
  try {
    assert.throws(() => renderReport(join(root, 'missing.json'), 'docs/balance-report'), /只允许/);
    renderReport(join(root, 'missing.json'), root);
    const raw = JSON.parse(readFileSync(join(root, 'results.json'), 'utf8'));
    assert.equal(raw.passed, false);
    assert.ok(raw.error.includes('未生成'));
    assert.ok(readFileSync(join(root, 'index.html'), 'utf8').includes('未通过'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('通过标记不能覆盖缺样本，页面、摘要与原始数据均判为失败', () => {
  const root = mkdtempSync(join(tmpdir(), 'qinglan-report-incomplete-'));
  try {
    const input = join(root, 'input.json');
    writeFileSync(input, JSON.stringify({ passed: true, current: [] }));
    assert.ok(reportHtml({ passed: true, current: [] }).includes('未通过'));
    renderReport(input, root);
    assert.equal(JSON.parse(readFileSync(join(root, 'results.json'), 'utf8')).passed, false);
    assert.ok(readFileSync(join(root, 'summary.md'), 'utf8').includes('未通过'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('凑满10080条未知或重复样本也不能误报通过', () => {
  const root = mkdtempSync(join(tmpdir(), 'qinglan-report-invalid-coverage-'));
  try {
    const input = join(root, 'input.json');
    const c = balanceCases(true)[0];
    const duplicate: CampaignSample = {
      case: c,
      key: caseKey(c),
      complete: false,
      cleared: 0,
      stop: 'lost',
      ads: { supplies: 0, borrow: 0, revive: 0 },
      seconds: 1,
      adSeconds: 0,
      cultivation: 0,
      battles: [
        {
          stage: 0,
          attempt: 1,
          state: 'lost',
          seconds: 1,
          entryStep: 0,
          exitStep: 0,
          cultivation: 0,
          at90: null,
          trials: [],
          maxAliveBosses: 0,
          firstClearCultivation: 0,
          bosses: [],
        },
      ],
    };
    for (const row of [{ key: 'unknown' }, duplicate]) {
      const report = {
        passed: true,
        current: Array.from({ length: 10080 }, () => row) as CampaignSample[],
      };
      assert.ok(reportHtml(report).includes('未通过'));
      writeFileSync(input, JSON.stringify(report));
      renderReport(input, root);
      const result = JSON.parse(readFileSync(join(root, 'results.json'), 'utf8'));
      assert.equal(result.passed, false);
      assert.ok(result.error.includes('校验未通过'));
      assert.ok(readFileSync(join(root, 'summary.md'), 'utf8').includes('未通过'));
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('损坏JSON和无效样本仍生成失败日报，CLI保留原文件供排查', () => {
  const root = mkdtempSync(join(tmpdir(), 'qinglan-report-bad-input-'));
  try {
    const input = join(root, 'input.json');
    for (const text of ['{"passed":true', 'null', '{"passed":true,"current":[null]}']) {
      writeFileSync(input, text);
      execFileSync(
        process.execPath,
        ['--experimental-strip-types', 'scripts/balance/balance-report.ts', input, root],
        { stdio: 'pipe' },
      );
      assert.equal(readFileSync(input, 'utf8'), text);
      const report = JSON.parse(readFileSync(join(root, 'results.json'), 'utf8'));
      assert.equal(report.passed, false);
      assert.ok(report.error);
      assert.ok(readFileSync(join(root, 'index.html'), 'utf8').includes('未通过'));
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
