import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AUTOPLAY_BUILDS } from '../src/autoplay-build.ts';
import { ROOT_STARTERS } from '../src/data.ts';
import { caseKey } from '../scripts/balance-policy.ts';
import { simulateCampaign, type CampaignSample } from '../scripts/balance-simulation.ts';
import { ciCases } from '../scripts/balance-ci.ts';
import {
  autoplayCases,
  autoplayBuild,
  checkAutoplayResults,
  summarizeAutoplay,
  writeAutoplayReport,
} from '../scripts/autoplay-balance.ts';
import {
  AUTOPLAY_REPORT_MODES,
  autoplayInterval,
  validAutoplayReport,
  type AutoplayReport,
} from '../src/autoplay-report.ts';
import { autoplayMonitorHTML } from '../src/monitor-autoplay.ts';
import {
  checkDailyAutoplayReport,
  eligibleAutoplayRun,
} from '../scripts/restore-autoplay-report.ts';

function report(): AutoplayReport {
  return {
    schemaVersion: 1,
    state: 'complete',
    generatedAt: '2026-10-15T04:00:00Z',
    commit: 'a'.repeat(40),
    sourceHash: 'b'.repeat(64),
    runId: 123,
    dirty: false,
    elapsedSeconds: 102,
    planned: 200,
    returned: 200,
    error: null,
    rows: AUTOPLAY_REPORT_MODES.map((m) => ({
      mode: m.id,
      samples: 40,
      won: 17,
      improved: 0,
      regressed: 0,
      stageClears: [40, 38, 34, 29, 24, 17],
    })),
  };
}
test('独立模式测试固定40配对开局，不扩充现有840矩阵', () => {
  const cases = autoplayCases();
  assert.equal(cases.length, 40);
  assert.equal(new Set(cases.map(caseKey)).size, 40);
  for (const starter of Object.values(ROOT_STARTERS).flat())
    assert.equal(cases.filter((c) => c.starter === starter).length, 4);
  assert.ok(
    cases.every(
      (c) =>
        c.root === 'dual' &&
        c.path === 'dual' &&
        c.device === 'phone' &&
        c.profile === 'bare' &&
        c.difficulty === 0,
    ),
  );
  assert.deepEqual(
    AUTOPLAY_REPORT_MODES,
    AUTOPLAY_BUILDS.map(({ id, name }) => ({ id, name })),
  );
  assert.deepEqual(autoplayBuild('custom').targets, ['ice', 'skull']);
  assert.equal(ciCases().length, 840);
});
test('真实六关默认路径完全不变；漏关、重复、提前全胜及停止原因错误均失败', () => {
  const c = autoplayCases()[0];
  const sample = simulateCampaign(c, 6);
  assert.equal(sample.cleared, 6);
  assert.deepEqual(simulateCampaign(c, 6, autoplayBuild('default')), sample);
  const groups = () =>
    AUTOPLAY_BUILDS.map((m) => ({ mode: m.id, rows: [structuredClone(sample)] }));
  const correct = groups();
  checkAutoplayResults(correct, [c]);
  assert.ok(summarizeAutoplay(correct, [c]).every((r) => r.won === 1 && r.improved === 0));
  for (const change of [
    (g: ReturnType<typeof groups>) => g.pop(),
    (g: ReturnType<typeof groups>) => g[1].rows.push(sample),
    (g: ReturnType<typeof groups>) => {
      g[0].rows[0].battles.pop();
      g[0].rows[0].cleared = 5;
    },
    (g: ReturnType<typeof groups>) => {
      g[0].rows[0].stop = 'lost';
    },
    (g: ReturnType<typeof groups>) => {
      g[0].rows[0].ads.revive = 1;
    },
  ]) {
    const altered = groups();
    change(altered);
    assert.throws(() => checkAutoplayResults(altered, [c]));
  }
  assert.throws(() => simulateCampaign(c, 6, { mode: 'invalid', targets: ['', ''] } as never));
});
test('配对统计按身份而非返回顺序，正确区分多过和少过', () => {
  const cases = autoplayCases().slice(0, 2);
  const won = simulateCampaign(cases[0], 6);
  const row = (i: number, pass: boolean): CampaignSample => {
    const r = structuredClone(won);
    r.case = cases[i];
    r.key = caseKey(cases[i]);
    if (!pass) {
      r.battles.at(-1)!.state = 'lost';
      r.stop = 'lost';
      r.cleared = 5;
    }
    return r;
  };
  const groups = AUTOPLAY_BUILDS.map((m) => ({
    mode: m.id,
    rows: m.id === 'default' ? [row(0, true), row(1, false)] : [row(1, true), row(0, false)],
  }));
  const stats = summarizeAutoplay(groups, cases);
  assert.equal(stats[0].won, 1);
  assert.ok(stats.slice(1).every((r) => r.improved === 1 && r.regressed === 1 && r.won === 1));
  const interval = autoplayInterval(17, 40);
  assert.ok(Math.abs(interval[0] - 0.285) < 0.001 && Math.abs(interval[1] - 0.578) < 0.001);
  assert.equal(autoplayInterval(0, 40)[0], 0);
  assert.equal(autoplayInterval(40, 40)[1], 1);
});
test('公开摘要拒绝漏样本、伪配对、重复模式、非法数值和逐关倒流', () => {
  assert.equal(validAutoplayReport(report()), true);
  for (const mutate of [
    (r: AutoplayReport) => {
      r.returned = 199;
    },
    (r: AutoplayReport) => {
      r.rows[1].mode = 'default';
    },
    (r: AutoplayReport) => {
      r.rows[1].won = 18;
    },
    (r: AutoplayReport) => {
      r.rows[0].improved = 1;
    },
    (r: AutoplayReport) => {
      r.rows[1].stageClears[1] = 41;
    },
    (r: AutoplayReport) => {
      r.rows[2].samples = 39;
    },
    (r: AutoplayReport) => {
      r.elapsedSeconds = NaN;
    },
    (r: AutoplayReport) => {
      r.runId = -1;
    },
    (r: AutoplayReport) => {
      r.commit = '<script>';
    },
    (r: AutoplayReport) => {
      r.rows[2] = null as never;
    },
  ]) {
    const r = report();
    mutate(r);
    assert.equal(validAutoplayReport(r), false);
  }
  assert.equal(
    validAutoplayReport({
      ...report(),
      state: 'failed',
      rows: [],
      error: '模拟失败',
      returned: 80,
    }),
    true,
  );
  assert.equal(validAutoplayReport({ ...report(), state: 'failed', error: '模拟失败' }), false);
});
test('日报恢复只接受正式master完整或失败报告，校验来源并拒绝缺件/脏版本', () => {
  const repo = 'chenxuan520/qinglan-xiuxian';
  const run = {
    path: '.github/workflows/autoplay-balance.yml',
    head_branch: 'master',
    head_repository: { full_name: repo },
    status: 'completed',
    conclusion: 'failure',
    event: 'schedule',
  };
  assert.equal(eligibleAutoplayRun(run, repo), true);
  for (const change of [
    { event: 'pull_request' },
    { event: 'push' },
    { status: 'in_progress' },
    { conclusion: 'cancelled' },
    { head_branch: 'feat/test' },
    { head_repository: { full_name: 'external/repo' } },
    { path: '.github/workflows/pages.yml' },
  ])
    assert.equal(eligibleAutoplayRun({ ...run, ...change }, repo), false);
  const dir = mkdtempSync(join(tmpdir(), 'qinglan-autoplay-test-'));
  try {
    writeAutoplayReport(dir, report(), '测试');
    assert.equal(checkDailyAutoplayReport(dir, report().commit, 123).state, 'complete');
    assert.throws(() => checkDailyAutoplayReport(dir, 'c'.repeat(40), 123));
    assert.throws(() => checkDailyAutoplayReport(dir, report().commit, 124));
    writeAutoplayReport(dir, { ...report(), dirty: true }, '测试');
    assert.throws(() => checkDailyAutoplayReport(dir));
    writeAutoplayReport(dir, { ...report(), state: 'failed', rows: [], error: '模拟失败' }, '失败');
    assert.equal(checkDailyAutoplayReport(dir).state, 'failed');
    unlinkSync(join(dir, 'summary.md'));
    assert.throws(() => checkDailyAutoplayReport(dir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('监控展示中文、通过数、折叠口径、旧报告与失败提示，文本安全转义', () => {
  const html = autoplayMonitorHTML(report(), Date.parse('2026-10-15T05:00:00Z'));
  assert.match(html, /默认路线/);
  assert.match(html, /极致进攻/);
  assert.match(html, /42\.5%/);
  assert.match(html, /17 \/ 40/);
  assert.match(html, /玄冰镜＋白骨髅/);
  assert.match(html, /<details>/);
  assert.doesNotMatch(html, /<details open|超过36小时/);
  assert.match(autoplayMonitorHTML(report(), Date.parse('2026-10-18T05:00:00Z')), /超过36小时/);
  const failed = autoplayMonitorHTML({
    ...report(),
    state: 'failed',
    rows: [],
    error: '<img src=x>',
  });
  assert.match(failed, /小测试执行失败/);
  assert.match(failed, /&lt;img/);
  assert.doesNotMatch(failed, /<img|<table/);
});
test('四种Pages发布链都保留独立倾向报告，日报定时且不乘入原矩阵', () => {
  for (const file of ['pages', 'balance', 'weapon-benchmark', 'autoplay-balance']) {
    const yaml = readFileSync(`.github/workflows/${file}.yml`, 'utf8');
    assert.match(yaml, /restore-autoplay-report\.ts/);
    if (file !== 'pages') assert.match(yaml, /src\/autoplay-report\.ts/);
  }
  const yaml = readFileSync('.github/workflows/autoplay-balance.yml', 'utf8');
  assert.match(yaml, /cron: '0 4 \* \* \*'/);
  assert.match(yaml, /npm run balance:autoplay/);
  assert.doesNotMatch(yaml, /balance:gate:full|balance:ci/);
  assert.match(yaml, /state|report-id/);
});
